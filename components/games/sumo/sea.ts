"use client";

import { clamp, hash, lerp } from "./pixels";

/*
 * The sea round the floe, at night, with the northern lights mirrored in it. It is worked out pixel by pixel into a
 * small picture a few times a second and stretched over the stage: ribbons of light that drift and waver, rings of
 * foam where the water meets the ice, glints and the stars' reflections. Tables do the arithmetic, so a frame of it
 * costs about a millisecond.
 */

/** a sea pixel is this many art pixels across: the water is a little coarser than what stands on it */
export const SEA = 2;
/** the water moves this often, ms: the unhurried step of pixel animation */
const TICK_MS = 66;
/** colours come in steps this wide, with an ordered dither between them */
const STEP = 14;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** how far from a ribbon's lower edge its light still counts, sea pixels up and down */
const REACH = 48;
/** foam rings reach this far out from the ice, sea pixels */
const FOAM = 11;

interface Ribbon {
  /** where it hangs, as a share of the height */
  at: number;
  a1: number;
  f1: number;
  w1: number;
  a2: number;
  f2: number;
  w2: number;
  amp: number;
  /** how fast its rays slide along it */
  slide: number;
}

const RIBBONS: Ribbon[] = [
  { at: 0.11, a1: 9, f1: 0.031, w1: 0.23, a2: 4, f2: 0.097, w2: 0.41, amp: 1, slide: 5 },
  { at: 0.93, a1: 8, f1: 0.043, w1: 0.19, a2: 4, f2: 0.12, w2: 0.47, amp: 0.85, slide: -4 },
  { at: 0.5, a1: 30, f1: 0.019, w1: 0.11, a2: 7, f2: 0.071, w2: 0.3, amp: 0.55, slide: 3 },
];

/** the lights' colours: low in the curtain green, going through blue to rose as the round heats up; violet high in it */
const GREEN = [36, 232, 150];
const BLUE = [72, 150, 255];
const ROSE = [255, 72, 160];
const VIOLET = [132, 84, 255];

/** how bright the green and the violet are at each height over a ribbon's edge */
const GREEN_AT = new Float32Array(2 * REACH);
const VIOLET_AT = new Float32Array(2 * REACH);
for (let i = 0; i < 2 * REACH; i++) {
  const dy = i - REACH;
  if (dy >= 0) {
    // under the edge the light stops short
    GREEN_AT[i] = Math.exp(-(dy * dy) / 7);
  } else {
    const fall = Math.exp(-(dy * dy) / 500);
    const low = Math.exp(dy / 9);
    GREEN_AT[i] = fall * low;
    VIOLET_AT[i] = fall * (1 - low) * 0.75;
  }
}

/** the rays in a curtain: brighter and dimmer stripes along it */
const RAYS = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const k = (i / 256) * Math.PI * 2;
  const slow = 0.5 + 0.5 * Math.sin(k * 3 + 1.3) * Math.sin(k * 5 + 0.4);
  RAYS[i] = clamp(0.3 + 0.5 * slow + 0.35 * hash(i >> 1), 0.2, 1);
}

/** one ring of foam, as brightness along the way out from the ice */
const RING = new Float32Array(64);
for (let i = 0; i < 64; i++) RING[i] = i < 10 ? 1 : i < 16 ? 0.35 : 0;

interface Glint {
  x: number;
  y: number;
  len: number;
  phase: number;
  speed: number;
  star: boolean;
}

export class Sea {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private img!: ImageData;
  private px!: Uint32Array;
  /** how light the water is at each pixel, and how far it is from the middle */
  private depth!: Float32Array;
  private far!: Float32Array;
  private edge!: Float32Array[];
  private wob!: Int8Array;
  private glints: Glint[] = [];
  private last = -1e9;

  constructor() {
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d")!;
  }

  /** Fits the sea to a stage `w`×`h` art pixels. */
  resize(w: number, h: number) {
    // an even number of them each way, so that the middle of the sea is the middle of the stage
    const sw = 2 * Math.ceil(w / 2 / SEA);
    const sh = 2 * Math.ceil(h / 2 / SEA);
    if (sw === this.w && sh === this.h) return;
    this.w = sw;
    this.h = sh;
    this.canvas.width = sw;
    this.canvas.height = sh;
    this.img = this.ctx.createImageData(sw, sh);
    this.px = new Uint32Array(this.img.data.buffer);
    this.depth = new Float32Array(sw * sh);
    this.far = new Float32Array(sw * sh);
    this.edge = RIBBONS.map(() => new Float32Array(sw));
    this.wob = new Int8Array(sh);
    const cx = sw / 2;
    const cy = sh / 2;
    const reach = Math.min(sw, sh) * 0.78;
    for (let j = 0; j < sh; j++) {
      for (let i = 0; i < sw; i++) {
        const d = Math.sqrt((i + 0.5 - cx) * (i + 0.5 - cx) + (j + 0.5 - cy) * (j + 0.5 - cy));
        this.far[j * sw + i] = d;
        this.depth[j * sw + i] = clamp(1.12 - d / reach, 0.3, 1);
      }
    }
    this.glints = [];
    const n = Math.round((sw * sh) / 190);
    for (let k = 0; k < n; k++) {
      const star = hash(k * 7 + 1) < 0.3;
      this.glints.push({
        x: hash(k * 7 + 2) * sw,
        y: Math.floor(hash(k * 7 + 3) * sh),
        len: star ? 1 : 2 + Math.floor(hash(k * 7 + 4) * 3),
        phase: hash(k * 7 + 5) * Math.PI * 2,
        speed: 0.6 + hash(k * 7 + 6) * 1.6,
        star,
      });
    }
    this.last = -1e9;
  }

