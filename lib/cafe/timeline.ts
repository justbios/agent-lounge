import { BubbleTone, CafeModel, Note, Trip } from "./model";
import { CafeLayout, Dir, GIVE_MS, SIT_MS, STAND_MS, WALK_PX_PER_MS, pointAt } from "./layout";

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
  byFrom: Trip[][];
  byTo: Trip[][];
}

const COMPLETE_HOLD_MS = 1000;
const LOOP_PROGRESS_MS = 6000;

export function buildTimeline(m: CafeModel): CafeTimeline {
  const byFrom: Trip[][] = m.agents.map(() => []);
  const byTo: Trip[][] = m.agents.map(() => []);
  for (const tr of m.trips) {
    byFrom[tr.from]?.push(tr);
    byTo[tr.to]?.push(tr);
  }
  return { byFrom, byTo };
}

function currentTrip(trips: Trip[], clock: number): Trip | null {
  for (const tr of trips) {
    if (tr.start > clock) return null;
    if (clock < tr.home) return tr;
  }
  return null;
}

function walkerOn(tr: Trip, lay: CafeLayout, clock: number): Walker {
  const target = tr.to;
  const t = clock - tr.start;
  if (clock < tr.arrive) {
    const walkMs = Math.max(1, tr.arrive - tr.start - STAND_MS - GIVE_MS);
    if (t < STAND_MS) {
      const p = pointAt(tr.path, 0);
      return { ...p, moving: false, carrying: true, settle: 1 - t / STAND_MS, give: -1, target };
    }
    if (t < STAND_MS + walkMs) {
      const p = pointAt(tr.path, ((t - STAND_MS) / walkMs) * tr.len);
      return { ...p, moving: true, carrying: true, settle: 0, give: -1, target };
    }
    const end = tr.path[tr.path.length - 1];
    const dir: Dir = lay.desks[target].x > end.x ? "right" : "left";
    const give = Math.min(1, (t - STAND_MS - walkMs) / GIVE_MS);
    return { x: end.x, y: end.y, dir, moving: false, carrying: false, settle: 0, give, target };
  }
  const back = clock - tr.arrive;
  const walkBack = tr.len / WALK_PX_PER_MS;
  if (back < walkBack) {
    const p = pointAt(tr.back, back * WALK_PX_PER_MS);
    return { ...p, moving: true, carrying: false, settle: 0, give: -1, target };
  }
  const seat = tr.path[0];
  const dir: Dir = lay.desks[tr.from].x > seat.x ? "right" : "left";
  const settle = Math.min(1, (back - walkBack) / SIT_MS);
  return { x: seat.x, y: seat.y, dir, moving: false, carrying: false, settle, give: -1, target };
}

export function agentView(m: CafeModel, tl: CafeTimeline, lay: CafeLayout, i: number, clock: number): AgentView {
  const stints = m.stints[i];
  const working = stints.find((s) => s.start <= clock && clock < s.end);
  const incoming = tl.byTo[i].some((tr) => tr.start <= clock && clock < tr.arrive);
  const started = stints.some((s) => s.start <= clock);
  let screen: ScreenMode = "idle";
  if (working) screen = "work";
  else if (incoming) screen = "incoming";
  else if (started) screen = "done";

  let progress = screen === "done" ? 1 : 0;
  if (working) {
    progress = Number.isFinite(working.end)
      ? (clock - working.start) / Math.max(1, working.end - working.start)
      : ((clock - working.start) % LOOP_PROGRESS_MS) / LOOP_PROGRESS_MS;
  }
  const tr = currentTrip(tl.byFrom[i], clock);
  return { screen, progress, walker: tr ? walkerOn(tr, lay, clock) : null };
}

function lastNote(notes: Note[], clock: number): Note | null {
  let last: Note | null = null;
  for (const n of notes) {
    if (n.ts > clock) break;
    last = n;
  }
  return last;
}

export function bubbleFor(
  m: CafeModel,
  tl: CafeTimeline,
  lay: CafeLayout,
  i: number,
  view: AgentView,
  clock: number,
): Bubble | null {
  const last = lastNote(m.notes[i], clock);
  const desk = lay.desks[i];
  const seated = (n: Note): Bubble => ({
    key: n.key,
    agent: i,
    x: desk.x,
    y: desk.top - 3,
    text: n.text,
    tool: n.tool,
    tone: n.tone,
    age: clock - n.ts,
    seated: true,
  });

  const w = view.walker;
  if (w) {
    const tr = currentTrip(tl.byFrom[i], clock);
    if (!tr || clock >= tr.arrive) return null;
    const at = { agent: i, x: w.x, y: w.y - 21, seated: false };
    if (last && last.tone === "done" && clock - last.ts < COMPLETE_HOLD_MS) {
      return { ...at, key: last.key, text: last.text, tool: last.tool, tone: last.tone, age: clock - last.ts };
    }
    return { ...at, key: tr.key, text: tr.label, tone: "handoff", age: clock - tr.start };
  }

  if (!last) return null;
  if (last.tone === "error" || view.screen === "work") return seated(last);
  if (last.tone === "done" || last.tone === "alert") {
    const handedOff = tl.byFrom[i].some((tr) => tr.start >= last.ts && tr.start <= clock);
    if (!handedOff && clock - last.ts < m.doneHoldMs) return seated(last);
  }
  return null;
}
