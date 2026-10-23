import type { Two } from "@/lib/i18n";

/** Where a skill can be aimed. */
export type Aim = "enemy" | "ally" | "self" | "hex";

export interface SkillDef {
  id: string;
  name: Two;
  text: Two;
  cooldown: number;
  aim: Aim;
  /** "melee": walks up and strikes as part of it; a number: how far it reaches from where the unit stands */
  reach: "melee" | number;
  /** the blast's radius around the aimed hex, for skills that hit an area */
  area?: number;
}

export interface Passive {
  name: Two;
  text: Two;
}

/** A kind of fighter: its numbers at level 1, its skill and what it does without being told. */
export interface KindDef {
  id: string;
  name: Two;
  /** what it is for, in a few words */
  role: Two;
  body: string;
  hp: number;
  atk: number;
  def: number;
  dmg: [number, number];
  speed: number;
  range: number;
  flying?: boolean;
  /** answers every melee hit, not just the first each round */
  answersAll?: boolean;
  skill?: SkillDef;
  passive?: Passive;
  /** a leader's ultimate, charged by its side's meter */
  ult?: SkillDef;
  bug?: boolean;
}

const s = (uk: string, en: string): Two => ({ uk, en });

/** The agents' kinds, picked from what an agent is called in the café (squad.ts). */
export const AGENT_KINDS: KindDef[] = [
  {
    id: "coder",
    name: s("Кодер", "Coder"),
    role: s("б'ється впритул, тримає лінію", "fights up close, holds the line"),
    body: "knight",
    hp: 95,
    atk: 7,
    def: 6,
    dmg: [17, 26],
    speed: 4,
    range: 0,
    skill: {
      id: "refactor",
      name: s("Рефакторинг", "Refactor"),
      text: s(
        "Підходить і б'є на 130%, знімаючи з цілі щити й підсилення. Відповіді не буде.",
        "Walks up and strikes for 130%, stripping the target's shields and boosts. No retaliation.",
      ),
      cooldown: 3,
      aim: "enemy",
      reach: "melee",
    },
    passive: {
      name: s("Парне програмування", "Pair programming"),
      text: s("+15% шкоди, коли поруч із ціллю стоїть союзник.", "+15% damage when an ally stands next to the target."),
    },
  },
  {
    id: "tester",
    name: s("Тестувальник", "Tester"),
    role: s("стріляє здалеку, позначає баги", "shoots from afar, marks the bugs"),
    body: "ranger",
    hp: 62,
    atk: 6,
    def: 3,
    dmg: [14, 23],
    speed: 4,
    range: 6,
    skill: {
      id: "findBug",
      name: s("Знайти баг", "Find the bug"),
      text: s(
        "Постріл на 80%, що позначає ціль на 2 ходи: позначена отримує на 30% більше від усіх.",
        "A shot for 80% that marks the target for 2 turns: a marked one takes 30% more from everyone.",
      ),
      cooldown: 3,
      aim: "enemy",
      reach: 99,
    },
    passive: {
      name: s("Покриття", "Coverage"),
      text: s("+25% шкоди по позначених.", "+25% damage to marked targets."),
    },
  },
  {
    id: "reviewer",
    name: s("Рев'юер", "Reviewer"),
    role: s("відповідає на кожен удар", "answers every blow"),
    body: "duelist",
    hp: 82,
    atk: 6,
    def: 7,
    dmg: [17, 24],
    speed: 4,
    range: 0,
    answersAll: true,
    skill: {
      id: "requestChanges",
      name: s("Request changes", "Request changes"),
      text: s(
        "Підходить, б'є, відштовхує ціль на 2 клітинки й глушить її вміння на хід. Удар об перешкоду болить.",
        "Walks up, strikes, pushes the target 2 hexes and silences its skills for a turn. Hitting an obstacle hurts.",
      ),
      cooldown: 3,
      aim: "enemy",
      reach: "melee",
    },
    passive: {
      name: s("Кожен коментар з відповіддю", "Every comment answered"),
      text: s("Відповідає на кожен удар впритул, а не лише на перший за раунд.", "Retaliates against every melee hit, not just the first each round."),
    },
  },
  {
    id: "guardian",
    name: s("Охоронець", "Guardian"),
    role: s("танк, ховає союзників за файрволом", "a tank, keeps allies behind a firewall"),
    body: "guardian",
    hp: 130,
    atk: 5,
    def: 10,
    dmg: [14, 20],
    speed: 3,
    range: 0,
    skill: {
      id: "firewall",
      name: s("Файрвол", "Firewall"),
      text: s(
        "Щит на 35 собі й союзникам поруч на 2 ходи; вороги поруч мусять бити тільки його.",
        "A 35-point shield on itself and allies next to it for 2 turns; enemies next to it must hit only it.",
      ),
      cooldown: 4,
      aim: "self",
      reach: 0,
      area: 1,
    },
    passive: {
      name: s("Прикриття", "Cover"),
      text: s("Союзники поруч отримують на 20% менше шкоди.", "Allies next to it take 20% less damage."),
    },
  },
  {
    id: "planner",
    name: s("Стратег", "Strategist"),
    role: s("дає союзникам зайвий хід", "gives allies an extra turn"),
    body: "mage",
    hp: 72,
    atk: 5,
    def: 5,
    dmg: [14, 22],
    speed: 5,
    range: 6,
    skill: {
      id: "plan",
      name: s("План", "The plan"),
      text: s(
        "Союзник до 5 клітинок ходить одразу ще раз, на 2 клітинки далі, і його вміння стає на хід ближче.",
        "An ally up to 5 hexes away acts again right now, 2 hexes further, and its skill comes a turn sooner.",
      ),
      cooldown: 3,
      aim: "ally",
      reach: 5,
    },
    passive: {
      name: s("Дорожня карта", "Roadmap"),
      text: s("Уся команда ходить раніше: +1 до ініціативи.", "The whole side acts sooner: +1 initiative."),
    },
  },
  {
    id: "scout",
    name: s("Розвідник", "Scout"),
    role: s("літає, б'є першим", "flies, strikes first"),
    body: "rogue",
    hp: 80,
    atk: 7,
    def: 5,
    dmg: [17, 24],
    speed: 6,
    range: 0,
    flying: true,
    skill: {
      id: "deepSearch",
      name: s("Глибокий пошук", "Deep search"),
      text: s(
        "Перестрибує до цілі за 6 клітинок, крізь будь-що, і б'є на 140%. Відповіді не буде.",
        "Leaps to a target up to 6 hexes away, through anything, and strikes for 140%. No retaliation.",
      ),
      cooldown: 2,
      aim: "enemy",
      reach: 6,
    },
    passive: {
      name: s("Перший удар", "First strike"),
      text: s("+40% шкоди по цілі з повним здоров'ям.", "+40% damage to a target at full health."),
    },
  },
  {
    id: "devops",
    name: s("Девопс", "DevOps"),
    role: s("артилерія, б'є по площі", "artillery, hits an area"),
    body: "engineer",
    hp: 64,
    atk: 6,
    def: 4,
    dmg: [14, 20],
    speed: 3,
    range: 7,
    skill: {
      id: "fridayDeploy",
      name: s("Деплой у п'ятницю", "Friday deploy"),
      text: s(
        "Позначає 7 клітинок; на початку наступного раунду там вибухає на 26–36 по всіх, і своїх теж.",
        "Marks 7 hexes; at the start of the next round they blow up for 26–36 on everyone, own side too.",
      ),
      cooldown: 4,
      aim: "hex",
      reach: 8,
      area: 1,
    },
    passive: {
      name: s("Пайплайн", "Pipeline"),
      text: s("Постріли зачіпають ворогів поруч із ціллю на 30%.", "Shots also hit enemies next to the target for 30%."),
    },
  },
  {
    id: "debugger",
    name: s("Дебагер", "Debugger"),
    role: s("лікує й рятує", "heals and saves"),
    body: "healer",
    hp: 70,
    atk: 4,
    def: 5,
    dmg: [12, 18],
    speed: 4,
    range: 4,
    skill: {
      id: "hotfix",
      name: s("Хотфікс", "Hotfix"),
      text: s(
        "Лікує союзника до 5 клітинок на 35% здоров'я й знімає з нього все погане.",
        "Heals an ally up to 5 hexes away for 35% of its health and washes off everything bad.",
      ),
      cooldown: 3,
      aim: "ally",
      reach: 5,
    },
    passive: {
      name: s("Rollback", "Rollback"),
      text: s("Раз за бій перший союзник, що мав упасти, лишається з 1 здоров'ям.", "Once a battle, the first ally who would fall stays at 1 health."),
    },
  },
];

