"use client";

import { useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import { useTr, useUi } from "@/lib/i18n";
import { WEB_GAMES, WebGame } from "@/lib/live/webGames";
import FullscreenButton from "./FullscreenButton";

/**
 * Games from their authors' own sites, picked as tiles. The window loads only once a game is picked, so nothing is
 * fetched from those sites before that; it cannot reach the café's page, its keys or its storage, nor navigate it.
 */
export default function Strategy() {
  const ui = useUi();
  const t = useTr();
  const [game, setGame] = useState<WebGame | null>(null);
  const box = useRef<HTMLDivElement>(null);

  return (
    <div className="wgames">
      <div className="gtiles" role="radiogroup" aria-label={t("гра", "game")}>
        {WEB_GAMES.map((g) => (
          <button
            key={g.id}
            role="radio"
            aria-checked={game?.id === g.id}
            className={`gtile${game?.id === g.id ? " on" : ""}`}
            onClick={() => setGame(g)}
          >
            <span className="gtile-ic" aria-hidden>
              {g.icon}
            </span>
            <b>{g.title}</b>
            <small>{g.about[ui]}</small>
            <span className="gtile-n">{g.players[ui]}</span>
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
