"use client";

import { CSSProperties, RefObject, useState } from "react";
import { useTr } from "@/lib/i18n";
import { HEAT_TOP } from "@/lib/live/hockey";
import { FONT, MINE, THEIRS } from "../fx";

/** One digit in the 3×5 blocks the arcade tables count in. */
function Digit({ n }: { n: number }) {
  const g = FONT[n] ?? FONT[0];
  return (
    <svg className="hk-digit" viewBox="0 0 3 5" shapeRendering="crispEdges" aria-hidden>
      {[...g].flatMap((b, j) => (b === "1" ? [<rect key={j} x={j % 3} y={Math.floor(j / 3)} width={1} height={1} />] : []))}
    </svg>
  );
}

/** A score on a split flap: when it changes, the old top half folds down and the new bottom half drops over the old. */
function Flip({ n }: { n: number }) {
  const [shown, setShown] = useState({ now: n, was: n, turn: 0 });
  if (shown.now !== n) setShown({ now: n, was: shown.now, turn: shown.turn + 1 });
  return (
    <span className="hk-flip" key={shown.turn}>
      <span>
        <Digit n={shown.now} />
      </span>
      {shown.turn > 0 && (
        <>
          <span className="hk-was-bot">
            <Digit n={shown.was} />
          </span>
          <span className="hk-was-top">
            <Digit n={shown.was} />
          </span>
          <span className="hk-now-bot">
            <Digit n={shown.now} />
          </span>
        </>
      )}
    </span>
  );
}

function Side({ name, score, winAt, color, them, state }: { name: string; score: number; winAt: number; color: string; them?: boolean; state: "" | "won" | "lost" }) {
  return (
    <div className={`hk-side${them ? " them" : ""}${state ? ` ${state}` : ""}`} style={{ "--c": color } as CSSProperties}>
      <span className="hk-who">
        <i aria-hidden />
        <span className="hk-name">{name}</span>
      </span>
      <span className="hk-pips" aria-hidden>
        {Array.from({ length: winAt }, (_, k) => (
          <i key={k} className={k < score ? "on" : k === score && score === winAt - 1 && !state ? "next" : undefined} />
        ))}
      </span>
    </div>
  );
}

/**
 * The board over the rink: each side's name and a lamp for every goal it has, the two scores on split flaps between
 * them, and under «до 5» the gauge of how warm the puck is. The game writes the gauge straight to `heatRef` as it
 * plays, so the board is not rendered again for it.
 */
export function Scoreboard({
  rival,
  winAt,
  mine,
  theirs,
  won,
  mineRef,
  theirsRef,
  heatRef,
}: {
  rival: string;
  winAt: number;
  mine: number;
  theirs: number;
  /** null while the match is on */
  won: boolean | null;
  mineRef: RefObject<HTMLElement | null>;
  theirsRef: RefObject<HTMLElement | null>;
  heatRef: RefObject<HTMLSpanElement | null>;
}) {
  const t = useTr();
  return (
    <div className="hk-board">
      <Side name={t("ти", "you")} score={mine} winAt={winAt} color={MINE} state={won === null ? "" : won ? "won" : "lost"} />
      <div className="hk-mid">
        <b ref={mineRef} style={{ "--c": MINE } as CSSProperties} aria-label={t(`твої голи: ${mine}`, `your goals: ${mine}`)}>
          <Flip n={mine} />
        </b>
        <span className="hk-to">
          <small>{t(`до ${winAt}`, `to ${winAt}`)}</small>
          <span className="hk-heat" ref={heatRef} role="img" aria-label={t("наскільки нагрілась шайба", "how warm the puck is")}>
            {Array.from({ length: HEAT_TOP }, (_, k) => (
              <i key={k} style={{ "--i": k } as CSSProperties} />
            ))}
          </span>
        </span>
        <b ref={theirsRef} style={{ "--c": THEIRS } as CSSProperties} aria-label={t(`голи суперника: ${theirs}`, `their goals: ${theirs}`)}>
          <Flip n={theirs} />
        </b>
      </div>
      <Side name={rival} score={theirs} winAt={winAt} color={THEIRS} them state={won === null ? "" : won ? "lost" : "won"} />
    </div>
  );
}
