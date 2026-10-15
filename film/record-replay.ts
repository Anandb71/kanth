// Records a real run of the interactive demo against the hosted build, to ship as Kanth's fallback:
// if Sarvam cannot be reached during judging, the demo replays this run and says so on screen.
// Every transcript, draft and voice in it is what Sarvam actually returned during this recording.
// It records inside the page, at the transport, so streamed drafts and audio are captured exactly as the app got them.
// Needs the hosted build served locally: node scripts/build-vercel.mjs && node scripts/serve-vercel-output.mjs 5190
// Run from kanth/film: npx tsx record-replay.ts
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const base = process.env.KANTH_URL ?? "http://localhost:5190";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "web", "public", "replay");

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// Draft from final transcripts only, so every recorded draft set is keyed by the text the replay will see.
await ctx.addInitScript(() => localStorage.setItem("kanth.settings.v1", JSON.stringify({ speculate: false })));
const page = await ctx.newPage();
await page.goto(`${base}/?demo`);
await page.waitForTimeout(2500);

const rec = await page.evaluate(async () => {
  const w = window as any;
  const k = w.kanth;
  const requests: Record<string, any> = {};
  const lines: Record<string, string[]> = {};
  const audio: Record<string, string[]> = {};
  const ends: Record<string, any> = {};
  const texts: Record<string, { text: string; lang: string }> = {};
  const finals: string[] = [];
  const send = k.socket.send.bind(k.socket);
  k.socket.send = (m: any) => {
    if (m.t === "suggest") requests[m.turnId] = m;
    return send(m);
  };
  k.socket.on((m: any) => {
    if (m.t === "suggestion" || m.t === "suggestions_done") (lines[m.turnId] ??= []).push(JSON.stringify(m));
    if (m.t === "suggestion") texts[`${m.turnId}:${m.idx}`] = { text: m.text, lang: m.lang };
    if (m.t === "audio") (audio[m.id] ??= []).push(m.pcm);
    if (m.t === "audio_end") ends[m.id] = m;
    if (m.t === "transcript" && m.final) finals.push(m.text);
  });
  w.kanthAudio.unlock();
  await w.kanthDemo.run({ film: true });
  await new Promise((r) => setTimeout(r, 1500));
  return { requests, lines, audio, ends, texts, finals };
});
await browser.close();

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const suggest: Record<string, string[]> = {};
const synth: Record<string, { file: string; speaker: string; model: string; substituted: boolean }> = {};
for (const [turnId, req] of Object.entries(rec.requests)) {
  if (rec.lines[turnId]) suggest[[req.partner.text, req.tone, req.keywords ?? ""].join("|")] = rec.lines[turnId]!;
}
for (const [id, chunks] of Object.entries(rec.audio)) {
  const [turnId, idx, tone] = id.split(":");
  const req = rec.requests[turnId!];
  const t = rec.texts[`${turnId}:${idx}`];
  if (!req || !t || !tone) continue; // only drafted replies; partner lines and phrases ship separately
  const key = [t.text, t.lang, tone, req.voice?.name ?? ""].join("|");
  const pcm = Buffer.concat(chunks.map((c) => Buffer.from(c, "base64")));
  const file = `${createHash("sha1").update(key).digest("hex").slice(0, 16)}.pcm`;
  writeFileSync(join(OUT, file), pcm);
  const e = rec.ends[id] ?? {};
  synth[key] = { file, speaker: e.speaker ?? "", model: e.model ?? "bulbul:v4-flash", substituted: !!e.substituted };
}
writeFileSync(join(OUT, "replay.json"), JSON.stringify({ recorded: new Date().toISOString(), source: base, finals: rec.finals, suggest, synth }, null, 1));
console.log(`recorded ${rec.finals.length} scenes, ${Object.keys(suggest).length} draft sets, ${Object.keys(synth).length} voices`);
