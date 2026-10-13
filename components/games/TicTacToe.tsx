"use client";

import { Guest } from "@/lib/live/social";
import { markOf } from "@/lib/live/ttt";
import { Ttt } from "@/lib/live/useTicTacToe";

const SIGN = { x: "✕", o: "◯" } as const;

function Board({ ttt }: { ttt: Ttt }) {
  const g = ttt.game!;
  const mine = markOf(g, ttt.self);
  const rival = g.x.id === ttt.self ? g.o : g.x;
  const status = g.gone
    ? `${rival.name}: гру закрито`
    : ttt.away
      ? `${rival.name} більше не в кафе`
      : g.winner === "draw"
        ? "нічия"
        : g.winner
          ? g.winner === mine
            ? "перемога твоя!"
            : `перемога: ${rival.name}`
          : g.turn === mine
            ? "твій хід"
            : `ходить ${rival.name}`;
  const live = !g.winner && !g.gone && !ttt.away;
  return (
    <div className="ttt">
      <div className="ttt-hd">
        <span>
          {SIGN.x} {g.x.id === ttt.self ? "ти" : g.x.name} · {SIGN.o} {g.o.id === ttt.self ? "ти" : g.o.name}
        </span>
        <b>{status}</b>
      </div>
      <div className="ttt-grid" role="grid" aria-label="поле хрестиків-нуликів">
        {g.cells.map((c, i) => (
          <button
            key={i}
            className={`${c ?? ""} ${g.line?.includes(i) ? "win" : ""}`}
            disabled={!live || !!c || g.turn !== mine}
            onClick={() => ttt.move(i)}
            aria-label={c ? SIGN[c] : `клітинка ${i + 1}`}
          >
            {c ? SIGN[c] : ""}
          </button>
        ))}
      </div>
      <button className="btn" onClick={ttt.close}>
        {live ? "здатись і вийти" : "закрити"}
      </button>
    </div>
  );
}

/** A board while playing; otherwise who is around to challenge, and the invite in flight. */
export default function TicTacToe({ ttt, guests, online }: { ttt: Ttt; guests: Guest[]; online: boolean }) {
  if (ttt.game) return <Board ttt={ttt} />;
  if (!online) {
    return <p className="alerts-hint">Хрестики-нулики граються з кимось, хто теж відкрив це кафе. Це працює в хмарному режимі.</p>;
  }
  return (
    <div className="ttt-lobby">
      {ttt.waiting ? (
        <div className="ttt-wait">
          Чекаю, поки {ttt.waiting.to.name} погодиться…{" "}
          <button className="btn" onClick={ttt.close}>
            скасувати
          </button>
        </div>
      ) : guests.length ? (
        <div className="ttt-guests">
          {guests.map((g) => (
            <button key={g.id} className="btn" onClick={() => ttt.invite(g)}>
              покликати {g.name}
            </button>
          ))}
        </div>
      ) : (
        <p className="alerts-hint">Поки в кафе більше нікого. Запроси когось через двері або відкрий кафе на телефоні.</p>
      )}
      {ttt.declined && <p className="alerts-hint">{ttt.declined} зараз не хоче грати.</p>}
    </div>
  );
}
