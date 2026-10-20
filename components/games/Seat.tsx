"use client";

import { ReactNode } from "react";
import { useTr } from "@/lib/i18n";

/** One player at a board: the other side sits above it and you below, and whoever is to move lights up. */
export default function Seat({
  name,
  you,
  on,
  won,
  mark,
  children,
}: {
  name: string;
  you?: boolean;
  /** this player is to move */
  on: boolean;
  won?: boolean;
  mark: ReactNode;
  /** what they have taken */
  children?: ReactNode;
}) {
  const t = useTr();
  return (
    <div className={`seat${on ? " on" : ""}${won ? " won" : ""}`}>
      <span className="seat-mark">{mark}</span>
      <span className="seat-name">
        {name}
        {you && <em>{t("ти", "you")}</em>}
      </span>
      <span className="seat-took">{children}</span>
      {on && <span className="seat-turn">{t("ходить", "to move")}</span>}
      {won && <span className="seat-turn">{t("перемога", "winner")}</span>}
    </div>
  );
}

/** The line under a board: whose move, or how the game ended, coloured for the one reading it. */
export function BoardSay({ text, mood }: { text: string; mood?: "win" | "lose" | "draw" | "go" | null }) {
  return (
    <div className={`board-say${mood ? ` ${mood}` : ""}`} role="status">
      {text}
    </div>
  );
}
