"use client";

import { CSSProperties } from "react";
import { Ui, tr, useTr, useUi } from "@/lib/i18n";
import { memberName } from "@/lib/live/teamModel";
import { MemberLimits, WindowNow, hitNow, windowNow } from "@/lib/live/usage";

const WEEKDAY: Record<Ui, string[]> = {
  uk: ["нд", "пн", "вт", "ср", "чт", "пт", "сб"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};
const STALE_MS = 6 * 3600 * 1000;

function at(t: number, now: number, ui: Ui): string {
  const d = new Date(t);
  const hm = d.toLocaleTimeString(ui === "en" ? "en-GB" : "uk-UA", { hour: "2-digit", minute: "2-digit" });
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const diff = Math.floor((t - day.getTime()) / 86400000);
  if (diff === 0) return tr(ui, `о ${hm}`, `at ${hm}`);
  if (diff === 1) return tr(ui, `завтра о ${hm}`, `tomorrow at ${hm}`);
  return tr(ui, `${WEEKDAY.uk[d.getDay()]} о ${hm}`, `${WEEKDAY.en[d.getDay()]} at ${hm}`);
}

function left(ms: number, ui: Ui): string {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return tr(ui, `${m} хв`, `${m} min`);
  const h = Math.floor(m / 60);
  if (h < 24) return tr(ui, `${h} год ${m % 60} хв`, `${h} h ${m % 60} min`);
  return tr(ui, `${Math.floor(h / 24)} дн ${h % 24} год`, `${Math.floor(h / 24)} d ${h % 24} h`);
}

const tone = (pct: number) => (pct >= 90 ? "hot" : pct >= 70 ? "warm" : "ok");

/** Two thin gauges for the top bar, or a red «limit reached» once Claude runs into it; the rest is in the day recap. */
export function LimitsMini({ limits, now, onOpen }: { limits: MemberLimits | null; now: number; onOpen: () => void }) {
  const ui = useUi();
  const t = useTr();
  if (!limits) return null;
  const hit = hitNow(limits, now);
  const rows: [string, WindowNow | null][] = [
    [t("5 год", "5 h"), windowNow(limits.limits?.five, now)],
    [t("тиждень", "week"), windowNow(limits.limits?.week, now)],
  ];
  if (!hit && !rows.some(([, w]) => w)) return null;
  const title = [
    ...(hit ? [t(`Claude вперся в ліміт ${at(hit, now, ui)}`, `Claude hit the limit ${at(hit, now, ui)}`)] : []),
    ...rows
      .filter(([, w]) => w)
      .map(([k, w]) =>
        t(
          `${k}: ${Math.round(w!.pct)}%, скинеться ${at(w!.reset, now, ui)}`,
          `${k}: ${Math.round(w!.pct)}%, resets ${at(w!.reset, now, ui)}`,
        ),
      ),
  ].join("\n");
  return (
    <button className="limits-mini" onClick={onOpen} title={title}>
      {hit && <span className="lm-row lm-hot lm-hit">{t("ліміт вичерпано", "limit reached")}</span>}
      {rows.map(([k, w]) =>
        w ? (
          <span key={k} className={`lm-row lm-${tone(w.pct)}`}>
            <span className="lm-k">{k}</span>
            <span className="lm-track">
              <span style={{ width: `${w.pct}%` }} />
            </span>
            <span className="lm-v">{Math.round(w.pct)}%</span>
          </span>
        ) : null,
      )}
    </button>
  );
}

function Gauge({ label, w, now }: { label: string; w: WindowNow | null; now: number }) {
  const ui = useUi();
  const t = useTr();
  if (!w) return null;
  return (
    <div className={`limit lm-${tone(w.pct)}`} style={{ "--p": `${w.pct}%` } as CSSProperties}>
      <div className="limit-hd">
        <b>{label}</b>
        <span>
          {t("використано", "used")} <b>{Math.round(w.pct)}%</b> ·{" "}
          {t(`лишилось ${Math.max(0, 100 - Math.round(w.pct))}%`, `${Math.max(0, 100 - Math.round(w.pct))}% left`)}
        </span>
      </div>
      <div className="limit-track">
        <span />
      </div>
      <div className="limit-ft">
        {w.rolled
          ? t(`скинувся ${at(w.reset, now, ui)}, вікно почалось заново`, `reset ${at(w.reset, now, ui)}, a new window began`)
          : t(
              `скинеться ${at(w.reset, now, ui)}, через ${left(w.reset - now, ui)}`,
              `resets ${at(w.reset, now, ui)}, in ${left(w.reset - now, ui)}`,
            )}
      </div>
    </div>
  );
}

/** The 5-hour and weekly windows of each teammate's subscription, as Claude Code's status line last saw them. */
export function LimitsFull({ limits, now, team }: { limits: MemberLimits[]; now: number; team: boolean }) {
  const ui = useUi();
  const t = useTr();
  if (!limits.length) {
    return (
      <p className="alerts-hint">
        {t(
          "Відсотки лімітів підписки (5 годин і тиждень) Claude Code віддає лише своєму статус-рядку. Увімкни " +
            "статус-рядок Agent Lounge на сторінці підключення, і після наступної відповіді тут буде, скільки використано, " +
            "скільки лишилось і коли скинеться. Якщо статус-рядок не запускається (так буває в десктоп-застосунку), тут " +
            "однаково з'явиться «ліміт вичерпано», щойно Claude у нього впреться.",
          "Claude Code only gives its subscription limit percentages (5 hours and week) to its status line. Turn on " +
            "the Agent Lounge status line on the connect page, and after the next answer you'll see here how much is " +
            "used, how much is left and when it resets. If the status line doesn't run (it happens in the desktop " +
            "app), “limit reached” still shows up here as soon as Claude hits it.",
        )}
      </p>
    );
  }
  return (
    <div className="limits">
      {limits.map((m) => {
        const seen = (m.limits?.at ?? 0) * 1000;
        const hit = hitNow(m, now);
        return (
          <div className="limits-who" key={m.member}>
            {team && <div className="limits-name">{memberName(m.member, ui)}</div>}
            {hit && (
              <p className="limit-hit">
                {t(
                  `Claude вперся в ліміт підписки ${at(hit, now, ui)}. Коли він скинеться, Claude Code не каже: спробуй пізніше або глянь у терміналі.`,
                  `Claude hit the subscription limit ${at(hit, now, ui)}. Claude Code doesn't say when it resets: try later or check the terminal.`,
                )}
              </p>
            )}
            <Gauge label={t("5 годин", "5 hours")} w={windowNow(m.limits?.five, now)} now={now} />
            <Gauge label={t("тиждень", "week")} w={windowNow(m.limits?.week, now)} now={now} />
            {m.limits && now - seen > STALE_MS && (
              <p className="alerts-hint">
                {t(
                  `дані ${at(seen, now, ui)}, відтоді Claude ще не відповідав`,
                  `last update ${at(seen, now, ui)}, no answers from Claude since`,
                )}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
