import { CafeLayout, rng } from "@/lib/cafe/layout";
import type { Ui } from "@/lib/i18n";
import { AgentDef, PotLevel } from "@/lib/types";
import { Ctx, LINE, px, shade } from "./pixel";

function drawDesk(ctx: Ctx, X: number, T: number, color: string) {
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(X - 21, T + 25, 42, 4);
  px(ctx, X - 19, T + 21, 2, 6, "#2d211b");
  px(ctx, X + 17, T + 21, 2, 6, "#2d211b");
  px(ctx, X - 21, T + 12, 42, 13, LINE);
  px(ctx, X - 20, T + 13, 40, 8, "#7a5a44");
  px(ctx, X - 20, T + 13, 40, 1, "#94704f");
  px(ctx, X - 20, T + 21, 40, 3, "#573d2e");

  px(ctx, X - 11, T - 1, 22, 15, LINE);
  px(ctx, X - 10, T, 20, 13, "#1c1a26");
  px(ctx, X - 10, T, 20, 1, "#2e2b3c");
  px(ctx, X - 8, T + 2, 16, 9, "#05060c");
  px(ctx, X - 1, T + 13, 2, 2, "#1c1a26");
  px(ctx, X - 4, T + 15, 8, 1, "#2a2736");

  px(ctx, X + 12, T + 2, 7, 13, LINE);
  px(ctx, X + 13, T + 3, 5, 11, "#191723");
  px(ctx, X + 13, T + 3, 5, 1, "#2a2736");
  for (let k = 0; k < 3; k++) px(ctx, X + 14, T + 8 + k * 2, 3, 1, "#24212f");

  px(ctx, X - 7, T + 17, 14, 3, "#23212e");
  for (let k = 0; k < 6; k++) px(ctx, X - 6 + k * 2, T + 18, 1, 1, "#4f4a68");
  px(ctx, X - 7, T + 20, 14, 1, shade(color, 0.7));
  px(ctx, X + 9, T + 16, 7, 4, "#191723");
  px(ctx, X + 11, T + 17, 2, 2, "#d7d3e4");

  px(ctx, X - 18, T + 14, 6, 6, LINE);
  px(ctx, X - 17, T + 15, 4, 4, "#ece4d6");
  px(ctx, X - 16, T + 15, 2, 1, "#6b4325");
  px(ctx, X - 13, T + 16, 1, 2, "#ece4d6");
}

const POUR_MS = 1500;

/** The pot's level at `clock`, poured over from the level before; null until the agent first reports its context. */
export function potAt(pot: PotLevel[] | undefined, clock: number): number | null {
  let i = -1;
  while (pot && i + 1 < pot.length && pot[i + 1].ts <= clock) i++;
  if (!pot || i < 0) return null;
  const from = i > 0 ? pot[i - 1].fill : 0;
  const k = Math.min(1, (clock - pot[i].ts) / POUR_MS);
  return from + (pot[i].fill - from) * k;
}

/** A glass coffee pot in place of the mug, as full as the agent's context; its top blinks when compaction is near. */
export function drawPot(ctx: Ctx, X: number, T: number, fill: number, t: number) {
  px(ctx, X - 16, T + 11, 2, 1, LINE);
  px(ctx, X - 18, T + 12, 6, 8, LINE);
  px(ctx, X - 12, T + 14, 1, 3, LINE);
  px(ctx, X - 17, T + 13, 4, 1, "#3a3550");
  px(ctx, X - 17, T + 14, 4, 5, "#7f9aa6");
  const n = fill <= 0.01 ? 0 : Math.max(1, Math.round(fill * 5));
  if (n) {
    px(ctx, X - 17, T + 19 - n, 4, n, "#5b3a24");
    const hot = fill >= 0.8 && Math.floor(t * 2) % 2 === 0;
    px(ctx, X - 17, T + 19 - n, 4, 1, hot ? "#ff8a5b" : "#a0703f");
  }
  if (n < 4) px(ctx, X - 16, T + 14, 1, 4 - n, "#c9dde4");
}

