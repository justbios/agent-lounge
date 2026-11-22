import { SfxSpec, arp, sfxPlay } from "../sfx";

/*
 * The sounds of four in a row and of noughts and crosses: plastic discs clacking down a frame, and chalk on a slate.
 * Each is played through the games' shared switch; none is louder than the shared "piece set down" sound.
 */

/** a little off the note each time, so the hundredth one is not the first one again */
const vary = (by = 0.03) => 1 + (Math.random() * 2 - 1) * by;

// ---- four in a row ------------------------------------------------------------------------------------------------

const AIM: SfxSpec = { tones: [{ at: 0, dur: 0.022, f: 880, wave: "triangle", vol: 0.045 }] };
const RELEASE: SfxSpec = { tones: [{ at: 0, dur: 0.05, f: 560, to: 330, wave: "sine", vol: 0.07 }] };
/** a disc onto a disc: a bright edge and a short body */
const CLACK: SfxSpec = {
  tones: [
    { at: 0, dur: 0.045, f: 330, to: 185, wave: "triangle", vol: 0.32 },
    { at: 0, dur: 0.016, f: 1500, to: 900, wave: "square", vol: 0.04 },
  ],
  noise: [{ at: 0, dur: 0.028, cut: 2600, vol: 0.18 }],
};
/** a disc onto the bottom of the frame: duller and lower */
const THOCK: SfxSpec = {
  tones: [
    { at: 0, dur: 0.06, f: 210, to: 110, wave: "triangle", vol: 0.34 },
    { at: 0, dur: 0.014, f: 1100, to: 700, wave: "square", vol: 0.03 },
  ],
  noise: [{ at: 0, dur: 0.04, cut: 1500, vol: 0.2 }],
};
/** the little second bounce */
const TICK: SfxSpec = {
  tones: [{ at: 0, dur: 0.02, f: 520, to: 390, wave: "triangle", vol: 0.12 }],
  noise: [{ at: 0, dur: 0.012, cut: 3000, vol: 0.06 }],
};
/** one of the winning discs lighting up; bent up the chord from disc to disc */
const NOTE: SfxSpec = {
  tones: [
    { at: 0, dur: 0.1, f: 523, wave: "square", vol: 0.06 },
    { at: 0, dur: 0.16, f: 1047, wave: "triangle", vol: 0.1 },
  ],
};
const NOTE_LOST: SfxSpec = { tones: [{ at: 0, dur: 0.16, f: 440, wave: "triangle", vol: 0.13 }] };
/** the line through the four: the chord the run lands on */
const LINE: SfxSpec = {
  tones: [
    { at: 0, dur: 0.42, f: 1047, wave: "square", vol: 0.06 },
    { at: 0, dur: 0.42, f: 1319, wave: "square", vol: 0.045 },
    { at: 0, dur: 0.5, f: 1568, wave: "triangle", vol: 0.1 },
    { at: 0, dur: 0.5, f: 262, wave: "triangle", vol: 0.2 },
  ],
  noise: [{ at: 0, dur: 0.18, cut: 7000, vol: 0.05 }],
};
const LINE_LOST: SfxSpec = {
  tones: [
    { at: 0, dur: 0.5, f: 311, to: 262, wave: "triangle", vol: 0.18 },
    { at: 0, dur: 0.5, f: 156, to: 131, wave: "triangle", vol: 0.16 },
  ],
};
/** a full board and nobody's four: two even notes and a step down */
const EVEN: SfxSpec = { tones: arp([392, 392, 330], 0.15, 0.13, "triangle", 0.13) };
/** the old discs let out through the bottom of the frame */
const SPILL: SfxSpec = {
  tones: [0, 0.03, 0.07, 0.1, 0.15, 0.2, 0.26, 0.33].map((at, i) => ({
    at,
    dur: 0.035,
    f: [300, 380, 260, 420, 330, 280, 360, 240][i],
    to: [170, 220, 150, 250, 190, 160, 210, 130][i],
    wave: "triangle" as const,
    vol: 0.16 - i * 0.012,
  })),
  noise: [
    { at: 0, dur: 0.05, cut: 1800, vol: 0.14 },
    { at: 0.1, dur: 0.05, cut: 2400, vol: 0.1 },
    { at: 0.24, dur: 0.06, cut: 1500, vol: 0.08 },
  ],
};

/** the chord a winning run climbs, disc by disc, for as many as seven in a row */
const CLIMB = [1, 1.26, 1.498, 2, 2.52, 2.997, 4];
/** and the steps a lost one comes down */
const SINK = [1, 0.891, 0.794, 0.667, 0.595, 0.53, 0.5];

export const four = {
  /** the pointer moved to another column: a tick, a little higher to the right */
  aim: (col: number) => sfxPlay("four.aim", AIM, { pitch: 1 + (col - 3) * 0.05 }),
  release: () => sfxPlay("four.release", RELEASE, { pitch: vary(0.05) }),
  /** a disc lands in `row` (0 at the top): the deeper, the lower; `speed` from 0 to 1 is how hard */
  land(row: number, rows: number, speed: number) {
    const floor = row === rows - 1;
    const pitch = (floor ? 1 : 0.86 + (rows - 1 - row) * 0.075) * vary();
    sfxPlay(floor ? "four.thock" : "four.clack", floor ? THOCK : CLACK, { pitch, vol: 0.7 + 0.3 * speed });
  },
  hop: () => sfxPlay("four.tick", TICK, { pitch: vary(0.06) }),
  /** disc `i` of the winning run lights up */
  note: (i: number, won: boolean) =>
    sfxPlay(`four.note${i}`, won ? NOTE : NOTE_LOST, { pitch: (won ? CLIMB : SINK)[Math.min(i, 6)] }),
  line: (won: boolean) => sfxPlay("four.line", won ? LINE : LINE_LOST),
  even: () => sfxPlay("four.even", EVEN),
  spill: () => sfxPlay("four.spill", SPILL),
};

