"use client";

import { ReactNode, useEffect, useEffectEvent, useState } from "react";
import { Volume2, VolumeX, X } from "lucide-react";
import { useTr, useUi } from "@/lib/i18n";
import { TURN_BASED } from "@/lib/live/duel";
import type { LookPick } from "@/lib/live/interior";
import { setSfxOn, useSfxOn } from "@/lib/live/sfx";
import { Guest } from "@/lib/live/social";
import { recordSolo } from "@/lib/live/soloStore";
import { hallTick } from "@/lib/live/sounds/hall";
import { Checkers } from "@/lib/live/useCheckers";
import { Chess } from "@/lib/live/useChess";
import { Scores } from "@/lib/live/useScores";
import { Duels as DuelsState } from "@/lib/live/useDuels";
import type { ArenaNet } from "@/lib/live/useArenaNet";
import { Four } from "@/lib/live/useFour";
import { NES_GAMES } from "@/lib/live/nesGames";
import { Ttt } from "@/lib/live/useTicTacToe";
import { WEB_GAMES } from "@/lib/live/webGames";
import type { HourRow } from "@/lib/live/recap";
import type { AgentDef } from "@/lib/types";
import Arena from "../games/Arena";
import Dendy from "../games/Dendy";
import Duels from "../games/Duels";
import Strategy from "../games/Strategy";
import GameArt, { holdArt } from "../games/hall/GameArt";
import HighScores from "../games/hall/HighScores";
import type { SceneId } from "../games/hall/scenes";

