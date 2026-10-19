"use client";

import { useMemo, useState } from "react";
import { Ui, enPlural, useTr, useUi } from "@/lib/i18n";
import { ProgressDay, localDay } from "@/lib/live/achievements";
import { QUEST_BEANS, QUEST_MIN, baristas, weekQuest } from "@/lib/live/quest";
import { plural } from "./format";

const locale = (ui: Ui) => (ui === "en" ? "en-GB" : "uk-UA");
const short = (d: string, ui: Ui) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(locale(ui), { day: "numeric", month: "short" });

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
  const ui = useUi();
  const t = useTr();
  const n = (v: number) => v.toLocaleString(locale(ui));
  const [today] = useState(() => localDay(Date.now()));
  const q = useMemo(() => weekQuest(days, today), [days, today]);
  const board = useMemo(() => (members ? baristas(members, today) : []), [members, today]);
  const met = q.done >= q.goal;
  const pct = Math.min(100, Math.round((q.done / q.goal) * 100));

  return (
    <>
      <div className="share-ttl">{t("Тиждень", "Week")}</div>
      <div className={`quest ${met ? "met" : ""}`}>
        <div className="quest-hd">
          <b>{met ? t("✓ Квест тижня виконано", "✓ Weekly quest done") : t("Квест тижня", "Weekly quest")}</b>
          <span className="muted-sm">
            {short(q.from, ui)} – {short(q.to, ui)}
          </span>
        </div>
        <span className="quest-text">
          {t(
            `${members ? "Уся команда разом" : "Кафе"}: ${n(q.goal)} ${plural(q.goal, "дія", "дії", "дій")} агентів за тиждень. Нагорода: +${QUEST_BEANS} ☕ ${members ? "кожній кімнаті" : "кафе"}.`,
            `${members ? "The whole team together" : "The café"}: ${n(q.goal)} agent ${enPlural(q.goal, "action", "actions")} this week. Reward: +${QUEST_BEANS} ☕ ${members ? "for each room" : "for the café"}.`,
          )}
        </span>
        <div className="quest-bar" role="progressbar" aria-valuemin={0} aria-valuemax={q.goal} aria-valuenow={q.done}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <span className="muted-sm">
          {t(`${n(q.done)} з ${n(q.goal)}`, `${n(q.done)} of ${n(q.goal)}`)}
          {!met && t(` · лишилось ${n(q.goal - q.done)}`, ` · ${n(q.goal - q.done)} to go`)}
        </span>
      </div>
      {board.length > 1 && (
        <>
          <div className="quest-hd barista-hd">
            <b>{t(`☕ Бариста тижня: ${board[0].name}`, `☕ Barista of the week: ${board[0].name}`)}</b>
          </div>
          <ol className="barista">
            {board.map((b) => (
              <li key={b.name}>
                <span>{b.name}</span>
                <span className="muted-sm">
                  {t(
                    `${n(b.work)} ${plural(b.work, "дія", "дії", "дій")}`,
                    `${n(b.work)} ${enPlural(b.work, "action", "actions")}`,
                  )}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="alerts-hint">
        {t(
          `Дія — це питання до Claude чи виклик інструмента. Мета тижня на десяту частину більша за звичайний тиждень кафе за останній місяць, але не менша за ${QUEST_MIN}.`,
          `An action is a question to Claude or a tool call. The weekly goal is a tenth above the café's usual week over the last month, but never below ${QUEST_MIN}.`,
        )}
        {members &&
          t(
            " Таблицю бачать лише ті, хто може відкрити це кафе.",
            " Only people who can open this café see this board.",
          )}
      </p>
    </>
  );
}
