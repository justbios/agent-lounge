import { Say } from "./types";

type Json = Record<string, unknown>;

const MAX_NAME = 32;
const MAX_FREE = 60;

const KINDS: [RegExp, string][] = [
  [/(^|\/)(locales?|i18n|lang|translations?)\/|\.(po|strings|arb)$/i, "locale"],
  [/\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)(__tests__|tests?|e2e|maestro)\//i, "test"],
  [/\.sql$|(^|\/)(migrations?|supabase\/functions)\//i, "db"],
  [/\.(md|mdx|txt|rst)$/i, "doc"],
  [/\.(png|jpe?g|gif|svg|webp|ico|lottie)$/i, "image"],
  [/\.(css|scss|sass|less)$|\.styles?\.[jt]sx?$|(^|\/)styles?\.[jt]sx?$/i, "style"],
  [/(^|\/)(screens?|pages?|views?)\/|Screen\.[jt]sx?$|(^|\/)app\/(.+\/)?page\.[jt]sx$/i, "screen"],
  [/(^|\/)(api|server|functions|routes?|backend)\//i, "server"],
  [/(^|\/)use[A-Z]\w*\.[jt]sx?$|(^|\/)(hooks|stores?|services|helpers|utils|lib)\//, "logic"],
  [/(^|\/)components?\/|\.[jt]sx$/i, "component"],
  [/(package(-lock)?|tsconfig[\w.-]*|app|eas)\.json$|\.(ya?ml|toml|plist|xcconfig|gradle|properties)$/i, "config"],
  [/(^|\/)(\.env[\w.]*|Podfile|Gemfile|[\w.-]*\.config\.[cm]?[jt]s)$/i, "config"],
  [/\.([cm]?[jt]s|py|rb|go|rs|java|kt|swift|mm?|c|cpp|h|sh|sql)$/i, "code"],
];

const LEAF = /^(index|page|route|layout|main|mod|init|__init__)$/i;

/** «src/screens/profile/EditProfileScreen.tsx» → «Edit Profile»: the part of a file name a person would say aloud. */
function nameOf(path: string): string {
  const parts = path.split("/").filter(Boolean);
  let stem = (parts.pop() ?? path).replace(/\.[^.]+$/, "").replace(/\.(test|spec|styles?|stories|d)$/i, "");
  if (LEAF.test(stem) && parts.length) stem = parts.pop() ?? stem;
  const bare = stem.replace(/^use(?=[A-Z])/, "").replace(/(Screen|Component|View|Page|Modal|Container)$/, "") || stem;
  const words = bare.replace(/[_-]+/g, " ").replace(/([a-z\d])([A-Z])/g, "$1 $2").trim();
  return words.length > MAX_NAME ? `${words.slice(0, MAX_NAME - 1)}…` : words;
}

function fileSay(a: "read" | "edit" | "create", path: unknown): Say {
  const p = typeof path === "string" ? path : "";
  const k = KINDS.find(([re]) => re.test(p))?.[1] ?? "file";
  return p ? { a, k, o: nameOf(p) } : { a, k };
}

const COMMANDS: [RegExp, string][] = [
  [/\bgit\s+commit\b/, "commit"],
  [/\bgit\s+push\b/, "push"],
  [/\bgit\s+(pull|fetch|merge|rebase|cherry-pick)\b/, "pull"],
  [/\bgh\s+pr\b/, "pr"],
  [/\bvercel\b.*\bdeploy\b|\bvercel\s+--prod\b|\b(eas|fastlane)\s+submit\b|\bnetlify\s+deploy\b/, "deploy"],
  [/\b(jest|vitest|pytest|mocha)\b|\bmaestro\s+test\b/, "test"],
  [/\b(npm|yarn|pnpm|bun)\s+(run\s+)?test\b/, "test"],
  [/\b(tsc|eslint|typecheck|ruff|mypy|flake8|swiftlint)\b|\b(npm|yarn|pnpm|bun)\s+(run\s+)?lint\b/, "check"],
  [/\b(npm|yarn|pnpm|bun)\s+(i|install|add|ci)\b|\bpod\s+install\b|\bpip3?\s+install\b|\bbrew\s+install\b/, "install"],
  [/\b(xcodebuild|gradlew?|eas\s+build)\b|\b(assemble|bundle)\w*Release\b|\bnext\s+build\b/, "build"],
  [/\b(npm|yarn|pnpm|bun)\s+(run\s+)?build\b/, "build"],
  [/\b(simctl|adb|emulator|argent|maestro)\b/, "device"],
  [/\b(supabase|psql|prisma|sqlite3|mysql|pg_dump)\b/, "db"],
  [/(^|[;&|(]\s*)(rm|trash|rmdir|git\s+rm)\s/, "delete"],
  [/\b(npm|yarn|pnpm|bun)\s+(run\s+)?(dev|start|serve|ios|android)\b/, "run"],
  [/\bnext\s+(dev|start)\b|\breact-native\s+(start|run-\w+)\b/, "run"],
  [/\bgit\s+(status|diff|log|show|blame)\b/, "changes"],
  [/\bgit\s+(checkout|switch|branch|worktree|stash)\b/, "branch"],
  [/\b(curl|wget|httpie)\b/, "net"],
  [/(^|[;&|(]\s*)(mv|cp|mkdir|touch|ln|rsync|tar|unzip)\s/, "files"],
  [/(^|[;&|(]\s*)(ls|cat|head|tail|grep|rg|find|wc|less|tree|du|stat|file|sed\s+-n|awk)\b/, "look"],
  [/(^|[;&|(]\s*)(python3?|node|npx|bash|sh|zsh|ruby|deno|bun|tsx)\s/, "script"],
];

function bashSay(command: unknown, description: unknown): Say {
  const c = typeof command === "string" ? command : "";
  const a = COMMANDS.find(([re]) => re.test(c))?.[1];
  if (a) return { a };
  const d = typeof description === "string" ? description.replace(/\s+/g, " ").trim() : "";
  return d ? { a: "cmd", o: d.length > MAX_FREE ? `${d.slice(0, MAX_FREE - 1)}…` : d } : { a: "cmd" };
}

const SERVICES: [RegExp, string][] = [
  [/jira|clickup|linear|asana|trello|youtrack|issue|ticket/, "task"],
  [/supabase|_sql|migration|postgres|database|list_tables/, "db"],
  [/argent|simulator|emulator|ios_sim|gesture|maestro/, "device"],
  [/figma|design/, "design"],
  [/notion|confluence|context7|wiki|search_docs|query-docs|docs?_/, "docs"],
  [/browser|chrome|playwright|puppeteer|navigate|preview_/, "browser"],
  [/slack|telegram|gmail|mail|send_message|chat_message/, "chat"],
  [/posthog|analytics|amplitude|mixpanel|appsflyer|revenuecat/, "analytics"],
  [/github|gitlab|pull_request/, "github"],
];

const EDITS = /create|update|edit|add|transition|comment|move|set|assign|delete/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

function mcpSay(name: string): Say {
  const n = name.toLowerCase();
  const a = SERVICES.find(([re]) => re.test(n))?.[1];
  if (a === "task") return { a: EDITS.test(n.split("__").pop() ?? "") ? "task_edit" : "task_look" };
  if (a) return { a };
  const server = name.split("__")[1] ?? "";
  if (UUID.test(server) || !server) return { a: "mcp" };
  return { a: "mcp", o: server.replace(/^Claude_/, "").replace(/[_-]+/g, " ") };
}

const clip = (v: unknown, max = MAX_FREE) => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

function host(u: unknown): string {
  try {
    return new URL(String(u)).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** A tool call in plain words: what the agent does and to what, with no file paths, commands or tool names. */
export function plainTool(name: string, input: Json): Say | undefined {
  switch (name) {
    case "Read":
      return fileSay("read", input.file_path);
    case "Write":
      return fileSay("create", input.file_path);
    case "Edit":
    case "MultiEdit":
      return fileSay("edit", input.file_path);
    case "NotebookEdit":
      return fileSay("edit", input.notebook_path);
    case "Bash":
      return bashSay(input.command, input.description);
    case "Grep":
      return { a: "search_code", o: clip(input.pattern, 32) };
    case "Glob":
      return { a: "find_files" };
    case "WebFetch":
      return { a: "web_read", o: host(input.url) };
    case "WebSearch":
      return { a: "web_search", o: clip(input.query, 48) };
    case "TodoWrite":
    case "TaskCreate":
    case "TaskUpdate":
      return { a: "plan" };
    case "Skill":
      return { a: "skill", o: clip(input.skill, 32) };
    case "SendMessage":
      return { a: "msg", o: clip(input.to, 32) };
    case "ToolSearch":
      return { a: "tools" };
    case "AskUserQuestion":
      return { a: "ask" };
    case "Workflow":
      return { a: "workflow" };
    default:
      return name.startsWith("mcp__") ? mcpSay(name) : undefined;
  }
}
