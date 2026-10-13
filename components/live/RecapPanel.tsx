"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Image as ImageIcon, Play, Share2, X } from "lucide-react";
import { captureStill } from "@/components/cafe/clip";
import { agentColor } from "@/lib/live/liveModel";
import { HourRow, TokenSum, dailyActions, startOfLocalDay, streak, summarize } from "@/lib/live/recap";
import { MemberLimits } from "@/lib/live/usage";
import { drawDayCard } from "./dayCard";
import { LimitsFull } from "./Limits";
import { fmtTokens } from "./tokens";

const WEEKDAY = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

function Bars({
  items,
  color,
  total,
}: {
  items: [string, number][];
  color?: (k: string) => string;
  /** shows each bar as compact tokens and its share of this total */
  total?: number;
}) {
  if (!items.length) return <p className="alerts-hint">поки порожньо</p>;
  const max = items[0][1];
  return (
    <div className="recap-bars">
      {items.map(([k, n]) => (
        <div className="recap-bar" key={k} style={{ ["--c" as string]: color?.(k) ?? "#7c5cff" } as React.CSSProperties}>
          <span className="recap-bar-k">{k}</span>
          <span className="recap-bar-track">
            <span style={{ width: `${Math.max(4, (n / max) * 100)}%` }} />
          </span>
          <span className="recap-bar-n">{total == null ? n : `${fmtTokens(n)} · ${pct(n, total)}%`}</span>
        </div>
      ))}
    </div>
  );
}

function Tokens({ t, team }: { t: TokenSum; team: boolean }) {
  if (!t.total) {
    return (
      <p className="alerts-hint">
        Токени рахує хук Relay наприкінці кожної відповіді й кожного агента. Онови підключення на сторінці підключення
        (нова фраза або оновлення плагіна), і після першої відповіді вони з&apos;являться тут.
      </p>
    );
  }
  const parts: [string, number, string][] = [
    ["вихід", t.out, "#ffd25a"],
    ["вхід", t.in, "#ff9a62"],
    ["запис у кеш", t.cw, "#b98cff"],
    ["читання з кешу", t.cr, "#5ce1ff"],
  ];
  return (
    <>
      <div className="tok-sum">
        <b>{fmtTokens(t.total)}</b>
        <span>
          токенів сьогодні · з них {pct(t.cr, t.total)}% читання з кешу: Claude перечитує вже збережений контекст
        </span>
      </div>
      <div className="tok-split" aria-label="з чого складаються токени">
        {parts.map(([k, n, c]) =>
          n > 0 ? <span key={k} style={{ width: `${Math.max(0.6, (n / t.total) * 100)}%`, background: c }} title={`${k}: ${fmtTokens(n)}`} /> : null,
        )}
      </div>
      <div className="tok-legend">
        {parts.map(([k, n, c]) => (
          <span key={k}>
            <i style={{ background: c }} />
            {k} {fmtTokens(n)} · {pct(n, t.total)}%
          </span>
        ))}
      </div>
      <div className="recap-cols">
        <section>
          <div className="share-ttl">за агентами</div>
          <Bars items={t.agents} color={agentColor} total={t.total} />
        </section>
        <section>
          <div className="share-ttl">за чатами</div>
          <Bars items={t.chats} color={() => "#ff9a62"} total={t.total} />
        </section>
        {team && t.members.length > 0 && (
          <section>
            <div className="share-ttl">за учасниками</div>
            <Bars items={t.members} color={() => "#5ce1ff"} total={t.total} />
          </section>
        )}
      </div>
    </>
  );
}

