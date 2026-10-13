import { AgentView } from "@/lib/cafe/timeline";
import { Speech, chip, line, said } from "@/lib/live/speech";
import { stopText } from "@/lib/live/attention";
import { LiveEvent } from "@/lib/live/types";

export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} с тому`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} хв тому`;
  return `${Math.round(m / 60)} год тому`;
}

export function clockTime(at: number): string {
  return new Date(at).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function badge(v: AgentView, carrying: boolean, sp: Speech): { cls: string; text: string } {
  if (v.walker) {
    return { cls: "rr-active", text: carrying ? said("b_carry", sp, "несе") : said("b_back", sp, "вертається") };
  }
  if (v.screen === "work") return { cls: "rr-active", text: said("b_work", sp, "працює") };
  if (v.screen === "incoming") return { cls: "rr-active", text: said("b_take", sp, "приймає") };
  if (v.screen === "done") return { cls: "rr-done", text: said("b_done", sp, "готово") };
  return { cls: "rr-idle", text: said("b_idle", sp, "чекає") };
}

export function logText(e: LiveEvent, sp: Speech): string {
  switch (e.kind) {
    case "prompt":
      return `${chip(e.tool, sp) ?? "питання"} ${e.text ?? ""}`;
    case "dispatch":
      return `→ ${e.target}: ${e.text ?? ""}`;
    case "sub_start":
      return said("l_start", sp, "старт");
    case "sub_stop":
      return said("returns", sp, "готово, несе результат");
    case "stop":
      return e.err ? said(e.say?.a ?? "broke_off", sp, stopText(e.err)) : said("answered", sp, "відповів");
    case "session_end":
      return said("closed", sp, "сесію закрито");
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
