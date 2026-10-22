import { drawCupSteam } from "./ambient";
import { Outing } from "./outing";
import { drawCostumeLounging } from "./halloween";
import { Look, drawPerson, head } from "./people";
import { Box, Ctx, LINE, Rect, paint, px } from "./pixel";

const SHOES = "#2b2433";
const NOTES = ["#ffd25a", "#5ce1ff", "#ff4fa3"];

/** Someone on a couch facing the room, feet on the floor at `B`. */
function drawLounging(ctx: Ctx, x: number, B: number, k: Look) {
  const L = Math.round(x) - 5;
  const T = Math.round(B) - 20;
  const sil: Box[] = [[L + 1, T, 8, 8], [L + 1, T + 8, 8, 6], [L + 2, T + 14, 6, 2], [L + 3, T + 16, 4, 4]];
  const f: Rect[] = [
    [L + 1, T + 8, 8, 6, k.shirtDark],
    [L + 2, T + 8, 6, 5, k.shirt],
    [L + 2, T + 13, 1, 1, k.skin],
    [L + 7, T + 13, 1, 1, k.skin],
    [L + 2, T + 14, 6, 2, k.pants],
    [L + 3, T + 16, 2, 4, k.pants],
    [L + 5, T + 16, 2, 4, k.pants],
    [L + 3, T + 19, 2, 1, SHOES],
    [L + 5, T + 19, 2, 1, SHOES],
  ];
  const [hs, hf] = head(L, T, k, "front");
  paint(ctx, [...sil, ...hs], [...f, ...hf]);
  if (k.costume) drawCostumeLounging(ctx, k.costume, x, T);
}

function drawChat(ctx: Ctx, x: number, top: number, t: number) {
  const L = Math.round(x) - 4;
  const T = top - 7;
  px(ctx, L, T, 9, 5, LINE);
  px(ctx, L + 1, T + 1, 7, 3, "#f1edf8");
  px(ctx, L + 2, T + 5, 1, 1, LINE);
  const dots = 1 + (Math.floor(t * 3) % 3);
  for (let n = 0; n < dots; n++) px(ctx, L + 2 + n * 2, T + 2, 1, 1, "#3a3550");
}

/** A cup of coffee or a can from the machine, held at (x, y). */
export function drawDrink(ctx: Ctx, x: number, y: number, can: boolean, t: number) {
  const X = Math.round(x);
  const Y = Math.round(y);
  if (can) {
    px(ctx, X, Y - 1, 3, 5, LINE);
    px(ctx, X + 1, Y, 1, 3, "#ff5d73");
    return;
  }
  px(ctx, X, Y, 4, 4, LINE);
  px(ctx, X + 1, Y + 1, 2, 2, "#ece4d6");
  px(ctx, X + 1, Y + 1, 2, 1, "#6b4a2e");
  drawCupSteam(ctx, X + 1, Y - 1, t);
}

function heldDrink(ctx: Ctx, o: Outing, t: number) {
  if (o.dir === "up") return;
  const dx = o.dir === "left" ? -8 : o.dir === "right" ? 5 : 3;
  drawDrink(ctx, o.x + dx, o.y - (o.dir === "down" ? 9 : 10), o.errand === "soda", t);
}

function drawNotes(ctx: Ctx, x: number, top: number, t: number) {
  for (let n = 0; n < 3; n++) {
    const ph = (t * 0.45 + n / 3) % 1;
    const X = Math.round(x - 6 + n * 5 + Math.sin((ph + n) * 6) * 2);
    const Y = Math.round(top - 3 - ph * 14);
    const c = NOTES[n];
    ctx.globalAlpha = Math.min(1, (1 - ph) * 1.8);
    px(ctx, X + 1, Y, 1, 4, c);
    px(ctx, X + 2, Y, 1, 1, c);
    px(ctx, X, Y + 3, 2, 2, c);
  }
  ctx.globalAlpha = 1;
}

function drawSparks(ctx: Ctx, x: number, top: number, t: number) {
  if (Math.floor(t * 2) % 5) return;
  const ph = (t * 2) % 1;
  for (const [dx, dy] of [[-5, -1], [0, -4], [5, -1]]) {
    px(ctx, Math.round(x + dx * (1 + ph)), Math.round(top + dy * (1 + ph)), 1, 1, ph < 0.5 ? "#ffd25a" : "#ffffff");
  }
}

/** An agent away from the desk: on the way to a spot or back with a drink, or there — on the couch, at the arcade… */
export function drawOuting(ctx: Ctx, o: Outing, k: Look, clock: number, t: number) {
  const x = Math.round(o.x);
  const y = Math.round(o.y);
  if (o.phase === "there" && o.errand === "couch") {
    drawLounging(ctx, x, y - 2, k);
    if (o.mate && Math.floor(t / 2.2) % 2 === o.seat) drawChat(ctx, x, y - 22, t);
    return;
  }
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(x - 4, y - 1, 9, 2);
  const moving = o.phase !== "there";
  const step = moving ? 1 + (Math.floor(clock / 150) % 2) : 0;
  drawPerson(ctx, x, y, k, { dir: o.dir, step, carrying: false });
  if (o.phase === "back" && (o.errand === "coffee" || o.errand === "soda")) heldDrink(ctx, o, t);
  if (o.phase !== "there") return;
  if (o.errand === "coffee" && o.progress > 0.6) heldDrink(ctx, o, t);
  if (o.errand === "arcade") {
    const a = Math.floor(t * 8) % 2;
    px(ctx, x - 5, y - 9 + a, 1, 2, k.shirtDark);
    px(ctx, x + 4, y - 8 - a, 1, 2, k.shirtDark);
    drawSparks(ctx, x, y - 38, t);
  }
  if (o.errand === "jukebox") drawNotes(ctx, x, y - 32, t);
}
