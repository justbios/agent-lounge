"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { type NetKind, cleanNet } from "@/lib/arena/net";
import type { Command, Fighter } from "@/lib/arena/types";
import { type Match, seatOf } from "./duel";
import type { Duels } from "./useDuels";
import type { Scores } from "./useScores";
import type { Social } from "./useSocial";

const RESEND_MS = 3000;
/** how many times one state of the game goes out again while the other side has not shown it has it */
const RESENDS = 20;

interface Game {
  id: string;
  mine: Fighter[] | null;
  theirs: Fighter[] | null;
  /** every person's command so far, both sides', in order */
  moves: Command[];
  /** the other side has this side's squad, and this many of the commands */
  heardSquad: boolean;
  heard: number;
}

export interface ArenaNet {
  /** an agents' battle with another person, while there is one */
  match: (Match & { kind: NetKind }) | null;
  /** this side's squad once it has joined, the other side's once it has come */
  mine: Fighter[] | null;
  theirs: Fighter[] | null;
  moves: Command[];
  /** brings this side's squad to the match; the first one given stays */
  join: (squad: Fighter[]) => void;
  /** one of this side's commands */
  play: (cmd: Command) => void;
  /** the battle was played to the end on this screen */
  end: (win: boolean) => void;
}

const isNet = (m: Match | null): m is Match & { kind: NetKind } => m?.kind === "arena" || m?.kind === "raid";

const sameCmd = (a: Command, b: Command): boolean =>
  a.t === b.t &&
  ("to" in a ? a.to : null) === ("to" in b ? b.to : null) &&
  ("target" in a ? a.target : null) === ("target" in b ? b.target : null) &&
  ("at" in a ? (a.at ?? null) : null) === ("at" in b ? (b.at ?? null) : null) &&
  ("from" in a ? (a.from ?? null) : null) === ("from" in b ? (b.from ?? null) : null);

/**
 * The agents' battle between two people on top of a duel. Each side sends its squad and every command so far, and
 * again while the other has not shown it has them, so a message lost on the way stalls nothing. The battle itself is
 * replayed from those on each screen.
 */
export function useArenaNet(duels: Duels, social: Social, scores: Scores): ArenaNet {
  const { bus, self, name } = social;
  const match = isNet(duels.match) ? duels.match : null;
  const [state, setState] = useState<Game | null>(null);
  // the same game in a ref, for a message and a command in the same moment to each see the other
  const game = useRef<Game | null>(null);
  const sent = useRef({ at: "", n: 0 });
  const recorded = useRef(new Set<string>());
  const cur = (): Game | null => {
    if (!match) return null;
    if (game.current?.id === match.id) return game.current;
    return { id: match.id, mine: null, theirs: null, moves: [], heardSquad: false, heard: 0 };
  };
  const set = (g: Game) => {
    game.current = g;
    setState(g);
  };

  const send = (g: Game) => {
    if (!g.mine) return;
    bus.send("arena", { game: g.id, by: self, squad: g.mine, has: !!g.theirs, moves: g.moves });
  };

  const onMsg = useEffectEvent((p: unknown) => {
    const m = cleanNet(p);
    const g = cur();
    if (!m || !match || !g || m.game !== match.id || m.by === self || seatOf(match, m.by) < 0 || match.gone) return;
    let next: Game = { ...g, heardSquad: g.heardSquad || m.has, heard: Math.max(g.heard, m.moves.length) };
    if (!g.theirs) next = { ...next, theirs: m.squad };
    if (m.moves.length > g.moves.length && g.moves.every((c, i) => sameCmd(c, m.moves[i]))) next = { ...next, moves: m.moves };
    set(next);
    // they have yet to see this side's squad: it goes out now, not at the next resend
    if (!m.has && next.mine) send(next);
  });
  useEffect(() => bus.on("arena", (p, mine) => !mine && onMsg(p)), [bus]);

  const resend = useEffectEvent(() => {
    const g = cur();
    if (!match || !g?.mine || match.gone) return;
    const at = `${g.moves.length}:${!!g.theirs}`;
    if (sent.current.at !== at) sent.current = { at, n: 0 };
    const owed = !g.theirs || !g.heardSquad || g.heard < g.moves.length;
    if (!owed || sent.current.n >= RESENDS) return;
    sent.current.n += 1;
    send(g);
  });
  const live = !!match && !match.gone;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(resend, RESEND_MS);
    return () => clearInterval(t);
  }, [live]);

  const join = (squad: Fighter[]) => {
    const g = cur();
    if (!g || g.mine || !squad.length) return;
    const next = { ...g, mine: squad };
    set(next);
    send(next);
  };

  const play = (cmd: Command) => {
    const g = cur();
    if (!g || !match || match.gone) return;
    const next = { ...g, moves: [...g.moves, cmd] };
    set(next);
    send(next);
  };

  const end = (win: boolean) => {
    if (!match || recorded.current.has(match.id)) return;
    recorded.current.add(match.id);
    scores.record(name, match.kind, win);
    duels.finish(match.id);
  };

  const g = match && state?.id === match.id ? state : null;
  return { match, mine: g?.mine ?? null, theirs: g?.theirs ?? null, moves: g?.moves ?? [], join, play, end };
}
