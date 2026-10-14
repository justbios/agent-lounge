"use client";

import { useMemo, useState } from "react";
import { ProgressDay, localDay } from "@/lib/live/achievements";
import { QUEST_BEANS, QUEST_MIN, baristas, weekQuest } from "@/lib/live/quest";
import { plural } from "./format";

const short = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
const n = (v: number) => v.toLocaleString("uk-UA");

/**
 * The café's shared goal for this week and, in a team café, who of the team got the most done: seen only by those who
 * can open the café.
 */
export default function WeekQuest({
  days,
  members,
}: {
  days: ProgressDay[];
  members: Record<string, ProgressDay[]> | null;
}) {
  const [today] = useState(() => localDay(Date.now()));
  const q = useMemo(() => weekQuest(days, today), [days, today]);
  const board = useMemo(() => (members ? baristas(members, today) : []), [members, today]);
  const met = q.done >= q.goal;
  const pct = Math.min(100, Math.round((q.done / q.goal) * 100));

  return (
    <>
      <div className="share-ttl">Тиждень</div>
      <div className={`quest ${met ? "met" : ""}`}>
        <div className="quest-hd">
          <b>{met ? "✓ Квест тижня виконано" : "Квест тижня"}</b>
          <span className="muted-sm">
            {short(q.from)} – {short(q.to)}
          </span>
        </div>
        <span className="quest-text">
          {members ? "Уся команда разом" : "Кафе"}: {n(q.goal)} {plural(q.goal, "дія", "дії", "дій")} агентів за
          тиждень. Нагорода: +{QUEST_BEANS} ☕ {members ? "кожній кімнаті" : "кафе"}.
        </span>
        <div className="quest-bar" role="progressbar" aria-valuemin={0} aria-valuemax={q.goal} aria-valuenow={q.done}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <span className="muted-sm">
          {n(q.done)} з {n(q.goal)}
          {!met && ` · лишилось ${n(q.goal - q.done)}`}
        </span>
      </div>
      {board.length > 1 && (
        <>
          <div className="quest-hd barista-hd">
            <b>☕ Бариста тижня: {board[0].name}</b>
          </div>
          <ol className="barista">
            {board.map((b) => (
              <li key={b.name}>
                <span>{b.name}</span>
                <span className="muted-sm">
                  {n(b.work)} {plural(b.work, "дія", "дії", "дій")}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="alerts-hint">
        Дія — це питання до Claude чи виклик інструмента. Мета тижня на десяту частину більша за звичайний тиждень кафе
        за останній місяць, але не менша за {QUEST_MIN}.
        {members && " Таблицю бачать лише ті, хто може відкрити це кафе."}
      </p>
    </>
  );
}
