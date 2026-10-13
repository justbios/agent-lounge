import { CafeLayout } from "@/lib/cafe/layout";
import { CafeModel } from "@/lib/cafe/model";
import { Ctx, glow, px } from "./pixel";

const FLY_MS = 1500;
const LAND_MS = 420;
const TRAIL = 7;

const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

function plane(ctx: Ctx, x: number, y: number, right: boolean, accent: string) {
  const at = (dx: number, w: number) => (right ? x + dx : x + 6 - dx - w + 1);
  px(ctx, at(4, 3), y, 3, 1, "#ffffff");
  px(ctx, at(0, 7), y + 1, 7, 1, "#eceaf6");
  px(ctx, at(1, 2), y + 1, 2, 1, accent);
  px(ctx, at(2, 3), y + 2, 3, 1, "#aeb3cf");
}

/**
 * Every hand-off as a paper plane: the moment a task is given, a sheet takes off from the giver's desk, flies across
 * the hall with a trail and its shadow on the floor, and lands with a flash on the desk of whoever got it.
 */
export function drawFlights(ctx: Ctx, model: CafeModel, lay: CafeLayout, clock: number) {
  for (const tr of model.trips) {
    const dur = FLY_MS / tr.pace;
    const age = clock - tr.start;
    if (age < 0 || age > dur + LAND_MS) continue;
    const a = lay.desks[tr.from];
    const b = lay.desks[tr.to];
    if (!a || !b) continue;
    const fx = a.x + 6;
    const fy = a.top + 10;
    const tx = b.x - 2;
    const ty = b.top + 12;
    const lift = Math.min(38, 10 + Math.hypot(tx - fx, ty - fy) * 0.3);
    const at = (p: number) => ({ x: fx + (tx - fx) * p, y: fy + (ty - fy) * p - Math.sin(Math.PI * p) * lift });
    if (age > dur) {
      const q = (age - dur) / LAND_MS;
      ctx.globalCompositeOperation = "lighter";
      glow(ctx, tx, ty, 12, "#ffe9a8", 0.45 * (1 - q));
      ctx.globalCompositeOperation = "source-over";
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * Math.PI * 2;
        ctx.globalAlpha = 1 - q;
        const sx = Math.round(tx + Math.cos(ang) * (2 + q * 7));
        px(ctx, sx, Math.round(ty + Math.sin(ang) * (2 + q * 5)), 1, 1, "#fff3c4");
      }
      ctx.globalAlpha = 1;
      continue;
    }
    const p = ease(age / dur);
    const ground = fy + (ty - fy) * p + 20;
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(Math.round(fx + (tx - fx) * p) - 2, Math.round(ground), 5, 1);
    for (let k = 1; k <= TRAIL; k++) {
      const q = p - k * 0.03;
      if (q <= 0) break;
      const s = at(q);
      ctx.globalAlpha = 0.55 * (1 - k / (TRAIL + 1));
      px(ctx, Math.round(s.x), Math.round(s.y + 1), 1, 1, "#f6f2ff");
    }
    ctx.globalAlpha = 1;
    const s = at(p);
    plane(ctx, Math.round(s.x) - 3, Math.round(s.y), tx >= fx, model.agents[tr.from]?.color ?? "#ff9a62");
  }
}
