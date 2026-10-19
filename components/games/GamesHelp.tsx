"use client";

import { Two, useTr, useUi } from "@/lib/i18n";
import { WIN_AT as CABLES_AT } from "@/lib/live/cables";
import { WIN_AT as HOCKEY_AT } from "@/lib/live/hockey";
import { WIN_AT } from "@/lib/live/pong";
import { NES_GAMES } from "@/lib/live/nesGames";

const LINES: Two[] = [
  {
    uk: "Денді, 1 гравець: стрілки — рух, X — A, Z — B, Enter — Start, Shift — Select.",
    en: "NES, 1 player: arrows move, X is A, Z is B, Enter is Start, Shift is Select.",
  },
  {
    uk:
      "Денді, 2 гравці: перший — WASD, G — A, F — B, E — Start, Q — Select; " +
      "другий — стрілки, . — A, , — B, Enter — Start, / — Select.",
    en:
      "NES, 2 players: the first has WASD, G is A, F is B, E is Start, Q is Select; " +
      "the second has the arrows, . is A, , is B, Enter is Start, / is Select.",
  },
  {
    uk:
      "Геймпади підхоплюються самі. Своя гра з диска лягає на полицю «мої картриджі» лише в цьому браузері " +
      "й нікуди не вантажиться.",
    en:
      "Gamepads are picked up on their own. A game of your own from disk goes on the “my cartridges” shelf " +
      "in this browser only and is never uploaded anywhere.",
  },
  {
    uk:
      "Удвох: аерохокей, шашки, хрестики-нулики, пінг-понг або кабелі з кимось, хто зараз теж у кафе. " +
      "Біля імені натисни гру, і людина отримає запрошення.",
    en:
      "For two: air hockey, checkers, tic-tac-toe, ping-pong or cables with someone else in the café right now. " +
      "Press a game next to their name and they get an invite.",
  },
  {
    uk:
      "Аерохокей: веди биту мишкою, пальцем, стрілками або WASD і забий шайбу у ворота навпроти; " +
      `гра до ${HOCKEY_AT} голів. Бита не заходить за червону лінію, а свої ворота завжди внизу.`,
    en:
      "Air hockey: move your mallet with the mouse, a finger, the arrows or WASD and score in the goal " +
      `opposite; first to ${HOCKEY_AT} goals wins. Your mallet stays behind the red line, and your own goal ` +
      "is always at the bottom.",
  },
  {
    uk:
      "Шашки: хто запросив, грає білими й ходить першим. Бити обов'язково, і назад теж, кількома стрибками за хід; " +
      "шашка на останньому ряду стає дамкою й ходить на будь-яку відстань. Натисни шашку, потім клітинку, " +
      "а під час биття кожну клітинку по черзі. Хто не може ходити, програв; " +
      "15 ходів самими дамками без биття — нічия.",
    en:
      "Checkers: whoever sent the invite plays white and moves first. Captures are a must, backwards too, " +
      "several jumps in one move; a man reaching the last row becomes a king and moves any distance. Press a piece, " +
      "then a square, and when capturing each square in turn. Whoever cannot move loses; 15 moves with only kings " +
      "and no captures is a draw.",
  },
  {
    uk: `Пінг-понг до ${WIN_AT} очок: ракетку веди мишкою, пальцем або стрілками.`,
    en: `Ping-pong to ${WIN_AT} points: move your paddle with the mouse, a finger or the arrows.`,
  },
  {
    uk:
      `Кабелі: кожен тягне свій кабель підлогою кафе. Повертай стрілками, WASD або проведи пальцем по полю. ` +
      `Хто врізався в стіну чи в кабель, свій або чужий, програв раунд; гра до ${CABLES_AT} виграних раундів.`,
    en:
      `Cables: each of you drags a cable across the café floor. Turn with the arrows, WASD or a swipe on the field. ` +
      `Whoever hits a wall or a cable, theirs or the other one, loses the round; first to ${CABLES_AT} rounds wins.`,
  },
  {
    uk: "Лови чашки: бариста кидає чашки, ти ловиш тацею мишкою, пальцем або стрілками. Золота чашка дає три.",
    en:
      "Catch the Cups: the barista throws cups, you catch them on a tray with the mouse, a finger or the arrows. " +
      "A gold cup counts as three.",
  },
  {
    uk:
      "Ставки: коли Claude доручає задачу субагенту, під сценою з'являється ставка, скільки той працюватиме. " +
      "Ставки приймаються півтори хвилини, а вгадав чи ні, видно, щойно субагент закінчить.",
    en:
      "Bets: when Claude hands a task to a subagent, a bet on how long it will work shows up under the scene. " +
      "Bets stay open for a minute and a half, and you see who guessed right as soon as the subagent is done.",
  },
  {
    uk: "Кнопка з рамкою відкриває гру на весь екран, Esc повертає назад.",
    en: "The button with a frame opens a game full screen, Esc brings it back.",
  },
];

/** How every game is played and whose the Dendy's cartridges are, kept at the bottom of the panel. */
export default function GamesHelp({ canRecord }: { canRecord: boolean }) {
  const ui = useUi();
  const t = useTr();
  return (
    <section className="recap-sec game-sec games-help">
      <div className="share-ttl">{t("Як грати", "How to play")}</div>
      <div className="alerts-hint">
        {LINES.map((l) => (
          <p key={l.uk}>{l[ui]}</p>
        ))}
        {!canRecord && (
          <p>
            {t(
              "За посиланням для перегляду грати можна, але рахунок не пишеться.",
              "On a view-only link you can play, but scores are not kept.",
            )}
          </p>
        )}
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
                {t("вихідний код", "source code")}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
