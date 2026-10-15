// Time to first audio (TTFA) and total time for Bulbul, through the exact code paths the app uses.
//
// Run from kanth/:  npx tsx bench/ttfa.ts
// Writes bench/results/ttfa-raw.json (incrementally, one row per trial, failures included).
// Summaries, the Markdown table and the chart come from bench/ttfa_summary.py.
//
// Fixes over the 2026-10-15 01:27 IST attempt (interrupted by a network drop at trial 156/228):
//  - v4 Flash speakers are pinned (vijay_ta_narration, shubh_hi_customer, shubh_en_narration)
//    instead of the app resolver, which picked shubh_enhi_companion for the Hindi text.
//  - a network-outage guard: if every attempt fails at the network level, wait for DNS + HTTPS to
//    come back (up to 5 min), log the outage, and retry the trial instead of burning the rest.
//  - an unrecorded clone pre-flight; if the banked voice is gone, one voice is created from
//    research/probes/ref_clip.wav (a Bulbul-generated clip, no real person).
//  - clone REST audio length uses the WAV's own sample rate.
//
// TTFA is measured outside the library: the clock starts just before the call and stops at the
// first non-empty PCM chunk handed to the sink. The value each library function reports itself
// is saved as libTtfaMs for comparison (for HTTP streaming it counts the first byte, which can be
// a bare 44-byte WAV header).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { config } from "../server/env.ts";
import { synthHttpStream, synthRest, TtsEngine, type ChunkSink, type TtsParams, type TtsResult } from "../server/bulbul.ts";
import { createVoice, synthClone } from "../server/clone.ts";
import { lookup } from "node:dns/promises";
import { parseWav } from "../server/pcm.ts";
import { currentRoster } from "../server/roster.ts";
import { PCM_SAMPLE_RATE } from "../shared/protocol.ts";
import { toneById } from "../shared/tones.ts";
import { type LangCode } from "../shared/voices.ts";

const OUT_DIR = "bench/results";
const RAW = `${OUT_DIR}/ttfa-raw.json`;
const SEED = 20261015;
const MIN_GAP_MS = 1000; // start-to-start spacing between recorded calls (rate-limit courtesy)
const MAX_ATTEMPTS = 4;

if (!config.sarvamKey) throw new Error("SARVAM_API_KEY missing (run from kanth/)");

// ---- texts: short, realistic AAC replies, 30-60 characters, native script for Indic words ----
const TEXTS = [
  { id: "ta", lang: "ta-IN" as LangCode, text: "அம்மா, எனக்கு கொஞ்சம் தண்ணீர் வேண்டும்." },
  { id: "hi", lang: "hi-IN" as LangCode, text: "मुझे थोड़ा rest चाहिए, doctor को बाद में call करो।" },
  { id: "en", lang: "en-IN" as LangCode, text: "I'm a bit tired. Can we talk after lunch?" },
];
for (const t of TEXTS) {
  const n = [...t.text].length;
  if (n < 30 || n > 60) throw new Error(`text ${t.id} is ${n} chars`);
}

const prosody = toneById("warm").prosody;
const roster = currentRoster().speakers;
const V4_SPEAKER: Record<string, string> = { ta: "vijay_ta_narration", hi: "shubh_hi_customer", en: "shubh_en_narration" };
for (const s of Object.values(V4_SPEAKER)) if (!roster.includes(s)) throw new Error(`speaker ${s} not in roster`);
function v4Speaker(t: (typeof TEXTS)[number]): string {
  return V4_SPEAKER[t.id];
}
const V3_SPEAKER: Record<string, string> = { ta: "vijay", hi: "shubh", en: "shubh" };

let voiceId = (() => {
  const raw = JSON.parse(readFileSync("research/probes/out/clone_create.json", "utf8"));
  const body = typeof raw.body === "string" ? JSON.parse(raw.body) : raw.body;
  const id = body?.data?.voice_id as string | undefined;
  if (!id) throw new Error("no voice_id in clone_create.json");
  return id;
})();
let voiceSource = "research/probes/out/clone_create.json";

