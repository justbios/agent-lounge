import { Dir } from "@/lib/cafe/layout";
import { Box, Ctx, LINE, Rect, paint, px, shade } from "./pixel";

const SHOES = "#2b2433";
const HAIR = ["#2a1c14", "#6b3b1c", "#d6a446", "#1a1922", "#9c3d24", "#d9d4cc", "#4a2f6b", "#7a4a2a"];
const SKIN = ["#f2c9a1", "#dba67a", "#b97c52", "#8a5a3a", "#f6d7bb"];
const PANTS = ["#2f3550", "#3a2f45", "#283a3a", "#40342a"];
const SHIRTS = ["#e8e4f0", "#3b3f4f", "#d9534f", "#f0a43a", "#f2d24b", "#4caf72", "#3f8fd2", "#8b5cc7", "#e57aa8"];

export interface Look {
  hair: string;
  hairDark: string;
  skin: string;
  skinDark: string;
  shirt: string;
  shirtDark: string;
  pants: string;
  accent: string;
  accentDark: string;
  /** 0 headphones · 1 long hair · 2 bun · 3 cap */
  style: number;
}

const at = <T,>(list: T[], i: number): T => list[((i % list.length) + list.length) % list.length];

export const LOOK_CHOICES = { style: 4, hair: HAIR.length, skin: SKIN.length, shirt: SHIRTS.length } as const;

const mod = (i: number, n: number) => ((i % n) + n) % n;

/** The palette indexes {@link lookFor} gives look `i` before anyone picks otherwise. */
export const lookIndex = (i: number) => ({ style: mod(i, 4), hair: mod(i, HAIR.length), skin: mod(i * 3 + 1, SKIN.length) });

/** What a café owner picked for an agent, as a {@link lookFor} override. */
export function pickedLook(p: { style?: number; hair?: number; skin?: number; shirt?: number } | undefined): Partial<Look> {
  if (!p) return {};
  const out: Partial<Look> = {};
  if (p.style != null) out.style = at([0, 1, 2, 3], p.style);
  if (p.hair != null) {
    out.hair = at(HAIR, p.hair);
    out.hairDark = shade(out.hair, 0.7);
  }
  if (p.skin != null) {
    out.skin = at(SKIN, p.skin);
    out.skinDark = shade(out.skin, 0.82);
  }
  if (p.shirt != null) {
    out.shirt = at(SHIRTS, p.shirt);
    out.shirtDark = shade(out.shirt, 0.66);
  }
  return out;
}

export function lookFor(i: number, color: string, override: Partial<Look> = {}): Look {
  const hair = at(HAIR, i);
  const skin = at(SKIN, i * 3 + 1);
  return {
    hair,
    hairDark: shade(hair, 0.7),
    skin,
    skinDark: shade(skin, 0.82),
    shirt: color,
    shirtDark: shade(color, 0.66),
    pants: at(PANTS, i),
    accent: color,
    accentDark: shade(color, 0.55),
    style: ((i % 4) + 4) % 4,
    ...override,
  };
}

export interface Pose {
  dir: Dir;
  /** 0 standing, 1 / 2 alternating walk frames */
  step: number;
  carrying: boolean;
}

export type SeatMode = "idle" | "work" | "done" | "alert" | "nap";

function styleFrontBack(L: number, T: number, k: Look, back: boolean): [Box[], Rect[]] {
  switch (k.style) {
    case 0:
      return [
        [[L, T + 3, 1, 3], [L + 9, T + 3, 1, 3]],
        [[L, T + 3, 1, 3, k.accent], [L + 9, T + 3, 1, 3, k.accent]],
      ];
    case 1:
      return back
        ? [[[L + 1, T + 8, 8, 2]], [[L + 1, T + 8, 8, 2, k.hair]]]
        : [[], [[L + 1, T + 3, 1, 6, k.hair], [L + 8, T + 3, 1, 6, k.hair]]];
    case 2:
      return [[[L + 4, T - 2, 2, 2]], [[L + 4, T - 2, 2, 2, k.hair]]];
    default:
      return [[], [[L + 1, T, 8, back ? 3 : 2, k.accent], [L + 1, T + (back ? 3 : 2), 8, 1, k.accentDark]]];
  }
}

