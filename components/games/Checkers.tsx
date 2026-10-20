"use client";

import { useRef, useState } from "react";
import { useTr } from "@/lib/i18n";
import { ChkBoard, N, dark, isKing, legal, owner } from "@/lib/live/checkers";
import { Side, sideOf } from "@/lib/live/duel";
import { Checkers as CheckersState } from "@/lib/live/useCheckers";
import Seat, { BoardSay } from "./Seat";
import { useSlide } from "./useSlide";

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
  const gone = new Map(b.took.map((x) => [x.sq, x.p]));
  const flip = mine === "o";
  useSlide(grid, b.moves.length, last.length ? [last] : [], flip);

  const tap = (sq: number) => {
    if (!live) return;
    if (from.has(sq) && path.length <= 1) return setPicked({ ply: b.moves.length, path: [sq] });
    if (!next.has(sq)) return setPicked(null);
    const go = [...path, sq];
    const done = fits.find((mv) => mv.length === go.length && mv.every((s, i) => s === go[i]));
    if (done) {
      setPicked(null);
      chk.move(done);
    } else setPicked({ ply: b.moves.length, path: go });
  };

  const status =
    b.winner === "draw"
      ? t("нічия: 15 ходів самими дамками", "draw: 15 moves with only kings")
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
  const mood = b.winner
    ? b.winner === "draw"
      ? "draw"
      : b.winner === mine
        ? "win"
        : "lose"
    : live
      ? "go"
      : null;
  const order = Array.from({ length: N * N }, (_, i) => (flip ? N * N - 1 - i : i));

  return (
    <div className="bgame chk">
      <Seat
        name={rival.name}
        on={!b.winner && b.turn === theirs}
        won={b.winner === theirs}
        mark={<Man white={theirs === "x"} king={false} className="seat-man" />}
      >
        <Took b={b} side={theirs} />
      </Seat>
      <div className="board-wrap">
        <div className="chk-grid" ref={grid} role="grid" aria-label={t("шашкова дошка", "checkers board")}>
          {order.map((sq, i) => {
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
                  lost && <Man white={owner(lost) === "x"} king={isKing(lost)} className="ghost" />
                )}
                {i % N === 0 && <i className="rk">{row(sq)}</i>}
                {i >= N * (N - 1) && <i className="fl">{col(sq)}</i>}
              </button>
            );
          })}
        </div>
      </div>
      <Seat
        name={m.x.id === self ? m.x.name : m.o.name}
        you
        on={!b.winner && b.turn === mine}
        won={b.winner === mine}
        mark={<Man white={mine === "x"} king={false} className="seat-man" />}
      >
        <Took b={b} side={mine} />
      </Seat>
      <BoardSay text={status} mood={mood} />
    </div>
  );
}
