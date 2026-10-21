"use client";

import { CSSProperties } from "react";

export type Mood = "win" | "lose" | "draw";

const COLORS = ["#ffd25a", "#4ade80", "#7cc0f2", "#ff8fb1", "#ffb07a", "#a9b8ff"];

/** Pixel confetti, spread the same way every time: across the board, a little apart in time, some drifting. */
const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  "--x": `${(i * 37 + 7) % 100}%`,
  "--d": `${((i * 53) % 9) * 0.07}s`,
  "--t": `${1.3 + (i % 4) * 0.22}s`,
  "--dx": `${(((i * 29) % 7) - 3) * 7}px`,
  "--c": COLORS[i % COLORS.length],
})) as CSSProperties[];

/**
 * A ribbon across the board when a game ends while it is open, and confetti when the viewer won; it fades by itself so
 * the last position can be seen. The line under the board says the same to a screen reader.
 */
export default function Finale({ mood, text }: { mood: Mood; text: string }) {
  return (
    <div className={`finale ${mood}`} aria-hidden>
      {mood === "win" && CONFETTI.map((style, i) => <i key={i} style={style} />)}
      <span className="finale-ribbon">{text}</span>
    </div>
  );
}
