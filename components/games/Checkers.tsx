"use client";

import { useState } from "react";
import { N, dark, isKing, legal, owner } from "@/lib/live/checkers";
import { sideOf } from "@/lib/live/duel";
import { Checkers as CheckersState } from "@/lib/live/useCheckers";

const COLOR = { x: "білі", o: "чорні" } as const;

const disc = (r: number) =>
  Array.from({ length: 11 }, (_, y) => {
    const dy = y - 5;
    return dy * dy > r * r ? null : { y, x: Math.round(5.5 - Math.sqrt(r * r - dy * dy)) };
  }).filter((v) => v !== null);
const OUTER = disc(5.5);
const INNER = disc(4.5);

function Man({ white, king }: { white: boolean; king: boolean }) {
  const [fill, rim] = white ? ["#f6f1e4", "#c9bfa8"] : ["#3a3150", "#221c30"];
  return (
    <svg className="man" viewBox="0 0 11 11" shapeRendering="crispEdges" aria-hidden>
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

/** Draughts for two: the inviter plays white from below, each side sees its own pieces at the bottom. */
export default function Checkers({ chk, self, note }: { chk: CheckersState; self: string; note: string | null }) {
  const m = chk.match!;
  const b = chk.board!;
  const mine = sideOf(m, self);
  const rival = m.x.id === self ? m.o : m.x;
  const [picked, setPicked] = useState<{ ply: number; path: number[] } | null>(null);
  const live = !b.winner && !note && b.turn === mine;
  const moves = live ? legal(b) : [];
  const path = picked?.ply === b.moves.length ? picked.path : [];
  const fits = moves.filter((mv) => path.every((s, i) => mv[i] === s));
  const from = new Set(moves.map((mv) => mv[0]));
  const next = new Set(path.length ? fits.flatMap((mv) => (mv.length > path.length ? [mv[path.length]] : [])) : []);
  const last = new Set(b.moves.at(-1) ?? []);

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
      ? "нічия: 15 ходів самими дамками"
      : b.winner
        ? b.winner === mine
          ? "перемога твоя!"
          : `перемога: ${rival.name}`
        : (note ?? (b.turn === mine ? (path.length > 1 ? "бий далі" : "твій хід") : `ходить ${rival.name}`));
  const order = Array.from({ length: N * N }, (_, i) => (mine === "o" ? N * N - 1 - i : i));

  return (
    <div className="ttt chk">
      <div className="ttt-hd">
        <span>
          ти: {COLOR[mine ?? "o"]} · {rival.name}: {COLOR[mine === "x" ? "o" : "x"]}
        </span>
        <b>{status}</b>
      </div>
      <div className="chk-grid" role="grid" aria-label="шашкова дошка">
        {order.map((sq) => {
          const p = b.cells[sq];
          const cls = [
            dark(sq) ? "dk" : "lt",
            path.includes(sq) ? "pick" : "",
            next.has(sq) ? "to" : "",
            !path.length && from.has(sq) ? "can" : "",
            last.has(sq) ? "last" : "",
          ].join(" ");
          const who = owner(p);
          const what = who ? `, ${who === mine ? "твоя" : "чужа"} ${isKing(p) ? "дамка" : "шашка"}` : "";
          return (
            <button
              key={sq}
              className={cls}
              disabled={!dark(sq) || !live}
              onClick={() => tap(sq)}
              aria-label={`${col(sq)}${row(sq)}${what}`}
            >
              {who && <Man white={who === "x"} king={isKing(p)} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
