"use client";

/*
 * What the sumo floe is drawn with: a stage measured in art pixels with the floe in its middle, and the few pixel
 * shapes everything on it is made of. An art pixel is half a game unit. Every shape is rows of whole art pixels hung
 * on one corner, so a wrestler slides smoothly (the corner snaps to the device's pixels) and still never blurs.
 */

export type Ctx = CanvasRenderingContext2D;

export const INK = "#07050d";
/** art pixels to a game unit */
export const PX = 2;
/** art pixels across the stage's shorter side: the floe at its widest and the sea round it */
export const SHORT = 328;
/** a little more sea than that or a little less is shown where it makes an art pixel a whole number of the screen's */
const LESS = 0.93;
const MORE = 1.08;

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/** 0 to 1 and back out again, slow at both ends */
export const ease = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
/** quick out of the start, slow into the end */
export const easeOut = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : 1 - (1 - k) * (1 - k));

/** A number from 0 to 1 out of a whole one, the same every time. */
export function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** The viewer asked for less motion. */
export function calm(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The canvas as a stage in art pixels. Its shorter side shows about SHORT of them and the longer side more sea. One
 * art pixel is a whole number `k` of the canvas's own pixels; where the screen allows, of the screen's own too, so
 * nothing is scaled on the way to the glass.
 */
export class Stage {
  k = 0;
  /** art pixels across and down; not always whole ones */
  w = SHORT;
  h = SHORT;
  private resized = true;
  private readonly watch: ResizeObserver | null;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.fit(null);
    this.watch = typeof ResizeObserver === "function" ? new ResizeObserver((es) => this.fit(es[0] ?? null)) : null;
    try {
      this.watch?.observe(canvas, { box: "device-pixel-content-box" });
    } catch {
      this.watch?.observe(canvas);
    }
  }

  private fit(e: ResizeObserverEntry | null) {
    const dpr = window.devicePixelRatio || 1;
    // the box in the screen's own pixels: as the browser counts them, unless that disagrees with what it says a pixel is
    const lw = this.canvas.clientWidth * dpr;
    const lh = this.canvas.clientHeight * dpr;
    const box = e?.devicePixelContentBoxSize?.[0];
    const sure = !!box && lw > 0 && Math.abs(box.inlineSize / lw - 1) < 0.05;
    const bw = (sure ? box.inlineSize : Math.round(lw)) || SHORT * 2;
    const bh = (sure ? box.blockSize : Math.round(lh)) || SHORT * 2;
    const want = Math.min(bw, bh) / SHORT;
    const whole = Math.round(want);
    const exact = whole >= 2 && whole <= 6 && want > whole * LESS && want < whole * MORE;
    const k = exact ? whole : clamp(Math.ceil(want - 0.12), 2, 6);
    const cw = exact ? bw : Math.round((bw / want) * k);
    const ch = exact ? bh : Math.round((bh / want) * k);
    this.canvas.style.imageRendering = exact || want > k ? "pixelated" : "auto";
    if (k === this.k && cw === this.canvas.width && ch === this.canvas.height) return;
    this.k = k;
    this.w = cw / k;
    this.h = ch / k;
    this.canvas.width = cw;
    this.canvas.height = ch;
    this.resized = true;
  }

  /** True once after the size changed: time to remake whatever was painted for the old one. */
  takeResize(): boolean {
    const r = this.resized;
    this.resized = false;
    return r;
  }

  /** Draws in art pixels from here on, (0, 0) in the middle of the stage, the whole picture moved by a shake. */
  begin(ctx: Ctx, dx = 0, dy = 0) {
    const k = this.k;
    const x = Math.round(this.canvas.width / 2) + Math.round(dx * k);
    const y = Math.round(this.canvas.height / 2) + Math.round(dy * k);
    ctx.setTransform(k, 0, 0, k, x, y);
    ctx.imageSmoothingEnabled = false;
  }

  /** A position snapped to the canvas's own pixels. */
  snap(v: number): number {
    return Math.round(v * this.k) / this.k;
  }

  /** The corner to hang a shape on so that its middle pixel sits on `v`. */
  hang(v: number): number {
    return Math.round((v - 0.5) * this.k) / this.k;
  }

  /** Where a pointer is, in art pixels from the middle of the stage. */
  at(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const scale = r.width / this.w || 1;
    return { x: (e.clientX - r.left - r.width / 2) / scale, y: (e.clientY - r.top - r.height / 2) / scale };
  }

  dispose() {
    this.watch?.disconnect();
  }
}

