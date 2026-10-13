import { AgentView } from "@/lib/cafe/timeline";
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

export function badge(v: AgentView, carrying: boolean): { cls: string; text: string } {
  if (v.walker) return { cls: "rr-active", text: carrying ? "несе" : "вертається" };
  if (v.screen === "work") return { cls: "rr-active", text: "працює" };
  if (v.screen === "incoming") return { cls: "rr-active", text: "приймає" };
  if (v.screen === "done") return { cls: "rr-done", text: "готово" };
  return { cls: "rr-idle", text: "чекає" };
}

export function logText(e: LiveEvent): string {
  switch (e.kind) {
    case "prompt":
      return `${e.tool ?? "питання"} ${e.text ?? ""}`;
    case "dispatch":
      return `→ ${e.target}: ${e.text ?? ""}`;
    case "sub_start":
      return "старт";
    case "sub_stop":
      return "готово, несе результат";
    case "stop":
      return "відповів";
    case "session_end":
      return "сесію закрито";
    default:
      return e.text ?? e.kind;
  }
}
