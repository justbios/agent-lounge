import { WIN_AT } from "@/lib/live/pong";
import { NES_GAMES } from "@/lib/live/nesGames";

const LINES = [
  "Денді, 1 гравець: стрілки — рух, X — A, Z — B, Enter — Start, Shift — Select.",
  "Денді, 2 гравці: перший — WASD, G — A, F — B, E — Start, Q — Select; " +
    "другий — стрілки, . — A, , — B, Enter — Start, / — Select.",
  "Геймпади підхоплюються самі. Своя гра з диска лягає на полицю «мої картриджі» лише в цьому браузері " +
    "й нікуди не вантажиться.",
  `Удвох: пінг-понг до ${WIN_AT} очок або хрестики-нулики з кимось, хто зараз теж у кафе. ` +
    "Ракетку веди мишкою, пальцем або стрілками.",
  "Лови чашки: бариста кидає чашки, ти ловиш тацею мишкою, пальцем або стрілками. Золота чашка дає три.",
  "Ставки: коли Claude доручає задачу субагенту, під сценою з'являється ставка, скільки той працюватиме. " +
    "Ставки приймаються півтори хвилини, а вгадав чи ні, видно, щойно субагент закінчить.",
  "Кнопка з рамкою відкриває гру на весь екран, Esc повертає назад.",
];

/** How every game is played and whose the Dendy's cartridges are, kept at the bottom of the panel. */
export default function GamesHelp({ canRecord }: { canRecord: boolean }) {
  return (
    <section className="recap-sec game-sec games-help">
      <div className="share-ttl">Як грати</div>
      <div className="alerts-hint">
        {LINES.map((l) => (
          <p key={l}>{l}</p>
        ))}
        {!canRecord && <p>За посиланням для перегляду грати можна, але рахунок не пишеться.</p>}
      </div>
      {NES_GAMES.length > 0 && (
        <ul className="dendy-credits">
          {NES_GAMES.map((g) => (
            <li key={g.id}>
              {g.title}: {g.author},{" "}
              <a href={g.licenseUrl} target="_blank" rel="noreferrer">
                {g.license}
              </a>
              ,{" "}
              <a href={g.source} target="_blank" rel="noreferrer">
                {g.sourceLabel ?? "вихідний код"}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
