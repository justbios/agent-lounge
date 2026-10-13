"use client";

import { useEffect, useRef, useState } from "react";
import { Music, Pause, Play } from "lucide-react";
import { TRACKS, trackInfo } from "@/lib/live/tracks";
import { CafeSound } from "@/lib/live/useCafeSound";

/** The jukebox's records: a click plays one, a click on the playing one pauses it. */
export function JukeboxList({ sound }: { sound: CafeSound }) {
  return (
    <div className="juke">
      <ul className="juke-list">
        {TRACKS.map((t) => {
          const playing = sound.on && sound.track === t.id;
          return (
            <li key={t.id}>
              <button
                className={`juke-row ${sound.track === t.id ? "picked" : ""} ${playing ? "on" : ""}`}
                onClick={() => (playing ? sound.toggle() : sound.play(t.id))}
                aria-pressed={playing}
              >
                <span className="juke-ic" aria-hidden>
                  {t.icon}
                </span>
                <span className="juke-name">
                  <b>{t.name}</b>
                  <small>{t.mood}</small>
                </span>
                {playing ? (
                  <span className="juke-eq" aria-hidden>
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  <Play size={13} className="juke-play" aria-hidden />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="juke-ctl">
        <button className="btn btn-ic" onClick={sound.toggle} title={sound.on ? "пауза" : "грати"}>
          {sound.on ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={sound.vol}
          aria-label="гучність"
          onChange={(e) => sound.setVol(parseFloat(e.target.value))}
        />
      </div>
    </div>
  );
}

/** The jukebox from the top bar, for when the café has none standing or it is out of view. */
export default function JukeboxMenu({ sound }: { sound: CafeSound }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="alerts" ref={box}>
      <button
        className={`btn btn-ic ${sound.on ? "on" : ""}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title={sound.on ? `грає: ${trackInfo(sound.track).name}` : "музичний автомат"}
      >
        <Music size={14} />
      </button>
      {open && (
        <div className="alerts-pop" role="dialog" aria-label="музичний автомат">
          <div className="share-ttl">Музичний автомат</div>
          <JukeboxList sound={sound} />
        </div>
      )}
    </div>
  );
}
