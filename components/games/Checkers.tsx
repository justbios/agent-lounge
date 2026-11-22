"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import { useTr } from "@/lib/i18n";
import { ChkBoard, N, dark, isKing, legal, owner } from "@/lib/live/checkers";
import { Side, sideOf } from "@/lib/live/duel";
import { sfx } from "@/lib/live/sfx";
import { boardSfx } from "@/lib/live/sounds/boards";
import { Checkers as CheckersState } from "@/lib/live/useCheckers";
import BoardFrame from "./BoardFrame";
import Finale, { Mood } from "./Finale";
import GameClock, { useLowClock, useTimeUp } from "./GameClock";
import Seat, { BoardSay } from "./Seat";
import { FINAL_MS, INTRO_MS } from "./beats";
import BoardFx, { BoardFxHandle } from "./boards/BoardFx";
import { between } from "./boards/chessView";
import { useDrag } from "./boards/drag";
import {
  FLY_MS,
  KNOCK_MS,
  Trip,
  calm,
  flyOff,
  headShake,
  heading,
  landings,
  rackOpen,
  shake,
  travel,
  trayPop,
  useLater,
  useStage,
} from "./boards/motion";

const disc = (r: number, size: number) =>
  Array.from({ length: size }, (_, y) => {
    const dy = y - (size - 1) / 2;
    return dy * dy > r * r ? null : { y, x: Math.round(size / 2 - Math.sqrt(r * r - dy * dy)) };
  }).filter((v) => v !== null);
const OUTER = disc(5.5, 11);
const INNER = disc(4.5, 11);
/** one pixel wider all round: the rim a piece wears when it may move */
const RIM = disc(6.5, 13);

const WHITE = ["#f6f1e4", "#c9bfa8"];
const BLACK = ["#463c62", "#2a2340", "#7a6aa8"];
const GOLD = ["#ffd25a", "#fff3c4", "#d9a21b", "#ff6aa8"];

function Man({ white, king, className = "man" }: { white: boolean; king: boolean; className?: string }) {
  const [fill, rim] = white ? WHITE : BLACK;
  return (
    <svg className={className} viewBox="-1 -1 13 13" shapeRendering="crispEdges" aria-hidden>
      {className === "man" && (
        <g className="rim">
          {RIM.map((r) => (
            <rect key={r.y} x={r.x - 1} y={r.y - 1} width={13 - 2 * r.x} height={1} />
          ))}
        </g>
      )}
      {OUTER.map((r) => (
        <rect key={`o${r.y}`} x={r.x} y={r.y} width={11 - 2 * r.x} height={1} fill="#07050d" />
      ))}
      {INNER.map((r) => (
        <rect key={`i${r.y}`} x={r.x} y={r.y} width={11 - 2 * r.x} height={1} fill={r.y > 7 ? rim : fill} />
      ))}
      {king && (
        <g className="crown" fill="#d9a21b">
          <rect x={3} y={6} width={5} height={1} />
          <rect x={3} y={4} width={1} height={2} />
          <rect x={5} y={3} width={1} height={3} />
          <rect x={7} y={4} width={1} height={2} />
        </g>
      )}
    </svg>
  );
}

const col = (sq: number) => String.fromCharCode(97 + (sq % N));
const row = (sq: number) => N - Math.floor(sq / N);
const other = (s: Side): Side => (s === "x" ? "o" : "x");
const count = (b: ChkBoard, s: Side) => b.cells.filter((p) => owner(p) === s).length;

/**
 * A side's tray: every piece it has taken, stacked like coins, and how many pieces it is ahead. The ones taken by
 * the move just made are marked, so each piece knocked off the board has a place to land.
 */
function Tray({ b, side, fresh }: { b: ChkBoard; side: Side; fresh: boolean }) {
  const n = 12 - count(b, other(side));
  const lead = count(b, side) - count(b, other(side));
  const just = fresh && b.turn !== side ? b.took.length : 0;
  return (
    <span className="took-tray" data-tray={side}>
      {n > 0 && (
        <span className="took-rack">
          {Array.from({ length: n }, (_, i) => (
            <Man key={i} white={side === "o"} king={false} className={`took disc${i >= n - just ? " new" : ""}`} />
          ))}
        </span>
      )}
      {lead > 0 && (
        <b key={lead} className="took-lead">
          +{lead}
        </b>
      )}
    </span>
  );
}

