"use client";

import { useEffect, useRef } from "react";
import { AgentDef, AgentEvent } from "@/lib/types";
import { MockRun } from "@/lib/mockRun";

function fmt(ts: number): string {
  return `${(ts / 1000).toFixed(1)}s`;
}

function message(e: AgentEvent, agents: AgentDef[]): string {
  switch (e.type) {
    case "start":
      return `старт · ${e.payload?.label ?? ""}`;
    case "tool_call":
      return `${e.payload?.tool}()  ${e.payload?.summary ?? ""}`;
    case "complete":
      return `готово · ${e.payload?.tokens ?? 0} ток.`;
    case "handoff": {
      const to = agents.find((a) => a.id === e.to_agent);
      return `→ ${to?.name ?? e.to_agent}: ${e.payload?.label ?? ""}`;
    }
    default:
      return e.type;
  }
}

export default function ActivityLog({ run, clock, cycle }: { run: MockRun; clock: number; cycle: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = run.events.filter((e) => e.ts <= clock);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible.length, cycle]);

  return (
    <div className="card">
      <div className="card-hd">
        <span className="card-ttl">потік подій</span>
        <span className="muted-sm">run #{cycle}</span>
      </div>
      <div className="log" ref={ref}>
        {visible.map((e) => {
          const a = run.agents.find((x) => x.id === e.agent_id);
          return (
            <div className="log-row" key={`${cycle}-${e.id}`}>
              <span className="log-time">{fmt(e.ts)}</span>
              <span className="log-dot" style={{ background: a?.color }} />
              <span className="log-nm" style={{ color: a?.color }}>
                {a?.name}
              </span>
              <span className="log-msg">{message(e, run.agents)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
