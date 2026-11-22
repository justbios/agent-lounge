"use client";

import { FLOE_R } from "@/lib/live/sumo";
import { Ctx, PX, clamp, dot, hash, lerp, line } from "./pixels";

/*
 * The floe: a thick slab of ice seen from above and a little from the front, so its near side shows. Its rim is
 * rough and capped with snow, it rides a little up and down on the water, its top is old ice with drifts of snow and
 * the marks of skates, and where a hard hit lands it cracks. All of it is drawn from the radius the game gives; none
 * of it is the game's.
 */

const TOP = "#d2eaf7";
const TOP_LIGHT = "#e1f3fc";
const TOP_DEEP = "#c7e3f3";
const LIP = "#f7fcff";
const LIP_SHADE = "#a9d3ea";
const WALL = "#7fbbe0";
const WALL_LIGHT = "#a9d6ef";
const WALL_DARK = "#4688ba";
const WALL_DEEP = "#2f6a9c";
const UNDER = "rgba(44, 120, 160, 0.42)";
const SCRATCH = "#b3d8ec";
const MARK = "#8fc4e2";
const CRACK = "#5e9fc6";
const CRACK_DEEP = "#3f7fae";
const FOAM = "#e9f7ff";
/** how much of the near side shows over the water, art pixels */
const WALL_H = 9;

/** the top of the floe at its widest is painted once, this far each way from its middle */
const FULL = Math.ceil(FLOE_R * PX) + 3;

/** Smooth noise from 0 to 1 over cells `cell` art pixels wide. */
function noise(x: number, y: number, cell: number, seed: number): number {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = x / cell - gx;
  const fy = y / cell - gy;
  const at = (i: number, j: number) => hash((gx + i) * 374761 + (gy + j) * 668265 + seed);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(at(0, 0), at(1, 0), sx), lerp(at(0, 1), at(1, 1), sx), sy);
}

/** The top of the ice: clear patches, drifts of snow, old scratches. Painted once; the rim cuts it to size. */
function paintTop(): HTMLCanvasElement {
  const side = 2 * FULL + 1;
  const c = document.createElement("canvas");
  c.width = side;
  c.height = side;
  const ctx = c.getContext("2d")!;
  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      // drifts lie wider than they are deep, seen from the front
      const v = 0.74 * noise(i * 0.55, j, 38, 11) + 0.26 * noise(i * 0.7, j, 12, 23);
      ctx.fillStyle = v > 0.6 ? TOP_LIGHT : v < 0.36 ? TOP_DEEP : TOP;
      ctx.fillRect(i, j, 1, 1);
    }
  }
  for (let k = 0; k < 22; k++) {
    const a = hash(k * 5 + 400) * Math.PI * 2;
    const d = Math.sqrt(hash(k * 5 + 401)) * (FULL - 8);
    const x = FULL + Math.cos(a) * d;
    const y = FULL + Math.sin(a) * d;
    const way = (hash(k * 5 + 402) - 0.5) * 1.1;
    const len = 6 + hash(k * 5 + 403) * 16;
    line(ctx, Math.round(x), Math.round(y), Math.round(x + Math.cos(way) * len), Math.round(y + Math.sin(way) * len), SCRATCH);
  }
  for (let k = 0; k < 90; k++) {
    const x = Math.floor(hash(k * 3 + 700) * side);
    const y = Math.floor(hash(k * 3 + 701) * side);
    dot(ctx, x, y, hash(k * 3 + 702) < 0.5 ? "#ffffff" : SCRATCH, 1, 1);
  }
  return c;
}

/** how far the rim strays from a true circle at each of 256 places round it, art pixels: never more than a pixel out */
const ROUGH = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const k = (i / 256) * Math.PI * 2;
  ROUGH[i] = -0.9 + 0.8 * Math.sin(k * 5 + 0.7) * Math.sin(k * 3 + 2) + 0.9 * (hash(i >> 2) - 0.5);
}

interface Spans {
  ext: number;
  left: Int16Array;
  right: Int16Array;
}

/** One crack: where it is from the floe's middle, when it came, and its branches as runs of pixels. */
interface Crack {
  x: number;
  y: number;
  at: number;
  reach: number;
  branches: number[][];
}

