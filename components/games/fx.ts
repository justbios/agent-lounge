"use client";

import { tr, uiNow } from "@/lib/i18n";
import { sfx } from "@/lib/live/sfx";
import { rgba } from "../cafe/pixel";

/*
 * What the arcade games for two share on their canvases: a screen drawn in game units at a whole number of device
 * pixels each, sprites and layers painted once at that scale, soft glows, sparks and confetti, a fading streak, a
 * shake and a flash, the 3×5 digits of an old scoreboard, and the big words that pop up over the table.
 */

export type Ctx = CanvasRenderingContext2D;

export const MINE = "#ffd25a";
export const THEIRS = "#8fb3ff";
/** the second other player, in a game for three */
export const THIRD = "#ff7aa8";
export const INK = "#07050d";

/** most device pixels one game unit gets; past it the browser scales the canvas up, which stays sharp pixelated */
const MAX_K = 8;

/** The viewer asked for less motion: the table neither shakes nor flashes. */
export function calm(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A canvas drawn in game units: the play area `w`×`h` with a `pad` border round it, each unit a whole number `k` of
 * device pixels, close to the size the canvas is shown at. Layers and sprites painted at `k` are redone when it
 * changes, which `resized` says once.
 */
export class Screen {
  k = 0;
  resized = false;
  private readonly watch: ResizeObserver | null;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly w: number,
    readonly h: number,
    readonly pad = 0,
  ) {
    this.fit();
    this.watch = typeof ResizeObserver === "function" ? new ResizeObserver(() => this.fit()) : null;
    this.watch?.observe(canvas);
  }

  get fullW() {
    return this.w + 2 * this.pad;
  }

  get fullH() {
    return this.h + 2 * this.pad;
  }

  private fit() {
    const shown = (this.canvas.clientWidth || this.fullW * 3) * (window.devicePixelRatio || 1);
    const k = Math.max(2, Math.min(MAX_K, Math.round(shown / this.fullW)));
    this.canvas.style.imageRendering = shown > this.fullW * k * 1.05 ? "pixelated" : "auto";
    if (k === this.k) return;
    this.k = k;
    this.canvas.width = this.fullW * k;
    this.canvas.height = this.fullH * k;
    this.resized = true;
  }

  /** True once after the scale changed: time to repaint the layers and sprites. */
  takeResize(): boolean {
    const r = this.resized;
    this.resized = false;
    return r;
  }

  /** Draws in game units from here on, (0, 0) at the play area's corner, the whole table moved by a shake. */
  begin(ctx: Ctx, dx = 0, dy = 0) {
    ctx.setTransform(this.k, 0, 0, this.k, Math.round((this.pad + dx) * this.k), Math.round((this.pad + dy) * this.k));
  }

  /** A position snapped to whole device pixels: a sprite slides smoothly yet never blurs. */
  snap(v: number): number {
    return Math.round(v * this.k) / this.k;
  }

  /** Where a pointer is over the play area, in game units. */
  at(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * this.fullW - this.pad,
      y: ((e.clientY - r.top) / r.height) * this.fullH - this.pad,
    };
  }

  /** A canvas the size of this one, painted once in the same game units. */
  layer(paint: (ctx: Ctx) => void): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const ctx = c.getContext("2d")!;
    this.begin(ctx);
    paint(ctx);
    return c;
  }

  /** Draws a layer over the whole canvas, moved with the shake. */
  blit(ctx: Ctx, layer: HTMLCanvasElement, dx = 0, dy = 0) {
    ctx.setTransform(1, 0, 0, 1, Math.round(dx * this.k), Math.round(dy * this.k));
    ctx.drawImage(layer, 0, 0);
  }

  /** A sprite `size` units square, painted once at this scale with (0, 0) in its top-left corner. */
  sprite(size: number, paint: (ctx: Ctx) => void): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = c.height = Math.ceil(size * this.k);
    const ctx = c.getContext("2d")!;
    ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
    paint(ctx);
    return c;
  }

  /** Draws a sprite centred on (x, y), snapped to device pixels. */
  stamp(ctx: Ctx, spr: HTMLCanvasElement, x: number, y: number) {
    const size = spr.width / this.k;
    ctx.drawImage(spr, this.snap(x - size / 2), this.snap(y - size / 2), size, size);
  }

  dispose() {
    this.watch?.disconnect();
  }
}

/** A pixel disc of radius `r` units centred on (cx, cy), drawn as rows of whole units. */
export function disc(ctx: Ctx, cx: number, cy: number, r: number, color: string) {
  ctx.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy) + 0.3);
    ctx.fillRect(cx - w - 0.5, cy + dy - 0.5, 2 * w + 1, 1);
  }
}

/** A one-unit pixel ring of radius `r` round (cx, cy); `from`…`to` keep only that arc, in radians. */
export function ring(ctx: Ctx, cx: number, cy: number, r: number, color: string, from = 0, to = Math.PI * 2) {
  ctx.fillStyle = color;
  const seen = new Set<number>();
  const n = Math.ceil(r * 8);
  for (let i = 0; i <= n; i++) {
    const a = from + ((to - from) * i) / n;
    const x = Math.round(cx + Math.cos(a) * r - 0.5);
    const y = Math.round(cy + Math.sin(a) * r - 0.5);
    const key = x * 4096 + y;
    if (seen.has(key)) continue;
    seen.add(key);
    ctx.fillRect(x, y, 1, 1);
  }
}

