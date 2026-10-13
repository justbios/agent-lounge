"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { DuelKind, Match, Player, cleanDuel, sideOf } from "./duel";
import { Guest } from "./social";
import { Social } from "./useSocial";

export interface Invite {
  kind: DuelKind;
  game: string;
  from: Player;
}

export interface Duels {
  match: Match | null;
  /** the opponent is no longer in the café */
  away: boolean;
  invites: Invite[];
  waiting: { kind: DuelKind; game: string; to: Guest } | null;
  declined: string | null;
  self: string;
  name: string;
  invite: (kind: DuelKind, g: Guest) => void;
  accept: (i: Invite) => void;
  decline: (i: Invite) => void;
  finish: (game: string) => void;
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

  const onMsg = useEffectEvent((p: unknown) => {
    const m = cleanDuel(p);
    if (!m) return;
    if (m.t === "invite") {
      if (m.to !== self || m.from.id === self) return;
      setInvites((list) =>
        list.some((i) => i.game === m.game) ? list : [...list, { kind: m.kind, game: m.game, from: m.from }].slice(-3),
      );
    } else if (m.t === "decline") {
      if (m.to !== self || waiting?.game !== m.game) return;
      setDeclined(waiting.to.name);
      setWaiting(null);
    } else if (m.t === "accept") {
      if (waiting?.game !== m.game || m.x.id !== self) return;
      setWaiting(null);
      setMatch({ kind: m.kind, id: m.game, x: m.x, o: m.o, gone: false, over: false });
    } else {
      setMatch((g) => (g && g.id === m.game && !g.over && sideOf(g, m.by) ? { ...g, gone: true } : g));
      setInvites((list) => list.filter((i) => i.game !== m.game));
    }
  });
  useEffect(() => bus.on("duel", (p, mine) => !mine && onMsg(p)), [bus]);

  const other = match ? (match.x.id === self ? match.o : match.x) : null;
  const away = !!(other && !guests.some((g) => g.id === other.id));

  const invite = (kind: DuelKind, g: Guest) => {
    const id = gameId();
    setDeclined(null);
    setWaiting({ kind, game: id, to: g });
    bus.send("duel", { t: "invite", kind, game: id, from: { id: self, name }, to: g.id });
  };
  const accept = (i: Invite) => {
    const o = { id: self, name };
    setInvites((list) => list.filter((x) => x.game !== i.game));
    setMatch({ kind: i.kind, id: i.game, x: i.from, o, gone: false, over: false });
    bus.send("duel", { t: "accept", kind: i.kind, game: i.game, x: i.from, o });
  };
  const decline = (i: Invite) => {
    setInvites((list) => list.filter((x) => x.game !== i.game));
    bus.send("duel", { t: "decline", game: i.game, to: i.from.id });
  };
  const finish = (game: string) => setMatch((g) => (g && g.id === game ? { ...g, over: true } : g));
  const close = () => {
    const open = match ? (match.over ? null : match.id) : waiting?.game;
    if (open) bus.send("duel", { t: "leave", game: open, by: self });
    setMatch(null);
    setWaiting(null);
  };

  return { match, away, invites, waiting, declined, self, name, invite, accept, decline, finish, close };
}
