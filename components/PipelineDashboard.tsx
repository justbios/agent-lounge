"use client";

import { useMemo, useState } from "react";
import { Radio, Play, Pause, RotateCcw, Zap, Package, Coins, Layers, Coffee, GitBranch, Plug } from "lucide-react";
import { AGENTS, AgentDef } from "@/lib/types";
import { buildMockRun } from "@/lib/mockRun";
import { useReplay } from "@/lib/useReplay";
import { getStageState } from "@/lib/stage";
import { cafeLayout, cafeTravelMs } from "@/lib/cafe/layout";
import PipelineStage from "./PipelineStage";
import CafeScene from "./cafe/CafeScene";
import ActivityLog from "./ActivityLog";
import AgentRoster from "./AgentRoster";

const XP_PER_HANDOFF = 18;
const XP_PER_LEVEL = 120;
const CAFE_TAIL_MS = 2600;

const byId = Object.fromEntries(AGENTS.map((a) => [a.id, a]));
const MINI: AgentDef[] = [byId.intake, byId.planner, byId.coder, byId.deployer];
const EXTRA: AgentDef[] = [
  { id: "security", name: "Security", role: "аудит безпеки", color: "#f87171", icon: "eye", workMs: 1800, tool: "scan", work: "шукає вразливості", handoff: "віддає звіт", tokens: 900 },
  { id: "docs", name: "Docs", role: "пише доки", color: "#a3e635", icon: "clipboard", workMs: 1500, tool: "write_docs", work: "оновлює документацію", handoff: "передає доки", tokens: 640 },
  { id: "perf", name: "Perf", role: "оптимізує", color: "#2dd4bf", icon: "cpu", workMs: 1700, tool: "profile", work: "профілює й прискорює", handoff: "віддає метрики", tokens: 720 },
  { id: "release", name: "Release", role: "реліз-менеджер", color: "#c084fc", icon: "rocket", workMs: 1400, tool: "tag_release", work: "готує реліз-ноти", handoff: "дає добро", tokens: 500 },
];
const BIG: AgentDef[] = [...AGENTS.slice(0, 7), ...EXTRA, AGENTS[7]];

const PRESETS: Record<string, AgentDef[]> = {
  "8 · повний": AGENTS,
  "4 · міні": MINI,
  "12 · макс": BIG,
};

export default function PipelineDashboard() {
  const [preset, setPreset] = useState("8 · повний");
  const [view, setView] = useState<"game" | "diagram">("game");
  const run = useMemo(() => {
    const agents = PRESETS[preset];
    const lay = cafeLayout(agents.length);
    return buildMockRun(agents, "run_demo", { travelMs: (i) => cafeTravelMs(lay, i), tailMs: CAFE_TAIL_MS });
  }, [preset]);
  const { clock, cycle, playing, speed, setPlaying, setSpeed, restart } = useReplay(run.totalMs);

  const n = run.agents.length;
  const fullRunTokens = useMemo(
    () => run.events.filter((e) => e.type === "complete").reduce((s, e) => s + (e.payload?.tokens ?? 0), 0),
    [run],
  );

  const handoffsThisCycle = run.events.filter((e) => e.type === "handoff" && e.ts <= clock).length;
  const tokensThisCycle = run.events
    .filter((e) => e.type === "complete" && e.ts <= clock)
    .reduce((s, e) => s + (e.payload?.tokens ?? 0), 0);

  const delivered = (cycle - 1) * (n - 1) + handoffsThisCycle;
  const totalTokens = (cycle - 1) * fullRunTokens + tokensThisCycle;
  const xp = delivered * XP_PER_HANDOFF;
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const xpInLevel = xp % XP_PER_LEVEL;

  const st = getStageState(clock, run);
  const activeIdx = st.travelFrom != null ? st.travelFrom : st.activeIndex >= 0 ? st.activeIndex : 0;
  const active = run.agents[activeIdx];
  const activeLabel = st.travelFrom != null ? `${active.name} → передача` : `${active.name} · ${active.role}`;

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="brand-badge">
            <Radio size={20} />
          </span>
          <div>
            <div className="brand-name">Relay</div>
            <div className="brand-sub">живий конвеєр агентів</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a className="btn" href="/connect">
            <Plug size={14} /> підключити Claude
          </a>
          <span className="live">
            <span className="live-dot" />
            replay · демо
          </span>
        </div>
      </header>

      <div className="statbar">
        <span className="level-pill">
          <Zap size={14} /> рівень {level}
        </span>
        <div className="xp">
          <div className="xp-track">
            <div className="xp-fill" style={{ width: `${(xpInLevel / XP_PER_LEVEL) * 100}%` }} />
          </div>
          <span className="xp-num">
            {xpInLevel} / {XP_PER_LEVEL} xp
          </span>
        </div>

        <span className="stat-sep" />
        <div className="stat">
          <span className="stat-k">
            <Package size={11} style={{ display: "inline", verticalAlign: "-1px", marginRight: 4 }} />
            передач
          </span>
          <span className="stat-v">{delivered}</span>
        </div>
        <div className="stat">
          <span className="stat-k">
            <Coins size={11} style={{ display: "inline", verticalAlign: "-1px", marginRight: 4 }} />
            токенів
          </span>
          <span className="stat-v">{totalTokens.toLocaleString("uk-UA")}</span>
        </div>
        <div className="stat">
          <span className="stat-k">
            <Layers size={11} style={{ display: "inline", verticalAlign: "-1px", marginRight: 4 }} />
            цикл
          </span>
          <span className="stat-v">{cycle}</span>
        </div>

        <div className="controls">
          <select className="preset" value={preset} onChange={(e) => setPreset(e.target.value)} aria-label="розмір пайплайну">
            {Object.keys(PRESETS).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={() => setPlaying(!playing)}>
            {playing ? <Pause size={15} /> : <Play size={15} />}
            {playing ? "пауза" : "грати"}
          </button>
          <button className="btn" onClick={restart} aria-label="почати спочатку">
            <RotateCcw size={15} />
          </button>
          <span className="speed">
            <input type="range" min={0.5} max={4} step={0.5} value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))} />
            <span className="speed-val">{speed}x</span>
          </span>
        </div>
      </div>

      <section className="card stage-card">
        <div className="card-hd">
          <div className="viewseg">
            <button className={view === "game" ? "on" : ""} onClick={() => setView("game")}>
              <Coffee size={13} /> кафе
            </button>
            <button className={view === "diagram" ? "on" : ""} onClick={() => setView("diagram")}>
              <GitBranch size={13} /> схема
            </button>
          </div>
          <span className="hd-active">
            <span className="dot" style={{ background: active.color, boxShadow: `0 0 10px ${active.color}` }} />
            <span style={{ color: active.color }}>{activeLabel}</span>
          </span>
        </div>
        <div className="stage-pad">
          {view === "game" ? <CafeScene run={run} clock={clock} /> : <PipelineStage run={run} clock={clock} />}
        </div>
      </section>

      <div className="grid-2">
        <ActivityLog run={run} clock={clock} cycle={cycle} />
        <AgentRoster run={run} clock={clock} />
      </div>

      <p className="foot">
        Це <strong>replay</strong>-демо. Перемкни <strong>розмір пайплайну</strong> вгорі — і схема, і інтернет-кафе
        самі розставлять будь-яке N агентів. У проді список агентів (назви, ролі, порядок) приходить із подій твого Claude
        через <code>agent_events</code> + Supabase Realtime — нічого хардкодити.
      </p>
    </div>
  );
}
