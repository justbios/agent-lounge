"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Users, Activity, Hash } from "lucide-react";
import { cafeLayout } from "@/lib/cafe/layout";
import { CafeModel } from "@/lib/cafe/model";
import { AgentView, agentView, buildTimeline } from "@/lib/cafe/timeline";
import { CLAUDE_COLOR, buildLiveModel, listSessions, sessionRoster } from "@/lib/live/liveModel";
import { LiveEvent } from "@/lib/live/types";
import { LiveFeed } from "@/lib/live/useLiveFeed";
import CafeScene from "./cafe/CafeScene";

const LOG_ROWS = 120;
const PICK_KEY = "relay.session";
const RECENT_MS = 6 * 60 * 60 * 1000;
const ACTIVE_MS = 90 * 1000;
const NONE: string[] = [];
const NO_EVENTS: LiveEvent[] = [];

const EMPTY: CafeModel = {
  agents: [{ id: "main", name: "Claude", role: "головна сесія", color: CLAUDE_COLOR, icon: "bot", look: 2 }],
  stints: [[]],
  notes: [[]],
  trips: [],
  doneHoldMs: 0,
  seed: 4242,
};

function readPick(): string | null {
  try {
    return typeof window === "undefined" ? null : localStorage.getItem(PICK_KEY);
  } catch {
    return null;
  }
}

function savePick(id: string) {
  try {
    localStorage.setItem(PICK_KEY, id);
  } catch {}
}

function useRoster(cwd: string | undefined): string[] {
  const [roster, setRoster] = useState<{ cwd: string; agents: string[] } | null>(null);
  useEffect(() => {
    if (!cwd) return;
    let live = true;
    fetch(`/api/roster?cwd=${encodeURIComponent(cwd)}`)
      .then((r) => (r.ok ? r.json() : { agents: [] }))
      .then((d: { agents: string[] }) => live && setRoster({ cwd, agents: d.agents ?? [] }))
      .catch(() => live && setRoster({ cwd, agents: [] }));
    return () => {
      live = false;
    };
  }, [cwd]);
  return roster && roster.cwd === cwd ? roster.agents : NONE;
}

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
      return `${e.tool ?? "питання"} ${e.text ?? ""}`;
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

export default function LiveDashboard({ feed, cloud, hasKey }: { feed: LiveFeed; cloud: boolean; hasKey: boolean }) {
  const [pick, setPick] = useState<string | null>(readPick);
  const choose = (id: string) => {
    setPick(id);
    savePick(id);
  };
  const now = useNow();
  const sessions = useMemo(() => listSessions(feed.events), [feed.events]);
  const session = (pick && sessions.find((s) => s.id === pick)) || sessions[0] || null;
  const tabs = sessions.filter((s) => s === session || (!s.ended && now - s.last < RECENT_MS));
  const sent = useMemo(() => (session ? sessionRoster(feed.events, session.id) : null), [feed.events, session]);
  const disk = useRoster(cloud ? undefined : session?.cwd);
  const roster = sent ?? disk;

  const scene = useMemo(
    () => (session ? buildLiveModel(feed.events, session.id, roster) : null),
    [feed.events, session, roster],
  );
  const model = scene?.model ?? EMPTY;
  const clock = scene && now ? now - scene.origin : 0;
  const lay = useMemo(() => cafeLayout(model.agents.length, model.seed), [model]);
  const tl = useMemo(() => buildTimeline(model), [model]);
  const views = model.agents.map((_, i) => agentView(model, tl, lay, i, clock));
  const working = views.filter((v) => v.screen === "work").length;

  const log = useMemo(
    () =>
      session ? feed.events.filter((e) => e.session === session.id && e.kind !== "roster").slice(-LOG_ROWS) : NO_EVENTS,
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
  const unplugged = cloud && !hasKey;
  const pill = feed.status === "open" ? "на зв'язку" : unplugged ? "ще не підключено" : offline ? (cloud ? "немає зв'язку" : "Relay-сервер не запущений") : "підключаюсь…";

  return (
    <>
      <div className="statbar live-bar">
        <span className={`live-pill ${feed.status === "open" ? "on" : offline ? "off" : ""}`}>
          <span className={`feed-dot feed-${feed.status}`} />
          {pill}
        </span>
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

      {tabs.length > 0 && (
        <nav className="chat-tabs" aria-label="чати Claude Code">
          {tabs.map((s) => (
            <button key={s.id} className={`chat-tab ${s === session ? "on" : ""}`} onClick={() => choose(s.id)} title={s.cwd}>
              <span className="chat-tab-hd">
                <span className={`chat-dot ${now - s.last < ACTIVE_MS ? "busy" : ""}`} />
                <span className="chat-tab-nm">{s.label}</span>
                <span className="chat-tab-ago">{ago(now - s.last)}</span>
              </span>
              <span className="chat-tab-ask">{s.ask ?? "питань ще не було"}</span>
            </button>
          ))}
        </nav>
      )}

      <section className="card stage-card">
        <div className="card-hd">
          <span className="card-ttl">{session ? session.label : "інтернет-кафе"}</span>
          <span className="muted-sm">{session ? `остання дія ${ago(now - session.last)}` : "чекаю на події"}</span>
        </div>
        <div className="stage-pad stage-rel">
          <CafeScene model={model} clock={clock} />
          {!session && (
            <div className="cafe-wait">
              <b>{unplugged ? "Твій Claude ще не підключений" : offline ? pill : "Чекаю на твого Claude…"}</b>
              {cloud ? (
                unplugged ? (
                  <>
                    Одна фраза своєму Claude Code, і тут сядуть твої агенти: <Link href="/connect">підключити Claude</Link>.
                  </>
                ) : (
                  <>
                    Щойно Claude Code в будь-якому чаті щось зробить, агенти сядуть за столи. Хук ще не стоїть? Дивись{" "}
                    <Link href="/connect">підключити Claude</Link>.
                  </>
                )
              ) : offline ? (
                <>
                  Наживо показує агентів з Relay на твоєму комп&apos;ютері. Ще не стоїть? Віддай одну фразу своєму
                  Claude: <Link href="/connect">підключити Claude</Link>. Вже стоїть: <code>npm run up</code> у папці
                  Relay і відкрий <a href="http://127.0.0.1:3737">127.0.0.1:3737</a>.
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
            <span className="muted-sm">
              {model.agents.length} за столами{roster.length ? ` · ${roster.length} з .claude/agents` : ""}
            </span>
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
        {cloud ? (
          <>
            Наживо: хук Claude Code шле сюди короткі описи дій під твоїм особистим ключем. Бачиш їх лише ти, зберігаються
            добу, і хук не витрачає токенів.
          </>
        ) : (
          <>
            Наживо: кожну дію твого Claude Code хук шле на локальний Relay (<code>127.0.0.1:3737</code>). Події не
            виходять з цього комп&apos;ютера, і хук не витрачає токенів.
          </>
        )}{" "}
        Головний Claude сидить за першим столом. Доручаючи задачу, він несе її субагенту, а той, закінчивши, приносить
        результат назад.
      </p>
    </>
  );
}
