"use client";

import { ReactNode, useEffect, useEffectEvent } from "react";
import { X } from "lucide-react";
import { useTr, useUi } from "@/lib/i18n";
import { DuelKind, TURN_BASED, duelName } from "@/lib/live/duel";
import { Guest } from "@/lib/live/social";
import { Checkers } from "@/lib/live/useCheckers";
import { Chess } from "@/lib/live/useChess";
import { Game, ScoreRow, Scores } from "@/lib/live/useScores";
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

const TOP = 5;
const BOARDS: DuelKind[] = ["arena", "raid", "chess", "checkers", "hockey", "sumo", "four", "ttt", "pong", "cables"];

const played = (rows: ScoreRow[], game: Game) => rows.filter((r) => r.game === game && r.played > 0);

function Leaders({ rows, game, me }: { rows: ScoreRow[]; game: Game; me: string }) {
  const t = useTr();
  const list = played(rows, game)
    .sort((a, b) => b.wins - a.wins || a.played - b.played)
    .slice(0, TOP);
  if (!list.length) return null;
  return (
    <ol className="leaders">
      {list.map((r, i) => (
        <li key={r.player} className={r.player === me ? "me" : ""}>
          <span className="ld-n">{i + 1}</span>
          <span className="ld-who">{r.player}</span>
          <b>{t(`${r.wins} з ${r.played}`, `${r.wins} of ${r.played}`)}</b>
        </li>
      ))}
    </ol>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="recap-sec game-sec">
      <div className="share-ttl">{title}</div>
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
  /** the café's agents, roster and last week, for the agents' battle */
  agents: AgentDef[];
  roster: string[];
  rows: HourRow[] | null;
  onClose: () => void;
}) {
  const ui = useUi();
  const t = useTr();
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

  return (
    <div className="recap-backdrop" onClick={shut}>
      <div className="recap games" role="dialog" aria-label={t("ігри", "games")} onClick={(e) => e.stopPropagation()}>
        <div className="recap-hd">
          <div className="recap-ttl">{t("Ігри", "Games")}</div>
          <button className="btn recap-x" onClick={shut} aria-label={t("закрити", "close")}>
            <X size={15} />
          </button>
        </div>

        {!scores.canRecord && (
          <p className="alerts-hint">
            {t(
              "За посиланням для перегляду грати можна, але рахунок не пишеться.",
              "On a view-only link you can play, but scores are not kept.",
            )}
          </p>
        )}

        <Section title={t("Битва агентів", "Agents' battle")}>
          <Arena agents={agents} roster={roster} rows={rows} />
        </Section>

        <Section title={t("Денді", "NES")}>
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
        </Section>

        <Section title={t("Удвох і втрьох", "For two or three")}>
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
            roster={roster}
            rows={rows}
            onEnd={(kind, win) => {
              scores.record(me, kind, win);
              if (duels.match) duels.finish(duels.match.id);
            }}
          />
          <div className="leaders-2">
            {BOARDS.filter((k) => played(scores.rows, k).length > 0).map((k) => (
              <div key={k}>
                <div className="muted-sm">{duelName(k, ui)}</div>
                <Leaders rows={scores.rows} game={k} me={me} />
              </div>
            ))}
          </div>
        </Section>

        <Section title={t("Стратегії", "Strategy")}>
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
        </Section>

        {played(scores.rows, "bets").length > 0 && (
          <Section title={t("Ставки", "Bets")}>
            <Leaders rows={scores.rows} game="bets" me={me} />
          </Section>
        )}
      </div>
    </div>
  );
}
