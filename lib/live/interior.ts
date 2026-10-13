import type { Progress } from "./achievements";

export type ItemPlace = "sill" | "floor";

export const ITEMS = [
  { id: "candle", name: "свічка", price: 60, place: "sill", w: 5, h: 9 },
  { id: "cactus", name: "кактус", price: 80, place: "sill", w: 7, h: 10 },
  { id: "luckycat", name: "кіт-манекі", price: 150, place: "sill", w: 7, h: 10 },
  { id: "bonsai", name: "бонсай", price: 200, place: "sill", w: 11, h: 10 },
  { id: "catbed", name: "лежак для кота", price: 120, place: "floor", w: 14, h: 6 },
  { id: "lamp", name: "торшер", price: 220, place: "floor", w: 9, h: 28 },
  { id: "palm", name: "пальма в діжці", price: 260, place: "floor", w: 14, h: 28 },
  { id: "shelf", name: "книжкова шафа", price: 320, place: "floor", w: 18, h: 30 },
  { id: "gramophone", name: "грамофон", price: 380, place: "floor", w: 12, h: 17 },
  { id: "couch", name: "диван", price: 450, place: "floor", w: 30, h: 15 },
  { id: "jukebox", name: "музичний автомат", price: 600, place: "floor", w: 16, h: 26 },
] as const;

export type ItemId = (typeof ITEMS)[number]["id"];
export type ItemDef = (typeof ITEMS)[number];

const BY_ID = new Map<string, ItemDef>(ITEMS.map((i) => [i.id, i]));
export const itemOf = (id: string): ItemDef | undefined => BY_ID.get(id);

/** One piece of furniture standing in the café: its middle as thousandths of the room's width, its foot in pixels. */
export interface Placed {
  pid: string;
  item: ItemId;
  x: number;
  y: number;
}

/** Indexes into the palettes in people.ts; a missing one keeps the agent's own. */
export interface LookPick {
  style?: number;
  hair?: number;
  skin?: number;
}

export interface Interior {
  /** one entry per copy bought */
  owned: ItemId[];
  placed: Placed[];
  looks: Record<string, LookPick>;
}

export const EMPTY_INTERIOR: Interior = { owned: [], placed: [], looks: {} };

const MAX_OWNED = 60;
const MAX_LOOKS = 64;

const int = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : undefined;

/** Whatever came back from the room, cut down to what this page knows how to draw. */
export function cleanInterior(v: unknown): Interior {
  const o = (v ?? {}) as Partial<Record<keyof Interior, unknown>>;
  const owned = (Array.isArray(o.owned) ? o.owned : []).filter((id): id is ItemId => typeof id === "string" && BY_ID.has(id)).slice(0, MAX_OWNED);
  const left = new Map<string, number>();
  owned.forEach((id) => left.set(id, (left.get(id) ?? 0) + 1));
  const placed: Placed[] = [];
  for (const p of Array.isArray(o.placed) ? o.placed : []) {
    const q = p as Partial<Placed> | null;
    const x = int(q?.x, 0, 1000);
    const y = int(q?.y, 0, 800);
    if (!q || typeof q.pid !== "string" || q.pid.length > 16 || x == null || y == null) continue;
    if (!q.item || !left.get(q.item) || placed.some((r) => r.pid === q.pid)) continue;
    left.set(q.item, left.get(q.item)! - 1);
    placed.push({ pid: q.pid, item: q.item, x, y });
  }
  const looks: Record<string, LookPick> = {};
  const raw = o.looks && typeof o.looks === "object" ? Object.entries(o.looks as Record<string, unknown>) : [];
  for (const [k, l] of raw.slice(0, MAX_LOOKS)) {
    if (k.length > 64 || !l || typeof l !== "object") continue;
    const m = l as Record<string, unknown>;
    const pick: LookPick = { style: int(m.style, 0, 3), hair: int(m.hair, 0, 7), skin: int(m.skin, 0, 4) };
    if (pick.style != null || pick.hair != null || pick.skin != null) looks[k] = pick;
  }
  return { owned, placed, looks };
}

export const BEAN_RULES = { prompt: 3, dispatch: 5, answer: 1, minute: 1, toolsPerBean: 4, achievement: 30 } as const;

/** Coffee beans the café has earned so far: everything Claude did, plus each achievement. */
export function beansEarned(p: Progress | null, achievements: number): number {
  if (!p) return 0;
  const r = BEAN_RULES;
  let b = achievements * r.achievement;
  for (const d of p.days) {
    b += d.prompts * r.prompt + d.dispatches * r.dispatch + d.answers * r.answer + d.minutes * r.minute;
    b += Math.floor(d.tools / r.toolsPerBean);
  }
  return b;
}

export const beansSpent = (i: Interior): number => i.owned.reduce((s, id) => s + (itemOf(id)?.price ?? 0), 0);

/** Copies of each item bought but not standing anywhere. */
export function inStock(i: Interior): Map<ItemId, number> {
  const m = new Map<ItemId, number>();
  i.owned.forEach((id) => m.set(id, (m.get(id) ?? 0) + 1));
  i.placed.forEach((p) => m.set(p.item, (m.get(p.item) ?? 0) - 1));
  return m;
}

export const newPid = () => crypto.randomUUID().slice(0, 8);