const calm = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** One corner of the hall: its sign, and what stands in it. */
function Corner({
  id,
  title,
  tag,
  note,
  art,
  hero,
  children,
}: {
  id: string;
  title: string;
  /** a small label beside the title, such as «new» */
  tag?: string;
  /** a line under the sign: what the corner is */
  note?: string;
  /** a small screen beside the sign, alive while the pointer is on it */
  art?: SceneId;
  /** the corner in a frame of its own */
  hero?: boolean;
  children: ReactNode;
}) {
  const [hot, setHot] = useState(false);
  return (
    <section id={id} className={`recap-sec game-sec ${hero ? "game-hero" : ""}`}>
      <div className="game-hd" onPointerEnter={() => setHot(true)} onPointerLeave={() => setHot(false)}>
        {art && (
          <span className="gtile-scr game-art">
            <GameArt scene={art} hot={hot} />
          </span>
        )}
        <div>
          <h3 className="game-ttl">
            {title}
            {tag && <span className="game-tag">{tag}</span>}
          </h3>
          {note && <p className="game-note">{note}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export default function GamesPanel({
  scores,
  duels,
  ttt,
  chk,
  chess,
  four,
  arena,
  guests,
  room,
  online,
  me,
  agents,
  looks,
  roster,
  rows,
  onClose,
}: {
  scores: Scores;
  duels: DuelsState;
  ttt: Ttt;
  chk: Checkers;
  chess: Chess;
  four: Four;
  arena: ArenaNet;
  guests: Guest[];
  room: string | null;
  online: boolean;
  me: string;
  /** the café's agents, roster and last week, for the agents' battle; the agents are also who one plays alone */
  agents: AgentDef[];
  looks: Record<string, LookPick>;
  roster: string[];
  rows: HourRow[] | null;
  onClose: () => void;
}) {
  const ui = useUi();
  const t = useTr();
  const sound = useSfxOn();
  const shut = () => {
    if (duels.match && !TURN_BASED.includes(duels.match.kind)) duels.close();
    onClose();
  };
  const close = useEffectEvent(shut);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !document.fullscreenElement && close();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, []);

  // a match on the board gets every frame: the hall's little screens stand still meanwhile
  const playing = !!duels.match;
  useEffect(() => {
    holdArt(playing);
    return () => holdArt(false);
  }, [playing]);

  const corners: [id: string, name: string][] = [
    ["hall-machines", t("автомати", "machines")],
    ["hall-battle", t("битва агентів", "agents' battle")],
    ["hall-dendy", t("денді", "NES")],
    ["hall-strategy", t("стратегії", "strategy")],
    ["hall-scores", t("рекорди", "high scores")],
  ];
  const walkTo = (id: string, i: number) => {
    hallTick(i);
    document.getElementById(id)?.scrollIntoView({ block: "start", behavior: calm() ? "auto" : "smooth" });
  };
  const soundSay = sound ? t("вимкнути звуки ігор", "mute the games") : t("увімкнути звуки ігор", "unmute the games");

  return (
    <div className="recap-backdrop games-back" onClick={shut}>
      <div className="recap games" role="dialog" aria-label={t("ігри", "games")} onClick={(e) => e.stopPropagation()}>
        <header className="games-hd">
          <div className="games-sign">
            <h2 className="games-ttl">{t("Ігровий зал", "The arcade")}</h2>
            <p className="games-sub">
              {t(
                "Обери автомат, обери суперника, грай. Агенти кафе вже чекають.",
                "Pick a machine, pick a rival, play. The café's agents are waiting.",
              )}
            </p>
          </div>
          <div className="games-hd-tools">
            <button className="btn btn-ic" onClick={() => setSfxOn(!sound)} title={soundSay} aria-label={soundSay}>
              {sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
            <button className="btn recap-x" onClick={shut} aria-label={t("закрити", "close")}>
              <X size={15} />
            </button>
          </div>
          <nav className="games-nav" aria-label={t("кутки залу", "the hall's corners")}>
            {corners.map(([id, name], i) => (
              <button key={id} className={`btn games-nav-${id.slice(5)}`} onClick={() => walkTo(id, i)}>
                {name}
              </button>
            ))}
          </nav>
        </header>

        {!scores.canRecord && (
          <p className="alerts-hint">
            {t(
              "За посиланням для перегляду грати можна, але рахунок не пишеться.",
              "On a view-only link you can play, but scores are not kept.",
            )}
          </p>
        )}

        <div className="games-grid">
          <div className="games-main">
            <Corner
              id="hall-machines"
              title={t("Автомати", "Machines")}
              note={t("з агентами й гостями кафе", "with the café's agents and guests")}
            >
              <Duels
                duels={duels}
                ttt={ttt}
                chk={chk}
                chess={chess}
                four={four}
                arena={arena}
                guests={guests}
                room={room}
                online={online}
                agents={agents}
                looks={looks}
                roster={roster}
                rows={rows}
                onEnd={(kind, win) => {
                  // a game against an agent stays in this browser: no leaderboard, nothing sent
                  const solo = duels.match?.solo;
                  if (!solo) scores.record(me, kind, win);
                  else if (!solo.auto) recordSolo(kind, win ? "won" : "lost");
                  if (duels.match) duels.finish(duels.match.id);
                }}
                onShut={shut}
              />
            </Corner>
          </div>
          <aside id="hall-scores" className="games-side" aria-label={t("таблиця", "leaderboard")}>
            <HighScores rows={scores.rows} me={me} />
          </aside>
        </div>

        <Corner id="hall-battle" title={t("Битва агентів", "Agents' battle")} tag={t("нове", "new")} hero>
          <Arena agents={agents} roster={roster} rows={rows} />
        </Corner>

        <Corner
          id="hall-dendy"
          title={t("Денді", "NES")}
          art="dendy"
          note={t(
            "Консоль у кутку: вільні ігри з полиці або свій картридж із диска.",
            "The console in the corner: free games off the shelf, or a cartridge of your own from disk.",
          )}
        >
          <Dendy />
          {NES_GAMES.length > 0 && (
            <details className="dendy-credits">
              <summary>{t("хто зробив ці ігри", "who made these games")}</summary>
              <ul>
                {NES_GAMES.map((g) => (
                  <li key={g.id}>
                    {g.title}: {g.author},{" "}
                    <a href={g.licenseUrl} target="_blank" rel="noreferrer">
                      {g.license}
                    </a>
                    ,{" "}
                    <a href={g.source} target="_blank" rel="noreferrer">
                      {t("вихідний код", "source code")}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Corner>

        <Corner
          id="hall-strategy"
          title={t("Стратегії", "Strategy")}
          note={t(
            "Великі ігри з сайтів їхніх авторів, у вікні просто тут.",
            "Big games from their authors' own sites, in a window right here.",
          )}
        >
          <Strategy />
          <details className="dendy-credits">
            <summary>{t("хто зробив ці ігри", "who made these games")}</summary>
            <ul>
              {WEB_GAMES.map((g) => (
                <li key={g.id}>
                  {g.title}: {g.authors[ui]};{" "}
                  {g.licences.map((l) => (
                    <span key={l.name}>
                      {l.what[ui]}{" "}
                      <a href={l.url} target="_blank" rel="noreferrer">
                        {l.name}
                      </a>
                      ,{" "}
                    </span>
                  ))}
                  <a href={g.source} target="_blank" rel="noreferrer">
                    {t("вихідний код", "source code")}
                  </a>
                  . {g.mark?.[ui]}{" "}
                  {t(
                    "Гра відкривається з сайту авторів, у кафе з неї нічого не скопійовано.",
                    "The game opens from its authors' site; nothing of it is copied into the café.",
                  )}
                </li>
              ))}
            </ul>
          </details>
        </Corner>
      </div>
    </div>
  );
}
