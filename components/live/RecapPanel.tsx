"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Image as ImageIcon, Play, Share2, X } from "lucide-react";
import { captureStill } from "@/components/cafe/clip";
import { Ui, enPlural, useTr, useUi } from "@/lib/i18n";
import { agentColor } from "@/lib/live/liveModel";
import { HourRow, TokenSum, dailyActions, startOfLocalDay, streak, summarize } from "@/lib/live/recap";
import { MemberLimits } from "@/lib/live/usage";
import { drawDayCard } from "./dayCard";
import { LimitsFull } from "./Limits";
import { fmtTokens } from "./tokens";

const WEEKDAY: Record<Ui, string[]> = {
  uk: ["нд", "пн", "вт", "ср", "чт", "пт", "сб"],
  en: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
};

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

function Bars({
  items,
  color,
  total,
  name = (k) => k,
}: {
  items: [string, number][];
  color?: (k: string) => string;
  /** shows each bar as compact tokens and its share of this total */
  total?: number;
  /** how a key reads on its bar */
  name?: (k: string) => string;
}) {
  const ui = useUi();
  const t = useTr();
  if (!items.length) return <p className="alerts-hint">{t("поки порожньо", "nothing yet")}</p>;
  const max = items[0][1];
  return (
    <div className="recap-bars">
      {items.map(([k, n]) => (
        <div className="recap-bar" key={k} style={{ ["--c" as string]: color?.(k) ?? "#7c5cff" } as React.CSSProperties}>
          <span className="recap-bar-k">{name(k)}</span>
          <span className="recap-bar-track">
            <span style={{ width: `${Math.max(4, (n / max) * 100)}%` }} />
          </span>
          <span className="recap-bar-n">{total == null ? n : `${fmtTokens(n, ui)} · ${pct(n, total)}%`}</span>
        </div>
      ))}
    </div>
  );
}