const ULTRATHINK: SkillDef = {
  id: "ultrathink",
  name: s("Ultrathink", "Ultrathink"),
  text: s(
    "Союзник до 4 клітинок (чи сам) б'є наступного разу на 150%, а його вміння стає на хід ближче.",
    "An ally up to 4 hexes away (or itself) hits for 150% next time, and its skill comes a turn sooner.",
  ),
  cooldown: 3,
  aim: "ally",
  reach: 4,
};

const LEAD: Passive = {
  name: s("Лідер", "Leader"),
  text: s("Союзники поруч: +2 до атаки й захисту.", "Allies next to it: +2 attack and defence."),
};

const leader = (id: string, name: string, body: string, ult: SkillDef): KindDef => ({
  id,
  name: s(name, name),
  role: s("веде команду, має ультимейт", "leads the side, has an ultimate"),
  body,
  hp: 115,
  atk: 8,
  def: 7,
  dmg: [20, 31],
  speed: 5,
  range: 0,
  skill: ULTRATHINK,
  passive: LEAD,
  ult,
});

/** A chat's main agent leads its side; which one decides the ultimate. */
export const LEADER_KINDS: KindDef[] = [
  leader("claude", "Claude", "hero", {
    id: "subagents",
    name: s("Субагенти", "Subagents"),
    text: s("Кличе двох субагентів на клітинки поруч. Вони б'ються до кінця бою.", "Calls two subagents onto the hexes next to it. They fight to the end."),
    cooldown: 0,
    aim: "self",
    reach: 0,
  }),
  leader("codex", "Codex", "hero", {
    id: "cloudTask",
    name: s("Хмарна задача", "Cloud task"),
    text: s("Будь-який ворог на полі отримує 58–75, крізь щит і захист, і пропускає хід.", "Any enemy on the field takes 58–75, through shield and defence, and loses its turn."),
    cooldown: 0,
    aim: "enemy",
    reach: 99,
  }),
  leader("gemini", "Gemini", "hero", {
    id: "millionTokens",
    name: s("Мільйон токенів", "A million tokens"),
    text: s(
      "Бачить усе: кожен ворог позначений на 2 ходи й хід не може вживати вмінь.",
      "Sees everything: every enemy is marked for 2 turns and cannot use skills for one.",
    ),
    cooldown: 0,
    aim: "self",
    reach: 0,
  }),
  leader("copilot", "Copilot", "hero", {
    id: "autopilot",
    name: s("Автопілот", "Autopilot"),
    text: s("Уся команда лікується на 15% і б'є наступного разу на 150%.", "The whole side heals 15% and hits for 150% next time."),
    cooldown: 0,
    aim: "self",
    reach: 0,
  }),
  leader("cursor", "Cursor", "hero", {
    id: "tabTab",
    name: s("Tab, Tab, Tab", "Tab, Tab, Tab"),
    text: s("Усі вміння команди одразу готові.", "Every skill on the side is ready at once."),
    cooldown: 0,
    aim: "self",
    reach: 0,
  }),
  leader("opencode", "OpenCode", "hero", {
    id: "fork",
    name: s("Форк", "Fork"),
    text: s("Робить свою копію поруч, з половиною здоров'я.", "Makes a copy of itself next to it, at half health."),
    cooldown: 0,
    aim: "self",
    reach: 0,
  }),
];

