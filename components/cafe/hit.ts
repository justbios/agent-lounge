import { CafeLayout, seatBox } from "@/lib/cafe/layout";
import type { Two } from "@/lib/i18n";
import { AgentView } from "@/lib/cafe/timeline";
import { Point } from "@/lib/layout";
import { doorOf, fixturesOf } from "./room";

export type Hit =
  | { kind: "agent"; agent: number }
  | { kind: "cat" }
  | { kind: "board" }
  | { kind: "vending" }
  | { kind: "beans" }
  | { kind: "window" }
  | { kind: "door" }
  | { kind: "bar" }
  | { kind: "games" };

export type FixtureKind = Exclude<Hit["kind"], "agent" | "cat">;

const inBox = (p: Point, x: number, y: number, w: number, h: number) => p.x >= x && p.x < x + w && p.y >= y && p.y < y + h;

/** The sack of coffee beans over the coffee machine on the back counter, where {@link BeanSack} floats. */
export const SACK = { x: 25, y: 41 };

/** What sits under a point of the scene, topmost first: walkers, the cat, desks, then the fixtures. */
export function hitTest(lay: CafeLayout, views: AgentView[], cat: Point | null, p: Point, sack = false): Hit | null {
  for (let i = views.length - 1; i >= 0; i--) {
    const w = views[i].walker;
    if (w && inBox(p, w.x - 7, w.y - 24, 14, 26)) return { kind: "agent", agent: i };
  }
  if (cat && inBox(p, cat.x - 9, cat.y - 13, 18, 15)) return { kind: "cat" };
  for (let i = 0; i < lay.desks.length; i++) {
    const b = seatBox(lay, i);
    if (inBox(p, b.x, b.y, b.w, b.h)) return { kind: "agent", agent: i };
  }
  const fx = fixturesOf(lay);
  const m = fx.METER;
  const B = fx.BOARD;
  if (inBox(p, B.x, B.y, B.w, B.h) || inBox(p, m.x - 1, m.y - 1, m.w + 2, m.h + 2)) return { kind: "board" };
  if (sack && inBox(p, SACK.x - 10, SACK.y - 9, 21, 10)) return { kind: "beans" };
  const v = fx.VENDING;
  if (inBox(p, v.x, v.y, v.w, v.h)) return { kind: "vending" };
  const b = fx.BAR;
  const t = fx.BISTRO;
  if (inBox(p, b.x, b.y, b.w, b.h) || inBox(p, t.x - 20, t.y - 6, 40, 18)) return { kind: "bar" };
  const a = fx.ARCADE;
  if (inBox(p, a.x - 1, a.y - 1, a.w + 2, a.h + 2)) return { kind: "games" };
  if (fx.WINDOWS.some((w) => inBox(p, w.x - 2, 3, w.w + 4, 44))) return { kind: "window" };
  const d = doorOf(lay);
  if (inBox(p, d.x - 4, d.y - 4, d.w + 8, d.h + 4)) return { kind: "door" };
  return null;
}

export const HIT_HINT: Record<Hit["kind"], Two> = {
  agent: { uk: "хто це і що робить", en: "who this is and what they're doing" },
  cat: { uk: "погладити кота", en: "pet the cat" },
  board: { uk: "підсумок дня", en: "the day's recap" },
  vending: { uk: "кав'ярня", en: "coffee shop" },
  beans: { uk: "кав'ярня: зерна й меблі", en: "coffee shop: beans and furniture" },
  window: { uk: "змінити вид за вікном", en: "change the view outside" },
  door: { uk: "запросити команду", en: "invite your team" },
  bar: { uk: "груповий чат", en: "group chat" },
  games: { uk: "ігровий автомат: ігри", en: "arcade machine: games" },
};
