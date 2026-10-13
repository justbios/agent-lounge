import type { Track } from "./tracks";

const AHEAD_S = 1.2;
const TICK_MS = 100;
const MAX_WORKERS = 6;

/** What a track plays with: pitched notes by MIDI number and three drums, all through the band's warm filter. */
export interface Kit {
  note: (midi: number, t: number, dur: number, gain: number, wave?: OscillatorType) => void;
  kick: (t: number, gain?: number) => void;
  snare: (t: number, gain?: number, len?: number) => void;
  hat: (t: number, gain?: number, len?: number) => void;
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function noiseBuffer(ac: BaseAudioContext, seconds: number): AudioBuffer {
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export interface Music {
  stop: () => void;
}

/**
 * The café's sound: a track made on the spot, or none, with keyboard clicks on top while agents work.
 * `working` and `volume` are read every tick: the band grows louder and the typing busier as more agents work, and
 * the whole mix follows the listener's volume, 0 to 1.
 */
export function startMusic(ac: AudioContext, track: Track | null, working: () => number, volume: () => number): Music {
  const out = ac.createGain();
  out.gain.value = volume();
  out.connect(ac.destination);
  const master = ac.createGain();
  master.gain.value = 0;
  master.connect(out);
  const tone = ac.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = track?.warmth ?? 1500;
  tone.Q.value = 0.4;
  tone.connect(master);
  const keys = ac.createGain();
  keys.gain.value = 0;
  keys.connect(out);

  const hiss = noiseBuffer(ac, 3);

  const burst = (t: number, gain: number, len: number, filter: BiquadFilterType, freq: number, to: AudioNode) => {
    const src = ac.createBufferSource();
    src.buffer = hiss;
    const f = ac.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = filter === "bandpass" ? 2.5 : 0.7;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(to);
    src.start(t, Math.random() * 2.5);
    src.stop(t + len + 0.02);
  };

  const kit: Kit = {
    note: (midi, t, dur, gain, wave = "triangle") => {
      const o = ac.createOscillator();
      o.type = wave;
      o.frequency.value = hz(midi);
      o.detune.value = (Math.random() - 0.5) * 12;
      const g = ac.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + Math.min(0.04, dur / 4));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(tone);
      o.start(t);
      o.stop(t + dur + 0.05);
    },
    kick: (t, gain = 0.45) => {
      const o = ac.createOscillator();
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      const g = ac.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.connect(g).connect(tone);
      o.start(t);
      o.stop(t + 0.3);
    },
    snare: (t, gain = 0.14, len = 0.12) => burst(t, gain, len, "bandpass", 1500, tone),
    hat: (t, gain = 0.06, len = 0.05) => burst(t, gain, len, "highpass", 7000, tone),
  };

  let bed: AudioBufferSourceNode | null = null;
  if (track?.bed === "rain") {
    bed = ac.createBufferSource();
    bed.buffer = hiss;
    bed.loop = true;
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 1100;
    const g = ac.createGain();
    g.gain.value = 0.09;
    bed.connect(f).connect(g).connect(master);
    bed.start();
  }

  const beat = track ? 60 / track.bpm : 1;
  let bar = 0;
  let next = ac.currentTime + 0.15;
  let clickAt = ac.currentTime;
  const tick = () => {
    const w = Math.min(MAX_WORKERS, Math.max(0, working()));
    const now = ac.currentTime;
    out.gain.setTargetAtTime(Math.min(1, Math.max(0, volume())), now, 0.05);
    master.gain.setTargetAtTime(track ? 0.4 + 0.08 * w : 0, now, 1.2);
    keys.gain.setTargetAtTime(w ? 0.4 + 0.1 * w : 0, now, 0.4);
    while (track && next < now + AHEAD_S) {
      track.bar(kit, bar, next, beat);
      next += beat * 4;
      bar++;
    }
    if (!w) {
      clickAt = now + 0.3;
      return;
    }
    const rate = 4 + 5 * w;
    clickAt = Math.max(clickAt, now);
    while (clickAt < now + 0.3) {
      burst(clickAt, 0.5 + Math.random() * 0.5, 0.022, "bandpass", 1800 + Math.random() * 2200, keys);
      clickAt += (-Math.log(1 - Math.random()) / rate) * (Math.random() < 0.08 ? 6 : 1);
    }
  };
  tick();
  const id = setInterval(tick, TICK_MS);
  return {
    stop: () => {
      clearInterval(id);
      out.gain.setTargetAtTime(0, ac.currentTime, 0.1);
      bed?.stop(ac.currentTime + 0.5);
    },
  };
}
