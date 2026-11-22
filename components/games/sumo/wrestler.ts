"use client";

import { hexRgb, shade } from "../../cafe/pixel";
import { Ctx, INK, Stage, blob, dot, stamp } from "./pixels";

/*
 * A wrestler: a round blob in its player's colour with a topknot, a belt, two mitts, two feet and a face that says
 * what is happening to it. The body is an oval worked out afresh each frame, so it squashes on a hit and stretches
 * into a dash and still lands on whole pixels; the face is a handful of tiny pictures put together by mood.
 *
 * It is drawn a little bigger than the game counts it, and standing on the spot the game has it at: the floe is seen
 * from above and in front, so what goes over the rim is the feet.
 */

/** half a wrestler's width as drawn, art pixels */
export const R = 15;
/** how far under the spot they stand on their underside is drawn */
export const DROP = 5;
/** how far over that spot the middle of the body is */
export const MID = R - DROP;

export type Mood = "calm" | "focus" | "strain" | "panic" | "fall" | "dizzy" | "joy" | "sulk" | "cold";
/** where the mitts are: at the sides, on the other wrestler, swept back in a dash, waving, up, down for the crouch */
export type Hands = "rest" | "push" | "back" | "flail" | "up" | "fists" | "knees" | "none";

export interface Pose {
  /** the spot they stand on, art pixels from the middle of the stage, and how high off it they are */
  x: number;
  y: number;
  z: number;
  color: string;
  /** the way the body is stretched along (k > 0) or squashed along (k < 0), and by how much */
  ax: number;
  ay: number;
  k: number;
  /** where they look */
  lx: number;
  ly: number;
  mood: Mood;
  blink: boolean;
  /** the clock the moving faces and mitts go by, ms */
  t: number;
  /** how far through a step they are, 0 to 1, or -1 standing still */
  walk: number;
  hands: Hands;
  /** a foot raised for the stomp: -1 the left, 1 the right */
  lift: number;
  /** white for a moment, as the one hit */
  flash: boolean;
  /** how cold, 0 to 1: the colour goes to ice */
  chill: number;
  /** on the ice, with a shadow and feet under it */
  ground: boolean;
}

interface Tones {
  base: string;
  dark: string;
  light: string;
  cheek: string;
  belt: string;
  knot: string;
}

const tones = new Map<string, Tones>();
const ICE: [number, number, number] = [196, 232, 255];

