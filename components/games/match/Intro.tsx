"use client";

import { CSSProperties, Fragment, useEffect, useState } from "react";
import { useTr, useUi } from "@/lib/i18n";
import { DuelKind, duelName } from "@/lib/live/duel";
import type { Level } from "@/lib/live/solo";
import { matchSfx } from "@/lib/live/sounds/match";
import { INTRO_MS } from "../beats";
import Portrait from "./Portrait";
import { Sitter } from "./table";

/** the VS lands this long into the opening: the same beat as in the stylesheet */
const VS_MS = INTRO_MS * 0.2;

/** when each match on this page was first shown, so its opening plays once and never starts over */
const born = new Map<string, number>();

/**
 * The opening of a match: the sides shown against each other over the board, the game's name above them and a VS that
 * lands between. It is only a picture: it takes no clicks, holds nothing back, and is gone by `INTRO_MS`. A match that
 * was already under way when it was first seen (`late`) opens without it.
 */
export default function Intro({
  game,
  kind,
  sitters,
  level,
  clock,
  late,
}: {
  /** the match's id */
  game: string;
  kind: DuelKind;
  /** this screen's own player first */
  sitters: Sitter[];
  level: Level | null;
  /** seconds a side, in a game on a clock */
  clock?: number;
  late: boolean;
}) {
  const ui = useUi();
  const t = useTr();
  // how far into its opening this match already is: a board closed and opened again picks it up, or finds it over
  const [skip] = useState(() => {
    const now = performance.now();
    const t0 = born.get(game);
    if (t0 !== undefined) return Math.min(INTRO_MS, now - t0);
    born.set(game, late ? now - INTRO_MS : now);
    return late ? INTRO_MS : 0;
  });
  const [gone, setGone] = useState(skip >= INTRO_MS);
  useEffect(() => {
    if (skip >= INTRO_MS) return;
    const timers = [window.setTimeout(() => setGone(true), INTRO_MS - skip)];
    if (skip < VS_MS) {
      if (skip < 60) matchSfx.swish();
      timers.push(window.setTimeout(matchSfx.vs, VS_MS - skip));
    }
    return () => timers.forEach(clearTimeout);
  }, [skip]);
  if (gone) return null;

  const levels: Record<Level, string> = {
    easy: t("легко", "easy"),
    normal: t("нормально", "normal"),
    hard: t("складно", "hard"),
  };
  const mine = t("ти", "you");
  return (
    <div
      className={`mt-intro${sitters.length > 2 ? " n3" : ""}`}
      style={{ "--skip": `${-Math.round(skip)}ms` } as CSSProperties}
      aria-hidden
    >
      <div className="mt-intro-dim" />
      <div className="mt-intro-title">
        <b>{duelName(kind, ui)}</b>
        {!!clock && <span>{t(`${clock / 60} хв`, `${clock / 60} min`)}</span>}
      </div>
      <div className="mt-intro-row">
        {sitters.map((s, i) => {
          // someone with no name of their own is just called "you": said once, not twice
          const bare = s.you && ["ти", "you"].includes(s.name.trim().toLowerCase());
          return (
            <Fragment key={s.id}>
              {i > 0 && (
                <span className="mt-vs">
                  <b>VS</b>
                </span>
              )}
              <div className={`mt-side ${i === 0 ? "a" : "b"}`} style={{ "--c": s.color } as CSSProperties}>
                <span className="mt-side-art">
                  <Portrait look={s.look} />
                </span>
                <b className="mt-side-name">{bare ? mine : s.name}</b>
                {s.bot ? (
                  <span className={`mt-side-tag${level ? ` ${level}` : ""}`}>
                    {t("агент", "agent")}
                    {level && <em>{levels[level]}</em>}
                  </span>
                ) : (
                  !bare && <span className="mt-side-tag">{s.you ? mine : t("гість", "guest")}</span>
                )}
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
