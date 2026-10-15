// Builds Kanth's hosted mode for Vercel with the Build Output API (https://vercel.com/docs/build-output-api).
// The client is built with VITE_TRANSPORT=http, and each handler in server/hosted.ts is bundled into one
// self-contained Node function that streams its response. Deploy with:
//   node scripts/build-vercel.mjs && vercel deploy --prebuilt --prod
// The Sarvam key is a Vercel environment variable (SARVAM_API_KEY); it is never part of the build.
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, ".vercel", "output");
const REGION = process.env.KANTH_VERCEL_REGION ?? "bom1"; // Mumbai, close to Sarvam
// One function serves every endpoint, so one warm instance answers them all (see handleApi).
const FUNCTIONS = { kanth: "handleApi" };

// esbuild does not type-check, so a type error must stop the build here instead of shipping.
execSync("npx tsc --noEmit -p .", { cwd: root, stdio: "inherit" });
execSync("npx vite build --logLevel warn", { cwd: root, stdio: "inherit", env: { ...process.env, VITE_TRANSPORT: "http" } });

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "static"), { recursive: true });
cpSync(join(root, "dist"), join(out, "static"), { recursive: true });
// The demo film and poster, linked from the site.
mkdirSync(join(out, "static", "media"), { recursive: true });
for (const f of ["kanth-demo.mp4", "poster.png"]) cpSync(join(root, "docs", "media", f), join(out, "static", "media", f));

for (const [name, handler] of Object.entries(FUNCTIONS)) {
  const dir = join(out, "functions", "api", `${name}.func`);
  mkdirSync(dir, { recursive: true });
  await build({
    stdin: { contents: `export { ${handler} as default } from "./server/hosted.ts";`, resolveDir: root, loader: "ts", sourcefile: `${name}.ts` },
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile: join(dir, "index.mjs"),
    external: ["bufferutil", "utf-8-validate"],
    // ws is CommonJS; give the ESM bundle a require for it.
    banner: { js: "import { createRequire as __kanthRequire } from 'node:module'; const require = __kanthRequire(import.meta.url);" },
    logLevel: "warning",
  });
  writeFileSync(
    join(dir, ".vc-config.json"),
    JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, supportsResponseStreaming: true, maxDuration: 30, regions: [REGION] }, null, 1),
  );
}

writeFileSync(
  join(out, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "/assets/(.*)", headers: { "cache-control": "public, max-age=31536000, immutable" }, continue: true },
        { src: "^/api/(status|synth|suggest|stt|translit)$", dest: "/api/kanth?fn=$1" },
        { handle: "filesystem" },
        { src: "/api/(.*)", status: 404, dest: "/404" },
        { src: "/(.*)", dest: "/index.html" },
      ],
    },
    null,
    1,
  ),
);
console.log(`Built .vercel/output: static client + ${Object.keys(FUNCTIONS).length} functions in ${REGION}`);
