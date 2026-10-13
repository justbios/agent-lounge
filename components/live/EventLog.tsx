"use client";

import { useEffect, useMemo, useRef } from "react";
import { CLAUDE_COLOR } from "@/lib/live/liveModel";
import { LiveEvent } from "@/lib/live/types";
import { AgentDef } from "@/lib/types";
import { clockTime, logText } from "./format";

const LOG_ROWS = 120;
const NO_EVENTS: LiveEvent[] = [];

export default function EventLog({
  events,
  session,
  agents,
  seatOf,
}: {
  events: LiveEvent[];
  session: string | null;
  agents: AgentDef[];
  seatOf?: Record<string, number>;
}) {
  const log = useMemo(
    () => (session ? events.filter((e) => e.session === session && e.kind !== "roster").slice(-LOG_ROWS) : NO_EVENTS),
    [events, session],
  );
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);

  const nameOf = (e: LiveEvent) => {
    if (!e.agent) return { name: "Claude", color: CLAUDE_COLOR };
    const a = agents[seatOf?.[e.agent] ?? -1];
    return { name: a?.name ?? e.agentType ?? "агент", color: a?.color ?? "#9a94b8" };
  };

  return (
    <div className="card">
      <div className="card-hd">
        <span className="card-ttl">потік подій</span>
        <span className="muted-sm">{log.length ? `останні ${log.length}` : "порожньо"}</span>
      </div>
      <div className="log" ref={ref}>
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
  );
}
