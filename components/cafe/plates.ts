/**
 * Where the room's name plates go so that none runs into another or covers anyone's head or monitor. A plate sits
 * over its own monitor, where the small name used to be. Plates of one row that would touch slide apart, each still
 * over its monitor; a row too tight for that lifts every second plate above its neighbours; only then do all the
 * plates step down to a smaller size, and only past that do they give way to numbers.
 */

export interface PlateIn {
  key: string;
  /** the desk's middle and the top of its monitor, in the room's own pixels */
  x: number;
  top: number;
  /** the desks of one row share a line of plates */
  row: number;
  name: string;
  /** what the state row says now, and the words it usually says: the plate is cut for the longest, so it keeps its width */
  state: string;
  states: string[];
}

/** A rectangle in screen pixels from the room's top left. */
export interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface PlatePlan {
  /** the name row's and the state row's font sizes, in screen pixels */
  font: number;
  small: number;
  spots: Map<string, Box>;
}

export type Measure = (text: string, font: string) => number;

/** the plates' sizes: 16px names first, a step smaller only when they would collide */
const STEPS = [
  { name: 16, state: 13 },
  { name: 14, state: 12 },
];
/** the widest a plate gets, in its own em: longer names end in an ellipsis */
const MAX_EM = 11;
/** room pixels between a plate and the top of its monitor */
const LIFT = 3;
/** room pixels either side of the monitor's middle that its plate always covers, however far it slides */
const HOLD = 6;
/** screen pixels kept between two plates, and between a plate and the room's edge */
const GAP = 4;
const EDGE = 2;

/** What a seated agent and its monitor take up, in the room's own pixels: no plate may cover it. */
export const seatBox = (x: number, top: number) => ({ l: x - 12, t: top - 2, r: x + 12, b: top + 33 });

const hits = (a: Box, b: Box, gap = 0) => a.l < b.r + gap && b.l < a.r + gap && a.t < b.b + gap && b.t < a.b + gap;
const scaled = (b: Box, s: number): Box => ({ l: b.l * s, t: b.t * s, r: b.r * s, b: b.b * s });

/** How big a plate is at these font sizes, after the CSS in globals.css (.cafe-plate). */
function sizeOf(p: PlateIn, f: number, sf: number, family: string, measure: Measure) {
  const border = Math.max(2, 0.15 * f);
  const nameW = measure(p.name, `600 ${f}px ${family}`) + 1.2 * f;
  const stateW = Math.max(...[p.state, ...p.states].map((t) => measure(t, `600 ${sf}px ${family}`))) + sf * 2.4375;
  const w = Math.min(Math.ceil(Math.max(nameW, stateW) + 2 * border) + 1, Math.floor(MAX_EM * f));
  const h = Math.ceil(f * 1.55 + sf * 1.625 + 2 * border);
  return { w, h };
}

interface Item {
  p: PlateIn;
  w: number;
  h: number;
  /** the left edge now, and how far it may slide */
  l: number;
  lo: number;
  hi: number;
  t: number;
}

/** Slides the plates of one line, left to right, apart until none touches its neighbour; false when their monitors are too close for that. */
function settle(line: Item[]): boolean {
  for (let k = 0; k < 80; k++) {
    let moved = false;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      const over = a.l + a.w + GAP - b.l;
      if (over <= 0.01) continue;
      a.l -= over / 2;
      b.l += over / 2;
      moved = true;
    }
    for (const it of line) it.l = Math.min(it.hi, Math.max(it.lo, it.l));
    if (!moved) break;
  }
  return line.every((b, i) => i === 0 || line[i - 1].l + line[i - 1].w + GAP <= b.l + 0.5);
}

const boxOf = (it: Item): Box => ({ l: it.l, t: it.t, r: it.l + it.w, b: it.t + it.h });

/**
 * Places every plate at 16px names scaled to the room (`s` screen pixels to a room pixel, `width` the room's width in
 * room pixels), or null when even the smaller plates cannot all fit clear of each other and of `seats` (room pixels).
 */
export function placePlates(
  list: PlateIn[],
  s: number,
  width: number,
  seats: Box[],
  family: string,
  measure: Measure,
): PlatePlan | null {
  const taken = seats.map((b) => scaled(b, s));
  const tried = new Set<number>();
  for (const step of STEPS) {
    const font = Math.max(step.name, (20 * s) / 4.5);
    const small = Math.max(step.state, (16 * s) / 4.5);
    if (tried.has(font)) continue;
    tried.add(font);
    const rows = new Map<number, Item[]>();
    for (const p of list) {
      const { w, h } = sizeOf(p, font, small, family, measure);
      const lo = Math.max(EDGE, (p.x + HOLD) * s - w);
      const hi = Math.max(lo, Math.min(width * s - EDGE - w, (p.x - HOLD) * s));
      const l = Math.min(hi, Math.max(lo, p.x * s - w / 2));
      const it: Item = { p, w, h, l, lo, hi, t: (p.top - LIFT) * s - h };
      rows.set(p.row, [...(rows.get(p.row) ?? []), it]);
    }
    let ok = true;
    for (const row of rows.values()) {
      row.sort((a, b) => a.p.x - b.p.x);
      const want = row.map((it) => it.l);
      if (settle(row)) continue;
      // too tight side by side: every second plate goes up a line, over its neighbours
      row.forEach((it, i) => (it.l = want[i]));
      const low = row.filter((_, i) => i % 2 === 0);
      const high = row.filter((_, i) => i % 2 === 1);
      const line = Math.min(...low.map((it) => it.t));
      for (const it of high) it.t = line - GAP - it.h;
      if (!settle(low) || !settle(high)) ok = false;
    }
    const all = [...rows.values()].flat();
    if (ok && all.every((it) => it.t >= EDGE && !taken.some((b) => hits(boxOf(it), b)))) {
      return { font, small, spots: new Map(all.map((it) => [it.p.key, boxOf(it)])) };
    }
  }
  return null;
}

