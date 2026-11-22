import type { Kind } from "../chess";
import { SfxSpec, arp, sfxPlay } from "../sfx";

/*
 * The sounds of the chess and draughts boards: wood on wood. One clack serves every piece, bent lower for a heavy
 * one and a little differently each time, so the hundredth move does not sound like the first. Nothing here is
 * louder than the shared sounds it stands in for.
 */

/** how low a piece sounds as it lands: a pawn taps, a king thumps */
const WEIGHT: Record<Kind, number> = { p: 1.3, n: 1.12, b: 1.05, r: 0.92, q: 0.84, k: 0.76 };

/** no two moves quite alike */
const vary = () => 0.97 + Math.random() * 0.06;

const CLACK: SfxSpec = {
  tones: [
    { at: 0, dur: 0.05, f: 230, to: 150, wave: "triangle", vol: 0.32 },
    { at: 0, dur: 0.018, f: 900, to: 520, wave: "square", vol: 0.03 },
  ],
  noise: [{ at: 0, dur: 0.03, cut: 2200, vol: 0.22 }],
};

const LIFT: SfxSpec = { tones: [{ at: 0, dur: 0.035, f: 520, to: 700, wave: "triangle", vol: 0.1 }] };

const KNOCK: SfxSpec = {
  tones: [
    { at: 0, dur: 0.05, f: 320, to: 130, wave: "square", vol: 0.1 },
    { at: 0.02, dur: 0.1, f: 170, to: 62, wave: "triangle", vol: 0.3 },
  ],
  noise: [{ at: 0, dur: 0.07, cut: 3000, vol: 0.28 }],
};

const TRAY: SfxSpec = {
  tones: [{ at: 0, dur: 0.03, f: 420, to: 300, wave: "triangle", vol: 0.12 }],
  noise: [{ at: 0, dur: 0.015, cut: 1500, vol: 0.08 }],
};

const REFUSE: SfxSpec = {
  tones: [
    { at: 0, dur: 0.06, f: 150, to: 120, wave: "triangle", vol: 0.2 },
    { at: 0.08, dur: 0.06, f: 132, to: 105, wave: "triangle", vol: 0.16 },
  ],
};

const CHECK: SfxSpec = {
  tones: [...arp([784, 1175], 0.085, 0.1, "square", 0.085), { at: 0, dur: 0.22, f: 196, wave: "triangle", vol: 0.16 }],
};

const MATE_HIT: SfxSpec = {
  tones: [
    { at: 0, dur: 0.5, f: 110, to: 46, wave: "triangle", vol: 0.42 },
    { at: 0, dur: 0.09, f: 660, to: 220, wave: "square", vol: 0.07 },
  ],
  noise: [{ at: 0, dur: 0.3, cut: 900, vol: 0.3 }],
};

const BEAM: SfxSpec = { tones: arp([587, 740, 880], 0.07, 0.08, "square", 0.06) };

const TOPPLE: SfxSpec = {
  tones: [
    { at: 0, dur: 0.22, f: 420, to: 120, wave: "triangle", vol: 0.16 },
    { at: 0.22, dur: 0.12, f: 120, to: 55, wave: "triangle", vol: 0.36 },
  ],
  noise: [{ at: 0.22, dur: 0.08, cut: 1200, vol: 0.26 }],
};

const PROMOTE: SfxSpec = {
  tones: [
    ...arp([523, 659, 784, 1047, 1319], 0.05, 0.08, "square", 0.08),
    { at: 0.25, dur: 0.3, f: 2093, wave: "triangle", vol: 0.07 },
  ],
};

const CROWN: SfxSpec = {
  tones: [...arp([659, 784, 988], 0.07, 0.1, "square", 0.08), { at: 0.21, dur: 0.35, f: 1319, wave: "triangle", vol: 0.12 }],
  noise: [{ at: 0.21, dur: 0.04, cut: 7000, vol: 0.06 }],
};

const TICK: SfxSpec = { tones: [{ at: 0, dur: 0.03, f: 990, to: 760, wave: "triangle", vol: 0.1 }] };
/** the last three seconds beat twice, like a heart */
const TICK_TOCK: SfxSpec = {
  tones: [
    { at: 0, dur: 0.03, f: 990, to: 760, wave: "triangle", vol: 0.11 },
    { at: 0.14, dur: 0.03, f: 740, to: 600, wave: "triangle", vol: 0.08 },
  ],
};

const PUNCH: SfxSpec = {
  tones: [{ at: 0, dur: 0.02, f: 1400, to: 900, wave: "square", vol: 0.025 }],
  noise: [{ at: 0, dur: 0.012, cut: 5000, vol: 0.06 }],
};

