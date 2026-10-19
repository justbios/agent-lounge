"use client";

import { useSyncExternalStore } from "react";
import { techLine } from "./tech";
import { Say } from "./types";

export type Lang = "uk" | "en" | "ru";

/** How agents' actions read: plain words in a language, or the technical line the hook produced. */
export interface Speech {
  lang: Lang;
  plain: boolean;
}

interface Words {
  kinds: Record<string, string>;
  verbs: Record<string, string>;
  /** a whole phrase for an action on a kind, where «verb + noun» reads badly; `{o}` is the name */
  special: Record<string, string>;
  /** actions that need no kind; `{o}` is quoted, `{r}` is raw */
  acts: Record<string, string>;
  chips: Record<string, string>;
  quote: (s: string) => string;
}

const NAMELESS = new Set(["db", "config", "locale"]);

const UK: Words = {
  kinds: {
    screen: "екран",
    component: "компонент",
    style: "вигляд",
    test: "тести",
    db: "базу даних",
    doc: "документацію",
    config: "налаштування",
    image: "картинку",
    locale: "переклади",
    logic: "логіку",
    server: "сервер",
    code: "код",
    file: "файл",
  },
  verbs: { read: "дивиться", edit: "допрацьовує", create: "створює" },
  special: {
    "create:screen": "малює новий екран {o}",
    "create:component": "робить новий компонент {o}",
    "create:test": "пише тести {o}",
    "edit:test": "виправляє тести {o}",
    "create:doc": "пише документацію {o}",
    "edit:doc": "оновлює документацію {o}",
    "edit:style": "змінює вигляд {o}",
    "create:style": "змінює вигляд {o}",
    "create:locale": "оновлює переклади",
    "edit:locale": "оновлює переклади",
    "create:db": "готує зміну бази даних",
    "edit:db": "готує зміну бази даних",
    "create:config": "налаштовує проєкт",
    "edit:config": "налаштовує проєкт",
    "create:image": "додає картинку {o}",
    "create:logic": "пише логіку {o}",
    "edit:logic": "пише логіку {o}",
    "create:code": "пише код {o}",
    "edit:code": "пише код {o}",
  },
  acts: {
    search_code: "шукає в коді {o}",
    find_files: "шукає потрібні файли",
    web_read: "читає сайт {r}",
    web_search: "шукає в інтернеті {o}",
    plan: "складає план роботи",
    skill: "відкриває інструкцію {o}",
    msg: "пише агенту {r}",
    tools: "готує інструменти",
    ask: "питає тебе",
    workflow: "запускає команду агентів",
    delegate: "доручає задачу агенту {r}",
    commit: "зберігає зміни",
    push: "відправляє зміни на GitHub",
    pull: "підтягує свіжий код",
    pr: "готує зміни на перевірку",
    deploy: "викладає нову версію",
    test: "запускає тести",
    check: "перевіряє код на помилки",
    install: "ставить бібліотеки",
    build: "збирає застосунок",
    device: "перевіряє застосунок на телефоні",
    db: "працює з базою даних",
    delete: "видаляє непотрібні файли",
    run: "запускає застосунок",
    changes: "дивиться, що змінилось",
    branch: "перемикає гілку",
    net: "звертається до сервера",
    files: "розкладає файли",
    look: "переглядає файли",
    script: "запускає скрипт",
    cmd: "виконує команду",
    task_look: "дивиться задачу",
    task_edit: "оновлює задачу",
    browser: "перевіряє сайт у браузері",
    design: "дивиться дизайн",
    docs: "читає документацію",
    chat: "пише повідомлення",
    analytics: "дивиться аналітику",
    github: "працює з GitHub",
    mcp: "користується {r}",
    mcp_any: "користується сервісом",
    fail: "щось не вийшло, пробує інакше",
    wait_you: "чекає на твою відповідь",
    wait_perm: "просить у тебе дозволу",
    started: "сідає за роботу",
    returns: "готово, несе результат",
    done: "готово ✓",
    answered: "відповів ✓",
    limit_hit: "вперся в ліміт підписки",
    broke_off: "зупинився через помилку",
    closed: "сесію закрито",
    b_carry: "несе",
    b_back: "вертається",
    b_work: "працює",
    b_take: "приймає",
    b_done: "готово",
    b_idle: "чекає",
    b_ask: "чекає на тебе",
    idle_now: "нічого не робить, чекає задачу",
    l_start: "старт",
  },
  chips: {
    web: "інтернет",
    plan: "план",
    skill: "інструкція",
    msg: "чат",
    ask: "питання",
    agent: "доручення",
    workflow: "команда",
    питання: "задача",
    сповіщення: "сповіщення",
    система: "система",
    дозвіл: "дозвіл",
    увага: "увага",
    завдання: "завдання",
  },
  quote: (s) => `«${s}»`,
};

