"use client";

import { useLayoutEffect, useRef } from "react";
import { Look, drawPerson } from "../../cafe/people";

const W = 14;
const FULL = 24;
const BUST = 13;

/** the pictures already drawn, by look: a face is drawn once however many seats and cards show it */
const drawn = new Map<string, string>();

function picture(look: Look, bust: boolean): string {
  const key = `${bust ? "bust" : "full"}:${JSON.stringify(look)}`;
  const known = drawn.get(key);
  if (known !== undefined) return known;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = bust ? BUST : FULL;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  // the feet stand two rows above the bottom of the whole figure; a bust lets everything under the shoulders fall off
  drawPerson(ctx, W / 2, FULL - 2 - (bust ? 3 : 0), look, { dir: "down", step: 0, carrying: false });
  const url = canvas.toDataURL();
  drawn.set(key, url);
  return url;
}

/**
 * One of the café's pixel people facing you: the whole figure, or only head and shoulders for a seat. Drawn at the
 * café's own pixel size and shown as a picture that CSS scales up; it is not a canvas on the page, so a game's own
 * canvas stays the only one on its board.
 */
export default function Portrait({
  look,
  bust,
  label,
  className,
}: {
  look: Look;
  bust?: boolean;
  label?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.style.backgroundImage = `url(${picture(look, !!bust)})`;
  }, [look, bust]);
  return (
    <span
      ref={ref}
      className={`mt-who${bust ? " bust" : ""}${className ? ` ${className}` : ""}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
