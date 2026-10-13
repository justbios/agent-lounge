"use client";

import { ReactNode, useEffect, useEffectEvent } from "react";
import { X } from "lucide-react";
import { Guest } from "@/lib/live/social";
import { Game, ScoreRow, Scores } from "@/lib/live/useScores";
import { Ttt } from "@/lib/live/useTicTacToe";
import CatchCups from "../games/CatchCups";
import TicTacToe from "../games/TicTacToe";

const TOP = 5;

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
  ttt,
  guests,
  online,
  me,
  onClose,
}: {
  scores: Scores;
  ttt: Ttt;
  guests: Guest[];
  online: boolean;
  me: string;
  onClose: () => void;
}) {
  const close = useEffectEvent(onClose);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, []);
  const best = scores.rows.find((r) => r.game === "cups" && r.player === me)?.best ?? 0;

  return (
    <div className="recap-backdrop" onClick={onClose}>
      <div className="recap games" role="dialog" aria-label="ігри" onClick={(e) => e.stopPropagation()}>
        <div className="recap-hd">
          <div>
            <div className="recap-ttl">Ігри</div>
            <div className="muted-sm">поки агенти працюють</div>
          </div>
          <button className="btn recap-x" onClick={onClose} aria-label="закрити">
            <X size={15} />
          </button>
        </div>
        {!scores.canRecord && <p className="alerts-hint">За посиланням для перегляду грати можна, але рахунок не пишеться.</p>}

        <Section
          title="Ставки"
          hint="Коли Claude доручає задачу субагенту, під сценою з'являється ставка: скільки той працюватиме. Ставки приймаються півтори хвилини, а вгадав чи ні, видно, щойно субагент закінчить."
        >
          <Leaders rows={scores.rows} game="bets" by="wins" me={me} />
        </Section>

        <Section title="Лови чашки" hint="Бариста кидає чашки, ти ловиш тацею: мишкою, пальцем або стрілками. Золота чашка дає три.">
          <CatchCups best={best} onFinish={(n) => scores.record(me, "cups", false, n)} />
          <Leaders rows={scores.rows} game="cups" by="best" me={me} />
        </Section>

        <Section title="Хрестики-нулики" hint="З кимось, хто зараз теж у кафе.">
          <TicTacToe ttt={ttt} guests={guests} online={online} />
          <Leaders rows={scores.rows} game="ttt" by="wins" me={me} />
        </Section>
      </div>
    </div>
  );
}
