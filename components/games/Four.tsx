"use client";

import { CSSProperties, useState } from "react";
import { useTr } from "@/lib/i18n";
import { Side, sideOf } from "@/lib/live/duel";
import { COLS, ROWS, landing } from "@/lib/live/four";
import { sfx } from "@/lib/live/sfx";
import { Four as FourState } from "@/lib/live/useFour";
import Finale, { Mood } from "./Finale";
import Seat, { BoardSay } from "./Seat";
import { Sprite } from "./Sprite";
import { DISC, DISC_COLORS } from "./sprites";
import { useNewMoves } from "./useNewMoves";

/** how long a disc takes to fall a row, ms, after a short start */
const ROW_MS = 45;
const FALL_MS = 110;

const Disc = ({ side, className = "disc" }: { side: Side; className?: string }) => (
  <Sprite rows={DISC} palette={DISC_COLORS[side]} className={className} />
);

/** Four in a row: discs dropped down seven columns, and whoever lines up four first wins. */
export default function Four({ four, self, note }: { four: FourState; self: string; note: string | null }) {
  const t = useTr();
  const m = four.match!;
  const b = four.board!;
  const mine = sideOf(m, self) ?? "o";
  const theirs: Side = mine === "x" ? "o" : "x";
  const rival = m.x.id === self ? m.o : m.x;
  const ply = b.moves.length;
  const [opened] = useState(ply);

  useNewMoves(b, ply, (now, _, soon) => {
    const fall = FALL_MS + (Math.floor((now.last ?? 0) / COLS) + 1) * ROW_MS;
    soon("move", fall);
    if (now.winner) soon(now.winner === "draw" ? "draw" : now.winner === mine ? "win" : "lose", fall + 260);
    else if (now.turn === mine) soon("turn", fall + 160);
  });

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
  return (
    <div className="bgame four-game">
      <Seat name={rival.name} on={live && b.turn === theirs} won={b.winner === theirs} mark={<Disc side={theirs} />} />
      <div className={`four-board${go ? " go" : ""}`}>
        <div className="four-grid" role="grid" aria-label={t("поле «чотири в ряд»", "four in a row board")}>
          {Array.from({ length: COLS }, (_, col) => {
            const land = landing(b.cells, col);
            return (
              <button
                key={col}
                className="four-col"
                disabled={!go || land < 0}
                onClick={() => {
                  sfx("select");
                  four.move(col);
                }}
                aria-label={t(`стовпчик ${col + 1}`, `column ${col + 1}`)}
              >
                {Array.from({ length: ROWS }, (_, row) => {
                  const i = row * COLS + col;
                  const c = b.cells[i];
                  const cls = [
                    "four-cell",
                    b.line?.includes(i) ? "win" : b.line ? "dim" : "",
                    b.last === i ? "last" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const drop = { "--row": row + 1 } as CSSProperties;
                  return (
                    <span key={row} className={cls} style={b.last === i ? drop : undefined}>
                      {c ? <Disc side={c} /> : go && i === land && <Disc side={mine} className="disc ghost" />}
                    </span>
                  );
                })}
              </button>
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
