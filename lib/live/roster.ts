import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const cache = new Map<string, { at: number; names: string[] }>();
const TTL_MS = 60_000;

async function isDir(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function agentsDir(cwd: string): Promise<string | null> {
  const stop = path.parse(cwd).root;
  const home = os.homedir();
  for (let dir = path.resolve(cwd); dir !== stop && dir !== home; dir = path.dirname(dir)) {
    const candidate = path.join(dir, ".claude", "agents");
    if (await isDir(candidate)) return candidate;
  }
  return null;
}

function nameOf(file: string, text: string): string {
  const fm = /^---\s*\n([\s\S]*?)\n---/.exec(text)?.[1] ?? "";
  const name = /^name:\s*["']?([^"'\n]+?)["']?\s*$/m.exec(fm)?.[1];
  return name?.trim() || path.basename(file, ".md");
}

/** The subagents a project defines in `.claude/agents/*.md` — read from disk, no model involved. */
export async function projectRoster(cwd: string): Promise<string[]> {
  const hit = cache.get(cwd);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.names;
  const dir = await agentsDir(cwd);
  let names: string[] = [];
  if (dir) {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md") && !f.startsWith("._"));
    const read = await Promise.all(
      files.map(async (f) => nameOf(f, await fs.readFile(path.join(dir, f), "utf8").catch(() => ""))),
    );
    names = [...new Set(read)].sort((a, b) => a.localeCompare(b));
  }
  cache.set(cwd, { at: Date.now(), names });
  return names;
}
