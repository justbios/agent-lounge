/**
 * Where the hall's name plates go so that none runs into another. A plate first takes the board's place: over the
 * head in the far row, under the chair and towards the outer side in the near one. Where that would overlap a plate
 * already placed, it tries the middle or the other side, then just below the plates in its way (above them, in the far
 * row); only then do all the plates step down to a smaller size, and only past that do they give way to numbers.
 */

export interface PlateIn {
  key: string;
  /** the seat's anchor in the room's own pixels: over the head in the far row, under the chair's middle in the near */
  x: number;
  y: number;
  kind: "far" | "near" | "free";
  side: 0 | 1;
  name: string;
  /** the state row's words; none for free seats */
  state?: string;
}

export interface PlateSpot {
  /** the plate's left and top edge, in screen pixels from the room's top left */
  left: number;
  top: number;
}

export interface PlatePlan {
  /** the name row's and the state row's font sizes, in screen pixels */
  font: number;
  small: number;
  spots: Map<string, PlateSpot>;
}

export type Measure = (text: string, font: string) => number;

/** the smallest the plates may get: the board's 3× size first, a step smaller only when they would collide */
const STEPS = [
  { name: 16, state: 13 },
  { name: 14, state: 12 },
];
/** room pixels between a near plate's edge and its chair's middle, as on the board */
const NUDGE = 6;
/** screen pixels kept between two plates */
const GAP = 3;

/** How big a plate is at these font sizes, after the CSS in globals.css (.hall-plate). */
function sizeOf(p: PlateIn, f: number, sf: number, family: string, measure: Measure) {
  const border = Math.max(2, 0.15 * f);
  const nameW = Math.min(measure(p.name, `600 ${f}px ${family}`) + 1.2 * f, 16 * f - 2 * border);
  const stateW = p.state ? measure(p.state, `600 ${sf}px ${family}`) + sf * (0.5 + 0.4375 + 1.5) : 0;
  const w = Math.ceil(Math.max(nameW, stateW) + 2 * border) + 1;
  const h = Math.ceil(f * 1.55 + (p.state ? sf * 1.625 : 0) + 2 * border);
  return { w, h };
}

interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

/** The places a plate may take in its own row, best first: the board's own place, then the middle or the other side. */
function options(p: PlateIn, s: number, w: number, h: number): Box[] {
  const x = p.x * s;
  const y = p.y * s;
  const n = NUDGE * s;
  const top = p.kind === "far" ? y - h - 2 : y;
  const at = (l: number): Box => ({ l, t: top, r: l + w, b: top + h });
  const mid = at(x - w / 2);
  // outwards: away from the pod's middle, as the board has the near row; inwards: the other way
  const out = at(p.side ? x - n : x + n - w);
  const inward = at(p.side ? x + n - w : x - n);
  if (p.kind === "free") return [mid, at(x - n), at(x + n - w)];
  return p.kind === "far" ? [mid, out, inward] : [out, mid, inward];
}

/** The same place moved down (or up, over the far row) just past every plate it would touch, or null if too far. */
function stagger(b: Box, placed: Box[], up: boolean, limit: number): Box | null {
  let box = b;
  for (let k = 0; k < 4; k++) {
    const hit = placed.filter((o) => hits(o, box));
    if (!hit.length) return Math.abs(box.t - b.t) <= limit ? box : null;
    const dy = up ? Math.min(...hit.map((o) => o.t)) - GAP - box.b : Math.max(...hit.map((o) => o.b)) + GAP - box.t;
    box = { l: box.l, r: box.r, t: box.t + dy, b: box.b + dy };
  }
  return null;
}

const hits = (a: Box, b: Box) => a.l < b.r + GAP && b.l < a.r + GAP && a.t < b.b + GAP && b.t < a.b + GAP;

/**
 * Places every plate at the board's size scaled to the room (`s` screen pixels to a room pixel, `width` the room's
 * width in room pixels), or null when even the smaller plates cannot all fit without touching.
 */
export function placePlates(list: PlateIn[], s: number, width: number, family: string, measure: Measure): PlatePlan | null {
  const tried = new Set<number>();
  for (const step of STEPS) {
    const font = Math.max(step.name, (20 * s) / 4.5);
    const small = Math.max(step.state, (16 * s) / 4.5);
    if (tried.has(font)) continue;
    tried.add(font);
    const placed: Box[] = [];
    const spots = new Map<string, PlateSpot>();
    let ok = true;
    for (const p of list) {
      const { w, h } = sizeOf(p, font, small, family, measure);
      const free = (b: Box) => !placed.some((o) => hits(o, b));
      const inside = (b: Box) => b.l >= 0 && b.r <= width * s && b.t >= 0;
      const base = options(p, s, w, h);
      const moved = base.map((b) => stagger(b, placed, p.kind === "far", 2.5 * h)).filter((b): b is Box => b != null);
      const opts = [...base, ...moved];
      const pick = opts.find((b) => inside(b) && free(b)) ?? opts.find(free);
      if (!pick) {
        ok = false;
        break;
      }
      placed.push(pick);
      spots.set(p.key, { left: pick.l, top: pick.t });
    }
    if (ok) return { font, small, spots };
  }
  return null;
}
