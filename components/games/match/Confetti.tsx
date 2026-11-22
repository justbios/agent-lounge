import { CSSProperties } from "react";

const COLORS = ["#ffc456", "#8ee59b", "#62f0ff", "#ff6aa8", "#f4eeff", "#b3a6cf"];

/** Pixel confetti, spread the same way every time: across the whole match, a little apart in time, some drifting. */
const PIECES = Array.from({ length: 46 }, (_, i) => ({
  "--x": `${(i * 37 + 5) % 100}%`,
  "--d": `${((i * 53) % 13) * 0.06}s`,
  "--t": `${1.5 + (i % 5) * 0.2}s`,
  "--dx": `${(((i * 29) % 9) - 4) * 9}px`,
  "--s": `${5 + (i % 3) * 2}px`,
  "--c": COLORS[i % COLORS.length],
})) as CSSProperties[];

/** Confetti over the whole match for the winner; it falls once and is gone. */
export default function Confetti() {
  return (
    <div className="mt-confetti" aria-hidden>
      {PIECES.map((style, i) => (
        <i key={i} style={style} />
      ))}
    </div>
  );
}