const EN: Words = {
  kinds: {
    screen: "screen",
    component: "component",
    style: "look",
    test: "tests",
    db: "database",
    doc: "docs",
    config: "settings",
    image: "image",
    locale: "translations",
    logic: "logic",
    server: "server",
    code: "code",
    file: "file",
  },
  verbs: { read: "looking at", edit: "working on", create: "creating" },
  special: {
    "create:screen": "drawing a new screen {o}",
    "create:component": "building a new component {o}",
    "create:test": "writing tests {o}",
    "edit:test": "fixing tests {o}",
    "create:doc": "writing docs {o}",
    "edit:doc": "updating docs {o}",
    "edit:style": "restyling {o}",
    "create:style": "restyling {o}",
    "create:locale": "updating translations",
    "edit:locale": "updating translations",
    "create:db": "preparing a database change",
    "edit:db": "preparing a database change",
    "create:config": "tuning the project settings",
    "edit:config": "tuning the project settings",
    "create:image": "adding an image {o}",
    "create:logic": "writing logic {o}",
    "edit:logic": "writing logic {o}",
    "create:code": "writing code {o}",
    "edit:code": "writing code {o}",
  },
  acts: {
    search_code: "searching the code for {o}",
    find_files: "looking for files",
    web_read: "reading {r}",
    web_search: "searching the web for {o}",
    plan: "planning the work",
    skill: "opening the guide {o}",
    msg: "messaging {r}",
    tools: "getting tools ready",
    ask: "asking you",
    workflow: "starting a team of agents",
    delegate: "handing a task to {r}",
    commit: "saving changes",
    push: "sending changes to GitHub",
    pull: "pulling fresh code",
    pr: "preparing changes for review",
    deploy: "publishing a new version",
    test: "running tests",
    check: "checking the code for errors",
    install: "installing libraries",
    build: "building the app",
    device: "trying the app on a phone",
    db: "working with the database",
    delete: "deleting unused files",
    run: "starting the app",
    changes: "reviewing what changed",
    branch: "switching branches",
    net: "calling a server",
    files: "moving files around",
    look: "browsing files",
    script: "running a script",
    cmd: "running a command",
    task_look: "reading the task",
    task_edit: "updating the task",
    browser: "checking the site in a browser",
    design: "looking at the design",
    docs: "reading documentation",
    chat: "writing a message",
    analytics: "checking analytics",
    github: "working on GitHub",
    mcp: "using {r}",
    mcp_any: "using a service",
    fail: "something failed, trying another way",
    wait_you: "waiting for your reply",
    wait_perm: "asking your permission",
    started: "getting to work",
    returns: "done, bringing the result",
    done: "done ✓",
    answered: "answered ✓",
    limit_hit: "hit the subscription limit",
    broke_off: "stopped on an error",
    closed: "session closed",
    b_carry: "carrying",
    b_back: "heading back",
    b_work: "working",
    b_take: "receiving",
    b_done: "done",
    b_idle: "free",
    b_ask: "waiting for you",
    idle_now: "nothing to do, waiting for a task",
    l_start: "started",
  },
  chips: {
    web: "web",
    plan: "plan",
    skill: "guide",
    msg: "chat",
    ask: "question",
    agent: "handoff",
    workflow: "team",
    питання: "task",
    сповіщення: "notice",
    система: "system",
    дозвіл: "permission",
    увага: "attention",
    завдання: "assignment",
  },
  quote: (s) => `“${s}”`,
};