/** One art pixel, or a row or a block of them, hung on the corner (x, y). */
export function dot(ctx: Ctx, x: number, y: number, color: string, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/**
 * A pixel oval round the middle pixel hung on (x, y): `a` art pixels to each side along the way (ux, uy) and `b`
 * across it. Turned and stretched freely, it is still rows of whole pixels. `from` and `to` keep only those rows of
 * it, counted down from the middle: a band across it.
 */
export function blob(
  ctx: Ctx,
  x: number,
  y: number,
  a: number,
  b: number,
  ux: number,
  uy: number,
  color: string,
  from = -Infinity,
  to = Infinity,
) {
  ctx.fillStyle = color;
  const a2 = (a + 0.4) * (a + 0.4);
  const b2 = (b + 0.4) * (b + 0.4);
  const A = (ux * ux) / a2 + (uy * uy) / b2;
  const k = ux * uy * (1 / a2 - 1 / b2);
  const c = (uy * uy) / a2 + (ux * ux) / b2;
  const ext = Math.ceil(Math.max(a, b)) + 1;
  for (let j = Math.max(-ext, from); j <= Math.min(ext, to); j++) {
    const B = 2 * j * k;
    const C = j * j * c - 1;
    const disc = B * B - 4 * A * C;
    if (disc < 0) continue;
    const q = Math.sqrt(disc);
    const x0 = Math.ceil((-B - q) / (2 * A));
    const x1 = Math.floor((-B + q) / (2 * A));
    if (x1 >= x0) ctx.fillRect(x + x0, y + j, x1 - x0 + 1, 1);
  }
}

/** A round pixel disc of radius `r` round the middle pixel hung on (x, y). */
export function disc(ctx: Ctx, x: number, y: number, r: number, color: string) {
  blob(ctx, x, y, r, r, 1, 0, color);
}

/** A small picture from rows of letters, each letter a colour of `pal` and a dot nothing; `flip` mirrors it. */
export function stamp(
  ctx: Ctx,
  rows: readonly string[],
  x: number,
  y: number,
  pal: Readonly<Record<string, string>>,
  flip = false,
) {
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    for (let i = 0; i < row.length; i++) {
      const c = pal[row[flip ? row.length - 1 - i : i]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x + i, y + j, 1, 1);
    }
  }
}

/** A one-pixel line from one pixel to another. */
export function line(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, color: string) {
  ctx.fillStyle = color;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const n = Math.max(1, Math.ceil(Math.max(dx, dy)));
  for (let i = 0; i <= n; i++) {
    ctx.fillRect(Math.round(lerp(x0, x1, i / n)), Math.round(lerp(y0, y1, i / n)), 1, 1);
  }
}

/**
 * A pixel ring of radius `r` round (x, y), every `gap`-th pixel of it (1 for all), turned by `turn` pixels along the
 * ring. `keep` leaves out the pixels it says no to, as the part of a ripple that would lie on the ice. `flat` under 1
 * makes it an oval that much lower than it is wide: a ring lying on the water, seen from the front.
 */
export function hoop(
  ctx: Ctx,
  x: number,
  y: number,
  r: number,
  color: string,
  gap = 1,
  turn = 0,
  keep?: (px: number, py: number) => boolean,
  flat = 1,
) {
  ctx.fillStyle = color;
  const n = Math.max(8, Math.ceil(r * 6.4));
  let lastX = NaN;
  let lastY = NaN;
  let count = Math.floor(turn);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const px = Math.round(x + Math.cos(a) * r);
    const py = Math.round(y + Math.sin(a) * r * flat);
    if (px === lastX && py === lastY) continue;
    lastX = px;
    lastY = py;
    count += 1;
    if (gap > 1 && count % gap) continue;
    if (keep && !keep(px, py)) continue;
    ctx.fillRect(px, py, 1, 1);
  }
}
