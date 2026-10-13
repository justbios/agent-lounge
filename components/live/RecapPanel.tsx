"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Image as ImageIcon, Play, Share2, X } from "lucide-react";
import { captureStill } from "@/components/cafe/clip";
import { agentColor } from "@/lib/live/liveModel";
import { HourRow, dailyActions, startOfLocalDay, streak, summarize } from "@/lib/live/recap";
import { drawDayCard } from "./dayCard";

const WEEKDAY = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];

function Bars({ items, color }: { items: [string, number][]; color?: (k: string) => string }) {
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
          <span className="recap-bar-n">{n}</span>
        </div>
      ))}
    </div>
  );
}

export default function RecapPanel({
  rows,
  error,
  now,
  canReplay,
  onReplay,
  onClose,
}: {
  rows: HourRow[] | null;
  error: boolean;
  now: number;
  canReplay: boolean;
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
