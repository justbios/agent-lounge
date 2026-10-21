"use client";

import { CSSProperties, useEffect } from "react";
import { X } from "lucide-react";
import { Ui, tr, useTr, useUi } from "@/lib/i18n";
import { memberName } from "@/lib/live/teamModel";
import { Forecast, MemberLimits, WindowNow, forecast, hitNow, windowNow } from "@/lib/live/usage";
import { LimitReset, resetHint, resetTitle } from "@/lib/live/useLimitResets";

const WEEKDAY: Record<Ui, string[]> = {
  uk: ["нд", "пн", "вт", "ср", "чт", "пт", "сб"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};
const STALE_MS = 6 * 3600 * 1000;
/** the reset toast waits this long for you to come back before it goes */
const TOAST_MS = 15 * 60 * 1000;

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

type Which = "five" | "week";

/** Where the window is headed and at which pace: the last hour's, or the window's average so far. */
function forecastText(f: Forecast, m: MemberLimits, which: Which, now: number, ui: Ui): string {
  const pace = m.pace?.[which]?.recent
    ? tr(ui, "У темпі останньої години", "At the last hour's pace")
    : which === "five"
      ? tr(ui, "У середньому темпі цього вікна", "At this window's average pace")
      : tr(ui, "У темпі цього тижня", "At this week's pace");
  const reset = (m.limits?.[which]?.reset ?? 0) * 1000;
  if (f.out == null) {
    const n = Math.round(f.atReset);
    return tr(
      ui,
      `${pace} вистачить до скидання, буде близько ${n}%`,
      `${pace} it lasts until the reset, at about ${n}%`,
    );
  }
  if (f.out - now < 60_000) return tr(ui, `${pace} закінчиться ось-ось`, `${pace} it runs out any minute`);
  return tr(
    ui,
    `${pace} закінчиться ${at(f.out, now, ui)}, за ${left(reset - f.out, ui)} до скидання`,
    `${pace} it runs out ${at(f.out, now, ui)}, ${left(reset - f.out, ui)} before the reset`,
  );
}

/** The faint stretch after the used share: how far the window fills by its reset at this pace. */
function Ahead({ w, f }: { w: WindowNow; f: Forecast | null }) {
  if (!f) return null;
  return <i style={{ left: `${w.pct}%`, width: `${Math.max(0, f.atReset - w.pct)}%` }} />;
}

/** Two thin gauges for the top bar, or a red «limit reached» once Claude runs into it; the rest is in the day recap. */
export function LimitsMini({ limits, now, onOpen }: { limits: MemberLimits | null; now: number; onOpen: () => void }) {
  const ui = useUi();
  const t = useTr();
  if (!limits) return null;
  const hit = hitNow(limits, now);
  const rows = (
    [
      [t("5 год", "5 h"), "five"],
      [t("тиждень", "week"), "week"],
    ] as const
  ).map(([k, which]) => ({ k, which, w: windowNow(limits.limits?.[which], now), f: forecast(limits, which, now) }));
  if (!hit && !rows.some((r) => r.w)) return null;
  const title = [
    ...(hit ? [t(`Claude вперся в ліміт ${at(hit, now, ui)}`, `Claude hit the limit ${at(hit, now, ui)}`)] : []),
    ...rows
      .filter((r) => r.w)
      .map(({ k, which, w, f }) =>
        [
          w!.rolled
            ? t(`${k}: скинувся ${at(w!.reset, now, ui)}`, `${k}: reset ${at(w!.reset, now, ui)}`)
            : t(
                `${k}: ${Math.round(w!.pct)}%, скинеться ${at(w!.reset, now, ui)}`,
                `${k}: ${Math.round(w!.pct)}%, resets ${at(w!.reset, now, ui)}`,
              ),
          ...(f ? [forecastText(f, limits, which, now, ui)] : []),
        ].join(". "),
      ),
  ].join("\n");
  return (
    <button className="limits-mini" onClick={onOpen} title={title}>
      {hit && <span className="lm-row lm-hot lm-hit">{t("ліміт вичерпано", "limit reached")}</span>}
      {rows.map(({ k, w, f }) =>
        w ? (
          <span key={k} className={`lm-row lm-${tone(w.pct)}${f?.out ? " lm-out" : ""}`}>
            <span className="lm-k">{k}</span>
            <span className="lm-track">
              <span style={{ width: `${w.pct}%` }} />
              <Ahead w={w} f={f} />
            </span>
            <span className="lm-v">{Math.round(w.pct)}%</span>
          </span>
        ) : null,
      )}
    </button>
  );
}

function Gauge({ label, m, which, now }: { label: string; m: MemberLimits; which: Which; now: number }) {
  const ui = useUi();
  const t = useTr();
  const w = windowNow(m.limits?.[which], now);
  if (!w) return null;
  const f = forecast(m, which, now);
  return (
    <div
      className={`limit lm-${tone(w.pct)}${f?.out ? " lm-out" : ""}`}
      style={{ "--p": `${w.pct}%` } as CSSProperties}
    >
      <div className="limit-hd">
        <b>{label}</b>
        <span>
          {t("використано", "used")} <b>{Math.round(w.pct)}%</b> ·{" "}
          {t(`лишилось ${Math.max(0, 100 - Math.round(w.pct))}%`, `${Math.max(0, 100 - Math.round(w.pct))}% left`)}
        </span>
      </div>
      <div className="limit-track">
        <span />
        <Ahead w={w} f={f} />
      </div>
      <div className="limit-ft">
        {w.rolled
          ? t(
              `скинувся ${at(w.reset, now, ui)}, вікно почалось заново`,
              `reset ${at(w.reset, now, ui)}, a new window began`,
            )
          : t(
              `скинеться ${at(w.reset, now, ui)}, через ${left(w.reset - now, ui)}`,
              `resets ${at(w.reset, now, ui)}, in ${left(w.reset - now, ui)}`,
            )}
      </div>
      {f && <div className="limit-fc">{forecastText(f, m, which, now, ui)}</div>}
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
            <Gauge label={t("5 годин", "5 hours")} m={m} which="five" now={now} />
            <Gauge label={t("тиждень", "week")} m={m} which="week" now={now} />
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

/** A window that just started over: stays a while, since you may be waiting for exactly this. */
export function LimitToast({
  reset,
  onOpen,
  onDismiss,
}: {
  reset: LimitReset;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const ui = useUi();
  const t = useTr();
  useEffect(() => {
    const timer = setTimeout(onDismiss, TOAST_MS);
    return () => clearTimeout(timer);
  }, [reset, onDismiss]);
  return (
    <div className="ach-toast limit-toast" role="status">
      <span className="ach-icon" aria-hidden>
        🔋
      </span>
      <button className="ach-toast-body" onClick={onOpen}>
        <span className="ach-toast-k">{t("ліміт скинувся", "limit reset")}</span>
        <b>{resetTitle(reset, ui)}</b>
        <span className="ach-hint">{resetHint(reset, ui)}</span>
      </button>
      <button className="btn recap-x" onClick={onDismiss} aria-label={t("закрити", "close")}>
        <X size={14} />
      </button>
    </div>
  );
}
