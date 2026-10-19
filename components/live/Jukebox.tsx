"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { Keyboard, Link2, Music, Pause, Play } from "lucide-react";
import { Two, Ui, tr, useTr, useUi } from "@/lib/i18n";
import { achText, trackKey } from "@/lib/live/achievements";
import { TRACKS, TrackId, trackInfo, trackText } from "@/lib/live/tracks";
import { LINKED, LinkedRecord, linkedOf, parseTune, sameTune, tuneName, tuneSyncs } from "@/lib/live/tune";
import { CafeSound } from "@/lib/live/useCafeSound";

const NOT_A_LINK: Two = {
  uk: "Це не схоже на посилання з YouTube, YouTube Music чи Spotify.",
  en: "That doesn't look like a YouTube, YouTube Music or Spotify link.",
};

/** What the jukebox plays, in a few words: the record's name, or where the link's music comes from. */
export const playingName = (s: CafeSound, ui: Ui = "uk") =>
  s.tune ? tuneName(s.tune, ui) : trackText(trackInfo(s.track), ui).name;

/** Who put the record on, under its name. */
const putOnBy = (ui: Ui, by: string) => tr(ui, `ставить ${by}`, `put on by ${by}`);

function TuneForm({ sound }: { sound: CafeSound }) {
  const ui = useUi();
  const t = useTr();
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
      <label htmlFor={id}>
        {t("Своя музика з YouTube, YouTube Music або Spotify", "Your own music from YouTube, YouTube Music or Spotify")}
      </label>
      <div className="key-paste-row">
        <input
          id={id}
          value={url}
          inputMode="url"
          autoComplete="off"
          placeholder={t("встав посилання на пісню чи плейлист", "paste a link to a song or playlist")}
          onChange={(e) => {
            setUrl(e.target.value);
            setBad(false);
          }}
        />
        <button className="btn" disabled={!url.trim()}>
          {t("поставити", "play")}
        </button>
      </div>
      {bad && <span className="key-paste-bad">{NOT_A_LINK[ui]}</span>}
    </form>
  );
}

function TuneRow({ sound }: { sound: CafeSound }) {
  const ui = useUi();
  const t = sound.tune;
  if (!t || linkedOf(t)) return null;
  const why = tuneSyncs(t)
    ? tr(ui, "всі чують з тієї ж секунди", "everyone hears it from the same second")
    : tr(ui, "кожен слухає з початку", "everyone starts from the beginning");
  return (
    <li>
      <button className={`juke-row picked ${sound.on ? "on" : ""}`} onClick={sound.toggle} aria-pressed={sound.on}>
        <span className="juke-ic" aria-hidden>
          <Link2 size={15} />
        </span>
        <span className="juke-name">
          <b>{tuneName(t, ui)}</b>
          <small>{sound.by ? putOnBy(ui, sound.by) : why}</small>
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

function LinkedRow({ sound, r }: { sound: CafeSound; r: LinkedRecord }) {
  const ui = useUi();
  const picked = sameTune(sound.tune, r.tune);
  const playing = sound.on && picked;
  return (
    <li>
      <button
        className={`juke-row ${picked ? "picked" : ""} ${playing ? "on" : ""}`}
        onClick={() => (playing || (picked && !sound.canPick) ? sound.toggle() : sound.playTune(r.tune))}
        disabled={!sound.canPick && !picked}
        aria-pressed={playing}
      >
        <span className="juke-ic" aria-hidden>
          {r.icon}
        </span>
        <span className="juke-name">
          <b>{r.name}</b>
          <small>
            {picked && sound.by
              ? putOnBy(ui, sound.by)
              : tr(ui, `${r.by} · грає з YouTube`, `${r.by} · plays from YouTube`)}
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
}

/** The jukebox's records: a click plays one, a click on the playing one pauses it. */
/** `open`: the records this room's achievements let it put on; one already playing can always be heard. */
export function JukeboxList({ sound, open }: { sound: CafeSound; open?: Set<TrackId> }) {
  const ui = useUi();
  const t = useTr();
  return (
    <div className="juke">
      {sound.shared && (
        <p className="juke-hint">
          {sound.canPick
            ? t(
                "Платівка спільна: її чують усі в кафе, у кого ввімкнено звук.",
                "The record is shared: everyone in the café with sound on hears it.",
              )
            : t(
                "Платівку ставить команда кафе, тут її можна лише слухати.",
                "The café's team picks the record; here you can only listen.",
              )}
        </p>
      )}
      <ul className="juke-list">
        <TuneRow sound={sound} />
        {TRACKS.map((rec) => {
          const picked = !sound.tune && sound.track === rec.id;
          const playing = sound.on && picked;
          const key = open && !open.has(rec.id) && !picked ? trackKey(rec.id) : null;
          const text = trackText(rec, ui);
          return (
            <li key={rec.id}>
              <button
                className={`juke-row ${picked ? "picked" : ""} ${playing ? "on" : ""}`}
                onClick={() => (playing || (picked && !sound.canPick) ? sound.toggle() : sound.play(rec.id))}
                disabled={(!sound.canPick && !picked) || !!key}
                aria-pressed={playing}
              >
                <span className="juke-ic" aria-hidden>
                  {rec.icon}
                </span>
                <span className="juke-name">
                  <b>{text.name}</b>
                  <small>
                    {picked && sound.by
                      ? putOnBy(ui, sound.by)
                      : key
                        ? t(`🔒 відкриє «${achText(key, ui).title}»`, `🔒 unlocked by “${achText(key, ui).title}”`)
                        : text.mood}
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
        {LINKED.map((r) => (
          <LinkedRow key={r.id} sound={sound} r={r} />
        ))}
      </ul>
      {sound.canPick && <TuneForm sound={sound} />}
      <div className="juke-ctl">
        <button
          className="btn btn-ic"
          onClick={sound.toggle}
          title={sound.on ? t("пауза", "pause") : t("грати", "play")}
        >
          {sound.on ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={sound.vol}
          aria-label={t("гучність", "volume")}
          onChange={(e) => sound.setVol(parseFloat(e.target.value))}
        />
      </div>
      <label className="juke-clicks">
        <input type="checkbox" checked={sound.clicks} onChange={sound.toggleClicks} />
        <Keyboard size={14} aria-hidden />
        {t("стукіт клавіатури, поки агенти працюють", "keyboard clatter while agents work")}
      </label>
    </div>
  );
}

/** The jukebox from the top bar, for when the café has none standing or it is out of view. */
export default function JukeboxMenu({ sound, tracks }: { sound: CafeSound; tracks?: Set<TrackId> }) {
  const ui = useUi();
  const t = useTr();
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
        title={
          sound.on
            ? t(`грає: ${playingName(sound, ui)}`, `playing: ${playingName(sound, ui)}`)
            : t("музичний автомат", "jukebox")
        }
      >
        <Music size={14} />
      </button>
      {open && (
        <div className="alerts-pop" role="dialog" aria-label={t("музичний автомат", "jukebox")}>
          <div className="share-ttl">{t("Музичний автомат", "Jukebox")}</div>
          <JukeboxList sound={sound} open={tracks} />
        </div>
      )}
    </div>
  );
}