type Prop = "cactus" | "duck" | "cans" | "books" | "lamp" | "none";
const PROPS: Prop[] = ["cactus", "duck", "cans", "books", "lamp", "none"];
export const PROP_NAMES = ["кактус", "качка", "банки", "книжки", "лампа", "нічого"] as const;
export const PROP_NAMES_EN = ["cactus", "duck", "cans", "books", "lamp", "nothing"] as const;

/** What stands on desk prop `i`, in the viewer's language. */
export const propName = (i: number, ui: Ui = "uk"): string =>
  (ui === "en" ? PROP_NAMES_EN : PROP_NAMES)[i % PROP_NAMES.length];

function drawProp(ctx: Ctx, X: number, T: number, prop: Prop, r: () => number) {
  const L = X - 20;
  const base = T + 13;
  switch (prop) {
    case "cactus":
      px(ctx, L, base - 9, 6, 10, LINE);
      px(ctx, L + 1, base - 3, 4, 3, "#a65d3b");
      px(ctx, L + 2, base - 8, 2, 5, "#3e9a5d");
      px(ctx, L + 1, base - 6, 1, 2, "#3e9a5d");
      px(ctx, L + 4, base - 7, 1, 2, "#3e9a5d");
      px(ctx, L + 2, base - 9, 1, 1, "#ff7eb6");
      return;
    case "duck":
      px(ctx, L, base - 6, 7, 6, LINE);
      px(ctx, L + 1, base - 3, 5, 3, "#ffd23f");
      px(ctx, L + 3, base - 5, 3, 3, "#ffd23f");
      px(ctx, L + 6, base - 4, 1, 1, "#ff8c1a");
      px(ctx, L + 4, base - 5, 1, 1, LINE);
      return;
    case "cans":
      for (let k = 0; k < 2 + Math.floor(r() * 2); k++) {
        const c = ["#4cc9f0", "#06d6a0", "#ff5d73", "#ffd166"][Math.floor(r() * 4)];
        px(ctx, L + k * 3, base - 5, 3, 5, LINE);
        px(ctx, L + k * 3 + 1, base - 4, 1, 4, c);
      }
      return;
    case "books": {
      const cols = ["#b4475f", "#3f6fb0", "#4f9a62", "#c9a44a"];
      for (let k = 0; k < 3; k++) {
        px(ctx, L + (k % 2), base - 3 - k * 2, 8, 3, LINE);
        px(ctx, L + 1 + (k % 2), base - 2 - k * 2, 6, 1, cols[(k + Math.floor(r() * 4)) % 4]);
      }
      return;
    }
    case "lamp":
      px(ctx, L + 1, base - 11, 7, 12, LINE);
      px(ctx, L + 2, base - 10, 5, 3, "#ffcf6e");
      px(ctx, L + 4, base - 7, 1, 6, "#4a4458");
      px(ctx, L + 2, base - 1, 5, 1, "#4a4458");
      return;
    default:
      return;
  }
}

function drawSticky(ctx: Ctx, X: number, T: number, r: () => number) {
  if (r() < 0.45) return;
  const c = ["#ffe066", "#ff9ecf", "#9be7ff"][Math.floor(r() * 3)];
  px(ctx, X + 6 - Math.floor(r() * 3), T - 2, 3, 3, c);
}

/** The index into {@link PROP_NAMES} desk `i` gets before anyone picks otherwise. */
export const propIndex = (seed: number, i: number) => Math.floor(rng(seed * 613 + i * 97 + 5)() * PROPS.length);

export function drawDesks(ctx: Ctx, lay: CafeLayout, agents: AgentDef[], seed: number, props: (number | undefined)[] = []) {
  lay.desks.forEach((d, i) => {
    drawDesk(ctx, d.x, d.top, agents[i].color);
    const r = rng(seed * 613 + i * 97 + 5);
    const own = Math.floor(r() * PROPS.length);
    drawProp(ctx, d.x, d.top, PROPS[(props[i] ?? own) % PROPS.length], r);
    drawSticky(ctx, d.x, d.top, r);
  });
}
