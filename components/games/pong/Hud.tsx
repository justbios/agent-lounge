"use client";

import { CSSProperties } from "react";
import { useTr } from "@/lib/i18n";
import { MINE, THEIRS } from "../fx";

function Plate({
  name,
  color,
  score,
  winAt,
  point,
  them,
}: {
  name: string;
  color: string;
  score: number;
  winAt: number;
  /** this player is one point from winning */
  point: boolean;
  them?: boolean;
}) {
  const t = useTr();
  return (
    <span
      className={`arc-p ping-p${them ? " them" : ""}${point ? " point" : ""}`}
      style={{ "--c": color } as CSSProperties}
      role="img"
      aria-label={t(`${name}: ${score} з ${winAt}`, `${name}: ${score} of ${winAt}`)}
    >
      <i aria-hidden />
      <span className="arc-name" aria-hidden>
        {name}
      </span>
      <span className="ping-pips" aria-hidden>
        {Array.from({ length: winAt }, (_, i) => (
          <span key={i} className={i < score ? "on" : i === score && point ? "next" : undefined} />
        ))}
      </span>
    </span>
  );
}

/**
 * The scoreboard over the ping-pong table: each player's name and a lamp for every point they need, lit one by one
 * towards the middle. The digits themselves are on the table; here it is how far there is to go. The lamp a player
 * at match point still needs blinks.
 */
export function PingHud({
  rival,
  winAt,
  mine,
  theirs,
  match,
}: {
  rival: string;
  winAt: number;
  mine: number;
  theirs: number;
  /** who is a point from winning: 1 you, 2 the other player, 3 both, 0 nobody */
  match: number;
}) {
  const t = useTr();
  return (
    <div className="arc-hud ping-hud">
      <Plate name={t("ти", "you")} color={MINE} score={mine} winAt={winAt} point={(match & 1) > 0} />
      <span className="arc-to">{t(`до ${winAt}`, `to ${winAt}`)}</span>
      <Plate name={rival} color={THEIRS} score={theirs} winAt={winAt} point={(match & 2) > 0} them />
    </div>
  );
}
