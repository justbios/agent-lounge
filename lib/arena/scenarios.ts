import type { Two } from "@/lib/i18n";
import { PROD, kindOf } from "./content";
import { type Hex, hexAt } from "./hex";
import { mirror, type Setup } from "./rules";
import type { Fighter, Goal } from "./types";

/**
 * The sprint: five battles against the bugs, each teaching one thing and each a little harder, ending at the legacy
 * monolith. The bugs come at the squad's own level, give or take, so a squad that has worked more meets more.
 */

export interface Scenario {
  id: string;
  name: Two;
  /** what happened, before the battle */
  story: Two;
  /** what to watch for */
  tip: Two;
  /** the bugs, and how many levels above the squad each one is */
  bugs: [kind: string, up: number][];
  goal: "wipe" | { survive: number } | { protect: number };
  rocks?: Hex[];
  /** where the bugs stand, in the order listed; left out, they line up on their edge */
  places?: Hex[];
}

const s = (uk: string, en: string): Two => ({ uk, en });

export const SPRINT: Scenario[] = [
  {
    id: "first-bug",
    name: s("Перший баг", "The first bug"),
    story: s(
      "Понеділок, ранок. У логах щось шарудить: кілька дрібних витоків і NullPointer, що ухиляється від кожного другого удару.",
      "Monday morning. Something rustles in the logs: a couple of small leaks and a NullPointer that dodges every other blow.",
    ),
    tip: s(
      "Наведіть на ворога: видно, скільки шкоди буде і скільки прилетить у відповідь. Удар здалеку відповіді не має.",
      "Point at an enemy to see the damage and what comes back. A shot from afar gets no answer.",
    ),
    bugs: [
      ["leaklet", -1],
      ["leaklet", -1],
      ["nullPointer", -1],
    ],
    goal: "wipe",
    rocks: [hexAt(4, 2), mirror(hexAt(4, 2)), hexAt(3, 5), mirror(hexAt(3, 5))],
  },
  {
    id: "leak",
    name: s("Витік пам'яті", "The memory leak"),
    story: s(
      "Сервер їсть пам'ять щогодини більше. Два великі витоки ростуть, а flaky-тест стріляє з кутка, коли йому заманеться.",
      "The server eats more memory every hour. Two big leaks are growing, and a flaky test shoots from the corner when it feels like it.",
    ),
    tip: s(
      "Витоки ростуть щораунду: бийте їх рано. Великий, падаючи, розпадається на два малих.",
      "Leaks grow every round: hit them early. A big one splits in two when it falls.",
    ),
    bugs: [
      ["memoryLeak", 3],
      ["memoryLeak", 3],
      ["flakyTest", 2],
      ["flakyTest", 2],
      ["leaklet", 2],
      ["leaklet", 2],
    ],
    goal: "wipe",
  },
  {
    id: "race",
    name: s("Гонитва", "The race"),
    story: s(
      "Два потоки пишуть в одну змінну, і жоден не чекає. Близнюки Race Condition швидкі, поки тримаються разом.",
      "Two threads write to one variable and neither waits. The Race Condition twins are fast while they stay together.",
    ),
    tip: s(
      "Поки обидва близнюки живі, вони швидші й сильніші. Зосередьтесь на одному.",
      "While both twins live they are faster and stronger. Focus on one.",
    ),
    bugs: [
      ["raceCondition", 3],
      ["raceCondition", 3],
      ["nullPointer", 3],
      ["nullPointer", 3],
      ["flakyTest", 3],
      ["spaghetti", 2],
    ],
    goal: "wipe",
  },
  {
    id: "deadlock",
    name: s("Дедлок на проді", "Deadlock in prod"),
    story: s(
      "Прод висить, і баги лізуть просто до сервера. Протримайтесь сім раундів, поки не підкотиться фікс.",
      "Prod is hanging and the bugs are going straight for the server. Hold out seven rounds until the fix rolls out.",
    ),
    tip: s(
      "Прод-сервер не ходить і не б'ється; упаде — бій програно. Від Deadlock не відійти, а спагеті тримає того, кого вдарить.",
      "The prod server neither moves nor fights; if it falls, the battle is lost. You cannot walk away from a Deadlock, and spaghetti holds whoever it hits.",
    ),
    bugs: [
      ["deadlock", 3],
      ["spaghetti", 3],
      ["raceCondition", 2],
      ["raceCondition", 2],
      ["nullPointer", 3],
      ["nullPointer", 3],
      ["flakyTest", 2],
    ],
    goal: { protect: 7 },
    rocks: [hexAt(3, 1), hexAt(3, 6), hexAt(6, 3), hexAt(6, 4)],
  },
  {
    id: "monolith",
    name: s("Легасі-моноліт", "The legacy monolith"),
    story: s(
      "Десять років коду, жодного тесту. Моноліт прокинувся, і все, що ви чіпаєте, ламається ще десь.",
      "Ten years of code and not one test. The monolith has woken up, and whatever you touch breaks somewhere else.",
    ),
    tip: s(
      "Землетрус б'є через раунд: виходьте з тріщин. Нижче 60% моноліт кличе спагеті, нижче 30% лютує.",
      "The quake lands a round later: step out of the cracks. Below 60% the monolith calls spaghetti, below 30% it rages.",
    ),
    bugs: [
      ["monolith", 2],
      ["flakyTest", 1],
      ["spaghetti", 1],
      ["nullPointer", 1],
    ],
    goal: "wipe",
    places: [hexAt(8, 3), hexAt(10, 1), hexAt(10, 6), hexAt(9, 4)],
  },
];

