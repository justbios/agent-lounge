"use client";

import { KeyboardEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { useTr } from "@/lib/i18n";
import { Side, sideOf } from "@/lib/live/duel";
import { Ttt } from "@/lib/live/useTicTacToe";
import Finale, { Mood } from "./Finale";
import Seat, { BoardSay } from "./Seat";
import { Sprite } from "./Sprite";
import { ChalkView, H, W } from "./drop/chalkView";
import { pairKey } from "./drop/stage";
import { MARKS, MARK_COLORS } from "./sprites";

const SIGN = { x: "✕", o: "◯" } as const;
/** a finger's tap is answered when it lifts; the click the browser makes of it afterwards is not answered again */
const TAP_MS = 700;
/** a finger may stray this far off the squares, px, and still mean one of them */
const SLACK = 20;

const Mark = ({ side, className = "mark" }: { side: Side; className?: string }) => (
  <Sprite rows={MARKS[side]} palette={MARK_COLORS[side]} className={className} />
);

/**
 * Noughts and crosses on the café's chalk board. The slate, the chalk and all that moves are one drawing
 * ({@link ChalkView}); over it lie nine plain buttons, one a square, so the game is played the same by mouse,
 * finger or keys.
 */
export default function TicTacToe({ ttt, self, note }: { ttt: Ttt; self: string; note: string | null }) {
  const t = useTr();
  const m = ttt.match!;
  const b = ttt.board!;
  const mine = sideOf(m, self) ?? "o";
  const theirs: Side = mine === "x" ? "o" : "x";
  const rival = m.x.id === self ? m.o : m.x;
  const ply = b.cells.filter(Boolean).length;
  const [opened] = useState(ply);
  const canvas = useRef<HTMLCanvasElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const view = useRef<ChalkView | null>(null);
  const tapped = useRef(-TAP_MS);
  const byKey = useRef(false);

  const status =
    b.winner === "draw"
      ? t("нічия", "draw")
      : b.winner
        ? b.winner === mine
          ? t("перемога твоя!", "you win!")
          : t(`перемога: ${rival.name}`, `${rival.name} wins`)
        : (note ?? (b.turn === mine ? t("твій хід", "your move") : t(`ходить ${rival.name}`, `${rival.name}’s move`)));
  const live = !b.winner && !note;
  const go = live && b.turn === mine;
  const end: Mood | null = b.winner ? (b.winner === "draw" ? "draw" : b.winner === mine ? "win" : "lose") : null;
  const mood = end ?? (go ? "go" : null);
  const verdict = { win: t("Перемога!", "You win!"), lose: t("Поразка", "You lose"), draw: t("Нічия", "Draw") };

  const { id } = m;
  const [xId, oId] = [m.x.id, m.o.id];
  useEffect(() => {
    const v = new ChalkView(canvas.current!, id, pairKey("ttt", xId, oId), { x: xId, o: oId });
    view.current = v;
    let raf = requestAnimationFrame(function loop(now) {
      v.frame(now);
      raf = requestAnimationFrame(loop);
    });
    return () => {
      cancelAnimationFrame(raf);
      v.dispose();
      view.current = null;
    };
  }, [id, xId, oId]);
  useEffect(() => {
    view.current?.sync({ cells: b.cells, last: b.last, ply, turn: b.turn, winner: b.winner, line: b.line, mine, go, live });
  }, [b, ply, mine, go, live, id]);

  /** the square under a pointer, a little slack round the nine; null when it is somewhere else */
  const cellAt = (e: { clientX: number; clientY: number }): number | null => {
    const r = grid.current?.getBoundingClientRect();
    if (!r) return null;
    const [x, y] = [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
    const [sx, sy] = [SLACK / r.width, SLACK / r.height];
    if (x < -sx || x > 1 + sx || y < -sy || y > 1 + sy) return null;
    const at = (v: number) => Math.max(0, Math.min(2, Math.floor(v * 3)));
    return at(y) * 3 + at(x);
  };
  /** a mark into `cell`, or the mark that is there already shaking its head */
  const pick = (cell: number) => {
    if (!go) return;
    if (b.cells[cell]) return view.current?.nope(cell);
    ttt.move(cell);
  };
  const point = (e: PointerEvent) => view.current?.hover(cellAt(e), e.pointerType !== "mouse");
  // a finger shows the mark where it comes down, may slide to another square, and leaves it where it lifts
  const lift = (e: PointerEvent) => {
    if (e.pointerType === "mouse") return;
    const cell = cellAt(e);
    tapped.current = performance.now();
    if (cell !== null) pick(cell);
    if (cell === null || !go || b.cells[cell]) view.current?.hover(null);
  };
  const keys = (e: KeyboardEvent) => {
    const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 } as Record<string, number>)[e.key];
    const cells = [...(grid.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const at = cells.indexOf(document.activeElement as HTMLButtonElement);
    if (!step || at < 0) return;
    const row = (i: number) => Math.floor(i / 3);
    for (let c = at + step; c >= 0 && c < 9 && (Math.abs(step) === 3 || row(c) === row(at)); c += step) {
      if (cells[c].disabled) continue;
      cells[c].focus();
      e.preventDefault();
      break;
    }
  };

  return (
    <div className="bgame ttt-game">
      <Seat name={rival.name} on={live && b.turn === theirs} won={b.winner === theirs} mark={<Mark side={theirs} />} />
      <div className={`ttt-board${go ? " go" : ""}`}>
        <canvas ref={canvas} className="ttt-canvas" width={W * 3} height={H * 3} aria-hidden />
        <div
          ref={grid}
          className="ttt-grid"
          role="group"
          aria-label={t("поле хрестиків-нуликів", "tic-tac-toe board")}
          onPointerMove={point}
          onPointerDown={point}
          onPointerUp={lift}
          onPointerLeave={(e) => e.pointerType === "mouse" && view.current?.hover(null)}
          onPointerCancel={() => view.current?.hover(null)}
          onClick={(e) => {
            // a taken square's button is switched off, so its click lands on the grid itself
            const cell = e.target === e.currentTarget ? cellAt(e) : null;
            if (cell !== null && performance.now() - tapped.current > TAP_MS) pick(cell);
          }}
          onKeyDown={keys}
        >
          {b.cells.map((c, i) => (
            <button
              key={i}
              disabled={!go || !!c}
              onClick={() => performance.now() - tapped.current > TAP_MS && pick(i)}
              onFocus={(e) => {
                byKey.current = e.currentTarget.matches(":focus-visible");
                if (byKey.current) view.current?.hover(i);
              }}
              onBlur={() => {
                if (byKey.current) view.current?.hover(null);
                byKey.current = false;
              }}
              aria-label={c ? SIGN[c] : t(`клітинка ${i + 1}`, `square ${i + 1}`)}
            />
          ))}
        </div>
        {end && ply !== opened && <Finale mood={end} text={verdict[end]} />}
      </div>
      <Seat
        name={m.x.id === self ? m.x.name : m.o.name}
        you
        on={go}
        won={b.winner === mine}
        mark={<Mark side={mine} />}
      />
      <BoardSay text={status} mood={mood} />
    </div>
  );
}
