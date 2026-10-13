export function sessionLabel(cwd?: string): string {
  if (!cwd) return "сесія";
  const parts = cwd.split("/").filter(Boolean);
  const wt = parts.lastIndexOf("worktrees");
  if (wt >= 0 && parts[wt + 1]) return parts[wt + 1];
  return parts[parts.length - 1] ?? cwd;
}
