// Lets plain Node run the TypeScript under lib/ for quick checks: `node --import ./scripts/ts-resolve.mjs <script>`.
// Node strips the types itself; this only adds the ".ts" the imports leave out and maps "@/" to the project root.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      import { existsSync } from "node:fs";
      import { fileURLToPath, pathToFileURL } from "node:url";
      const root = ${JSON.stringify(new URL("..", import.meta.url).href)};
      export async function resolve(spec, ctx, next) {
        let s = spec.startsWith("@/") ? new URL(spec.slice(2), root).href : spec;
        if ((s.startsWith(".") || s.startsWith("file:")) && !/\\.[cm]?[jt]s$/.test(s)) {
          const url = new URL(s, ctx.parentURL);
          for (const ext of [".ts", ".tsx", "/index.ts"]) {
            if (existsSync(fileURLToPath(url) + ext)) return next(url.href + ext, ctx);
          }
        }
        return next(s, ctx);
      }
    `),
  import.meta.url,
);
