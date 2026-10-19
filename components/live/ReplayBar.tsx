"use client";

import { RotateCcw, Square, X } from "lucide-react";
import { useTr } from "@/lib/i18n";
import { REPLAY_SPEED, Replay } from "@/lib/live/replay";
import { clockTime } from "./format";

export default function ReplayBar({
  replay,
  playing,
  shown,
  onStop,
  onAgain,
}: {
  replay: Replay;
  playing: boolean;
  shown: number;
  onStop: () => void;
  onAgain: () => void;
}) {
  const t = useTr();
  return (
    <span className="replay-bar">
      {playing ? (
        <>
          <span className="rec-dot replay-dot" /> {t("повтор", "replay")} {REPLAY_SPEED}× ·{" "}
          {clockTime(replay.real[shown - 1])}
          <button className="btn" onClick={onStop} aria-label={t("зупинити повтор", "stop replay")}>
            <Square size={12} />
          </button>
        </>
      ) : (
        <>
          {t("повтор закінчився", "replay over")}
          <button className="btn" onClick={onAgain} aria-label={t("ще раз", "again")}>
            <RotateCcw size={12} />
          </button>
          <button className="btn" onClick={onStop} aria-label={t("закрити повтор", "close replay")}>
            <X size={12} />
          </button>
        </>
      )}
    </span>
  );
}
