import { Look } from "./people";
import { Ctx, LINE, px, rand } from "./pixel";

export type Pastime = "read" | "cards" | "nap" | null;

const PASTIMES: Pastime[] = [null, "read", "cards", "nap"];
const SPAN_S = 40;
/** a fresh finish keeps its tick on the screen a while before the agent turns to something else */
export const REST_MS = 15_000;

/** What an agent with nothing to do is up to: a new pick every 40 s, different at each desk; a closed café dozes. */
export function pastimeOf(i: number, t: number, closed: boolean): Pastime {
  if (closed) return "nap";
  return PASTIMES[Math.floor(rand(i * 7.3 + Math.floor(t / SPAN_S) * 1.7) * PASTIMES.length)];
}

function zed(ctx: Ctx, x: number, y: number) {
  px(ctx, x, y, 3, 1, "#cfd8ff");
  px(ctx, x + 1, y + 1, 1, 1, "#cfd8ff");
  px(ctx, x, y + 2, 3, 1, "#cfd8ff");
}

/** The book or the hand of cards held by someone seated at desk `X`, head top at `T`. */
export function drawPastime(ctx: Ctx, p: Pastime, X: number, T: number, k: Look, t: number, i: number) {
  if (p === "read") {
    const turn = Math.floor(t / 3 + i) % 5 === 0 ? 1 : 0;
    px(ctx, X + 5, T + 1, 8, 6, LINE);
    px(ctx, X + 6, T + 2, 6, 4, "#b4475f");
    px(ctx, X + 6, T + 2, 2, 3, "#f1edf8");
    px(ctx, X + 9, T + 2, 3 - turn, 3, "#e4dff0");
    px(ctx, X + 8, T + 2, 1, 4, "#7a2d3a");
    px(ctx, X + 5, T + 6, 1, 1, k.skin);
    return;
  }
  if (p === "cards") {
    const lift = Math.floor(t * 1.5 + i) % 4 === 0 ? 1 : 0;
    [-12, -10, -8].forEach((dx, n) => {
      const y = T + 2 + (n === 1 ? -1 - lift : 0);
      px(ctx, X + dx, y, 4, 5, LINE);
      px(ctx, X + dx + 1, y + 1, 2, 3, "#f6f2ea");
      px(ctx, X + dx + 1, y + 1, 1, 1, n === 1 ? "#d9534f" : "#1b1626");
    });
    px(ctx, X - 7, T + 6, 1, 1, k.skin);
  }
}

/** The «z»s drifting up from someone dozing at desk `X`; drawn over the lighting so they read in a dark café. */
export function drawZzz(ctx: Ctx, X: number, T: number, t: number, i: number) {
  for (let n = 0; n < 2; n++) {
    const ph = (t * 0.35 + n * 0.5 + i * 0.13) % 1;
    ctx.globalAlpha = Math.max(0, 1 - ph) * 0.9;
    zed(ctx, X + 5 + Math.round(ph * 4) + n * 2, T - 2 - Math.round(ph * 9));
  }
  ctx.globalAlpha = 1;
}
