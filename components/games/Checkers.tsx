"use client";

import { CSSProperties, useRef, useState } from "react";
import { useTr } from "@/lib/i18n";
import { ChkBoard, N, dark, isKing, legal, owner } from "@/lib/live/checkers";
import { Side, sideOf } from "@/lib/live/duel";
import { sfx } from "@/lib/live/sfx";
import { Checkers as CheckersState } from "@/lib/live/useCheckers";
import BoardFrame from "./BoardFrame";
import Finale, { Mood } from "./Finale";
import GameClock, { useTimeUp } from "./GameClock";
import Seat, { BoardSay } from "./Seat";
import { Sparks } from "./Sparks";
import { useNewMoves } from "./useNewMoves";
import { useSlide } from "./useSlide";

/** a hop of a slide takes this long, so a piece taken on the way goes when the jumper passes it */
const HOP_MS = 130;

const disc = (r: number) =>
  Array.from({ length: 11 }, (_, y) => {
    const dy = y - 5;
    return dy * dy > r * r ? null : { y, x: Math.round(5.5 - Math.sqrt(r * r - dy * dy)) };
  }).filter((v) => v !== null);
const OUTER = disc(5.5);
const INNER = disc(4.5);

function Man({ white, king, className = "man" }: { white: boolean; king: boolean; className?: string }) {
  const [fill, rim] = white ? ["#f6f1e4", "#c9bfa8"] : ["#463c62", "#2a2340"];
  return (
    <svg className={className} viewBox="0 0 11 11" shapeRendering="crispEdges" aria-hidden>
      {OUTER.map((r) => (
        <rect key={`o${r.y}`} x={r.x} y={r.y} width={11 - 2 * r.x} height={1} fill="#07050d" />
      ))}
      {INNER.map((r) => (
        <rect key={`i${r.y}`} x={r.x} y={r.y} width={11 - 2 * r.x} height={1} fill={r.y > 7 ? rim : fill} />
      ))}
      {king && (
        <g fill="#d9a21b">
          <rect x={3} y={6} width={5} height={1} />
          <rect x={3} y={4} width={1} height={2} />
          <rect x={5} y={3} width={1} height={3} />
          <rect x={7} y={4} width={1} height={2} />
        </g>
      )}
    </svg>
  );
}

const kings = (b: ChkBoard, s: Side) => b.cells.filter((p) => owner(p) === s && isKing(p)).length;

const col = (sq: number) => String.fromCharCode(97 + (sq % N));
const row = (sq: number) => N - Math.floor(sq / N);

/** How many of the other side's pieces a side has taken: each starts with twelve. */
const tookBy = (b: ChkBoard, s: Side) => 12 - b.cells.filter((p) => owner(p) === (s === "x" ? "o" : "x")).length;

function Took({ b, side }: { b: ChkBoard; side: Side }) {
  const n = tookBy(b, side);
  if (!n) return null;
  return (
    <>
      <Man white={side === "o"} king={false} className="took" />
      <em>×{n}</em>
    </>
  );
}

