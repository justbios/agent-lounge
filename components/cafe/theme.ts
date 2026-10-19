import type { Ui } from "@/lib/i18n";

export type ThemeId = "cafe" | "space" | "forest" | "winter";

/** The real time of day outside the windows. */
export type Phase = "dawn" | "day" | "dusk" | "night";

export interface Theme {
  id: ThemeId;
  /** Ukrainian; {@link themeText} gives the name and hint in the viewer's language */
  name: string;
  nameEn: string;
  hint: string;
  hintEn: string;
  wall: string;
  wallLine: string;
  pattern: "boards" | "panels" | "logs";
  rail: string;
  wainscot: string;
  wainscotLines: [string, string];
  baseboard: string;
  planks: string[];
  plankLine: string;
  plankGap: string;
  frame: string;
  sill: string;
  sillShadow: string;
  sky: string[];
  stars: string;
  skyline: "city" | "planet" | "pines";
  snowCaps: boolean;
  weather: "rain" | "drift" | "fireflies" | "snow";
  weatherColor: string;
  board: [string, string, string];
  lamp: [string, string, string];
  lampGlow: string;
  windowGlow: string;
  dim: string;
  warm: string;
  /** set by {@link themeAt} in daylight.ts; a theme as written is night */
  light?: Phase;
}

export const THEMES: Record<ThemeId, Theme> = {
  cafe: {
    id: "cafe",
    name: "Нічне кафе",
    nameEn: "Night café",
    hint: "дощ за вікном, неон і місто",
    hintEn: "rain outside, neon and the city",
    wall: "#2b2140",
    wallLine: "#30254a",
    pattern: "boards",
    rail: "#4b3a52",
    wainscot: "#3a2a36",
    wainscotLines: ["#2e212b", "#45333f"],
    baseboard: "#1c1520",
    planks: ["#3b2c2a", "#382927", "#3f2f2c", "#352725"],
    plankLine: "#2e211f",
    plankGap: "#2a1e1c",
    frame: "#5a4766",
    sill: "#7a6386",
    sillShadow: "#20182a",
    sky: ["#0b1033", "#0f1543", "#141a52", "#1a2060", "#20266b"],
    stars: "#c9d3ff",
    skyline: "city",
    snowCaps: false,
    weather: "rain",
    weatherColor: "#7d95d6",
    board: ["#6b4a35", "#1e2a24", "#aebdb3"],
    lamp: ["#f0c27a", "#c8914e", "#ffe2a8"],
    lampGlow: "#ffb15e",
    windowGlow: "#4f6bff",
    dim: "rgba(9,6,22,0.30)",
    warm: "#ffcf8a",
  },
  space: {
    id: "space",
    name: "Космічна станція",
    nameEn: "Space station",
    hint: "металеві панелі, планета в ілюмінаторах",
    hintEn: "metal panels, a planet in the portholes",
    wall: "#1a2130",
    wallLine: "#26304a",
    pattern: "panels",
    rail: "#3d4a63",
    wainscot: "#252f42",
    wainscotLines: ["#1b2333", "#33405a"],
    baseboard: "#0e131d",
    planks: ["#262c38", "#232935", "#29303d", "#21262f"],
    plankLine: "#1a1f28",
    plankGap: "#15191f",
    frame: "#4a5672",
    sill: "#6b7a99",
    sillShadow: "#151a24",
    sky: ["#03040c", "#05061a", "#070926", "#090c30", "#0b0f38"],
    stars: "#e6f0ff",
    skyline: "planet",
    snowCaps: false,
    weather: "drift",
    weatherColor: "#cfe3ff",
    board: ["#3d4a63", "#0b1a16", "#5cffb0"],
    lamp: ["#9fe8ff", "#5aa9c4", "#e6fbff"],
    lampGlow: "#5ce1ff",
    windowGlow: "#7a5cff",
    dim: "rgba(4,8,20,0.32)",
    warm: "#9fd4ff",
  },
  forest: {
    id: "forest",
    name: "Лісовий табір",
    nameEn: "Forest camp",
    hint: "зрубна хатинка, ялини й світлячки",
    hintEn: "a log cabin, fir trees and fireflies",
    wall: "#4a2f1f",
    wallLine: "#3a2416",
    pattern: "logs",
    rail: "#6b4a2f",
    wainscot: "#3d2618",
    wainscotLines: ["#2e1c12", "#5a3a24"],
    baseboard: "#24160e",
    planks: ["#5a4030", "#553c2d", "#5e4433", "#513a2b"],
    plankLine: "#45301f",
    plankGap: "#3a2819",
    frame: "#6b4a2f",
    sill: "#8a6448",
    sillShadow: "#2a1a10",
    sky: ["#0d1a1c", "#10221f", "#142a24", "#183128", "#1c382b"],
    stars: "#e8f0c9",
    skyline: "pines",
    snowCaps: false,
    weather: "fireflies",
    weatherColor: "#d9ff7a",
    board: ["#5a3a24", "#1e2a24", "#cfe0c4"],
    lamp: ["#ffcf6e", "#c48a3a", "#fff0b8"],
    lampGlow: "#ffb347",
    windowGlow: "#6fe08a",
    dim: "rgba(14,8,4,0.28)",
    warm: "#ffc27a",
  },
  winter: {
    id: "winter",
    name: "Зимовий вечір",
    nameEn: "Winter evening",
    hint: "сніг на дахах і за вікном",
    hintEn: "snow on the roofs and outside",
    wall: "#2b2a44",
    wallLine: "#33314f",
    pattern: "boards",
    rail: "#4f4c6b",
    wainscot: "#363349",
    wainscotLines: ["#2a283b", "#45425e"],
    baseboard: "#1b1a28",
    planks: ["#3b2c2a", "#382927", "#3f2f2c", "#352725"],
    plankLine: "#2e211f",
    plankGap: "#2a1e1c",
    frame: "#5d5a7a",
    sill: "#e6ecff",
    sillShadow: "#2a2840",
    sky: ["#141a33", "#1a2245", "#202a55", "#283366", "#303c75"],
    stars: "#dfe6ff",
    skyline: "city",
    snowCaps: true,
    weather: "snow",
    weatherColor: "#eef3ff",
    board: ["#6b4a35", "#1e2a24", "#aebdb3"],
    lamp: ["#ffd9a0", "#c99a62", "#fff2d6"],
    lampGlow: "#ffbf7a",
    windowGlow: "#9fb8ff",
    dim: "rgba(10,10,28,0.28)",
    warm: "#ffd9a8",
  },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

export function themeOf(id: string | null | undefined): Theme {
  return THEMES[id as ThemeId] ?? THEMES.cafe;
}

/** A theme's name and hint in one interface language. */
export function themeText(th: Theme, ui: Ui = "uk"): { name: string; hint: string } {
  return ui === "en" ? { name: th.nameEn, hint: th.hintEn } : { name: th.name, hint: th.hint };
}
