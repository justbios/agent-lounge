"use client";

import { useTr } from "@/lib/i18n";
import { sideOf } from "@/lib/live/duel";
import { Ttt } from "@/lib/live/useTicTacToe";

const SIGN = { x: "✕", o: "◯" } as const;

export default function TicTacToe({ ttt, self, note }: { ttt: Ttt; self: string; note: string | null }) {
  const t = useTr();
  const m = ttt.match!;
  const b = ttt.board!;
  const mine = sideOf(m, self);
  const rival = m.x.id === self ? m.o : m.x;
  const status =
    b.winner === "draw"
      ? t("нічия", "draw")
      : b.winner
        ? b.winner === mine
          ? t("перемога твоя!", "you win!")
          : t(`перемога: ${rival.name}`, `${rival.name} wins`)
        : (note ?? (b.turn === mine ? t("твій хід", "your move") : t(`ходить ${rival.name}`, `${rival.name}’s move`)));
  const live = !b.winner && !note;
  const you = (p: { id: string; name: string }) => (p.id === self ? t("ти", "you") : p.name);
  return (
    <div className="ttt">
      <div className="ttt-hd">
        <span>
          {SIGN.x} {you(m.x)} · {SIGN.o} {you(m.o)}
        </span>
        <b>{status}</b>
      </div>
      <div className="ttt-grid" role="grid" aria-label={t("поле хрестиків-нуликів", "tic-tac-toe board")}>
        {b.cells.map((c, i) => (
          <button
            key={i}
            className={`${c ?? ""} ${b.line?.includes(i) ? "win" : ""}`}
            disabled={!live || !!c || b.turn !== mine}
            onClick={() => ttt.move(i)}
            aria-label={c ? SIGN[c] : t(`клітинка ${i + 1}`, `square ${i + 1}`)}
          >
            {c ? SIGN[c] : ""}
          </button>
        ))}
      </div>
    </div>
  );
}