function styleSide(L: number, T: number, k: Look): [Box[], Rect[]] {
  switch (k.style) {
    case 0:
      return [[], [[L + 4, T + 3, 2, 3, k.accent]]];
    case 1:
      return [[[L + 2, T + 6, 3, 3]], [[L + 2, T + 3, 3, 6, k.hair]]];
    case 2:
      return [[[L + 2, T - 1, 2, 2]], [[L + 2, T - 1, 2, 2, k.hair]]];
    default:
      return [[[L + 8, T + 2, 2, 1]], [[L + 2, T, 7, 2, k.accent], [L + 7, T + 2, 3, 1, k.accentDark]]];
  }
}

function frontBack(L: number, T: number, k: Look, step: number, back: boolean, carrying: boolean): [Box[], Rect[]] {
  const liftL = step === 1 ? 1 : 0;
  const liftR = step === 2 ? 1 : 0;
  const sil: Box[] = [
    [L + 1, T, 8, 8],
    [L + 1, T + 8, 8, 6],
    [L + 3, T + 14, 2, 4 - liftL],
    [L + 5, T + 14, 2, 4 - liftR],
  ];
  const f: Rect[] = back
    ? [[L + 1, T, 8, 8, k.hair], [L + 1, T + 7, 8, 1, k.hairDark]]
    : [
        [L + 1, T, 8, 8, k.skin],
        [L + 1, T, 8, 3, k.hair],
        [L + 1, T + 3, 1, 2, k.hair],
        [L + 8, T + 3, 1, 2, k.hair],
        [L + 3, T + 4, 1, 2, LINE],
        [L + 6, T + 4, 1, 2, LINE],
        [L + 2, T + 7, 6, 1, k.skinDark],
      ];
  f.push([L + 1, T + 8, 8, 6, k.shirtDark], [L + 2, T + 8, 6, 5, k.shirt]);
  if (!carrying) f.push([L + 1, T + 13 - liftR, 1, 1, k.skin], [L + 8, T + 13 - liftL, 1, 1, k.skin]);
  f.push(
    [L + 3, T + 14, 2, 4 - liftL, k.pants],
    [L + 5, T + 14, 2, 4 - liftR, k.pants],
    [L + 3, T + 17 - liftL, 2, 1, SHOES],
    [L + 5, T + 17 - liftR, 2, 1, SHOES],
  );
  const [es, ef] = styleFrontBack(L, T, k, back);
  return [[...sil, ...es], [...f, ...ef]];
}

function side(L: number, T: number, k: Look, step: number, carrying: boolean): [Box[], Rect[]] {
  const sil: Box[] = [[L + 2, T, 7, 8], [L + 3, T + 8, 5, 6]];
  const f: Rect[] = [
    [L + 2, T, 7, 8, k.skin],
    [L + 2, T, 7, 3, k.hair],
    [L + 2, T + 3, 3, 4, k.hair],
    [L + 2, T + 6, 3, 1, k.hairDark],
    [L + 4, T + 4, 1, 2, k.skinDark],
    [L + 7, T + 4, 1, 2, LINE],
    [L + 5, T + 7, 4, 1, k.skinDark],
    [L + 3, T + 8, 5, 6, k.shirt],
    [L + 3, T + 8, 1, 6, k.shirtDark],
  ];
  if (step === 1) {
    sil.push([L + 3, T + 14, 2, 4], [L + 6, T + 14, 2, 4], [L + 6, T + 17, 3, 1]);
    f.push(
      [L + 3, T + 14, 2, 4, k.pants],
      [L + 6, T + 14, 2, 4, k.pants],
      [L + 3, T + 17, 2, 1, SHOES],
      [L + 6, T + 17, 3, 1, SHOES],
    );
  } else {
    sil.push([L + 4, T + 14, 3, 4], [L + 4, T + 17, 4, 1]);
    f.push([L + 4, T + 14, 3, 4, k.pants], [L + 4, T + 17, 4, 1, SHOES]);
  }
  const swing = step === 1 ? -1 : step === 2 ? 1 : 0;
  if (carrying) f.push([L + 6, T + 10, 2, 2, k.shirtDark]);
  else f.push([L + 5 + swing, T + 9, 2, 4, k.shirtDark], [L + 5 + swing, T + 13, 2, 1, k.skin]);
  const [es, ef] = styleSide(L, T, k);
  return [[...sil, ...es], [...f, ...ef]];
}

function flipBox(b: Box, L: number): Box {
  return [2 * L + 10 - b[0] - b[2], b[1], b[2], b[3]];
}

