// Conversation benchmark: runs scripted partner turns through Kanth's real drafting and prespeak
// code, then judges the drafts against the user's intended replies. v2 adds a held-out set and a
// keyword-steering round for every miss.
//
// Run from kanth/ (SET is "original" = the 36 turns in conversations.data.ts, or "heldout" = the 24
// turns in conversations.heldout.ts):
//   npx tsx bench/conversations.ts draft SET        # drafting + prespeak (pool of 4) + single-synth TTFA
//   npx tsx bench/conversations.ts judge SET        # LLM judge, two independent runs per turn
//   npx tsx bench/conversations.ts translit SET     # native -> Roman for keystroke counting
//   npx tsx bench/conversations.ts keywords SET     # steering words for every miss (sees ONLY the intended reply)
//   npx tsx bench/conversations.ts steer SET        # redraft every miss with keywords=<those words>, + prespeak
//   npx tsx bench/conversations.ts steerjudge SET   # same judge protocol on the steered drafts
//   npx tsx bench/conversations_analyze.ts          # tables, conversations.json, conversations.md
//
// Raw data (v2): bench/results/v2/<SET>-raw-<stage>.json (every call kept, failures included).
// v1 raw data: bench/results/v1/ (and the untouched bench/results/conversations-raw-*.json).
// The API key is read by server/env.ts and is never printed or written.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { cpus, platform, release } from "node:os";
import { config } from "../server/env.ts";
import { streamSuggestions, buildMessages, hasForeignScript, type Draft } from "../server/suggest.ts";
import { TtsEngine, type TtsResult } from "../server/bulbul.ts";
import { currentRoster } from "../server/roster.ts";
import type { Profile, Turn } from "../shared/protocol.ts";
import { clampProsody, toneById } from "../shared/tones.ts";
import { hasLatinWords, resolveSpeaker, type LangCode } from "../shared/voices.ts";
import { PCM_SAMPLE_RATE } from "../shared/protocol.ts";
import * as ORIGINAL from "./conversations.data.ts";
import * as HELDOUT from "./conversations.heldout.ts";
import type { ScriptedTurn } from "./conversations.data.ts";

const SETS = { original: ORIGINAL, heldout: HELDOUT } as const;
type SetName = keyof typeof SETS;
const SET_NAME = (process.argv[3] ?? "original") as SetName;
if (!(SET_NAME in SETS)) throw new Error(`unknown set ${SET_NAME} (original|heldout)`);
const TURNS: ScriptedTurn[] = SETS[SET_NAME].TURNS;
const SET_LABEL: string = SETS[SET_NAME].SET_LABEL;

const OUT = "bench/results/v2";
mkdirSync(OUT, { recursive: true });
const rawPath = (stage: string) => `${OUT}/${SET_NAME}-raw-${stage}.json`;
if (!config.sarvamKey) throw new Error("SARVAM_API_KEY missing (run from kanth/)");

/** Copied from web/src/lib/settings.ts DEMO_PROFILE at commit ffb1b9c (copied, not imported, to keep DOM types out).
 *  v1 used the earlier notes "... Loves cricket and his mother's rasam."; v2 uses the trimmed notes. */
export const DEMO_PROFILE: Profile = {
  name: "Arjun",
  languages: ["ta-IN", "en-IN", "hi-IN"],
  mixStyle: "Tamil at home with English words mixed in; Hindi with his doctor and his Delhi friends",
  people: [
    { name: "Amma", relation: "mother", addressAs: "Amma" },
    { name: "Dr. Mehra", relation: "neurologist", addressAs: "Doctor" },
    { name: "Rohit", relation: "college friend", addressAs: "Rohit" },
  ],
  notes: "34, software engineer in Chennai. Has ALS and can no longer speak. Follows cricket.",
};
const TONE = "warm" as const;
const VOICE = "shubh"; // DEFAULT_SETTINGS.voice in web/src/lib/settings.ts

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const r1 = (x: number) => Math.round(x * 10) / 10;
const nowIST = () => new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

function historyFor(t: ScriptedTurn): Turn[] {
  const h: Turn[] = [];
  for (const p of TURNS) {
    if (p.thread !== t.thread) continue;
    if (p.id === t.id) break;
    h.push({ who: "partner", text: p.partner, lang: p.lang, speaker: p.who });
    h.push({ who: "me", text: p.intended, lang: p.lang });
  }
  return h;
}

