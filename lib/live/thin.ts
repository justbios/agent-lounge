import { LiveEvent } from "./types";

/** How many tool calls and how many of everything else a feed keeps; `relay_snapshot` (0017) sends the same. */
export const KEEP = { tools: 3000, story: 3000 } as const;

/**
 * Drops the oldest tool calls and the oldest of everything else past their shares, so the day's prompts, handoffs
 * and answers outlive the thousands of tool calls between them. Expects the events sorted by `seq`.
 */
export function thinFeed(events: LiveEvent[]): LiveEvent[] {
  if (events.length <= KEEP.tools + KEEP.story) return events;
  let tools = 0;
  let story = 0;
  const out: LiveEvent[] = [];
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === "tool" ? ++tools <= KEEP.tools : ++story <= KEEP.story) out.push(e);
  }
  return out.reverse();
}