/** Where the rim is, row by row, for a floe of radius `r` art pixels. */
function spansOf(r: number): Spans {
  const ext = Math.ceil(r) + 2;
  const left = new Int16Array(2 * ext + 1);
  const right = new Int16Array(2 * ext + 1);
  const inside = (x: number, y: number) => {
    const at = Math.round((Math.atan2(y, x) / (Math.PI * 2) + 1) * 256) & 255;
    const rr = r + ROUGH[at];
    return x * x + y * y <= rr * rr;
  };
  for (let j = -ext; j <= ext; j++) {
    const y = j + 0.5;
    const w = Math.ceil(Math.sqrt(Math.max(0, r * r - y * y))) + 2;
    let x1 = w;
    while (x1 >= 0 && !inside(x1 + 0.5, y)) x1--;
    let x0 = -w;
    while (x0 <= 0 && !inside(x0 + 0.5, y)) x0++;
    left[j + ext] = x0;
    right[j + ext] = x1;
  }
  return { ext, left, right };
}

function fill(ctx: Ctx, s: Spans, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  for (let j = -s.ext; j <= s.ext; j++) {
    const x0 = s.left[j + s.ext];
    const x1 = s.right[j + s.ext];
    if (x1 >= x0) ctx.fillRect(x + x0, y + j, x1 - x0 + 1, 1);
  }
}

export class Floe {
  private readonly cache = new Map<number, Spans>();
  private readonly top = paintTop();
  private cracks: Crack[] = [];

  private spans(r: number): Spans {
    const key = Math.round(r * 2);
    let s = this.cache.get(key);
    if (!s) {
      if (this.cache.size > 40) this.cache.clear();
      s = spansOf(key / 2);
      this.cache.set(key, s);
    }
    return s;
  }

  /** A new round on fresh ice. */
  reset() {
    this.cracks = [];
  }

  /**
   * A crack where a hard hit landed, (x, y) art pixels from the floe's middle. `seed` makes the same crack on every
   * screen; `power` is how far it runs.
   */
  crack(x: number, y: number, power: number, seed: number, now: number) {
    const n = 3 + Math.floor(hash(seed) * 3);
    const turn = hash(seed + 1) * Math.PI * 2;
    const branches: number[][] = [];
    for (let b = 0; b < n; b++) {
      let a = turn + (b / n) * Math.PI * 2 + (hash(seed + 10 + b) - 0.5) * 0.9;
      const len = clamp(8 + power * 70, 8, 30) * (0.6 + hash(seed + 20 + b) * 0.6);
      const pts: number[] = [0, 0];
      let px = 0;
      let py = 0;
      for (let d = 0; d < len; d += 4) {
        a += (hash(seed + 30 + b * 16 + d) - 0.5) * 1.1;
        px += Math.cos(a) * 4;
        py += Math.sin(a) * 4;
        pts.push(Math.round(px), Math.round(py));
      }
      branches.push(pts);
    }
    this.cracks.push({ x: Math.round(x), y: Math.round(y), at: now, reach: clamp(8 + power * 70, 8, 30), branches });
    if (this.cracks.length > 14) this.cracks.shift();
  }