// ---- capture token usage from the chat SSE without touching server/suggest.ts ----
// The wrapper passes bytes through unchanged and scans them for a `usage` object.
const realFetch = globalThis.fetch;
let lastUsage: unknown = null;
let lastSseTail = "";
globalThis.fetch = (async (input: any, init?: any) => {
  const res = await realFetch(input, init);
  const url = typeof input === "string" ? input : input?.url ?? "";
  if (!url.includes("/v1/chat/completions") || !res.body || !String(init?.body ?? "").includes('"stream":true')) return res;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const stream = new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      const { done, value } = await reader.read();
      if (done) {
        for (const line of buf.split("\n")) {
          const d = line.trim().replace(/^data:\s*/, "");
          if (!d.startsWith("{")) continue;
          try {
            const j = JSON.parse(d);
            if (j.usage) lastUsage = j.usage;
          } catch {
            /* not JSON */
          }
        }
        lastSseTail = buf.slice(-600);
        ctrl.close();
        return;
      }
      buf += dec.decode(value, { stream: true });
      if (buf.length > 200000) buf = buf.slice(-100000);
      ctrl.enqueue(value);
    },
  });
  return new Response(stream, { status: res.status, statusText: res.statusText, headers: res.headers });
}) as typeof fetch;

/** Last commit touching a file, and whether the working copy differs from it. */
function gitVersion(path: string) {
  try {
    const hash = execSync(`git log -1 --format=%h -- ${path}`, { encoding: "utf8" }).trim();
    const dirty = execSync(`git status --porcelain -- ${path}`, { encoding: "utf8" }).trim() !== "";
    return { commit: hash, dirty };
  } catch {
    return { commit: null, dirty: null };
  }
}
// v2 rule: every v2 run must use one prompt version, so refuse to run on an uncommitted prompt.
for (const f of ["server/suggest.ts", "web/src/lib/settings.ts"]) {
  if (gitVersion(f).dirty) throw new Error(`${f} has uncommitted changes; v2 runs must use a committed prompt version`);
}

function meta(stage: string) {
  return {
    stage,
    started: new Date().toISOString(),
    startedIST: nowIST(),
    setName: SET_NAME,
    set: SET_LABEL,
    setFileSha256: createHash("sha256").update(readFileSync(SET_NAME === "heldout" ? "bench/conversations.heldout.ts" : "bench/conversations.data.ts")).digest("hex"),
    suggestTsSha256: createHash("sha256").update(readFileSync("server/suggest.ts")).digest("hex"),
    suggestTsGit: gitVersion("server/suggest.ts"),
    settingsTsGit: gitVersion("web/src/lib/settings.ts"),
    profileNotes: DEMO_PROFILE.notes,
    network: "a home connection in India",
    node: process.version,
    os: `${platform()} ${release()}`,
    cpu: cpus()[0]?.model,
    condition:
      "Two other agents may have been calling the same Sarvam account concurrently during this run (shared rate limits and possibly shared backend load).",
  };
}

// =====================================================================================
// Stage 1: drafting + prespeak + single-synthesis TTFA
// =====================================================================================
interface SynthRow {
  text: string;
  chars: number;
  speaker: string;
  model: string;
  startMs: number; // relative to the suggest request
  ttfaMs: number | null; // relative to its own start
  totalMs: number | null; // relative to its own start
  libTtfaMs: number | null;
  transport: string | null;
  audioSec: number | null;
  error?: string;
}

async function synthOne(engine: TtsEngine, text: string, lang: LangCode, t0: number): Promise<SynthRow> {
  const resolved = resolveSpeaker(currentRoster().speakers, VOICE, lang, TONE, { codeMixedEnglish: hasLatinWords(text) });
  const prosody = clampProsody(toneById(TONE).prosody);
  const start = performance.now();
  let first = 0;
  const row: SynthRow = {
    text,
    chars: [...text].length,
    speaker: resolved.speaker,
    model: resolved.model,
    startMs: r1(start - t0),
    ttfaMs: null,
    totalMs: null,
    libTtfaMs: null,
    transport: null,
    audioSec: null,
  };
  try {
    const r: TtsResult = await engine.synth(
      { text, lang, model: resolved.model, speaker: resolved.speaker, prosody },
      (pcm) => {
        if (!first && pcm.length) first = performance.now();
      },
      () => {
        first = 0;
      },
    );
    const end = performance.now();
    row.ttfaMs = first ? r1(first - start) : null;
    row.totalMs = r1(end - start);
    row.libTtfaMs = r1(r.ttfaMs);
    row.transport = r.transport;
    row.audioSec = Math.round((r.samples / PCM_SAMPLE_RATE) * 1000) / 1000;
  } catch (e) {
    row.error = (e as Error).message.slice(0, 200);
  }
  return row;
}

