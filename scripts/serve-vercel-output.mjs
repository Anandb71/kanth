// Serves .vercel/output locally (static files plus the bundled functions) to test hosted mode before deploying.
// Usage, from kanth/: node scripts/build-vercel.mjs && node scripts/serve-vercel-output.mjs [port]
import http from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..", ".vercel", "output");
const port = Number(process.argv[2] ?? 5190);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".webmanifest": "application/manifest+json" };
const fns = {};

http
  .createServer(async (req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    const m = path.match(/^\/api\/([a-z]+)$/);
    if (m) {
      // Mirrors the deployed rewrite: every endpoint goes to the one combined function.
      const file = join(root, "functions", "api", "kanth.func", "index.mjs");
      if (!existsSync(file)) return void res.writeHead(404).end();
      fns.kanth ??= (await import(pathToFileURL(file).href)).default;
      const q = (req.url ?? "").split("?")[1];
      req.url = `/api/kanth?fn=${m[1]}${q ? `&${q}` : ""}`;
      return void fns.kanth(req, res);
    }
    let file = normalize(join(root, "static", path === "/" ? "index.html" : path));
    if (!existsSync(file) || !statSync(file).isFile()) file = join(root, "static", "index.html");
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  })
  .listen(port, "127.0.0.1", () => console.log(`hosted build at http://localhost:${port}`));