/** The quick battle's bugs: any of the ordinary ones, as many as the squad. */
const QUICK = ["nullPointer", "memoryLeak", "raceCondition", "flakyTest", "spaghetti", "deadlock"];

export const scenarioOf = (id: string): Scenario | undefined => SPRINT.find((x) => x.id === id);

const avgLevel = (squad: Fighter[]) => Math.round(squad.reduce((n, f) => n + f.level, 0) / Math.max(1, squad.length));

const bug = (kind: string, level: number): Fighter => {
  const k = kindOf(kind)!;
  return { kind, name: k.name.en, body: k.body, color: "#9be36b", level: Math.max(1, Math.min(10, level)) };
};

/** A sprint battle for this squad: `id` makes each attempt its own. */
export function scenarioSetup(sc: Scenario, squad: Fighter[], id: string): Setup {
  const lv = avgLevel(squad);
  const bugs = sc.bugs.map(([kind, up]) => bug(kind, lv + up));
  let goal: Goal = { kind: "wipe" };
  const ours = [...squad];
  let places: Hex[] | undefined;
  if (typeof sc.goal === "object" && "survive" in sc.goal) goal = { kind: "survive", rounds: sc.goal.survive };
  if (typeof sc.goal === "object" && "protect" in sc.goal) {
    ours.push({ kind: PROD.id, name: PROD.name.en, body: PROD.body, color: "#8fb3ff", level: lv });
    goal = { kind: "protect", unit: squad.length, rounds: sc.goal.protect };
    // the server at the back in the middle, the squad in a ring in front of it
    const ring = [hexAt(1, 2), hexAt(1, 5), hexAt(1, 3), hexAt(1, 4), hexAt(0, 1), hexAt(0, 6)];
    places = [...ring.slice(0, squad.length), hexAt(0, 3)];
  }
  return {
    id,
    teams: [ours, bugs],
    goal,
    ...(sc.rocks ? { rocks: sc.rocks } : {}),
    places: [places, sc.places],
  };
}

/** A quick battle: the squad against as many bugs, picked by the battle's id. */
export function quickSetup(squad: Fighter[], id: string, pick: (n: number) => number): Setup {
  const lv = avgLevel(squad);
  const bugs = squad.map(() => bug(QUICK[pick(QUICK.length)], lv));
  return { id, teams: [squad, bugs] };
}