/** keywords: id -> steering words; when given, only those turns are drafted (the steering round). */
async function stageDraft(keywords?: Record<string, string>) {
  const RAW = rawPath(keywords ? "steer" : "draft");
  const todo = keywords ? TURNS.filter((t) => keywords[t.id] != null) : TURNS;
  const engine = new TtsEngine();
  const states: string[] = [];
  engine.onState((s, d) => states.push(`${new Date().toISOString()} ${s} ${d ?? ""}`));
  await engine.warm();
  // warm-up synth so the first turn does not pay a cold socket (not recorded)
  const t0w = performance.now();
  await Promise.all([0, 1, 2, 3].map((i) => synthOne(engine, ["வணக்கம்", "नमस्ते", "Hello there", "சரி"][i]!, (["ta-IN", "hi-IN", "en-IN", "ta-IN"] as LangCode[])[i]!, t0w)));
  const out = { meta: { ...meta("draft"), profile: DEMO_PROFILE, tone: TONE, voice: VOICE, chatModel: config.chatModel, ttsPoolSize: config.ttsPoolSize, ttsStates: states }, turns: [] as any[] };

  for (const t of todo) {
    const history = historyFor(t);
    const kw = keywords?.[t.id];
    const opts = { profile: DEMO_PROFILE, history, partner: { text: t.partner, lang: t.lang, who: t.who }, tone: TONE, ...(kw ? { keywords: kw } : {}) } as const;
    const messages = buildMessages(opts);
    let attempt = 0;
    let rec: any = null;
    while (attempt < 3 && !rec) {
      attempt++;
      lastUsage = null;
      const drafts: (Draft & { atMs: number })[] = [];
      const prespeak: Promise<SynthRow>[] = [];
      const t0 = performance.now();
      try {
        // Prespeak exactly as server/session.ts does: each draft starts synthesizing the moment it is parsed.
        const stats = await streamSuggestions(opts, (d) => {
          drafts.push({ ...d, atMs: r1(performance.now() - t0) });
          prespeak.push(synthOne(engine, d.text, d.lang, t0));
        });
        const voiced = await Promise.all(prespeak);
        const tAllVoiced = performance.now() - t0;
        // Then a single synthesis on an idle warm pool: TTFA for "synthesize on choice" and for typed text.
        await sleep(300);
        const single = await synthOne(engine, t.intended, t.lang, performance.now());
        await sleep(150);
        const singleDraft0 = drafts[0] ? await synthOne(engine, drafts[0].text, drafts[0].lang, performance.now()) : null;
        const readyAt = voiced.map((v) => (v.totalMs == null ? null : r1(v.startMs + v.totalMs)));
        const firstAudioAt = voiced.map((v) => (v.ttfaMs == null ? null : r1(v.startMs + v.ttfaMs)));
        rec = {
          id: t.id,
          lang: t.lang,
          who: t.who,
          partner: t.partner,
          intended: t.intended,
          keywords: kw ?? null,
          historyTurns: history.length,
          promptChars: messages.reduce((a, m) => a + [...m.content].length, 0),
          attempt,
          firstTokenMs: r1(stats.firstTokenMs),
          llmTotalMs: r1(stats.totalMs),
          firstDraftMs: drafts[0]?.atMs ?? null,
          allDraftsMs: drafts.length >= 4 ? drafts[3]!.atMs : null,
          draftCount: drafts.length,
          drafts: drafts.map((d) => ({ idx: d.idx, text: d.text, gloss: d.gloss, lang: d.lang, atMs: d.atMs, foreignScript: hasForeignScript(d.text, t.lang) })),
          prespeak: voiced,
          allVoicedMs: readyAt.every((x) => x != null) ? Math.max(...(readyAt as number[])) : null,
          allFirstAudioMs: firstAudioAt.every((x) => x != null) ? Math.max(...(firstAudioAt as number[])) : null,
          allVoicedWallMs: r1(tAllVoiced),
          singleIntended: single,
          singleDraft0,
          usageStream: lastUsage,
          sseTail: lastUsage ? undefined : lastSseTail.slice(-300),
          at: new Date().toISOString(),
        };
      } catch (e) {
        out.turns.push({ id: t.id, attempt, error: (e as Error).message.slice(0, 300), at: new Date().toISOString() });
        await sleep(1500 * attempt);
      }
    }
    if (rec) out.turns.push(rec);
    const r = rec;
    console.log(
      r
        ? `${t.id} first ${r.firstDraftMs} all4 ${r.allDraftsMs} voiced ${r.allVoicedMs} single-ttfa ${r.singleIntended.ttfaMs} n=${r.draftCount} usage=${r.usageStream ? "y" : "n"}`
        : `${t.id} FAILED`,
    );
    writeFileSync(RAW, JSON.stringify(out, null, 1));
    await sleep(800);
  }
  engine.close();
  // Token usage: if the stream carried none, replay each prompt once without streaming to read
  // `usage` (prompt tokens are exact for the same messages; completion tokens are for a fresh sample).
  const missing = out.turns.filter((r: any) => !r.error && !r.usageStream);
  if (missing.length) {
    console.log(`stream carried no usage for ${missing.length} turns; replaying non-streamed for usage`);
    for (const r of missing) {
      const t = TURNS.find((x) => x.id === r.id)!;
      const kw = keywords?.[t.id];
      const messages = buildMessages({ profile: DEMO_PROFILE, history: historyFor(t), partner: { text: t.partner, lang: t.lang, who: t.who }, tone: TONE, ...(kw ? { keywords: kw } : {}) });
      try {
        const res = await realFetch(`${config.apiBase}/v1/chat/completions`, {
          method: "POST",
          headers: { "api-subscription-key": config.sarvamKey, "content-type": "application/json" },
          body: JSON.stringify({ model: config.chatModel, messages, stream: false, temperature: 0.7, top_p: 0.95, max_tokens: 400, reasoning_effort: null }),
        });
        const j: any = await res.json();
        r.usageReplay = { status: res.status, usage: j.usage ?? null, completionChars: [...(j.choices?.[0]?.message?.content ?? "")].length };
      } catch (e) {
        r.usageReplay = { error: (e as Error).message.slice(0, 200) };
      }
      await sleep(300);
    }
    writeFileSync(RAW, JSON.stringify(out, null, 1));
  }
  console.log(`${keywords ? "steer" : "draft"} stage done`);
  process.exit(0);
}

