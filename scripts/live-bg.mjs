#!/usr/bin/env node
// Builds Agent Lounge and keeps it running in the background on 127.0.0.1:3737, detached from the terminal.
//   node scripts/live-bg.mjs            start (no-op when already up)
//   node scripts/live-bg.mjs --restart  stop, rebuild, start — after a git pull
//   node scripts/live-bg.mjs --stop
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LIVE_PORT } from "../lib/live/hookConfig.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.RELAY_PORT) || LIVE_PORT;
const url = `http://127.0.0.1:${port}`;
const data = path.join(root, "data");
const pidFile = path.join(data, "server.pid");
const logFile = path.join(data, "server.log");
const next = path.join(root, "node_modules", "next", "dist", "bin", "next");
const args = new Set(process.argv.slice(2));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function up() {
  try {
    const r = await fetch(`${url}/api/roster`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

function readPid() {
  try {
    const pid = Number(fs.readFileSync(pidFile, "utf8").trim());
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

async function stop() {
  const pid = readPid();
  fs.rmSync(pidFile, { force: true });
  if (!pid) return false;
  process.kill(pid, "SIGTERM");
  for (let i = 0; i < 50 && (await up()); i++) await sleep(200);
  return true;
}

if (args.has("--stop") || args.has("--restart")) {
  const stopped = await stop();
  if (args.has("--stop")) {
    console.log(
      stopped ? "✓ Agent Lounge stopped." : "No Agent Lounge started by this script is running — nothing to stop.",
    );
    process.exit(0);
  }
}

if (await up()) {
  if (args.has("--restart") && !readPid()) {
    console.error(`✗ The Agent Lounge on ${url} was started outside this script — stop it (Ctrl+C in its terminal), then run this again.`);
    process.exit(1);
  }
  console.log(
    readPid()
      ? `✓ Agent Lounge is already running: ${url}`
      : `✓ Something already answers on ${url} (an Agent Lounge started with \`npm run live\`?). Leaving it as is.`,
  );
  process.exit(0);
}

if (!fs.existsSync(next)) {
  console.error("✗ Dependencies are missing — run `npm install` first.");
  process.exit(1);
}

console.log("Building Agent Lounge (about a minute the first time)…");
const build = spawnSync(process.execPath, [next, "build", "--webpack"], { cwd: root, stdio: "inherit" });
if (build.status !== 0) {
  console.error("✗ Build failed — see the output above.");
  process.exit(1);
}

fs.mkdirSync(data, { recursive: true });
const out = fs.openSync(logFile, "a");
const child = spawn(process.execPath, [next, "start", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: root,
  detached: true,
  stdio: ["ignore", out, out],
  windowsHide: true,
});
fs.writeFileSync(pidFile, String(child.pid));
child.unref();

for (let i = 0; i < 100; i++) {
  if (await up()) {
    console.log(`✓ Agent Lounge is running in the background: ${url}`);
    console.log(`  log: ${logFile}   stop: npm run down`);
    process.exit(0);
  }
  if (child.exitCode != null) break;
  await sleep(300);
}
console.error(`✗ Agent Lounge did not come up on ${url} — see ${logFile}`);
process.exit(1);
