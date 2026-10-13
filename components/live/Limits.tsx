"use client";

import { CSSProperties } from "react";
import { memberName } from "@/lib/live/teamModel";
import { MemberLimits, WindowNow, windowNow } from "@/lib/live/usage";

const WEEKDAY = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];
const STALE_MS = 6 * 3600 * 1000;

function at(t: number, now: number): string {
  const d = new Date(t);
  const hm = d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const diff = Math.floor((t - day.getTime()) / 86400000);
  if (diff === 0) return `о ${hm}`;
  if (diff === 1) return `завтра о ${hm}`;
  return `${WEEKDAY[d.getDay()]} о ${hm}`;
}

function left(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return `${m} хв`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} год ${m % 60} хв`;
  return `${Math.floor(h / 24)} дн ${h % 24} год`;
}

const tone = (pct: number) => (pct >= 90 ? "hot" : pct >= 70 ? "warm" : "ok");

/** Two thin gauges for the top bar; the full picture lives in the day recap. */
export function LimitsMini({ limits, now, onOpen }: { limits: MemberLimits | null; now: number; onOpen: () => void }) {
  if (!limits) return null;
  const rows: [string, WindowNow | null][] = [
    ["5 год", windowNow(limits.limits.five, now)],
    ["тиждень", windowNow(limits.limits.week, now)],
  ];
  const title = rows
    .filter(([, w]) => w)
    .map(([k, w]) => `${k}: ${Math.round(w!.pct)}%, скинеться ${at(w!.reset, now)}`)
    .join("\n");
  return (
    <button className="limits-mini" onClick={onOpen} title={title}>
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
  if (!w) return null;
  return (
    <div className={`limit lm-${tone(w.pct)}`} style={{ "--p": `${w.pct}%` } as CSSProperties}>
      <div className="limit-hd">
        <b>{label}</b>
        <span>
          використано <b>{Math.round(w.pct)}%</b> · лишилось {Math.max(0, 100 - Math.round(w.pct))}%
        </span>
      </div>
      <div className="limit-track">
        <span />
      </div>
      <div className="limit-ft">
        {w.rolled
          ? `скинувся ${at(w.reset, now)}, вікно почалось заново`
          : `скинеться ${at(w.reset, now)}, через ${left(w.reset - now)}`}
      </div>
    </div>
  );
}

/** The 5-hour and weekly windows of each teammate's subscription, as Claude Code's status line last saw them. */
export function LimitsFull({ limits, now, team }: { limits: MemberLimits[]; now: number; team: boolean }) {
  if (!limits.length) {
    return (
      <p className="alerts-hint">
        Ліміти підписки (5 годин і тиждень) Claude Code показує лише в статус-рядку терміналу. Увімкни статус-рядок Relay
        на сторінці підключення, і після наступної відповіді тут буде, скільки використано, скільки лишилось і коли
        скинеться. У десктоп-застосунку Claude статус-рядок не запускається, тож ліміти приходять лише з терміналу.
      </p>
    );
  }
  return (
    <div className="limits">
      {limits.map((m) => {
        const seen = m.limits.at * 1000;
        return (
          <div className="limits-who" key={m.member}>
            {team && <div className="limits-name">{memberName(m.member)}</div>}
            <Gauge label="5 годин" w={windowNow(m.limits.five, now)} now={now} />
            <Gauge label="тиждень" w={windowNow(m.limits.week, now)} now={now} />
            {now - seen > STALE_MS && <p className="alerts-hint">дані {at(seen, now)}, відтоді Claude ще не відповідав</p>}
          </div>
        );
      })}
    </div>
  );
}