// ---- conditions ----
type Model = "bulbul:v4-flash" | "bulbul:v3" | "clone";
type Tp = "rest" | "http-stream" | "ws-warm" | "ws-cold" | "clone-stream" | "clone-rest";
interface Cond { id: string; model: Model; transport: Tp; runs: number }
const CONDS: Cond[] = [
  { id: "v4-flash/rest", model: "bulbul:v4-flash", transport: "rest", runs: 10 },
  { id: "v4-flash/http-stream", model: "bulbul:v4-flash", transport: "http-stream", runs: 10 },
  { id: "v4-flash/ws-warm", model: "bulbul:v4-flash", transport: "ws-warm", runs: 10 },
  { id: "v3/rest", model: "bulbul:v3", transport: "rest", runs: 10 },
  { id: "v3/http-stream", model: "bulbul:v3", transport: "http-stream", runs: 10 },
  { id: "v3/ws-warm", model: "bulbul:v3", transport: "ws-warm", runs: 10 },
  { id: "v4-flash/ws-cold", model: "bulbul:v4-flash", transport: "ws-cold", runs: 4 },
  { id: "v3/ws-cold", model: "bulbul:v3", transport: "ws-cold", runs: 4 },
  { id: "clone/http-stream", model: "clone", transport: "clone-stream", runs: 4 },
  { id: "clone/rest", model: "clone", transport: "clone-rest", runs: 4 },
];

// ---- seeded shuffle (mulberry32 + Fisher-Yates) ----
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
interface Trial { cond: Cond; text: (typeof TEXTS)[number]; run: number }
const trials: Trial[] = [];
for (const cond of CONDS) for (const text of TEXTS) for (let run = 1; run <= cond.runs; run++) trials.push({ cond, text, run });
const rand = mulberry32(SEED);
for (let i = trials.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [trials[i], trials[j]] = [trials[j], trials[i]];
}