// =====================================================================================
// Stage 2: LLM judge, two runs
// =====================================================================================
const LANG_DESC: Record<string, string> = {
  "ta-IN": "Tamil, with English words mixed in. Tamil words must be in Tamil script; English words may be in Latin script.",
  "hi-IN": "Hindi (Hinglish), with English words mixed in. Hindi words must be in Devanagari; English words may be in Latin script.",
  "en-IN": "English (Indian English), in Latin script.",
};

function judgeMessages(r: any) {
  const system = [
    "You evaluate reply suggestions for an AAC (speech-generating) app used by a person who cannot speak.",
    "The person knows exactly what they want to say (the INTENDED reply). The app offered four drafts. If a draft is chosen, the app speaks it aloud as the person's own words.",
    "Answer the question: Which draft, if any, conveys the same core meaning and intent as the intended reply, such that the user would accept it as saying what they meant?",
    "Differences in wording, word order, politeness words, fillers, or address terms do not matter. A draft that changes or omits a specific fact the intended reply states (yes vs no, a time, a quantity, a side, a person, a request, a reason that carries the point) does not count. A draft that says more than the intended reply counts only if the extra content is harmless and the person would still accept it.",
    "If several drafts qualify, pick the best one. If none qualifies, answer null.",
    "Also check each draft's language and script against the expected language. wrong_language: drafts mainly in a language other than the expected one. wrong_script: drafts that write a language in the wrong script (for example Tamil or Hindi words in Latin letters, or Hindi in Tamil script).",
    'Reply with JSON only, no other text: {"match": 1|2|3|4|null, "wrong_language": [draft numbers], "wrong_script": [draft numbers], "reason": "one short sentence"}',
  ].join("\n");
  const user = [
    `Expected language: ${LANG_DESC[r.lang]}`,
    `The other person (${r.who}) said: ${r.partner}`,
    `INTENDED reply: ${r.intended}`,
    "Drafts:",
    ...r.drafts.map((d: any, i: number) => `${i + 1}. ${d.text}`),
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function parseJudge(content: string): { match: number | null; wrong_language: number[]; wrong_script: number[]; reason: string } | null {
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const match = j.match == null || j.match === "null" || j.match === "none" ? null : Number(j.match);
    return {
      match: match != null && match >= 1 && match <= 4 ? match : null,
      wrong_language: (j.wrong_language ?? []).map(Number),
      wrong_script: (j.wrong_script ?? []).map(Number),
      reason: String(j.reason ?? ""),
    };
  } catch {
    return null;
  }
}

async function judgeOnce(r: any, run: number) {
  const body = { model: "sarvam-105b", messages: judgeMessages(r), temperature: 0, max_tokens: 6000 };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const t0 = performance.now();
    try {
      const res = await realFetch(`${config.apiBase}/v1/chat/completions`, {
        method: "POST",
        headers: { "api-subscription-key": config.sarvamKey, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180000),
      });
      const j: any = await res.json();
      const content = j.choices?.[0]?.message?.content ?? "";
      const parsed = parseJudge(content);
      const row = {
        run,
        attempt,
        status: res.status,
        ms: r1(performance.now() - t0),
        finish: j.choices?.[0]?.finish_reason ?? null,
        usage: j.usage ?? null,
        content: content.slice(0, 800),
        reasoningChars: (j.choices?.[0]?.message?.reasoning_content ?? "").length,
        parsed,
        error: res.ok ? undefined : JSON.stringify(j).slice(0, 300),
      };
      if (parsed) return row;
      if (attempt === 3) return row;
    } catch (e) {
      if (attempt === 3) return { run, attempt, error: (e as Error).message.slice(0, 200), parsed: null };
    }
    await sleep(2000 * attempt);
  }
}

