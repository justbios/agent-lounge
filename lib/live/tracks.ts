import type { Kit } from "./music";

export type TrackId = "lofi" | "rain" | "chip" | "jazz" | "synth" | "field" | "keys";

export interface Track {
  id: Exclude<TrackId, "keys">;
  bpm: number;
  /** the lowpass over the whole band: lower is warmer and more muffled */
  warmth: number;
  /** a steady sound under the music */
  bed?: "rain";
  /** schedules bar `n`, four beats from `t`, `beat` seconds each */
  bar: (k: Kit, n: number, t: number, beat: number) => void;
}

export interface TrackInfo {
  id: TrackId;
  icon: string;
  name: string;
  mood: string;
}

/** The jukebox's records, in the order it shows them. «Лише клавіатури» plays no music, only the typing. */
export const TRACKS: TrackInfo[] = [
  { id: "lofi", icon: "🌙", name: "Lo-fi вечір", mood: "тепло й повільно" },
  { id: "rain", icon: "🌧", name: "Дощ за вікном", mood: "піаніно під дощ" },
  { id: "jazz", icon: "🎷", name: "Джаз-кафе", mood: "свінг і контрабас" },
  { id: "synth", icon: "🌆", name: "Нічне місто", mood: "синтвейв" },
  { id: "chip", icon: "👾", name: "8 біт", mood: "як у старій приставці" },
  { id: "field", icon: "🌄", name: "Світанок над полем", mood: "арфа й флейта, повільно" },
  { id: "keys", icon: "⌨️", name: "Лише клавіатури", mood: "без музики, стукіт, поки агенти працюють" },
];

export const trackInfo = (id: TrackId) => TRACKS.find((t) => t.id === id) ?? TRACKS[0];
export const isTrack = (v: unknown): v is TrackId => TRACKS.some((t) => t.id === v);

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

const LOFI = [
  [53, 57, 60, 64],
  [52, 55, 59, 62],
  [50, 53, 57, 60],
  [48, 52, 55, 59],
];
const LOFI_BASS = [41, 40, 38, 36];

const RAIN = [
  [57, 60, 64, 67],
  [53, 57, 60, 64],
  [60, 64, 67, 71],
  [55, 59, 62, 64],
];
const RAIN_BASS = [45, 41, 48, 43];
const RAIN_ARP = [0, 1, 2, 3, 2, 1, 2, 3];

const CHIP = [
  [60, 64, 67],
  [57, 60, 64],
  [53, 57, 60],
  [55, 59, 62],
];

const JAZZ = [
  [53, 57, 60, 64],
  [53, 59, 64, 69],
  [52, 55, 59, 62],
  [55, 61, 65, 70],
];
const WALK = [
  [38, 41, 45, 44],
  [43, 47, 45, 49],
  [48, 52, 55, 46],
  [45, 49, 52, 39],
];

const SYNTH = [
  [57, 60, 64],
  [53, 57, 60],
  [60, 64, 67],
  [55, 59, 62],
];

const FIELD = [
  [50, 57, 62, 66],
  [43, 55, 59, 62],
  [47, 54, 59, 62],
  [45, 52, 57, 61],
  [50, 57, 62, 66],
  [43, 55, 59, 62],
  [45, 52, 57, 61],
  [50, 57, 62, 66],
];
const FIELD_HARP = [1, 2, 3, 4, 3, 2, 3, 4];
/** the flute's eight bars, one per chord: [note, beat it starts on, beats it lasts] */
const FIELD_FLUTE: [number, number, number][][] = [
  [[74, 0, 2], [76, 2, 1], [78, 3, 1]],
  [[79, 0, 3], [78, 3, 1]],
  [[76, 0, 2], [74, 2, 1], [71, 3, 1]],
  [[73, 0, 4]],
  [[78, 0, 2], [81, 2, 1], [78, 3, 1]],
  [[79, 0, 2], [76, 2, 2]],
  [[76, 0, 1], [74, 1, 1], [73, 2, 2]],
  [[74, 0, 4]],
];

