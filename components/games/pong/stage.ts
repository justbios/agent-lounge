"use client";

import { H, W } from "@/lib/live/pong";
import { Ctx, Screen } from "../fx";

/** The camera over the table for one frame: a shake in units, and a push in towards a point of the canvas. */
export interface Cam {
  dx: number;
  dy: number;
  zoom: number;
  /** what the push in holds still, in table units */
  x: number;
  y: number;
}

/**
 * The table on its canvas. Everything is drawn in the table's own units, 160 by 100 with the viewer's paddle on the
 * left; on a narrow upright screen the same table stands on end, the viewer's paddle at the bottom, and only this
 * class knows. Words and digits go through `upright`, so they are never turned with it.
 */
export class Stage {
  screen: Screen;

  constructor(
    readonly canvas: HTMLCanvasElement,
    public tall: boolean,
  ) {
    this.screen = this.make();
  }

  private make(): Screen {
    return this.tall ? new Screen(this.canvas, H, W) : new Screen(this.canvas, W, H);
  }

  /** Lays the table down or stands it up; true when that changed. */
  turn(tall: boolean): boolean {
    if (tall === this.tall) return false;
    this.screen.dispose();
    this.tall = tall;
    this.screen = this.make();
    this.screen.resized = true;
    return true;
  }

  get k(): number {
    return this.screen.k;
  }

  takeResize(): boolean {
    return this.screen.takeResize();
  }

  snap(v: number): number {
    return this.screen.snap(v);
  }

  /** A unit step down the screen, in table units: where shadows fall and confetti drops. */
  get downX(): number {
    return this.tall ? -1 : 0;
  }

  get downY(): number {
    return this.tall ? 0 : 1;
  }

  /** A unit step to the right of the screen, in table units. */
  get rightX(): number {
    return this.tall ? 0 : 1;
  }

  get rightY(): number {
    return this.tall ? 1 : 0;
  }

  /** Where a table point is on the canvas, in device pixels. */
  private px(x: number, y: number): [number, number] {
    return this.tall ? [y * this.k, (W - x) * this.k] : [x * this.k, y * this.k];
  }

  /** Draws in table units from here on, as the camera sees it. */
  begin(ctx: Ctx, cam?: Cam) {
    const k = this.k;
    const z = cam?.zoom ?? 1;
    const [cx, cy] = cam ? this.px(cam.x, cam.y) : [0, 0];
    const ox = Math.round(z * ((cam?.dx ?? 0) * k - cx) + cx);
    const oy = Math.round(z * ((cam?.dy ?? 0) * k - cy) + cy);
    if (this.tall) ctx.setTransform(0, -k * z, k * z, 0, ox, oy + Math.round(z * W * k));
    else ctx.setTransform(k * z, 0, 0, k * z, ox, oy);
  }

  /** From here until `ctx.restore()`, draws the right way up round a table point, in units. */
  upright(ctx: Ctx, x: number, y: number, scaleX = 1, scaleY = 1) {
    ctx.save();
    if (this.tall) ctx.transform(0, 1, -1, 0, x, y);
    else ctx.translate(x, y);
    if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY);
  }

  /** A canvas the size of this one, painted once in table units. */
  layer(paint: (ctx: Ctx) => void): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const ctx = c.getContext("2d")!;
    this.begin(ctx);
    paint(ctx);
    return c;
  }

  /** Draws a layer over the whole canvas, as the camera sees it. */
  blit(ctx: Ctx, layer: HTMLCanvasElement, cam?: Cam) {
    const k = this.k;
    const z = cam?.zoom ?? 1;
    const [cx, cy] = cam ? this.px(cam.x, cam.y) : [0, 0];
    ctx.setTransform(z, 0, 0, z, Math.round(z * ((cam?.dx ?? 0) * k - cx) + cx), Math.round(z * ((cam?.dy ?? 0) * k - cy) + cy));
    ctx.drawImage(layer, 0, 0);
  }

  /** The height on the table a pointer points at: down the screen on a lying table, across it on a standing one. */
  at(e: { clientX: number; clientY: number }): number {
    const r = this.canvas.getBoundingClientRect();
    return this.tall ? ((e.clientX - r.left) / r.width) * H : ((e.clientY - r.top) / r.height) * H;
  }

  dispose() {
    this.screen.dispose();
  }
}
