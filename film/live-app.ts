// Measures the live app end to end and saves every turn's timings to bench/results/live-app.json.
// Runs the interactive demo three times in a headless browser (Saaras, drafting, Bulbul prespeak all live),
// with a simulated user choosing after a pause. Needs the server on :5173 (or KANTH_URL).
// Run from kanth/film: npx tsx live-app.ts [runs]
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const base = process.env.KANTH_URL ?? "http://localhost:5173";
const runs = Number(process.argv[2] ?? 3);
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const turns: Record<string, unknown>[] = [];
for (let r = 0; r < runs; r++) {
  await page.goto(`${base}/?demo`);
  await page.waitForTimeout(2500);
  const m = await page.evaluate(async () => {
    const w = window as any;
    w.kanthAudio.unlock();
    await w.kanthDemo.run({ film: true });
    return w.kanth.state.metrics;
  });
  for (const t of m) if (t.partnerEndAt && !t.redraft) turns.push({ run: r + 1, ...t });
  console.log(`run ${r + 1}: ${m.length} turns`);
}
await browser.close();

const rel = (t: any, k: string) => (typeof t[k] === "number" ? t[k] - t.partnerEndAt : null);
const rows = turns.map((t: any) => ({
  run: t.run,
  speculative: !!t.speculative,
  transcriptMs: rel(t, "transcriptAt"),
  firstReplyMs: rel(t, "firstCardAt"),
  allRepliesMs: rel(t, "allCardsAt"),
  allVoicedMs: rel(t, "allReadyAt"),
  choiceToAudibleMs: t.toAudibleMs ?? null,
  prespoken: t.prespoken ?? null,
}));
const pick = (k: keyof (typeof rows)[number]) => rows.map((x) => x[k]).filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
const pct = (xs: number[], p: number) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor(p * (xs.length - 1) + 0.5))]! : null);
const summary = Object.fromEntries(
  (["transcriptMs", "firstReplyMs", "allRepliesMs", "allVoicedMs", "choiceToAudibleMs"] as const).map((k) => {
    const xs = pick(k);
    return [k, { n: xs.length, min: xs[0] ?? null, p50: pct(xs, 0.5), max: xs[xs.length - 1] ?? null }];
  }),
);
const out = {
  measured: new Date().toISOString(),
  note: "Live app, interactive demo with simulated choices, headless Chromium on the same machine as the server. Times are ms from the moment the partner's audio ended. Negative means before the partner finished (drafting while they talk). choiceToAudibleMs includes the browser's reported output latency.",
  runs,
  summary,
  rows,
};
const file = join(dirname(fileURLToPath(import.meta.url)), "..", "bench", "results", "live-app.json");
writeFileSync(file, JSON.stringify(out, null, 1));
console.log(JSON.stringify(summary, null, 1));