const glows = new Map<string, HTMLCanvasElement>();

/** A soft light of radius `r` round (x, y), added to what is under it; painted once per colour and stretched. */
export function glow(ctx: Ctx, x: number, y: number, r: number, color: string, a: number) {
  if (a <= 0.01) return;
  let g = glows.get(color);
  if (!g) {
    g = document.createElement("canvas");
    g.width = g.height = 64;
    const c = g.getContext("2d")!;
    const grad = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, rgba(color, 0.9));
    grad.addColorStop(0.3, rgba(color, 0.4));
    grad.addColorStop(1, rgba(color, 0));
    c.fillStyle = grad;
    c.fillRect(0, 0, 64, 64);
    glows.set(color, g);
  }
  const op = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = Math.min(1, a);
  ctx.drawImage(g, x - r, y - r, 2 * r, 2 * r);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = op;
}

const POOL = 320;

interface Burst {
  /** the way they fly, radians, and how wide a fan round it; a full circle by default */
  dir?: number;
  spread?: number;
  /** ms */
  life?: number;
  /** units across */
  size?: number;
  /** pull down, units/ms² */
  fall?: number;
  /** share of speed kept per ms */
  drag?: number;
}

/** Short-lived bits of light — sparks off a hit, confetti at the end — in a fixed pool, so a frame makes nothing new. */
export class Sparks {
  private n = 0;
  private readonly x = new Float32Array(POOL);
  private readonly y = new Float32Array(POOL);
  private readonly vx = new Float32Array(POOL);
  private readonly vy = new Float32Array(POOL);
  private readonly life = new Float32Array(POOL);
  private readonly max = new Float32Array(POOL);
  private readonly size = new Float32Array(POOL);
  private readonly fall = new Float32Array(POOL);
  private readonly drag = new Float32Array(POOL);
  private readonly color: string[] = new Array<string>(POOL).fill("#ffffff");

  /** `count` bits from (x, y) at up to `speed` units/ms, each in one of `colors`. */
  burst(x: number, y: number, count: number, speed: number, colors: readonly string[], o: Burst = {}) {
    const spread = o.spread ?? Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const j = this.n < POOL ? this.n++ : Math.floor(Math.random() * POOL);
      const a = (o.dir ?? 0) + (Math.random() - 0.5) * spread;
      const v = speed * (0.3 + Math.random() * 0.7);
      this.x[j] = x;
      this.y[j] = y;
      this.vx[j] = Math.cos(a) * v;
      this.vy[j] = Math.sin(a) * v;
      this.max[j] = this.life[j] = (o.life ?? 420) * (0.6 + Math.random() * 0.4);
      this.size[j] = o.size ?? 1;
      this.fall[j] = o.fall ?? 0;
      this.drag[j] = o.drag ?? 0.996;
      this.color[j] = colors[Math.floor(Math.random() * colors.length)];
    }
  }

  step(dt: number) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const last = --this.n;
        this.x[i] = this.x[last];
        this.y[i] = this.y[last];
        this.vx[i] = this.vx[last];
        this.vy[i] = this.vy[last];
        this.life[i] = this.life[last];
        this.max[i] = this.max[last];
        this.size[i] = this.size[last];
        this.fall[i] = this.fall[last];
        this.drag[i] = this.drag[last];
        this.color[i] = this.color[last];
        i--;
        continue;
      }
      const d = Math.pow(this.drag[i], dt);
      this.vy[i] += this.fall[i] * dt;
      this.vx[i] *= d;
      this.vy[i] *= d;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
    }
  }

  draw(ctx: Ctx, s: Screen) {
    for (let i = 0; i < this.n; i++) {
      const f = this.life[i] / this.max[i];
      const z = this.size[i] * (f < 0.3 ? 0.5 + f * 1.6 : 1);
      ctx.globalAlpha = Math.min(1, f * 1.6);
      ctx.fillStyle = this.color[i];
      ctx.fillRect(s.snap(this.x[i] - z / 2), s.snap(this.y[i] - z / 2), z, z);
    }
    ctx.globalAlpha = 1;
  }

  clear() {
    this.n = 0;
  }
}

/** The last few places something was, for a fading streak behind it. */
export class Trail {
  private readonly xs: Float32Array;
  private readonly ys: Float32Array;
  private at = 0;
  private len = 0;

  constructor(private readonly n: number) {
    this.xs = new Float32Array(n);
    this.ys = new Float32Array(n);
  }

  push(x: number, y: number) {
    this.xs[this.at] = x;
    this.ys[this.at] = y;
    this.at = (this.at + 1) % this.n;
    this.len = Math.min(this.n, this.len + 1);
  }

  clear() {
    this.len = 0;
  }

