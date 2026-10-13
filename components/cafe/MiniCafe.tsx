"use client";

import { useEffect, useMemo, useRef } from "react";
import { cafeLayout } from "@/lib/cafe/layout";
import { CafeModel } from "@/lib/cafe/model";
import { buildTimeline } from "@/lib/cafe/timeline";
import { Interior } from "@/lib/live/interior";
import { DecorSet } from "./decor";
import { drawFrame } from "./frame";
import { lookFor, pickedLook } from "./people";
import { standing } from "./placement";
import { buildRoom } from "./room";
import { Theme } from "./theme";

const FRAME_MS = 125;
const NO_DECOR: DecorSet = new Set();

/** One room of the house: the same café drawn small and a few times a second, with no names or bubbles over it. */
export default function MiniCafe({
  model,
  origin,
  theme,
  decor,
  interior,
  alert,
}: {
  model: CafeModel;
  /** when the chat's clock starts */
  origin: number;
  theme: Theme;
  decor?: DecorSet;
  interior: Interior;
  alert?: { agent: number; kind: "ask" | "done" } | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const alertRef = useRef(alert);
  const lay = useMemo(() => cafeLayout(model.agents.length, model.seed), [model.agents.length, model.seed]);
  const tl = useMemo(() => buildTimeline(model), [model]);

  useEffect(() => {
    alertRef.current = alert;
  }, [alert]);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const looks = interior.looks;
    const faces = model.agents.map((a, i) => lookFor(a.look ?? i, a.color, pickedLook(looks[a.id])));
    const room = buildRoom(lay, model.agents, model.seed, theme, model.agents.map((a) => looks[a.id]?.prop));
    const furniture = standing(lay, interior.placed, decor ?? NO_DECOR);
    const draw = () => {
      const a = alertRef.current;
      drawFrame(ctx, {
        model,
        lay,
        tl,
        looks: faces,
        room,
        clock: Date.now() - origin,
        t: performance.now() / 1000,
        alert: a ?? undefined,
        decor,
        theme,
        furniture,
      });
    };
    draw();
    const id = setInterval(draw, FRAME_MS);
    return () => clearInterval(id);
  }, [model, lay, tl, origin, theme, decor, interior]);

  return <canvas ref={ref} width={lay.width} height={lay.height} aria-hidden />;
}
