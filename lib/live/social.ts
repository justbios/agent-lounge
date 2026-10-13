export const REACTIONS = ["👏", "🔥", "☕", "❤️", "😂", "🎉"] as const;

/** How long a reaction floats over a desk. */
export const REACT_MS = 2600;
const MAX_SHOWN = 24;

/** Someone else looking at the same café right now. */
export interface Guest {
  id: string;
  name: string;
  viewer: boolean;
}

export interface Reaction {
  id: string;
  /** the chat id, or "team" for the whole-team view */
  scene: string;
  agent: string;
  emoji: string;
  from: string;
  at: number;
}

const text = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null;

/** A reaction from the channel, kept only when every field is what this page itself would send. */
export function cleanReaction(p: unknown, at: number): Reaction | null {
  if (!p || typeof p !== "object") return null;
  const r = p as Record<string, unknown>;
  const emoji = REACTIONS.find((e) => e === r.emoji);
  const id = text(r.id, 40);
  const scene = text(r.scene, 200);
  const agent = text(r.agent, 80);
  if (!emoji || !id || !scene || !agent) return null;
  return { id, scene, agent, emoji, from: text(r.from, 24) ?? "гість", at };
}

export function addReaction(list: Reaction[], r: Reaction, now: number): Reaction[] {
  if (list.some((x) => x.id === r.id)) return list;
  return [...list.filter((x) => now - x.at < REACT_MS), r].slice(-MAX_SHOWN);
}

type PresenceState = Record<string, { name?: unknown; viewer?: unknown }[]>;

/** Everyone tracked on the channel but this tab, one entry per tab. */
export function guestsOf(state: PresenceState, self: string): Guest[] {
  return Object.entries(state)
    .filter(([id, metas]) => id !== self && metas.length > 0)
    .map(([id, metas]) => ({
      id,
      name: text(metas[0].name, 24) ?? "гість",
      viewer: metas[0].viewer === true,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
