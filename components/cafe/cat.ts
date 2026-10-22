import { Point } from "@/lib/layout";
import { CafeLayout, Dir, SEAT_DY, pathLength, pointAt, rng, route } from "@/lib/cafe/layout";
import { Ctx, LINE, px } from "./pixel";

const SPEED = 0.018;
export interface Coat {
  fur: string;
  dark: string;
  belly: string;
  /** a cat's eye, dark unless it shines */
  eye?: string;
}

export type PetKind = "cat" | "dog";

const GINGER: Coat = { fur: "#e8913a", dark: "#b8642a", belly: "#f6d7a8" };
export const DOG: Coat = { fur: "#e6d5b8", dark: "#8a5a34", belly: "#fff6e6" };
/** The café cat in the Halloween week. */
export const BLACK_CAT: Coat = { fur: "#2a2430", dark: "#16121c", belly: "#3d3446", eye: "#ffd25a" };
const PET_MS = 3800;
const BED_CHANCE = 0.3;
const HEART = [[1, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [1, 2], [2, 2], [3, 2], [2, 3]];

type Mode = "walk" | "sit" | "nap";
type Paint = (dx: number, dy: number, w: number, h: number, c: string) => void;

function drawCrown(P: Paint, dx: number, dy: number) {
  P(dx, dy, 5, 1, "#ffd25a");
  for (const k of [0, 2, 4]) P(dx + k, dy - 1, 1, 1, "#ffe680");
  P(dx + 2, dy, 1, 1, "#ff4fa3");
}

/** The café pet, a cat or a dog: wanders the aisles, drops by whoever is busiest, naps where it likes. */
export class Cat {
  private path: Point[] = [];
  private len = 0;
  private dist = 0;
  private x: number;
  private y: number;
  private band = 0;
  private dir: Dir = "right";
  private mode: Mode = "sit";
  private until = 0;
  private petAt = -Infinity;
  private bedAt: Point | null = null;
  private r: () => number;

  constructor(
    private lay: CafeLayout,
    seed: number,
    private coat: Coat = GINGER,
    private kind: PetKind = "cat",
  ) {
    this.r = rng(seed * 7 + 3);
    this.band = Math.floor(this.r() * lay.walkY.length);
    this.x = 40 + this.r() * (lay.width - 80);
    this.y = lay.walkY[this.band];
  }

  private pickTarget(busy: number[], beds: Point[]): { p: Point; band: number; bed?: Point } {
    const lay = this.lay;
    if (beds.length && this.r() < BED_CHANCE) {
      const bed = beds[Math.floor(this.r() * beds.length)];
      const gap = (b: number) => Math.abs(lay.walkY[b] - bed.y);
      const band = lay.walkY.reduce((best, _, b) => (gap(b) < gap(best) ? b : best), 0);
      return { p: { x: bed.x, y: bed.y + 1 }, band, bed };
    }
    if (busy.length && this.r() < 0.55) {
      const d = lay.desks[busy[Math.floor(this.r() * busy.length)]];
      const side = this.r() < 0.5 ? -1 : 1;
      return { p: { x: d.x + side * 26, y: d.top + SEAT_DY + 2 }, band: d.row };
    }
    const band = Math.floor(this.r() * lay.walkY.length);
    return { p: { x: Math.round(14 + this.r() * (lay.width - 28)), y: lay.walkY[band] }, band };
  }

  /** Stops the cat where it is and makes it purr for a few seconds. */
  pet(nowMs: number) {
    this.petAt = nowMs;
    this.mode = "sit";
    this.until = Math.max(this.until, nowMs + PET_MS);
    if (this.dir === "up" || this.dir === "down") this.dir = "right";
  }

  /** Puts a visiting cat where its own path has it, instead of letting it wander. */
  put(x: number, y: number, dir: Dir, walking: boolean) {
    this.x = x;
    this.y = y;
    this.dir = dir;
    this.mode = walking ? "walk" : "sit";
  }

  /** The cat bed it is heading for or curled up in. */
  get bed(): Point | null {
    return this.bedAt;
  }

  /** Moves the cat on by `dtMs`; now and then it picks one of the free cat `beds` and naps there a good while. */
  step(dtMs: number, nowMs: number, busy: number[], beds: Point[] = []) {
    if (this.bedAt && !beds.some((b) => b.x === this.bedAt?.x && b.y === this.bedAt.y)) this.bedAt = null;
    if (this.mode !== "walk") {
      if (nowMs < this.until) return;
      const t = this.pickTarget(busy, beds);
      this.bedAt = t.bed ?? null;
      this.path = route(this.lay, { x: this.x, y: this.y }, this.band, t.p, t.band);
      this.len = pathLength(this.path);
      this.dist = 0;
      this.band = t.band;
      this.mode = "walk";
    }
    this.dist += dtMs * SPEED;
    const p = pointAt(this.path, this.dist);
    this.x = p.x;
    this.y = p.y;
    this.dir = p.dir;
    if (this.dist >= this.len) {
      this.mode = this.bedAt || this.r() < 0.35 ? "nap" : "sit";
      const nap = this.bedAt ? 16_000 + this.r() * 14_000 : 9000 + this.r() * 9000;
      this.until = nowMs + (this.mode === "nap" ? nap : 2500 + this.r() * 4000);
      if (this.dir === "up" || this.dir === "down") this.dir = this.r() < 0.5 ? "left" : "right";
    }
  }

  get footY(): number {
    return this.y;
  }

  get pos(): Point {
    return { x: this.x, y: this.y };
  }

  /** The middle of a shining eye, for its glow in the dark; null for a dog, a dark eye, or one shut in a nap. */
  get eye(): Point | null {
    if (!this.coat.eye || this.kind === "dog" || this.mode === "nap") return null;
    const X = Math.round(this.x);
    const Y = Math.round(this.y) - (this.bedAt && this.mode !== "walk" ? 2 : 0);
    return { x: (this.dir === "left" ? X - 6 : X + 5) + 0.5, y: Y + (this.mode === "sit" ? -7 : -6) + 0.5 };
  }

  private drawHearts(ctx: Ctx, nowMs: number) {
    const age = nowMs - this.petAt;
    if (age < 0 || age > PET_MS) return;
    for (let k = 0; k < 3; k++) {
      const ph = (age / 1400 + k / 3) % 1;
      if (age < k * 380) continue;
      ctx.globalAlpha = Math.min(1, (1 - ph) * 1.6) * (age > PET_MS - 600 ? (PET_MS - age) / 600 : 1);
      const hx = Math.round(this.x - 2 + Math.sin((ph + k) * 6) * 3 + (k - 1) * 4);
      const hy = Math.round(this.y - 16 - ph * 14);
      for (const [dx, dy] of HEART) px(ctx, hx + dx, hy + dy, 1, 1, "#ff6b9a");
    }
    ctx.globalAlpha = 1;
  }

  private drawDogBits(P: Paint, t: number, hy: number, sit: boolean, walking: boolean) {
    const { dark, belly } = this.coat;
    P(6, hy + 2, 2, 3, LINE);
    P(6, hy + 3, 1, 1, belly);
    P(2, hy, 2, 1, dark);
    P(2, hy + 1, 1, 3, dark);
    P(5, hy + 1, 1, 1, LINE);
    const wag = Math.round(Math.sin(t * (walking ? 16 : 10)));
    if (sit) {
      P(-6 + wag, -2, 2, 1, dark);
      return;
    }
    P(-5, -6, 1, 1, dark);
    P(-6 + wag, -8, 1, 2, dark);
  }

  draw(ctx: Ctx, t: number, crown = false, nowMs = t * 1000) {
    this.drawHearts(ctx, nowMs);
    const inBed = !!this.bedAt && this.mode !== "walk";
    const X = Math.round(this.x);
    const Y = Math.round(this.y) - (inBed ? 2 : 0);
    const flip = this.dir === "left";
    const P = (dx: number, dy: number, w: number, h: number, c: string) =>
      px(ctx, flip ? X - dx - w : X + dx, Y + dy, w, h, c);
    const { fur: FUR, dark: FUR_DARK, belly: BELLY } = this.coat;
    const dog = this.kind === "dog";

    if (!inBed) {
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(X - 5, Y - 1, 10, 2);
    }

    if (this.mode === "nap") {
      P(-5, -5, 10, 5, LINE);
      P(-4, -4, 8, 4, FUR);
      P(-4, -2, 8, 1, FUR_DARK);
      P(2, -6, 4, 4, LINE);
      P(2, -5, 3, 3, FUR);
      P(-6, -2, 3, 2, FUR_DARK);
      if (dog) {
        P(6, -4, 1, 2, LINE);
        P(2, -5, 1, 2, FUR_DARK);
      }
      if (crown) drawCrown(P, 1, -7);
      const z = (t * 0.7) % 1;
      ctx.globalAlpha = 1 - z;
      px(ctx, X + (flip ? -6 : 4), Y - 9 - Math.round(z * 6), 2, 1, "#cfd6ff");
      px(ctx, X + (flip ? -5 : 5), Y - 8 - Math.round(z * 6), 1, 1, "#cfd6ff");
      ctx.globalAlpha = 1;
      return;
    }

    const walking = this.mode === "walk";
    const leg = walking ? Math.floor(t * 8) % 2 : 0;
    const sit = this.mode === "sit";
    P(-4, sit ? -6 : -5, 8, sit ? 6 : 4, LINE);
    P(-3, sit ? -5 : -4, 6, sit ? 5 : 3, FUR);
    P(-3, sit ? -3 : -3, 6, 1, FUR_DARK);
    P(0, -2, 3, 1, BELLY);
    const hy = sit ? -9 : -8;
    P(2, hy, 5, 5, LINE);
    P(3, hy + 1, 3, 3, FUR);
    if (!sit) {
      P(-3 + leg, -1, 1, 1, FUR_DARK);
      P(2 - leg, -1, 1, 1, FUR_DARK);
    }
    if (dog) this.drawDogBits(P, t, hy, sit, walking);
    else {
      P(3, hy - 1, 1, 2, FUR);
      P(5, hy - 1, 1, 2, FUR);
      P(5, hy + 2, 1, 1, this.coat.eye ?? LINE);
      const swish = Math.round(Math.sin(t * (walking ? 6 : 2.4)) * 1.5);
      P(-6, (sit ? -4 : -5) + swish, 2, 1, FUR_DARK);
      P(-7, (sit ? -5 : -6) + swish, 1, 2, FUR_DARK);
    }
    if (crown) drawCrown(P, 2, hy - 2);
  }
}
