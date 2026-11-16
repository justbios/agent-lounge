import { Theme } from "./theme";

/**
 * The colours of the hall for one theme: a loft with a concrete back wall, a slatted wood wall behind the coffee bar,
 * a light plank floor, a dark metal glass wall onto the city and an LED strip along the ceiling.
 */
export interface HallPal {
  /** the concrete: its face, the seams between the cast panels, the tie holes, the lit edge */
  wall: string;
  seam: string;
  hole: string;
  wallHi: string;
  /** the slatted wall behind the counter: two woods and the gap between slats */
  slat: [string, string, string];
  ceil: string;
  ceil2: string;
  /** the LED strip along the ceiling and under the shelves */
  led: string;
  /** the second accent, for the shelves' strip and the sign's glow */
  led2: string;
  skirt: string;
  skirtHi: string;
  floor: string[];
  side: [string, string, string, string, string];
  cap: string;
  capHi: string;
  /** the glass wall's metal */
  frame: string;
  frameHi: string;
  /** the wooden ledge along the bottom of the glass, where shop pieces stand */
  sill: string;
  sillHi: string;
  /** the sofa: face, light, shade */
  sofa: [string, string, string];
}

const CAFE: HallPal = {
  wall: "#3b3443",
  seam: "#2f2937",
  hole: "#272130",
  wallHi: "#463e50",
  slat: ["#b0825a", "#9c7049", "#4a3022"],
  ceil: "#16121e",
  ceil2: "#211b2b",
  led: "#62f0ff",
  led2: "#ff6aa8",
  skirt: "#1d1826",
  skirtHi: "#3a3346",
  floor: ["#a27b58", "#9b7553", "#a8805c", "#967150", "#9f7855"],
  side: ["#1f1a28", "#3a3343", "#2c2635", "#221d2b", "#4a4254"],
  cap: "#3a3343",
  capHi: "#554c62",
  frame: "#25222f",
  frameHi: "#4a4660",
  sill: "#b88a60",
  sillHi: "#dcae80",
  sofa: ["#2f6c70", "#4a9396", "#214d52"],
};

const PALS: Record<Theme["id"], HallPal> = {
  cafe: CAFE,
  halloween: {
    ...CAFE,
    wall: "#33293a",
    seam: "#281f2e",
    hole: "#211a27",
    wallHi: "#3e3246",
    slat: ["#8e6444", "#7c553a", "#3a2418"],
    led: "#ff9a3c",
    led2: "#b56cff",
    floor: ["#86644a", "#805f46", "#8b684d", "#7a5a42", "#836148"],
    side: ["#1c1522", "#352a3e", "#281f2f", "#1f1826", "#463852"],
    cap: "#352a3e",
    capHi: "#4e3e5a",
    sofa: ["#5a3a78", "#7a56a0", "#3e2656"],
  },
  space: {
    ...CAFE,
    wall: "#2b3346",
    seam: "#222838",
    hole: "#1b2130",
    wallHi: "#36405a",
    slat: ["#56627e", "#4a5570", "#1e2433"],
    ceil: "#10141e",
    ceil2: "#1a2030",
    led: "#5ce1ff",
    led2: "#a98bff",
    skirt: "#141a26",
    skirtHi: "#36405a",
    floor: ["#4c5568", "#475063", "#515b6e", "#444c5e", "#4a5366"],
    side: ["#161c28", "#34405a", "#262f44", "#1b2232", "#4a5a7a"],
    cap: "#34405a",
    capHi: "#4f6080",
    frame: "#1e2433",
    frameHi: "#55648a",
    sill: "#8fa0bf",
    sillHi: "#c3cde2",
    sofa: ["#3a4a78", "#56689e", "#28345a"],
  },
  forest: {
    ...CAFE,
    wall: "#3d3530",
    seam: "#322b27",
    hole: "#29231f",
    wallHi: "#4a413a",
    slat: ["#c09062", "#a87c52", "#4e3424"],
    led: "#ffd27a",
    led2: "#8ee59b",
    floor: ["#a8845c", "#a17e58", "#ae8a61", "#9b7954", "#a5825a"],
    side: ["#221c18", "#3d3530", "#2e2824", "#25201c", "#4e463e"],
    cap: "#3d3530",
    capHi: "#5a5048",
    sofa: ["#4a7a4e", "#65996a", "#355a38"],
  },
  winter: {
    ...CAFE,
    wall: "#383a4c",
    seam: "#2d2f40",
    hole: "#262838",
    wallHi: "#444760",
    slat: ["#c8b89c", "#b5a487", "#4a4238"],
    led: "#9fd4ff",
    led2: "#e6ecff",
    floor: ["#b29c84", "#ab967e", "#b8a28a", "#a59079", "#ae9880"],
    side: ["#1b1a28", "#383a4c", "#2c2e3e", "#222333", "#4a4c62"],
    cap: "#383a4c",
    capHi: "#56596f",
    sill: "#dfe6ff",
    sillHi: "#ffffff",
    sofa: ["#3c6e9e", "#5a8cc0", "#2a5078"],
  },
};

export const hallPal = (th: Theme): HallPal => PALS[th.id] ?? CAFE;
