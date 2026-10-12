import { MockRun } from "@/lib/mockRun";
import { AgentDef, AgentEvent } from "@/lib/types";
import { CafeLayout, GIVE_MS, SIT_MS, STAND_MS, WALK_PX_PER_MS, handoffPath, pathLength } from "./layout";
import { Point } from "@/lib/layout";

export type BubbleTone = "work" | "done" | "handoff" | "error" | "alert";

export interface Stint {
  start: number;
  /** Infinity while the agent is still working */
  end: number;
}

export interface Note {
  key: string;
  ts: number;
  text: string;
  tool?: string;
  tone: BubbleTone;
}

export interface TripRequest {
  key: string;
  from: number;
  to: number;
  ts: number;
  label: string;
}

export interface Trip extends TripRequest {
  path: Point[];
  back: Point[];
  len: number;
  /** leaves the chair */
  start: number;
  /** packet lands on the target desk */
  arrive: number;
  /** back in the chair */
  home: number;
  /** walking-speed multiplier: walkers hurry when they are running behind */
  pace: number;
}

export interface CafeModel {
  agents: AgentDef[];
  stints: Stint[][];
  notes: Note[][];
  trips: Trip[];
  /** live feeds keep the last bubble of a finished agent up only for a while */
  doneHoldMs: number;
  /** seats the desks — the same seed always gives the same room */
  seed: number;
}

const MAX_HURRY = 3;
const HURRY_PER_MS = 1 / 4000;

export function tripTiming(len: number, pace = 1) {
  const walk = len / WALK_PX_PER_MS;
  return { out: Math.round((STAND_MS + walk + GIVE_MS) / pace), back: Math.round((walk + SIT_MS) / pace) };
}

/**
 * One person cannot be in two places: a walker's trips run back to back, in request order.
 * A walker whose queue has fallen behind real time hurries, so a live café never drifts far from the session.
 */
export function scheduleTrips(reqs: TripRequest[], lay: CafeLayout, basePace = 1): Trip[] {
  const free = new Map<number, number>();
  return [...reqs]
    .sort((a, b) => a.ts - b.ts)
    .map((r) => {
      const path = handoffPath(lay, r.from, r.to);
      const len = pathLength(path);
      const start = Math.max(r.ts, free.get(r.from) ?? -Infinity);
      const pace = basePace * Math.min(MAX_HURRY, 1 + (start - r.ts) * HURRY_PER_MS);
      const { out, back } = tripTiming(len, pace);
      const trip: Trip = { ...r, path, back: [...path].reverse(), len, start, arrive: start + out, home: start + out + back, pace };
      free.set(r.from, trip.home);
      return trip;
    });
}

function noteOf(e: AgentEvent): Note | null {
  switch (e.type) {
    case "start":
      return { key: e.id, ts: e.ts, text: e.payload?.label ?? e.agent_role ?? "береться до роботи", tone: "work" };
    case "thinking":
      return { key: e.id, ts: e.ts, text: e.payload?.summary ?? "думає…", tone: "work" };
    case "tool_call":
      return { key: e.id, ts: e.ts, text: e.payload?.summary ?? "працює", tool: e.payload?.tool, tone: "work" };
    case "complete":
      return {
        key: e.id,
        ts: e.ts,
        text: e.payload?.tokens ? `готово ✓ · ${e.payload.tokens} ток.` : "готово ✓",
        tone: "done",
      };
    case "error":
      return { key: e.id, ts: e.ts, text: e.payload?.summary ?? "помилка", tone: "error" };
    case "handoff":
      return null;
  }
}

export function modelFromRun(run: MockRun, lay: CafeLayout, seed: number): CafeModel {
  const index = new Map(run.agents.map((a, i) => [a.id, i]));
  const notes: Note[][] = run.agents.map(() => []);
  const reqs: TripRequest[] = [];
  for (const e of run.events) {
    const i = index.get(e.agent_id);
    if (i == null) continue;
    if (e.type === "handoff") {
      const to = e.to_agent != null ? index.get(e.to_agent) : undefined;
      if (to == null) continue;
      const label = e.payload?.label ?? "передає далі";
      reqs.push({ key: e.id, from: i, to, ts: e.ts, label: `${label} → ${run.agents[to].name}` });
      continue;
    }
    const n = noteOf(e);
    if (n) notes[i].push(n);
  }
  return {
    agents: run.agents,
    stints: run.timings.map((t) => [{ start: t.start, end: t.end }]),
    notes,
    trips: scheduleTrips(reqs, lay),
    doneHoldMs: Infinity,
    seed,
  };
}