const FLAG: SfxSpec = {
  tones: [
    { at: 0, dur: 0.1, f: 660, wave: "square", vol: 0.07 },
    { at: 0.12, dur: 0.1, f: 494, wave: "square", vol: 0.07 },
    { at: 0.24, dur: 0.4, f: 330, to: 196, wave: "triangle", vol: 0.2 },
  ],
  noise: [{ at: 0.24, dur: 0.08, cut: 1400, vol: 0.2 }],
};

const HUSH: SfxSpec = { tones: arp([523, 392], 0.16, 0.2, "triangle", 0.14) };

const RATTLE: SfxSpec = {
  tones: Array.from({ length: 6 }, (_, i) => ({
    at: i * 0.045,
    dur: 0.03,
    f: 300 + i * 26,
    to: 220 + i * 20,
    wave: "triangle" as const,
    vol: 0.08,
  })),
};

const HOP: SfxSpec = {
  tones: [
    { at: 0, dur: 0.045, f: 300, to: 200, wave: "triangle", vol: 0.3 },
    { at: 0, dur: 0.015, f: 1100, to: 700, wave: "square", vol: 0.025 },
  ],
  noise: [{ at: 0, dur: 0.025, cut: 2600, vol: 0.2 }],
};

/** the crack of one disc sent off by another, under the hop that did it */
const CRACK: SfxSpec = {
  tones: [{ at: 0, dur: 0.05, f: 260, to: 110, wave: "square", vol: 0.07 }],
  noise: [{ at: 0, dur: 0.05, cut: 3400, vol: 0.2 }],
};

const CHEER: SfxSpec = { tones: [{ at: 0, dur: 0.035, f: 660, to: 520, wave: "triangle", vol: 0.1 }] };

/** a whole tone up for every hop of a run, and no higher than an octave and a bit */
const climb = (step: number) => 2 ** (Math.min(step, 7) / 6);

export const boardSfx = {
  /** a piece picked up */
  lift: (kind?: Kind) => sfxPlay("b.lift", LIFT, { pitch: kind ? 0.8 + WEIGHT[kind] * 0.2 : 1 }),
  /** a chess piece set down; `soft` for the second piece of a castling */
  clack: (kind: Kind, soft = false) =>
    sfxPlay(soft ? "b.clack2" : "b.clack", CLACK, { pitch: WEIGHT[kind] * vary(), vol: soft ? 0.7 : kind === "p" ? 0.85 : 1 }),
  /** a piece knocked off the board: the heavier it was, the lower */
  knock: (kind: Kind) => sfxPlay("b.knock", KNOCK, { pitch: (0.6 + WEIGHT[kind] * 0.4) * vary() }),
  /** the taken piece lands in the tray */
  tray: () => sfxPlay("b.tray", TRAY, { pitch: vary() }),
  /** a move the rules do not allow: two soft knocks, not a buzzer */
  refuse: () => sfxPlay("b.refuse", REFUSE),
  check: () => sfxPlay("b.check", CHECK),
  /** the mating move lands, the lines to the king light up, the king goes over */
  mateHit: () => sfxPlay("b.mate", MATE_HIT),
  beam: () => sfxPlay("b.beam", BEAM),
  topple: () => sfxPlay("b.topple", TOPPLE),
  /** a pawn becomes a piece: a queen rings out lowest and fullest */
  promote: (kind: Kind) => sfxPlay("b.promote", PROMOTE, { pitch: kind === "q" ? 1 : kind === "n" ? 1.19 : 1.12 }),
  /** a draughts man is crowned */
  crown: () => sfxPlay("b.crown", CROWN),
  /** your own clock in its last seconds: `left` is the whole seconds still on it */
  tick: (left: number) => sfxPlay("b.tick", left <= 3 ? TICK_TOCK : TICK, { pitch: left <= 5 ? 1.12 : 1 }),
  /** the clock handed over, under the move's own sound */
  punch: () => sfxPlay("b.punch", PUNCH),
  /** a flag falls */
  flag: () => sfxPlay("b.flag", FLAG),
  /** a game ends with nobody winning */
  hush: () => sfxPlay("b.hush", HUSH),
  /** the pieces come to attention as a game opens */
  rattle: () => sfxPlay("b.rattle", RATTLE),
  /** a draughts piece lands; each hop of one run a step higher than the last, and with a crack when it took something */
  hop: (step = 0, king = false, took = false) => {
    sfxPlay("b.hop", HOP, { pitch: climb(step) * (king ? 0.86 : 1) * vary() });
    if (took) sfxPlay("b.crack", CRACK, { pitch: climb(step) });
  },
  /** the winner's pieces hop one after another at the end of a draughts game */
  cheer: (step: number) => sfxPlay("b.cheer", CHEER, { pitch: climb(step), vol: 0.8 }),
};
