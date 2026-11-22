"use client";

import { CSSProperties, ReactNode, RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Flag, LayoutGrid } from "lucide-react";
import { useTr } from "@/lib/i18n";
import { LiveDuel, TURN_BASED, seatOf, sideOf } from "@/lib/live/duel";
import { labState } from "@/lib/live/lab";
import { useSoloTally } from "@/lib/live/soloStore";
import { matchSfx } from "@/lib/live/sounds/match";
import type { Duels as DuelsState } from "@/lib/live/useDuels";
import { FINAL_MS, OWN_STAGE } from "../beats";
import FullscreenButton from "../FullscreenButton";
import Confetti from "./Confetti";
import { Boards, howOf, winnerOf } from "./how";
import Intro from "./Intro";
import ResultCard from "./ResultCard";
import { recordSeries, seriesKey, useSeries } from "./series";
import { Face, MatchTable, Outcome, Table, sittersOf } from "./table";

/** between a board and the card beside it, px */
const GAP = 20;
/** the card beside a board is never narrower or wider than this, px */
const SIDE_MIN = 236;
const SIDE_MAX = 340;
/** a table this small has the card under it rather than over it, px */
const OVER_W = 300;
const OVER_H = 380;

/** Where the result card goes: beside a board, where there is room; over a table; or under either. */
type Spot = { mode: "under" } | { mode: "over" } | { mode: "side"; left: number; top: number; width: number; height: number };

const UNDER: Spot = { mode: "under" };

/**
 * A board's last position stays in sight, so its card stands beside it, or under it on a narrow screen. A table has
 * nothing left to study: its card lies over it, unless the table is too small to hold one.
 */
function spotOf(frame: HTMLElement | null, board: boolean): Spot {
  const game = frame?.querySelector(".duel-board")?.firstElementChild;
  if (!frame || !game) return UNDER;
  const f = frame.getBoundingClientRect();
  const g = game.getBoundingClientRect();
  if (!board) return g.width >= OVER_W && g.height >= OVER_H ? { mode: "over" } : UNDER;
  const pad = parseFloat(getComputedStyle(frame).paddingRight) || 0;
  const room = f.right - pad - g.right - GAP;
  if (room < SIDE_MIN) return UNDER;
  return {
    mode: "side",
    left: Math.round(g.right - f.left + frame.scrollLeft + GAP),
    top: Math.round(g.top - f.top + frame.scrollTop),
    width: Math.round(Math.min(SIDE_MAX, room)),
    height: Math.round(g.height),
  };
}

const same = (a: Spot, b: Spot) =>
  a.mode === b.mode &&
  (a.mode !== "side" ||
    (b.mode === "side" && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height));

/**
 * The score of the real-time game on screen, this player's first. A game against an agent says it (the same way it
 * tells the lab); one played with people over the line does not, and its card goes without.
 */
function liveScore(seat: number, win: boolean): [number, number] | null {
  const score = (labState() as { score?: unknown } | null)?.score;
  if (!Array.isArray(score) || score.length !== 2 || seat < 0 || seat > 1) return null;
  const [mine, theirs] = [score[seat], score[1 - seat]] as unknown[];
  if (typeof mine !== "number" || typeof theirs !== "number" || mine > theirs !== win) return null;
  return [mine, theirs];
}

/**
 * The frame around every match: the opening laid over the board, who sits at it, the tools under it and, once the
 * game has had its last moment, the result card. The game itself is handed in and never touched; a game that keeps
 * its own stage (`OWN_STAGE`) gets the plain frame it always had.
 */