const RU: Words = {
  kinds: {
    screen: "экран",
    component: "компонент",
    style: "внешний вид",
    test: "тесты",
    db: "базу данных",
    doc: "документацию",
    config: "настройки",
    image: "картинку",
    locale: "переводы",
    logic: "логику",
    server: "сервер",
    code: "код",
    file: "файл",
  },
  verbs: { read: "смотрит", edit: "дорабатывает", create: "создаёт" },
  special: {
    "create:screen": "рисует новый экран {o}",
    "create:component": "делает новый компонент {o}",
    "create:test": "пишет тесты {o}",
    "edit:test": "чинит тесты {o}",
    "create:doc": "пишет документацию {o}",
    "edit:doc": "обновляет документацию {o}",
    "edit:style": "меняет внешний вид {o}",
    "create:style": "меняет внешний вид {o}",
    "create:locale": "обновляет переводы",
    "edit:locale": "обновляет переводы",
    "create:db": "готовит изменение базы данных",
    "edit:db": "готовит изменение базы данных",
    "create:config": "настраивает проект",
    "edit:config": "настраивает проект",
    "create:image": "добавляет картинку {o}",
    "create:logic": "пишет логику {o}",
    "edit:logic": "пишет логику {o}",
    "create:code": "пишет код {o}",
    "edit:code": "пишет код {o}",
  },
  acts: {
    search_code: "ищет в коде {o}",
    find_files: "ищет нужные файлы",
    web_read: "читает сайт {r}",
    web_search: "ищет в интернете {o}",
    plan: "составляет план работы",
    skill: "открывает инструкцию {o}",
    msg: "пишет агенту {r}",
    tools: "готовит инструменты",
    ask: "спрашивает тебя",
    workflow: "запускает команду агентов",
    delegate: "поручает задачу агенту {r}",
    commit: "сохраняет изменения",
    push: "отправляет изменения на GitHub",
    pull: "подтягивает свежий код",
    pr: "готовит изменения на проверку",
    deploy: "выкладывает новую версию",
    test: "запускает тесты",
    check: "проверяет код на ошибки",
    install: "ставит библиотеки",
    build: "собирает приложение",
    device: "проверяет приложение на телефоне",
    db: "работает с базой данных",
    delete: "удаляет ненужные файлы",
    run: "запускает приложение",
    changes: "смотрит, что изменилось",
    branch: "переключает ветку",
    net: "обращается к серверу",
    files: "раскладывает файлы",
    look: "просматривает файлы",
    script: "запускает скрипт",
    cmd: "выполняет команду",
    task_look: "смотрит задачу",
    task_edit: "обновляет задачу",
    browser: "проверяет сайт в браузере",
    design: "смотрит дизайн",
    docs: "читает документацию",
    chat: "пишет сообщение",
    analytics: "смотрит аналитику",
    github: "работает с GitHub",
    mcp: "пользуется {r}",
    mcp_any: "пользуется сервисом",
    fail: "что-то не вышло, пробует иначе",
    wait_you: "ждёт твоего ответа",
    wait_perm: "просит у тебя разрешения",
    started: "садится за работу",
    returns: "готово, несёт результат",
    done: "готово ✓",
    answered: "ответил ✓",
    limit_hit: "упёрся в лимит подписки",
    broke_off: "остановился из-за ошибки",
    closed: "сессия закрыта",
    b_carry: "несёт",
    b_back: "возвращается",
    b_work: "работает",
    b_take: "принимает",
    b_done: "готово",
    b_idle: "ждёт",
    b_ask: "ждёт тебя",
    idle_now: "ничего не делает, ждёт задачу",
    l_start: "старт",
  },
  chips: {
    web: "интернет",
    plan: "план",
    skill: "инструкция",
    msg: "чат",
    ask: "вопрос",
    agent: "поручение",
    workflow: "команда",
    питання: "задача",
    сповіщення: "уведомление",
    система: "система",
    дозвіл: "разрешение",
    увага: "внимание",
    завдання: "задание",
  },
  quote: (s) => `«${s}»`,
};

