import { useSyncExternalStore } from "react";
import { Phase, Theme, keepsSky } from "./theme";

const SKIES: Record<Exclude<Phase, "night">, string[]> = {
  dawn: ["#2c2b5c", "#57407a", "#a65f7e", "#e8907a", "#ffc994"],
  day: ["#5fb2e8", "#76c0ec", "#8ccbef", "#a3d6f2", "#bde2f5"],
  dusk: ["#1c1d4c", "#3b2960", "#76396c", "#c15b68", "#ee8c58"],
};
const DIM: Record<Phase, number> = { dawn: 0.75, day: 0.35, dusk: 0.8, night: 1 };

/** Dawn 5:30–8, day until 18:30, dusk until 22, then night, by the clock of the person looking. */
export function phaseAt(d: Date): Phase {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 5.5 && h < 8) return "dawn";
  if (h >= 8 && h < 18.5) return "day";
  if (h >= 18.5 && h < 22) return "dusk";
  return "night";
}

const scaleAlpha = (rgba: string, k: number) =>
  rgba.replace(/rgba\(([^)]+),\s*([\d.]+)\)/, (_, rgb: string, a: string) =>
    `rgba(${rgb},${(Number(a) * k).toFixed(3)})`);

/** The theme as it looks at this hour: the sky in the windows and how dark the room is. Open space has no day. */
export function themeAt(th: Theme, phase: Phase): Theme {
  if (phase === "night") return th;
  const sky = keepsSky(th) ? th.sky : SKIES[phase];
  return { ...th, sky, light: phase, dim: scaleAlpha(th.dim, DIM[phase]) };
}

function subscribe(cb: () => void) {
  const id = setInterval(cb, 30_000);
  return () => clearInterval(id);
}

/** The time of day, checked twice a minute. */
export function usePhase(): Phase {
  return useSyncExternalStore(subscribe, () => phaseAt(new Date()), () => "night");
}
