export type Ctx = CanvasRenderingContext2D;
export type Box = [number, number, number, number];
export type Rect = [number, number, number, number, string];

export const LINE = "#110e18";

export function px(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

/** Outlines the silhouette boxes first, then paints the fills, so inner seams stay outline-free. */
export function paint(ctx: Ctx, silhouette: Box[], fills: Rect[]) {
  for (const [x, y, w, h] of silhouette) px(ctx, x - 1, y - 1, w + 2, h + 2, LINE);
  for (const [x, y, w, h, c] of fills) px(ctx, x, y, w, h, c);
}

export function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function shade(hex: string, f: number): string {
  const [r, g, b] = hexRgb(hex);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Deterministic 0..1 noise, so the room looks the same on every render. */
export function rand(seed: number): number {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function glow(ctx: Ctx, x: number, y: number, r: number, hex: string, a: number) {
  if (a <= 0.001) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(hex, a));
  g.addColorStop(1, rgba(hex, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