const WORDS: Record<Lang, Words> = { uk: UK, en: EN, ru: RU };

/** `say` in the viewer's words, or null when this build has no phrase for it. */
export function phrase(say: Say, lang: Lang): string | null {
  const w = WORDS[lang];
  const fill = (t: string) =>
    t
      .replace("{o}", say.o && !NAMELESS.has(say.k ?? "") ? w.quote(say.o) : "")
      .replace("{r}", say.o ?? "")
      .trim();
  if (say.a === "cmd" && say.o) return say.o;
  if (say.a === "mcp" && !say.o) return w.acts.mcp_any;
  if (say.k) {
    const special = w.special[`${say.a}:${say.k}`];
    if (special) return fill(special);
    const verb = w.verbs[say.a];
    const noun = w.kinds[say.k];
    if (verb && noun) return fill(`${verb} ${noun} {o}`);
  }
  const act = w.acts[say.a];
  return act ? fill(act) : null;
}

/**
 * A note, bubble or event as the viewer reads it: plain words when it carries a `say`, else the hook's own line, in
 * the viewer's language when the café wrote it.
 */
export function line(x: { text?: string; say?: Say; tech?: Say; pre?: string }, sp: Speech, fallback = ""): string {
  const own = (sp.plain && x.say ? phrase(x.say, sp.lang) : null) ?? (x.tech ? techLine(x.tech, sp.lang) : null);
  return own ? `${x.pre ?? ""}${own}` : (x.text ?? fallback);
}

const CYRILLIC = /[\u0400-\u04FF]/;

/**
 * The little label next to an agent's name: the tool in technical mode, a plain category otherwise. The café's own
 * labels («завдання», «питання», …) are lookup keys, not tool names, so an English viewer reads them in English in
 * technical mode too.
 */
export function chip(tool: string | undefined, sp: Speech): string | undefined {
  if (!tool) return tool;
  const plain = WORDS[sp.lang].chips[tool] ?? WORDS[sp.lang].chips[tool.toLowerCase()];
  if (sp.plain) return plain;
  return sp.lang === "en" && CYRILLIC.test(tool) ? (plain ?? tool) : tool;
}

/** A fixed phrase by its action key, for lines the café writes itself. */
export function said(a: string, sp: Speech, fallback: string, o?: string): string {
  return sp.plain ? (phrase({ a, o }, sp.lang) ?? fallback) : fallback;
}

const KEY = "relay.speech";
/** What the server renders, and what a viewer reads before a choice of theirs or their browser's applies. */
const DEFAULT: Speech = { lang: "en", plain: true };
const listeners = new Set<() => void>();
let speech: Speech | null = null;

/** A first visit reads the browser's own language: Ukrainian or Russian when it prefers them, English otherwise. */
function browserLang(): Lang {
  for (const l of navigator.languages?.length ? navigator.languages : [navigator.language]) {
    const p = l.slice(0, 2).toLowerCase();
    if (p in WORDS) return p as Lang;
  }
  return DEFAULT.lang;
}

function read(): Speech {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Speech> | null;
    const lang = v?.lang && v.lang in WORDS ? v.lang : browserLang();
    return { lang, plain: v?.plain ?? DEFAULT.plain };
  } catch {
    return DEFAULT;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The viewer's choice right now, for code outside React such as the clip recorder. */
export const speechNow = (): Speech => (speech ??= read());

export function setSpeech(next: Speech) {
  speech = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((l) => l());
}

export function useSpeech(): Speech {
  return useSyncExternalStore(subscribe, speechNow, () => DEFAULT);
}