const PLAY: Record<Track["id"], Track> = {
  lofi: {
    id: "lofi",
    bpm: 72,
    warmth: 1500,
    bar: (k, n, t, b) => {
      const c = LOFI[n % 4];
      c.forEach((m, i) => k.note(m, t + i * 0.015, b * 3.7, 0.08));
      k.note(LOFI_BASS[n % 4], t, b * 1.9, 0.2, "sine");
      k.note(LOFI_BASS[n % 4], t + b * 2, b * 1.9, 0.17, "sine");
      k.note(pick(c.slice(1)) + 12, t + b * (1 + Math.floor(Math.random() * 2)) + b / 2, b * 1.4, 0.045, "sine");
      for (let i = 0; i < 4; i++) {
        if (i % 2 === 0) k.kick(t + i * b);
        k.hat(t + i * b + b / 2);
      }
    },
  },
  rain: {
    id: "rain",
    bpm: 64,
    warmth: 1300,
    bed: "rain",
    bar: (k, n, t, b) => {
      const c = RAIN[n % 4];
      k.note(RAIN_BASS[n % 4], t, b * 3.9, 0.16, "sine");
      c.forEach((m) => k.note(m, t, b * 3.9, 0.025));
      RAIN_ARP.forEach((j, i) => k.note(c[j] + (i === 3 ? 12 : 0), t + (i * b) / 2, b * 1.6, 0.095, "sine"));
      if (n % 2 === 1) k.note(c[3] + 12, t + b * 3.5, b * 2, 0.05, "sine");
    },
  },
  chip: {
    id: "chip",
    bpm: 128,
    warmth: 3600,
    bar: (k, n, t, b) => {
      const c = CHIP[n % 4];
      const arp = [c[0], c[1], c[2], c[0] + 12];
      for (let i = 0; i < 16; i++) k.note(arp[i % 4] + 12, t + (i * b) / 4, (b / 4) * 0.9, 0.018, "square");
      for (let i = 0; i < 8; i++) k.note(c[0] - (i % 2 ? 12 : 24), t + (i * b) / 2, (b / 2) * 0.8, 0.09, "triangle");
      for (let i = 0; i < 4; i++) {
        if (i % 2 === 0) k.kick(t + i * b, 0.28);
        else k.snare(t + i * b, 0.11, 0.09);
        k.hat(t + i * b + b / 2, 0.05, 0.03);
      }
    },
  },
  jazz: {
    id: "jazz",
    bpm: 108,
    warmth: 2200,
    bar: (k, n, t, b) => {
      const c = JAZZ[n % 4];
      const swung = (i: number) => t + i * b + (b * 2) / 3;
      WALK[n % 4].forEach((m, i) => k.note(m, t + i * b, b * 0.9, 0.17, "sine"));
      c.forEach((m) => k.note(m, swung(1), b * 0.6, 0.045));
      if (Math.random() < 0.6) c.forEach((m) => k.note(m, t + b * 3, b * 0.5, 0.04));
      for (let i = 0; i < 4; i++) k.hat(t + i * b, 0.05, 0.3);
      k.hat(swung(1), 0.035, 0.2);
      k.hat(swung(3), 0.035, 0.2);
      k.snare(t + b, 0.06, 0.18);
      k.snare(t + b * 3, 0.06, 0.18);
      if (n % 2 === 1) [0, 1, 2].forEach((i) => k.note(c[(i + 1) % 4] + 12, swung(i), b * 0.5, 0.05, "sine"));
    },
  },
  synth: {
    id: "synth",
    bpm: 98,
    warmth: 2000,
    bar: (k, n, t, b) => {
      const c = SYNTH[n % 4];
      [c[0] - 12, ...c].forEach((m) => k.note(m, t, b * 3.9, 0.02, "sawtooth"));
      for (let i = 0; i < 16; i++) k.note(c[[0, 1, 2, 1][i % 4]] + 12, t + (i * b) / 4, (b / 4) * 0.8, 0.018, "square");
      for (let i = 0; i < 8; i++) k.note(c[0] - 24, t + (i * b) / 2, (b / 2) * 0.8, 0.06, "sawtooth");
      for (let i = 0; i < 4; i++) {
        k.kick(t + i * b, 0.3);
        if (i % 2) k.snare(t + i * b, 0.11, 0.22);
        k.hat(t + i * b + b / 2, 0.03);
      }
    },
  },
  field: {
    id: "field",
    bpm: 66,
    warmth: 1700,
    bar: (k, n, t, b) => {
      const c = FIELD[n % 8];
      const harp = [...c, c[1] + 12];
      k.note(c[0], t, b * 3.9, 0.15, "sine");
      c.slice(1).forEach((m) => k.note(m, t, b * 3.9, 0.018));
      FIELD_HARP.forEach((j, i) => k.note(harp[j], t + (i * b) / 2, b * 1.5, 0.07, "triangle"));
      if (Math.floor(n / 8) % 2 === 0) {
        FIELD_FLUTE[n % 8].forEach(([m, at, len]) => k.note(m, t + at * b, len * b * 0.95, 0.06, "sine"));
      } else if (Math.random() < 0.5) {
        k.note(pick(c.slice(1)) + 12, t + b * (1 + Math.floor(Math.random() * 2)), b * 1.8, 0.04, "sine");
      }
    },
  },
};

/** The music behind a record, or null for the one that only types. */
export const trackOf = (id: TrackId): Track | null => (id === "keys" ? null : PLAY[id]);
