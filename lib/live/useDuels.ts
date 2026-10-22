"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { DuelKind, Match, Player, TIMED, cleanDuel, playersOf, seatOf } from "./duel";
import { Guest } from "./social";
import { Social } from "./useSocial";

export interface Invite {
  kind: DuelKind;
  game: string;
  from: Player;
  /** a rematch: the game it follows */
  again?: string;
  /** seconds on each side's clock */
  clock?: number;
  /** a game for three: both invited, in seat order */
  party?: Player[];
}

export interface Duels {
  match: Match | null;
  /** another player is no longer in the café: their name */
  away: string | null;
  invites: Invite[];
  waiting: {
    kind: DuelKind;
    game: string;
    to: Guest;
    again?: string;
    clock?: number;
    /** a game for three: both invited, and the ones who already said yes */
    party?: Guest[];
    yes?: string[];
  } | null;
  declined: string | null;
  /** another player asks for another game of the one just played, while its board is still open here */
  again: Invite | null;
  self: string;
  name: string;
  /** `clock`: seconds a side, for chess and draughts; two guests make a game for three */
  invite: (kind: DuelKind, to: Guest | Guest[], clock?: number) => void;
  /** asks for another game of the same kind and clock; whoever asks moves first, as with any invite */
  rematch: () => void;
  accept: (i: Invite) => void;
  decline: (i: Invite) => void;
  finish: (game: string) => void;
  /** takes back the invite in flight, leaving the board as it is */
  cancel: () => void;
  /** leaves the match, telling the others unless it was played to the end, or cancels the invite */
  close: () => void;
}

const gameId = () => crypto.randomUUID().slice(0, 12);
const player = (g: Player): Player => ({ id: g.id, name: g.name });

/**
 * Inviting people in the café to a game for two or three, and the match that follows; the moves are each game's own.
 * A game for three starts once both invited said yes: each of them as they accept, the inviter on the second yes.
 */
