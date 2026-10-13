"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Guest } from "./social";
import { Player, TttGame, cleanTtt, markOf, newGame, play } from "./ttt";
import { Scores } from "./useScores";
import { Social } from "./useSocial";

export interface Invite {
  game: string;
  from: Player;
}

export interface Ttt {
  game: TttGame | null;
  /** the opponent is no longer in the café */
  away: boolean;
  invites: Invite[];
  waiting: { game: string; to: Guest } | null;
  declined: string | null;
  self: string;
  invite: (g: Guest) => void;
  accept: (i: Invite) => void;
  decline: (i: Invite) => void;
  move: (cell: number) => void;
  close: () => void;
}

const gameId = () => crypto.randomUUID().slice(0, 12);

/** Noughts and crosses between two people in the café: invite, accept, moves — all over the social channel. */
export function useTicTacToe(social: Social, scores: Scores, guests: Guest[]): Ttt {
  const { bus, self, name } = social;
  const [game, setGame] = useState<TttGame | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [waiting, setWaiting] = useState<{ game: string; to: Guest } | null>(null);
  const [declined, setDeclined] = useState<string | null>(null);
  const recorded = useRef(new Set<string>());

  const onMsg = useEffectEvent((p: unknown) => {
    const m = cleanTtt(p);
    if (!m) return;
    if (m.t === "invite") {
      if (m.to !== self || m.from.id === self) return;
      setInvites((list) => (list.some((i) => i.game === m.game) ? list : [...list, { game: m.game, from: m.from }].slice(-3)));
    } else if (m.t === "decline") {
      if (m.to !== self || waiting?.game !== m.game) return;
      setDeclined(waiting.to.name);
      setWaiting(null);
    } else if (m.t === "accept") {
      if (waiting?.game !== m.game || m.x.id !== self) return;
      setWaiting(null);
      setGame(newGame(m.game, m.x, m.o));
    } else if (m.t === "move") {
      setGame((g) => (g && g.id === m.game ? (play(g, m.cell, m.by) ?? g) : g));
    } else {
      setGame((g) => (g && g.id === m.game && markOf(g, m.by) ? { ...g, gone: true } : g));
      setInvites((list) => list.filter((i) => i.game !== m.game));
    }
  });
  useEffect(() => bus.on("ttt", (p, mine) => !mine && onMsg(p)), [bus]);

  const settle = useEffectEvent((g: TttGame) => {
    if (recorded.current.has(g.id)) return;
    recorded.current.add(g.id);
    scores.record(name, "ttt", g.winner === markOf(g, self));
  });
  useEffect(() => {
    if (game?.winner) settle(game);
  }, [game]);

  const other = game ? (game.x.id === self ? game.o : game.x) : null;
  const away = !!(game && other && !game.winner && !guests.some((g) => g.id === other.id));

  const invite = (g: Guest) => {
    const id = gameId();
    setDeclined(null);
    setWaiting({ game: id, to: g });
    bus.send("ttt", { t: "invite", game: id, from: { id: self, name }, to: g.id });
  };
  const accept = (i: Invite) => {
    const o = { id: self, name };
    setInvites((list) => list.filter((x) => x.game !== i.game));
    setGame(newGame(i.game, i.from, o));
    bus.send("ttt", { t: "accept", game: i.game, x: i.from, o });
  };
  const decline = (i: Invite) => {
    setInvites((list) => list.filter((x) => x.game !== i.game));
    bus.send("ttt", { t: "decline", game: i.game, to: i.from.id });
  };
  const move = (cell: number) => {
    if (!game) return;
    const next = play(game, cell, self);
    if (!next) return;
    setGame(next);
    bus.send("ttt", { t: "move", game: game.id, cell, by: self });
  };
  const close = () => {
    const open = game && !game.winner ? game.id : waiting?.game;
    if (open) bus.send("ttt", { t: "leave", game: open, by: self });
    setGame(null);
    setWaiting(null);
  };

  return { game, away, invites, waiting, declined, self, invite, accept, decline, move, close };
}
