import { SfxSpec, arp, sfxPlay } from "../sfx";

/*
 * The sounds of the frame around a match: the two sides coming together when it opens, and the result card landing
 * when it is over. Each is asked for once a match, never from a loop, and none is louder than the games' own.
 */

/** the sides slide in from their edges */
const SWISH: SfxSpec = {
  tones: [{ at: 0, dur: 0.16, f: 240, to: 520, wave: "sine", vol: 0.05 }],
  noise: [{ at: 0, dur: 0.18, cut: 3200, vol: 0.06 }],
};

/** the VS lands between them: a low knock and a short bright ring on top */
const VS: SfxSpec = {
  tones: [
    { at: 0, dur: 0.24, f: 132, to: 50, wave: "triangle", vol: 0.4 },
    { at: 0, dur: 0.06, f: 740, to: 392, wave: "square", vol: 0.06 },
    { at: 0.06, dur: 0.2, f: 988, wave: "square", vol: 0.045 },
    { at: 0.06, dur: 0.2, f: 1319, wave: "triangle", vol: 0.07 },
  ],
  noise: [{ at: 0, dur: 0.18, cut: 1100, vol: 0.3 }],
};

/**
 * the card lands on a win: a knock and one bright chord with a sparkle on top. The game has already played its own
 * run of notes up by then, so this is where they come to rest, not a second run.
 */
const WON: SfxSpec = {
  tones: [
    { at: 0, dur: 0.12, f: 196, to: 98, wave: "triangle", vol: 0.28 },
    { at: 0.03, dur: 0.6, f: 262, wave: "triangle", vol: 0.2 },
    { at: 0.03, dur: 0.55, f: 784, wave: "square", vol: 0.06 },
    { at: 0.03, dur: 0.55, f: 1047, wave: "triangle", vol: 0.1 },
    { at: 0.03, dur: 0.55, f: 1319, wave: "triangle", vol: 0.09 },
    { at: 0.22, dur: 0.35, f: 2093, wave: "triangle", vol: 0.06 },
  ],
  noise: [
    { at: 0, dur: 0.07, cut: 900, vol: 0.16 },
    { at: 0.03, dur: 0.28, cut: 7000, vol: 0.05 },
  ],
};

/** on a loss: two soft notes going down, nothing harsh */
const LOST: SfxSpec = {
  tones: [
    { at: 0, dur: 0.2, f: 349, wave: "triangle", vol: 0.16 },
    { at: 0.19, dur: 0.42, f: 262, to: 247, wave: "triangle", vol: 0.16 },
    { at: 0.19, dur: 0.42, f: 131, wave: "triangle", vol: 0.14 },
  ],
  noise: [{ at: 0, dur: 0.07, cut: 800, vol: 0.14 }],
};

/** on a draw: the same note twice and a step up, neither glad nor sad */
const DRAWN: SfxSpec = {
  tones: [...arp([440, 440, 523], 0.13, 0.12, "triangle", 0.15)],
  noise: [{ at: 0, dur: 0.07, cut: 800, vol: 0.14 }],
};

export const matchSfx = {
  swish: () => sfxPlay("match.swish", SWISH),
  vs: () => sfxPlay("match.vs", VS),
  won: () => sfxPlay("match.won", WON),
  lost: () => sfxPlay("match.lost", LOST),
  drawn: () => sfxPlay("match.drawn", DRAWN),
};
