"use client";

import { useMemo, useState } from "react";
import { Ui, enPlural, tr, useTr, useUi } from "@/lib/i18n";
import { ProgressDay, localDay } from "@/lib/live/achievements";
import { currentStreak, heatWeeks } from "@/lib/live/streak";
import { plural } from "./format";

const dayLabel = (d: string, ui: Ui) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(ui === "en" ? "en-GB" : "uk-UA", { day: "numeric", month: "long" });

const actions = (n: number, ui: Ui) =>
  tr(ui, `${n} ${plural(n, "дія", "дії", "дій")}`, `${n} ${enPlural(n, "action", "actions")}`);

/** The days with agents at work, GitHub style, and the run of them that reaches today. */
export default function DaysMap({ days }: { days: ProgressDay[] }) {
  const ui = useUi();
  const t = useTr();
  const [today] = useState(() => localDay(Date.now()));
  const weeks = useMemo(() => heatWeeks(days, today), [days, today]);
  const s = useMemo(() => currentStreak(days, today), [days, today]);

  return (
    <>
      <div className="share-ttl">{t("Дні", "Days")}</div>
      <div className="days-streak">
        <b>
          {t(
            `🔥 ${s.days} ${plural(s.days, "день", "дні", "днів")} поспіль`,
            `🔥 ${s.days} ${enPlural(s.days, "day", "days")} in a row`,
          )}
        </b>
        <span className="muted-sm">
          {s.freezeLeft
            ? t("❄️ заморозка цього тижня є", "❄️ this week's freeze is ready")
            : t("❄️ заморозку цього тижня використано", "❄️ this week's freeze is used")}
        </span>
      </div>
      <p className="alerts-hint">
        {t(
          "День рахується, якщо хоч один агент щось зробив. Один пропущений день на тиждень серію не обриває: його заморожує ❄️.",
          "A day counts if at least one agent did something. One missed day a week doesn't break the streak: ❄️ freezes it.",
        )}
        {s.frozen.length > 0 &&
          t(
            ` Заморожено: ${s.frozen.map((d) => dayLabel(d, ui)).join(", ")}.`,
            ` Frozen: ${s.frozen.map((d) => dayLabel(d, ui)).join(", ")}.`,
          )}
        {s.days > 0 && !s.today && t(" Сьогодні агенти ще не працювали.", " The agents haven't worked yet today.")}
      </p>
      <div
        className="days-map"
        role="img"
        aria-label={t(`дні роботи агентів, серія ${s.days}`, `days the agents worked, streak ${s.days}`)}
      >
        {weeks.flat().map((c) => (
          <span
            key={c.day}
            className={`days-cell l${c.level} ${c.future ? "future" : ""} ${s.frozen.includes(c.day) ? "frozen" : ""}`}
            title={
              c.future
                ? undefined
                : `${dayLabel(c.day, ui)}: ${c.work ? actions(c.work, ui) : t("без роботи", "no work")}`
            }
          />
        ))}
      </div>
      <div className="days-legend muted-sm">
        {t("менше", "less")}
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`days-cell l${l}`} />
        ))}
        {t("більше", "more")}
      </div>
    </>
  );
}
