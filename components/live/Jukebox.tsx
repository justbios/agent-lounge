"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { Keyboard, Link2, Music, Pause, Play } from "lucide-react";
import { trackKey } from "@/lib/live/achievements";
import { TRACKS, TrackId, trackInfo } from "@/lib/live/tracks";
import { parseTune, tuneSource, tuneSyncs } from "@/lib/live/tune";
import { CafeSound } from "@/lib/live/useCafeSound";

const NOT_A_LINK = "Це не схоже на посилання з YouTube, YouTube Music чи Spotify.";

/** What the jukebox plays, in a few words: the record's name, or where the link's music comes from. */
export const playingName = (s: CafeSound) => (s.tune ? tuneSource(s.tune) : trackInfo(s.track).name);

function TuneForm({ sound }: { sound: CafeSound }) {
  const id = useId();
  const [url, setUrl] = useState("");
  const [bad, setBad] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = parseTune(url);
    setBad(!t);
    if (!t) return;
    sound.playTune(t);
    setUrl("");
  };
  return (
    <form className="tune-form" onSubmit={submit}>
      <label htmlFor={id}>Своя музика з YouTube, YouTube Music або Spotify</label>
      <div className="key-paste-row">
        <input
          id={id}
          value={url}
          inputMode="url"
          autoComplete="off"
          placeholder="встав посилання на пісню чи плейлист"
          onChange={(e) => {
            setUrl(e.target.value);
            setBad(false);
          }}
        />
        <button className="btn" disabled={!url.trim()}>
          поставити
        </button>
      </div>
      {bad && <span className="key-paste-bad">{NOT_A_LINK}</span>}
    </form>
  );
}

function TuneRow({ sound }: { sound: CafeSound }) {
  const t = sound.tune;
  if (!t) return null;
  const why = tuneSyncs(t) ? "всі чують з тієї ж секунди" : "кожен слухає з початку";
  return (
    <li>
      <button className={`juke-row picked ${sound.on ? "on" : ""}`} onClick={sound.toggle} aria-pressed={sound.on}>
        <span className="juke-ic" aria-hidden>
          <Link2 size={15} />
        </span>
        <span className="juke-name">
          <b>{tuneSource(t)}</b>
          <small>{sound.by ? `ставить ${sound.by}` : why}</small>
        </span>
        {sound.on ? (
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
}

/** The jukebox's records: a click plays one, a click on the playing one pauses it. */
/** `open`: the records this room's achievements let it put on; one already playing can always be heard. */
export function JukeboxList({ sound, open }: { sound: CafeSound; open?: Set<TrackId> }) {
  return (
    <div className="juke">
      {sound.shared && (
        <p className="juke-hint">
          {sound.canPick
            ? "Платівка спільна: її чують усі в кафе, у кого ввімкнено звук."
            : "Платівку ставить команда кафе, тут її можна лише слухати."}
        </p>
      )}
      <ul className="juke-list">
        <TuneRow sound={sound} />
        {TRACKS.map((t) => {
          const picked = !sound.tune && sound.track === t.id;
          const playing = sound.on && picked;
          const key = open && !open.has(t.id) && !picked ? trackKey(t.id) : null;
          return (
            <li key={t.id}>
              <button
                className={`juke-row ${picked ? "picked" : ""} ${playing ? "on" : ""}`}
                onClick={() => (playing || (picked && !sound.canPick) ? sound.toggle() : sound.play(t.id))}
                disabled={(!sound.canPick && !picked) || !!key}
                aria-pressed={playing}
              >
                <span className="juke-ic" aria-hidden>
                  {t.icon}
                </span>
                <span className="juke-name">
                  <b>{t.name}</b>
                  <small>
                    {picked && sound.by ? `ставить ${sound.by}` : key ? `🔒 відкриє «${key.title}»` : t.mood}
                  </small>
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
      {sound.canPick && <TuneForm sound={sound} />}
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
      <label className="juke-clicks">
        <input type="checkbox" checked={sound.clicks} onChange={sound.toggleClicks} />
        <Keyboard size={14} aria-hidden />
        стукіт клавіатури, поки агенти працюють
      </label>
    </div>
  );
}

/** The jukebox from the top bar, for when the café has none standing or it is out of view. */
export default function JukeboxMenu({ sound, tracks }: { sound: CafeSound; tracks?: Set<TrackId> }) {
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
        title={sound.on ? `грає: ${playingName(sound)}` : "музичний автомат"}
      >
        <Music size={14} />
      </button>
      {open && (
        <div className="alerts-pop" role="dialog" aria-label="музичний автомат">
          <div className="share-ttl">Музичний автомат</div>
          <JukeboxList sound={sound} open={tracks} />
        </div>
      )}
    </div>
  );
}
