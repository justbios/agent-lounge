import { Point } from "@/lib/layout";
import { CafeLayout, Dir, SEAT_DY, pathLength, pointAt, rng, route } from "@/lib/cafe/layout";
import { Ctx, LINE, px } from "./pixel";

const SPEED = 0.018;
const FUR = "#e8913a";
const FUR_DARK = "#b8642a";
const BELLY = "#f6d7a8";

type Mode = "walk" | "sit" | "nap";
type Paint = (dx: number, dy: number, w: number, h: number, c: string) => void;

function drawCrown(P: Paint, dx: number, dy: number) {
  P(dx, dy, 5, 1, "#ffd25a");
  for (const k of [0, 2, 4]) P(dx + k, dy - 1, 1, 1, "#ffe680");
  P(dx + 2, dy, 1, 1, "#ff4fa3");
}

/** The café cat: wanders the aisles, drops by whoever is busiest, naps where it likes. */
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
  private r: () => number;

  constructor(
    private lay: CafeLayout,
    seed: number,
  ) {
    this.r = rng(seed * 7 + 3);
    this.band = Math.floor(this.r() * lay.walkY.length);
    this.x = 40 + this.r() * (lay.width - 80);
    this.y = lay.walkY[this.band];
  }

  private pickTarget(busy: number[]): { p: Point; band: number } {
    const lay = this.lay;
    if (busy.length && this.r() < 0.55) {
      const d = lay.desks[busy[Math.floor(this.r() * busy.length)]];
      const side = this.r() < 0.5 ? -1 : 1;
      return { p: { x: d.x + side * 26, y: d.top + SEAT_DY + 2 }, band: d.row };
    }
    const band = Math.floor(this.r() * lay.walkY.length);
    return { p: { x: Math.round(14 + this.r() * (lay.width - 28)), y: lay.walkY[band] }, band };
  }

  step(dtMs: number, nowMs: number, busy: number[]) {
    if (this.mode !== "walk") {
      if (nowMs < this.until) return;
      const t = this.pickTarget(busy);
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
      this.mode = this.r() < 0.35 ? "nap" : "sit";
      this.until = nowMs + (this.mode === "nap" ? 9000 + this.r() * 9000 : 2500 + this.r() * 4000);
      if (this.dir === "up" || this.dir === "down") this.dir = this.r() < 0.5 ? "left" : "right";
    }
  }

  get footY(): number {
    return this.y;
  }

  get pos(): Point {
    return { x: this.x, y: this.y };
  }

  draw(ctx: Ctx, t: number, crown = false) {
    const X = Math.round(this.x);
    const Y = Math.round(this.y);
    const flip = this.dir === "left";
    const P = (dx: number, dy: number, w: number, h: number, c: string) =>
      px(ctx, flip ? X - dx - w : X + dx, Y + dy, w, h, c);

    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(X - 5, Y - 1, 10, 2);

    if (this.mode === "nap") {
      P(-5, -5, 10, 5, LINE);
      P(-4, -4, 8, 4, FUR);
      P(-4, -2, 8, 1, FUR_DARK);
      P(2, -6, 4, 4, LINE);
      P(2, -5, 3, 3, FUR);
      P(-6, -2, 3, 2, FUR_DARK);
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
    P(2, sit ? -9 : -8, 5, 5, LINE);
    P(3, sit ? -8 : -7, 3, 3, FUR);
    P(3, sit ? -10 : -9, 1, 2, FUR);
    P(5, sit ? -10 : -9, 1, 2, FUR);
    P(5, sit ? -7 : -6, 1, 1, LINE);
    if (!sit) {
      P(-3 + leg, -1, 1, 1, FUR_DARK);
      P(2 - leg, -1, 1, 1, FUR_DARK);
    }
    const swish = Math.round(Math.sin(t * (walking ? 6 : 2.4)) * 1.5);
    P(-6, (sit ? -4 : -5) + swish, 2, 1, FUR_DARK);
    P(-7, (sit ? -5 : -6) + swish, 1, 2, FUR_DARK);
    if (crown) drawCrown(P, 2, sit ? -11 : -10);
  }
}
