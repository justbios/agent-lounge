#!/usr/bin/env node
// Adds (or with --remove takes out) the Relay hooks in the user's Claude Code settings, and the hook script they run.
//   node scripts/install-hooks.mjs [--remove] [--dry-run] [--statusline]
// --statusline also adds Relay's status line, which saves the subscription limits; an existing one keeps its output.
// Other hooks and settings are left as they are; the old file is kept next to it as a backup.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HOOK_EVENTS, STATUS_LINE, hookEntry, isRelayHook, statusChain } from "../lib/live/hookConfig.mjs";

const args = new Set(process.argv.slice(2));
const remove = args.has("--remove");
const dry = args.has("--dry-run");
const withStatus = args.has("--statusline");
const dir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
const file = path.join(dir, "settings.json");

let text = "";
let settings = {};
try {
  text = fs.readFileSync(file, "utf8");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
if (text.trim()) {
  try {
    settings = JSON.parse(text);
  } catch {
    console.error(`✗ ${file} is not valid JSON — fix it first, nothing was changed.`);
    process.exit(1);
  }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hooks = { ...(settings.hooks ?? {}) };
const events = new Set(remove ? Object.keys(hooks) : [...Object.keys(hooks), ...HOOK_EVENTS]);
const touched = [];

for (const event of events) {
  const groups = Array.isArray(hooks[event]) ? hooks[event] : [];
  const relay = groups.flatMap((g) => (g.hooks ?? []).filter(isRelayHook));
  const want = !remove && HOOK_EVENTS.includes(event);
  if (want && relay.length === 1 && same(relay[0], hookEntry(event))) continue;
  if (!want && relay.length === 0) continue;

  const kept = groups
    .map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !isRelayHook(h)) }))
    .filter((g, i) => g.hooks.length > 0 || (groups[i].hooks ?? []).length === 0);
  if (want) kept.push({ hooks: [hookEntry(event)] });
  if (kept.length) hooks[event] = kept;
  else delete hooks[event];
  touched.push(event);
}

const status = settings.statusLine;
const chained = typeof status?.command === "string" ? status.command.match(/relay\.sh" limits; .*\| \( (.*) \)$/) : null;
let nextStatus = status;
if (remove && status?.command === STATUS_LINE.command) nextStatus = undefined;
else if (remove && chained) nextStatus = { ...status, command: chained[1] };
else if (!remove && withStatus && !status) nextStatus = STATUS_LINE;
else if (!remove && withStatus && typeof status.command === "string" && !status.command.includes("relay.sh"))
  nextStatus = { ...status, command: statusChain(status.command) };
if (nextStatus !== status) touched.push("statusLine");

const script = path.join(os.homedir(), ".config", "relay", "relay.sh");
const source = fileURLToPath(new URL("../plugin/scripts/relay.sh", import.meta.url));
const fresh = remove || (fs.existsSync(script) && fs.readFileSync(script, "utf8") === fs.readFileSync(source, "utf8"));
if (!fresh && !dry) {
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.copyFileSync(source, script);
  console.log(`✓ Hook script: ${script}`);
}

if (!touched.length) {
  console.log(remove ? "✓ No Relay hooks found — nothing to remove." : `✓ Relay hooks already in ${file}`);
  process.exit(0);
}

const next = { ...settings };
if (Object.keys(hooks).length) next.hooks = hooks;
else delete next.hooks;
if (nextStatus) next.statusLine = nextStatus;
else delete next.statusLine;

if (dry) {
  console.log(`would ${remove ? "remove Relay hooks from" : "add Relay hooks to"} ${file}: ${touched.join(", ")}`);
  process.exit(0);
}

fs.mkdirSync(dir, { recursive: true });
if (text) fs.writeFileSync(`${file}.bak-relay`, text);
const tmp = `${file}.relay-tmp`;
fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n");
fs.renameSync(tmp, file);

console.log(`✓ ${remove ? "Removed Relay hooks from" : "Added Relay hooks to"} ${file} (${touched.join(", ")})`);
if (text) console.log(`  backup: ${file}.bak-relay`);
if (!remove) console.log("  New Claude Code sessions report to Relay; the desktop app picks the hooks up in open ones too.");
if (!remove && !withStatus && !status)
  console.log("  Limits: add Relay's status line with `node scripts/install-hooks.mjs --statusline` (terminal Claude Code only).");