// ---- clone REST (POST /voices/clone, multipart, JSON with base64 WAV); same fields as synthClone ----
async function synthCloneRest(voice: string, text: string, lang: string, sink: ChunkSink): Promise<TtsResult> {
  const form = new FormData();
  form.set("voice_id", voice);
  form.set("text", text);
  form.set("language_code", lang);
  form.set("output_audio_codec", "wav");
  form.set("speech_sample_rate", String(PCM_SAMPLE_RATE));
  form.set("pace", String(prosody.pace));
  form.set("pitch", String(prosody.pitch));
  form.set("loudness", String(prosody.loudness));
  const t0 = performance.now();
  const res = await fetch(`${config.apiBase}/voices/clone`, {
    method: "POST",
    headers: { "api-subscription-key": config.sarvamKey },
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as { audio_b64?: string; audio?: string; error?: { message?: string } };
  const b64 = json.audio_b64 ?? json.audio;
  if (!res.ok || !b64) throw new Error(`clone REST ${res.status}: ${(json.error?.message ?? "no audio").slice(0, 300)}`);
  const first = performance.now();
  const wav = parseWav(Buffer.from(b64, "base64"));
  sink(wav.pcm);
  const rate = wav.sampleRate || PCM_SAMPLE_RATE;
  // samples normalised to 24 kHz so audioSec = samples / 24000 stays right for any returned rate
  const samples = Math.round(((wav.pcm.length >> 1) * PCM_SAMPLE_RATE) / rate);
  return { ttfaMs: first - t0, totalMs: performance.now() - t0, transport: "clone-rest" as never, samples };
}

// ---- engines ----
const stateLog: { ts: string; engine: string; state: string; detail?: string }[] = [];
const warmEngine = new TtsEngine();
warmEngine.onState((state, detail) => stateLog.push({ ts: new Date().toISOString(), engine: "warm", state, detail }));

function poolOpen(engine: TtsEngine, model: string): boolean {
  const pools = (engine as unknown as { pools: Map<string, { isOpen: boolean }[]> }).pools;
  return !!pools.get(model)?.some((s) => s.isOpen);
}

function params(model: "bulbul:v4-flash" | "bulbul:v3", t: (typeof TEXTS)[number]): TtsParams {
  return { text: t.text, lang: t.lang, model, speaker: model === "bulbul:v3" ? V3_SPEAKER[t.id] : v4Speaker(t), prosody };
}

interface Measured {
  ttfaMs: number;
  totalMs: number;
  libTtfaMs: number;
  libTotalMs: number;
  transportUsed: string;
  samples: number;
  connectMs?: number;
  socketWasOpen?: boolean;
  resets: number;
}

async function runOnce(tr: Trial): Promise<Measured> {
  let firstPcm = 0;
  let resets = 0;
  const sink: ChunkSink = (pcm) => {
    if (pcm.length && !firstPcm) firstPcm = performance.now();
  };
  const onReset = () => {
    resets++;
  };
  const { cond, text } = tr;
  let r: TtsResult;
  let connectMs: number | undefined;
  let socketWasOpen: boolean | undefined;
  const t0 = performance.now();
  if (cond.transport === "rest") r = await synthRest(params(cond.model as never, text), sink);
  else if (cond.transport === "http-stream") r = await synthHttpStream(params(cond.model as never, text), sink);
  else if (cond.transport === "ws-warm") {
    socketWasOpen = poolOpen(warmEngine, cond.model);
    r = await warmEngine.synth(params(cond.model as never, text), sink, onReset);
  } else if (cond.transport === "ws-cold") {
    const cold = new TtsEngine();
    cold.onState((state, detail) => stateLog.push({ ts: new Date().toISOString(), engine: "cold", state, detail }));
    try {
      r = await cold.synth(params(cond.model as never, text), sink, onReset);
    } finally {
      cold.close();
    }
  } else if (cond.transport === "clone-stream") {
    r = await synthClone({ voiceId, text: text.text, lang: text.lang, prosody }, sink);
  } else {
    r = await synthCloneRest(voiceId, text.text, text.lang, sink);
  }
  const t1 = performance.now();
  // BulbulSocket.synth starts its own clock after the socket is open, so the difference between
  // the outside wall time and the library's total time is acquire + connect.
  if (cond.transport === "ws-cold" && r.transport === "ws") connectMs = t1 - t0 - r.totalMs;
  if (!firstPcm) throw new Error("call returned without any PCM");
  return {
    ttfaMs: firstPcm - t0,
    totalMs: t1 - t0,
    libTtfaMs: r.ttfaMs,
    libTotalMs: r.totalMs,
    transportUsed: r.transport,
    samples: r.samples,
    connectMs,
    socketWasOpen,
    resets,
  };
}

function retryable(msg: string): boolean {
  return /\b(429|5\d\d)\b|rate|timeout|timed out|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up|closed 10\d\d/i.test(msg);
}

const scrub = (s: string) => s.split(config.sarvamKey).join("<redacted>");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isNetworkError(msg: string): boolean {
  return /fetch failed|ENOTFOUND|EAI_AGAIN|ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENETUNREACH|socket hang up/i.test(msg);
}

/** Poll DNS + an HTTPS round trip to the API host every 5 s, for up to 5 minutes. */
async function waitForNetwork(): Promise<{ from: string; to: string; waitedMs: number; recovered: boolean }> {
  const from = new Date().toISOString();
  const t0 = performance.now();
  while (performance.now() - t0 < 300_000) {
    try {
      await lookup(new URL(config.apiBase).hostname);
      await fetch(config.apiBase, { method: "HEAD", signal: AbortSignal.timeout(5000) });
      return { from, to: new Date().toISOString(), waitedMs: Math.round(performance.now() - t0), recovered: true };
    } catch {
      await sleep(5000);
    }
  }
  return { from, to: new Date().toISOString(), waitedMs: Math.round(performance.now() - t0), recovered: false };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const started = new Date();
  const meta = {
    started: started.toISOString(),
    startedIST: started.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }),
    network: "a home connection in India",
    node: process.version,
    os: `${platform()} ${release()}`,
    cpu: cpus()[0]?.model,
    seed: SEED,
    minGapMs: MIN_GAP_MS,
    prosody: { tone: "warm", ...prosody },
    texts: TEXTS.map((t) => ({ ...t, chars: [...t.text].length, v4Speaker: v4Speaker(t), v3Speaker: V3_SPEAKER[t.id] })),
    cloneVoiceId: voiceId,
    cloneVoiceSource: voiceSource,
    rosterSource: currentRoster().source,
    concurrency:
      "Two other agents may have been calling the Sarvam API (same account) at the same time as this run; " +
      "this bench's own calls were strictly sequential.",
    outages: [] as unknown[],
    clonePreflight: null as unknown,
    conditions: CONDS,
    method:
      "TTFA = wall time from just before the library call to the first non-empty PCM chunk at the sink. " +
      "rest/http-stream: synthRest/synthHttpStream from server/bulbul.ts (Node fetch, keep-alive pool). " +
      "ws-warm: one TtsEngine (server/bulbul.ts) warmed with engine.warm() plus 2 unrecorded utterances per model. " +
      "ws-cold: a new TtsEngine per run (socket opened inside the call); connectMs = wall total - library total. " +
      "clone/http-stream: synthClone (server/clone.ts). clone/rest: POST /voices/clone, same multipart fields, ttfa = full response. " +
      "v4 Flash speakers pinned per language (vijay_ta_narration, shubh_hi_customer, shubh_en_narration); v3 uses vijay/shubh/shubh. " +
      "Prosody = Warm preset for every call (v3 receives pace only, as in server/bulbul.ts). " +
      "Trials shuffled with a fixed seed and run strictly sequentially, at least 1 s start-to-start; " +
      "429/5xx/network errors retried up to 4 attempts with 1/2/4 s backoff; failures kept as rows with ok=false.",
    warmups: [] as unknown[],
  };
  const rows: unknown[] = [];
  const save = () => writeFileSync(RAW, JSON.stringify({ meta, stateLog, rows }, null, 1));

  // Warm the socket pools: v4 Flash via engine.warm(), v3 lazily; then 2 unrecorded utterances each.
  await warmEngine.warm();
  for (const model of ["bulbul:v4-flash", "bulbul:v3"] as const) {
    for (let i = 0; i < 2; i++) {
      const t = TEXTS[i % TEXTS.length];
      const t0 = performance.now();
      try {
        const r = await warmEngine.synth(params(model, t), () => {}, () => {});
        meta.warmups.push({ model, text: t.id, transport: r.transport, wallMs: Math.round(performance.now() - t0) });
      } catch (e) {
        meta.warmups.push({ model, text: t.id, error: scrub(String((e as Error).message)) });
      }
    }
  }
  console.log(`warm-ups done: ${JSON.stringify(meta.warmups)}`);
  save();

  // Clone pre-flight (unrecorded). Reuse the banked voice; create one from the Bulbul-generated
  // reference clip only if the banked voice is rejected.
  const pf = async () => {
    const t0 = performance.now();
    await synthClone({ voiceId, text: TEXTS[2].text, lang: TEXTS[2].lang, prosody }, () => {});
    return Math.round(performance.now() - t0);
  };
  try {
    meta.clonePreflight = { voice: "banked", wallMs: await pf() };
  } catch (e) {
    const msg = scrub(String((e as Error).message));
    console.log(`clone pre-flight failed: ${msg.slice(0, 200)}`);
    if (/clone 4\d\d\b/.test(msg)) {
      const created = await createVoice(readFileSync("research/probes/ref_clip.wav"), "kanth-bench-ref", "en-IN");
      voiceId = created.voiceId;
      voiceSource = "created from research/probes/ref_clip.wav during this run";
      writeFileSync(`${OUT_DIR}/clone-voice-created.json`, JSON.stringify({ voiceId, created: new Date().toISOString() }, null, 1));
      (meta as Record<string, unknown>).cloneVoiceId = voiceId;
      (meta as Record<string, unknown>).cloneVoiceSource = voiceSource;
      meta.clonePreflight = { voice: "created", firstError: msg.slice(0, 200), wallMs: await pf() };
    } else {
      meta.clonePreflight = { voice: "banked", error: msg.slice(0, 200) };
    }
  }
  console.log(`clone pre-flight: ${JSON.stringify(meta.clonePreflight)}`);
  save();

  let lastStart = 0;
  for (let i = 0; i < trials.length; i++) {
    const tr = trials[i];
    const attemptErrors: string[] = [];
    let m: Measured | null = null;
    let ts = "";
    for (let round = 1; round <= 2 && !m; round++) {
    if (round === 2) {
      // Every attempt failed. If that was the network (not the API), wait for it and try once more.
      if (!attemptErrors.every(isNetworkError)) break;
      const outage = await waitForNetwork();
      meta.outages.push({ beforeTrial: i + 1, ...outage });
      save();
      console.log(`network outage before trial ${i + 1}: ${JSON.stringify(outage)}`);
      if (!outage.recovered) break;
    }
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const wait = lastStart + MIN_GAP_MS - performance.now();
      if (wait > 0) await sleep(wait);
      lastStart = performance.now();
      ts = new Date().toISOString();
      try {
        m = await runOnce(tr);
        break;
      } catch (e) {
        const msg = scrub(String((e as Error).message ?? e));
        attemptErrors.push(msg.slice(0, 300));
        if (!retryable(msg) || attempt === MAX_ATTEMPTS) break;
        await sleep(1000 * 2 ** (attempt - 1));
      }
    }
    }
    const fellBack = m && tr.cond.transport.startsWith("ws") && m.transportUsed !== "ws";
    const row = {
      order: i + 1,
      condition: tr.cond.id,
      model: tr.cond.model,
      transport: tr.cond.transport,
      transportUsed: m?.transportUsed ?? null,
      lang: tr.text.lang,
      textId: tr.text.id,
      run: tr.run,
      ok: !!m && !fellBack,
      error: m ? (fellBack ? `fell back to ${m.transportUsed}` : null) : attemptErrors.at(-1) ?? "unknown",
      attempts: attemptErrors.length + (m ? 1 : 0),
      attemptErrors,
      ttfaMs: m ? +m.ttfaMs.toFixed(1) : null,
      totalMs: m ? +m.totalMs.toFixed(1) : null,
      libTtfaMs: m ? +m.libTtfaMs.toFixed(1) : null,
      libTotalMs: m ? +m.libTotalMs.toFixed(1) : null,
      connectMs: m?.connectMs !== undefined ? +m.connectMs.toFixed(1) : null,
      socketWasOpen: m?.socketWasOpen ?? null,
      resets: m?.resets ?? 0,
      audioSec: m ? +(m.samples / PCM_SAMPLE_RATE).toFixed(3) : null,
      ts,
    };
    rows.push(row);
    save();
    console.log(
      `${String(i + 1).padStart(3)}/${trials.length} ${tr.cond.id.padEnd(22)} ${tr.text.id} #${tr.run} ` +
        (m ? `ttfa ${row.ttfaMs} total ${row.totalMs} audio ${row.audioSec}s${fellBack ? " FELLBACK" : ""}` : `FAIL ${row.error}`),
    );
  }
  warmEngine.close();
  (meta as Record<string, unknown>).finished = new Date().toISOString();
  save();
  console.log("done");
  process.exit(0);
}

main().catch((e) => {
  console.error(scrub(String(e?.stack ?? e)));
  process.exit(1);
});
