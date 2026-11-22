"use client";

import { useTr, useUi } from "@/lib/i18n";
import { DuelKind, duelName } from "@/lib/live/duel";
import { useSoloTally } from "@/lib/live/soloStore";
import { Game, ScoreRow } from "@/lib/live/useScores";
import { GAMES } from "./games";

const TOP = 5;
const BOARDS: DuelKind[] = GAMES.map((g) => g.kind);

const played = (rows: ScoreRow[], game: Game) => rows.filter((r) => r.game === game && r.played > 0);

/** a cup in big pixels, for a board nobody is on yet */
const CUP = [
  "..#######..",
  "###########",
  "#.#######.#",
  "#.#######.#",
  ".#.#####.#.",
  "..#######..",
  "...#####...",
  "....###....",
  "....###....",
  "...#####...",
  "..#######..",
];

function Cup() {
  return (
    <svg className="leaders-cup" viewBox="0 0 11 11" shapeRendering="crispEdges" aria-hidden>
      {CUP.flatMap((row, y) =>
        [...row].flatMap((ch, x) => (ch === "#" ? [<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />] : [])),
      )}
      <rect className="leaders-glint" x={3} y={2} width={1} height={2} />
    </svg>
  );
}

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
          <span className="ld-n" data-n={i + 1}>
            {i + 1}
          </span>
          <span className="ld-who">{r.player}</span>
          <i className="ld-dots" aria-hidden />
          <b title={t(`${r.wins} з ${r.played}`, `${r.wins} of ${r.played}`)}>
            {r.wins}
            <small>{t("з", "of")}</small>
            {r.played}
          </b>
        </li>
      ))}
    </ol>
  );
}

/**
 * The hall's board of records, as on an arcade machine: first your own tally against the café's agents, game by
 * game, which lives in this browser only; then the café's champions among people; then the best at betting.
 */
export default function HighScores({ rows, me }: { rows: ScoreRow[]; me: string }) {
  const ui = useUi();
  const t = useTr();
  const tally = useSoloTally();
  const mine = BOARDS.flatMap((kind) => {
    const m = tally[kind];
    return m && m.won + m.lost + m.drawn > 0 ? [{ kind, ...m }] : [];
  });
  const won = mine.reduce((n, m) => n + m.won, 0);
  const lost = mine.reduce((n, m) => n + m.lost, 0);
  const boards = BOARDS.filter((k) => played(rows, k).length > 0);
  return (
    <div className="leaders-board">
      <h3 className="leaders-ttl">{t("Рекорди", "High scores")}</h3>

      <section>
        <h4 className="leaders-sub">{t("Ти проти агентів", "You against the agents")}</h4>
        {mine.length ? (
          <ol className="leaders leaders-solo">
            {mine.map((m) => (
              <li key={m.kind}>
                <span className="ld-who">{duelName(m.kind, ui)}</span>
                <i className="ld-dots" aria-hidden />
                <b>
                  <span className="ld-won">{m.won}</span> : <span className="ld-lost">{m.lost}</span>
                </b>
              </li>
            ))}
            {mine.length > 1 && (
              <li className="sum">
                <span className="ld-who">{t("разом", "in all")}</span>
                <i className="ld-dots" aria-hidden />
                <b>
                  <span className="ld-won">{won}</span> : <span className="ld-lost">{lost}</span>
                </b>
              </li>
            )}
          </ol>
        ) : (
          <p className="leaders-none">
            {t(
              "Ще жодної партії. Обери автомат, і хтось із агентів сяде навпроти.",
              "Not a game yet. Pick a machine and one of the agents sits down across from you.",
            )}
          </p>
        )}
      </section>

      <section>
        <h4 className="leaders-sub">{t("Чемпіони кафе", "The café's champions")}</h4>
        {boards.length ? (
          <div className="leaders-2 leaders-col">
            {boards.map((k) => (
              <div key={k}>
                <div className="leaders-game">{duelName(k, ui)}</div>
                <Leaders rows={rows} game={k} me={me} />
              </div>
            ))}
          </div>
        ) : (
          <div className="leaders-empty">
            <Cup />
            <b>{t("Перше місце вільне", "First place is free")}</b>
            <span>
              {t(
                "Зіграй із гостем кафе: хто виграє, той і стане першим рядком.",
                "Play a guest of the café: whoever wins becomes the first line.",
              )}
            </span>
            <ol className="leaders leaders-ghost" aria-hidden>
              {[1, 2, 3].map((n) => (
                <li key={n}>
                  <span className="ld-n" data-n={n}>
                    {n}
                  </span>
                  <i className="ld-dots" />
                  <b>—</b>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      {played(rows, "bets").length > 0 && (
        <section className="games-bets">
          <h4 className="leaders-sub">{t("Ставки", "Bets")}</h4>
          <Leaders rows={rows} game="bets" me={me} />
        </section>
      )}
    </div>
  );
}