export interface AskIn {
  /** the asking agent's desk, as in {@link PlateIn}, and its plate's key */
  key: string;
  x: number;
  top: number;
  title: string;
  text: string;
}

export interface AskSpot extends Box {
  /** beside the desk with the tail on that side of the card, or over the monitor in place of the agent's own plate */
  where: "left" | "right" | "above";
  /** lines of the question shown; the rest is in the agent's card */
  lines: number;
  /** above only: the tail's middle, in screen pixels from the card's left edge */
  tail: number;
}

/** the card's widths to try, in its own em, and the most lines of the question it shows */
const ASK_EM = [15, 12, 9];
const ASK_LINES = 4;
/** room pixels from the desk's middle to a card beside it */
const ASK_OUT = 27;

/** How many lines `text` takes at this width, breaking between words and inside the ones that are too long. */
function linesOf(text: string, inner: number, font: string, measure: Measure): number {
  const space = measure(" ", font);
  let lines = 1;
  let x = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = measure(word, font);
    if (x > 0 && x + space + w <= inner) {
      x += space + w;
      continue;
    }
    if (x > 0) lines++;
    lines += Math.max(0, Math.ceil(w / inner) - 1);
    x = w > inner ? w % inner || inner : w;
  }
  return lines;
}

/**
 * Where the question card goes once the plates are down: beside the asking agent's desk, on the side with more room,
 * else over its monitor in place of its plate; null when it would cover a plate, a head or a monitor either way, and
 * the question is shown under the room instead. The sizes follow the CSS in globals.css (.cafe-ask).
 */
export function placeAsk(
  ask: AskIn,
  plan: PlatePlan,
  s: number,
  width: number,
  height: number,
  seats: Box[],
  family: string,
  measure: Measure,
): AskSpot | null {
  const f = plan.font;
  const border = Math.max(2, 0.15 * f);
  const taken = seats.map((b) => scaled(b, s));
  const others = [...plan.spots].filter(([k]) => k !== ask.key).map(([, b]) => b);
  const own = plan.spots.get(ask.key);
  const x = ask.x * s;
  const free = (b: Box, plates: Box[]) =>
    b.l >= EDGE &&
    b.r <= width * s - EDGE &&
    b.t >= EDGE &&
    b.b <= height * s - EDGE &&
    !taken.some((o) => hits(b, o)) &&
    !plates.some((o) => hits(b, o, GAP));
  // the side with more room first: the one farther from the nearest neighbour or wall
  const room = (dir: 1 | -1) => {
    const edge = dir > 0 ? width * s : 0;
    const near = taken
      .filter((o) => o.t < (ask.top + 33) * s && o.b > (ask.top - 2) * s && (dir > 0 ? o.l > x : o.r < x))
      .map((o) => (dir > 0 ? o.l : o.r));
    return Math.min(Math.abs(edge - x), ...near.map((n) => Math.abs(n - x)));
  };
  const sides: ("left" | "right")[] = room(1) >= room(-1) ? ["right", "left"] : ["left", "right"];
  for (let cut = 0; cut < ASK_LINES; cut++) {
    for (const em of ASK_EM) {
      const w = Math.round(em * f);
      const need = Math.min(ASK_LINES, linesOf(ask.text, w - 1.6 * f - 2 * border, `500 ${f}px ${family}`, measure));
      const lines = need - cut;
      if (lines < 1) continue;
      const h = Math.ceil(2 * border + f * (1.5 + 0.85 * 1.18 + 0.5 + 1.3 * lines));
      for (const where of sides) {
        const l = where === "right" ? (ask.x + ASK_OUT) * s : (ask.x - ASK_OUT) * s - w;
        const t = (ask.top + 6) * s - 1.15 * f;
        const b = { l, t, r: l + w, b: t + h };
        if (free(b, own ? [...others, own] : others)) return { ...b, where, lines, tail: 0 };
      }
      const t = (ask.top - LIFT) * s - 0.5 * f - h;
      for (const mid of [x, x - w / 2 + 1.4 * f, x + w / 2 - 1.4 * f]) {
        const l = Math.min(width * s - EDGE - w, Math.max(EDGE, mid - w / 2));
        const b = { l, t, r: l + w, b: t + h };
        if (free(b, others)) return { ...b, where: "above", lines, tail: x - l };
      }
    }
  }
  return null;
}
