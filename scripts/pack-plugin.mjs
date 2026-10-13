import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "public", "relay-plugin.zip");
const tmp = mkdtempSync(join(tmpdir(), "relay-plugin-"));
const dir = join(tmp, "relay");
const skip = (p) => basename(p).startsWith("._") || basename(p) === ".DS_Store";
cpSync(join(root, "plugin"), dir, { recursive: true, filter: (p) => !skip(p) });

const files = [];
const walk = (d) => {
  for (const name of readdirSync(d).sort()) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
};
walk(dir);
// fixed mtimes and modes, so the same plugin always packs to the same bytes and the same sha256
const fixed = new Date("2026-01-01T00:00:00Z");
for (const p of files) {
  chmodSync(p, p.endsWith(".sh") ? 0o755 : 0o644);
  utimesSync(p, fixed, fixed);
}

rmSync(out, { force: true });
execFileSync("zip", ["-X", "-q", "-D", out, "-@"], { cwd: tmp, input: files.map((p) => relative(tmp, p)).join("\n") });
rmSync(tmp, { recursive: true, force: true });

// the connect phrase downloads the hook script on its own and checks it against this sum
const script = join(root, "public", "relay.sh");
copyFileSync(join(root, "plugin", "scripts", "relay.sh"), script);

const hash = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const sha256 = hash(out);
const pack = { sha256, files: files.length, script: hash(script) };
writeFileSync(join(root, "lib", "live", "pluginPack.json"), JSON.stringify(pack, null, 2) + "\n");
console.log(`packed ${files.length} files → public/relay-plugin.zip\nsha256 ${sha256}\nrelay.sh ${pack.script}`);