/** Draughts for two: the inviter plays white from below, each side sees its own pieces at the bottom. */
export default function Checkers({ chk, self, note }: { chk: CheckersState; self: string; note: string | null }) {
  const t = useTr();
  const m = chk.match!;
  const b = chk.board!;
  const mine = sideOf(m, self) ?? "o";
  const theirs: Side = mine === "x" ? "o" : "x";
  const rival = m.x.id === self ? m.o : m.x;
  const grid = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<{ ply: number; path: number[] } | null>(null);
  const live = !b.winner && !note && b.turn === mine;
  const moves = live ? legal(b) : [];
  const path = picked?.ply === b.moves.length ? picked.path : [];
  const fits = moves.filter((mv) => path.every((s, i) => mv[i] === s));
  const from = new Set(moves.map((mv) => mv[0]));
  const next = new Set(path.length ? fits.flatMap((mv) => (mv.length > path.length ? [mv[path.length]] : [])) : []);
  const last = b.moves.at(-1) ?? [];
  const gone = new Map(b.took.map((x, i) => [x.sq, { p: x.p, i }]));
  const flip = mine === "o";
  const ply = b.moves.length;
  const [opened] = useState(ply);
  const fresh = ply !== opened;
  const timeUp = useTimeUp(chk.clock, mine);
  const out = chk.clock?.out;
  useSlide(grid, ply, last.length ? [last] : [], flip);

  useNewMoves(b, ply, (now, before, soon) => {
    const mover: Side = now.turn === "x" ? "o" : "x";
    if (now.took.length) now.took.slice(0, 4).forEach((_, i) => soon("capture", 90 + HOP_MS * i));
    else sfx("move");
    const after = HOP_MS * Math.max(now.took.length, 1) + 120;
    if (kings(now, mover) > kings(before, mover)) soon("promote", after);
    if (now.winner) soon(now.winner === "draw" ? "draw" : now.winner === mine ? "win" : "lose", after + 200);
    else if (now.turn === mine) soon("turn", after + 60);
  });

  const tap = (sq: number) => {
    if (!live) return;
    if (from.has(sq) && path.length <= 1) {
      sfx("select");
      return setPicked({ ply, path: [sq] });
    }
    if (!next.has(sq)) {
      if (owner(b.cells[sq]) === mine && path.length <= 1) sfx("illegal");
      return setPicked(null);
    }
    const go = [...path, sq];
    const done = fits.find((mv) => mv.length === go.length && mv.every((s, i) => s === go[i]));
    if (done) {
      setPicked(null);
      chk.move(done);
    } else {
      sfx("select");
      setPicked({ ply, path: go });
    }
  };

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
  const order = Array.from({ length: N * N }, (_, i) => (flip ? N * N - 1 - i : i));

  return (
    <div className="bgame chk">
      <Seat
        name={rival.name}
        on={!b.winner && b.turn === theirs}
        won={b.winner === theirs}
        mark={<Man white={theirs === "x"} king={false} className="seat-man" />}
        clock={clock(theirs)}
      >
        <Took b={b} side={theirs} />
      </Seat>
      <BoardFrame flip={flip} go={live}>
        <div className="chk-grid" ref={grid} role="grid" aria-label={t("шашкова дошка", "checkers board")}>
          {order.map((sq) => {
            const p = b.cells[sq];
            const cls = [
              dark(sq) ? "dk" : "lt",
              path.includes(sq) ? "pick" : "",
              next.has(sq) ? "to" : "",
              !path.length && from.has(sq) ? "can" : "",
              last[0] === sq ? "was" : last.at(-1) === sq ? "now" : last.includes(sq) ? "via" : "",
              gone.has(sq) ? "gone" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const who = owner(p);
            const lost = gone.get(sq);
            const what = who
              ? t(
                  `, ${who === mine ? "твоя" : "чужа"} ${isKing(p) ? "дамка" : "шашка"}`,
                  `, ${who === mine ? "your" : "their"} ${isKing(p) ? "king" : "man"}`,
                )
              : lost
                ? t(", тут щойно побили", ", just taken here")
                : "";
            return (
              <button
                key={sq}
                data-sq={sq}
                className={cls}
                disabled={!dark(sq) || !live}
                onClick={() => tap(sq)}
                aria-label={`${col(sq)}${row(sq)}${what}`}
              >
                {who ? (
                  <Man white={who === "x"} king={isKing(p)} />
                ) : (
                  lost && (
                    <span
                      key={ply}
                      className={`ghost${fresh ? " poof" : ""}`}
                      style={{ "--wait": `${120 + HOP_MS * lost.i}ms` } as CSSProperties}
                    >
                      <Man white={owner(lost.p) === "x"} king={isKing(lost.p)} className="poof-piece" />
                      {fresh && <Sparks />}
                    </span>
                  )
                )}
              </button>
            );
          })}
        </div>
        {(fresh || timeUp) && end && <Finale mood={end} text={verdict[end]} />}
      </BoardFrame>
      <Seat
        name={m.x.id === self ? m.x.name : m.o.name}
        you
        on={!b.winner && b.turn === mine}
        won={b.winner === mine}
        mark={<Man white={mine === "x"} king={false} className="seat-man" />}
        clock={clock(mine)}
      >
        <Took b={b} side={mine} />
      </Seat>
      <BoardSay text={chk.clock && !ply && !note ? `${status} · ${waitClock}` : status} mood={mood} />
    </div>
  );
}
