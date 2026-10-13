import { Ctx, LINE, glow, px } from "./pixel";

type Draw = (ctx: Ctx, L: number, B: number, t: number) => void;

const GOLD = "#e8b830";
const GOLD_HI = "#ffe08a";
const DISCO = ["#ff4fa3", "#5ce1ff", "#ffd25a", "#b07ae0"];

function goldcat(ctx: Ctx, L: number, B: number, t: number) {
  const up = Math.floor(t * 3) % 2;
  px(ctx, L - 1, B - 9, 9, 9, LINE);
  px(ctx, L, B - 8, 7, 8, GOLD);
  px(ctx, L, B - 8, 7, 1, GOLD_HI);
  px(ctx, L, B - 10, 2, 2, LINE);
  px(ctx, L + 5, B - 10, 2, 2, LINE);
  px(ctx, L + 1, B - 9, 1, 1, GOLD_HI);
  px(ctx, L + 5, B - 9, 1, 1, GOLD_HI);
  px(ctx, L + 2, B - 6, 1, 1, LINE);
  px(ctx, L + 4, B - 6, 1, 1, LINE);
  px(ctx, L + 2, B - 3, 3, 2, "#fff1b0");
  px(ctx, L + 6, B - (up ? 10 : 8), 2, 3, LINE);
  px(ctx, L + 6, B - (up ? 9 : 7), 1, 2, GOLD);
  const k = Math.floor(t * 2) % 4;
  if (k < 2) px(ctx, k ? L + 8 : L - 2, k ? B - 4 : B - 11, 1, 1, "#fffbe0");
}

function disco(ctx: Ctx, L: number, B: number, t: number) {
  const k = Math.floor(t * 4);
  px(ctx, L + 5, B - 13, 1, 2, "#8a8f9c");
  px(ctx, L + 3, B - 11, 5, 1, LINE);
  px(ctx, L + 2, B - 10, 7, 1, LINE);
  px(ctx, L + 1, B - 9, 9, 6, LINE);
  px(ctx, L + 2, B - 3, 7, 1, LINE);
  px(ctx, L + 3, B - 2, 5, 1, LINE);
  px(ctx, L + 3, B - 10, 5, 1, "#c9ced9");
  px(ctx, L + 3, B - 3, 5, 1, "#8a8f9c");
  for (let y = B - 9; y < B - 3; y++) {
    for (let x = L + 2; x < L + 9; x++) px(ctx, x, y, 1, 1, (x + y + k) % 2 ? "#9aa0ad" : "#e6e9f2");
  }
  px(ctx, L + 2 + (k % 7), B - 9 + (k % 6), 1, 1, DISCO[k % 4]);
}

function piano(ctx: Ctx, L: number, B: number, t: number) {
  px(ctx, L - 1, B - 22, 26, 22, LINE);
  px(ctx, L, B - 21, 24, 20, "#2a1d24");
  px(ctx, L, B - 21, 24, 1, "#4a3540");
  px(ctx, L + 2, B - 19, 20, 6, "#3a2830");
  px(ctx, L + 8, B - 18, 8, 4, "#ece4d6");
  px(ctx, L + 9, B - 17, 6, 1, "#8a8090");
  px(ctx, L + 9, B - 15, 6, 1, "#8a8090");
  px(ctx, L - 1, B - 13, 26, 1, LINE);
  px(ctx, L, B - 12, 24, 3, "#f4efe6");
  const down = Math.floor(t * 4) % 24;
  px(ctx, L + down, B - 10, 1, 1, "#c9c2b4");
  for (const k of [2, 4, 7, 9, 11, 14, 16, 19, 21]) px(ctx, L + k, B - 12, 1, 2, "#14101a");
  px(ctx, L - 1, B - 9, 26, 1, LINE);
  px(ctx, L + 3, B - 8, 18, 5, "#33232b");
  px(ctx, L + 10, B - 2, 1, 1, "#c9962a");
  px(ctx, L + 13, B - 2, 1, 1, "#c9962a");
  px(ctx, L + 1, B - 2, 2, 2, "#1a1218");
  px(ctx, L + 21, B - 2, 2, 2, "#1a1218");
}

function fireplace(ctx: Ctx, L: number, B: number, t: number) {
  px(ctx, L - 1, B - 22, 26, 22, LINE);
  px(ctx, L, B - 21, 24, 21, "#7a3426");
  for (let y = B - 20; y < B - 1; y += 3) {
    for (let x = L + ((B - y) % 2 ? 0 : 2); x < L + 23; x += 4) px(ctx, x, y, 3, 2, "#9a4636");
  }
  px(ctx, L - 2, B - 24, 28, 3, LINE);
  px(ctx, L - 1, B - 23, 26, 1, "#7a5a44");
  px(ctx, L - 1, B - 22, 26, 1, "#5e4232");
  px(ctx, L + 6, B - 16, 12, 1, LINE);
  px(ctx, L + 5, B - 15, 14, 14, LINE);
  px(ctx, L + 6, B - 14, 12, 13, "#1a0f0c");
  for (let i = 0; i < 4; i++) {
    const h = 4 + ((Math.floor(t * 8) + i * 3) % 4);
    const x = L + 8 + i * 2;
    px(ctx, x, B - 5 - h, 2, h, "#ff7a2a");
    px(ctx, x, B - 5 - (h >> 1), 2, h >> 1, "#ffd25a");
  }
  px(ctx, L + 7, B - 4, 10, 2, "#5e3a20");
  px(ctx, L + 8, B - 5, 8, 1, "#7a4a2a");
  px(ctx, L + 3, B - 2, 18, 2, "#4a3326");
}

export const RARE_DRAW = { goldcat, disco, piano, fireplace } satisfies Record<string, Draw>;

/** The light a rare piece gives off; false for any other piece. */
export function rareLight(ctx: Ctx, id: string, cx: number, bottom: number, t: number): boolean {
  if (id === "fireplace") glow(ctx, cx, bottom - 8, 26, "#ff9a4a", 0.16 + (Math.floor(t * 8) % 3) * 0.02);
  else if (id === "goldcat") glow(ctx, cx, bottom - 5, 7, GOLD_HI, 0.12);
  else if (id === "disco") {
    for (let i = 0; i < 4; i++) {
      const a = t * 1.5 + (i * Math.PI) / 2;
      glow(ctx, cx + Math.cos(a) * 16, bottom + 4 + Math.sin(a) * 6, 5, DISCO[i], 0.14);
    }
  } else return false;
  return true;
}
