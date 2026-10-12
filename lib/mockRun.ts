import { AGENTS, AgentDef, AgentEvent } from "./types";

export interface AgentTiming {
  index: number;
  start: number;
  end: number;
  travelStart: number | null;
  travelEnd: number | null;
}

export interface MockRun {
  runId: string;
  /** the agent list this run is built from — the single source of truth */
  agents: AgentDef[];
  totalMs: number;
  travelMs: number;
  timings: AgentTiming[];
  events: AgentEvent[];
}

const TRAVEL_MS = 720;

/**
 * Builds a deterministic replay from ANY agent list (any names, any count).
 * Deterministic (no Date/Math.random) so server and client render identically.
 */
export function buildMockRun(agents: AgentDef[] = AGENTS, runId = "run_demo"): MockRun {
  const timings: AgentTiming[] = [];
  const events: AgentEvent[] = [];
  let t = 0;
  let seq = 0;

  const push = (e: Omit<AgentEvent, "id" | "run_id" | "seq">) => {
    events.push({ id: `${runId}-${seq}`, run_id: runId, seq, ...e });
    seq += 1;
  };

  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    const workMs = a.workMs ?? 2000;
    const start = t;
    const end = t + workMs;
    t = end;

    const isLast = i === agents.length - 1;
    const travelStart = isLast ? null : t;
    const travelEnd = isLast ? null : t + TRAVEL_MS;
    if (!isLast) t = travelEnd as number;

    timings.push({ index: i, start, end, travelStart, travelEnd });

    push({ ts: start, agent_id: a.id, agent_role: a.role, type: "start", payload: { label: a.role } });
    push({
      ts: Math.round(start + workMs * 0.45),
      agent_id: a.id,
      type: "tool_call",
      payload: { tool: a.tool ?? `${a.id}_run`, summary: a.work ?? a.role },
    });
    push({ ts: end, agent_id: a.id, type: "complete", payload: { summary: a.work ?? a.role, tokens: a.tokens ?? 600 } });
    if (!isLast) {
      push({
        ts: travelStart as number,
        agent_id: a.id,
        type: "handoff",
        from_agent: a.id,
        to_agent: agents[i + 1].id,
        payload: { label: a.handoff ?? "передає далі" },
      });
    }
  }

  events.sort((x, y) => x.ts - y.ts || x.seq - y.seq);
  return { runId, agents, totalMs: t, travelMs: TRAVEL_MS, timings, events };
}
