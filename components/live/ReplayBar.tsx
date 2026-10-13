import { RotateCcw, Square, X } from "lucide-react";
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
  return (
    <span className="replay-bar">
      {playing ? (
        <>
          <span className="rec-dot replay-dot" /> повтор {REPLAY_SPEED}× · {clockTime(replay.real[shown - 1])}
          <button className="btn" onClick={onStop} aria-label="зупинити повтор">
            <Square size={12} />
          </button>
        </>
      ) : (
        <>
          повтор закінчився
          <button className="btn" onClick={onAgain} aria-label="ще раз">
            <RotateCcw size={12} />
          </button>
          <button className="btn" onClick={onStop} aria-label="закрити повтор">
            <X size={12} />
          </button>
        </>
      )}
    </span>
  );
}