export default function MatchFrame({
  frame,
  duels,
  boards,
  faces,
  thinking,
  note,
  again,
  sound,
  onEnd,
  onShut,
  children,
}: {
  /** the element that goes full screen: the board with everything around it */
  frame: RefObject<HTMLDivElement | null>;
  duels: DuelsState;
  boards: Boards;
  /** the café's own as the hall draws them, to find an agent's face by */
  faces: readonly Face[];
  /** an agent is looking for its move */
  thinking: boolean;
  /** why the match stopped, when it did */
  note: string | null;
  /** another game with the same people: the button, the wait, the answer */
  again: ReactNode;
  sound: ReactNode;
  /** a real-time match was played to the end */
  onEnd: (kind: LiveDuel, win: boolean) => void;
  /** closes the games altogether, where there is something around them to go back to */
  onShut?: () => void;
  /** the game, given what to call when a real-time one is over */
  children: (end: (kind: LiveDuel, win: boolean) => void) => ReactNode;
}) {
  const t = useTr();
  const m = duels.match!;
  const self = duels.self;
  const own = OWN_STAGE.includes(m.kind);
  const board = TURN_BASED.includes(m.kind);
  const tallies = useSoloTally();
  const { x, o, z } = m;
  const sitters = useMemo(() => sittersOf({ x, o, z }, self, faces), [x, o, z, self, faces]);

  // how a real-time game ended: the game says so itself, once
  const [live, setLive] = useState<{ game: string; win: boolean; score: [number, number] | null } | null>(null);
  const end = (kind: LiveDuel, win: boolean) => {
    setLive({ game: m.id, win, score: liveScore(seatOf(m, self), win) });
    onEnd(kind, win);
  };
  const winner = winnerOf(boards);
  const done = live?.game === m.id ? live : null;
  const outcome: Outcome | null = !m.over
    ? null
    : winner
      ? winner === "draw"
        ? "drawn"
        : winner === sideOf(m, self)
          ? "won"
          : "lost"
      : done
        ? done.win
          ? "won"
          : "lost"
        : null;

  const key = seriesKey(m, self);
  const series = useSeries(key);
  const counts = !m.solo?.auto;
  useEffect(() => {
    if (outcome && counts && !own) recordSeries(key, m.id, outcome);
  }, [outcome, counts, own, key, m.id]);

  // the game has FINAL_MS for its own last moment; a board opened on a game already over shows its card at once
  const [card, setCard] = useState<{ game: string; quiet: boolean; spot: Spot } | null>(null);
  const waited = useRef<string | null>(null);
  useEffect(() => {
    if (own) return;
    if (!outcome) {
      waited.current = m.id;
      return;
    }
    const quiet = waited.current !== m.id;
    const timer = window.setTimeout(
      () => {
        if (!quiet) matchSfx[outcome]();
        setCard({ game: m.id, quiet, spot: spotOf(frame.current, board) });
      },
      quiet ? 0 : FINAL_MS,
    );
    return () => clearTimeout(timer);
  }, [own, outcome, m.id, board, frame]);
  const shown = outcome && card?.game === m.id ? card : null;
  const up = !!shown;
  useEffect(() => {
    const el = frame.current;
    if (!up || !el) return;
    const ro = new ResizeObserver(() => {
      const spot = spotOf(el, board);
      setCard((c) => (c && c.game === m.id && !same(c.spot, spot) ? { ...c, spot } : c));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [up, board, m.id, frame]);

  // the card beside a board hangs outside the flow: the frame grows to hold it, so nothing under the match is covered
  const aside = useRef<HTMLDivElement>(null);
  const beside = shown?.spot.mode === "side";
  const [hold, setHold] = useState(0);
  useEffect(() => {
    const el = aside.current;
    if (!beside || !el) return;
    const ro = new ResizeObserver(() => setHold(el.offsetTop + el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [beside]);

  const table = useMemo<Table>(
    () => ({ sitters, level: m.solo?.level ?? null, thinking, outcome }),
    [sitters, m.solo?.level, thinking, outcome],
  );

  const leave = (
    <button className="btn" onClick={duels.close}>
      {m.over || note ? (
        t("закрити", "close")
      ) : (
        <>
          <Flag size={13} />
          {t("здатись і вийти", "give up and leave")}
        </>
      )}
    </button>
  );

  if (own) {
    return (
      <div className="duel" ref={frame} data-solo={m.solo?.level} data-thinking={thinking ? "" : undefined}>
        <div className="duel-board">{children(end)}</div>
        <div className="duel-tools">
          {(m.over || m.gone) && again}
          <button className="btn" onClick={duels.close}>
            {m.over || note ? t("закрити", "close") : t("здатись і вийти", "give up and leave")}
          </button>
          {sound}
          <FullscreenButton target={frame} />
        </div>
      </div>
    );
  }

  const plies =
    (boards.chess ?? boards.checkers ?? boards.four)?.moves.length ?? boards.ttt?.cells.filter(Boolean).length ?? 0;
  const spot = shown?.spot ?? UNDER;
  const result = shown && outcome && (
    <ResultCard
      game={m.id}
      outcome={outcome}
      how={howOf(boards, outcome, done?.score ?? null, t)}
      sitters={sitters}
      level={m.solo?.level ?? null}
      series={!z && series.won + series.lost + series.drawn > 0 ? series : null}
      tally={m.solo && counts ? (tallies[m.kind] ?? null) : null}
      place={spot.mode}
      quiet={shown.quiet}
    >
      <div className="duel-tools mt-acts">
        {again}
        <button className="btn" onClick={duels.close}>
          <LayoutGrid size={13} />
          {t("інша гра", "another game")}
        </button>
        {onShut && (
          <button
            className="btn"
            onClick={() => {
              duels.close();
              onShut();
            }}
          >
            {t("закрити", "close")}
          </button>
        )}
      </div>
    </ResultCard>
  );
  return (
    <div
      className="duel mt"
      ref={frame}
      data-kind={m.kind}
      data-phase={shown ? "result" : m.over ? "final" : "play"}
      data-solo={m.solo?.level}
      data-thinking={thinking ? "" : undefined}
      style={beside && hold ? ({ "--hold": `${hold}px` } as CSSProperties) : undefined}
    >
      <div className="duel-board">
        <MatchTable.Provider value={table}>{children(end)}</MatchTable.Provider>
        <Intro
          key={m.id}
          game={m.id}
          kind={m.kind}
          sitters={sitters}
          level={m.solo?.level ?? null}
          clock={m.clock}
          late={m.over || m.gone || plies > 0}
        />
        {spot.mode === "over" && result}
      </div>
      {spot.mode === "side" && (
        <div
          ref={aside}
          className="mt-aside"
          style={{ left: spot.left, top: spot.top, width: spot.width, minHeight: spot.height } as CSSProperties}
        >
          {result}
        </div>
      )}
      {spot.mode === "under" && result}
      {shown && outcome === "won" && !shown.quiet && <Confetti key={m.id} />}
      <div className="duel-tools">
        {!outcome && (m.over || m.gone) && again}
        {!outcome && leave}
        {sound}
        <FullscreenButton target={frame} />
      </div>
    </div>
  );
}
