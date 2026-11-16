import { Theme } from "./theme";

/** The colours of the hall's walls, wood, floor and curtains for one theme. */
export interface HallPal {
  wall: string;
  stripe: string;
  dot: string;
  dot2: string;
  ceil: string;
  ceil2: string;
  railHi: string;
  rail: string;
  railDark: string;
  wains: string;
  panel: string;
  panelDark: string;
  panelLight: string;
  panelIn: string;
  skirt: string;
  skirtHi: string;
  floor: string[];
  side: [string, string, string, string, string];
  cap: string;
  capHi: string;
  frame: string;
  frameHi: string;
  frameIn: string;
  /** the shaded right edge of the frame and its mullions */
  frameLo: string;
  mullion: string;
  mullionHi: string;
  sill: string;
  sillHi: string;
  curtain: [string, string, string];
  tie: string;
}

const CAFE: HallPal = {
  wall: "#3b2847",
  stripe: "#42304f",
  dot: "#5b4266",
  dot2: "#4d375a",
  ceil: "#1f1428",
  ceil2: "#2a1c34",
  railHi: "#c99062",
  rail: "#a26e46",
  railDark: "#4a2a20",
  wains: "#6a3e2c",
  panel: "#5c3426",
  panelDark: "#3e2219",
  panelLight: "#8a5638",
  panelIn: "#653a2a",
  skirt: "#3a2018",
  skirtHi: "#6e4230",
  floor: ["#7d4b33", "#774731", "#714330", "#82503a", "#7a4934"],
  side: ["#2a1c34", "#4e3a60", "#3a2a48", "#2c1e38", "#5e4874"],
  cap: "#4e3a60",
  capHi: "#6e5688",
  frame: "#7a4a30",
  frameHi: "#a06a44",
  frameIn: "#4e2c1e",
  frameLo: "#5a3220",
  mullion: "#6e4028",
  mullionHi: "#94603c",
  sill: "#c08a58",
  sillHi: "#e0aa70",
  curtain: ["#a83c4e", "#8a2e42", "#64203a"],
  tie: "#e0b060",
};

const PALS: Record<Theme["id"], HallPal> = {
  cafe: CAFE,
  halloween: {
    ...CAFE,
    wall: "#2e1a38",
    stripe: "#36203f",
    dot: "#4e2e5a",
    dot2: "#3f2649",
    wains: "#4e2e2a",
    panel: "#422520",
    panelIn: "#4a2a24",
    floor: ["#64402e", "#5e3c2c", "#58392a", "#6a4532", "#60402e"],
    side: ["#221430", "#40284e", "#30203e", "#24162e", "#523a62"],
    cap: "#40284e",
    capHi: "#5e4272",
    curtain: ["#6a3a7a", "#542c66", "#3a1e4a"],
    tie: "#e8761e",
  },
  space: {
    ...CAFE,
    wall: "#232c40",
    stripe: "#29334a",
    dot: "#3d4a63",
    dot2: "#323d55",
    ceil: "#121722",
    ceil2: "#1a2130",
    railHi: "#b8c6e0",
    rail: "#7d8cab",
    railDark: "#2a3346",
    wains: "#2f3a52",
    panel: "#263046",
    panelDark: "#1a2232",
    panelLight: "#4a5a7a",
    panelIn: "#2b354c",
    skirt: "#161c28",
    skirtHi: "#3d4a63",
    floor: ["#465063", "#424b5d", "#3e4657", "#4b5568", "#444d60"],
    side: ["#161c28", "#34405a", "#262f44", "#1b2232", "#4a5a7a"],
    cap: "#34405a",
    capHi: "#4f6080",
    frame: "#5a6886",
    frameHi: "#8fa0bf",
    frameIn: "#2a3346",
    frameLo: "#3a4560",
    mullion: "#4a5672",
    mullionHi: "#7d8cab",
    sill: "#8fa0bf",
    sillHi: "#c3cde2",
    curtain: ["#2e6a7a", "#245868", "#1a4250"],
    tie: "#5ce1ff",
  },
  forest: {
    ...CAFE,
    wall: "#4a3020",
    stripe: "#523624",
    dot: "#6b4a2f",
    dot2: "#5e4029",
    ceil: "#24160e",
    ceil2: "#2e1c12",
    wains: "#5a3a22",
    panel: "#4e321e",
    panelIn: "#553620",
    floor: ["#7a5a3a", "#745436", "#6e5034", "#806040", "#76583a"],
    side: ["#2e1c12", "#55381f", "#3e2818", "#321e14", "#6b4a2f"],
    cap: "#55381f",
    capHi: "#7a5634",
    curtain: ["#4a8a52", "#3a7444", "#2a5634"],
    tie: "#e0b060",
  },
  winter: {
    ...CAFE,
    wall: "#33324e",
    stripe: "#3a3956",
    dot: "#55537a",
    dot2: "#46446a",
    ceil: "#1b1a28",
    ceil2: "#262538",
    side: ["#1b1a28", "#45436a", "#32314e", "#24233a", "#5d5a7a"],
    cap: "#45436a",
    capHi: "#615f8a",
    sill: "#dfe6ff",
    sillHi: "#ffffff",
    curtain: ["#4a76b0", "#3a6298", "#2c4c7a"],
    tie: "#e6ecff",
  },
};

export const hallPal = (th: Theme): HallPal => PALS[th.id] ?? CAFE;
