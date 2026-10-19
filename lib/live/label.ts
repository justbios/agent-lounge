import type { Ui } from "@/lib/i18n";

export function sessionLabel(cwd?: string, ui: Ui = "uk"): string {
  if (!cwd) return ui === "en" ? "session" : "сесія";
  const parts = cwd.split("/").filter(Boolean);
  const wt = parts.lastIndexOf("worktrees");
  if (wt >= 0 && parts[wt + 1]) return parts[wt + 1];
  return parts[parts.length - 1] ?? cwd;
}
