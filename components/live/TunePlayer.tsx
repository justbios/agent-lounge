"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { SpotifyController, YTPlayer, spotifyApi, youTubeApi } from "@/lib/live/embedApi";
import { Tune, tuneSource, tuneSyncs } from "@/lib/live/tune";
import { CafeSound } from "@/lib/live/useCafeSound";

type Fail = "load" | "embed";

const FAILS: Record<Fail, string> = {
  load: "Плеєр не завантажився: можливо, його блокує розширення браузера.",
  embed: "Власник цієї музики не дозволяє грати її на інших сайтах. Відкрий її за посиланням.",
};

/** Where the café is in the song: seconds since it was put on, around again once it has played through. */
const offsetOf = (at: number, duration: number) => {
  const s = Math.max(0, (Date.now() - at) / 1000);
  return duration > 0 ? s % duration : s;
};

const tuneUrl = (t: Tune) => {
  if (t.kind === "spotify") return `https://open.spotify.com/${t.type}/${t.id}`;
  if (!t.video) return `https://www.youtube.com/playlist?list=${t.list}`;
  return `https://www.youtube.com/watch?v=${t.video}${t.list ? `&list=${t.list}` : ""}`;
};

/** A node of its own for the embed to replace with its iframe, so React's own node stays put. */
function mount(box: HTMLDivElement | null) {
  const host = document.createElement("div");
  box?.appendChild(host);
  return host;
}

function YouTubeTune({ tune, at, vol, onFail }: { tune: Tune; at: number; vol: number; onFail: (f: Fail) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const volRef = useRef(vol);

  useEffect(() => {
    volRef.current = vol;
    player.current?.setVolume(Math.round(vol * 100));
  }, [vol]);

  useEffect(() => {
    if (tune.kind !== "youtube") return;
    let gone = false;
    let made: YTPlayer | null = null;
    const host = mount(box.current);
    const loop = !!tune.video && !tune.list;
    youTubeApi().then(
      (YT) => {
        if (gone) return;
        made = new YT.Player(host, {
          width: "100%",
          height: "100%",
          videoId: tune.video,
          playerVars: {
            autoplay: 1,
            playsinline: 1,
            rel: 0,
            ...(tune.list && { listType: "playlist", list: tune.list }),
          },
          events: {
            onReady: (e: { target: YTPlayer }) => {
              player.current = e.target;
              e.target.setVolume(Math.round(volRef.current * 100));
              if (tuneSyncs(tune)) e.target.seekTo(offsetOf(at, e.target.getDuration()), true);
              e.target.playVideo();
            },
            onStateChange: (e: { target: YTPlayer; data: number }) => {
              if (!loop || e.data !== YT.PlayerState.ENDED) return;
              e.target.seekTo(0, true);
              e.target.playVideo();
            },
            onError: () => onFail("embed"),
          },
        });
      },
      () => !gone && onFail("load"),
    );
    return () => {
      gone = true;
      player.current = null;
      made?.destroy();
      host.remove();
    };
  }, [tune, at, onFail]);

  return <div className="tune-frame tune-yt" ref={box} />;
}

function SpotifyTune({ tune, at, onFail }: { tune: Tune; at: number; onFail: (f: Fail) => void }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tune.kind !== "spotify") return;
    let gone = false;
    let made: SpotifyController | null = null;
    const host = mount(box.current);
    spotifyApi().then(
      (api) =>
        !gone &&
        api.createController(host, { uri: `spotify:${tune.type}:${tune.id}`, width: "100%", height: 152 }, (c) => {
          if (gone) return c.destroy();
          made = c;
          let synced = !tuneSyncs(tune);
          c.addListener("ready", () => c.play());
          c.addListener("playback_update", (e) => {
            if (synced || !e.data.duration) return;
            synced = true;
            c.seek(offsetOf(at, e.data.duration / 1000));
          });
        }),
      () => !gone && onFail("load"),
    );
    return () => {
      gone = true;
      made?.destroy();
      host.remove();
    };
  }, [tune, at, onFail]);

  return <div className="tune-frame tune-sp" ref={box} />;
}

/** The player for music from a link, docked in the corner while it plays: everyone hears it from the same second. */
export default function TunePlayer({ sound }: { sound: CafeSound }) {
  const t = sound.tune;
  const key = `${JSON.stringify(t)}@${sound.tuneAt}`;
  const [fail, setFail] = useState<{ key: string; why: Fail } | null>(null);
  const onFail = useCallback((why: Fail) => setFail({ key, why }), [key]);
  if (!sound.on || !t) return null;
  const failed = fail?.key === key ? fail.why : null;
  return (
    <aside className="tune-dock" aria-label="музика з посилання">
      <div className="tune-hd">
        <span className="tune-ttl">
          ♪ {tuneSource(t)}
          {sound.by ? ` · ставить ${sound.by}` : ""}
        </span>
        <a className="btn btn-ic" href={tuneUrl(t)} target="_blank" rel="noreferrer" title="відкрити окремо">
          <ExternalLink size={13} />
        </a>
        <button className="btn btn-ic" onClick={sound.toggle} title="вимкнути музику" aria-label="вимкнути музику">
          <X size={14} />
        </button>
      </div>
      {failed ? (
        <p className="tune-note">{FAILS[failed]}</p>
      ) : t.kind === "youtube" ? (
        <YouTubeTune key={key} tune={t} at={sound.tuneAt} vol={sound.vol} onFail={onFail} />
      ) : (
        <SpotifyTune key={key} tune={t} at={sound.tuneAt} onFail={onFail} />
      )}
      {t.kind === "spotify" && !failed && (
        <p className="tune-note">Повністю грає, якщо ти увійшов у Spotify у цьому браузері, інакше 30 секунд.</p>
      )}
    </aside>
  );
}
