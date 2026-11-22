"use client";

import { KeyboardEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { useTr } from "@/lib/i18n";
import { Side, sideOf } from "@/lib/live/duel";
import { COLS, ROWS, landing } from "@/lib/live/four";
import { four as snd } from "@/lib/live/sounds/drop";
import { Four as FourState } from "@/lib/live/useFour";
import Finale, { Mood } from "./Finale";
import Seat, { BoardSay } from "./Seat";
import { Sprite } from "./Sprite";
import { FourView, H, W } from "./drop/fourView";
import { pairKey } from "./drop/stage";
import { DISC, DISC_COLORS } from "./sprites";

/** a finger's tap is answered when it lifts; the click the browser makes of it afterwards is not answered again */
const TAP_MS = 700;
/** a finger may stray this far off the columns, px, and still mean one of them */
const SLACK = 28;

const Disc = ({ side, className = "disc" }: { side: Side; className?: string }) => (
  <Sprite rows={DISC} palette={DISC_COLORS[side]} className={className} />
);

/**
 * Four in a row: discs dropped down seven columns, and whoever lines up four first wins. The frame, the discs and
 * all that moves are one drawing ({@link FourView}); over it lie seven plain buttons, one a column, so the game is
 * played the same by mouse, finger or keys.
 */
export default function Four({ four, self, note }: { four: FourState; self: string; note: string | null }) {
  const t = useTr();
  const m = four.match!;
  const b = four.board!;
  const mine = sideOf(m, self) ?? "o";
  const theirs: Side = mine === "x" ? "o" : "x";
  const rival = m.x.id === self ? m.o : m.x;
  const ply = b.moves.length;
  const [opened] = useState(ply);
  const canvas = useRef<HTMLCanvasElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const view = useRef<FourView | null>(null);
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

  const { id, solo } = m;
  const [xId, oId] = [m.x.id, m.o.id];
  useEffect(() => {
    const v = new FourView(canvas.current!, id, pairKey("four", xId, oId), { x: xId, o: oId }, !!solo);
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
  }, [id, xId, oId, solo]);
  useEffect(() => {
    view.current?.sync({ cells: b.cells, last: b.last, ply, turn: b.turn, winner: b.winner, line: b.line, mine, go, live });
  }, [b, ply, mine, go, live, id]);

  /** the column under a pointer, a little slack round the board; null when it is somewhere else */
  const colAt = (e: { clientX: number; clientY: number }): number | null => {
    const r = grid.current?.getBoundingClientRect();
    if (!r || e.clientY < r.top - SLACK || e.clientY > r.bottom + SLACK) return null;
    if (e.clientX < r.left - SLACK || e.clientX > r.right + SLACK) return null;
    return Math.max(0, Math.min(COLS - 1, Math.floor(((e.clientX - r.left) / r.width) * COLS)));
  };
  /** a disc into `col`, or the held one shaking its head when the column is full */
  const pick = (col: number) => {
    if (!go) return;
    if (landing(b.cells, col) < 0) return view.current?.nope();
    snd.release();
    four.move(col);
  };
  const point = (e: PointerEvent) => view.current?.hover(colAt(e), e.pointerType !== "mouse");
  // a finger shows the disc where it comes down, may slide to another column, and drops it where it lifts
  const lift = (e: PointerEvent) => {
    if (e.pointerType === "mouse") return;
    const col = colAt(e);
    tapped.current = performance.now();
    if (col !== null) pick(col);
    if (col === null || !go || landing(b.cells, col) < 0) view.current?.hover(null);
  };
  const keys = (e: KeyboardEvent) => {
    const step = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
    const cols = [...(grid.current?.querySelectorAll<HTMLButtonElement>(".four-col") ?? [])];
    const at = cols.indexOf(document.activeElement as HTMLButtonElement);
    if (!step || at < 0) return;
    for (let c = at + step; c >= 0 && c < COLS; c += step) {
      if (cols[c].disabled) continue;
      cols[c].focus();
      e.preventDefault();
      break;
    }
  };

  return (
    <div className="bgame four-game">
      <Seat name={rival.name} on={live && b.turn === theirs} won={b.winner === theirs} mark={<Disc side={theirs} />} />
      <div className={`four-board${go ? " go" : ""}`}>
        <canvas ref={canvas} className="four-canvas" width={W * 3} height={H * 3} aria-hidden />
        <div
          ref={grid}
          className="four-grid"
          role="group"
          aria-label={t("поле «чотири в ряд»", "four in a row board")}
          onPointerMove={point}
          onPointerDown={point}
          onPointerUp={lift}
          onPointerLeave={(e) => e.pointerType === "mouse" && view.current?.hover(null)}
          onPointerCancel={() => view.current?.hover(null)}
          onClick={(e) => {
            // a full column's button is switched off, so its click lands on the grid itself
            const col = e.target === e.currentTarget ? colAt(e) : null;
            if (col !== null && performance.now() - tapped.current > TAP_MS) pick(col);
          }}
          onKeyDown={keys}
        >
          {Array.from({ length: COLS }, (_, col) => {
            const held = Array.from({ length: ROWS }, (_, row) => b.cells[row * COLS + col]).filter(Boolean).length;
            return (
              <button
                key={col}
                className="four-col"
                disabled={!go || held === ROWS}
                onClick={() => performance.now() - tapped.current > TAP_MS && pick(col)}
                onFocus={(e) => {
                  byKey.current = e.currentTarget.matches(":focus-visible");
                  if (byKey.current) view.current?.hover(col);
                }}
                onBlur={() => {
                  if (byKey.current) view.current?.hover(null);
                  byKey.current = false;
                }}
                aria-label={t(`стовпчик ${col + 1}, фішок: ${held}`, `column ${col + 1}, discs: ${held}`)}
              />
            );
          })}
        </div>
        {end && ply !== opened && <Finale mood={end} text={verdict[end]} />}
      </div>
      <Seat
        name={m.x.id === self ? m.x.name : m.o.name}
        you
        on={go}
        won={b.winner === mine}
        mark={<Disc side={mine} />}
      />
      <BoardSay text={status} mood={mood} />
    </div>
  );
}