export function useDuels(social: Social): Duels {
  const { bus, self, name, guests } = social;
  const [match, setMatch] = useState<Match | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [waiting, setWaiting] = useState<Duels["waiting"]>(null);
  const [declined, setDeclined] = useState<string | null>(null);

  const accept = (i: Invite) => {
    const o = { id: self, name };
    setInvites((list) => list.filter((x) => x.game !== i.game));
    setDeclined(null);
    const clock = i.clock ? { clock: i.clock } : {};
    const seats = i.party ? { o: i.party[0], z: i.party[1] } : { o };
    setMatch({ kind: i.kind, id: i.game, x: i.from, ...seats, gone: false, over: false, ...clock });
    bus.send("duel", { t: "accept", kind: i.kind, game: i.game, x: i.from, o, ...clock });
  };

  /** the game for three this side waits on is off: `who` said no or left, and the other invited hears so */
  const drop = (game: string, who: string) => {
    setDeclined(who);
    setWaiting(null);
    bus.send("duel", { t: "leave", game, by: self });
  };

  const onMsg = useEffectEvent((p: unknown) => {
    const m = cleanDuel(p);
    if (!m) return;
    if (m.t === "invite") {
      if (m.to !== self || m.from.id === self) return;
      const i: Invite = {
        kind: m.kind,
        game: m.game,
        from: m.from,
        ...(m.again ? { again: m.again } : {}),
        ...(m.clock ? { clock: m.clock } : {}),
        ...(m.party ? { party: m.party } : {}),
      };
      // both asked for a rematch at once: the one with the smaller id takes the other's, the other waits for that
      if (!i.party && i.again && waiting?.again === i.again && waiting.to.id === i.from.id) {
        if (self < i.from.id) {
          setWaiting(null);
          accept(i);
        }
        return;
      }
      setInvites((list) => (list.some((x) => x.game === i.game) ? list : [...list, i].slice(-3)));
    } else if (m.t === "decline") {
      const by = match?.id === m.game && !match.over && !match.gone && playersOf(match).find((x) => x.id === m.by);
      if (by && by.id !== self) setMatch((g) => (g && g.id === m.game ? { ...g, gone: true, left: by.name } : g));
      if (m.to !== self || waiting?.game !== m.game) return;
      const who = waiting.party?.find((x) => x.id === m.by) ?? waiting.to;
      if (waiting.party) drop(m.game, who.name);
      else {
        setDeclined(who.name);
        setWaiting(null);
      }
    } else if (m.t === "accept") {
      if (waiting?.game !== m.game || m.x.id !== self) return;
      const clock = m.clock ? { clock: m.clock } : {};
      const party = waiting.party;
      if (!party) {
        setWaiting(null);
        setMatch({ kind: m.kind, id: m.game, x: m.x, o: m.o, gone: false, over: false, ...clock });
        return;
      }
      if (!party.some((x) => x.id === m.o.id)) return;
      const yes = [...new Set([...(waiting.yes ?? []), m.o.id])];
      if (yes.length < party.length) {
        setWaiting({ ...waiting, yes });
        return;
      }
      setWaiting(null);
      const [o, z] = party.map(player);
      setMatch({ kind: m.kind, id: m.game, x: m.x, o, z, gone: false, over: false, ...clock });
    } else {
      const who = waiting?.game === m.game && waiting.party?.find((x) => x.id === m.by);
      if (who) drop(m.game, who.name);
      setMatch((g) => {
        if (!g || g.id !== m.game || g.over || g.gone || seatOf(g, m.by) < 0) return g;
        return { ...g, gone: true, left: playersOf(g)[seatOf(g, m.by)].name };
      });
      setInvites((list) => list.filter((i) => i.game !== m.game));
    }
  });
  useEffect(() => bus.on("duel", (p, mine) => !mine && onMsg(p)), [bus]);

  const others = match ? playersOf(match).filter((p) => p.id !== self) : [];
  const away = others.find((p) => !guests.some((g) => g.id === p.id))?.name ?? null;
  const ended = !!match && (match.over || match.gone);
  const again =
    (ended && invites.findLast((i) => i.again === match.id && others.some((p) => p.id === i.from.id))) || null;

  const invite = (kind: DuelKind, to: Guest | Guest[], clock?: number, after?: string) => {
    const list = Array.isArray(to) ? to : [to];
    const id = gameId();
    const extra = { ...(after ? { again: after } : {}), ...(clock && TIMED.includes(kind) ? { clock } : {}) };
    const party = list.length > 1 ? list : null;
    setDeclined(null);
    setWaiting({ kind, game: id, to: list[0], ...extra, ...(party ? { party, yes: [] } : {}) });
    for (const g of list) {
      bus.send("duel", {
        t: "invite",
        kind,
        game: id,
        from: { id: self, name },
        to: g.id,
        ...extra,
        ...(party ? { party: party.map(player) } : {}),
      });
    }
  };
  const rematch = () => {
    if (!match || !ended) return;
    // a game for three is asked again by whoever asked for it, so two asks never cross
    if (match.z && match.x.id !== self) return;
    const back = others.map((p) => guests.find((g) => g.id === p.id));
    if (back.every(Boolean)) invite(match.kind, back as Guest[], match.clock, match.id);
  };
  const decline = (i: Invite) => {
    setInvites((list) => list.filter((x) => x.game !== i.game));
    bus.send("duel", { t: "decline", game: i.game, to: i.from.id, by: self });
  };
  const finish = (game: string) => setMatch((g) => (g && g.id === game ? { ...g, over: true } : g));
  const cancel = () => {
    if (waiting) bus.send("duel", { t: "leave", game: waiting.game, by: self });
    setWaiting(null);
  };
  const close = () => {
    if (match && !match.over) bus.send("duel", { t: "leave", game: match.id, by: self });
    cancel();
    setMatch(null);
  };

  return {
    match,
    away,
    invites,
    waiting,
    declined,
    again,
    self,
    name,
    invite,
    rematch,
    accept,
    decline,
    finish,
    cancel,
    close,
  };
}
