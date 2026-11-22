"use client";

import { useRef, useState } from "react";
import { ExternalLink, Users, X } from "lucide-react";
import { useTr, useUi } from "@/lib/i18n";
import { hallPick } from "@/lib/live/sounds/hall";
import { WEB_GAMES, WebGame } from "@/lib/live/webGames";
import FullscreenButton from "./FullscreenButton";
import GameArt from "./hall/GameArt";

/**
 * Games from their authors' own sites, picked as posters, each with a little picture drawn here. The window loads
 * only once a game is picked, so nothing is fetched from those sites before that; it cannot reach the café's page,
 * its keys or its storage, nor navigate it.
 */
export default function Strategy() {
  const ui = useUi();
  const t = useTr();
  const [game, setGame] = useState<WebGame | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  return (
    <div className="wgames">
      <div className="wposters" role="radiogroup" aria-label={t("гра", "game")}>
        {WEB_GAMES.map((g) => (
          <button
            key={g.id}
            role="radio"
            aria-checked={game?.id === g.id}
            className={`gtile wposter${game?.id === g.id ? " on" : ""}`}
            onClick={() => {
              if (game?.id !== g.id) hallPick();
              setGame(g);
            }}
            onPointerEnter={(e) => e.pointerType === "mouse" && setHot(g.id)}
            onPointerLeave={() => setHot(null)}
            onFocus={() => setHot(g.id)}
            onBlur={() => setHot(null)}
          >
            <span className="gtile-scr">
              <GameArt scene="beasts" hot={hot === g.id} />
            </span>
            <b>{g.title}</b>
            <small>{g.about[ui]}</small>
            <span className="gtile-n">
              <span className="gtile-chip">
                <Users size={11} />
                {g.players[ui]}
              </span>
              <span className="wposter-go">▶ {t("відкрити", "open")}</span>
            </span>
          </button>
        ))}
      </div>
      {game && (
        <>
          <div className="dendy-bar">
            <b className="dendy-ttl">{game.title}</b>
            <small className="muted-sm">{t("з сайту авторів", "from its authors' site")}</small>
            <FullscreenButton target={box} />
            <a
              className="btn btn-ic"
              href={game.url}
              target="_blank"
              rel="noreferrer"
              title={t("відкрити в новій вкладці", "open in a new tab")}
              aria-label={t("відкрити в новій вкладці", "open in a new tab")}
            >
              <ExternalLink size={14} />
            </a>
            <button
              className="btn btn-ic"
              onClick={() => setGame(null)}
              title={t("вийти з гри", "quit game")}
              aria-label={t("вийти з гри", "quit game")}
            >
              <X size={14} />
            </button>
          </div>
          <div className="wgame" ref={box}>
            <iframe
              key={game.id}
              className="wgame-frame"
              src={game.url}
              title={game.title}
              allow="fullscreen; autoplay"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
            />
          </div>
        </>
      )}
    </div>
  );
}
