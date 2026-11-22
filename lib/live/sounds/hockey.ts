import { SfxNoise, SfxSpec, SfxTone, arp, sfxPlay } from "../sfx";

/*
 * The rink's own sounds, made on the spot like every other: a mallet's ring and thock, a clack off the boards, the
 * post, the horn and the crowd for a goal, the stings for a warming puck and a match point. The ones that come all
 * the time are short and soft and never twice the same; only a goal is allowed to be big.
 */

/**
 * A held note out of short ones laid over each other: the shared player lets every tone die away at once, so a horn
 * that has to last is many of them, each coming in before the last has gone.
 */
function held(at: number, len: number, f: number, wave: OscillatorType, vol: number): SfxTone[] {
  const step = 0.06;
  return Array.from({ length: Math.max(1, Math.round(len / step)) }, (_, k) => ({ at: at + k * step, dur: 0.42, f, wave, vol }));
}

/** A crowd out of noise: many short breaths a little apart and never evenly, rising quickly and falling away slowly. */
function swell(at: number, len: number, peak: number, cut: number): SfxNoise[] {
  const n = Math.max(2, Math.round(len / 0.05));
  return Array.from({ length: n }, (_, k) => {
    const f = k / (n - 1);
    const shape = Math.sin(Math.PI * Math.pow(f, 0.6));
    return {
      at: at + k * 0.05 + ((k * 37) % 11) * 0.003,
      dur: 0.32,
      cut: cut * (0.75 + 0.5 * (((k * 53) % 7) / 6)),
      vol: peak * (0.2 + 0.8 * shape),
    };
  });
}

/** a mallet meets the puck: a ring over a thock */
const TAP: SfxSpec = {
  tones: [
    { at: 0, dur: 0.12, f: 1480, to: 1300, wave: "sine", vol: 0.07 },
    { at: 0, dur: 0.06, f: 190, to: 92, wave: "triangle", vol: 0.3 },
  ],
  noise: [{ at: 0, dur: 0.025, cut: 3800, vol: 0.13 }],
};

/** the puck off the boards */
const CLACK: SfxSpec = {
  tones: [
    { at: 0, dur: 0.035, f: 640, to: 430, wave: "square", vol: 0.045 },
    { at: 0, dur: 0.05, f: 250, to: 170, wave: "triangle", vol: 0.2 },
  ],
  noise: [{ at: 0, dur: 0.02, cut: 5200, vol: 0.1 }],
};

/** the post: so close */
const POST: SfxSpec = {
  tones: [
    { at: 0, dur: 0.26, f: 2090, to: 2050, wave: "sine", vol: 0.09 },
    { at: 0, dur: 0.14, f: 3140, wave: "sine", vol: 0.03 },
  ],
  noise: [{ at: 0, dur: 0.015, cut: 7000, vol: 0.06 }],
};

/** a new puck lands on the ice */
const DROP: SfxSpec = {
  tones: [{ at: 0, dur: 0.06, f: 300, to: 140, wave: "triangle", vol: 0.3 }],
  noise: [
    { at: 0, dur: 0.03, cut: 2600, vol: 0.18 },
    { at: 0.02, dur: 0.09, cut: 900, vol: 0.07 },
  ],
};

/** the rink's lights come on */
const LIGHTS: SfxSpec = {
  tones: [
    { at: 0, dur: 0.12, f: 110, to: 60, wave: "triangle", vol: 0.3 },
    { at: 0.16, dur: 0.3, f: 220, to: 330, wave: "sine", vol: 0.06 },
  ],
  noise: [{ at: 0, dur: 0.05, cut: 1400, vol: 0.2 }],
};

/** a beat before the first puck, and the go */
const TICK: SfxSpec = { tones: [{ at: 0, dur: 0.08, f: 523, wave: "square", vol: 0.07 }] };
const GO: SfxSpec = { tones: arp([784, 1047, 1568], 0.05, 0.14, "square", 0.07) };

/** the puck in the net, under everything else a goal sounds like */
const NET: SfxNoise[] = [{ at: 0, dur: 0.1, cut: 1700, vol: 0.2 }];
const THUMP: SfxTone = { at: 0, dur: 0.1, f: 150, to: 62, wave: "triangle", vol: 0.34 };

/** you scored: the horn, and the crowd rising under it */
const GOAL: SfxSpec = {
  tones: [
    THUMP,
    ...held(0.02, 0.62, 110, "sawtooth", 0.045),
    ...held(0.02, 0.62, 165, "sawtooth", 0.035),
    ...held(0.02, 0.62, 220.6, "square", 0.016),
  ],
  noise: [...NET, ...swell(0.05, 1.05, 0.085, 1900)],
};

/** they scored: a flat buzzer, and the crowd letting its breath out */
const CONCEDED: SfxSpec = {
  tones: [THUMP, ...held(0.02, 0.34, 92.5, "sawtooth", 0.04), ...held(0.02, 0.34, 110, "square", 0.02)],
  noise: [...NET, ...swell(0.1, 0.6, 0.05, 700)],
};

