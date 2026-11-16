import { CafeLayout, Desk } from "@/lib/cafe/layout";
import { CafeModel } from "@/lib/cafe/model";
import { AgentView, CafeTimeline, Walker, agentView } from "@/lib/cafe/timeline";
import { drawAmbient, drawBar, drawCupSteam } from "./ambient";
import { Cat } from "./cat";
import { DecorSet, drawDecor, drawDecorLights } from "./decor";
import { drawPot, potAt } from "./desk";
import { HallArt, emptyChair } from "./hall";
import { O, addGlow, dk, hallPen, lt } from "./hallPen";
import { drawFlights } from "./flight";
import { drawItem, itemLight } from "./furniture";
import { GuestSeat, drawGuests } from "./guests";
import { COSTUMES } from "./halloween";
import { Pastime, REST_MS, drawPastime, drawZzz, pastimeOf } from "./idle";
import { Outing, planLeisure, spotsOf } from "./outing";
import { drawOuting } from "./outingSprites";
import { Look, SeatMode, drawPacket, drawPerson, drawSeated, drawSeatedFront } from "./people";
import { Ctx, LINE, glow, paint, px, rand } from "./pixel";
import { Standing } from "./placement";
import { VisitorFrame, drawVisitor } from "./visitor";
import { Theme } from "./theme";

export interface FrameInput {
  model: CafeModel;
  lay: CafeLayout;
  tl: CafeTimeline;
  looks: Look[];
  room: HallArt;
  clock: number;
  /** wall time in seconds — drives ambience, which keeps moving while the replay is paused */
  t: number;
  cat?: Cat;
  cat2?: Cat | null;
  /** the desk whose agent waits on the user: a raised hand and a flashing «!» for a question, a lit ✓ for a finished turn */
  alert?: { agent: number; kind: "ask" | "done" };
  decor?: DecorSet;
  theme?: Theme;
  /** people who have the café open elsewhere, on the bar stools */
  guests?: GuestSeat[];
  furniture?: Standing[];
  /** the piece being placed, under the pointer */
  ghost?: Ghost | null;
  /** night and nobody working: the lights go down, the barista goes home, everyone at a desk dozes */
  closed?: boolean;
  /** a rare visitor, at the last stool or on the way to it, and the gold cat's own sprite */
  visitor?: VisitorFrame | null;
  visitorCat?: Cat | null;
}

export interface Ghost {
  item: Standing["item"];
  w: number;
  h: number;
  cx: number;
  bottom: number;
  ok: boolean;
}

function drawGhost(ctx: Ctx, g: Ghost, t: number) {
  ctx.globalAlpha = g.ok ? 0.8 : 0.45;
  drawItem(ctx, g.item, g.w, g.cx, g.bottom, t);
  ctx.globalAlpha = 1;
  const L = Math.round(g.cx - g.w / 2) - 2;
  const T = Math.round(g.bottom - g.h) - 2;
  const c = g.ok ? "#4ade80" : "#ff5d5d";
  px(ctx, L, T, g.w + 4, 1, c);
  px(ctx, L, T + g.h + 3, g.w + 4, 1, c);
  px(ctx, L, T, 1, g.h + 4, c);
  px(ctx, L + g.w + 3, T, 1, g.h + 4, c);
}

const NO_DECOR: DecorSet = new Set();

/** What a seat shows at a glance: the light on the face, the colour of the name plate, the little bubble. */
export type Status = "work" | "wait" | "done" | "idle";
export const STATUS_COLOR: Record<Status, string> = { work: "#62f0ff", wait: "#ffc456", done: "#8ee59b", idle: "#9184b0" };
/** a finished agent keeps its tick this long before it counts as resting */
const DONE_MS = 60_000;

function lastEnd(stints: { start: number; end: number }[], clock: number): number {
  let end = -Infinity;
  for (const s of stints) if (s.end <= clock && s.end > end) end = s.end;
  return end;
}