// ---- noughts and crosses on a chalk board ---------------------------------------------------------------------

const CELL: SfxSpec = { tones: [{ at: 0, dur: 0.02, f: 700, wave: "triangle", vol: 0.035 }] };
/** the chalk touches the slate */
const TAP = { at: 0, dur: 0.024, f: 250, to: 150, wave: "triangle" as const, vol: 0.2 };
/** one straight stroke of a cross: a short scratch with a body under it */
const STROKE: SfxSpec = {
  tones: [TAP, { at: 0.01, dur: 0.09, f: 310, to: 250, wave: "triangle", vol: 0.05 }],
  noise: [
    { at: 0, dur: 0.1, cut: 3200, vol: 0.2 },
    { at: 0.02, dur: 0.07, cut: 7000, vol: 0.05 },
  ],
};
const STROKE_BACK: SfxSpec = {
  tones: [TAP, { at: 0.01, dur: 0.09, f: 350, to: 290, wave: "triangle", vol: 0.05 }],
  noise: [
    { at: 0, dur: 0.1, cut: 4200, vol: 0.19 },
    { at: 0.02, dur: 0.07, cut: 8000, vol: 0.05 },
  ],
};
/** a nought: one long round scratch that opens and closes */
const ROUND: SfxSpec = {
  tones: [TAP, { at: 0.01, dur: 0.26, f: 280, to: 330, wave: "triangle", vol: 0.045 }],
  noise: [
    { at: 0, dur: 0.13, cut: 2800, vol: 0.18 },
    { at: 0.09, dur: 0.14, cut: 3800, vol: 0.17 },
    { at: 0.2, dur: 0.09, cut: 2600, vol: 0.12 },
  ],
};
/** the line struck through three in a row: a long hard scratch and the chalk lifting off */
const STRIKE: SfxSpec = {
  tones: [
    TAP,
    { at: 0.01, dur: 0.2, f: 220, to: 420, wave: "triangle", vol: 0.07 },
    { at: 0.22, dur: 0.03, f: 760, to: 520, wave: "triangle", vol: 0.12 },
  ],
  noise: [
    { at: 0, dur: 0.21, cut: 2600, vol: 0.2 },
    { at: 0.05, dur: 0.17, cut: 5600, vol: 0.12 },
  ],
};
/** the curl the hand comes off the line with */
const CURL: SfxSpec = {
  tones: [{ at: 0, dur: 0.1, f: 380, to: 520, wave: "triangle", vol: 0.05 }],
  noise: [{ at: 0, dur: 0.11, cut: 4600, vol: 0.15 }],
};
/** a chalk star dotted beside the line */
const STAR: SfxSpec = {
  tones: [
    { at: 0, dur: 0.13, f: 1319, wave: "triangle", vol: 0.12 },
    { at: 0, dur: 0.07, f: 2637, wave: "sine", vol: 0.04 },
  ],
  noise: [{ at: 0, dur: 0.012, cut: 3000, vol: 0.08 }],
};
/** one more stroke in the tally at the top of the board */
const TALLY: SfxSpec = {
  tones: [{ ...TAP, f: 320, to: 210 }],
  noise: [{ at: 0, dur: 0.05, cut: 3600, vol: 0.14 }],
};
const LOST: SfxSpec = { tones: [{ at: 0, dur: 0.34, f: 294, to: 220, wave: "triangle", vol: 0.15 }] };
/** nobody's game: two soft notes */
const QUITS: SfxSpec = { tones: arp([349, 311], 0.17, 0.17, "triangle", 0.12) };
/** the rag across the slate, three passes */
const WIPE: SfxSpec = {
  noise: [
    { at: 0, dur: 0.13, cut: 700, vol: 0.2 },
    { at: 0.13, dur: 0.13, cut: 950, vol: 0.19 },
    { at: 0.26, dur: 0.14, cut: 700, vol: 0.18 },
  ],
};
/** the grid gone over again: a quick scratch */
const RULE: SfxSpec = { noise: [{ at: 0, dur: 0.06, cut: 3400, vol: 0.1 }] };

export const chalk = {
  /** the pointer moved to another square */
  cell: (i: number) => sfxPlay("chalk.cell", CELL, { pitch: 1 + (i % 3) * 0.06 - Math.floor(i / 3) * 0.04 }),
  /** a stroke of a cross: the first one way, the second back */
  stroke: (second: boolean) =>
    sfxPlay(second ? "chalk.back" : "chalk.stroke", second ? STROKE_BACK : STROKE, { pitch: vary(0.06) }),
  round: () => sfxPlay("chalk.round", ROUND, { pitch: vary(0.06) }),
  strike: () => sfxPlay("chalk.strike", STRIKE),
  curl: () => sfxPlay("chalk.curl", CURL),
  /** star `i` of three, each a step up */
  star: (i: number) => sfxPlay(`chalk.star${i}`, STAR, { pitch: [1, 1.189, 1.498][Math.min(i, 2)] }),
  tally: () => sfxPlay("chalk.tally", TALLY, { pitch: vary(0.05) }),
  lost: () => sfxPlay("chalk.lost", LOST),
  quits: () => sfxPlay("chalk.quits", QUITS),
  wipe: () => sfxPlay("chalk.wipe", WIPE),
  rule: (i: number) => sfxPlay(`chalk.rule${i}`, RULE, { vol: 0.8 + (i % 2) * 0.2 }),
};
