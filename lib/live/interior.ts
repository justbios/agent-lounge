import type { Decor, Progress } from "./achievements";

/** sill — on a window sill; wall — hangs between the fixtures; floor — stands among people; rug — flat under them; perk — not placed */
export type ItemPlace = "sill" | "wall" | "floor" | "rug" | "perk";

export const ITEMS = [
  { id: "candle", name: "свічка", price: 60, place: "sill", w: 5, h: 9 },
  { id: "cactus", name: "кактус", price: 80, place: "sill", w: 7, h: 10 },
  { id: "luckycat", name: "кіт-манекі", price: 150, place: "sill", w: 7, h: 10 },
  { id: "bonsai", name: "бонсай", price: 200, place: "sill", w: 11, h: 10 },
  { id: "posterHills", name: "постер з горами", price: 90, place: "wall", w: 9, h: 12 },
  { id: "posterCat", name: "постер з котом", price: 90, place: "wall", w: 9, h: 12 },
  { id: "posterRocket", name: "постер з ракетою", price: 90, place: "wall", w: 9, h: 12 },
  { id: "rug", name: "килимок", price: 140, place: "rug", w: 28, h: 9 },
  { id: "catbed", name: "лежак для кота", price: 120, place: "floor", w: 14, h: 6 },
  { id: "lamp", name: "торшер", price: 220, place: "floor", w: 9, h: 28 },
  { id: "palm", name: "пальма в діжці", price: 260, place: "floor", w: 14, h: 28 },
  { id: "shelf", name: "книжкова шафа", price: 320, place: "floor", w: 18, h: 30 },
  { id: "gramophone", name: "грамофон", price: 380, place: "floor", w: 12, h: 17 },
  { id: "couch", name: "диван", price: 450, place: "floor", w: 30, h: 15 },
  { id: "jukebox", name: "музичний автомат", price: 600, place: "floor", w: 16, h: 26 },
  { id: "neon", name: "неонова вивіска зі своїм написом", price: 500, place: "perk", w: 22, h: 10 },
  { id: "cat2", name: "другий кіт", price: 700, place: "perk", w: 14, h: 11 },
] as const;

/** Earned decor that can be moved like bought furniture; it starts where it always stood. */
export const DECOR_PIECES = [
  { id: "arcade", name: "аркадний автомат", price: 0, place: "floor", w: 14, h: 30, decor: "arcade" },
  { id: "aquarium", name: "акваріум", price: 0, place: "floor", w: 18, h: 22, decor: "aquarium" },
  { id: "plant", name: "рослина в кутку", price: 0, place: "floor", w: 14, h: 24, decor: "plant" },
  { id: "owl", name: "сова на підвіконні", price: 0, place: "sill", w: 7, h: 11, decor: "owl" },
] as const;

export type ItemId = (typeof ITEMS)[number]["id"] | (typeof DECOR_PIECES)[number]["id"];

export interface ItemDef {
  id: ItemId;
  name: string;
  price: number;
  place: ItemPlace;
  w: number;
  h: number;
  decor?: Decor;
}

const BY_ID = new Map<string, ItemDef>([...ITEMS, ...DECOR_PIECES].map((i) => [i.id, i]));
export const itemOf = (id: string): ItemDef | undefined => BY_ID.get(id);
export const SHOP: readonly ItemDef[] = ITEMS;

/** Earned decor keeps one fixed pid, so moving it twice moves the same piece. */
export const decorPid = (id: ItemId) => `d-${id}`;

/** One piece standing in the café: its middle as thousandths of the room's width, its foot in pixels. */
export interface Placed {
  pid: string;
  item: ItemId;
  x: number;
  y: number;
}

/** Indexes into the palettes in people.ts and desk.ts; a missing one keeps the agent's own. */
export interface LookPick {
  style?: number;
  hair?: number;
  skin?: number;
  shirt?: number;
  prop?: number;
  /** the name on the agent's desk plate */
  name?: string;
}

export interface Interior {
  /** one entry per copy bought */
  owned: ItemId[];
  placed: Placed[];
  looks: Record<string, LookPick>;
  /** the second line of the neon sign */
  sign?: string;
  cat2Name?: string;
}

export const EMPTY_INTERIOR: Interior = { owned: [], placed: [], looks: {} };

const MAX_OWNED = 80;
const MAX_LOOKS = 64;
export const SIGN_MAX = 18;
export const NAME_MAX = 16;

const int = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : undefined;

const text = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\s+/g, " ").trim().slice(0, max);
  return t || undefined;
};

function cleanLook(l: unknown): LookPick | null {
  if (!l || typeof l !== "object") return null;
  const m = l as Record<string, unknown>;
  const pick: LookPick = {
    style: int(m.style, 0, 3),
    hair: int(m.hair, 0, 7),
    skin: int(m.skin, 0, 4),
    shirt: int(m.shirt, 0, 15),
    prop: int(m.prop, 0, 15),
    name: text(m.name, NAME_MAX),
  };
  for (const k of Object.keys(pick) as (keyof LookPick)[]) if (pick[k] == null) delete pick[k];
  return Object.keys(pick).length ? pick : null;
}

/** Whatever came back from the room, cut down to what this page knows how to draw. */
export function cleanInterior(v: unknown): Interior {
  const o = (v ?? {}) as Record<string, unknown>;
  const owned = (Array.isArray(o.owned) ? o.owned : [])
    .filter((id): id is ItemId => typeof id === "string" && ITEMS.some((i) => i.id === id))
    .slice(0, MAX_OWNED);
  const left = new Map<string, number>();
  owned.forEach((id) => left.set(id, (left.get(id) ?? 0) + 1));
  const placed: Placed[] = [];
  for (const p of Array.isArray(o.placed) ? o.placed : []) {
    const q = p as Partial<Placed> | null;
    const x = int(q?.x, 0, 1000);
    const y = int(q?.y, 0, 800);
    const it = q?.item ? itemOf(q.item) : undefined;
    if (!q || !it || typeof q.pid !== "string" || q.pid.length > 16 || x == null || y == null) continue;
    if (it.place === "perk" || placed.some((r) => r.pid === q.pid)) continue;
    if (it.decor) {
      if (q.pid !== decorPid(it.id)) continue;
    } else {
      if (!left.get(it.id)) continue;
      left.set(it.id, left.get(it.id)! - 1);
    }
    placed.push({ pid: q.pid, item: it.id, x, y });
  }
  const looks: Record<string, LookPick> = {};
  const raw = o.looks && typeof o.looks === "object" ? Object.entries(o.looks as Record<string, unknown>) : [];
  for (const [k, l] of raw.slice(0, MAX_LOOKS)) {
    const pick = k.length <= 64 ? cleanLook(l) : null;
    if (pick) looks[k] = pick;
  }
  const out: Interior = { owned, placed, looks };
  const sign = text(o.sign, SIGN_MAX);
  const cat2Name = text(o.cat2Name, 24);
  if (sign) out.sign = sign;
  if (cat2Name) out.cat2Name = cat2Name;
  return out;
}

export const owns = (i: Interior, id: ItemId) => i.owned.includes(id);

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
  i.placed.forEach((p) => m.has(p.item) && m.set(p.item, m.get(p.item)! - 1));
  return m;
}

export const newPid = () => crypto.randomUUID().slice(0, 8);