/** The status of agent `i`: working (or carrying work), asking the user, just done, or resting. */
export function seatStatus(
  model: CafeModel,
  v: AgentView,
  i: number,
  clock: number,
  alert?: { agent: number; kind: "ask" | "done" },
): Status {
  if (alert?.agent === i && alert.kind === "ask") return "wait";
  if (v.screen === "work" || v.screen === "incoming" || v.walker) return "work";
  if (alert?.agent === i && alert.kind === "done") return "done";
  if (v.screen === "done") return clock - lastEnd(model.stints[i] ?? [], clock) < DONE_MS ? "done" : "idle";
  return "idle";
}

function seatMode(v: AgentView): SeatMode {
  if (v.screen === "work") return "work";
  if (v.screen === "incoming") return "alert";
  if (v.screen === "done") return "done";
  return "idle";
}

interface Seat {
  /** in the chair: not walking work over, not off at the bar or the couch */
  here: boolean;
  mode: SeatMode;
  asking: boolean;
  pastime: Pastime;
  away: Outing | null;
  status: Status;
}

function seatOf(f: FrameInput, v: AgentView, i: number, outing: Outing | null, status: Status): Seat {
  const flag = f.alert?.agent === i ? f.alert.kind : null;
  const out: Seat = { here: false, mode: seatMode(v), asking: false, pastime: null, away: null, status };
  if (v.walker) return out;
  const idle = out.mode === "idle" || out.mode === "done";
  const o = idle && flag !== "ask" ? outing : null;
  if (o && o.phase !== "sip") {
    out.away = o;
    return out;
  }
  out.here = true;
  out.asking = flag === "ask";
  const rested = idle && !flag && f.clock - lastEnd(f.model.stints[i], f.clock) > REST_MS;
  out.pastime = o ? (o.errand === "soda" ? "can" : "cup") : rested ? pastimeOf(i, f.t, !!f.closed) : null;
  if (out.pastime === "nap") out.mode = "nap";
  if (out.asking) out.mode = "alert";
  return out;
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

function drawPerson2(ctx: Ctx, d: Desk, s: Seat, look: Look, tick: number, t: number, i: number) {
  if (d.face === "front") drawSeatedFront(ctx, d.x, d.top, look, s.mode, tick);
  else drawSeated(ctx, d.x, d.top, look, s.mode, tick);
  if (s.asking) drawRaisedHand(ctx, d.x, d.top, look, t);
  if (s.pastime && s.pastime !== "nap") drawPastime(ctx, s.pastime, d.x, d.top, look, t, i);
}

const CHECK = [[4, 0], [3, 1], [2, 2], [-1, 1], [0, 2], [1, 3]];

/** The screen of a near-row monitor, which faces us: code scrolling, a parcel coming, a question, a tick, a dozing dot. */
function drawScreen(ctx: Ctx, cx: number, D: number, v: AgentView, s: Seat, clock: number, t: number, seed: number) {
  const { P, A, X } = hallPen(ctx);
  const sx = cx - 7;
  const sy = D + 8;
  if (s.asking) {
    const on = Math.floor(t * 2.5) % 2 === 0;
    P(sx, sy, 14, 8, on ? "#3a2606" : "#2e2008");
    const c = on ? "#ffc456" : "#b8862a";
    P(cx - 1, sy + 1, 3, 1, c);
    X(cx + 1, sy + 2, c);
    X(cx, sy + 3, c);
    X(cx, sy + 5, c);
  } else if (v.screen === "work") {
    P(sx, sy, 14, 8, "#0c2234");
    const scroll = Math.floor(clock / 260);
    const cols = ["#62f0ff", "#ff8ab8", "#e8f8ff", "#62f0ff", "#8ee59b", "#62f0ff"];
    for (let r = 0; r < 3; r++) {
      const line = scroll + r;
      const indent = Math.floor(rand(line * 3.7 + seed) * 3);
      const w = Math.min(3 + Math.floor(rand(line * 9.1 + seed) * 8), 12 - indent);
      P(sx + 1 + indent, sy + 1 + r * 2, w, 1, cols[line % cols.length]);
    }
    if (Math.floor(t * 3) % 2 === 0) X(sx + 11, sy + 5, "#ffffff");
    P(sx, sy + 7, Math.round(14 * v.progress), 1, "#62f0ff");
  } else if (v.screen === "incoming") {
    P(sx, sy, 14, 8, "#2e2008");
    if (Math.floor(t * 4) % 2 === 0) {
      P(cx - 3, sy + 2, 7, 5, "#ffd25a");
      for (const [dx, dy] of [[-2, 3], [2, 3], [-1, 4], [1, 4], [0, 5]]) X(cx + dx, sy + dy, "#2e2008");
    }
  } else if (s.status === "done") {
    P(sx, sy, 14, 8, "#0c2a1a");
    for (const [dx, dy] of CHECK) P(cx - 1 + dx, sy + 1 + dy, 1, 2, "#8ee59b");
    P(sx + 1, sy + 7, 12, 1, "#2e6a42");
  } else {
    P(sx, sy, 14, 8, "#16122a");
    const p = t * 0.6 + seed * 0.37;
    X(sx + Math.round(tri(p) * 12), sy + Math.round(tri(p * 1.37) * 7), "#5a4e80");
  }
  A(sx, sy, 14, 1, "#ffffff", 0.18);
}

function tri(x: number): number {
  const f = x % 2;
  return f < 1 ? f : 2 - f;
}

/** The little pixel bubble beside a seated agent: «…» working, «?» asking you, «✓» done, «z» resting. */
function statusBubble(ctx: Ctx, x: number, y: number, st: Status) {
  const { P, X } = hallPen(ctx);
  const c = STATUS_COLOR[st];
  P(x, y, 11, 9, O);
  P(x + 1, y + 1, 9, 7, c);
  P(x + 1, y + 1, 9, 1, lt(c, 0.45));
  P(x + 2, y + 9, 2, 1, O);
  X(x + 2, y + 8, c);
  const d = O;
  if (st === "wait") {
    P(x + 4, y + 2, 3, 1, d);
    X(x + 6, y + 3, d);
    X(x + 5, y + 4, d);
    X(x + 5, y + 6, d);
  } else if (st === "done") {
    X(x + 7, y + 2, d);
    X(x + 6, y + 3, d);
    X(x + 3, y + 4, d);
    X(x + 5, y + 4, d);
    X(x + 4, y + 5, d);
  } else if (st === "work") {
    X(x + 3, y + 4, d);
    X(x + 5, y + 4, d);
    X(x + 7, y + 4, d);
  } else {
    P(x + 4, y + 2, 3, 1, d);
    X(x + 6, y + 3, d);
    X(x + 5, y + 4, d);
    X(x + 4, y + 5, d);
    P(x + 4, y + 6, 3, 1, d);
  }
}

/** Spent tokens pile up as paper beside the desk: a sheet per third of an order of magnitude past ten thousand. */
function drawPaper(ctx: Ctx, x: number, base: number, tokens: number, i: number) {
  if (tokens < 1e4) return;
  const sheets = Math.max(1, Math.min(14, Math.round((Math.log10(tokens) - 4) * 3)));
  px(ctx, x - 1, base - sheets - 1, 7, sheets + 2, LINE);
  for (let k = 0; k < sheets; k++) {
    const dx = rand(i * 31 + k * 7) > 0.7 ? 1 : 0;
    px(ctx, x + dx, base - 1 - k, 5 - dx, 1, k % 2 ? "#d9d3e6" : "#f1edf8");
  }
  px(ctx, x + 1, base - sheets, 3, 1, "#9aa3c7");
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
    const D = lay.pods[d.pod].d;
    const fromX = x + (w.dir === "right" ? 3 : -9);
    const fromY = y - 10;
    const toX = d.x - 3;
    const toY = d.face === "front" ? D + 2 : D + 20;
    const g = w.give;
    drawPacket(ctx, fromX + (toX - fromX) * g, fromY + (toY - fromY) * g - Math.sin(Math.PI * g) * 8, look.accent);
  }
}