function Tokens({ t, team }: { t: TokenSum; team: boolean }) {
  const ui = useUi();
  const tx = useTr();
  if (!t.total) {
    return (
      <p className="alerts-hint">
        {tx(
          "Токени рахує хук Agent Lounge наприкінці кожної відповіді й кожного агента. Онови підключення на сторінці підключення (нова фраза або оновлення плагіна), і після першої відповіді вони з'являться тут.",
          "The Agent Lounge hook counts tokens at the end of every answer and every agent. Update your connection on the connect page (a new phrase or a plugin update), and they'll show up here after the first answer.",
        )}
      </p>
    );
  }
  const parts: [string, number, string][] = [
    [tx("вихід", "output"), t.out, "#ffd25a"],
    [tx("вхід", "input"), t.in, "#ff9a62"],
    [tx("запис у кеш", "cache write"), t.cw, "#b98cff"],
    [tx("читання з кешу", "cache read"), t.cr, "#5ce1ff"],
  ];
  /** an agent with no type is counted as «агент», the same key the database trigger uses */
  const agentName = (k: string) => (k === "агент" ? tx("агент", "agent") : k);
  return (
    <>
      <div className="tok-sum">
        <b>{fmtTokens(t.total, ui)}</b>
        <span>
          {tx(
            `токенів сьогодні · з них ${pct(t.cr, t.total)}% читання з кешу: Claude перечитує вже збережений контекст`,
            `tokens today · ${pct(t.cr, t.total)}% of them cache reads: Claude rereads context it already saved`,
          )}
        </span>
      </div>
      <div className="tok-split" aria-label={tx("з чого складаються токени", "what the tokens are made of")}>
        {parts.map(([k, n, c]) =>
          n > 0 ? <span key={k} style={{ width: `${Math.max(0.6, (n / t.total) * 100)}%`, background: c }} title={`${k}: ${fmtTokens(n, ui)}`} /> : null,
        )}
      </div>
      <div className="tok-legend">
        {parts.map(([k, n, c]) => (
          <span key={k}>
            <i style={{ background: c }} />
            {k} {fmtTokens(n, ui)} · {pct(n, t.total)}%
          </span>
        ))}
      </div>
      <div className="recap-cols">
        <section>
          <div className="share-ttl">{tx("за агентами", "by agent")}</div>
          <Bars items={t.agents} color={agentColor} total={t.total} name={agentName} />
        </section>
        <section>
          <div className="share-ttl">{tx("за чатами", "by chat")}</div>
          <Bars items={t.chats} color={() => "#ff9a62"} total={t.total} />
        </section>
        {team && t.members.length > 0 && (
          <section>
            <div className="share-ttl">{tx("за учасниками", "by teammate")}</div>
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
  const ui = useUi();
  const t = useTr();
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

  const date = new Date(now).toLocaleDateString(ui === "en" ? "en-GB" : "uk-UA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const peak = Math.max(1, ...week.map((d) => d.actions));

  const makeCard = async () => {
    if (!day) return;
    setMaking(true);
    try {
      const scene = await Promise.race([captureStill(), new Promise<null>((r) => setTimeout(() => r(null), 800))]).catch(() => null);
      const blob = await drawDayCard({ day, streak: days, date, scene, site: location.host, ui });
      setCard({ url: URL.createObjectURL(blob), file: new File([blob], `relay-day-${today}.png`, { type: "image/png" }) });
    } finally {
      setMaking(false);
    }
  };
  const canShare = !!card && typeof navigator.canShare === "function" && navigator.canShare({ files: [card.file] });

  return (
    <div className="recap-backdrop" onClick={onClose}>
      <div
        className="recap"
        role="dialog"
        aria-label={t("підсумок дня", "day recap")}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="recap-hd">
          <div>
            <div className="recap-ttl">{t("Підсумок дня", "Day recap")}</div>
            <div className="muted-sm">{date}</div>
          </div>
          <button className="btn recap-x" onClick={onClose} aria-label={t("закрити", "close")}>
            <X size={15} />
          </button>
        </div>

        {error && (
          <p className="key-paste-bad">
            {t(
              "Не вдалося дістати підсумок, спробую ще раз за хвилину.",
              "Couldn't load the recap, I'll try again in a minute.",
            )}
          </p>
        )}
        {!day ? (
          !error && <p className="alerts-hint">{t("рахую…", "counting…")}</p>
        ) : (
          <>
            <div className="recap-grid">
              {(
                [
                  [t("питань", enPlural(day.prompts, "question", "questions")), day.prompts],
                  [t("дій інструментами", enPlural(day.tools, "tool action", "tool actions")), day.tools],
                  [
                    t("доручень агентам", enPlural(day.dispatches, "handoff to agents", "handoffs to agents")),
                    day.dispatches,
                  ],
                  [t("хвилин роботи", enPlural(day.minutes, "minute of work", "minutes of work")), day.minutes],
                  [t("чатів", enPlural(day.chats, "chat", "chats")), day.chats],
                  [t("днів поспіль", enPlural(days, "day in a row", "days in a row")), days],
                ] as [string, number][]
              ).map(([k, v]) => (
                <div className="recap-stat" key={k}>
                  <b>{v}</b>
                  <span>{k}</span>
                </div>
              ))}
            </div>

            <div className="recap-week" aria-label={t("дії за тиждень", "actions this week")}>
              {week.map((d) => (
                <div
                  className={`recap-day ${d.day === today ? "on" : ""}`}
                  key={d.day}
                  title={t(
                    `${d.actions} дій, ${d.prompts} питань`,
                    `${d.actions} ${enPlural(d.actions, "action", "actions")}, ${d.prompts} ${enPlural(d.prompts, "question", "questions")}`,
                  )}
                >
                  <span className="recap-col">
                    <span style={{ height: `${(d.actions / peak) * 100}%` }} />
                  </span>
                  <span className="recap-dl">{WEEKDAY[ui][new Date(d.day).getDay()]}</span>
                </div>
              ))}
            </div>

            <div className="recap-cols">
              <section>
                <div className="share-ttl">{t("Агенти", "Agents")}</div>
                <Bars items={day.agents} color={agentColor} />
              </section>
              <section>
                <div className="share-ttl">{t("Інструменти", "Tools")}</div>
                <Bars items={day.tools_by} />
              </section>
              <section>
                <div className="share-ttl">{t("Проєкти", "Projects")}</div>
                <Bars items={day.projects} color={() => "#ff9a62"} />
              </section>
            </div>

            <section className="recap-sec">
              <div className="share-ttl">{t("Токени", "Tokens")}</div>
              <Tokens t={day.tokens} team={team} />
            </section>

            <section className="recap-sec">
              <div className="share-ttl">{t("Ліміти підписки", "Subscription limits")}</div>
              <LimitsFull limits={limits} now={now} team={team} />
            </section>

            <div className="recap-actions">
              <button className="btn" onClick={onReplay} disabled={!canReplay}>
                <Play size={13} /> {t("програти цей чат у 10×", "replay this chat at 10×")}
              </button>
              <button className="btn" onClick={makeCard} disabled={making}>
                <ImageIcon size={13} /> {making ? t("малюю…", "drawing…") : t("картка дня", "day card")}
              </button>
            </div>

            {card && (
              <div className="recap-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={card.url} alt={t("картка дня", "day card")} />
                <div className="share-actions">
                  <a className="btn" href={card.url} download={card.file.name}>
                    <Download size={13} /> {t("завантажити PNG", "download PNG")}
                  </a>
                  {canShare && (
                    <button className="btn" onClick={() => navigator.share({ files: [card.file] }).catch(() => {})}>
                      <Share2 size={13} /> {t("поділитися", "share")}
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