/** What Claude's ultimate calls: quick, weak, many. */
export const SUBAGENT: KindDef = {
  id: "subagent",
  name: s("Субагент", "Subagent"),
  role: s("покликаний на допомогу", "called in to help"),
  body: "minion",
  hp: 42,
  atk: 5,
  def: 3,
  dmg: [10, 17],
  speed: 5,
  range: 0,
};

/** The bugs, against whom the agents' sprint is fought. */
export const BUG_KINDS: KindDef[] = [
  {
    id: "nullPointer",
    name: s("NullPointer", "NullPointer"),
    role: s("примара: летить, ухиляється", "a ghost: flies, dodges"),
    body: "ghost",
    hp: 60,
    atk: 8,
    def: 2,
    dmg: [22, 32],
    speed: 6,
    range: 0,
    flying: true,
    bug: true,
    passive: {
      name: s("undefined", "undefined"),
      text: s("25% ударів по ньому проходять крізь нього.", "25% of the blows aimed at it pass through it."),
    },
  },
  {
    id: "memoryLeak",
    name: s("Memory Leak", "Memory Leak"),
    role: s("слиз, що росте щораунду", "a slime that grows every round"),
    body: "slime",
    hp: 91,
    atk: 5,
    def: 4,
    dmg: [15, 25],
    speed: 3,
    range: 0,
    bug: true,
    passive: {
      name: s("Росте", "Grows"),
      text: s(
        "Щораунду +10 здоров'я й +2 шкоди. Великий, падаючи, розпадається на два малих.",
        "Every round +10 health and +2 damage. A big one splits into two small ones when it falls.",
      ),
    },
  },
  {
    id: "leaklet",
    name: s("Leaklet", "Leaklet"),
    role: s("уламок витоку", "a piece of a leak"),
    body: "slimeSmall",
    hp: 34,
    atk: 4,
    def: 2,
    dmg: [10, 18],
    speed: 4,
    range: 0,
    bug: true,
  },
  {
    id: "raceCondition",
    name: s("Race Condition", "Race Condition"),
    role: s("близнюки: удвох швидші", "twins: faster together"),
    body: "imp",
    hp: 65,
    atk: 7,
    def: 3,
    dmg: [18, 29],
    speed: 5,
    range: 0,
    bug: true,
    passive: {
      name: s("Близнюки", "Twins"),
      text: s("Поки обидва живі: +2 до швидкості й +20% шкоди.", "While both live: +2 speed and +20% damage."),
    },
  },
  {
    id: "flakyTest",
    name: s("Flaky Test", "Flaky Test"),
    role: s("стріляє, але через раз", "shoots, but every other time"),
    body: "mushroom",
    hp: 70,
    atk: 6,
    def: 3,
    dmg: [21, 30],
    speed: 4,
    range: 5,
    bug: true,
    passive: {
      name: s("Нестабільний", "Flaky"),
      text: s("35% пострілів мимо. Після ходу перескакує на іншу клітинку.", "35% of its shots miss. After its turn it hops to another hex."),
    },
  },
  {
    id: "spaghetti",
    name: s("Spaghetti Code", "Spaghetti Code"),
    role: s("щупальця, що заплутують", "tentacles that tangle"),
    body: "tentacle",
    hp: 99,
    atk: 6,
    def: 5,
    dmg: [18, 29],
    speed: 3,
    range: 0,
    bug: true,
    passive: {
      name: s("Заплутує", "Tangles"),
      text: s("Кого вдарить, той не рухається хід.", "Whoever it hits cannot move for a turn."),
    },
  },
  {
    id: "deadlock",
    name: s("Deadlock", "Deadlock"),
    role: s("голем, з яким не розійтись", "a golem you cannot walk away from"),
    body: "golem",
    hp: 156,
    atk: 6,
    def: 9,
    dmg: [21, 30],
    speed: 2,
    range: 0,
    bug: true,
    passive: {
      name: s("Взаємне блокування", "Mutual lock"),
      text: s("Хто стоїть поруч, не може відійти.", "Whoever stands next to it cannot walk away."),
    },
  },
  {
    id: "monolith",
    name: s("Легасі-моноліт", "Legacy Monolith"),
    role: s("бос: старий, великий, злий", "the boss: old, big, angry"),
    body: "boss",
    hp: 340,
    atk: 9,
    def: 9,
    dmg: [29, 41],
    speed: 3,
    range: 0,
    answersAll: true,
    bug: true,
    skill: {
      id: "quake",
      name: s("Землетрус", "Quake"),
      text: s(
        "Земля тріскається на 2 клітинки навколо; на початку наступного раунду там б'є всіх ворогів на 18–26.",
        "The ground cracks 2 hexes around it; at the start of the next round it hits every enemy there for 18–26.",
      ),
      cooldown: 3,
      aim: "self",
      reach: 0,
      area: 2,
    },
    passive: {
      name: s("Легасі", "Legacy"),
      text: s(
        "Відповідає на кожен удар. Нижче 60% кличе спагеті, нижче 30% лютує: +40% шкоди й +1 швидкості.",
        "Answers every blow. Below 60% it calls spaghetti, below 30% it rages: +40% damage and +1 speed.",
      ),
    },
  },
];

