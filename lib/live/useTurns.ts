"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import type { BusEvent } from "./bus";
import { Clock, GRACE_MS, cleanTimes, heard, left, moved, newClock, times } from "./clock";
import { Match, Side, sideOf } from "./duel";
import { Duels } from "./useDuels";
import { Game, Scores } from "./useScores";
import { Social } from "./useSocial";

const RESEND_MS = 4000;
const RESENDS = 15;
const RESENDS_OVER = 3;
/** how often a running clock is looked at for time up */
const WATCH_MS = 200;

export interface TurnBoard<M> {
  id: string;
  turn: Side;
  winner: Side | "draw" | null;
  moves: M[];
}

/** What a board game played turn by turn brings: its board, its moves, and how they travel. */
export interface TurnRules<B extends TurnBoard<M>, M> {
  kind: Game & Match["kind"];
  event: BusEvent;
  start: (id: string) => B;
  clean: (p: unknown) => { game: string; by: string; moves: M[] } | null;
  catchUp: (b: B, moves: M[]) => B | null;
  play: (m: Match, b: B, mv: M, by: string) => B | null;
  /** the board once `out` has run out of time: the other side has won */
  timeUp: (b: B, out: Side) => B;
}

export interface Turns<B, M> {
  match: Match | null;
  board: B | null;
  /** the game's clock, when it is played on one */
  clock: Clock | null;
  move: (mv: M) => void;
}

/**
 * A board game for two on top of a duel. Every move goes out with the whole game before it, and again while the other
 * side has not answered, so a message lost on the way stalls nothing. On a clock each message also carries what every
 * move cost, and a side whose time ran out: this side's own screen says so at zero, the other's a little later in case
 * this side has gone quiet.
 */
export function useTurns<B extends TurnBoard<M>, M>(
  rules: TurnRules<B, M>,
  duels: Duels,
  social: Social,
  scores: Scores,
): Turns<B, M> {
  const { bus, self, name } = social;
  const match = duels.match?.kind === rules.kind ? duels.match : null;
  const [saved, setSaved] = useState<{ board: B; clock: Clock | null } | null>(null);
  const recorded = useRef(new Set<string>());
  const sent = useRef({ at: "", n: 0 });
  const game = match
    ? saved?.board.id === match.id
      ? saved
      : { board: rules.start(match.id), clock: newClock(match.clock) }
    : null;
  const raw = game?.board ?? null;
  const out = game?.clock?.out ?? null;
  const board = useMemo(() => (raw && out && !raw.winner ? rules.timeUp(raw, out) : raw), [rules, raw, out]);

  const send = (b: B, clock: Clock | null) =>
    bus.send(rules.event, { game: b.id, by: self, moves: b.moves, ...times(clock) });

  const onMsg = useEffectEvent((p: unknown) => {
    const m = rules.clean(p);
    if (!m || !match || !game || m.game !== match.id || !sideOf(match, m.by) || match.gone) return;
    const { spent, out } = cleanTimes(p);
    const next = rules.catchUp(game.board, m.moves);
    let clock = game.clock;
    if (next && clock) clock = heard(clock, game.board.moves.length, next.moves.length, spent, performance.now());
    if (out && clock && !clock.out && !(next ?? game.board).winner) clock = { ...clock, out };
    if (next || clock !== game.clock) setSaved({ board: next ?? game.board, clock });
  });
  useEffect(() => bus.on(rules.event, (p, mine) => !mine && onMsg(p)), [bus, rules]);

  const resend = useEffectEvent(() => {
    if (!match || !game || match.gone || !game.board.moves.length) return;
    const at = `${game.board.moves.length}:${game.clock?.out ?? ""}`;
    if (sent.current.at !== at) sent.current = { at, n: 0 };
    const over = !!game.board.winner || !!game.clock?.out;
    const waiting = game.board.turn !== sideOf(match, self);
    if (over ? sent.current.n >= RESENDS_OVER : !waiting || sent.current.n >= RESENDS) return;
    sent.current.n += 1;
    send(game.board, game.clock);
  });
  useEffect(() => {
    if (!match) return;
    const t = setInterval(resend, RESEND_MS);
    return () => clearInterval(t);
  }, [match]);

  /** Calls time on the side to move when its clock is done; true when it did. */
  const flag = (): boolean => {
    if (!match || !game?.clock || game.clock.out || game.board.winner || match.gone || match.over) return false;
    const mine = sideOf(match, self);
    const turn = game.board.turn;
    const ms = left(game.clock, turn, turn, false, performance.now());
    if (!mine || (turn === mine ? ms > 0 : ms > -GRACE_MS)) return false;
    const clock = { ...game.clock, out: turn };
    setSaved({ board: game.board, clock });
    send(game.board, clock);
    return true;
  };
  const watch = useEffectEvent(flag);
  const timed = !!game?.clock;
  useEffect(() => {
    if (!match || !timed) return;
    const t = setInterval(watch, WATCH_MS);
    return () => clearInterval(t);
  }, [match, timed]);

  const settle = useEffectEvent((m: Match, b: B) => {
    if (recorded.current.has(b.id)) return;
    recorded.current.add(b.id);
    scores.record(name, rules.kind, b.winner === sideOf(m, self));
    duels.finish(m.id);
  });
  useEffect(() => {
    if (match && board?.winner) settle(match, board);
  }, [match, board]);

  const move = (mv: M) => {
    if (!match || !game || game.clock?.out || flag()) return;
    const next = rules.play(match, game.board, mv, self);
    if (!next) return;
    const clock = game.clock && moved(game.clock, performance.now());
    setSaved({ board: next, clock });
    send(next, clock);
  };

  return { match, board, clock: game?.clock ?? null, move };
}