export default function RecapPanel({
  rows,
  error,
  now,
  canReplay,
  limits,
  team,
  onReplay,
  onClose,
}: {
  rows: HourRow[] | null;
  error: boolean;
  now: number;
  canReplay: boolean;
  limits: MemberLimits[];
  team: boolean;
  onReplay: () => void;
  onClose: () => void;
}) {
  const today = startOfLocalDay(now);
  const day = useMemo(() => (rows ? summarize(rows, today) : null), [rows, today]);
  const week = useMemo(() => (rows ? dailyActions(rows, now) : []), [rows, now]);
  const days = useMemo(() => (rows ? streak(rows, now) : 0), [rows, now]);
  const [card, setCard] = useState<{ url: string; file: File } | null>(null);
  const [making, setMaking] = useState(false);

  useEffect(() => () => void (card && URL.revokeObjectURL(card.url)), [card]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const date = new Date(now).toLocaleDateString("uk-UA", { weekday: "long", day: "numeric", month: "long" });
  const peak = Math.max(1, ...week.map((d) => d.actions));

  const makeCard = async () => {
    if (!day) return;
    setMaking(true);
    try {
      const scene = await Promise.race([captureStill(), new Promise<null>((r) => setTimeout(() => r(null), 800))]).catch(() => null);
      const blob = await drawDayCard({ day, streak: days, date, scene, site: location.host });
      setCard({ url: URL.createObjectURL(blob), file: new File([blob], `relay-day-${today}.png`, { type: "image/png" }) });
    } finally {
      setMaking(false);
    }
  };
  const canShare = !!card && typeof navigator.canShare === "function" && navigator.canShare({ files: [card.file] });

  return (
    <div className="recap-backdrop" onClick={onClose}>
      <div className="recap" role="dialog" aria-label="підсумок дня" onClick={(e) => e.stopPropagation()}>
        <div className="recap-hd">
          <div>
            <div className="recap-ttl">Підсумок дня</div>
            <div className="muted-sm">{date}</div>
          </div>
          <button className="btn recap-x" onClick={onClose} aria-label="закрити">
            <X size={15} />
          </button>
        </div>

        {error && <p className="key-paste-bad">Не вдалося дістати підсумок, спробую ще раз за хвилину.</p>}
        {!day ? (
          !error && <p className="alerts-hint">рахую…</p>
        ) : (
          <>
            <div className="recap-grid">
              {(
                [
                  ["питань", day.prompts],
                  ["дій інструментами", day.tools],
                  ["доручень агентам", day.dispatches],
                  ["хвилин роботи", day.minutes],
                  ["чатів", day.chats],
                  ["днів поспіль", days],
                ] as [string, number][]
              ).map(([k, v]) => (
                <div className="recap-stat" key={k}>
                  <b>{v}</b>
                  <span>{k}</span>
                </div>
              ))}
            </div>

            <div className="recap-week" aria-label="дії за тиждень">
              {week.map((d) => (
                <div className={`recap-day ${d.day === today ? "on" : ""}`} key={d.day} title={`${d.actions} дій, ${d.prompts} питань`}>
                  <span className="recap-col">
                    <span style={{ height: `${(d.actions / peak) * 100}%` }} />
                  </span>
                  <span className="recap-dl">{WEEKDAY[new Date(d.day).getDay()]}</span>
                </div>
              ))}
            </div>

            <div className="recap-cols">
              <section>
                <div className="share-ttl">Агенти</div>
                <Bars items={day.agents} color={agentColor} />
              </section>
              <section>
                <div className="share-ttl">Інструменти</div>
                <Bars items={day.tools_by} />
              </section>
              <section>
                <div className="share-ttl">Проєкти</div>
                <Bars items={day.projects} color={() => "#ff9a62"} />
              </section>
            </div>

            <section className="recap-sec">
              <div className="share-ttl">Токени</div>
              <Tokens t={day.tokens} team={team} />
            </section>

            <section className="recap-sec">
              <div className="share-ttl">Ліміти підписки</div>
              <LimitsFull limits={limits} now={now} team={team} />
            </section>

            <div className="recap-actions">
              <button className="btn" onClick={onReplay} disabled={!canReplay}>
                <Play size={13} /> програти цей чат у 10×
              </button>
              <button className="btn" onClick={makeCard} disabled={making}>
                <ImageIcon size={13} /> {making ? "малюю…" : "картка дня"}
              </button>
            </div>

            {card && (
              <div className="recap-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={card.url} alt="картка дня" />
                <div className="share-actions">
                  <a className="btn" href={card.url} download={card.file.name}>
                    <Download size={13} /> завантажити PNG
                  </a>
                  {canShare && (
                    <button className="btn" onClick={() => navigator.share({ files: [card.file] }).catch(() => {})}>
                      <Share2 size={13} /> поділитися
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
