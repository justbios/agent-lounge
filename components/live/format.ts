import { AgentView } from "@/lib/cafe/timeline";
import { Ui, tr, uiOf } from "@/lib/i18n";
import { Speech, chip, line, said } from "@/lib/live/speech";
import { stopText } from "@/lib/live/attention";
import { LiveEvent } from "@/lib/live/types";

export function ago(ms: number, ui: Ui = "uk"): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return tr(ui, `${s} с тому`, `${s}s ago`);
  const m = Math.round(s / 60);
  if (m < 60) return tr(ui, `${m} хв тому`, `${m} min ago`);
  return tr(ui, `${Math.round(m / 60)} год тому`, `${Math.round(m / 60)} h ago`);
}

export function clockTime(at: number): string {
  return new Date(at).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function badge(v: AgentView, carrying: boolean, sp: Speech): { cls: string; text: string } {
  const ui = uiOf(sp.lang);
  if (v.walker) {
    return {
      cls: "rr-active",
      text: carrying ? said("b_carry", sp, tr(ui, "несе", "carrying")) : said("b_back", sp, tr(ui, "вертається", "heading back")),
    };
  }
  if (v.screen === "work") return { cls: "rr-active", text: said("b_work", sp, tr(ui, "працює", "working")) };
  if (v.screen === "incoming") return { cls: "rr-active", text: said("b_take", sp, tr(ui, "приймає", "taking it")) };
  if (v.screen === "done") return { cls: "rr-done", text: said("b_done", sp, tr(ui, "готово", "done")) };
  return { cls: "rr-idle", text: said("b_idle", sp, tr(ui, "чекає", "idle")) };
}

export function logText(e: LiveEvent, sp: Speech): string {
  const ui = uiOf(sp.lang);
  switch (e.kind) {
    case "prompt":
      return `${chip(e.tool, sp) ?? tr(ui, "питання", "prompt")} ${e.text ?? ""}`;
    case "dispatch":
      return `→ ${e.target}${e.text ? `: ${e.text}` : ""}`;
    case "sub_start":
      return said("l_start", sp, tr(ui, "старт", "start"));
    case "sub_stop":
      return said("returns", sp, tr(ui, "готово, несе результат", "done, bringing the result"));
    case "stop":
      return e.err ? said(e.say?.a ?? "broke_off", sp, stopText(e.err)) : said("answered", sp, tr(ui, "відповів", "answered"));
    case "session_end":
      return said("closed", sp, tr(ui, "сесію закрито", "session closed"));
    case "notify":
      return e.message ? `${line(e, sp)} · ${e.message}` : line(e, sp, e.kind);
    default:
      return line(e, sp, e.kind);
  }
}

/** Ukrainian noun form for a count: plural(1, "дія", "дії", "дій") → «дія», 3 → «дії», 5 → «дій». */
export function plural(n: number, one: string, few: string, many: string): string {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return one;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
  return many;
}