/** the goal that wins it: the horn twice, the crowd on its feet, a few bright notes over the top */
const WON: SfxSpec = {
  tones: [
    THUMP,
    ...held(0.02, 0.44, 110, "sawtooth", 0.045),
    ...held(0.02, 0.44, 165, "sawtooth", 0.035),
    ...held(0.62, 0.8, 110, "sawtooth", 0.045),
    ...held(0.62, 0.8, 165, "sawtooth", 0.035),
    ...held(0.62, 0.8, 220.6, "square", 0.018),
    ...arp([784, 988, 1175, 1568], 0.09, 0.16, "triangle", 0.1).map((t) => ({ ...t, at: t.at + 0.66 })),
  ],
  noise: [...NET, ...swell(0.05, 1.45, 0.1, 2200)],
};

/** the goal that loses it: the buzzer held, and three notes down */
const LOST: SfxSpec = {
  tones: [
    THUMP,
    ...held(0.02, 0.6, 92.5, "sawtooth", 0.04),
    ...held(0.02, 0.6, 110, "square", 0.02),
    ...arp([392, 330, 262], 0.2, 0.24, "triangle", 0.16).map((t) => ({ ...t, at: t.at + 0.7 })),
  ],
  noise: [...NET, ...swell(0.1, 0.9, 0.05, 650)],
};

/** the puck warms up a step: a rising whoosh, higher each time */
const HEAT: SfxSpec = {
  tones: [
    { at: 0, dur: 0.22, f: 330, to: 660, wave: "triangle", vol: 0.16 },
    { at: 0.1, dur: 0.2, f: 660, to: 990, wave: "sine", vol: 0.07 },
  ],
  noise: [
    { at: 0, dur: 0.12, cut: 2400, vol: 0.08 },
    { at: 0.08, dur: 0.16, cut: 5200, vol: 0.06 },
  ],
};

/** match point is called: two drum beats under a held, uneasy pair of notes */
const POINT: SfxSpec = {
  tones: [
    { at: 0, dur: 0.16, f: 98, to: 58, wave: "triangle", vol: 0.34 },
    { at: 0.2, dur: 0.2, f: 98, to: 58, wave: "triangle", vol: 0.34 },
    ...held(0, 0.36, 494, "square", 0.02),
    ...held(0, 0.36, 587, "square", 0.016),
  ],
};

/** a heart before a face-off that may end the match */
const HEART: SfxSpec = {
  tones: [
    { at: 0, dur: 0.1, f: 72, to: 46, wave: "triangle", vol: 0.3 },
    { at: 0.17, dur: 0.12, f: 64, to: 40, wave: "triangle", vol: 0.24 },
  ],
};

/** the ice wiped clean between goals */
const SWEEP: SfxSpec = {
  noise: Array.from({ length: 9 }, (_, k) => ({ at: k * 0.055, dur: 0.16, cut: 2600 + k * 420, vol: 0.03 + (k < 5 ? k : 8 - k) * 0.004 })),
};

const vary = () => 0.97 + Math.random() * 0.06;

/** A mallet strikes the puck; `force` from 0, a touch, to 1, as hard as it gets. */
export const sndTap = (force: number) => sfxPlay("hk-tap", TAP, { pitch: (0.86 + 0.3 * force) * vary(), vol: 0.35 + 0.65 * force });

/** The puck off the boards; `speed` from 0 to 1. A warm puck and a match point both ring a little higher. */
export const sndClack = (speed: number, lift = 0) =>
  sfxPlay("hk-clack", CLACK, { pitch: (0.8 + 0.6 * speed + lift) * vary(), vol: 0.3 + 0.7 * speed });

export const sndPost = () => sfxPlay("hk-post", POST, { pitch: vary() });
export const sndDrop = () => sfxPlay("hk-drop", DROP);
export const sndLights = () => sfxPlay("hk-lights", LIGHTS);
/** The beats before the first puck: `step` 0, 1, 2, each a little higher. */
export const sndTick = (step: number) => sfxPlay("hk-tick", TICK, { pitch: 1 + step * 0.125 });
export const sndGo = () => sfxPlay("hk-go", GO);
export const sndGoal = (mine: boolean) => sfxPlay("hk-goal", mine ? GOAL : CONCEDED);
export const sndFinal = (won: boolean) => sfxPlay("hk-final", won ? WON : LOST);
/** The puck reached heat `level`, 1 to 3. */
export const sndHeat = (level: number) => sfxPlay("hk-heat", HEAT, { pitch: 0.85 + level * 0.2, vol: 0.75 + level * 0.08 });
export const sndPoint = () => sfxPlay("hk-point", POINT);
export const sndHeart = () => sfxPlay("hk-heart", HEART);
export const sndSweep = () => sfxPlay("hk-sweep", SWEEP);