/** What the agents keep alive in the scenario that has it: it neither moves nor fights. */
export const PROD: KindDef = {
  id: "prod",
  name: s("Прод-сервер", "Prod server"),
  role: s("його треба вберегти", "the one to keep safe"),
  body: "server",
  hp: 150,
  atk: 0,
  def: 8,
  dmg: [0, 0],
  speed: 0,
  range: 0,
  passive: {
    name: s("Продакшн", "Production"),
    text: s("Не ходить і не б'ється. Упаде — бій програно.", "Neither moves nor fights. If it falls, the battle is lost."),
  },
};

export const ALL_KINDS: KindDef[] = [...AGENT_KINDS, ...LEADER_KINDS, SUBAGENT, PROD, ...BUG_KINDS];
const BY_ID = new Map(ALL_KINDS.map((k) => [k.id, k]));

export const kindOf = (id: string): KindDef | undefined => BY_ID.get(id);
export const isLeaderKind = (id: string): boolean => LEADER_KINDS.some((k) => k.id === id);

/** A fighter's numbers at its level: every level past the first adds 6% health and 5% damage, every two +1/+1. */
export function scaled(k: KindDef, level: number) {
  const up = Math.max(0, level - 1);
  return {
    hp: Math.round(k.hp * (1 + 0.06 * up)),
    atk: k.atk + Math.floor(up / 2),
    def: k.def + Math.floor(up / 2),
    dmg: [Math.round(k.dmg[0] * (1 + 0.05 * up)), Math.round(k.dmg[1] * (1 + 0.05 * up))] as [number, number],
  };
}

export const MAX_LEVEL = 10;
/** Duels between people are fought at this level on both sides, whatever the agents have earned. */
export const DUEL_LEVEL = 5;
export const SQUAD_MAX = 5;
