"use client";

import { Coffee, X } from "lucide-react";
import { Away } from "@/lib/live/away";
import { fmtTokens } from "./tokens";

function span(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `${m} хв`;
  const h = Math.floor(m / 60);
  if (h >= 24) return `${Math.floor(h / 24)} дн ${h % 24} год`;
  return m % 60 ? `${h} год ${m % 60} хв` : `${h} год`;
}

const num = (n: number) => n.toLocaleString("uk-UA");

/** What happened while the café was off screen, with the chats now waiting on the user one click away. */
export default function AwayCard({
  away,
  now,
  onOpen,
  onClose,
}: {
  away: Away;
  now: number;
  onOpen: (session: string) => void;
  onClose: () => void;
}) {
  const facts = [
    away.prompts > 0 && ["питань", num(away.prompts)],
    away.answers > 0 && ["відповідей", num(away.answers)],
    away.dispatches > 0 && ["доручень агентам", num(away.dispatches)],
    away.tools > 0 && ["дій інструментами", num(away.tools)],
    away.fails > 0 && ["невдалих", num(away.fails)],
    away.tokens > 0 && ["токенів", fmtTokens(away.tokens)],
  ].filter((f): f is [string, string] => !!f);

  return (
    <div className="notice away" role="status">
      <div className="away-hd">
        <b>
          <Coffee size={14} /> Поки тебе не було, {span(now - away.since)}
        </b>
        <button className="btn btn-ic" onClick={onClose} aria-label="сховати">
          <X size={14} />
        </button>
      </div>
      {facts.length > 0 && (
        <ul className="away-facts">
          {facts.map(([k, v]) => (
            <li key={k}>
              <b>{v}</b> {k}
            </li>
          ))}
        </ul>
      )}
      {away.agents.length > 0 && (
        <p>Найбільше працювали: {away.agents.map(([a, n]) => `${a} ×${n}`).join(", ")}.</p>
      )}
      {away.people.length > 0 && (
        <p>Питали: {away.people.map(([p, n]) => `${p} ${n}`).join(", ")}.</p>
      )}
      {away.waiting.length > 0 && (
        <div className="away-wait">
          <span>Чекають на тебе:</span>
          {away.waiting.map((s) => (
            <button key={s.id} className="btn" onClick={() => onOpen(s.id)}>
              {s.attn?.kind === "ask" ? "❓" : "✓"} {s.label}
            </button>
          ))}
        </div>
      )}
      {away.partial && (
        <p className="muted-sm">Кафе пам&apos;ятає не всі події з того часу, тож могло бути й більше.</p>
      )}
    </div>
  );
}
