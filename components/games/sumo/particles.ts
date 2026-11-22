"use client";

import { Ctx, Stage, clamp, dot, hash, hoop, stamp } from "./pixels";

/*
 * The small things that fly on the floe and round it: drops of a splash, crumbs of ice, the stars and the ring of a
 * hard hit, bubbles, the pieces of a block of ice, confetti, snow, and the ripples they leave on the water. They are
 * the picture's own: nothing here is read by the game.
 */

type Kind = "drop" | "crumb" | "dust" | "star" | "bubble" | "shard" | "sweat" | "steam" | "confetti" | "chunk";

interface Bit {
  kind: Kind;
  x: number;
  y: number;
  /** height over the ground, and how fast it climbs, for the ones that fly in an arc */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  color: string;
  n: number;
}

interface Ripple {
  x: number;
  y: number;
  r0: number;
  r1: number;
  at: number;
  life: number;
  /** a hit's ring on the ice rather than a ripple on the water */
  shock: boolean;
}

interface Plume {
  x: number;
  y: number;
  at: number;
  big: boolean;
}

/** what pulls a flying bit down, art pixels/ms² */
const FALL = 0.0009;
/** a ring on the water is this much lower than it is wide, seen from the front */
const FLAT = 0.62;
/** a splash's column stands this long, ms */
const PLUME_MS = 640;
const MOST = 420;
const WATER = ["#ffffff", "#d6eeff", "#9fd4f5", "#62b0e6"];
const ICE = ["#ffffff", "#e6f5fc", "#bfe3f5"];
const STARS = ["#fff4c2", "#ffd25a", "#ffffff"];
const STAR_A = [".K.", "KKK", ".K."];
const STAR_B = ["K.K", ".K.", "K.K"];
const STAR_BIG = ["..K..", "..K..", "KKKKK", "..K..", "..K.."];

export class Fx {
  private bits: Bit[] = [];
  private ripples: Ripple[] = [];
  private plumes: Plume[] = [];
  private readonly snow: { x: number; y: number; v: number; sway: number }[] = [];
  private seed = 1;

  private rnd(): number {
    return hash(this.seed++);
  }

  private add(b: Bit) {
    if (this.bits.length >= MOST) this.bits.shift();
    this.bits.push(b);
  }

  /** A ring spreading on the water from (x, y), from `r0` to `r1` art pixels over `life` ms, `delay` ms from now. */
  ripple(x: number, y: number, r0: number, r1: number, life: number, now: number, delay = 0) {
    if (this.ripples.length > 40) this.ripples.shift();
    this.ripples.push({ x, y, r0, r1, at: now + delay, life, shock: false });
  }

  /** The quick ring of a hard hit. */
  shock(x: number, y: number, r: number, now: number) {
    this.ripples.push({ x, y, r0: 4, r1: r, at: now, life: 190, shock: true });
  }

