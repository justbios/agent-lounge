"use client";

import { SfxBend, SfxSpec, arp, sfxPlay } from "../sfx";

/*
 * Sumo's own sounds: bodies on ice, ice breaking, cold water, and the little ceremony round each bout. All of them
 * are quieter than or level with the shared ones, and the ones that can come often are short and bent a little each
 * time so they never drone.
 */

const SOUNDS = {
  /** two wrestlers meet without much speed */
  bump: {
    tones: [{ at: 0, dur: 0.06, f: 230, to: 150, wave: "triangle", vol: 0.3 }],
    noise: [{ at: 0, dur: 0.03, cut: 1500, vol: 0.14 }],
  },
  /** a hard hit: the body of it, then the ice answering */
  thud: {
    tones: [
      { at: 0, dur: 0.17, f: 150, to: 46, wave: "triangle", vol: 0.48 },
      { at: 0, dur: 0.05, f: 300, to: 120, wave: "square", vol: 0.06 },
    ],
    noise: [{ at: 0, dur: 0.12, cut: 1100, vol: 0.36 }],
  },
  crack: {
    tones: arp([1900, 1300, 1650, 1050], 0.02, 0.03, "square", 0.035),
    noise: [{ at: 0, dur: 0.06, cut: 5200, vol: 0.16 }],
  },
  /** a dash: feet scraping off */
  dash: {
    tones: [{ at: 0, dur: 0.1, f: 420, to: 170, wave: "sine", vol: 0.08 }],
    noise: [{ at: 0, dur: 0.11, cut: 2600, vol: 0.15 }],
  },
  /** a dash asked for before it is back */
  deny: { tones: [{ at: 0, dur: 0.04, f: 180, to: 150, wave: "square", vol: 0.05 }] },
  /** the rim under somebody's weight */
  creak: {
    tones: [
      { at: 0, dur: 0.11, f: 96, to: 132, wave: "sawtooth", vol: 0.05 },
      { at: 0.1, dur: 0.12, f: 140, to: 104, wave: "sawtooth", vol: 0.045 },
    ],
    noise: [{ at: 0, dur: 0.05, cut: 700, vol: 0.06 }],
  },
  /** a crumb of ice into the water */
  plip: { tones: [{ at: 0, dur: 0.035, f: 1300, to: 2000, wave: "sine", vol: 0.05 }] },
  /** off the edge and through the air */
  whee: { tones: [{ at: 0, dur: 0.26, f: 980, to: 300, wave: "sine", vol: 0.08 }] },
  splash: {
    tones: [{ at: 0, dur: 0.2, f: 300, to: 85, wave: "sine", vol: 0.22 }],
    noise: [
      { at: 0, dur: 0.3, cut: 1700, vol: 0.4 },
      { at: 0.02, dur: 0.14, cut: 5200, vol: 0.13 },
    ],
  },
  bubbles: {
    tones: [
      { at: 0, dur: 0.05, f: 480, to: 800, wave: "sine", vol: 0.08 },
      { at: 0.09, dur: 0.05, f: 600, to: 980, wave: "sine", vol: 0.07 },
      { at: 0.17, dur: 0.05, f: 740, to: 1200, wave: "sine", vol: 0.06 },
    ],
  },
  /** back up in a block of ice: a pop, then teeth chattering */
  surface: {
    tones: [
      { at: 0, dur: 0.07, f: 300, to: 620, wave: "sine", vol: 0.12 },
      ...arp([1500, 1700, 1500, 1700, 1500], 0.045, 0.014, "square", 0.03).map((t) => ({ ...t, at: t.at + 0.16 })),
    ],
    noise: [{ at: 0, dur: 0.05, cut: 2500, vol: 0.06 }],
  },
  /** the block breaks as its owner jumps back on */
  shatter: {
    tones: arp([1500, 1100, 820], 0.025, 0.035, "square", 0.04),
    noise: [{ at: 0, dur: 0.1, cut: 5600, vol: 0.16 }],
  },
  /** feet back on the ice */
  land: {
    tones: [{ at: 0, dur: 0.05, f: 160, to: 90, wave: "triangle", vol: 0.2 }],
    noise: [{ at: 0, dur: 0.03, cut: 800, vol: 0.12 }],
  },
  /** the stomp before a bout */
  stomp: {
    tones: [{ at: 0, dur: 0.13, f: 120, to: 48, wave: "triangle", vol: 0.42 }],
    noise: [{ at: 0, dur: 0.08, cut: 700, vol: 0.28 }],
  },
  gong: {
    tones: [
      { at: 0, dur: 0.9, f: 196, wave: "triangle", vol: 0.25 },
      { at: 0, dur: 0.7, f: 392, wave: "sine", vol: 0.12 },
      { at: 0, dur: 0.45, f: 588, wave: "sine", vol: 0.05 },
    ],
    noise: [{ at: 0, dur: 0.05, cut: 2500, vol: 0.1 }],
  },
  /** one more round takes the match */
  point: { tones: arp([880, 932, 880, 932], 0.07, 0.07, "square", 0.045) },
  /** down on the fists */
  set: { tones: [{ at: 0, dur: 0.06, f: 330, wave: "square", vol: 0.05 }] },
  /** the wooden clappers, and off they go */
  go: {
    tones: [
      { at: 0, dur: 0.03, f: 1500, to: 800, wave: "square", vol: 0.08 },
      { at: 0.1, dur: 0.03, f: 1500, to: 800, wave: "square", vol: 0.08 },
      { at: 0.1, dur: 0.13, f: 392, to: 784, wave: "triangle", vol: 0.16 },
    ],
    noise: [
      { at: 0, dur: 0.02, cut: 6000, vol: 0.14 },
      { at: 0.1, dur: 0.02, cut: 6000, vol: 0.14 },
    ],
  },
  roundWon: {
    tones: [...arp([523, 659, 784], 0.07, 0.09, "square", 0.08), { at: 0.21, dur: 0.22, f: 1047, wave: "square", vol: 0.08 }],
  },
  roundLost: {
    tones: [
      { at: 0, dur: 0.16, f: 392, to: 330, wave: "triangle", vol: 0.16 },
      { at: 0.16, dur: 0.28, f: 294, to: 220, wave: "triangle", vol: 0.16 },
    ],
  },
  roundDraw: { tones: arp([392, 392], 0.12, 0.1, "triangle", 0.14) },
  /** the floe starts to melt */
  melt: {
    tones: arp([660, 520], 0.1, 0.09, "square", 0.05),
    noise: [{ at: 0.2, dur: 0.06, cut: 4800, vol: 0.12 }],
  },
  /** a piece of the rim breaks off as it melts */
  chunk: {
    tones: [{ at: 0, dur: 0.05, f: 190, to: 130, wave: "triangle", vol: 0.12 }],
    noise: [{ at: 0, dur: 0.03, cut: 1200, vol: 0.08 }],
  },
  /** the match is won: short, the result card has its own to follow */
  victory: {
    tones: [
      ...arp([523, 659, 784, 1047], 0.075, 0.09, "square", 0.085),
      { at: 0.3, dur: 0.4, f: 1319, wave: "square", vol: 0.08 },
      { at: 0.3, dur: 0.4, f: 659, wave: "triangle", vol: 0.14 },
    ],
  },
  defeat: {
    tones: [
      ...arp([440, 392, 330], 0.15, 0.14, "triangle", 0.17),
      { at: 0.45, dur: 0.4, f: 262, to: 196, wave: "triangle", vol: 0.18 },
    ],
  },
} satisfies Record<string, SfxSpec>;

export type SumoSound = keyof typeof SOUNDS;

/** Plays one of sumo's sounds, bent in pitch and loudness if asked. */
export function sumoSfx(name: SumoSound, bend?: SfxBend) {
  sfxPlay(`sumo.${name}`, SOUNDS[name], bend);
}
