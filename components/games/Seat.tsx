"use client";

import { CSSProperties, ReactNode } from "react";
import { useTr } from "@/lib/i18n";
import type { Level } from "@/lib/live/solo";
import Crown from "./match/Crown";
import Portrait from "./match/Portrait";
import { useTable } from "./match/table";

/**
 * One player at a board: the other side sits above it and you below, and whoever is to move lights up. Inside a match
 * the seat shows who sits there as the pixel person they are in the café, says so while an agent is thinking, and
 * crowns the winner.
 */
export default function Seat({
  name,
  you,
  on,
  won,
  mark,
  clock,
  children,
}: {
  name: string;
  you?: boolean;
  /** this player is to move */
  on: boolean;
  won?: boolean;
  mark: ReactNode;
  /** their clock, in a game on one; it lights up in place of the to-move tag */
  clock?: ReactNode;
  /** what they have taken */
  children?: ReactNode;
}) {
  const t = useTr();
  const table = useTable();
  const who = table?.sitters.find((s) => s.you === !!you) ?? null;
  const mine = t("ти", "you");
  // someone with no name of their own is just called "you" (the café outside the cloud): said once, not twice
  const bare = you && ["ти", "you"].includes(name.trim().toLowerCase());
  const think = !!table?.thinking && !!who?.bot && on;
  const lost = !won && !!table?.outcome && table.outcome !== "drawn";
  const levels: Record<Level, string> = {
    easy: t("легко", "easy"),
    normal: t("нормально", "normal"),
    hard: t("складно", "hard"),
  };
  const level = who?.bot ? (table?.level ?? null) : null;
  return (
    <div
      className={`seat${on ? " on" : ""}${won ? " won" : ""}${lost ? " lost" : ""}${think ? " think" : ""}`}
      style={who ? ({ "--who": who.color } as CSSProperties) : undefined}
    >
      {who && (
        <span className="seat-face">
          {won && <Crown className="seat-crown" />}
          <Portrait look={who.look} bust />
        </span>
      )}
      <span className="seat-mark">{mark}</span>
      <span className="seat-name">
        {bare ? mine : name}
        {you && !bare && <em>{mine}</em>}
        {level && <em className={`seat-lvl ${level}`}>{levels[level]}</em>}
      </span>
      <span className="seat-took">{children}</span>
      {think && (
        <span className="seat-think">
          {t("думає", "thinking")}
          <i aria-hidden />
          <i aria-hidden />
          <i aria-hidden />
        </span>
      )}
      {on && !clock && !think && <span className="seat-turn">{t("ходить", "to move")}</span>}
      {won && <span className="seat-turn">{t("перемога", "winner")}</span>}
      {clock}
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