  /**
   * The floe of radius `r` art pixels, in the middle of the stage. `marks` are where the wrestlers start, from the
   * middle.
   */
  draw(ctx: Ctx, now: number, r: number, marks: readonly { x: number; y: number }[]) {
    // the floe never moves, so it sits on the art pixels themselves
    const x = 0;
    const y = 0;
    const outer = this.spans(r);
    // it rides the water: the near side shows a pixel more, a pixel less
    const wall = WALL_H + Math.round(Math.sin(now / 1300));
    fill(ctx, this.spans(r + 3), x, y + wall + 4, UNDER);
    fill(ctx, outer, x, y + wall, WALL_DEEP);
    fill(ctx, outer, x, y + wall - 2, WALL_DARK);
    fill(ctx, outer, x, y + wall - 5, WALL);
    // the near side is not smooth: lighter and darker runs down it
    const half = Math.floor(r);
    for (let i = -half + 2; i <= half - 2; i++) {
      const k = hash(i * 17 + 5);
      if (k > 0.3) continue;
      const top = Math.round(Math.sqrt(Math.max(0, r * r - i * i)));
      if (top < 3) continue;
      const len = 2 + Math.floor(hash(i * 17 + 6) * Math.min(5, wall - 3));
      if (k < 0.17) dot(ctx, x + i, y + top + 1, WALL_LIGHT, 1, len);
      else dot(ctx, x + i, y + top + wall - len - 1, WALL_DARK, 1, len);
    }
    // foam where the near side meets the water
    const beat = Math.floor(now / 240);
    for (let i = -half; i <= half; i += 1) {
      const k = hash(i * 31 + beat * 7);
      if (k > 0.42) continue;
      const fy = Math.sqrt(Math.max(0, r * r - i * i)) + wall + (k < 0.12 ? 1 : 0);
      dot(ctx, x + i, y + Math.round(fy), FOAM, k < 0.2 ? 2 : 1, 1);
    }
    // the snow on its lip, and the top inside that
    fill(ctx, outer, x, y, LIP);
    const inner = this.spans(Math.max(1, r - 2));
    fill(ctx, inner, x, y + 1, LIP_SHADE);
    const ext = inner.ext;
    for (let j = -ext; j <= ext; j++) {
      const x0 = inner.left[j + ext];
      const x1 = inner.right[j + ext];
      if (x1 < x0 || Math.abs(j) > FULL) continue;
      const from = Math.max(x0, -FULL);
      const wide = Math.min(x1, FULL) - from + 1;
      if (wide > 0) ctx.drawImage(this.top, from + FULL, j + FULL, wide, 1, x + from, y + j, wide, 1);
    }

    const on = (px: number, py: number, margin: number) => px * px + py * py < (r - margin) * (r - margin);
    // each wrestler's line: a short one across the way to the middle, a step in front of where they stand
    for (const m of marks) {
      const d = Math.sqrt(m.x * m.x + m.y * m.y) || 1;
      const ux = m.x / d;
      const uy = m.y / d;
      const cx = ux * (d - 20);
      const cy = uy * (d - 20) + 3;
      for (let w = 0; w < 2; w++) {
        const ox = cx + ux * w;
        const oy = cy + uy * w;
        if (on(ox, oy, 8)) line(ctx, x + Math.round(ox - uy * 8), y + Math.round(oy + ux * 8), x + Math.round(ox + uy * 8), y + Math.round(oy - ux * 8), MARK);
      }
    }

    // frost catching the light
    for (let i = 0; i < 26; i++) {
      const a = hash(i * 3 + 100) * Math.PI * 2;
      const d = Math.sqrt(hash(i * 3 + 101)) * 118;
      if (d > r - 6) continue;
      const tw = Math.sin(now / 420 + i * 1.9);
      if (tw < 0.55) continue;
      dot(ctx, x + Math.round(Math.cos(a) * d), y + Math.round(Math.sin(a) * d), "#ffffff", tw > 0.9 ? 2 : 1, 1);
    }

    for (const c of this.cracks) {
      const age = now - c.at;
      const grown = clamp(age / 140, 0.15, 1);
      const fresh = age < 110;
      for (const b of c.branches) {
        const upto = Math.max(1, Math.round((b.length / 2 - 1) * grown));
        for (let k = 0; k < upto; k++) {
          const x0 = c.x + b[k * 2];
          const y0 = c.y + b[k * 2 + 1];
          const x1 = c.x + b[k * 2 + 2];
          const y1 = c.y + b[k * 2 + 3];
          if (!on(x0, y0, 3) || !on(x1, y1, 3)) break;
          line(ctx, x + x0 + 1, y + y0 + 1, x + x1 + 1, y + y1 + 1, "#f4fbff");
          line(ctx, x + x0, y + y0, x + x1, y + y1, fresh ? "#ffffff" : k === 0 ? CRACK_DEEP : CRACK);
        }
      }
      if (on(c.x, c.y, 3)) dot(ctx, x + c.x - 1, y + c.y - 1, fresh ? "#ffffff" : CRACK_DEEP, 2, 2);
    }
  }

  /** A short crack running in from the rim at angle `a`, where somebody's weight is on it. */
  strain(ctx: Ctx, r: number, a: number, depth: number, seed: number) {
    const x = 0;
    const y = 0;
    let px = Math.cos(a) * (r - 1);
    let py = Math.sin(a) * (r - 1);
    let turn = a + Math.PI;
    for (let k = 0; k < depth; k += 3) {
      turn += (hash(seed + k) - 0.5) * 1.2;
      const nx = px + Math.cos(turn) * 3;
      const ny = py + Math.sin(turn) * 3;
      line(ctx, x + Math.round(px), y + Math.round(py), x + Math.round(nx), y + Math.round(ny), CRACK);
      px = nx;
      py = ny;
    }
  }
}
