import { MockRun } from "./mockRun";
import { snakeLayout, Layout, Point } from "./layout";

/** coordinate-space width the diagram is drawn in; height comes from the layout */
export const STAGE_W = 920;

/** diagram layout for N agents (serpentine, centered) */
export function diagramLayout(n: number): Layout {
  return snakeLayout(n, { width: STAGE_W, stepX: 220, marginY: 120, rowStep: 200, bottomMargin: 120, maxCols: 4 });
}

export type NodeState = "idle" | "active" | "incoming" | "done";

export interface StageState {
  packet: Point;
  nodeStates: NodeState[];
  activeIndex: number;
  travelFrom: number | null;
  travelTo: number | null;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Derives everything the stage needs to draw from the current replay clock. */
export function getStageState(clock: number, run: MockRun): StageState {
  const { timings } = run;
  const n = timings.length;
  const wp = diagramLayout(n).points;
  const nodeStates: NodeState[] = new Array(n).fill("idle");
  let packet: Point = { ...wp[0] };
  let activeIndex = -1;
  let travelFrom: number | null = null;
  let travelTo: number | null = null;

  for (let i = 0; i < n; i++) if (clock >= timings[i].end) nodeStates[i] = "done";

  for (let i = 0; i < n; i++) {
    const tm = timings[i];
    if (clock >= tm.start && clock < tm.end) {
      nodeStates[i] = "active";
      activeIndex = i;
      packet = { ...wp[i] };
      break;
    }
    if (tm.travelStart != null && tm.travelEnd != null && clock >= tm.travelStart && clock < tm.travelEnd) {
      const e = ease((clock - tm.travelStart) / (tm.travelEnd - tm.travelStart));
      packet = { x: wp[i].x + (wp[i + 1].x - wp[i].x) * e, y: wp[i].y + (wp[i + 1].y - wp[i].y) * e };
      nodeStates[i] = "done";
      nodeStates[i + 1] = "incoming";
      travelFrom = i;
      travelTo = i + 1;
      break;
    }
  }

  if (clock >= timings[n - 1].end) {
    nodeStates[n - 1] = "done";
    packet = { ...wp[n - 1] };
  }

  return { packet, nodeStates, activeIndex, travelFrom, travelTo };
}
