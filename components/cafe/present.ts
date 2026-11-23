import { useMemo } from "react";
import { cafeLayout, handoffPath, pathLength } from "@/lib/cafe/layout";
import { CafeModel } from "@/lib/cafe/model";
import { AgentView } from "@/lib/cafe/timeline";
import { seatStatus } from "./frame";

/**
 * The desks worth drawing: Claude of the chat always, and anyone working, carrying work, asking you or just done.
 * Those resting stay in the agents list and come back to the room the moment they get work.
 */
export function presentSeats(
  model: CafeModel,
  views: AgentView[],
  clock: number,
  alert?: { agent: number; kind: "ask" | "done" },
): number[] {
  return model.agents.map((_, i) => i).filter((i) => i === 0 || seatStatus(model, views[i], i, clock, alert) !== "idle");
}

/** The room with only the desks in `keep` (indices into the full model), and the way from a full index to a desk. */
export function roomOf(model: CafeModel, keep: number[]): { model: CafeModel; seat: (i: number) => number } {
  if (keep.length === model.agents.length) return { model, seat: (i) => i };
  const at = new Map(keep.map((g, k) => [g, k]));
  const lay = cafeLayout(keep.length, model.seed);
  const trips = model.trips
    .filter((tr) => at.has(tr.from) && at.has(tr.to))
    .map((tr) => {
      const from = at.get(tr.from)!;
      const to = at.get(tr.to)!;
      const path = handoffPath(lay, from, to);
      return { ...tr, from, to, path, back: [...path].reverse(), len: pathLength(path) };
    });
  return {
    model: {
      ...model,
      // who sent whom is a desk index too: a sender out of the room is left out
      agents: keep.map((g) => {
        const a = model.agents[g];
        return a.parent == null ? a : { ...a, parent: at.get(a.parent) };
      }),
      stints: keep.map((g) => model.stints[g] ?? []),
      notes: keep.map((g) => model.notes[g] ?? []),
      trips,
    },
    seat: (i) => at.get(i) ?? -1,
  };
}

/** The room for a list of desks given as text ("0,3,5"; empty for every desk), rebuilt only when that list changes. */
export function useRoom(model: CafeModel, keepKey: string) {
  return useMemo(
    () => (keepKey ? roomOf(model, keepKey.split(",").map(Number)) : { model, seat: (i: number) => i }),
    [model, keepKey],
  );
}
