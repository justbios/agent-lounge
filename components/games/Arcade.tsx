"use client";

import { CSSProperties, ReactNode, RefObject } from "react";
import { tr, uiNow, useTr } from "@/lib/i18n";
import { FONT, MINE, THEIRS, THIRD } from "./fx";

/** How a match ended, for the card over the table. */
export interface Final {
  win: boolean;
  mine: number;
  theirs: number;
}

/** A number in the same 3×5 blocks as the scoreboards drawn on the tables: no pixel font mistakes a 5 for an S. */
export function PixelNum({ n }: { n: number }) {
  const text = String(n);
  return (
    <svg
      className="pxnum"
      viewBox={`0 0 ${text.length * 4 - 1} 5`}
      style={{ "--len": text.length } as CSSProperties}
      shapeRendering="crispEdges"
      role="img"
      aria-label={text}
    >
      {[...text].flatMap((ch, i) =>
        [...(FONT[ch.charCodeAt(0) - 48] ?? "")].flatMap((b, j) =>
          b === "1" ? [<rect key={`${i}-${j}`} x={i * 4 + (j % 3)} y={Math.floor(j / 3)} width={1} height={1} />] : [],
        ),
      )}
    </svg>
  );
}

/** The second other player in a game for three, on the scoreboard in pink. */
export interface HudThird {
  name: string;
  score: number;
}

/**
 * The scoreboard over an arcade game: you on the left in yellow, the other player on the right in blue, and in a
 * game for three the third one after them in pink.
 */
export function ArcadeHud({
  rival,
  winAt,
  mine,
  theirs,
  mineRef,
  theirsRef,
  third,
  thirdRef,
}: {
  rival: string;
  winAt: number;
  mine: number;
  theirs: number;
  mineRef: RefObject<HTMLElement | null>;
  theirsRef: RefObject<HTMLElement | null>;
  third?: HudThird;
  thirdRef?: RefObject<HTMLElement | null>;
}) {
  const t = useTr();
  return (
    <div className="arc-hud">
      <span className="arc-p" style={{ "--c": MINE } as CSSProperties}>
        <i aria-hidden />
        <span className="arc-name">{t("ти", "you")}</span>
        <b ref={mineRef}>
          <PixelNum n={mine} />
        </b>
      </span>
      <span className="arc-to">{t(`до ${winAt}`, `to ${winAt}`)}</span>
      <span className="arc-p them" style={{ "--c": THEIRS } as CSSProperties}>
        <i aria-hidden />
        <span className="arc-name">{rival}</span>
        <b ref={theirsRef}>
          <PixelNum n={theirs} />
        </b>
      </span>
      {third && (
        <span className="arc-p them" style={{ "--c": THIRD } as CSSProperties}>
          <i aria-hidden />
          <span className="arc-name">{third.name}</span>
          <b ref={thirdRef}>
            <PixelNum n={third.score} />
          </b>
        </span>
      )}
    </div>
  );
}

/** How a game reaches the other players, for the corner of the table: straight or through the server, and how fast. */
export function lineSay(link: { direct: boolean; rtt: number }): string {
  const ms = Math.round(link.rtt);
  return link.direct
    ? tr(uiNow(), `напряму · ${ms} мс`, `direct · ${ms} ms`)
    : tr(uiNow(), `через сервер · ${ms} мс`, `via server · ${ms} ms`);
}

/**
 * The table, the big words that pop up over it and, once the match is over, the result on top. `lineRef` is the
 * corner a real-time game writes its line to the other players in.
 */
export function ArcadeScreen({
  popRef,
  final,
  rival,
  lineRef,
  children,
}: {
  popRef: RefObject<HTMLDivElement | null>;
  final: Final | null;
  rival: string;
  lineRef?: RefObject<HTMLSpanElement | null>;
  children: ReactNode;
}) {
  const t = useTr();
  return (
    <div className="arc-screen">
      {children}
      {lineRef && <span className="arc-line" ref={lineRef} />}
      <div className="arc-pop" ref={popRef} aria-hidden />
      {final && (
        <div className={`arc-end ${final.win ? "win" : "lose"}`}>
          <b>{final.win ? t("Перемога!", "You win!") : t("Поразка", "You lost")}</b>
          <span className="arc-final">
            <PixelNum n={final.mine} />
            <i>:</i>
            <PixelNum n={final.theirs} />
          </span>
          <small>{final.win ? t(`проти ${rival}`, `against ${rival}`) : t(`перемога: ${rival}`, `${rival} wins`)}</small>
        </div>
      )}
    </div>
  );
}

/** The line under the scoreboard: what's on, or why the game stopped. */
export function ArcadeSay({ children }: { children: ReactNode }) {
  return (
    <div className="arc-say" role="status">
      {children}
    </div>
  );
}
