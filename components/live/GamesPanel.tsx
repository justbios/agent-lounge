"use client";

import { ReactNode, useEffect, useEffectEvent } from "react";
import { X } from "lucide-react";
import { Guest } from "@/lib/live/social";
import { WIN_AT } from "@/lib/live/pong";
import { Game, ScoreRow, Scores } from "@/lib/live/useScores";
import { Duels as DuelsState } from "@/lib/live/useDuels";
import { Ttt } from "@/lib/live/useTicTacToe";
import CatchCups from "../games/CatchCups";
import Dendy from "../games/Dendy";
import Duels from "../games/Duels";

const TOP = 5;
const DENDY_HINT = "Ігрова приставка в кафе: вільні ігри, які автори дозволили поширювати, або своя гра з диска (.nes).";

function Leaders({ rows, game, by, me }: { rows: ScoreRow[]; game: Game; by: "wins" | "best"; me: string }) {
  const list = rows
    .filter((r) => r.game === game && (by === "best" ? r.best > 0 : r.played > 0))
    .sort((a, b) => (by === "best" ? b.best - a.best : b.wins - a.wins || a.played - b.played))
    .slice(0, TOP);
  if (!list.length) return <p className="alerts-hint">Ще ніхто не грав.</p>;
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

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="recap-sec game-sec">
      <div className="share-ttl">{title}</div>
      <p className="alerts-hint">{hint}</p>
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
    if (duels.match?.kind === "pong") duels.close();
    onClose();
  };
  const close = useEffectEvent(shut);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, []);
  const best = scores.rows.find((r) => r.game === "cups" && r.player === me)?.best ?? 0;

  return (
    <div className="recap-backdrop" onClick={shut}>
      <div className="recap games" role="dialog" aria-label="ігри" onClick={(e) => e.stopPropagation()}>
        <div className="recap-hd">
          <div>
            <div className="recap-ttl">Ігри</div>
            <div className="muted-sm">поки агенти працюють</div>
          </div>
          <button className="btn recap-x" onClick={shut} aria-label="закрити">
            <X size={15} />
          </button>
        </div>
        {!scores.canRecord && <p className="alerts-hint">За посиланням для перегляду грати можна, але рахунок не пишеться.</p>}

        <Section
          title="Денді"
          hint={DENDY_HINT}
        >
          <Dendy />
        </Section>

        <Section
          title="Удвох"
          hint={`Пінг-понг до ${WIN_AT} очок або хрестики-нулики з кимось, хто зараз теж у кафе. Ракетку веди мишкою, пальцем або стрілками.`}
        >
          <Duels
            duels={duels}
            ttt={ttt}
            guests={guests}
            room={room}
            online={online}
            onPongEnd={(win) => {
              scores.record(me, "pong", win);
              if (duels.match) duels.finish(duels.match.id);
            }}
          />
          <div className="leaders-2">
            <div>
              <div className="muted-sm">пінг-понг</div>
              <Leaders rows={scores.rows} game="pong" by="wins" me={me} />
            </div>
            <div>
              <div className="muted-sm">хрестики-нулики</div>
              <Leaders rows={scores.rows} game="ttt" by="wins" me={me} />
            </div>
          </div>
        </Section>

        <Section title="Лови чашки" hint="Бариста кидає чашки, ти ловиш тацею: мишкою, пальцем або стрілками. Золота чашка дає три.">
          <CatchCups best={best} onFinish={(n) => scores.record(me, "cups", false, n)} />
          <Leaders rows={scores.rows} game="cups" by="best" me={me} />
        </Section>

        <Section
          title="Ставки"
          hint="Коли Claude доручає задачу субагенту, під сценою з'являється ставка: скільки той працюватиме. Ставки приймаються півтори хвилини, а вгадав чи ні, видно, щойно субагент закінчить."
        >
          <Leaders rows={scores.rows} game="bets" by="wins" me={me} />
        </Section>
      </div>
    </div>
  );
}
