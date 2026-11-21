"use client";

import { CSSProperties, useEffect, useState } from "react";
import { CafeLayout } from "@/lib/cafe/layout";
import { useUi } from "@/lib/i18n";
import { noteVisitor, visitAt, visitorText } from "@/lib/live/visitors";
import { visitorFrame, visitorSeat } from "./visitor";

const TICK_MS = 5_000;

/**
 * The name over a rare visitor once it sits down, looked up every few seconds; the first time this browser sees a kind
 * of visitor on screen, the guest book notes it.
 */
export default function VisitorTag({
  lay,
  guests,
  on,
  pos,
}: {
  lay: CafeLayout;
  guests: number;
  on: boolean;
  pos: (x: number, y: number) => CSSProperties;
}) {
  const ui = useUi();
  const [at, setAt] = useState(0);
  useEffect(() => {
    if (!on) return;
    const first = setTimeout(() => setAt(Date.now()), 0);
    const id = setInterval(() => setAt(Date.now()), TICK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [on]);

  const visit = on && at ? visitAt(at) : null;
  const seat = visit ? visitorSeat(guests) : null;
  const sat = visit && seat && !visitorFrame(lay, visit, seat, at).walking ? visit.kind : null;

  useEffect(() => {
    if (sat && document.visibilityState === "visible") noteVisitor(sat, at);
  }, [sat, at]);

  if (!sat || !seat) return null;
  const v = visitorText(sat, ui);
  return (
    <span className="cafe-guest visitor" style={pos(seat.x, seat.y - 13)}>
      {v.icon} {v.name.toLowerCase()}
    </span>
  );
}
