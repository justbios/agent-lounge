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
import { Four } from "@/lib/live/useFour";
import { NES_GAMES } from "@/lib/live/nesGames";
import { Ttt } from "@/lib/live/useTicTacToe";
import CatchCups from "../games/CatchCups";
import Dendy from "../games/Dendy";
import Duels from "../games/Duels";

const TOP = 5;
const BOARDS: DuelKind[] = ["chess", "checkers", "hockey", "sumo", "four", "ttt", "pong", "cables"];

const played = (rows: ScoreRow[], game: Game, by: "wins" | "best") =>
  rows.filter((r) => r.game === game && (by === "best" ? r.best > 0 : r.played > 0));

function Leaders({ rows, game, by, me }: { rows: ScoreRow[]; game: Game; by: "wins" | "best"; me: string }) {
  const t = useTr();
  const list = played(rows, game, by)
    .sort((a, b) => (by === "best" ? b.best - a.best : b.wins - a.wins || a.played - b.played))
    .slice(0, TOP);
  if (!list.length) return null;
  return (
    <ol className="leaders">
      {list.map((r, i) => (
        <li key={r.player} className={r.player === me ? "me" : ""}>
          <span className="ld-n">{i + 1}</span>
          <span className="ld-who">{r.player}</span>
          <b>{by === "best" ? r.best : t(`${r.wins} з ${r.played}`, `${r.wins} of ${r.played}`)}</b>
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
  guests,
  room,
  online,
  me,
  onClose,
}: {
  scores: Scores;
  duels: DuelsState;
  ttt: Ttt;
  chk: Checkers;
  chess: Chess;
  four: Four;
  guests: Guest[];
  room: string | null;
  online: boolean;
  me: string;
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
  const best = scores.rows.find((r) => r.game === "cups" && r.player === me)?.best ?? 0;

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

        <div className="games-row">
          <Section title={t("Удвох і втрьох", "For two or three")}>
            <Duels
              duels={duels}
              ttt={ttt}
              chk={chk}
              chess={chess}
              four={four}
              guests={guests}
              room={room}
              online={online}
              onEnd={(kind, win) => {
                scores.record(me, kind, win);
                if (duels.match) duels.finish(duels.match.id);
              }}
            />
            <div className="leaders-2">
              {BOARDS.filter((k) => played(scores.rows, k, "wins").length > 0).map((k) => (
                <div key={k}>
                  <div className="muted-sm">{duelName(k, ui)}</div>
                  <Leaders rows={scores.rows} game={k} by="wins" me={me} />
                </div>
              ))}
            </div>
          </Section>

          <Section title={t("Лови чашки", "Catch the Cups")}>
            <CatchCups best={best} onFinish={(n) => scores.record(me, "cups", false, n)} />
            <Leaders rows={scores.rows} game="cups" by="best" me={me} />
          </Section>
        </div>

        {played(scores.rows, "bets", "wins").length > 0 && (
          <Section title={t("Ставки", "Bets")}>
            <Leaders rows={scores.rows} game="bets" by="wins" me={me} />
          </Section>
        )}
      </div>
    </div>
  );
}
