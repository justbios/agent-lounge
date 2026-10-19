import type { Lang } from "./speech";
import { Say } from "./types";

const MAX_TEXT = 64;

/**
 * The hook's own line for a tool call or a wait, the one technical mode shows, in each language. `{o}` is the file,
 * pattern, site or tool from the event, `{o:…}` the same with what to say when the event has none.
 */
const TECH: Record<Lang, Record<string, string>> = {
  uk: {
    read: "читає {o:файл}",
    write: "пише {o:файл}",
    edit: "редагує {o:файл}",
    grep: "шукає «{o}»",
    glob: "шукає файли {o}",
    web_read: "читає {o:сторінку}",
    web_search: "шукає в мережі «{o}»",
    plan: "оновлює план",
    skill: "бере скіл {o}",
    msg: "пише {o:агенту}",
    tools: "дістає інструменти",
    ask: "питає тебе",
    workflow: "запускає воркфлоу",
    fail: "помилка: {o}",
    perm: "чекає на дозвіл",
    perm_on: "чекає на дозвіл: {o}",
    wait_you: "чекає на тебе",
    wait_answer: "чекає на твою відповідь",
    wait_plan: "чекає, щоб ти затвердив план",
  },
  en: {
    read: "reads {o:a file}",
    write: "writes {o:a file}",
    edit: "edits {o:a file}",
    grep: "searches for “{o}”",
    glob: "finds files {o}",
    web_read: "reads {o:a page}",
    web_search: "searches the web for “{o}”",
    plan: "updates the plan",
    skill: "uses the skill {o}",
    msg: "messages {o:an agent}",
    tools: "loads tools",
    ask: "asks you",
    workflow: "runs a workflow",
    fail: "error: {o}",
    perm: "waits for permission",
    perm_on: "waits for permission: {o}",
    wait_you: "waits for you",
    wait_answer: "waits for your answer",
    wait_plan: "waits for you to approve the plan",
  },
  ru: {
    read: "читает {o:файл}",
    write: "пишет {o:файл}",
    edit: "редактирует {o:файл}",
    grep: "ищет «{o}»",
    glob: "ищет файлы {o}",
    web_read: "читает {o:страницу}",
    web_search: "ищет в сети «{o}»",
    plan: "обновляет план",
    skill: "берёт скилл {o}",
    msg: "пишет {o:агенту}",
    tools: "достаёт инструменты",
    ask: "спрашивает тебя",
    workflow: "запускает воркфлоу",
    fail: "ошибка: {o}",
    perm: "ждёт разрешения",
    perm_on: "ждёт разрешения: {o}",
    wait_you: "ждёт тебя",
    wait_answer: "ждёт твоего ответа",
    wait_plan: "ждёт, чтобы ты утвердил план",
  },
};

/** A technical line in the viewer's language, or null for an action this table doesn't know. */
export function techLine(t: Say, lang: Lang): string | null {
  const tpl = TECH[lang][t.a];
  if (!tpl) return null;
  const s = tpl.replace(/\{o(?::([^}]*))?\}/, (_, none?: string) => t.o ?? none ?? "").replace(/\s+/g, " ").trim();
  return s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT - 1)}…` : s;
}
