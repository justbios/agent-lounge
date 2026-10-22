import { Point } from "@/lib/layout";
import { CafeLayout, Dir, WALK_PX_PER_MS, pathLength, pointAt, route } from "@/lib/cafe/layout";
import { Visit, VisitorKind } from "@/lib/live/visitors";
import { Cat, Coat } from "./cat";
import { Costume } from "./halloween";
import { Look, drawPerson, drawSeated, lookFor } from "./people";
import { Ctx, LINE, glow, px } from "./pixel";
import { BAR_SEATS, doorOf } from "./room";

export const GOLD_COAT: Coat = { fur: "#e8b830", dark: "#b8862a", belly: "#fff1b0" };
const COURIER: Look = lookFor(3, "#d9534f", { style: 3, accent: "#ffd25a", accentDark: "#c9962a" });
const SHINY = ["#ff4fa3", "#5ce1ff", "#ffd25a", "#7fe0a0", "#b07ae0"];
const CAT_PX_PER_MS = 0.018;

export interface VisitorFrame {
  kind: VisitorKind;
  x: number;
  y: number;
  dir: Dir;
  walking: boolean;
  seat: Point;
}

/** The stool a visitor takes: the last one, which those with the café open fill only when all six are there. */
export const visitorSeat = (guests: number): Point | null =>
  guests < BAR_SEATS.length ? BAR_SEATS[BAR_SEATS.length - 1] : null;

const paths = new WeakMap<CafeLayout, Point[]>();

/** In at the door, up the aisles to the counter's band, along it to the stool. */
function pathIn(lay: CafeLayout, seat: Point): Point[] {
  const known = paths.get(lay);
  if (known) return known;
  const d = doorOf(lay);
  const last = lay.walkY.length - 1;
  const door = { x: d.x + d.w / 2, y: lay.walkY[last] };
  const p = [{ x: door.x, y: lay.height + 2 }, ...route(lay, door, last, { x: seat.x, y: lay.walkY[0] }, 0)];
  paths.set(lay, p);
  return p;
}

/** Where the visitor is at `now`: walking in, sitting at the stool, or walking out at the end of the stay. */
export function visitorFrame(lay: CafeLayout, v: Visit, seat: Point, now: number): VisitorFrame {
  const path = pathIn(lay, seat);
  const speed = v.kind === "goldcat" ? CAT_PX_PER_MS : WALK_PX_PER_MS;
  const walk = pathLength(path) / speed;
  const sat = { kind: v.kind, x: seat.x, y: seat.y, dir: "left" as Dir, walking: false, seat };
  if (now - v.start < walk) return { ...sat, ...pointAt(path, (now - v.start) * speed), walking: true };
  if (v.end - now < walk) {
    return { ...sat, ...pointAt([...path].reverse(), (walk - (v.end - now)) * speed), walking: true };
  }
  return sat;
}

function pizza(ctx: Ctx, x: number, y: number) {
  px(ctx, x - 1, y - 1, 10, 4, LINE);
  px(ctx, x, y, 8, 2, "#e0b27a");
  px(ctx, x, y, 8, 1, "#f0d2a0");
  px(ctx, x + 3, y + 1, 2, 1, "#d9534f");
}

function sparkle(ctx: Ctx, x: number, y: number, t: number, color: string, n = 3) {
  for (let k = 0; k < n; k++) {
    const ph = (t * 0.9 + k / n) % 1;
    if (ph > 0.5) continue;
    const a = k * 2.1 + Math.floor(t * 0.9 + k / n);
    px(ctx, Math.round(x + Math.cos(a) * 8), Math.round(y + Math.sin(a) * 7), 1, 1, color);
  }
}

/** The visitor itself: a courier with a pizza, in `costume` if one is given, the gold cat, or a shimmering agent. */
export function drawVisitor(ctx: Ctx, v: VisitorFrame, t: number, cat: Cat | null, costume: Costume | null = null) {
  const step = v.walking ? (Math.floor(t * 8) % 2) + 1 : 0;
  if (v.kind === "goldcat") {
    if (!cat) return;
    cat.put(v.x, v.walking ? v.y : v.seat.y + 1, v.dir, v.walking);
    glow(ctx, v.x, (v.walking ? v.y : v.seat.y) - 5, 9, "#ffe08a", 0.16);
    cat.draw(ctx, t);
    sparkle(ctx, v.x, (v.walking ? v.y : v.seat.y) - 6, t, "#fffbe0");
    return;
  }
  const look = v.kind === "shiny" ? lookFor(5, SHINY[Math.floor(t * 3) % SHINY.length]) : { ...COURIER, costume };
  const headTop = v.seat.y - 11;
  if (v.kind === "shiny") {
    glow(ctx, v.x, v.walking ? v.y - 9 : headTop + 6, 16, SHINY[Math.floor(t * 2) % SHINY.length], 0.24);
  }
  if (v.walking) {
    drawPerson(ctx, v.x, v.y, look, { dir: v.dir, step, carrying: false });
    if (v.kind === "courier" && v.dir !== "up") pizza(ctx, Math.round(v.x) - 4, Math.round(v.y) - 9);
  } else {
    drawSeated(ctx, v.seat.x, headTop, look, "idle", 0);
    if (v.kind === "courier") pizza(ctx, v.seat.x - 16, v.seat.y - 12);
  }
  if (v.kind === "shiny") sparkle(ctx, v.x, v.walking ? v.y - 10 : headTop + 4, t, "#ffffff", 6);
}