async function stageJudge(steered = false) {
  const draft = JSON.parse(readFileSync(rawPath(steered ? "steer" : "draft"), "utf8"));
  const RAW = rawPath(steered ? "steerjudge" : "judge");
  const turns = draft.turns.filter((r: any) => !r.error && r.drafts?.length);
  const out = {
    meta: { ...meta(steered ? "steerjudge" : "judge"), judgeModel: "sarvam-105b", temperature: 0, reasoning: "on (model default)", runs: 2, workers: steered ? 6 : 4, systemPrompt: judgeMessages(turns[0])[0]!.content },
    turns: [] as any[],
  };
  const queue = turns.flatMap((r: any) => [1, 2].map((run) => ({ r, run })));
  const results = new Map<string, any[]>();
  let next = 0;
  const worker = async () => {
    while (next < queue.length) {
      const { r, run } = queue[next++]!;
      const row = await judgeOnce(r, run);
      if (!results.has(r.id)) results.set(r.id, []);
      results.get(r.id)!.push(row);
      const info = row as { ms?: number; finish?: string | null } | undefined;
      console.log(`${r.id} run${run} -> ${row?.parsed ? row.parsed.match : "parse-fail"} (${info?.ms} ms, ${info?.finish})`);
    }
  };
  await Promise.all(Array.from({ length: steered ? 6 : 4 }, () => worker()));
  for (const r of turns) {
    const runs = (results.get(r.id) ?? []).sort((a, b) => a.run - b.run);
    out.turns.push({ id: r.id, lang: r.lang, intended: r.intended, keywords: r.keywords ?? null, drafts: r.drafts.map((d: any) => d.text), runs });
  }
  writeFileSync(RAW, JSON.stringify(out, null, 1));
  console.log("judge stage done");
}

// =====================================================================================
// Stage 3: native -> Roman transliteration of intended replies (for keystroke counts)
// =====================================================================================
async function stageTranslit() {
  const RAW = rawPath("translit");
  const out = { meta: { ...meta("translit"), endpoint: "POST /transliterate, source=<lang>, target=en-IN" }, rows: [] as any[] };
  for (const t of TURNS) {
    if (t.lang === "en-IN") continue;
    const t0 = performance.now();
    try {
      const res = await realFetch(`${config.apiBase}/transliterate`, {
        method: "POST",
        headers: { "api-subscription-key": config.sarvamKey, "content-type": "application/json" },
        body: JSON.stringify({ input: t.intended, source_language_code: t.lang, target_language_code: "en-IN" }),
      });
      const j: any = await res.json();
      out.rows.push({ id: t.id, lang: t.lang, input: t.intended, status: res.status, ms: r1(performance.now() - t0), roman: j.transliterated_text ?? null, raw: res.ok ? undefined : j });
      console.log(t.id, res.status, j.transliterated_text);
    } catch (e) {
      out.rows.push({ id: t.id, error: (e as Error).message.slice(0, 200) });
    }
    await sleep(250);
  }
  writeFileSync(RAW, JSON.stringify(out, null, 1));
}

