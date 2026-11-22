import type { Two } from "@/lib/i18n";
import { Level, hashOf } from "@/lib/live/solo";
import type { Outcome } from "./table";

/*
 * What an agent says once a game against it is over, in character: kind, a little cheeky, never rude. Sorted by how
 * it ended for the person and by the agent's level; none of them names a game, so they fit a board and a table alike.
 * The Ukrainian never says how the person did in the past tense, so it fits anyone.
 */
const LINES: Record<Outcome, Record<Level, Two[]>> = {
  // the person won
  won: {
    easy: [
      { uk: "Гарно зіграно! Я ще тільки вчуся, але дещо вже підгледів.", en: "Well played! I'm still learning, but I did pick something up." },
      { uk: "Ти молодець. А я, здається, думав про каву.", en: "You were great. I think I was thinking about coffee." },
      { uk: "Ой. Ну нічого, зате тобі приємно!", en: "Oops. Well, at least you're happy!" },
    ],
    normal: [
      { uk: "Чиста робота. Визнаю і вимагаю реваншу.", en: "Clean work. I admit it, and I demand a rematch." },
      { uk: "Добре, ця партія твоя. Наступна моя?", en: "All right, this one is yours. The next one's mine?" },
      { uk: "Красиво. Я це запам'ятаю, обережно.", en: "Pretty. I'll remember that, careful now." },
    ],
    hard: [
      { uk: "Оце так. Я старався на повну, чесно.", en: "Well now. I was trying my hardest, honest." },
      { uk: "Знімаю капелюха. Це було сильно.", en: "Hats off. That was strong." },
      { uk: "Мене обіграли на «складно». Запишу це в логи.", en: "Beaten on hard. That one goes in the logs." },
    ],
  },
  // the agent won
  lost: {
    easy: [
      { uk: "Ой, я виграв? Сам не чекав!", en: "Oh, I won? Didn't see that coming myself!" },
      { uk: "Пощастило мені. Давай ще раз, тепер твоя черга.", en: "Lucky me. Go again, it's your turn to win." },
      { uk: "Не журися, я теж програю. Учора, наприклад.", en: "Don't be sad, I lose too. Yesterday, for one." },
    ],
    normal: [
      { uk: "Цього разу моя взяла. Ще раз?", en: "This one went my way. Again?" },
      { uk: "Було близько! Ну, майже близько.", en: "That was close! Well, close-ish." },
      { uk: "Гарна гра. Каву переможцю, тобто мені.", en: "Good game. Coffee for the winner, that is, me." },
    ],
    hard: [
      { uk: "Нічого особистого, я просто порахував усе наперед.", en: "Nothing personal, I just counted it all out ahead." },
      { uk: "Гідна гра. На «складно» це вже немало.", en: "A worthy game. On hard, that's saying something." },
      { uk: "Я попереджав: рівень «складно». Але реванш дам охоче.", en: "I did warn you: it says hard. But I'll gladly give you a rematch." },
    ],
  },
  drawn: {
    easy: [
      { uk: "Нічия! Ми обоє молодці.", en: "A draw! We both did well." },
      { uk: "Порівну. Люблю, коли нікому не прикро.", en: "Even. I like it when nobody's upset." },
    ],
    normal: [
      { uk: "Нічия. Сили рівні, перевіримо ще раз?", en: "A draw. Evenly matched, shall we check again?" },
      { uk: "Ніхто не поступився. Поважаю.", en: "Nobody gave way. Respect." },
    ],
    hard: [
      { uk: "Нічия на «складно»: це майже перемога. Майже.", en: "A draw on hard is almost a win. Almost." },
      { uk: "Я шукав щілину і не знайшов. Міцна гра.", en: "I looked for a gap and found none. Solid play." },
    ],
  },
};

/** The agent's line for this game: the same one every time the card of that match is shown. */
export function agentLine(outcome: Outcome, level: Level, game: string): Two {
  const list = LINES[outcome][level];
  return list[hashOf(game) % list.length];
}
