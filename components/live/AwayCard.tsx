"use client";

import { Coffee, X } from "lucide-react";
import { Ui, enPlural, tr, useTr, useUi } from "@/lib/i18n";
import { Away } from "@/lib/live/away";
import { fmtTokens } from "./tokens";

function span(ms: number, ui: Ui): string {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return tr(ui, `${m} хв`, `${m} min`);
  const h = Math.floor(m / 60);
  if (h >= 24) return tr(ui, `${Math.floor(h / 24)} дн ${h % 24} год`, `${Math.floor(h / 24)} d ${h % 24} h`);
  return m % 60 ? tr(ui, `${h} год ${m % 60} хв`, `${h} h ${m % 60} min`) : tr(ui, `${h} год`, `${h} h`);
}

const num = (n: number, ui: Ui) => n.toLocaleString(ui === "en" ? "en-GB" : "uk-UA");
const tokens = (n: number, ui: Ui) => fmtTokens(n, ui);

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
  const ui = useUi();
  const t = useTr();
  const facts = [
    away.prompts > 0 && [t("питань", enPlural(away.prompts, "question", "questions")), num(away.prompts, ui)],
    away.answers > 0 && [t("відповідей", enPlural(away.answers, "answer", "answers")), num(away.answers, ui)],
    away.dispatches > 0 && [
      t("доручень агентам", enPlural(away.dispatches, "handoff to an agent", "handoffs to agents")),
      num(away.dispatches, ui),
    ],
    away.tools > 0 && [t("дій інструментами", enPlural(away.tools, "tool action", "tool actions")), num(away.tools, ui)],
    away.fails > 0 && [t("невдалих", "failed"), num(away.fails, ui)],
    away.tokens > 0 && [t("токенів", enPlural(away.tokens, "token", "tokens")), tokens(away.tokens, ui)],
  ].filter((f): f is [string, string] => !!f);

  return (
    <div className="notice away" role="status">
      <div className="away-hd">
        <b>
          <Coffee size={14} />{" "}
          {t(`Поки тебе не було, ${span(now - away.since, ui)}`, `While you were away (${span(now - away.since, ui)})`)}
        </b>
        <button className="btn btn-ic" onClick={onClose} aria-label={t("сховати", "hide")}>
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
        <p>
          {t("Найбільше працювали:", "Busiest:")}{" "}
          {away.agents.map(([a, n]) => `${a || t("агент", "agent")} ×${n}`).join(", ")}.
        </p>
      )}
      {away.people.length > 0 && (
        <p>
          {t("Питали:", "Questions from:")} {away.people.map(([p, n]) => `${p} ${n}`).join(", ")}.
        </p>
      )}
      {away.waiting.length > 0 && (
        <div className="away-wait">
          <span>{t("Чекають на тебе:", "Waiting for you:")}</span>
          {away.waiting.map((s) => (
            <button key={s.id} className="btn" onClick={() => onOpen(s.id)}>
              {s.attn?.kind === "ask" ? "❓" : "✓"} {s.label}
            </button>
          ))}
        </div>
      )}
      {away.partial && (
        <p className="muted-sm">
          {t(
            "Кафе пам'ятає не всі події з того часу, тож могло бути й більше.",
            "The café doesn't remember everything since then, so there may have been more.",
          )}
        </p>
      )}
    </div>
  );
}