  /** The crown of water a body throws up where it goes in at (x, y), with drops flung out of it. */
  splash(x: number, y: number, big: boolean, now: number) {
    this.plumes.push({ x, y, at: now, big });
    const n = big ? 46 : 28;
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      const v = (big ? 0.11 : 0.085) * (0.25 + this.rnd() * 0.75);
      this.add({
        kind: "drop",
        x: x + Math.cos(a) * 4,
        y: y + Math.sin(a) * 2,
        z: 3,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.55,
        vz: (big ? 0.34 : 0.26) * (0.4 + this.rnd() * 0.6),
        life: 1500,
        max: 1500,
        size: this.rnd() < 0.34 ? 2 : 1,
        color: WATER[Math.floor(this.rnd() * WATER.length)],
        n: i,
      });
    }
    this.ripple(x, y, 8, big ? 54 : 38, big ? 1200 : 900, now);
    this.ripple(x, y, 5, big ? 38 : 26, big ? 1100 : 850, now, 170);
    this.ripple(x, y, 4, big ? 28 : 18, 900, now, 380);
  }

  /** Crumbs of ice off the rim at (x, y), falling the way (ux, uy). */
  crumbs(x: number, y: number, n: number, ux: number, uy: number) {
    for (let i = 0; i < n; i++) {
      const v = 0.012 + this.rnd() * 0.03;
      const side = (this.rnd() - 0.5) * 0.03;
      this.add({
        kind: "crumb",
        x: x + (this.rnd() - 0.5) * 6,
        y: y + (this.rnd() - 0.5) * 6,
        z: 1,
        vx: ux * v - uy * side,
        vy: uy * v + ux * side,
        vz: 0.03 + this.rnd() * 0.05,
        life: 900,
        max: 900,
        size: this.rnd() < 0.25 ? 2 : 1,
        color: ICE[Math.floor(this.rnd() * ICE.length)],
        n: i,
      });
    }
  }

  /** Ice dust kicked up flat over the floe: all round, or in a fan `spread` wide round the way (ux, uy). */
  dust(x: number, y: number, n: number, speed: number, ux = 0, uy = 0, spread = Math.PI * 2) {
    const dir = Math.atan2(uy, ux);
    for (let i = 0; i < n; i++) {
      const a = dir + (this.rnd() - 0.5) * spread;
      const v = speed * (0.3 + this.rnd() * 0.7);
      const life = 240 + this.rnd() * 220;
      this.add({
        kind: "dust",
        x,
        y,
        z: 0,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.8,
        vz: 0,
        life,
        max: life,
        size: this.rnd() < 0.4 ? 2 : 1,
        color: ICE[Math.floor(this.rnd() * ICE.length)],
        n: i,
      });
    }
  }

  stars(x: number, y: number, n: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.rnd() * 0.8;
      const v = speed * (0.6 + this.rnd() * 0.4);
      const life = 300 + this.rnd() * 200;
      this.add({
        kind: "star",
        x,
        y,
        z: 0,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        vz: 0,
        life,
        max: life,
        size: i % 3 === 0 ? 5 : 3,
        color: STARS[i % STARS.length],
        n: i,
      });
    }
  }

  bubbles(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const life = 420 + this.rnd() * 500;
      this.add({
        kind: "bubble",
        x: x + (this.rnd() - 0.5) * 14,
        y: y + (this.rnd() - 0.5) * 8,
        z: 0,
        vx: 0,
        vy: -0.006 - this.rnd() * 0.008,
        vz: 0,
        life,
        max: life,
        size: this.rnd() < 0.4 ? 3 : 2,
        color: "#bfe6ff",
        n: i,
      });
    }
  }

  /** The pieces of a block of ice that broke. */
  shards(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * Math.PI * 2;
      const v = 0.03 + this.rnd() * 0.06;
      this.add({
        kind: "shard",
        x,
        y,
        z: 6 + this.rnd() * 10,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.6,
        vz: 0.05 + this.rnd() * 0.12,
        life: 900,
        max: 900,
        size: this.rnd() < 0.5 ? 3 : 2,
        color: i % 3 === 0 ? "#ffffff" : i % 3 === 1 ? "#cfeeff" : "#8fd0f2",
        n: i,
      });
    }
  }

  /** A drop of sweat off a worried head at (x, y), flung to the side `way` (-1 or 1). */
  sweat(x: number, y: number, way: number) {
    this.add({
      kind: "sweat",
      x,
      y,
      z: 0,
      vx: way * (0.02 + this.rnd() * 0.02),
      vy: 0,
      vz: 0.06 + this.rnd() * 0.03,
      life: 420,
      max: 420,
      size: 2,
      color: "#bfe6ff",
      n: 0,
    });
  }

  /** A puff of effort over a head. */
  steam(x: number, y: number) {
    const life = 380 + this.rnd() * 160;
    this.add({
      kind: "steam",
      x: x + (this.rnd() - 0.5) * 8,
      y,
      z: 0,
      vx: (this.rnd() - 0.5) * 0.01,
      vy: -0.018,
      vz: 0,
      life,
      max: life,
      size: 3,
      color: "#ffffff",
      n: 0,
    });
  }

  /** Confetti thrown up from (x, y), in the given colours. */
  confetti(x: number, y: number, n: number, colors: readonly string[]) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (this.rnd() - 0.5) * 2.2;
      const v = 0.05 + this.rnd() * 0.1;
      const life = 1500 + this.rnd() * 1300;
      this.add({
        kind: "confetti",
        x,
        y,
        z: 4,
        vx: Math.cos(a) * v,
        vy: (this.rnd() - 0.5) * 0.05,
        vz: 0.1 + this.rnd() * 0.16,
        life,
        max: life,
        size: 2,
        color: colors[Math.floor(this.rnd() * colors.length)],
        n: i,
      });
    }
  }

  /** A piece of the rim that broke off and drifts away the way (ux, uy). */
  chunk(x: number, y: number, ux: number, uy: number) {
    const life = 2600 + this.rnd() * 900;
    this.add({
      kind: "chunk",
      x,
      y,
      z: 0,
      vx: ux * 0.006,
      vy: uy * 0.006,
      vz: 0,
      life,
      max: life,
      size: 3 + Math.floor(this.rnd() * 3),
      color: "#e6f5fc",
      n: Math.floor(this.rnd() * 1000),
    });
  }

  /** Everything `dt` ms on; `r` is the floe's radius, art pixels: what lands past it lands in the water. */
  step(dt: number, r: number, now: number) {
    for (let i = 0; i < this.bits.length; i++) {
      const b = this.bits[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      const arc = b.kind === "drop" || b.kind === "crumb" || b.kind === "shard" || b.kind === "sweat" || b.kind === "confetti";
      if (arc) {
        b.vz -= (b.kind === "confetti" ? FALL * 0.22 : FALL) * dt;
        if (b.kind === "confetti" && b.vz < -0.03) b.vz = -0.03;
        b.z += b.vz * dt;
        if (b.z <= 0) {
          b.life = 0;
          const wet = b.x * b.x + b.y * b.y > r * r;
          if (wet && b.kind !== "sweat" && b.kind !== "confetti" && b.n % 2 === 0) this.ripple(b.x, b.y, 1, 4 + b.size, 320, now);
        }
      } else if (b.kind === "dust" || b.kind === "star") {
        const drag = Math.pow(0.992, dt);
        b.vx *= drag;
        b.vy *= drag;
      }
      if (b.life <= 0) {
        this.bits[i] = this.bits[this.bits.length - 1];
        this.bits.pop();
        i--;
      }
    }
    for (let i = 0; i < this.ripples.length; i++) {
      if (now - this.ripples[i].at > this.ripples[i].life) {
        this.ripples.splice(i, 1);
        i--;
      }
    }
    for (let i = 0; i < this.plumes.length; i++) {
      if (now - this.plumes[i].at > PLUME_MS + 500) {
        this.plumes.splice(i, 1);
        i--;
      }
    }
  }

  /** What lies on the water, drawn before the floe: ripples and drifting ice. */
  drawUnder(ctx: Ctx, st: Stage, now: number, r: number) {
    const wet = (px: number, py: number) => px * px + py * py > (r + 1) * (r + 1);
    for (const p of this.ripples) {
      if (p.shock) continue;
      const k = (now - p.at) / p.life;
      if (k < 0 || k > 1) continue;
      const rr = p.r0 + (p.r1 - p.r0) * (1 - (1 - k) * (1 - k));
      // a ripple thins out as it goes: every pixel, then every second, then every third
      const gap = k < 0.45 ? 1 : k < 0.75 ? 2 : 3;
      hoop(ctx, p.x, p.y, rr, k < 0.3 ? "#e9f7ff" : k < 0.65 ? "#9fd4f5" : "#5a9fd0", gap, 0, wet, FLAT);
      if (rr > 8 && k < 0.6) hoop(ctx, p.x, p.y, rr - 3, "#3f86c4", 2, 1, wet, FLAT);
    }
    for (const b of this.bits) {
      if (b.kind !== "chunk") continue;
      const k = b.life / b.max;
      const s = Math.max(1, Math.round(b.size * clamp(k * 2.2, 0, 1)));
      const x = st.hang(b.x);
      const y = st.hang(b.y + Math.sin(now / 500 + b.n) * 0.8);
      dot(ctx, x - s, y + 1, "#3d7dae", 2 * s + 1, s);
      dot(ctx, x - s, y - s + 1, "#cfe9f6", 2 * s + 1, s);
      dot(ctx, x - s + 1, y - s, b.color, Math.max(1, 2 * s - 1), 1);
    }
  }

  /** What flies over the floe and the wrestlers. */
  drawOver(ctx: Ctx, st: Stage, now: number) {
    for (const p of this.plumes) {
      const t = now - p.at;
      const x = st.hang(p.x);
      const y = st.hang(p.y);
      // the foam it leaves: a patch that spreads and thins
      const fk = t / (PLUME_MS + 500);
      const fr = Math.round((p.big ? 15 : 11) * (0.45 + 0.55 * Math.min(1, fk * 2.4)));
      const fh = Math.max(2, Math.round(fr * 0.38));
      for (let j = -fh; j <= fh; j++) {
        const half = Math.round(fr * Math.sqrt(1 - (j * j) / ((fh + 0.5) * (fh + 0.5))));
        for (let i = -half; i <= half; i++) {
          const on = fk < 0.18 || (fk < 0.6 ? (i + j + Math.floor(t / 70)) % 2 === 0 : hash(i * 13 + j * 7 + Math.floor(t / 120)) < 0.9 - fk);
          if (on) dot(ctx, x + i, y + j, fk < 0.3 || (i + j) % 3 === 0 ? "#f1faff" : "#a9d9f6", 1, 1);
        }
      }
      const k = t / PLUME_MS;
      if (k >= 1) continue;
      // the crown: a column up the middle and jets leaning out on both sides, tall and then falling back
      const up = Math.pow(Math.sin(Math.min(1, k * 1.15) * Math.PI), 0.8);
      const tall = (p.big ? 46 : 33) * up;
      const jet = (bx: number, h: number, hw: number, lean: number) => {
        const rows = Math.round(h);
        for (let j = 0; j < rows; j++) {
          const u = j / rows;
          const w = Math.round(hw * (1 - Math.pow(u, 1.6)));
          const jx = x + bx + Math.round(lean * Math.pow(u, 1.3) * 7);
          const jy = y - j;
          dot(ctx, jx - w, jy, u > 0.72 ? "#ffffff" : "#c4e6fb", 2 * w + 1, 1);
          if (w > 1) dot(ctx, jx + w - 1, jy, "#7fbde8", 2, 1);
          if (w > 0 && u < 0.72) dot(ctx, jx - w + 1, jy, "#ffffff", 1, 1);
        }
        if (rows > 3) dot(ctx, x + bx + Math.round(lean * 7), y - rows - 2, "#ffffff", 1, 1);
      };
      const hw = p.big ? 5 : 4;
      jet(-(hw + 9), tall * 0.34, 1, -1.5);
      jet(hw + 9, tall * 0.34, 1, 1.5);
      jet(-(hw + 4), tall * 0.62, 2, -0.9);
      jet(hw + 4, tall * 0.62, 2, 0.9);
      jet(0, tall, hw, 0);
    }
    for (const p of this.ripples) {
      if (!p.shock) continue;
      const k = clamp((now - p.at) / p.life, 0, 1);
      const rr = p.r0 + (p.r1 - p.r0) * (1 - (1 - k) * (1 - k));
      hoop(ctx, p.x, p.y, rr, "#ffffff", k < 0.5 ? 1 : 2);
      if (k < 0.5) hoop(ctx, p.x, p.y, rr - 1, "#fff4c2");
    }
    for (const b of this.bits) {
      if (b.kind === "chunk") continue;
      const k = b.life / b.max;
      const x = st.hang(b.x);
      const y = st.hang(b.y - b.z);
      switch (b.kind) {
        case "star": {
          const map = b.size > 3 ? STAR_BIG : Math.floor(now / 70 + b.n) % 2 ? STAR_A : STAR_B;
          const half = b.size > 3 ? 2 : 1;
          if (k > 0.25 || Math.floor(now / 40) % 2) stamp(ctx, map, x - half, y - half, { K: b.color });
          break;
        }
        case "bubble": {
          const s = b.size;
          const wob = Math.round(Math.sin(now / 90 + b.n * 2) * 1);
          ctx.fillStyle = b.color;
          ctx.fillRect(x + wob, y, s, 1);
          ctx.fillRect(x + wob, y + s - 1, s, 1);
          ctx.fillRect(x + wob, y, 1, s);
          ctx.fillRect(x + wob + s - 1, y, 1, s);
          break;
        }
        case "steam": {
          ctx.globalAlpha = clamp(k * 1.4, 0, 0.85);
          dot(ctx, x, y, b.color, 3, 2);
          dot(ctx, x + 1, y - 1, b.color, 2, 1);
          ctx.globalAlpha = 1;
          break;
        }
        case "sweat":
          dot(ctx, x, y, b.color, 1, 2);
          dot(ctx, x, y + 1, "#ffffff", 1, 1);
          break;
        case "confetti": {
          // a slip of paper turning as it falls: wide, then thin
          const wide = Math.floor(now / 110 + b.n) % 2 === 0;
          if (k < 0.2 && Math.floor(now / 60) % 2) break;
          dot(ctx, x + Math.round(Math.sin(now / 260 + b.n) * 2), y, b.color, wide ? 2 : 1, wide ? 1 : 2);
          break;
        }
        case "dust":
          ctx.globalAlpha = clamp(k * 1.8, 0, 1);
          dot(ctx, x, y, b.color, k > 0.5 ? b.size : 1, k > 0.5 ? b.size : 1);
          ctx.globalAlpha = 1;
          break;
        default:
          dot(ctx, x, y, b.color, b.size, b.size);
      }
    }
  }

  /** Snow drifting down over the whole stage `w`×`h`. */
  drawSnow(ctx: Ctx, st: Stage, now: number, w: number, h: number) {
    if (!this.snow.length) {
      for (let i = 0; i < 34; i++) {
        this.snow.push({ x: hash(i * 5 + 900), y: hash(i * 5 + 901), v: 0.006 + hash(i * 5 + 902) * 0.01, sway: hash(i * 5 + 903) * 6.3 });
      }
    }
    for (const f of this.snow) {
      const y = ((f.y * h + now * f.v) % h) - h / 2;
      const x = ((f.x * w + Math.sin(now / 1400 + f.sway) * 9 + now * 0.004) % w) - w / 2;
      dot(ctx, st.hang(x), st.hang(y), f.v > 0.011 ? "#ffffff" : "#b9d4ea", 1, 1);
    }
  }

  clear() {
    this.bits = [];
    this.ripples = [];
    this.plumes = [];
  }
}