  /**
   * The water at `now`, if it is time for it to move: `r` the floe's radius in art pixels, `heat` from 0 (a calm
   * green sky) to 1 (rose, the round is on a knife's edge), `cheer` from 0 to 1 a brighter sky for the winner.
   */
  update(now: number, r: number, heat: number, cheer: number) {
    if (now - this.last < TICK_MS) return;
    this.last = now;
    const { w, h, px, depth, far, edge, wob } = this;
    const t = now / 1000;
    const rs = r / SEA;
    const from = heat < 0.5 ? GREEN : BLUE;
    const to = heat < 0.5 ? BLUE : ROSE;
    const mix = heat < 0.5 ? heat * 2 : heat * 2 - 1;
    const gr = lerp(from[0], to[0], mix);
    const gg = lerp(from[1], to[1], mix);
    const gb = lerp(from[2], to[2], mix);
    const gain = 0.5 + 0.3 * cheer + 0.1 * heat;
    for (let b = 0; b < RIBBONS.length; b++) {
      const rb = RIBBONS[b];
      const e = edge[b];
      for (let i = 0; i < w; i++) {
        e[i] = h * rb.at + rb.a1 * Math.sin(i * rb.f1 + t * rb.w1 + b * 2.1) + rb.a2 * Math.sin(i * rb.f2 - t * rb.w2 + b);
      }
    }
    for (let j = 0; j < h; j++) wob[j] = Math.round(Math.sin(j * 0.71 + t * 2.3) * 1.1 + Math.sin(j * 0.23 - t * 1.2) * 1.4);
    const slide = RIBBONS.map((rb) => Math.floor(t * rb.slide));
    const ring = Math.floor(t * 9);
    for (let j = 0; j < h; j++) {
      const row = j * w;
      const dx = wob[j];
      const bayer = (j & 3) << 2;
      for (let i = 0; i < w; i++) {
        const q = far[row + i] - rs;
        // under the ice nobody sees it
        if (q < -3) continue;
        const d = depth[row + i];
        let cr = 4 + 9 * d;
        let cg = 9 + 30 * d;
        let cb = 18 + 52 * d;
        const ii = i + dx < 0 ? 0 : i + dx >= w ? w - 1 : i + dx;
        for (let b = 0; b < 3; b++) {
          const dy = Math.round(j - edge[b][ii]) + REACH;
          if (dy < 0 || dy >= 2 * REACH) continue;
          const ray = RAYS[(ii * 3 + slide[b] + b * 71) & 255] * RIBBONS[b].amp * gain;
          const g = GREEN_AT[dy] * ray;
          const v = VIOLET_AT[dy] * ray;
          cr += g * gr + v * VIOLET[0];
          cg += g * gg + v * VIOLET[1];
          cb += g * gb + v * VIOLET[2];
        }
        if (q < FOAM) {
          const f = q < 0 ? 0.5 : RING[(Math.floor(q * 5.4) - ring) & 63] * (1 - q / FOAM);
          cr += f * 46;
          cg += f * 70;
          cb += f * 78;
        }
        const n = (BAYER[bayer + (i & 3)] * STEP) >> 4;
        const r8 = Math.min(255, Math.floor((cr + n) / STEP) * STEP);
        const g8 = Math.min(255, Math.floor((cg + n) / STEP) * STEP);
        const b8 = Math.min(255, Math.floor((cb + n) / STEP) * STEP);
        px[row + i] = 0xff000000 | (b8 << 16) | (g8 << 8) | r8;
      }
    }
    for (const g of this.glints) {
      const on = Math.sin(t * g.speed + g.phase);
      if (on < 0.5) continue;
      const x = Math.floor(g.star ? g.x : (g.x + t * 2.5) % w);
      if (far[g.y * w + x] - rs < 2) continue;
      const c = g.star ? (on > 0.85 ? 0xfffff4e0 : 0xffd9b48c) : on > 0.8 ? 0xffb98c4a : 0xff8c6630;
      for (let k = 0; k < g.len && x + k < w; k++) px[g.y * w + x + k] = c;
    }
    this.ctx.putImageData(this.img, 0, 0);
  }

  /** Makes the next `update` repaint whatever the time. */
  touch() {
    this.last = -1e9;
  }
}
