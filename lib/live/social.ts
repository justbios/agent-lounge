import type { Ui } from "@/lib/i18n";
import { TrackId, isTrack } from "./tracks";
import { Tune, cleanTune } from "./tune";

export const REACTIONS = ["👏", "🔥", "☕", "❤️", "😂", "🎉"] as const;

/** How long a reaction floats over a desk. */
export const REACT_MS = 2600;
const MAX_SHOWN = 24;

/** Someone looking at the same café right now. */
export interface Guest {
  id: string;
  name: string;
  viewer: boolean;
  /** this tab, among everyone at the bar */
  me?: boolean;
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

/** What a guest who sent no name is called on this screen. */
const nameless = (ui: Ui) => (ui === "en" ? "guest" : "гість");

/** A reaction from the channel, kept only when every field is what this page itself would send. */
export function cleanReaction(p: unknown, at: number, ui: Ui = "uk"): Reaction | null {
  if (!p || typeof p !== "object") return null;
  const r = p as Record<string, unknown>;
  const emoji = REACTIONS.find((e) => e === r.emoji);
  const id = text(r.id, 40);
  const scene = text(r.scene, 200);
  const agent = text(r.agent, 80);
  if (!emoji || !id || !scene || !agent) return null;
  return { id, scene, agent, emoji, from: text(r.from, 24) ?? nameless(ui), at };
}

export function addReaction(list: Reaction[], r: Reaction, now: number): Reaction[] {
  if (list.some((x) => x.id === r.id)) return list;
  return [...list.filter((x) => now - x.at < REACT_MS), r].slice(-MAX_SHOWN);
}

/** The record on the café's jukebox: whoever puts one on, everyone with the sound on hears it. */
export interface Disc {
  track: TrackId;
  /** music from a link plays instead of the record; older pages ignore it and keep playing `track` */
  tune?: Tune;
  by: string;
  at: number;
}

/** A record from the channel; one stamped in the future counts as put on now, so it cannot outlast the next pick. */
export function cleanDisc(p: unknown, now: number): Disc | null {
  if (!p || typeof p !== "object") return null;
  const d = p as Record<string, unknown>;
  if (!isTrack(d.track) || typeof d.at !== "number" || !Number.isFinite(d.at) || d.at <= 0) return null;
  const tune = d.tune == null ? null : cleanTune(d.tune);
  if (d.tune != null && !tune) return null;
  return { track: d.track, ...(tune && { tune }), by: text(d.by, 24) ?? "гість", at: Math.min(d.at, now) };
}

export const newerDisc = (d: Disc, than: Disc | null) => !than || d.at > than.at;

type PresenceState = Record<string, { name?: unknown; viewer?: unknown; disc?: unknown }[]>;

/** The latest record anyone at the bar carries, so a page opened later plays what the others hear. */
export function discOf(state: PresenceState, now: number): Disc | null {
  let best: Disc | null = null;
  for (const metas of Object.values(state)) {
    const d = metas.length ? cleanDisc(metas[0].disc, now) : null;
    if (d && newerDisc(d, best)) best = d;
  }
  return best;
}

/** Everyone at the bar: the others and this tab, marked, in the same order on every screen. */
export function barOf(guests: Guest[], me: Guest): Guest[] {
  return [...guests, { ...me, me: true }].sort((a, b) => a.id.localeCompare(b.id));
}

/** Everyone tracked on the channel but this tab, one entry per tab. */
export function guestsOf(state: PresenceState, self: string, ui: Ui = "uk"): Guest[] {
  return Object.entries(state)
    .filter(([id, metas]) => id !== self && metas.length > 0)
    .map(([id, metas]) => ({
      id,
      name: text(metas[0].name, 24) ?? nameless(ui),
      viewer: metas[0].viewer === true,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
