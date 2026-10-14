"use client";

import { useMemo, useState } from "react";
import { ProgressDay } from "@/lib/live/achievements";
import { currentStreak, heatWeeks, localToday } from "@/lib/live/streak";
import { plural } from "./format";

const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("uk-UA", { day: "numeric", month: "long" });

/** The days with agents at work, GitHub style, and the run of them that reaches today. */
export default function DaysMap({ days }: { days: ProgressDay[] }) {
  const [today] = useState(() => localToday(Date.now()));
  const weeks = useMemo(() => heatWeeks(days, today), [days, today]);
  const s = useMemo(() => currentStreak(days, today), [days, today]);

  return (
    <>
      <div className="share-ttl">Дні</div>
      <div className="days-streak">
        <b>
          🔥 {s.days} {plural(s.days, "день", "дні", "днів")} поспіль
        </b>
        <span className="muted-sm">
          {s.freezeLeft ? "❄️ заморозка цього тижня є" : "❄️ заморозку цього тижня використано"}
        </span>
      </div>
      <p className="alerts-hint">
        День рахується, якщо хоч один агент щось зробив. Один пропущений день на тиждень серію не обриває: його
        заморожує ❄️.
        {s.frozen.length > 0 && ` Заморожено: ${s.frozen.map(dayLabel).join(", ")}.`}
        {s.days > 0 && !s.today && " Сьогодні агенти ще не працювали."}
      </p>
      <div className="days-map" role="img" aria-label={`дні роботи агентів, серія ${s.days}`}>
        {weeks.flat().map((c) => (
          <span
            key={c.day}
            className={`days-cell l${c.level} ${c.future ? "future" : ""} ${s.frozen.includes(c.day) ? "frozen" : ""}`}
            title={c.future ? undefined : `${dayLabel(c.day)}: ${c.work ? `${c.work} ${plural(c.work, "дія", "дії", "дій")}` : "без роботи"}`}
          />
        ))}
      </div>
      <div className="days-legend muted-sm">
        менше
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className={`days-cell l${l}`} />
        ))}
        більше
      </div>
    </>
  );
}
