"use client";

import { sideOf } from "@/lib/live/duel";
import { Ttt } from "@/lib/live/useTicTacToe";

const SIGN = { x: "✕", o: "◯" } as const;

export default function TicTacToe({ ttt, self, note }: { ttt: Ttt; self: string; note: string | null }) {
  const m = ttt.match!;
  const b = ttt.board!;
  const mine = sideOf(m, self);
  const rival = m.x.id === self ? m.o : m.x;
  const status =
    b.winner === "draw"
      ? "нічия"
      : b.winner
        ? b.winner === mine
          ? "перемога твоя!"
          : `перемога: ${rival.name}`
        : (note ?? (b.turn === mine ? "твій хід" : `ходить ${rival.name}`));
  const live = !b.winner && !note;
  return (
    <div className="ttt">
      <div className="ttt-hd">
        <span>
          {SIGN.x} {m.x.id === self ? "ти" : m.x.name} · {SIGN.o} {m.o.id === self ? "ти" : m.o.name}
        </span>
        <b>{status}</b>
      </div>
      <div className="ttt-grid" role="grid" aria-label="поле хрестиків-нуликів">
        {b.cells.map((c, i) => (
          <button
            key={i}
            className={`${c ?? ""} ${b.line?.includes(i) ? "win" : ""}`}
            disabled={!live || !!c || b.turn !== mine}
            onClick={() => ttt.move(i)}
            aria-label={c ? SIGN[c] : `клітинка ${i + 1}`}
          >
            {c ? SIGN[c] : ""}
          </button>
        ))}
      </div>
    </div>
  );
}
