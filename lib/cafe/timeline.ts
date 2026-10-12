import { Point } from "@/lib/layout";
import { MockRun } from "@/lib/mockRun";
import { AgentEvent } from "@/lib/types";
import {
  CafeLayout,
  Dir,
  GIVE_MS,
  SIT_MS,
  STAND_MS,
  WALK_PX_PER_MS,
  handoffPath,
  pathLength,
  pointAt,
} from "./layout";

export type ScreenMode = "idle" | "incoming" | "work" | "done";

export interface Walker {
  x: number;
  y: number;
  dir: Dir;
  moving: boolean;
  carrying: boolean;
  /** 0 = standing upright, 1 = still in the chair (stand-up / sit-down) */
  settle: number;
  /** -1 while walking, 0..1 while handing the packet over */
  give: number;
  target: number;
}

export interface AgentView {
  screen: ScreenMode;
  progress: number;
  walker: Walker | null;
}

export type BubbleTone = "work" | "done" | "handoff" | "error";

export interface Bubble {
  key: string;
  agent: number;
  x: number;
  y: number;
  text: string;
  tool?: string;
  tone: BubbleTone;
  age: number;
  seated: boolean;
}

export interface CafeTimeline {
  paths: Point[][];
  back: Point[][];
  lengths: number[];
  byAgent: AgentEvent[][];
}

const COMPLETE_HOLD_MS = 1000;

export function buildTimeline(run: MockRun, lay: CafeLayout): CafeTimeline {
  const paths = run.agents.slice(0, -1).map((_, i) => handoffPath(lay, i, i + 1));
  const index = new Map(run.agents.map((a, i) => [a.id, i]));
  const byAgent: AgentEvent[][] = run.agents.map(() => []);
  for (const e of run.events) {
    const i = index.get(e.agent_id);
    if (i != null) byAgent[i].push(e);
  }
  return { paths, back: paths.map((p) => [...p].reverse()), lengths: paths.map(pathLength), byAgent };
}

function walkerAt(run: MockRun, tl: CafeTimeline, lay: CafeLayout, i: number, clock: number): Walker | null {
  const tm = run.timings[i];
  if (tm.travelStart == null || tm.travelEnd == null || clock < tm.travelStart) return null;
  const path = tl.paths[i];
  const len = tl.lengths[i];
  const target = i + 1;
  const t = clock - tm.travelStart;

  if (clock < tm.travelEnd) {
    const walkMs = Math.max(1, tm.travelEnd - tm.travelStart - STAND_MS - GIVE_MS);
    if (t < STAND_MS) {
      const p = pointAt(path, 0);
      return { ...p, moving: false, carrying: true, settle: 1 - t / STAND_MS, give: -1, target };
    }
    if (t < STAND_MS + walkMs) {
      const p = pointAt(path, ((t - STAND_MS) / walkMs) * len);
      return { ...p, moving: true, carrying: true, settle: 0, give: -1, target };
    }
    const end = path[path.length - 1];
    const dir: Dir = lay.desks[target].x > end.x ? "right" : "left";
    const give = Math.min(1, (t - STAND_MS - walkMs) / GIVE_MS);
    return { x: end.x, y: end.y, dir, moving: false, carrying: false, settle: 0, give, target };
  }

  const back = clock - tm.travelEnd;
  const walkBack = len / WALK_PX_PER_MS;
  if (back < walkBack) {
    const p = pointAt(tl.back[i], back * WALK_PX_PER_MS);
    return { ...p, moving: true, carrying: false, settle: 0, give: -1, target };
  }
  if (back < walkBack + SIT_MS) {
    const seat = path[0];
    const dir: Dir = lay.desks[i].x > seat.x ? "right" : "left";
    return { x: seat.x, y: seat.y, dir, moving: false, carrying: false, settle: (back - walkBack) / SIT_MS, give: -1, target };
  }
  return null;
}

export function agentView(run: MockRun, tl: CafeTimeline, lay: CafeLayout, i: number, clock: number): AgentView {
  const tm = run.timings[i];
  const prev = i > 0 ? run.timings[i - 1] : null;
  let screen: ScreenMode = "idle";
  if (clock >= tm.end) screen = "done";
  else if (clock >= tm.start) screen = "work";
  else if (prev?.travelStart != null && clock >= prev.travelStart) screen = "incoming";
  const progress = screen === "work" ? (clock - tm.start) / Math.max(1, tm.end - tm.start) : screen === "done" ? 1 : 0;
  return { screen, progress, walker: walkerAt(run, tl, lay, i, clock) };
}

function describe(e: AgentEvent, run: MockRun): { text: string; tool?: string; tone: BubbleTone } {
  switch (e.type) {
    case "start":
      return { text: e.payload?.label ?? e.agent_role ?? "береться до роботи", tone: "work" };
    case "thinking":
      return { text: e.payload?.summary ?? "думає…", tone: "work" };
    case "tool_call":
      return { text: e.payload?.summary ?? "працює", tool: e.payload?.tool, tone: "work" };
    case "complete":
      return { text: e.payload?.tokens ? `готово ✓ · ${e.payload.tokens} ток.` : "готово ✓", tone: "done" };
    case "handoff": {
      const to = run.agents.find((a) => a.id === e.to_agent)?.name;
      const label = e.payload?.label ?? "передає далі";
      return { text: to ? `${label} → ${to}` : label, tone: "handoff" };
    }
    case "error":
      return { text: e.payload?.summary ?? "помилка", tone: "error" };
  }
}

export function bubbleFor(
  run: MockRun,
  tl: CafeTimeline,
  lay: CafeLayout,
  i: number,
  view: AgentView,
  clock: number,
): Bubble | null {
  const evs = tl.byAgent[i];
  let last: AgentEvent | null = null;
  for (const e of evs) {
    if (e.ts > clock) break;
    last = e;
  }
  if (!last) return null;

  const make = (e: AgentEvent, x: number, y: number, seated: boolean): Bubble => ({
    key: e.id,
    agent: i,
    x,
    y,
    age: clock - e.ts,
    seated,
    ...describe(e, run),
  });

  const tm = run.timings[i];
  const desk = lay.desks[i];
  const w = view.walker;
  if (w) {
    if (tm.travelEnd == null || clock >= tm.travelEnd) return null;
    const complete = evs.find((e) => e.type === "complete" && e.ts <= clock);
    const handoff = evs.find((e) => e.type === "handoff" && e.ts <= clock);
    const pick = complete && clock - complete.ts < COMPLETE_HOLD_MS ? complete : handoff;
    return pick ? make(pick, w.x, w.y - 21, false) : null;
  }
  if (last.type === "error") return make(last, desk.x, desk.top - 3, true);
  if (view.screen === "work") return make(last, desk.x, desk.top - 3, true);
  if (view.screen === "done" && i === run.agents.length - 1 && last.type === "complete") {
    return make(last, desk.x, desk.top - 3, true);
  }
  return null;
}
