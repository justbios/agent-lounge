"use client";

import { CSSProperties, useRef, useState } from "react";
import { useTr } from "@/lib/i18n";
import { ChkBoard, N, dark, isKing, legal, owner } from "@/lib/live/checkers";
import { Side, sideOf } from "@/lib/live/duel";
import { sfx } from "@/lib/live/sfx";
import { Checkers as CheckersState } from "@/lib/live/useCheckers";
import BoardFrame from "./BoardFrame";
import Finale, { Mood } from "./Finale";
import Seat, { BoardSay } from "./Seat";
import { Sparks } from "./Sparks";
import { Sprite } from "./Sprite";
import { MAN, MAN_BLACK, MAN_KING, MAN_WHITE } from "./sprites";
import { useNewMoves } from "./useNewMoves";
import { useSlide } from "./useSlide";

/** a hop of a slide takes this long, so a piece taken on the way goes when the jumper passes it */
const HOP_MS = 130;

function Man({ white, king, className = "man" }: { white: boolean; king: boolean; className?: string }) {
  return <Sprite rows={king ? MAN_KING : MAN} palette={white ? MAN_WHITE : MAN_BLACK} className={className} />;
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
  const verdict = { win: t("Перемога!", "You win!"), lose: t("Поразка", "You lose"), draw: t("Нічия", "Draw") };
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
        {fresh && end && (
          <Finale mood={end} text={verdict[end]} />
        )}
      </BoardFrame>
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
