"use client";

import { CSSProperties, ReactNode, useEffect, useRef } from "react";
import { useTr, useUi } from "@/lib/i18n";
import type { Level } from "@/lib/live/solo";
import type { Tally } from "@/lib/live/soloStore";
import { PixelNum } from "../Arcade";
import Crown from "./Crown";
import { agentLine } from "./lines";
import Portrait from "./Portrait";
import type { Series } from "./series";
import type { Outcome, Sitter } from "./table";

/** Where the card sits: beside a board, over a table, or under either when there is no room. */
export type Place = "side" | "over" | "under";

function Who({ s, won, name }: { s: Sitter; won: boolean; name: string }) {
  return (
    <div className={`mt-pair-p${won ? " won" : ""}`} style={{ "--c": s.color } as CSSProperties}>
      <span className="mt-pair-face">
        {won && <Crown />}
        <Portrait look={s.look} bust />
      </span>
      <span className="mt-pair-name">{name}</span>
    </div>
  );
}

/**
 * The result of a match, once the game has had its own last moment: won, lost or drawn in big letters, how it ended,
 * the score of this sitting between the faces, a line from the agent, and what to do next (the buttons are handed in,
 * so the asking and answering of a rematch stays where it always was).
 */
export default function ResultCard({
  game,
  outcome,
  how,
  sitters,
  level,
  series,
  tally,
  place,
  quiet,
  children,
}: {
  /** the match's id */
  game: string;
  outcome: Outcome;
  /** how it ended, or the score, in a few words */
  how: string | null;
  /** this screen's own player first */
  sitters: Sitter[];
  level: Level | null;
  /** this sitting's score against the same rival; none in a game for three */
  series: Series | null;
  /** all the games against the café's agents at this game, in a game against one */
  tally: Tally | null;
  place: Place;
  /** the board was opened on a game already over: the card is simply there */
  quiet: boolean;
  children: ReactNode;
}) {
  const ui = useUi();
  const t = useTr();
  const ref = useRef<HTMLDivElement>(null);
  // under a board on a small screen the card may land below the fold: bring it into view once
  useEffect(() => {
    if (place !== "under" || quiet) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ref.current?.scrollIntoView({ block: "nearest", behavior: calm ? "auto" : "smooth" });
  }, [place, quiet]);

  const word = {
    won: t("ПЕРЕМОГА", "VICTORY"),
    lost: t("ПОРАЗКА", "DEFEAT"),
    drawn: t("НІЧИЯ", "DRAW"),
  }[outcome];
  const me = sitters[0];
  const rivals = sitters.slice(1);
  const bot = rivals.length === 1 && rivals[0].bot ? rivals[0] : null;
  const line = bot && level ? agentLine(outcome, level, game)[ui] : null;
  const mine = t("ти", "you");
  const bare = me.you && ["ти", "you"].includes(me.name.trim().toLowerCase());
  const levels: Record<Level, string> = {
    easy: t("легко", "easy"),
    normal: t("нормально", "normal"),
    hard: t("складно", "hard"),
  };
  const all = tally && tally.won + tally.lost + tally.drawn > 1 ? tally : null;
  return (
    <div
      ref={ref}
      className={`mt-card ${outcome} ${place}${quiet ? " quiet" : ""}`}
      data-result={outcome}
      role="status"
      aria-label={how ? `${word}. ${how}` : word}
    >
      <div className="mt-verdict" aria-hidden>
        {[...word].map((ch, i) => (
          <b key={i} style={{ "--i": i } as CSSProperties}>
            {ch}
          </b>
        ))}
      </div>
      {how && <div className="mt-how">{how}</div>}
      <div className={`mt-pair${rivals.length > 1 ? " n3" : ""}`}>
        <Who s={me} won={outcome === "won"} name={bare ? mine : me.name} />
        {series && rivals.length === 1 ? (
          <div className="mt-pair-score">
            <small>{t("ця зустріч", "this sitting")}</small>
            <span>
              <PixelNum n={series.won} />
              <i>:</i>
              <PixelNum n={series.lost} />
            </span>
            {series.drawn > 0 && <em>{t(`нічиїх ${series.drawn}`, `${series.drawn} drawn`)}</em>}
          </div>
        ) : (
          <div className="mt-pair-score">
            <span>
              <i>VS</i>
            </span>
          </div>
        )}
        {rivals.map((s) => (
          <Who key={s.id} s={s} won={outcome === "lost" && rivals.length === 1} name={s.name} />
        ))}
      </div>
      {line && bot && (
        <p className="mt-line" style={{ "--c": bot.color } as CSSProperties}>
          <b>
            {bot.name}
            {level && <em className={level}>{levels[level]}</em>}
          </b>
          {line}
        </p>
      )}
      {all && (
        <div className="mt-tally">
          {t(
            `з агентами в цій грі за весь час: ${all.won} : ${all.lost}`,
            `all your games against agents here: ${all.won} : ${all.lost}`,
          )}
          {all.drawn > 0 && t(` · нічиїх ${all.drawn}`, ` · ${all.drawn} drawn`)}
        </div>
      )}
      {children}
    </div>
  );
}
