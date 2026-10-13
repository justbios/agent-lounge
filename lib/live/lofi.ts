const BPM = 72;
const BEAT = 60 / BPM;
const AHEAD_S = 1.2;
const TICK_MS = 100;
const MAX_WORKERS = 6;

const CHORDS = [
  [174.61, 220.0, 261.63, 329.63],
  [164.81, 196.0, 246.94, 293.66],
  [146.83, 174.61, 220.0, 261.63],
  [130.81, 164.81, 196.0, 246.94],
];
const BASS = [87.31, 82.41, 73.42, 65.41];

function noiseBuffer(ac: BaseAudioContext, seconds: number, fill: () => number): AudioBuffer {
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = fill();
  return buf;
}

export interface Lofi {
  stop: () => void;
}

/**
 * A lo-fi loop made on the spot: four soft seventh chords, a bass, a muffled kick and hat, and keyboard clicks on top.
 * `working` and `volume` are read every tick: the music grows louder and the typing busier as more agents work, and
 * the whole mix follows the listener's volume, 0 to 1.
 */
export function startLofi(ac: AudioContext, working: () => number, volume: () => number): Lofi {
  const out = ac.createGain();
  out.gain.value = volume();
  out.connect(ac.destination);
  const master = ac.createGain();
  master.gain.value = 0;
  master.connect(out);
  const tone = ac.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 1500;
  tone.Q.value = 0.4;
  tone.connect(master);
  const keys = ac.createGain();
  keys.gain.value = 0;
  keys.connect(out);

  const hiss = noiseBuffer(ac, 1, () => Math.random() * 2 - 1);

  const note = (f: number, t: number, dur: number, gain: number, type: OscillatorType = "triangle") => {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = (Math.random() - 0.5) * 12;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(tone);
    o.start(t);
    o.stop(t + dur + 0.05);
  };
  const burst = (t: number, gain: number, len: number, filter: BiquadFilterType, freq: number, out: AudioNode) => {
    const src = ac.createBufferSource();
    src.buffer = hiss;
    const f = ac.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = filter === "bandpass" ? 2.5 : 0.7;
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.8);
    src.stop(t + len + 0.02);
  };
  const kick = (t: number) => {
    const o = ac.createOscillator();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.45, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(tone);
    o.start(t);
    o.stop(t + 0.3);
  };

  let bar = 0;
  let next = ac.currentTime + 0.15;
  let clickAt = ac.currentTime;
  const tick = () => {
    const w = Math.min(MAX_WORKERS, Math.max(0, working()));
    const now = ac.currentTime;
    out.gain.setTargetAtTime(Math.min(1, Math.max(0, volume())), now, 0.05);
    master.gain.setTargetAtTime(0.4 + 0.08 * w, now, 1.2);
    keys.gain.setTargetAtTime(w ? 0.4 + 0.1 * w : 0, now, 0.4);
    while (next < now + AHEAD_S) {
      const c = bar % CHORDS.length;
      CHORDS[c].forEach((f, k) => note(f, next + k * 0.015, BEAT * 3.7, 0.08));
      note(BASS[c], next, BEAT * 1.9, 0.2, "sine");
      note(BASS[c], next + BEAT * 2, BEAT * 1.9, 0.17, "sine");
      const top = CHORDS[c][1 + Math.floor(Math.random() * 3)] * 2;
      note(top, next + BEAT * (1 + Math.floor(Math.random() * 2)) + BEAT / 2, BEAT * 1.4, 0.045, "sine");
      for (let b = 0; b < 4; b++) {
        if (b % 2 === 0) kick(next + b * BEAT);
        burst(next + b * BEAT + BEAT / 2, 0.06, 0.05, "highpass", 7000, tone);
      }
      next += BEAT * 4;
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
    },
  };
}
