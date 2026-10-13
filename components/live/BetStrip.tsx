"use client";

import { Dices } from "lucide-react";
import { BET_WINDOW_MS, CHOICES, ChoiceId } from "@/lib/live/bets";
import { BetRound } from "@/lib/live/useBets";

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function took(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} с` : `${Math.floor(s / 60)} хв ${s % 60} с`;
}

function Row({ r, self, now, onPick }: { r: BetRound; self: string; now: number; onPick: (c: ChoiceId) => void }) {
  const winners = r.result ? r.picks.filter(([, p]) => p.choice === r.result) : [];
  const who = (by: string, name: string) => (by === self ? "ти" : name);
  return (
    <div className={`bet ${r.result ? "settled" : ""}`}>
      <div className="bet-hd">
        <Dices size={13} />
        <b>{r.type}</b>
        {r.task && <span className="bet-task">«{r.task}»</span>}
        <span className="bet-time">
          {r.result
            ? `працював ${took(r.end! - r.start)}`
            : r.open
              ? `ставки ще ${clock(r.start + BET_WINDOW_MS - now)}`
              : `ставки закрито · працює ${clock(now - r.start)}`}
        </span>
      </div>
      <div className="bet-choices" role="group" aria-label={`скільки працюватиме ${r.type}`}>
        {CHOICES.map((c) => {
          const by = r.picks.filter(([, p]) => p.choice === c.id);
          const cls = [r.mine === c.id && "mine", r.result === c.id && "won"].filter(Boolean).join(" ");
          return (
            <button key={c.id} className={cls} disabled={!r.open} onClick={() => onPick(c.id)}>
              <span>{c.label}</span>
              {by.length > 0 && <small>{by.map(([b, p]) => who(b, p.name)).join(", ")}</small>}
            </button>
          );
        })}
      </div>
      {r.result && (
        <div className="bet-res">
          {winners.length ? `вгадали: ${winners.map(([b, p]) => who(b, p.name)).join(", ")}` : "ніхто не вгадав"}
        </div>
      )}
    </div>
  );
}

/** «Ставки»: one row per subagent run that is open for guesses or has guesses riding on it. */
export default function BetStrip({
  rounds,
  self,
  now,
  onPick,
}: {
  rounds: BetRound[];
  self: string;
  now: number;
  onPick: (round: string, c: ChoiceId) => void;
}) {
  if (!rounds.length) return null;
  return (
    <div className="bets" aria-live="polite">
      {rounds.slice(-3).map((r) => (
        <Row key={r.id} r={r} self={self} now={now} onPick={(c) => onPick(r.id, c)} />
      ))}
    </div>
  );
}