/** Draughts for two: the inviter plays white from below, each side sees its own pieces at the bottom. */
export default function Checkers({ chk, self, note }: { chk: CheckersState; self: string; note: string | null }) {
  const t = useTr();
  const m = chk.match!;
  const b = chk.board!;
  const mine = sideOf(m, self) ?? "o";
  const theirs = other(mine);
  const rival = m.x.id === self ? m.o : m.x;
  const root = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const squares = useRef<HTMLDivElement>(null);
  const fx = useRef<BoardFxHandle>(null);
  const flyers = useRef<HTMLDivElement>(null);
  const later = useLater();
  /** where the piece was let go from the hand, when it was dragged */
  const hand = useRef<{ sq: number; dx: number; dy: number } | null>(null);
  /** the board before the latest move, to tell a man that was just crowned */
  const prev = useRef(b);
  /** how much of the path the player has already seen their piece walk, hop by hop */
  const shown = useRef(0);
  const [picked, setPicked] = useState<{ ply: number; path: number[] } | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const ply = b.moves.length;
  const [opened] = useState(ply);
  const fresh = ply !== opened;
  const timeUp = useTimeUp(chk.clock);
  const seen = fresh || timeUp;
  const out = chk.clock?.out;
  const live = !b.winner && !note && b.turn === mine;
  const tense = useLowClock(chk.clock, mine, b.turn, !!b.winner || m.gone);
  const moves = live ? legal(b) : [];
  const path = picked?.ply === ply ? picked.path : [];
  const fits = moves.filter((mv) => path.every((s, i) => mv[i] === s));
  const from = new Set(moves.map((mv) => mv[0]));
  const next = new Set(path.length ? fits.flatMap((mv) => (mv.length > path.length ? [mv[path.length]] : [])) : []);
  const last = b.moves.at(-1) ?? [];
  const gone = new Map(b.took.map((x, i) => [x.sq, { p: x.p, i }]));
  const flip = mine === "o";
  /** the pieces standing between two squares of one diagonal */
  const jumped = (a: number, c: number) => between(a, c).filter((s) => b.cells[s]);
  // draughts take whenever they can: then only the pieces that can are free to move
  const forced = moves.length > 0 && jumped(moves[0][0], moves[0][1]).length > 0;
  // a run of jumps is walked hop by hop: the piece stands where the path has brought it, what it jumped waits to go
  const at = path.length > 1 ? path.at(-1)! : -1;
  const doomed = new Set<number>();
  for (let i = 1; i < path.length; i++) jumped(path[i - 1], path[i]).forEach((s) => doomed.add(s));
  const cellAt = (sq: number) => (at < 0 ? b.cells[sq] : sq === at ? b.cells[path[0]] : sq === path[0] ? "" : b.cells[sq]);
  const hop = Math.max(path.length, 1);
  const prey = new Set(
    forced ? (path.length ? fits : moves).flatMap((mv) => (mv.length > hop ? jumped(mv[hop - 1], mv[hop]) : [])) : [],
  );
  const loser = b.winner && b.winner !== "draw" ? other(b.winner) : null;
  const order = Array.from({ length: N * N }, (_, i) => (flip ? N * N - 1 - i : i));

  useStage(ply, (was) => {
    const el = grid.current;
    const before = prev.current;
    prev.current = b;
    if (!el || last.length < 2 || ply <= was) return;
    const still = calm();
    const mover = other(b.turn);
    const end = last.at(-1)!;
    // the hops the player already made with the piece in hand are not played again
    const done = Math.min(Math.max(0, shown.current - 1), last.length - 2);
    const rest = last.slice(done);
    const took = b.took;
    const king = isKing(before.cells[last[0]]);
    const dropped = hand.current?.sq === end ? hand.current : null;
    hand.current = null;
    const trip: Trip = { path: rest, gait: took.length ? "hop" : "slide", drop: dropped };
    const lands = still ? rest.slice(1).map(() => 0) : landings(trip);
    const down = lands.at(-1) ?? 0;
    root.current?.style.setProperty("--land", `${down}ms`);
    if (!still) travel(el, trip, flip);
    rest.slice(1).forEach((sq, i) => {
      later(() => {
        boardSfx.hop(took.length ? done + i : 0, king, took.length > 0);
        fx.current?.dust(sq, king ? 1.6 : 1.1);
        if (took.length) shake(squares.current, 0.5 + 0.25 * Math.min(4, done + i));
      }, lands[i] ?? down);
    });

    // each piece taken goes as the jumper lands past it; the ones jumped earlier, with the piece in hand, go at once
    const trays = root.current?.querySelectorAll(`[data-tray="${mover}"] .took.new`);
    took.forEach((x, i) => {
      const hit = i < done ? 30 + 60 * i : (lands[i - done] ?? down);
      const dir = heading(last[i], last[i + 1] ?? end, flip);
      later(() => fx.current?.chips(x.sq, owner(x.p) === "x" ? WHITE : BLACK, dir, 0.3), hit);
      if (still) return;
      const p = el.querySelector<HTMLElement>(`.poof[data-i="${i}"]`);
      const tray = trays?.[i] ?? null;
      if (p) flyOff(flyers.current, p, tray, dir, hit);
      const arrive = hit + KNOCK_MS + FLY_MS - 30;
      if (!i) rackOpen(tray?.parentElement, arrive);
      trayPop(tray, arrive);
      later(() => boardSfx.tray(), arrive);
    });
    if (took.length && !still) {
      trayPop(root.current?.querySelector(`[data-tray="${mover}"] .took-lead`), down + KNOCK_MS + FLY_MS - 30);
    }
    if (chk.clock) later(() => boardSfx.punch(), down + 40);

    // a man reaches the far row: a beat, and the crown comes down on it
    const crowned = !king && isKing(b.cells[end]);
    const piece = el.querySelector(`[data-sq="${end}"] > .man`);
    if (crowned) {
      const when = down + 140;
      const crown = piece?.querySelector(".crown");
      if (!still && crown) {
        crown.animate(
          [
            { opacity: 0, transform: "translateY(-10px)" },
            { opacity: 1, transform: "translateY(-10px)", offset: 0.02, easing: "cubic-bezier(0.6, 0, 0.9, 0.5)" },
            { opacity: 1, transform: "translateY(0)", offset: 0.5, easing: "ease-out" },
            { opacity: 1, transform: "translateY(-2px)", offset: 0.7, easing: "ease-in" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          { duration: 460, delay: when, fill: "backwards" },
        );
        piece?.animate([{ scale: "1" }, { scale: "1.22 1.1" }, { scale: "1" }], { duration: 260, delay: when + 230 });
      }
      later(() => boardSfx.crown(), when);
      later(() => {
        fx.current?.burst(end, GOLD, 18);
        fx.current?.glint(end, GOLD, 6);
      }, when + 230);
    }

    const after = down + (crowned ? 560 : 160);
    if (b.winner === "draw") {
      later(() => boardSfx.hush(), after);
      later(() => sfx("draw"), FINAL_MS);
    } else if (b.winner) {
      // the last beat: the winner's pieces hop one after another, each a note higher
      order
        .filter((sq) => owner(b.cells[sq]) === b.winner)
        .forEach((sq, i) => {
          const when = after + i * 70;
          const man = el.querySelector(`[data-sq="${sq}"] > .man`);
          if (!still) {
            man?.animate(
              [
                { transform: "translateY(0)", scale: "1", easing: "cubic-bezier(0.2, 0.7, 0.4, 1)" },
                { transform: "translateY(-34%)", scale: "1.12", offset: 0.45, easing: "cubic-bezier(0.6, 0, 0.8, 0.3)" },
                { transform: "translateY(0)", scale: "1.08 0.9", offset: 0.82 },
                { transform: "translateY(0)", scale: "1" },
              ],
              { duration: 380, delay: when },
            );
          }
          if (i < 8) later(() => boardSfx.cheer(i), when);
        });
      later(() => sfx(b.winner === mine ? "win" : "lose"), FINAL_MS);
    } else if (b.turn === mine) later(() => sfx("turn"), after + 40);
  });

  // one hop of a run made with the piece in hand: it jumps now, and what it jumped is marked to go
  useStage(path.length, (was) => {
    shown.current = path.length;
    const el = grid.current;
    if (!el || path.length < 2 || path.length <= was) return;
    const a = path.at(-2)!;
    const c = path.at(-1)!;
    const still = calm();
    const dropped = hand.current?.sq === c ? hand.current : null;
    hand.current = null;
    const trip: Trip = { path: [a, c], gait: "hop", drop: dropped };
    const land = still ? 0 : landings(trip)[0];
    if (!still) travel(el, trip, flip);
    later(() => {
      boardSfx.hop(path.length - 2, isKing(b.cells[path[0]]), true);
      fx.current?.dust(c, 1.1);
      shake(squares.current, 0.5 + 0.25 * Math.min(4, path.length - 2));
      if (still) return;
      for (const s of jumped(a, c)) {
        el.querySelector(`[data-sq="${s}"] > .man`)?.animate([{ filter: "brightness(3)" }, { filter: "brightness(0.75) grayscale(0.7)" }], { duration: 200 });
      }
    }, land);
  });

  // a flag falls: its own short ending, then the result's sound with its card
  useStage(timeUp, () => {
    if (!timeUp) return;
    boardSfx.flag();
    shake(squares.current, 1.5, 240);
    later(() => sfx(b.winner === mine ? "win" : "lose"), FINAL_MS);
  });

  // as a new game opens, once the two sides have been shown, the pieces come to attention
  useEffect(() => {
    if (opened) return;
    const el = grid.current;
    const up = setTimeout(() => {
      if (!el || el.dataset.played !== undefined || calm()) return;
      el.setAttribute("data-ready", "");
      boardSfx.rattle();
    }, INTRO_MS);
    const down = setTimeout(() => el?.removeAttribute("data-ready"), INTRO_MS + 1200);
    return () => {
      clearTimeout(up);
      clearTimeout(down);
    };
  }, [opened]);

  /** A soft no: the piece shakes its head. */
  const refuse = (sq: number) => {
    boardSfx.refuse();
    headShake(grid.current?.querySelector(`[data-sq="${sq}"] > .man`));
  };

  /** The piece in hand goes on to `sq`: one more hop of its run, or the whole move made. */
  const step = (sq: number, drop?: { dx: number; dy: number }) => {
    const go = [...path, sq];
    const done = fits.find((mv) => mv.length === go.length && mv.every((s, i) => s === go[i]));
    hand.current = drop ? { sq, ...drop } : null;
    if (done) {
      setPicked(null);
      chk.move(done);
    } else setPicked({ ply, path: go });
  };

  const tap = (sq: number) => {
    if (!live) return;
    if (from.has(sq) && path.length <= 1) {
      boardSfx.lift();
      return setPicked({ ply, path: [sq] });
    }
    if (!next.has(sq)) {
      if (owner(b.cells[sq]) === mine && path.length <= 1) refuse(sq);
      return setPicked(null);
    }
    step(sq);
  };

  const drag = useDrag(grid, {
    live,
    flip,
    grabs: (sq) => (path.length <= 1 && from.has(sq)) || sq === at,
    lift: (sq) => {
      if (sq === at || path[0] === sq) return;
      boardSfx.lift();
      setPicked({ ply, path: [sq] });
    },
    over: setOver,
    drop: (fromSq, to, where) => {
      if (to === null || to === fromSq) return false;
      if (!next.has(to)) {
        boardSfx.refuse();
        if (path.length <= 1) setPicked(null);
        return false;
      }
      step(to, where);
      return true;
    },
  });

  const status =
    b.winner === "draw"
      ? t("нічия: 15 ходів самими дамками", "draw: 15 moves with only kings")
      : out
        ? out === mine
          ? t(`твій час скінчився: перемога ${rival.name}`, `you ran out of time: ${rival.name} wins`)
          : t(`у ${rival.name} скінчився час: перемога твоя!`, `${rival.name} ran out of time: you win!`)
        : b.winner
          ? b.winner === mine
            ? t("перемога твоя!", "you win!")
            : t(`перемога: ${rival.name}`, `${rival.name} wins`)
          : (note ??
            (b.turn === mine
              ? path.length > 1
                ? t("бий далі", "keep jumping")
                : forced
                  ? t("твій хід: мусиш бити", "your move: you must take")
                  : t("твій хід", "your move")
              : t(`ходить ${rival.name}`, `${rival.name}’s move`)));
  const end: Mood | null = b.winner ? (b.winner === "draw" ? "draw" : b.winner === mine ? "win" : "lose") : null;
  const mood = end ?? (live ? "go" : null);
  const verdict = out
    ? { win: t("Перемога за часом!", "Won on time!"), lose: t("Час скінчився", "Out of time"), draw: "" }
    : { win: t("Перемога!", "You win!"), lose: t("Поразка", "You lose"), draw: t("Нічия", "Draw") };
  const clock = (side: Side) =>
    chk.clock && (
      <GameClock clock={chk.clock} side={side} turn={b.turn} over={!!b.winner || m.gone} mine={side === mine} />
    );
  const waitClock = t("годинник піде після першого ходу білих", "the clocks start after white’s first move");
  const inHand = path.length ? b.cells[path[0]] : "";

  return (
    <div className="bgame chk" ref={root}>
      <Seat
        name={rival.name}
        on={!b.winner && b.turn === theirs}
        won={b.winner === theirs}
        mark={<Man white={theirs === "x"} king={false} className="seat-man" />}
        clock={clock(theirs)}
      >
        <Tray b={b} side={theirs} fresh={fresh} />
      </Seat>
      <BoardFrame flip={flip} go={live} tense={tense} sq={squares}>
        <div
          className="chk-grid"
          ref={grid}
          role="grid"
          aria-label={t("шашкова дошка", "checkers board")}
          data-end={b.winner ? (b.winner === "draw" ? "draw" : out ? "time" : "win") : undefined}
          data-live={seen ? "" : undefined}
          data-played={ply ? "" : undefined}
          {...drag}
        >
          {order.map((sq, i) => {
            const p = cellAt(sq);
            const who = owner(p);
            const can = !path.length && from.has(sq);
            const cls = [
              dark(sq) ? "dk" : "lt",
              path.includes(sq) ? "pick" : "",
              next.has(sq) ? "to" : "",
              can ? (forced ? "can must" : "can") : "",
              last[0] === sq ? "was" : last.at(-1) === sq ? "now" : last.includes(sq) ? "via" : "",
              gone.has(sq) ? "gone" : "",
              doomed.has(sq) ? "doomed" : prey.has(sq) ? "prey" : "",
              over === sq && next.has(sq) ? "over" : "",
              loser && who === loser ? "lost" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const taken = gone.get(sq);
            const what = who
              ? t(
                  `, ${who === mine ? "твоя" : "чужа"} ${isKing(p) ? "дамка" : "шашка"}`,
                  `, ${who === mine ? "your" : "their"} ${isKing(p) ? "king" : "man"}`,
                )
              : taken
                ? t(", тут щойно побили", ", just taken here")
                : "";
            return (
              <button
                key={sq}
                data-sq={sq}
                className={cls}
                style={{ "--f": i % N, "--r": Math.floor(i / N) } as CSSProperties}
                disabled={!dark(sq) || !live}
                onClick={() => tap(sq)}
                aria-label={`${col(sq)}${row(sq)}${what}`}
              >
                {who && <Man white={who === "x"} king={isKing(p)} />}
                {next.has(sq) && inHand && <Man white={mine === "x"} king={isKing(inHand)} className="chk-ghost" />}
                {fresh && taken && (
                  <span key={ply} className="poof" data-i={taken.i}>
                    <Man white={owner(taken.p) === "x"} king={isKing(taken.p)} className="poof-piece disc" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="board-fly" ref={flyers} aria-hidden />
        <BoardFx ref={fx} flip={flip} />
        {seen && end && <Finale mood={end} text={verdict[end]} />}
      </BoardFrame>
      <Seat
        name={m.x.id === self ? m.x.name : m.o.name}
        you
        on={!b.winner && b.turn === mine}
        won={b.winner === mine}
        mark={<Man white={mine === "x"} king={false} className="seat-man" />}
        clock={clock(mine)}
      >
        <Tray b={b} side={mine} fresh={fresh} />
      </Seat>
      <BoardSay text={chk.clock && !ply && !note ? `${status} · ${waitClock}` : status} mood={mood} />
    </div>
  );
}
