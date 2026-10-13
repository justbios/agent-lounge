import { CafeLayout } from "@/lib/cafe/layout";
import { AgentView } from "@/lib/cafe/timeline";
import { Point } from "@/lib/layout";
import { BAR_AREA, doorOf, fixtures } from "./room";

export type Hit =
  | { kind: "agent"; agent: number }
  | { kind: "cat" }
  | { kind: "board" }
  | { kind: "vending" }
  | { kind: "beans" }
  | { kind: "window" }
  | { kind: "door" }
  | { kind: "bar" };

export type FixtureKind = Exclude<Hit["kind"], "agent" | "cat">;

const inBox = (p: Point, x: number, y: number, w: number, h: number) => p.x >= x && p.x < x + w && p.y >= y && p.y < y + h;

/** The sack of coffee beans hanging over the coffee machine, where {@link BeanSack} floats. */
export const SACK = { x: 12, y: 45 };

/** What sits under a point of the scene, topmost first: walkers, the cat, desks, then the fixtures. */
export function hitTest(lay: CafeLayout, views: AgentView[], cat: Point | null, p: Point, sack = false): Hit | null {
  for (let i = views.length - 1; i >= 0; i--) {
    const w = views[i].walker;
    if (w && inBox(p, w.x - 7, w.y - 24, 14, 26)) return { kind: "agent", agent: i };
  }
  if (cat && inBox(p, cat.x - 9, cat.y - 13, 18, 15)) return { kind: "cat" };
  for (let i = 0; i < lay.desks.length; i++) {
    const d = lay.desks[i];
    if (inBox(p, d.x - 24, d.top - 4, 48, 50)) return { kind: "agent", agent: i };
  }
  const fx = fixtures(lay.width);
  const m = fx.METER;
  if (inBox(p, 2, 5, 44, 30) || inBox(p, m.x - 1, m.y - 1, m.w + 2, m.h + 2)) return { kind: "board" };
  if (sack && inBox(p, SACK.x - 10, SACK.y - 9, 21, 10)) return { kind: "beans" };
  const b = BAR_AREA;
  if (inBox(p, b.x, b.y, b.w, b.h)) return { kind: "bar" };
  const v = fx.VENDING;
  if (inBox(p, v.x - 1, v.y - 1, v.w + 2, v.h + 2)) return { kind: "vending" };
  if (fx.WINDOWS.some((w) => inBox(p, w.x - 1, 4, w.w + 2, 32))) return { kind: "window" };
  const d = doorOf(lay);
  if (inBox(p, d.x - 4, d.y - 6, d.w + 8, d.h + 6)) return { kind: "door" };
  return null;
}

export const HIT_HINT: Record<Hit["kind"], string> = {
  agent: "хто це і що робить",
  cat: "погладити кота",
  board: "підсумок дня",
  vending: "кав'ярня",
  beans: "кав'ярня: зерна й меблі",
  window: "змінити вид за вікном",
  door: "запросити команду",
  bar: "груповий чат",
};
