"use client";

import { Ctx } from "../fx";

const POOL = 420;

export interface Burst {
  /** the way they fly, radians, and how wide a fan round it; a full circle by default */
  dir?: number;
  spread?: number;
  /** ms */
  life?: number;
  /** units across */
  size?: number;
  /** pull down the screen, units/ms² (less than nothing rises) */
  fall?: number;
  /** share of speed kept per ms */
  drag?: number;
}

/**
 * The table's loose bits of light: sparks off a hit, embers behind a hot ball, confetti over a won match. A fixed
 * pool, so a frame makes nothing new; they fall down the screen whichever way the table lies.
 */
export class Bits {
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

  /** `downX`, `downY`: a unit step down the screen, in the units the bits live in. */
  step(dt: number, downX: number, downY: number) {
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
      this.vx[i] = (this.vx[i] + this.fall[i] * downX * dt) * d;
      this.vy[i] = (this.vy[i] + this.fall[i] * downY * dt) * d;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
    }
  }

  draw(ctx: Ctx, snap: (v: number) => number) {
    for (let i = 0; i < this.n; i++) {
      const f = this.life[i] / this.max[i];
      const z = this.size[i] * (f < 0.3 ? 0.5 + f * 1.6 : 1);
      ctx.globalAlpha = Math.min(1, f * 1.6);
      ctx.fillStyle = this.color[i];
      ctx.fillRect(snap(this.x[i] - z / 2), snap(this.y[i] - z / 2), z, z);
    }
    ctx.globalAlpha = 1;
  }

  clear() {
    this.n = 0;
  }
}
