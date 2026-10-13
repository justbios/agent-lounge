import { CafeLayout, Desk } from "@/lib/cafe/layout";
import { CafeModel } from "@/lib/cafe/model";
import { AgentView, CafeTimeline, Walker, agentView } from "@/lib/cafe/timeline";
import { drawAmbient, drawBar, drawCupSteam, drawLights } from "./ambient";
import { Cat } from "./cat";
import { DecorSet, drawDecor, drawDecorLights } from "./decor";
import { GuestSeat, drawGuests } from "./guests";
import { Look, SeatMode, drawChair, drawPacket, drawPerson, drawSeated } from "./people";
import { Ctx, LINE, paint, px, rand, shade } from "./pixel";
import { Theme } from "./theme";

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
  /** the desk whose agent waits on the user: a raised hand and a flashing «!» for a question, a lit ✓ for a finished turn */
  alert?: { agent: number; kind: "ask" | "done" };
  decor?: DecorSet;
  theme?: Theme;
  /** people who have the café open elsewhere, on the bar stools */
  guests?: GuestSeat[];
}

const NO_DECOR: DecorSet = new Set();

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

function drawAskScreen(ctx: Ctx, d: Desk, t: number) {
  const sy = d.top + 2;
  const on = Math.floor(t * 2.5) % 2 === 0;
  px(ctx, d.x - 8, sy, 16, 9, on ? "#3a2606" : "#1d1708");
  const c = on ? "#ffd25a" : "#b8862a";
  px(ctx, d.x - 1, sy + 1, 2, 5, c);
  px(ctx, d.x - 1, sy + 7, 2, 1, c);
}

function drawRaisedHand(ctx: Ctx, X: number, headTop: number, look: Look, t: number) {
  const x = X + 6 + (Math.floor(t * 3) % 2);
  const T = headTop - 1;
  paint(
    ctx,
    [[x, T - 2, 2, 11], [x, T - 5, 3, 3]],
    [[x, T - 2, 2, 11, look.shirtDark], [x, T - 2, 1, 11, look.shirt], [x, T - 5, 3, 3, look.skin]],
  );
}

function seatMode(v: AgentView): SeatMode {
  if (v.screen === "work") return "work";
  if (v.screen === "incoming") return "alert";
  if (v.screen === "done") return "done";
  return "idle";
}

function drawStation(ctx: Ctx, d: Desk, v: AgentView, color: string, look: Look, f: FrameInput, i: number) {
  const tick = Math.floor(f.clock / 110);
  const flag = f.alert?.agent === i ? f.alert.kind : null;
  const asking = flag === "ask" && !v.walker;
  if (asking) drawAskScreen(ctx, d, f.t);
  else drawScreen(ctx, d, flag === "done" && v.screen === "idle" ? { ...v, screen: "done" } : v, color, f.clock, f.t, i);
  const led = asking
    ? Math.floor(f.t * 2.5) % 2 ? "#3a3550" : "#ffd25a"
    : v.screen === "work" ? (tick % 3 ? color : "#ffffff") : v.screen === "done" ? "#4ade80" : v.screen === "incoming" ? "#ffd25a" : "#3a3550";
  px(ctx, d.x + 15, d.top + 5, 1, 1, led);
  if (v.screen === "work" && !asking) drawCupSteam(ctx, d.x - 15, d.top + 13, f.t + i * 0.31);
  if (!v.walker) {
    drawSeated(ctx, d.x, d.top + 20, look, asking ? "alert" : seatMode(v), tick);
    if (asking) drawRaisedHand(ctx, d.x, d.top + 20, look, f.t);
  }
  drawChair(ctx, d.x, d.top, color);
}

/** Spent tokens pile up as paper beside the desk: a sheet per third of an order of magnitude past ten thousand. */
function drawPaper(ctx: Ctx, d: Desk, tokens: number, i: number) {
  if (tokens < 1e4) return;
  const sheets = Math.max(1, Math.min(14, Math.round((Math.log10(tokens) - 4) * 3)));
  const x = d.x + 23;
  const base = d.top + 27;
  px(ctx, x - 1, base - sheets - 1, 9, sheets + 2, LINE);
  for (let k = 0; k < sheets; k++) {
    const dx = rand(i * 31 + k * 7) > 0.7 ? 1 : 0;
    px(ctx, x + dx, base - 1 - k, 7 - dx, 1, k % 2 ? "#d9d3e6" : "#f1edf8");
  }
  px(ctx, x + 1, base - sheets, 4, 1, "#9aa3c7");
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
  const decor = f.decor ?? NO_DECOR;
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.drawImage(f.room, 0, 0);
  drawAmbient(ctx, t, lay.width, f.theme);
  drawBar(ctx, t, decor.has("goldMachine"));
  if (f.guests) drawGuests(ctx, f.guests, t);
  drawDecor(ctx, lay, decor, t);

  const views = model.agents.map((_, i) => agentView(model, tl, lay, i, clock));
  views.forEach((v, i) => drawStation(ctx, lay.desks[i], v, model.agents[i].color, looks[i], f, i));
  model.agents.forEach((a, i) => a.tokens && drawPaper(ctx, lay.desks[i], a.tokens, i));

  const sprites: { y: number; draw: () => void }[] = [];
  views.forEach((v, i) => {
    const w = v.walker;
    if (w) sprites.push({ y: w.y, draw: () => drawWalker(ctx, w, looks[i], lay, clock) });
  });
  const cat = f.cat;
  if (cat) sprites.push({ y: cat.footY, draw: () => cat.draw(ctx, t, decor.has("crown")) });
  sprites.sort((a, b) => a.y - b.y).forEach((s) => s.draw());

  drawLights(ctx, lay, views, model.agents.map((a) => a.color), t, f.theme);
  drawDecorLights(ctx, lay, decor, t);
}