function flipRect(r: Rect, L: number): Rect {
  return [2 * L + 10 - r[0] - r[2], r[1], r[2], r[3], r[4]];
}

export function drawPacket(ctx: Ctx, x: number, y: number, color: string) {
  const X = Math.round(x);
  const Y = Math.round(y);
  paint(ctx, [[X, Y, 6, 5]], [
    [X, Y, 6, 5, "#c8955a"],
    [X, Y, 6, 1, "#e0b27a"],
    [X + 2, Y, 2, 5, "#efe2bf"],
    [X + 4, Y + 2, 2, 2, color],
  ]);
}

/** A standing or walking person whose feet touch (x, feetY). */
export function drawPerson(ctx: Ctx, x: number, feetY: number, k: Look, pose: Pose) {
  const L = Math.round(x) - 5;
  const T = Math.round(feetY) - 18;
  if (pose.dir === "left" || pose.dir === "right") {
    const [sil, f] = side(L, T, k, pose.step, pose.carrying);
    const left = pose.dir === "left";
    paint(ctx, left ? sil.map((b) => flipBox(b, L)) : sil, left ? f.map((r) => flipRect(r, L)) : f);
    if (pose.carrying) drawPacket(ctx, left ? L - 1 : L + 5, T + 9, k.accent);
    return;
  }
  const back = pose.dir === "up";
  const [sil, f] = frontBack(L, T, k, pose.step, back, pose.carrying);
  paint(ctx, sil, f);
  if (pose.carrying && !back) {
    drawPacket(ctx, L + 2, T + 9, k.accent);
    px(ctx, L + 1, T + 11, 1, 1, k.skin);
    px(ctx, L + 8, T + 11, 1, 1, k.skin);
  }
}

/** Head and shoulders seen from behind, for someone sitting at a desk. */
export function drawSeated(ctx: Ctx, X: number, headTop: number, k: Look, mode: SeatMode, tick: number) {
  const L = X - 5;
  const bob = mode === "work" ? (tick >> 2) & 1 : 0;
  const T = headTop + bob + (mode === "done" ? 1 : mode === "nap" ? 3 : mode === "alert" ? -1 : 0);
  const up = mode === "work" ? tick & 1 : -1;
  const elbowL = T + 9 - (up === 0 ? 1 : 0);
  const elbowR = T + 9 - (up === 1 ? 1 : 0);
  const sil: Box[] = [
    [L + 1, T, 8, 8],
    [L, T + 8, 10, 4],
    [L - 1, elbowL, 1, 2],
    [L + 10, elbowR, 1, 2],
  ];
  const f: Rect[] = [
    [L, T + 8, 10, 4, k.shirt],
    [L, T + 8, 1, 4, k.shirtDark],
    [L + 9, T + 8, 1, 4, k.shirtDark],
    [L - 1, elbowL, 1, 2, k.shirtDark],
    [L + 10, elbowR, 1, 2, k.shirtDark],
    [L + 1, T, 8, 8, k.hair],
    [L + 1, T + 7, 8, 1, k.hairDark],
    [L + 3, T + 8, 4, 1, k.skinDark],
  ];
  const [es, ef] = styleFrontBack(L, T, k, true);
  paint(ctx, [...sil, ...es], [...f, ...ef]);
  if (mode === "work") {
    const keys = headTop - 2;
    px(ctx, X - 6, keys - (up === 0 ? 1 : 0), 2, 1, k.skin);
    px(ctx, X + 4, keys - (up === 1 ? 1 : 0), 2, 1, k.skin);
  }
}

export function drawChair(ctx: Ctx, X: number, deskTop: number, color: string) {
  const y = deskTop + 32;
  paint(
    ctx,
    [[X - 6, y, 12, 9], [X - 7, y + 8, 14, 2]],
    [
      [X - 6, y, 12, 9, "#24212f"],
      [X - 5, y, 10, 1, "#36324a"],
      [X - 4, y + 1, 1, 7, color],
      [X + 3, y + 1, 1, 7, color],
      [X - 7, y + 8, 14, 2, "#1b1924"],
    ],
  );
  px(ctx, X - 1, y + 11, 2, 2, "#15131c");
  px(ctx, X - 5, y + 13, 3, 1, "#15131c");
  px(ctx, X + 2, y + 13, 3, 1, "#15131c");
}
