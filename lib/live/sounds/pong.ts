"use client";

import { SfxSpec, arp, sfxPlay } from "../sfx";

/*
 * Ping-pong's own sounds. A rally is a little tune: the paddle's «ping» and the table's «pong» climb a pentatonic
 * scale hit by hit, so a long rally is heard coming. Everything else is built round that: a dry knock off the rail,
 * a crack off a paddle's tip, a thud when the ball is lost, a low pulse before a point that can end the match.
 */

/** the steps of the climb, in semitones over the first hit: two octaves of a pentatonic scale */
const CLIMB = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

/** How much higher a rally's `n`th hit sounds; at the top of the climb it trills between the last two steps. */
export function climb(n: number): number {
  const top = CLIMB.length - 1;
  const i = n <= top + 1 ? Math.max(0, n - 1) : top - ((n - top) % 2);
  return Math.pow(2, CLIMB[i] / 12);
}

const PING: SfxSpec = {
  tones: [
    { at: 0, dur: 0.05, f: 440, to: 400, wave: "square", vol: 0.07 },
    { at: 0, dur: 0.09, f: 220, to: 206, wave: "triangle", vol: 0.2 },
  ],
  noise: [{ at: 0, dur: 0.018, cut: 5000, vol: 0.1 }],
};
/** the same hit an octave up, laid over a rally that has gone on long */
const SHIMMER: SfxSpec = { tones: [{ at: 0.01, dur: 0.06, f: 880, to: 830, wave: "triangle", vol: 0.07 }] };
const PONG: SfxSpec = {
  tones: [{ at: 0, dur: 0.07, f: 165, to: 128, wave: "triangle", vol: 0.2 }],
  noise: [{ at: 0, dur: 0.012, cut: 1600, vol: 0.07 }],
};
const RAIL: SfxSpec = {
  tones: [{ at: 0, dur: 0.045, f: 320, to: 250, wave: "triangle", vol: 0.19 }],
  noise: [{ at: 0, dur: 0.015, cut: 3000, vol: 0.06 }],
};
const TIP: SfxSpec = {
  tones: [{ at: 0, dur: 0.07, f: 1568, to: 784, wave: "square", vol: 0.055 }],
  noise: [{ at: 0, dur: 0.05, cut: 7000, vol: 0.16 }],
};
const SERVE: SfxSpec = {
  tones: [{ at: 0, dur: 0.1, f: 294, to: 440, wave: "triangle", vol: 0.18 }],
  noise: [{ at: 0, dur: 0.07, cut: 2200, vol: 0.07 }],
};
const READY: SfxSpec = { tones: [{ at: 0, dur: 0.035, f: 784, wave: "square", vol: 0.04 }] };
const THUD: SfxSpec = {
  tones: [{ at: 0, dur: 0.2, f: 150, to: 55, wave: "triangle", vol: 0.36 }],
  noise: [{ at: 0, dur: 0.16, cut: 1400, vol: 0.2 }],
};
const WON: SfxSpec = {
  tones: [...arp([523, 659, 784], 0.065, 0.08, "square", 0.085), { at: 0.2, dur: 0.24, f: 1047, wave: "square", vol: 0.08 }],
};
const LOST: SfxSpec = {
  tones: [
    { at: 0, dur: 0.14, f: 330, to: 294, wave: "triangle", vol: 0.2 },
    { at: 0.13, dur: 0.24, f: 247, to: 196, wave: "triangle", vol: 0.2 },
  ],
};
const FLIP: SfxSpec = {
  tones: [{ at: 0, dur: 0.03, f: 1175, wave: "square", vol: 0.045 }],
  noise: [{ at: 0, dur: 0.02, cut: 3500, vol: 0.08 }],
};
/** two low beats, a heart's */
const PULSE: SfxSpec = {
  tones: [
    { at: 0, dur: 0.16, f: 82, to: 55, wave: "triangle", vol: 0.4 },
    { at: 0.22, dur: 0.2, f: 73, to: 49, wave: "triangle", vol: 0.32 },
  ],
};
const TENSE: SfxSpec = {
  tones: [
    { at: 0, dur: 0.12, f: 392, wave: "square", vol: 0.06 },
    { at: 0.13, dur: 0.26, f: 466, wave: "square", vol: 0.06 },
    { at: 0, dur: 0.42, f: 98, wave: "triangle", vol: 0.2 },
  ],
};
const FINAL_WON: SfxSpec = {
  tones: [
    ...arp([523, 659, 784, 1047], 0.07, 0.09, "square", 0.085),
    { at: 0.3, dur: 0.6, f: 784, wave: "square", vol: 0.07 },
    { at: 0.3, dur: 0.6, f: 1047, wave: "square", vol: 0.06 },
    { at: 0.3, dur: 0.66, f: 1319, wave: "triangle", vol: 0.12 },
    { at: 0.3, dur: 0.66, f: 262, wave: "triangle", vol: 0.24 },
  ],
  noise: [{ at: 0.3, dur: 0.28, cut: 7000, vol: 0.06 }],
};
const FINAL_LOST: SfxSpec = {
  tones: [
    ...arp([392, 330, 262], 0.15, 0.16, "triangle", 0.2),
    { at: 0.46, dur: 0.6, f: 196, to: 147, wave: "triangle", vol: 0.22 },
    { at: 0.46, dur: 0.6, f: 98, to: 73, wave: "triangle", vol: 0.22 },
  ],
};

/** The paddle meets the ball: `rally` hits into the rally, the ball at `heat` (0 to 1) of its top speed. */
export function ping(rally: number, heat: number) {
  const pitch = climb(rally);
  sfxPlay("pong.ping", PING, { pitch, vol: 0.8 + 0.2 * heat });
  if (rally >= 9) sfxPlay("pong.shimmer", SHIMMER, { pitch, vol: Math.min(1, (rally - 8) / 6) });
}

/** The ball comes down on the table on its way across: the rally's own note, an octave under the paddle's. */
export const tock = (rally: number, heat: number) =>
  sfxPlay("pong.pong", PONG, { pitch: climb(rally), vol: 0.6 + 0.25 * heat });

export const rail = (heat: number) => sfxPlay("pong.rail", RAIL, { pitch: 1 + 0.45 * heat, vol: 0.75 + 0.25 * heat });
/** off a paddle's tip: a crack on top of the hit */
export const crack = () => sfxPlay("pong.tip", TIP);
export const served = () => sfxPlay("pong.serve", SERVE);
/** the beats before a serve, the second a step higher */
export const ready = (second: boolean) => sfxPlay("pong.ready", READY, { pitch: second ? 1.19 : 1 });
/** the ball is lost against the end wall */
export const thud = (big: boolean) => sfxPlay("pong.thud", THUD, { pitch: big ? 0.8 : 1 });
export const point = (mine: boolean) => sfxPlay(mine ? "pong.won" : "pong.lost", mine ? WON : LOST);
/** a big digit of the score turns over */
export const flip = () => sfxPlay("pong.flip", FLIP);
/** a point that can end the match: its name is called, and a heart beats before the serve */
export const tense = () => sfxPlay("pong.tense", TENSE);
export const pulse = () => sfxPlay("pong.pulse", PULSE);
/** the last point of the match */
export const final = (mine: boolean) => sfxPlay(mine ? "pong.final" : "pong.over", mine ? FINAL_WON : FINAL_LOST);