function tonesOf(color: string, chill: number): Tones {
  const step = Math.round(chill * 4);
  const key = `${color}${step}`;
  let t = tones.get(key);
  if (!t) {
    const [r, g, b] = hexRgb(color);
    const k = step * 0.16;
    const mix = (v: number, to: number) => Math.round(v + (to - v) * k);
    const hex = `#${[mix(r, ICE[0]), mix(g, ICE[1]), mix(b, ICE[2])].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    t = {
      base: hex,
      dark: shade(hex, 0.72),
      light: shade(hex, 1.2),
      cheek: step > 1 ? "#8fc4f2" : `rgb(${Math.round(r * 0.5 + 255 * 0.5)},${Math.round(g * 0.42)},${Math.round(b * 0.42 + 64)})`,
      belt: shade(hex, 0.36),
      knot: shade(hex, 0.52),
    };
    tones.set(key, t);
  }
  return t;
}

const WHITE: Tones = { base: "#ffffff", dark: "#dbe8f5", light: "#ffffff", cheek: "#ffffff", belt: "#eef5ff", knot: "#ffffff" };

/** the eyes, the left one; the right one is its mirror. Six rows each. */
const EYES = {
  open: [".KK.", "KWKK", "KKKK", "KKKK", "KKKK", ".KK."],
  blink: ["....", "....", "....", "KKKK", "....", "...."],
  joy: ["....", ".KK.", "K..K", "K..K", "....", "...."],
  tight: ["....", "KK..", "..KK", "..KK", "KK..", "...."],
  lid: ["....", "....", "KKKK", "KWKK", ".KK.", "...."],
  cross: ["....", "K..K", ".KK.", ".KK.", "K..K", "...."],
  swirl: ["....", ".KK.", "K..K", "K..K", ".KK.", "...."],
  wide: [".KKK.", "KWWWK", "KWKWK", "KWKWK", "KWWWK", ".KKK."],
} satisfies Record<string, string[]>;

const MOUTHS = {
  smile: ["K.K", ".K."],
  flat: ["KKK"],
  teeth: ["KKKKKKK", "KWKWKWK", "KKKKKKK"],
  oh: [".K.", "KRK", "KRK", ".K."],
  scream: [".KKK.", "KRRRK", "KRRRK", "KRRRK", ".KKK."],
  wave: [".K.K.K.", "K.K.K.K"],
  grin: ["KKKKKKK", "KWWWWWK", "KRRRRRK", ".KKKKK."],
  pout: [".KKK.", "K...K"],
  chatterA: ["KKKKKKK", "KWKWKWK", "KKKKKKK"],
  chatterB: ["KKKKKKK", "KKWKWKK", "KKKKKKK"],
} satisfies Record<string, string[]>;

/** the brow over the left eye: set, for a fight; and worried */
const BROW_SET = ["KK..", "..KK"];
const BROW_SAD = ["..KK", "KK.."];
const BUN = [".KKK.", "KHKKK", "KKKKK", ".KKK."];
const MITT = [".KKK.", "KLCCK", "KCCCK", "KCCCK", ".KKK."];
const FOOT = [".KKKKK.", "KDDDDDK", "KDDDDDK", ".KKKKK."];

const FACE = { K: INK, W: "#ffffff", R: "#e0525e" };
/** how far from the middle of the face the inner edge of each eye is */
const APART = 3;

function face(ctx: Ctx, x: number, y: number, p: Pose, t: Tones) {
  let eyes: string[] = p.blink ? EYES.blink : EYES.open;
  let mouth: string[] = MOUTHS.smile;
  let brows: string[] | null = null;
  let cheeks = false;
  let jitter = 0;
  switch (p.mood) {
    case "focus":
      mouth = MOUTHS.flat;
      brows = BROW_SET;
      break;
    case "strain":
      eyes = EYES.tight;
      mouth = MOUTHS.teeth;
      cheeks = true;
      break;
    case "panic":
      eyes = EYES.wide;
      mouth = MOUTHS.oh;
      brows = BROW_SAD;
      break;
    case "fall":
      eyes = EYES.wide;
      mouth = MOUTHS.scream;
      break;
    case "dizzy":
      eyes = Math.floor(p.t / 130) % 2 ? EYES.cross : EYES.swirl;
      mouth = MOUTHS.wave;
      break;
    case "joy":
      eyes = EYES.joy;
      mouth = MOUTHS.grin;
      cheeks = true;
      break;
    case "sulk":
      eyes = EYES.lid;
      mouth = MOUTHS.pout;
      brows = BROW_SAD;
      break;
    case "cold":
      eyes = EYES.tight;
      mouth = Math.floor(p.t / 80) % 2 ? MOUTHS.chatterA : MOUTHS.chatterB;
      jitter = Math.floor(p.t / 80) % 2;
      cheeks = true;
      break;
  }
  const wide = eyes[0].length;
  const top = y - 6;
  stamp(ctx, eyes, x - APART - wide + 1, top, FACE);
  stamp(ctx, eyes, x + APART, top, FACE, true);
  if (brows) {
    const up = wide > 4 ? 2 : 1;
    stamp(ctx, brows, x - APART - 4, top - up, FACE);
    stamp(ctx, brows, x + APART + 1, top - up, FACE, true);
  }
  if (cheeks) {
    dot(ctx, x - 10, y, t.cheek, 3, 2);
    dot(ctx, x + 8, y, t.cheek, 3, 2);
  }
  const mw = mouth[0].length;
  stamp(ctx, mouth, x - (mw >> 1), y + 1 + jitter, FACE);
}

/** Where each mitt is from the body's middle. */
function mitts(p: Pose, tall: number): [number, number, number, number] {
  const sx = -p.ly;
  const sy = p.lx;
  switch (p.hands) {
    case "push":
      // out in front, and low enough to leave the face clear
      return [p.lx * 12 + sx * 6, p.ly * 9 + sy * 5 + 5, p.lx * 12 - sx * 6, p.ly * 9 - sy * 5 + 5];
    case "back":
      return [-p.lx * 7 + sx * (R - 1), -p.ly * 7 + sy * (R - 1), -p.lx * 7 - sx * (R - 1), -p.ly * 7 - sy * (R - 1)];
    case "flail": {
      const a = p.t * 0.024;
      return [Math.cos(a) * (R + 3), Math.sin(a) * (R + 3) - 2, Math.cos(a + 2.6) * (R + 3), Math.sin(a + 2.6) * (R + 3) - 2];
    }
    case "up": {
      const hop = Math.floor(p.t / 140) % 2;
      return [-(R + 1), -R + 3 - hop, R + 1, -R + 3 - (1 - hop)];
    }
    case "fists":
      return [-8, tall - 1, 8, tall - 1];
    case "knees":
      return [-R + 1, 7, R - 1, 7];
    default: {
      const swing = p.walk < 0 ? 0 : Math.sin(p.walk * Math.PI * 2) * 2;
      return [-(R + 1) + p.lx * 2, 4 + swing, R + 1 + p.lx * 2, 4 - swing];
    }
  }
}

/** Draws one wrestler. */
export function drawWrestler(ctx: Ctx, st: Stage, p: Pose) {
  const t = p.flash ? WHITE : tonesOf(p.color, p.chill);
  const a = R * (1 + p.k);
  const b = R * (1 - 0.7 * p.k);
  // however it is squashed, its underside stays where its feet are
  const tall = Math.round(Math.sqrt(a * a * p.ay * p.ay + b * b * p.ax * p.ax));
  const x = st.hang(p.x);
  const under = st.hang(p.y - p.z) + DROP;
  const y = under - tall;

  if (p.ground) {
    const far = Math.min(1, p.z / 30);
    ctx.fillStyle = "rgba(34, 78, 120, 0.3)";
    const sw = Math.round((R - 2) * (1 - far * 0.45));
    const sy = st.hang(p.y) + DROP - 1;
    for (let j = -3; j <= 3; j++) {
      const half = Math.round(sw * Math.sqrt(1 - (j * j) / 12.25));
      ctx.fillRect(x - half, sy + j, 2 * half + 1, 1);
    }
    const fy = under - 3;
    const stepL = p.walk >= 0 && p.walk < 0.5 ? -1 : 0;
    const stepR = p.walk >= 0.5 ? -1 : 0;
    const feet = { K: INK, D: t.dark };
    stamp(ctx, FOOT, x - 11 - (p.lift < 0 ? 6 : 0), fy + stepL - (p.lift < 0 ? 8 : 0), feet);
    stamp(ctx, FOOT, x + 5 + (p.lift > 0 ? 6 : 0), fy + stepR - (p.lift > 0 ? 8 : 0), feet);
  }

  blob(ctx, x, y, a + 1, b + 1, p.ax, p.ay, INK);
  blob(ctx, x, y, a, b, p.ax, p.ay, t.dark);
  blob(ctx, x - 1, y - 1, a - 1, b - 1, p.ax, p.ay, t.base);
  blob(ctx, x - Math.round(a * 0.34), y - Math.round(tall * 0.52), a * 0.36, b * 0.22, p.ax, p.ay, t.light);
  dot(ctx, x - 7, y - Math.round(tall * 0.68), "#ffffff", 2, 1);
  // the belt, low across the belly, and its knot
  const belt = Math.round(tall * 0.56);
  blob(ctx, x, y, a, b, p.ax, p.ay, t.belt, belt, belt + 3);
  dot(ctx, x - 1 + Math.round(p.lx * 3), y + belt, t.knot, 3, 3);

  stamp(ctx, BUN, x - 2 - Math.round(p.lx * 2), y - tall - 3, { K: INK, H: "#55497a" });

  face(ctx, x + Math.round(p.lx * 3), y - 1 + Math.round(p.ly < 0 ? p.ly * 3 : p.ly * 2), p, t);

  if (p.hands !== "none") {
    const m = mitts(p, tall);
    const pal = { K: INK, C: t.base, L: t.light };
    stamp(ctx, MITT, x + Math.round(m[0]) - 2, y + Math.round(m[1]) - 2, pal);
    stamp(ctx, MITT, x + Math.round(m[2]) - 2, y + Math.round(m[3]) - 2, pal);
  }
}

/** half the side of the block of ice a wrestler comes back up in */
const BLOCK = R + 3;
/** how much of it rides under the water */
const SUNK = 7;

/**
 * A wrestler who fell in, back up frozen in a block of ice. `rise` is how far the block has come out of the water:
 * 0 still under, 1 riding it; a little over 1 as it pops up.
 */
export function drawFrozen(ctx: Ctx, st: Stage, p: Pose, rise: number, now: number) {
  const x = st.hang(p.x);
  const water = st.hang(p.y) + DROP + 2;
  const bob = Math.round(Math.sin(now / 420 + p.x) * 1.2);
  // a shiver now and then
  const shiver = Math.floor(now / 55) % 2 && Math.floor(now / 900 + p.x) % 2 ? 1 : 0;
  // the middle of the block
  const y = water + SUNK - BLOCK + Math.round((1 - rise) * (2 * BLOCK + 2)) + bob;
  const x0 = x - BLOCK + shiver;
  const y0 = y - BLOCK;
  const side = 2 * BLOCK + 1;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - BLOCK - 4, y0 - 12, side + 8, Math.max(0, water - (y0 - 12)));
  ctx.clip();
  // the top of the block, seen from a little above
  dot(ctx, x0 + 1, y0 - 4, "rgba(226, 246, 255, 0.72)", side - 2, 4);
  dot(ctx, x0 + 1, y0 - 5, "#f4fcff", side - 2, 1);
  dot(ctx, x0, y0 - 4, "#f4fcff", 1, 4);
  dot(ctx, x0 + side - 1, y0 - 4, "#a9dcf6", 1, 4);
  // hang() takes the middle of a pixel, and these are corners already
  drawWrestler(ctx, st, { ...p, x: x + shiver + 0.5, y: y + 2 + MID + 0.5, z: 0, mood: "cold", hands: "none", ground: false, chill: 1, k: 0 });
  ctx.fillStyle = "rgba(190, 232, 255, 0.36)";
  ctx.fillRect(x0, y0, side, side);
  ctx.fillStyle = "rgba(96, 170, 222, 0.3)";
  ctx.fillRect(x0, y0 + side - 6, side, 6);
  dot(ctx, x0 + 1, y0, "#f4fcff", side - 2, 1);
  dot(ctx, x0, y0 + 1, "#f4fcff", 1, side - 2);
  dot(ctx, x0 + side - 1, y0 + 1, "#8fd0f2", 1, side - 2);
  dot(ctx, x0 + 1, y0 + side - 1, "#8fd0f2", side - 2, 1);
  // the light on its face: two strokes across a corner
  for (let i = 0; i < 7; i++) dot(ctx, x0 + 3 + i, y0 + 10 - i, "#ffffff", 1, 1);
  for (let i = 0; i < 4; i++) dot(ctx, x0 + 3 + i, y0 + 15 - i, "#ffffff", 1, 1);
  dot(ctx, x0 + side - 6, y0 + side - 11, "#ffffff", 2, 1);
  ctx.restore();
  if (rise > 0.3) {
    // the water round it
    const beat = Math.floor(now / 200);
    for (let i = -BLOCK - 3; i <= BLOCK + 3; i++) {
      const on = (((i + beat) % 3) + 3) % 3;
      if (on === 0) continue;
      dot(ctx, x + i + shiver, water + (Math.abs(i) > BLOCK ? 0 : on === 1 ? 0 : 1), on === 1 ? "#e9f7ff" : "#9fd4f5", 1, 1);
    }
  }
}
