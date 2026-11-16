import { CafeLayout } from "@/lib/cafe/layout";
import { VIEW_DY, arcadeScreen, espresso, glassClip } from "./hall";
import { hallPen } from "./hallPen";
import { drawPerson, lookFor } from "./people";
import { Ctx, px } from "./pixel";
import { fixturesOf } from "./room";
import { THEMES, Theme } from "./theme";
import { drawWeather } from "./windows";

const BARISTA = lookFor(9, "#2e5e4e", {
  hair: "#3a2030",
  hairDark: "#2a1820",
  skin: "#e8b88a",
  skinDark: "#c88a64",
  accent: "#efe4cc",
  accentDark: "#c8bca4",
  pants: "#2a2433",
  style: 1,
});

function steamPuff(ctx: Ctx, x: number, y: number, t: number, puffs: number, rise: number) {
  for (let k = 0; k < puffs; k++) {
    const ph = (t * 0.8 + k / puffs) % 1;
    ctx.globalAlpha = 0.5 * (1 - ph);
    px(ctx, x + Math.round(Math.sin((ph + k) * 5)), y - Math.round(ph * rise), 1, 1, "#e9e6f2");
  }
  ctx.globalAlpha = 1;
}

/** What moves on the back wall: the weather behind the window's panes and the arcade's little game. */
export function drawAmbient(ctx: Ctx, t: number, lay: CafeLayout, th: Theme = THEMES.cafe) {
  const fx = fixturesOf(lay);
  ctx.save();
  glassClip(ctx, fx);
  ctx.translate(0, VIEW_DY);
  drawWeather(ctx, t, { WINDOWS: fx.PANES.map((p) => ({ x: p.x - 2, w: p.w + 4 })) }, th);
  ctx.restore();
  arcadeScreen(hallPen(ctx), fx, t);
}

/** The barista between the back counter and the front one; a closed café has no barista, and no steam. */
export function drawBar(ctx: Ctx, t: number, gold = false, open = true) {
  espresso(hallPen(ctx), t, gold);
  if (!open) return;
  drawPerson(ctx, 41, 81, BARISTA, { dir: t % 7 < 1.8 ? "left" : "down", step: 0, carrying: false });
  steamPuff(ctx, 27, 43, t, 4, 9);
}

export function drawCupSteam(ctx: Ctx, x: number, y: number, t: number) {
  steamPuff(ctx, x, y, t, 3, 7);
}