  /** Oldest faintest and smallest, up to `size` units across at the newest end, added to what is under it. */
  draw(ctx: Ctx, s: Screen, color: string, size: number, a: number) {
    if (a <= 0.01 || this.len < 2) return;
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = color;
    for (let i = 0; i < this.len; i++) {
      const j = (this.at - this.len + i + this.n) % this.n;
      const f = (i + 1) / this.len;
      const z = size * (0.35 + 0.65 * f);
      ctx.globalAlpha = a * f * f;
      ctx.fillRect(s.snap(this.xs[j] - z / 2), s.snap(this.ys[j] - z / 2), z, z);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = op;
  }
}

/** A short shake of the whole table and a flash of colour over it; neither for a viewer who asked for less motion. */
export class Jolt {
  /** this frame's shake, units */
  dx = 0;
  dy = 0;
  private shakeEnd = 0;
  private shakeMs = 1;
  private mag = 0;
  private flashEnd = 0;
  private flashMs = 1;
  private flashA = 0;
  private flashColor = "#ffffff";

  shake(mag: number, ms: number, now: number) {
    if (calm()) return;
    this.mag = mag;
    this.shakeMs = ms;
    this.shakeEnd = now + ms;
  }

  flash(color: string, a: number, ms: number, now: number) {
    if (calm()) return;
    this.flashColor = color;
    this.flashA = a;
    this.flashMs = ms;
    this.flashEnd = now + ms;
  }

  update(now: number) {
    const left = (this.shakeEnd - now) / this.shakeMs;
    if (left <= 0) {
      this.dx = this.dy = 0;
      return;
    }
    const m = this.mag * left * left;
    this.dx = (Math.random() * 2 - 1) * m;
    this.dy = (Math.random() * 2 - 1) * m;
  }

  /** The flash over the rectangle given in game units. */
  overlay(ctx: Ctx, x: number, y: number, w: number, h: number, now: number) {
    const left = (this.flashEnd - now) / this.flashMs;
    if (left <= 0) return;
    ctx.globalAlpha = this.flashA * left;
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
  }
}

/** 3×5 digits, row by row, 1 where a block is lit */
export const FONT = [
  "111101101101111",
  "010110010010111",
  "111001111100111",
  "111001111001111",
  "101101111001001",
  "111100111001111",
  "111100111101111",
  "111001001001001",
  "111101111101111",
  "111101111001111",
];

/** How wide a number is in scoreboard digits `cell` units a block. */
export const digitsW = (text: string, cell: number) => (text.length * 4 - 1) * cell;

/** A number in the 3×5 blocks of an old scoreboard, `cell` units a block, its top-left corner at (x, y). */
export function digits(ctx: Ctx, text: string, x: number, y: number, cell: number, color: string) {
  ctx.fillStyle = color;
  for (let i = 0; i < text.length; i++) {
    const g = FONT[text.charCodeAt(i) - 48];
    if (!g) continue;
    for (let b = 0; b < 15; b++) {
      if (g[b] === "1") ctx.fillRect(x + (i * 4 + (b % 3)) * cell, y + Math.floor(b / 3) * cell, cell, cell);
    }
  }
}

/** Things to happen a little later on the game's own clock: the countdown's beats, the fanfare at the end. */
export class Cues {
  private list: { at: number; run: () => void }[] = [];

  at(t: number, run: () => void) {
    this.list.push({ at: t, run });
  }

  run(now: number) {
    for (let i = 0; i < this.list.length; ) {
      if (this.list[i].at > now) {
        i++;
        continue;
      }
      const [c] = this.list.splice(i, 1);
      c.run();
    }
  }

  clear() {
    this.list.length = 0;
  }
}

/** Big words over the table — «3», «ГОЛ!» — that pop in and fade; for less motion they only fade. */
export function pop(el: HTMLElement | null, text: string, color: string, ms = 760) {
  if (!el) return;
  el.textContent = text;
  el.style.color = color;
  for (const a of el.getAnimations()) a.cancel();
  const at = "translate(-50%, -50%)";
  el.animate(
    calm()
      ? [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }]
      : [
          { opacity: 0, transform: `${at} scale(2.4)` },
          { opacity: 1, transform: `${at} scale(1)`, offset: 0.2 },
          { opacity: 1, transform: `${at} scale(1)`, offset: 0.72 },
          { opacity: 0, transform: `${at} scale(0.85)` },
        ],
    { duration: ms, easing: "ease-out" },
  );
}

/** A score that just went up: it jumps. */
export function bump(el: HTMLElement | null) {
  if (!el || calm()) return;
  el.animate([{ transform: "scale(1.7)" }, { transform: "scale(1)" }], { duration: 320, easing: "ease-out" });
}

/** «3», «2», «1» a beat apart, then «GO!» at `go`, each with its tick. */
export function countdown(cues: Cues, el: () => HTMLElement | null, now: number, go: number) {
  const beat = Math.min(500, (go - now) / 3);
  for (let i = 3; i >= 1; i--) {
    cues.at(go - i * beat, () => {
      pop(el(), String(i), "#ffffff", beat * 1.5);
      sfx("count");
    });
  }
  cues.at(go, () => {
    pop(el(), tr(uiNow(), "ГРАЙ!", "GO!"), MINE);
    sfx("go");
  });
}
