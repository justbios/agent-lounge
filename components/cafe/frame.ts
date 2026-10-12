import { CafeLayout, Desk } from "@/lib/cafe/layout";
import { CafeModel } from "@/lib/cafe/model";
import { AgentView, CafeTimeline, Walker, agentView } from "@/lib/cafe/timeline";
import { drawAmbient, drawBar, drawCupSteam, drawLights } from "./ambient";
import { Cat } from "./cat";
import { Look, SeatMode, drawChair, drawPacket, drawPerson, drawSeated } from "./people";
import { Ctx, px, rand, shade } from "./pixel";

export interface FrameInput {
  model: CafeModel;
  lay: CafeLayout;
  tl: CafeTimeline;
  looks: Look[];
  room: HTMLCanvasElement;
  clock: number;
  /** wall time in seconds — drives ambience, which keeps moving while the replay is paused */
  t: number;
  cat?: Cat;
}

const CHECK = [[-4, 3], [-3, 4], [-2, 5], [-1, 4], [0, 3], [1, 2], [2, 1], [3, 0]];

function tri(x: number): number {
  const f = x % 2;
  return f < 1 ? f : 2 - f;
}

function drawScreen(ctx: Ctx, d: Desk, v: AgentView, color: string, clock: number, t: number, seed: number) {
  const sx = d.x - 8;
  const sy = d.top + 2;
  const sw = 16;
  const sh = 9;
  if (v.screen === "work") {
    px(ctx, sx, sy, sw, sh, shade(color, 0.2));
    px(ctx, sx, sy, sw, 1, shade(color, 0.45));
    const scroll = Math.floor(clock / 260);
    let lastEnd = sx + 1;
    for (let r = 0; r < 4; r++) {
      const line = scroll + r;
      const indent = Math.floor(rand(line * 3.7 + seed) * 4);
      const w = Math.min(3 + Math.floor(rand(line * 9.1 + seed) * 9), sw - 2 - indent);
      px(ctx, sx + 1 + indent, sy + 1 + r * 2, w, 1, line % 2 ? "#dfe6ff" : color);
      lastEnd = sx + 1 + indent + w;
    }
    if (Math.floor(t * 3) % 2 === 0) px(ctx, Math.min(lastEnd + 1, sx + sw - 2), sy + 7, 1, 1, "#ffffff");
    px(ctx, sx, sy + sh - 1, Math.round(sw * v.progress), 1, color);
    return;
  }
  if (v.screen === "incoming") {
    px(ctx, sx, sy, sw, sh, "#1d1708");
    if (Math.floor(t * 4) % 2 === 0) {
      px(ctx, d.x - 3, sy + 2, 7, 5, "#ffd25a");
      for (const [dx, dy] of [[-2, 3], [2, 3], [-1, 4], [1, 4], [0, 5]]) px(ctx, d.x + dx, sy + dy, 1, 1, "#1d1708");
    }
    return;
  }
  if (v.screen === "done") {
    px(ctx, sx, sy, sw, sh, "#0c2218");
    for (const [dx, dy] of CHECK) px(ctx, d.x + dx, sy + 1 + dy, 1, 2, "#4ade80");
    return;
  }
  px(ctx, sx, sy, sw, sh, "#070a14");
  const p = t * 0.6 + seed * 0.37;
  px(ctx, sx + Math.round(tri(p) * (sw - 2)), sy + Math.round(tri(p * 1.37) * (sh - 1)), 2, 1, shade(color, 0.55));
}

function seatMode(v: AgentView): SeatMode {
  if (v.screen === "work") return "work";
  if (v.screen === "incoming") return "alert";
  if (v.screen === "done") return "done";
  return "idle";
}

function drawStation(ctx: Ctx, d: Desk, v: AgentView, color: string, look: Look, f: FrameInput, i: number) {
  const tick = Math.floor(f.clock / 110);
  drawScreen(ctx, d, v, color, f.clock, f.t, i);
  const led =
    v.screen === "work" ? (tick % 3 ? color : "#ffffff") : v.screen === "done" ? "#4ade80" : v.screen === "incoming" ? "#ffd25a" : "#3a3550";
  px(ctx, d.x + 15, d.top + 5, 1, 1, led);
  if (v.screen === "work") drawCupSteam(ctx, d.x - 15, d.top + 13, f.t + i * 0.31);
  if (!v.walker) drawSeated(ctx, d.x, d.top + 20, look, seatMode(v), tick);
  drawChair(ctx, d.x, d.top, color);
}

function drawWalker(ctx: Ctx, w: Walker, look: Look, lay: CafeLayout, clock: number) {
  const lift = Math.round(w.settle * 4);
  const x = Math.round(w.x);
  const y = Math.round(w.y);
  ctx.globalAlpha = 1 - w.settle * 0.5;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(x - 4, y - 1, 9, 2);
  const step = w.moving ? 1 + (Math.floor(clock / 150) % 2) : 0;
  drawPerson(ctx, x, y + lift, look, { dir: w.dir, step, carrying: w.carrying });
  ctx.globalAlpha = 1;

  if (w.give >= 0 && w.give < 1) {
    const d = lay.desks[w.target];
    const fromX = x + (w.dir === "right" ? 3 : -9);
    const fromY = y - 10;
    const toX = d.x - 3;
    const toY = d.top + 14;
    const g = w.give;
    drawPacket(ctx, fromX + (toX - fromX) * g, fromY + (toY - fromY) * g - Math.sin(Math.PI * g) * 8, look.accent);
  }
}

export function drawFrame(ctx: Ctx, f: FrameInput) {
  const { model, lay, tl, looks, clock, t } = f;
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.drawImage(f.room, 0, 0);
  drawAmbient(ctx, t, lay.width);
  drawBar(ctx, t);

  const views = model.agents.map((_, i) => agentView(model, tl, lay, i, clock));
  views.forEach((v, i) => drawStation(ctx, lay.desks[i], v, model.agents[i].color, looks[i], f, i));

  const sprites: { y: number; draw: () => void }[] = [];
  views.forEach((v, i) => {
    const w = v.walker;
    if (w) sprites.push({ y: w.y, draw: () => drawWalker(ctx, w, looks[i], lay, clock) });
  });
  const cat = f.cat;
  if (cat) sprites.push({ y: cat.footY, draw: () => cat.draw(ctx, t) });
  sprites.sort((a, b) => a.y - b.y).forEach((s) => s.draw());

  drawLights(ctx, lay, views, model.agents.map((a) => a.color), t);
}
