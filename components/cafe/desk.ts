import { rng } from "@/lib/cafe/layout";
import type { Ui } from "@/lib/i18n";
import { PotLevel } from "@/lib/types";
import { Ctx, LINE, px } from "./pixel";

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

/** A glass coffee pot by the keyboard, as full as the agent's context, its left edge at `L` and its foot on `B`; its top blinks when compaction is near. */
export function drawPot(ctx: Ctx, L: number, B: number, fill: number, t: number) {
  px(ctx, L + 1, B - 9, 2, 1, LINE);
  px(ctx, L, B - 8, 5, 8, LINE);
  px(ctx, L + 5, B - 6, 1, 3, LINE);
  px(ctx, L + 1, B - 7, 3, 1, "#3a3550");
  px(ctx, L + 1, B - 6, 3, 5, "#7f9aa6");
  const n = fill <= 0.01 ? 0 : Math.max(1, Math.round(fill * 5));
  if (n) {
    px(ctx, L + 1, B - 1 - n, 3, n, "#5b3a24");
    const hot = fill >= 0.8 && Math.floor(t * 2) % 2 === 0;
    px(ctx, L + 1, B - 1 - n, 3, 1, hot ? "#ff8a5b" : "#a0703f");
  }
  if (n < 4) px(ctx, L + 1, B - 6, 1, 4 - n, "#c9dde4");
}

type Prop = "cactus" | "duck" | "cans" | "books" | "lamp" | "none";
const PROPS: Prop[] = ["cactus", "duck", "cans", "books", "lamp", "none"];
export const PROP_NAMES = ["кактус", "качка", "банки", "книжки", "лампа", "нічого"] as const;
export const PROP_NAMES_EN = ["cactus", "duck", "cans", "books", "lamp", "nothing"] as const;

/** What stands on desk prop `i`, in the viewer's language. */
export const propName = (i: number, ui: Ui = "uk"): string =>
  (ui === "en" ? PROP_NAMES_EN : PROP_NAMES)[i % PROP_NAMES.length];

/** The index into {@link PROP_NAMES} desk `i` gets before anyone picks otherwise. */
export const propIndex = (seed: number, i: number) => Math.floor(rng(seed * 613 + i * 97 + 5)() * PROPS.length);
