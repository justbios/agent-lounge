"use client";

import { ReactNode, useEffect, useEffectEvent } from "react";
import { X } from "lucide-react";
import { Guest } from "@/lib/live/social";
import { Game, ScoreRow, Scores } from "@/lib/live/useScores";
import { Duels as DuelsState } from "@/lib/live/useDuels";
import { Ttt } from "@/lib/live/useTicTacToe";
import CatchCups from "../games/CatchCups";
import Dendy from "../games/Dendy";
import Duels from "../games/Duels";
import GamesHelp from "../games/GamesHelp";

const TOP = 5;

const played = (rows: ScoreRow[], game: Game, by: "wins" | "best") =>
  rows.filter((r) => r.game === game && (by === "best" ? r.best > 0 : r.played > 0));

function Leaders({ rows, game, by, me }: { rows: ScoreRow[]; game: Game; by: "wins" | "best"; me: string }) {
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
          <b>{by === "best" ? r.best : `${r.wins} з ${r.played}`}</b>
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
  guests,
  room,
  online,
  me,
  onClose,
}: {
  scores: Scores;
  duels: DuelsState;
  ttt: Ttt;
  guests: Guest[];
  room: string | null;
  online: boolean;
  me: string;
  onClose: () => void;
}) {
  const shut = () => {
    if (duels.match && duels.match.kind !== "ttt") duels.close();
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
      <div className="recap games" role="dialog" aria-label="ігри" onClick={(e) => e.stopPropagation()}>
        <div className="recap-hd">
          <div className="recap-ttl">Ігри</div>
          <button className="btn recap-x" onClick={shut} aria-label="закрити">
            <X size={15} />
          </button>
        </div>

        <Section title="Денді">
          <Dendy />
        </Section>

        <div className="games-row">
          <Section title="Удвох">
            <Duels
              duels={duels}
              ttt={ttt}
              guests={guests}
              room={room}
              online={online}
              onEnd={(kind, win) => {
                scores.record(me, kind, win);
                if (duels.match) duels.finish(duels.match.id);
              }}
            />
            <div className="leaders-2">
              {played(scores.rows, "pong", "wins").length > 0 && (
                <div>
                  <div className="muted-sm">пінг-понг</div>
                  <Leaders rows={scores.rows} game="pong" by="wins" me={me} />
                </div>
              )}
              {played(scores.rows, "cables", "wins").length > 0 && (
                <div>
                  <div className="muted-sm">кабелі</div>
                  <Leaders rows={scores.rows} game="cables" by="wins" me={me} />
                </div>
              )}
              {played(scores.rows, "ttt", "wins").length > 0 && (
                <div>
                  <div className="muted-sm">хрестики-нулики</div>
                  <Leaders rows={scores.rows} game="ttt" by="wins" me={me} />
                </div>
              )}
            </div>
          </Section>

          <Section title="Лови чашки">
            <CatchCups best={best} onFinish={(n) => scores.record(me, "cups", false, n)} />
            <Leaders rows={scores.rows} game="cups" by="best" me={me} />
          </Section>
        </div>

        {played(scores.rows, "bets", "wins").length > 0 && (
          <Section title="Ставки">
            <Leaders rows={scores.rows} game="bets" by="wins" me={me} />
          </Section>
        )}

        <GamesHelp canRecord={scores.canRecord} />
      </div>
    </div>
  );
}
