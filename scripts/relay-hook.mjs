#!/usr/bin/env node
// Agent Lounge reporter — wire into a Claude Code hook. Reads the hook JSON on stdin
// and forwards one Agent Lounge event. Configure via env: RELAY_URL, RELAY_TOKEN.
//
//   export RELAY_URL="https://your-relay.vercel.app"
//   export RELAY_TOKEN="<your ingest token>"
//
// Then add the hook (see the Connect page for the settings.json snippet).
import process from "node:process";

const URL = process.env.RELAY_URL;
const TOKEN = process.env.RELAY_TOKEN;

function readStdin() {
  return new Promise((res) => {
    let d = "";
    process.stdin.on("data", (c) => (d += c));
    process.stdin.on("end", () => res(d));
    setTimeout(() => res(d), 200);
  });
}

const raw = await readStdin();
let hook = {};
try {
  hook = JSON.parse(raw || "{}");
} catch {
  /* ignore */
}

// Map the Claude Code hook payload → an Agent Lounge event. Field names vary by hook
// (SubagentStart/Stop, Pre/PostToolUse) and CC version — adjust to taste.
const agent = hook.subagent_type || hook.agent || hook.tool_name || "agent";
const event = hook.hook_event_name || "";
const type =
  event === "SubagentStart" ? "start"
  : event === "SubagentStop" ? "complete"
  : event === "PreToolUse" ? "start"
  : "tool_call";

if (URL && TOKEN) {
  try {
    await fetch(`${URL}/api/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-relay-token": TOKEN },
      body: JSON.stringify({
        run: hook.session_id || "session",
        agent,
        name: agent,
        type,
        tool: hook.tool_name || null,
      }),
    });
  } catch {
    /* never block Claude on reporting */
  }
}

// Hooks must exit 0 and stay quiet so they don't interfere with Claude.
process.exit(0);
