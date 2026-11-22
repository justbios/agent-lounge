"use client";

export type Mood = "win" | "lose" | "draw";

/**
 * The call across the board the moment a game ends while it is open: the game's own word for it («Мат!», «Нічия»),
 * stamped on and gone again before the result card comes in, so the last position is never hidden for long. The line
 * under the board says the same to a screen reader.
 */
export default function Finale({ mood, text }: { mood: Mood; text: string }) {
  if (!text) return null;
  return (
    <div className={`finale ${mood}`} aria-hidden>
      <span className="finale-ribbon">{text}</span>
    </div>
  );
}
