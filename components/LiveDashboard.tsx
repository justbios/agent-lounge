"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Users, Activity, Hash } from "lucide-react";
import { cafeLayout } from "@/lib/cafe/layout";
import { CafeModel } from "@/lib/cafe/model";
import { AgentView, agentView, buildTimeline } from "@/lib/cafe/timeline";
import { CLAUDE_COLOR, buildLiveModel, listSessions } from "@/lib/live/liveModel";
import { LiveEvent } from "@/lib/live/types";
import { LiveFeed } from "@/lib/live/useLiveFeed";
import CafeScene from "./cafe/CafeScene";

const AUTO = "auto";
const LOG_ROWS = 120;

const EMPTY: CafeModel = {
  agents: [{ id: "main", name: "Claude", role: "головна сесія", color: CLAUDE_COLOR, icon: "bot", look: 2 }],
  stints: [[]],
  notes: [[]],
  trips: [],
  doneHoldMs: 0,
  seed: 4242,
};

function useNow(): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return now;
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} с тому`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} хв тому`;
  return `${Math.round(m / 60)} год тому`;
}

function clockTime(at: number): string {
  return new Date(at).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function badge(v: AgentView, carrying: boolean): { cls: string; text: string } {
  if (v.walker) return { cls: "rr-active", text: carrying ? "несе" : "вертається" };
  if (v.screen === "work") return { cls: "rr-active", text: "працює" };
  if (v.screen === "incoming") return { cls: "rr-active", text: "приймає" };
  if (v.screen === "done") return { cls: "rr-done", text: "готово" };
  return { cls: "rr-idle", text: "чекає" };
}

function logText(e: LiveEvent): string {
  switch (e.kind) {
    case "prompt":
      return `питання ${e.text ?? ""}`;
    case "dispatch":
      return `→ ${e.target}: ${e.text ?? ""}`;
    case "sub_start":
      return "старт";
    case "sub_stop":
      return "готово, несе результат";
    case "stop":
      return "відповів";
    case "session_end":
      return "сесію закрито";
    default:
      return e.text ?? e.kind;
  }
}

export default function LiveDashboard({ feed }: { feed: LiveFeed }) {
  const [pick, setPick] = useState(AUTO);
  const now = useNow();
  const sessions = useMemo(() => listSessions(feed.events), [feed.events]);
  const session = (pick !== AUTO && sessions.find((s) => s.id === pick)) || sessions[0] || null;

  const scene = useMemo(() => (session ? buildLiveModel(feed.events, session.id) : null), [feed.events, session]);
  const model = scene?.model ?? EMPTY;
  const clock = scene && now ? now - scene.origin : 0;
  const lay = useMemo(() => cafeLayout(model.agents.length, model.seed), [model]);
  const tl = useMemo(() => buildTimeline(model), [model]);
  const views = model.agents.map((_, i) => agentView(model, tl, lay, i, clock));
  const working = views.filter((v) => v.screen === "work").length;

  const log = useMemo(
    () => (session ? feed.events.filter((e) => e.session === session.id).slice(-LOG_ROWS) : []),
    [feed.events, session],
  );
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);

  const nameOf = (e: LiveEvent) => {
    if (!e.agent) return { name: "Claude", color: CLAUDE_COLOR };
    const a = model.agents[scene?.seatOf[e.agent] ?? -1];
    return { name: a?.name ?? e.agentType ?? "агент", color: a?.color ?? "#9a94b8" };
  };

  const offline = feed.status === "offline";

  return (
    <>
      <div className="statbar live-bar">
        <span className={`live-pill ${feed.status === "open" ? "on" : offline ? "off" : ""}`}>
          <span className={`feed-dot feed-${feed.status}`} />
          {feed.status === "open" ? "на зв'язку" : offline ? "Relay-сервер не запущений" : "підключаюсь…"}
        </span>
        {sessions.length > 0 && (
          <select className="preset session-sel" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="сесія Claude Code">
            <option value={AUTO}>авто · найсвіжіша сесія</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} · {ago(now - s.last)}
                {s.ended ? " · закрита" : ""}
              </option>
            ))}
          </select>
        )}
        <span className="stat-sep" />
        <div className="stat">
          <span className="stat-k">
            <Users size={11} style={{ display: "inline", verticalAlign: "-1px", marginRight: 4 }} />
            агентів
          </span>
          <span className="stat-v">{model.agents.length}</span>
        </div>
        <div className="stat">
          <span className="stat-k">
            <Activity size={11} style={{ display: "inline", verticalAlign: "-1px", marginRight: 4 }} />
            зараз працюють
          </span>
          <span className="stat-v">{working}</span>
        </div>
        <div className="stat">
          <span className="stat-k">
            <Hash size={11} style={{ display: "inline", verticalAlign: "-1px", marginRight: 4 }} />
            подій
          </span>
          <span className="stat-v">{session?.count ?? 0}</span>
        </div>
      </div>

      <section className="card stage-card">
        <div className="card-hd">
          <span className="card-ttl">{session ? session.label : "інтернет-кафе"}</span>
          <span className="muted-sm">{session ? `остання дія ${ago(now - session.last)}` : "чекаю на події"}</span>
        </div>
        <div className="stage-pad stage-rel">
          <CafeScene model={model} clock={clock} />
          {!session && (
            <div className="cafe-wait">
              <b>{offline ? "Relay-сервер не запущений" : "Чекаю на твого Claude…"}</b>
              {offline ? (
                <>
                  Наживо працює з локального сервера: у папці проєкту запусти <code>npm run live</code> і відкрий{" "}
                  <code>localhost:3737</code>.
                </>
              ) : (
                <>
                  Сервер слухає. Щойно Claude Code в будь-якій сесії щось зробить, агенти сядуть за столи. Хук ще не
                  стоїть? Дивись <Link href="/connect">підключити Claude</Link>.
                </>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="grid-2">
        <div className="card">
          <div className="card-hd">
            <span className="card-ttl">потік подій</span>
            <span className="muted-sm">{log.length ? `останні ${log.length}` : "порожньо"}</span>
          </div>
          <div className="log" ref={logRef}>
            {log.map((e) => {
              const who = nameOf(e);
              return (
                <div className="log-row" key={e.seq}>
                  <span className="log-time">{clockTime(e.at)}</span>
                  <span className="log-dot" style={{ background: who.color }} />
                  <span className="log-nm" style={{ color: who.color }}>
                    {who.name}
                  </span>
                  <span className="log-msg">{logText(e)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-hd">
            <span className="card-ttl">агенти</span>
            <span className="muted-sm">{model.agents.length} за столами</span>
          </div>
          <div className="roster">
            {model.agents.map((a, i) => {
              const v = views[i];
              const b = badge(v, !!v.walker?.carrying || (v.walker?.give ?? -1) >= 0);
              const notes = model.notes[i];
              let last = "";
              for (const n of notes) {
                if (n.ts > clock) break;
                last = n.text;
              }
              return (
                <div className="rr" key={a.id} style={{ ["--c" as string]: a.color } as React.CSSProperties}>
                  <span className="rr-ic" style={{ fontSize: 12, fontWeight: 600 }}>
                    {a.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="rr-main">
                    <div className="rr-nm">{a.name}</div>
                    <div className="rr-note">{last || a.role}</div>
                  </div>
                  <span className={`rr-badge ${b.cls}`}>{b.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="foot">
        Наживо: кожну дію твого Claude Code хук шле на локальний Relay (<code>127.0.0.1:3737</code>). Події не йдуть ні
        в Supabase, ні на Vercel, і хук не витрачає токенів. Головний Claude сидить за першим столом. Доручаючи задачу,
        він несе її субагенту, а той, закінчивши, приносить результат назад.
      </p>
    </>
  );
}
