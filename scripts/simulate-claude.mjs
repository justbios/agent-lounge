#!/usr/bin/env node
// Plays a made-up Claude Code session into a local Relay, using the exact hook payloads Claude Code sends.
//   node scripts/simulate-claude.mjs [url]
// SIM_CWD sets the folder the fake session claims to run in; its .claude/agents/ becomes the roster.
const URL = process.argv[2] ?? "http://127.0.0.1:3737/api/claude-hook";
const session = `sim-${Date.now().toString(36)}`;
const cwd = process.env.SIM_CWD ?? process.cwd();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function send(hook) {
  await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: session, cwd, ...hook }),
  }).catch(() => {});
}

const tool = (name, input, agent) => send({ hook_event_name: "PreToolUse", tool_name: name, tool_input: input, ...agent });
const as = (id, type) => ({ agent_id: id, agent_type: type });

async function subagent(id, type, steps) {
  await send({ hook_event_name: "SubagentStart", ...as(id, type) });
  for (const [ms, name, input] of steps) {
    await sleep(ms);
    await tool(name, input, as(id, type));
  }
  await sleep(1500);
  await send({ hook_event_name: "SubagentStop", ...as(id, type), last_assistant_message: "done" });
}

await send({ hook_event_name: "UserPromptSubmit", prompt: "додай темну тему в налаштування і перевір на симуляторі" });
await sleep(1200);
await tool("Read", { file_path: "/src/screens/settings/SettingsScreen.tsx" });
await sleep(1500);
await tool("Grep", { pattern: "useColorScheme" });
await sleep(1400);

await tool("Agent", { subagent_type: "Explore", description: "знайти всі кольори в темі", prompt: "…" });
await sleep(300);
const explore = subagent("a1", "Explore", [
  [1800, "Glob", { pattern: "src/theme/**/*.ts" }],
  [2200, "Read", { file_path: "/src/theme/colors.ts" }],
  [2000, "Grep", { pattern: "#[0-9a-f]{6}" }],
  [2400, "Read", { file_path: "/src/theme/index.ts" }],
]);

await sleep(900);
await tool("Agent", { subagent_type: "planner", description: "розписати план темної теми", prompt: "…" });
await sleep(300);
const planner = subagent("a2", "planner", [
  [2600, "Read", { file_path: "/docs/ARCHITECTURE.md" }],
  [3000, "Write", { file_path: "/.agents/plans/dark-theme.md" }],
]);

await sleep(1800);
await tool("TodoWrite", {});
await Promise.all([explore, planner]);
await sleep(2500);

await tool("Agent", { subagent_type: "frontend-impl", description: "реалізувати темну тему", prompt: "…" });
await sleep(300);
await subagent("a3", "frontend-impl", [
  [2000, "Edit", { file_path: "/src/theme/colors.ts" }],
  [2400, "Write", { file_path: "/src/theme/dark.ts" }],
  [2200, "Edit", { file_path: "/src/screens/settings/SettingsScreen.tsx" }],
  [2600, "Bash", { command: "npx tsc --noEmit", description: "Typecheck the project" }],
]);
await sleep(2500);

await tool("Agent", { subagent_type: "reviewer", description: "рев'ю диффу", prompt: "…" });
await sleep(300);
const reviewer = subagent("a4", "reviewer", [
  [2000, "Bash", { command: "git diff origin/dev", description: "Show the diff against dev" }],
  [2600, "Read", { file_path: "/src/theme/dark.ts" }],
]);
await sleep(700);
await tool("Agent", { subagent_type: "qa-rn", description: "перевірити на симуляторі", prompt: "…" });
await sleep(300);
const qa = subagent("a5", "qa-rn", [
  [2400, "mcp__argent__launch-app", {}],
  [2600, "mcp__argent__describe", {}],
  [2200, "mcp__argent__gesture-tap", {}],
  [2400, "mcp__argent__screenshot", {}],
]);
await Promise.all([reviewer, qa]);
await sleep(2500);

await tool("Bash", { command: "git commit -m 'feat: dark theme'", description: "Commit the dark theme" });
await sleep(1800);
await send({ hook_event_name: "Stop", last_assistant_message: "Готово" });
console.log(`played session ${session}`);