// =====================================================================================
// Stage 4 (v2): steering words for every miss. PRE-DECLARED RULE, fixed before any steering run:
// sarvam-105b, temperature 0, sees ONLY the intended reply (no partner turn, no drafts, no language
// label). Post-processing: first non-empty line, quotes/asterisks/backticks and a leading "Words:"
// style label removed, commas to spaces, at most the first two whitespace-separated tokens kept,
// trailing punctuation removed. Nothing else is changed (no case folding, no manual edits).
// =====================================================================================
export const KEYWORD_INSTRUCTION =
  "Give the one or two words this person would type to steer a reply-suggestion tool toward this meaning, as they would type them on a Roman keyboard.";

/** A turn is a hit only if both judge runs parsed and named the same draft (the v1 rule). */
export function judgedHit(runs: any[]): number | null {
  const m1 = runs[0]?.parsed ? runs[0].parsed.match : undefined;
  const m2 = runs[1]?.parsed ? runs[1].parsed.match : undefined;
  return m1 !== undefined && m2 !== undefined && m1 === m2 && m1 != null ? m1 - 1 : null;
}

export function cleanKeywords(content: string): string {
  const line = content.split("\n").map((l) => l.trim()).find((l) => l) ?? "";
  const s = line
    .replace(/[`*"“”‘’]/g, "")
    .replace(/^'+|'+$/g, "")
    .replace(/^[A-Za-z ]{1,20}:\s*/, "")
    .replace(/,/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(" ");
  return s.replace(/[.!?;:]+$/g, "").trim();
}

async function stageKeywords() {
  const judge = JSON.parse(readFileSync(rawPath("judge"), "utf8"));
  const misses = judge.turns.filter((r: any) => judgedHit(r.runs) == null);
  const RAW = rawPath("keywords");
  const out = { meta: { ...meta("keywords"), model: "sarvam-105b", temperature: 0, instruction: KEYWORD_INSTRUCTION, misses: misses.length }, rows: [] as any[] };
  let next = 0;
  const worker = async () => {
    while (next < misses.length) await one(misses[next++]);
  };
  const one = async (r: any) => {
    const t = TURNS.find((x) => x.id === r.id)!;
    const messages = [{ role: "user", content: `${KEYWORD_INSTRUCTION}\nReply with only those words.\n\n${t.intended}` }];
    let row: any = null;
    for (let attempt = 1; attempt <= 3 && !row?.keywords; attempt++) {
      const t0 = performance.now();
      try {
        const res = await realFetch(`${config.apiBase}/v1/chat/completions`, {
          method: "POST",
          headers: { "api-subscription-key": config.sarvamKey, "content-type": "application/json" },
          body: JSON.stringify({ model: "sarvam-105b", messages, temperature: 0, max_tokens: 4000 }),
          signal: AbortSignal.timeout(180000),
        });
        const j: any = await res.json();
        const content = String(j.choices?.[0]?.message?.content ?? "");
        row = { id: t.id, lang: t.lang, intended: t.intended, attempt, status: res.status, ms: r1(performance.now() - t0), usage: j.usage ?? null, finish: j.choices?.[0]?.finish_reason ?? null, content: content.slice(0, 400), keywords: cleanKeywords(content), error: res.ok ? undefined : JSON.stringify(j).slice(0, 300) };
      } catch (e) {
        row = { id: t.id, attempt, error: (e as Error).message.slice(0, 200), keywords: "" };
      }
      if (!row.keywords) await sleep(1500 * attempt);
    }
    out.rows.push(row);
    console.log(`${t.id} -> "${row.keywords}" (${row.ms} ms)  [${t.intended}]`);
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  out.rows.sort((a, b) => (a.id < b.id ? -1 : 1));
  writeFileSync(RAW, JSON.stringify(out, null, 1));
  console.log("keywords stage done");
}

const stage = process.argv[2];
if (stage === "draft") await stageDraft();
else if (stage === "judge") await stageJudge();
else if (stage === "translit") await stageTranslit();
else if (stage === "keywords") await stageKeywords();
else if (stage === "steer") {
  const kw = JSON.parse(readFileSync(rawPath("keywords"), "utf8"));
  await stageDraft(Object.fromEntries(kw.rows.filter((r: any) => r.keywords).map((r: any) => [r.id, r.keywords])));
} else if (stage === "steerjudge") await stageJudge(true);
else console.log("usage: npx tsx bench/conversations.ts draft|judge|translit|keywords|steer|steerjudge original|heldout");
