import { CafeLayout } from "@/lib/cafe/layout";
import { AgentView } from "@/lib/cafe/timeline";
import { drawPerson, lookFor } from "./people";
import { Ctx, LINE, glow, px, rand } from "./pixel";
import { Fixtures, fixtures } from "./room";

const BARISTA = lookFor(9, "#e9e2cf", {
  hair: "#3a2416",
  hairDark: "#2a1a10",
  skin: "#e0ac7e",
  skinDark: "#c48e63",
  accent: "#7a2d3a",
  accentDark: "#561f29",
  pants: "#2a2433",
  style: 3,
});

function hand(ctx: Ctx, CLOCK: Fixtures["CLOCK"], angle: number, len: number, color: string) {
  for (let r = 0; r <= len; r++) {
    px(ctx, CLOCK.x + Math.round(Math.cos(angle) * r), CLOCK.y + Math.round(Math.sin(angle) * r), 1, 1, color);
  }
}

function rain(ctx: Ctx, t: number, fx: Fixtures) {
  fx.WINDOWS.forEach((w, wi) => {
    const ix = w.x + 2;
    const iw = w.w - 4;
    const ih = 23;
    ctx.globalAlpha = 0.5;
    for (let k = 0; k < 12; k++) {
      const speed = 22 + rand(k + wi * 20) * 10;
      const y = (t * speed + rand(k * 7 + wi) * ih) % ih;
      px(ctx, ix + Math.floor(rand(k * 13 + wi * 3) * iw), 7 + y, 1, 2, "#7d95d6");
    }
    ctx.globalAlpha = 1;
  });
}

function steamPuff(ctx: Ctx, x: number, y: number, t: number, puffs: number, rise: number) {
  for (let k = 0; k < puffs; k++) {
    const ph = (t * 0.8 + k / puffs) % 1;
    ctx.globalAlpha = 0.5 * (1 - ph);
    px(ctx, x + Math.round(Math.sin((ph + k) * 5)), y - Math.round(ph * rise), 1, 1, "#e9e6f2");
  }
  ctx.globalAlpha = 1;
}

export function drawAmbient(ctx: Ctx, t: number, width: number) {
  const fx = fixtures(width);
  rain(ctx, t, fx);
  hand(ctx, fx.CLOCK, -Math.PI / 2 + t * 0.35, 5, LINE);
  hand(ctx, fx.CLOCK, -Math.PI / 2 + t * 0.03, 3, "#7a2d3a");
}

/** The coffee bar on the left wall: barista first, then the counter in front of them. */
export function drawBar(ctx: Ctx, t: number) {
  drawPerson(ctx, 25, 71, BARISTA, { dir: t % 7 < 1.8 ? "left" : "down", step: 0, carrying: false });

  px(ctx, 0, 63, 47, 20, LINE);
  px(ctx, 0, 64, 46, 8, "#8a6448");
  px(ctx, 0, 64, 46, 1, "#a07a58");
  px(ctx, 0, 72, 46, 10, "#5e4232");
  for (const x of [11, 23, 35]) px(ctx, x, 73, 1, 8, "#4a3326");

  px(ctx, 3, 47, 15, 19, LINE);
  px(ctx, 4, 48, 13, 17, "#b9bdc9");
  px(ctx, 4, 48, 13, 2, "#d9dce6");
  px(ctx, 6, 51, 9, 5, "#2a2a33");
  px(ctx, 7, 52, 1, 1, Math.floor(t * 2) % 2 ? "#ff5d5d" : "#5a1f1f");
  px(ctx, 9, 52, 1, 1, "#4ade80");
  px(ctx, 8, 58, 5, 6, "#1a1a20");
  px(ctx, 9, 61, 3, 3, "#ece4d6");
  steamPuff(ctx, 10, 45, t, 4, 9);

  for (const x of [20, 24]) {
    px(ctx, x - 1, 65, 5, 5, LINE);
    px(ctx, x, 66, 3, 3, "#ece4d6");
  }
  px(ctx, 30, 60, 13, 9, LINE);
  px(ctx, 31, 61, 11, 7, "#3c4a5c");
  px(ctx, 32, 61, 2, 5, "#7f93ad");
  px(ctx, 34, 65, 6, 3, "#d9973f");
  px(ctx, 35, 65, 4, 1, "#f0b35e");
  px(ctx, 30, 68, 13, 1, "#cfd3dc");
}

export function drawCupSteam(ctx: Ctx, x: number, y: number, t: number) {
  steamPuff(ctx, x, y, t, 3, 7);
}

/** Dims the room, then adds every light source on top. */
export function drawLights(ctx: Ctx, lay: CafeLayout, views: AgentView[], colors: string[], t: number) {
  ctx.fillStyle = "rgba(9,6,22,0.30)";
  ctx.fillRect(0, 0, lay.width, lay.height);
  ctx.globalCompositeOperation = "lighter";

  const { SIGN, SCONCES, WINDOWS, VENDING } = fixtures(lay.width);
  const flick = rand(Math.floor(t * 9)) > 0.96 ? 0.35 : 0.9 + 0.1 * Math.sin(t * 17);
  const sx = SIGN.x + SIGN.w / 2;
  const sy = SIGN.y + SIGN.h / 2;
  glow(ctx, sx, sy, 74, "#ff4fa3", 0.16 * flick);
  glow(ctx, sx, sy - 3, 44, "#5ce1ff", 0.1 * flick);
  for (const x of SCONCES) glow(ctx, x, 13, 34, "#ffb15e", 0.22);
  for (const w of WINDOWS) glow(ctx, w.x + w.w / 2, 20, 40, "#4f6bff", 0.06);
  glow(ctx, VENDING.x + 12, VENDING.y + 22, 36, "#59d8ff", 0.15);
  for (const top of lay.bands) glow(ctx, lay.width / 2, top + 30, 160, "#ffcf8a", 0.045);

  views.forEach((v, i) => {
    const d = lay.desks[i];
    if (v.screen === "work") {
      glow(ctx, d.x, d.top + 7, 30, colors[i], 0.32);
      glow(ctx, d.x, d.top + 28, 24, colors[i], 0.1);
    } else if (v.screen === "incoming") {
      glow(ctx, d.x, d.top + 7, 26, "#ffd25a", Math.floor(t * 4) % 2 ? 0.08 : 0.26);
    } else if (v.screen === "done") {
      glow(ctx, d.x, d.top + 7, 20, "#4ade80", 0.1);
    } else {
      glow(ctx, d.x, d.top + 7, 18, "#5b8cff", 0.06);
    }
  });
  ctx.globalCompositeOperation = "source-over";
}