export function drawFrame(ctx: Ctx, f: FrameInput) {
  const { model, lay, tl, looks, clock, t } = f;
  const art = f.room;
  const decor = f.decor ?? NO_DECOR;
  const tick = Math.floor(clock / 110);
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.drawImage(art.base, 0, 0);
  drawAmbient(ctx, t, lay, f.theme);
  const furniture = f.furniture ?? [];
  for (const layer of ["rug", "wall", "sill", "ceiling"] as const) {
    furniture.forEach((s) => s.layer === layer && drawItem(ctx, s.item, s.w, s.cx, s.bottom, t));
  }
  drawDecor(ctx, lay, decor, t);
  drawBar(ctx, t, decor.has("goldMachine"), !f.closed);

  const views = model.agents.map((_, i) => agentView(model, tl, lay, i, clock));
  const leisure = f.closed ? [] : planLeisure(model, lay, spotsOf(lay, furniture), clock);
  const seats = views.map((v, i) => seatOf(f, v, i, leisure[i] ?? null, seatStatus(model, v, i, clock, f.alert)));

  // the far row sits behind the desks
  lay.desks.forEach((d, i) => {
    if (d.face === "front" && seats[i].here) drawPerson2(ctx, d, seats[i], looks[i], tick, t, i);
  });
  ctx.drawImage(art.mid, 0, 0);

  const pen = hallPen(ctx);
  lay.desks.forEach((d, i) => {
    const s = seats[i];
    const D = lay.pods[d.pod].d;
    const c = STATUS_COLOR[s.status];
    if (d.face === "front") {
      pen.P(d.x - 7, D + 3, 14, 1, s.here || v0(views[i]) ? c : dk(c, 0.5));
      if (s.here && s.mode === "work") {
        const up = tick & 1;
        pen.X(d.x - 4, D - up, looks[i].skin);
        pen.X(d.x + 3, D - (1 - up), looks[i].skin);
      } else if (s.here && s.mode !== "nap") {
        pen.X(d.x - 4, D, looks[i].skin);
        pen.X(d.x + 3, D, looks[i].skin);
      }
    } else drawScreen(ctx, d.x, D, views[i], s, clock, t, i);
    const inner = d.side ? d.x - 14 : d.x + 9;
    const base = d.face === "front" ? D + 10 : D + 21;
    const fill = potAt(model.agents[i].pot, clock);
    if (fill != null) drawPot(ctx, inner, base, fill, t);
    else if (s.here && s.mode === "work" && !s.asking) drawCupSteam(ctx, inner + 2, base - 4, t + i * 0.31);
    const tokens = model.agents[i].tokens;
    if (tokens) drawPaper(ctx, d.side ? lay.pods[d.pod].x + 72 : lay.pods[d.pod].x - 7, d.face === "front" ? D + 9 : D + 36, tokens, i);
  });

  // the dressed-up week brings the costumes: each guest has their own, the courier a new one every day
  const dressed = f.theme?.id === "halloween";
  const costume = dressed ? COSTUMES[new Date().getDate() % COSTUMES.length] : null;
  if (f.guests) drawGuests(ctx, f.guests, t, dressed);
  const v = f.visitor;
  if (v && !v.walking) drawVisitor(ctx, v, t, f.visitorCat ?? null, costume);

  const sprites: { y: number; draw: () => void }[] = [];
  lay.desks.forEach((d, i) => {
    if (d.face !== "back") return;
    const D = lay.pods[d.pod].d;
    const s = seats[i];
    const chair = dk(model.agents[i].color, 0.5);
    sprites.push({
      y: D + 40,
      draw: () => {
        if (!s.here) return emptyChair(pen, d.x, D, chair);
        pen.shadow(d.x, D + 41, 9, 2, 0.45);
        pen.P(d.x - 1, D + 37, 2, 3, "#2a2840");
        pen.P(d.x - 5, D + 39, 10, 1, "#2a2840");
        pen.X(d.x - 5, D + 40, O);
        pen.X(d.x + 4, D + 40, O);
        drawPerson2(ctx, d, s, looks[i], tick, t, i);
        pen.P(d.x - 7, D + 29, 14, 9, O);
        pen.P(d.x - 6, D + 30, 12, 7, chair);
        pen.P(d.x - 6, D + 30, 12, 1, lt(chair, 0.3));
        pen.P(d.x - 5, D + 31, 1, 5, lt(chair, 0.15));
        pen.P(d.x + 4, D + 31, 1, 6, dk(chair, 0.3));
      },
    });
  });
  views.forEach((vw, i) => {
    const w = vw.walker;
    if (w) sprites.push({ y: w.y, draw: () => drawWalker(ctx, w, looks[i], lay, clock) });
    const o = seats[i].away;
    if (o) sprites.push({ y: o.y, draw: () => drawOuting(ctx, o, looks[i], clock, t) });
  });
  const cat = f.cat;
  if (cat) sprites.push({ y: cat.footY, draw: () => cat.draw(ctx, t, decor.has("crown")) });
  const cat2 = f.cat2;
  if (cat2) sprites.push({ y: cat2.footY, draw: () => cat2.draw(ctx, t, false) });
  if (v?.walking) sprites.push({ y: v.y, draw: () => drawVisitor(ctx, v, t, f.visitorCat ?? null, costume) });
  furniture.forEach((s) => s.layer === "floor" && sprites.push({ y: s.bottom, draw: () => drawItem(ctx, s.item, s.w, s.cx, s.bottom, t) }));
  sprites.sort((a, b) => a.y - b.y).forEach((s) => s.draw());

  // the light: the room darkens to its corners, then the lamps, the neon and every screen add theirs
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(art.dim, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  if (f.theme?.dim) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = f.theme.dim;
    ctx.fillRect(0, 0, lay.width, lay.height);
    ctx.globalAlpha = 1;
  }
  if (f.closed) {
    ctx.fillStyle = "rgba(3,2,10,0.38)";
    ctx.fillRect(0, 0, lay.width, lay.height);
  }
  ctx.globalCompositeOperation = "lighter";
  if (!f.closed) ctx.drawImage(art.lamps, 0, 0);
  const flick = rand(Math.floor(t * 9)) > 0.97 ? 0.4 : 1;
  ctx.globalAlpha = (f.closed ? 0.3 : 1) * flick;
  ctx.drawImage(art.neon, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  lay.desks.forEach((d, i) => {
    const s = seats[i];
    const D = lay.pods[d.pod].d;
    const c = STATUS_COLOR[s.status];
    const a = s.status === "idle" ? 0.1 : s.status === "wait" ? (Math.floor(t * 2.5) % 2 ? 0.2 : 0.34) : 0.22;
    if (d.face === "front") {
      if (s.here) addGlow(ctx, d.x, D - 3, 12, 8, c, a);
    } else addGlow(ctx, d.x, D + 12, 14, 9, c, s.here ? a : a * 0.5);
  });
  drawDecorLights(ctx, lay, decor, t);
  const eye = f.cat?.eye;
  if (furniture.length || eye) {
    ctx.globalCompositeOperation = "lighter";
    furniture.forEach((s) => itemLight(ctx, s.item, s.cx, s.bottom, t));
    if (eye) glow(ctx, eye.x, eye.y, 3, "#ffd25a", 0.5);
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.drawImage(art.post, 0, 0);

  lay.desks.forEach((d, i) => {
    const s = seats[i];
    if (!s.here) return;
    const D = lay.pods[d.pod].d;
    const bob = s.status === "wait" && Math.floor(t * 2) % 2 ? -1 : 0;
    statusBubble(ctx, d.side ? d.x + 7 : d.x - 18, (d.face === "front" ? D - 12 : D + 18) + bob, s.status);
    if (s.pastime === "nap") drawZzz(ctx, d.x, d.top, t, i);
  });
  drawFlights(ctx, model, lay, clock);
  if (f.ghost) drawGhost(ctx, f.ghost, t);
}

/** A monitor whose agent is off walking work over still shows its light. */
const v0 = (v: AgentView) => !!v.walker;
