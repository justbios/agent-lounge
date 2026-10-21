"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { DuelKind, Match, Player, TIMED, cleanDuel, sideOf } from "./duel";
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
}

export interface Duels {
  match: Match | null;
  /** the opponent is no longer in the café */
  away: boolean;
  invites: Invite[];
  waiting: { kind: DuelKind; game: string; to: Guest; again?: string; clock?: number } | null;
  declined: string | null;
  /** the opponent asks for another game of the one just played, while its board is still open here */
  again: Invite | null;
  self: string;
  name: string;
  /** `clock`: seconds a side, for chess and draughts */
  invite: (kind: DuelKind, g: Guest, clock?: number) => void;
  /** asks the opponent for another game of the same kind and clock; whoever asks moves first, as with any invite */
  rematch: () => void;
  accept: (i: Invite) => void;
  decline: (i: Invite) => void;
  finish: (game: string) => void;
  /** takes back the invite in flight, leaving the board as it is */
  cancel: () => void;
  /** leaves the match, telling the other side unless it was played to the end, or cancels the invite */
  close: () => void;
}

const gameId = () => crypto.randomUUID().slice(0, 12);

/** Inviting someone in the café to a two-player game, and the match that follows; the moves are each game's own. */
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
    setMatch({ kind: i.kind, id: i.game, x: i.from, o, gone: false, over: false, ...clock });
    bus.send("duel", { t: "accept", kind: i.kind, game: i.game, x: i.from, o, ...clock });
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
      };
      // both asked for a rematch at once: the one with the smaller id takes the other's, the other waits for that
      if (i.again && waiting?.again === i.again && waiting.to.id === i.from.id) {
        if (self < i.from.id) {
          setWaiting(null);
          accept(i);
        }
        return;
      }
      setInvites((list) => (list.some((x) => x.game === i.game) ? list : [...list, i].slice(-3)));
    } else if (m.t === "decline") {
      if (m.to !== self || waiting?.game !== m.game) return;
      setDeclined(waiting.to.name);
      setWaiting(null);
    } else if (m.t === "accept") {
      if (waiting?.game !== m.game || m.x.id !== self) return;
      setWaiting(null);
      const clock = m.clock ? { clock: m.clock } : {};
      setMatch({ kind: m.kind, id: m.game, x: m.x, o: m.o, gone: false, over: false, ...clock });
    } else {
      setMatch((g) => (g && g.id === m.game && !g.over && sideOf(g, m.by) ? { ...g, gone: true } : g));
      setInvites((list) => list.filter((i) => i.game !== m.game));
    }
  });
  useEffect(() => bus.on("duel", (p, mine) => !mine && onMsg(p)), [bus]);

  const other = match ? (match.x.id === self ? match.o : match.x) : null;
  const away = !!(other && !guests.some((g) => g.id === other.id));
  const ended = !!match && (match.over || match.gone);
  const again = (ended && invites.findLast((i) => i.again === match.id && i.from.id === other?.id)) || null;

  const invite = (kind: DuelKind, g: Guest, clock?: number, after?: string) => {
    const id = gameId();
    const extra = { ...(after ? { again: after } : {}), ...(clock && TIMED.includes(kind) ? { clock } : {}) };
    setDeclined(null);
    setWaiting({ kind, game: id, to: g, ...extra });
    bus.send("duel", { t: "invite", kind, game: id, from: { id: self, name }, to: g.id, ...extra });
  };
  const rematch = () => {
    const g = other && guests.find((x) => x.id === other.id);
    if (match && ended && g) invite(match.kind, g, match.clock, match.id);
  };
  const decline = (i: Invite) => {
    setInvites((list) => list.filter((x) => x.game !== i.game));
    bus.send("duel", { t: "decline", game: i.game, to: i.from.id });
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
