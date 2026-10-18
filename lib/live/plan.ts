import { Interior, ItemId, LookPick, Placed, cleanInterior, decorPid, itemOf, newPid } from "./interior";

/** What the plan editor moves around: where each piece stands and how each agent looks. */
export type Arrangement = Pick<Interior, "placed" | "looks">;

export interface Pack {
  id: string;
  name: string;
  hint: string;
  /** handed out to the room's agents in turn; skin stays each agent's own */
  looks: Omit<LookPick, "skin" | "name">[];
}

export const PACKS: Pack[] = [
  {
    id: "office",
    name: "Офіс",
    hint: "сорочки, навушники, книжки й лампи",
    looks: [
      { style: 0, shirt: 0, prop: 3 },
      { style: 2, shirt: 1, prop: 4 },
      { style: 0, shirt: 6, prop: 3 },
      { style: 1, shirt: 1, prop: 4 },
    ],
  },
  {
    id: "neon",
    name: "Неон",
    hint: "фіолетове й рожеве, банки з енергетиком",
    looks: [
      { style: 3, hair: 6, shirt: 8, prop: 2 },
      { style: 0, hair: 5, shirt: 7, prop: 4 },
      { style: 1, hair: 6, shirt: 6, prop: 2 },
      { style: 3, hair: 5, shirt: 4, prop: 1 },
    ],
  },
  {
    id: "coffee",
    name: "Кав'ярня",
    hint: "теплі кольори й кактуси",
    looks: [
      { style: 2, hair: 1, shirt: 3, prop: 0 },
      { style: 1, hair: 7, shirt: 2, prop: 3 },
      { style: 3, hair: 0, shirt: 5, prop: 0 },
      { style: 0, hair: 4, shirt: 3, prop: 1 },
    ],
  },
  {
    id: "retro",
    name: "Ретро",
    hint: "кепки, качки й нічого зайвого на столі",
    looks: [
      { style: 3, hair: 2, shirt: 2, prop: 1 },
      { style: 1, hair: 4, shirt: 4, prop: 5 },
      { style: 3, hair: 3, shirt: 5, prop: 1 },
      { style: 2, hair: 2, shirt: 6, prop: 5 },
    ],
  },
];

/** Dresses the given agents from a pack in turn, keeping the names on their desk plates. */
export function wearPack(looks: Record<string, LookPick>, agents: string[], pack: Pack): Record<string, LookPick> {
  const out = { ...looks };
  agents.forEach((id, i) => {
    const name = looks[id]?.name;
    out[id] = { ...pack.looks[i % pack.looks.length], ...(name ? { name } : {}) };
  });
  return out;
}

/** Takes the picked looks off the given agents; the names on their desk plates stay. */
export function undress(looks: Record<string, LookPick>, agents: string[]): Record<string, LookPick> {
  const out = { ...looks };
  for (const id of agents) {
    const name = looks[id]?.name;
    if (name) out[id] = { name };
    else delete out[id];
  }
  return out;
}

const PREFIX = "relay-plan:1:";
const MAX_PIECES = 60;
const MAX_LOOKS = 40;

function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64(s: string): string {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** The room's plan as a line of text to copy: where each piece stands and how each agent looks. */
export function planCode(a: Arrangement): string {
  return PREFIX + toBase64(JSON.stringify({ p: a.placed.map((q) => [q.item, q.x, q.y]), l: a.looks }));
}

/** Reads a plan line back, or null when it is not one; nothing in it is trusted until {@link fitPlan} cleans it. */
export function readPlan(code: string): Arrangement | null {
  const s = code.trim();
  if (!s.startsWith(PREFIX) || s.length > 20_000) return null;
  try {
    const o = JSON.parse(fromBase64(s.slice(PREFIX.length))) as { p?: unknown; l?: unknown };
    const placed: Placed[] = [];
    for (const row of Array.isArray(o.p) ? o.p.slice(0, MAX_PIECES) : []) {
      if (!Array.isArray(row) || typeof row[0] !== "string") continue;
      const it = itemOf(row[0] as ItemId);
      if (!it) continue;
      placed.push({ pid: it.decor ? decorPid(it.id) : newPid(), item: it.id, x: Number(row[1]), y: Number(row[2]) });
    }
    const looks: Record<string, LookPick> = {};
    if (o.l && typeof o.l === "object") {
      for (const [k, v] of Object.entries(o.l as Record<string, unknown>).slice(0, MAX_LOOKS)) looks[k] = v as LookPick;
    }
    return { placed, looks };
  } catch {
    return null;
  }
}

export interface Fitted {
  next: Interior;
  /** the pieces of the plan this room has not bought, by name */
  missing: string[];
}

/** What a plan becomes in this room: only pieces it owns stand, nothing is bought, the rest of the room stays. */
export function fitPlan(interior: Interior, plan: Arrangement): Fitted {
  const next = cleanInterior({ ...interior, placed: plan.placed, looks: plan.looks });
  const left = new Map<string, number>();
  next.placed.forEach((q) => left.set(q.item, (left.get(q.item) ?? 0) + 1));
  const missing: string[] = [];
  for (const q of plan.placed) {
    const n = left.get(q.item) ?? 0;
    if (n > 0) left.set(q.item, n - 1);
    else missing.push(itemOf(q.item)?.name ?? q.item);
  }
  return { next, missing };
}

/** The same arrangement always gives the same key, whatever order Agent Lounge sent its pieces and looks in. */
export function arrangementKey(a: Arrangement): string {
  const placed = [...a.placed].sort((x, y) => x.pid.localeCompare(y.pid)).map((q) => [q.pid, q.item, q.x, q.y]);
  const looks = Object.keys(a.looks)
    .sort()
    .map((k) => [k, Object.entries(a.looks[k]).sort(([x], [y]) => x.localeCompare(y))]);
  return JSON.stringify([placed, looks]);
}
