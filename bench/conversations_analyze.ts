// Analysis for the conversation benchmark. No API calls: reads the raw files written by
// bench/conversations.ts and writes bench/results/conversations.json and conversations.md.
//
// Run from kanth/:  npx tsx bench/conversations_analyze.ts
import { readFileSync, writeFileSync } from "node:fs";
import { TURNS, SET_LABEL } from "./conversations.data.ts";

const OUT = "bench/results";
const draft = JSON.parse(readFileSync(`${OUT}/conversations-raw-draft.json`, "utf8"));
const judge = JSON.parse(readFileSync(`${OUT}/conversations-raw-judge.json`, "utf8"));
const translit = JSON.parse(readFileSync(`${OUT}/conversations-raw-translit.json`, "utf8"));

// ------------------------------------------------------------------ parameters
// MEASURED in the live app (reported by the team from 3 demo turns; not re-measured here)
const STT_FINAL_MS_INAPP = { min: 102, max: 123 }; // Saaras final transcript after partner stopped (manual endpointing)
const STT_MS = STT_FINAL_MS_INAPP.max; // conservative: the slower of the in-app measurements
const PLAYBACK_START_MS = 59; // in-app choice -> audible for audio already buffered (58-59 ms)
const INAPP_TYPED_TO_AUDIBLE_MS = 397; // in-app, for cross-check only

// MODELED human timing, derived from cited rates (research/evidence.md section A2, VERIFIED/corrected):
// Koester and Arthanat 2018: cursor-based on-screen keyboard 4.2 wpm; scanning on-screen keyboard 1.7 wpm.
// Text-entry convention: 1 word = 5 characters including the space (assumption, standard in text-entry research).
const CHARS_PER_WORD = 5;
const WPM_DIRECT = 4.2;
const WPM_SCAN = 1.7;
const SEC_PER_CHAR_DIRECT = 60 / (WPM_DIRECT * CHARS_PER_WORD); // 2.857 s
const SEC_PER_CHAR_SCAN = 60 / (WPM_SCAN * CHARS_PER_WORD); // 7.059 s
const SCAN_INTERVAL_S = 1.4; // app default (web/src/lib/settings.ts DEFAULT_SETTINGS.scanIntervalMs)
const SELECT_DIRECT_S = SEC_PER_CHAR_DIRECT; // one direct selection costs one keystroke-time at the cited rate
const SCAN_PRESSES_PER_CHAR = 2; // row then column (modeled)
const MISS_SCAN_STEPS = 5; // scan past 4 drafts to the keyboard button (modeled)
const MISS_DIRECT_SELECTIONS = 1; // tap the keyboard button (modeled)

// ------------------------------------------------------------------ helpers
const med = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n ? (n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2) : NaN;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const pct = (k: number, n: number) => (n ? Math.round((1000 * k) / n) / 10 : NaN);
const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return NaN;
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return s[lo]! + (s[hi]! - s[lo]!) * (i - lo);
};
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "n/a");
const f0 = (x: number) => (Number.isFinite(x) ? Math.round(x).toString() : "n/a");
const fs = (x: number) => (!Number.isFinite(x) ? "n/a" : x < 10 ? x.toFixed(2) + " s" : x.toFixed(1) + " s");
const cp = (s: string) => [...s].length;
const hasIndic = (s: string) => /[ऀ-෿]/.test(s);
const hasTamil = (s: string) => /[஀-௿]/.test(s);
const hasDeva = (s: string) => /[ऀ-ॿ]/.test(s);

// ------------------------------------------------------------------ per-turn join
const LANGS = ["ta-IN", "hi-IN", "en-IN"] as const;
const LNAME: Record<string, string> = { "ta-IN": "Tamil", "hi-IN": "Hindi", "en-IN": "English" };

const rows = TURNS.map((t) => {
  const d = draft.turns.find((x: any) => x.id === t.id && !x.error);
  const j = judge.turns.find((x: any) => x.id === t.id);
  const tr = translit.rows.find((x: any) => x.id === t.id);
  const runs = (j?.runs ?? []) as any[];
  const m1 = runs[0]?.parsed ? runs[0].parsed.match : undefined;
  const m2 = runs[1]?.parsed ? runs[1].parsed.match : undefined;
  const bothParsed = m1 !== undefined && m2 !== undefined;
  const agree = bothParsed && m1 === m2;
  const hitIdx: number | null = agree && m1 != null ? m1 - 1 : null;
  const flags = (key: "wrong_language" | "wrong_script") => {
    const a = new Set<number>(runs[0]?.parsed?.[key] ?? []);
    const b = new Set<number>(runs[1]?.parsed?.[key] ?? []);
    return { both: [...a].filter((x) => b.has(x)), either: [...new Set([...a, ...b])] };
  };
  // deterministic script check on the drafts
  const scriptIssues = (d?.drafts ?? []).map((x: any, i: number) => {
    const s = x.text as string;
    if (t.lang === "en-IN") return hasIndic(s) ? i + 1 : null;
    if (t.lang === "ta-IN") return !hasTamil(s) || hasDeva(s) ? i + 1 : null;
    return !hasDeva(s) || hasTamil(s) ? i + 1 : null;
  }).filter((x: number | null) => x != null);

  const roman: string = t.lang === "en-IN" ? t.intended : tr?.roman ?? t.intended;
  const romanChars = cp(roman);
  const nativeChars = cp(t.intended);
  const keysTyping = romanChars + 1; // +1 to speak
  const keysTypingNative = nativeChars + 1;

  // motor actions
  const touchKanth = hitIdx != null ? 1 : keysTyping;
  const scanTypingPresses = (romanChars + 1) * SCAN_PRESSES_PER_CHAR;
  const scanKanthPresses = hitIdx != null ? 1 : scanTypingPresses;
  const scanKanthWaitSteps = hitIdx != null ? hitIdx + 1 : null;

  // timings (seconds) ---------------------------------------------------------
  const allDrafts = d.allDraftsMs / 1000;
  const allVoiced = d.allVoicedMs / 1000;
  const allFirstAudio = d.allFirstAudioMs / 1000;
  const ttfaTyped = d.singleIntended.ttfaMs / 1000; // synth of the typed text, idle warm pool
  const ttfaChoice = (d.singleDraft0?.ttfaMs ?? d.singleIntended.ttfaMs) / 1000; // synth of a draft on choice
  const stt = STT_MS / 1000;
  const play = PLAYBACK_START_MS / 1000;

  const typingTime = (access: "direct" | "scan") => (romanChars + 1) * (access === "direct" ? SEC_PER_CHAR_DIRECT : SEC_PER_CHAR_SCAN);
  const selectTime = (access: "direct" | "scan", idx: number) => (access === "direct" ? SELECT_DIRECT_S : (idx + 1) * SCAN_INTERVAL_S);
  const missOverhead = (access: "direct" | "scan") => (access === "direct" ? MISS_DIRECT_SELECTIONS * SELECT_DIRECT_S : MISS_SCAN_STEPS * SCAN_INTERVAL_S);

  const gaps: Record<string, Record<string, number>> = {};
  for (const access of ["direct", "scan"] as const) {
    const a = typingTime(access) + ttfaTyped + play;
    let b: number;
    let c: number;
    if (hitIdx != null) {
      const choiceAt = stt + allDrafts + selectTime(access, hitIdx);
      b = choiceAt + ttfaChoice + play;
      const readyAt = stt + allVoiced;
      c = Math.max(choiceAt, readyAt) + play;
    } else {
      const fallback = stt + allDrafts + missOverhead(access) + typingTime(access) + ttfaTyped + play;
      b = fallback;
      c = fallback; // typed text is not prespoken
    }
    gaps[access] = { a, b, c };
  }

  return {
    id: t.id,
    thread: t.thread,
    lang: t.lang,
    who: t.who,
    relation: t.relation,
    setting: t.setting,
    partner: t.partner,
    intended: t.intended,
    drafts: d.drafts.map((x: any) => ({ text: x.text, gloss: x.gloss, atMs: x.atMs })),
    judge: {
      run1: m1 ?? "parse-fail",
      run2: m2 ?? "parse-fail",
      agree,
      hitIdx,
      reasons: runs.map((r) => r?.parsed?.reason ?? r?.error ?? null),
      wrongLanguage: flags("wrong_language"),
      wrongScript: flags("wrong_script"),
    },
    scriptCheck: { draftsWithScriptIssue: scriptIssues },
    measuredMs: {
      firstTokenMs: d.firstTokenMs,
      firstDraftMs: d.firstDraftMs,
      allDraftsMs: d.allDraftsMs,
      allVoicedMs: d.allVoicedMs,
      allFirstAudioMs: d.allFirstAudioMs,
      ttfaTypedMs: d.singleIntended.ttfaMs,
      ttfaChoiceMs: d.singleDraft0?.ttfaMs ?? null,
      prespeakTransports: d.prespeak.map((p: any) => p.transport),
      prespeakTtfaMs: d.prespeak.map((p: any) => p.ttfaMs),
      prespeakAudioSec: d.prespeak.map((p: any) => p.audioSec),
    },
    tokens: { prompt: d.usageStream?.prompt_tokens ?? null, completion: d.usageStream?.completion_tokens ?? null },
    chars: {
      intendedNative: nativeChars,
      intendedRoman: romanChars,
      roman,
      drafts: d.drafts.map((x: any) => cp(x.text)),
      prespokenTotal: d.prespeak.reduce((a: number, p: any) => a + p.chars, 0),
      hitDraft: hitIdx != null ? cp(d.drafts[hitIdx].text) : null,
    },
    audioSec: { intended: d.singleIntended.audioSec, hitDraft: hitIdx != null ? d.prespeak[hitIdx]?.audioSec ?? null : null },
    motor: {
      typingKeys: keysTyping,
      typingKeysNativeCount: keysTypingNative,
      kanthTouch: touchKanth,
      scanTypingPresses,
      scanKanthPresses,
      scanKanthWaitSteps,
    },
    turnGapSec: gaps, // MODELED totals built from measured + modeled parts (see conversations.md)
    wallClock: d.at,
  };
});

// ------------------------------------------------------------------ aggregates
function hitStats(rs: typeof rows) {
  const n = rs.length;
  const top1 = rs.filter((r) => r.judge.hitIdx === 0).length;
  const top4 = rs.filter((r) => r.judge.hitIdx != null).length;
  const agree = rs.filter((r) => r.judge.agree).length;
  const either = rs.filter((r) => typeof r.judge.run1 === "number" || typeof r.judge.run2 === "number").length;
  return { n, top1, top4, top1Pct: pct(top1, n), top4Pct: pct(top4, n), judgeAgree: agree, judgeAgreePct: pct(agree, n), hitInEitherRun: either };
}
const groups: Record<string, typeof rows> = { all: rows };
for (const l of LANGS) groups[l] = rows.filter((r) => r.lang === l);

const hit = Object.fromEntries(Object.entries(groups).map(([k, rs]) => [k, hitStats(rs)]));

const motor = Object.fromEntries(
  Object.entries(groups).map(([k, rs]) => {
    const tk = mean(rs.map((r) => r.motor.typingKeys));
    const kt = mean(rs.map((r) => r.motor.kanthTouch));
    const sp = mean(rs.map((r) => r.motor.scanTypingPresses));
    const sk = mean(rs.map((r) => r.motor.scanKanthPresses));
    const tkN = mean(rs.map((r) => r.motor.typingKeysNativeCount));
    const hitsOnlyWait = mean(rs.filter((r) => r.judge.hitIdx != null).map((r) => r.motor.scanKanthWaitSteps as number));
    return [
      k,
      {
        typingKeysMean: tk,
        typingKeysNativeCountMean: tkN,
        kanthTouchMean: kt,
        touchReductionPct: 100 * (1 - kt / tk),
        scanTypingPressesMean: sp,
        scanKanthPressesMean: sk,
        scanReductionPct: 100 * (1 - sk / sp),
        scanWaitStepsOnHitsMean: hitsOnlyWait,
      },
    ];
  }),
);

function gapSummary(rs: typeof rows) {
  const out: any = {};
  for (const access of ["direct", "scan"]) {
    out[access] = {};
    for (const cond of ["a", "b", "c"]) {
      const xs = rs.map((r) => r.turnGapSec[access]![cond]!);
      const hx = rs.filter((r) => r.judge.hitIdx != null).map((r) => r.turnGapSec[access]![cond]!);
      out[access][cond] = { median: med(xs), mean: mean(xs), p25: q(xs, 0.25), p75: q(xs, 0.75), min: Math.min(...xs), max: Math.max(...xs), hitsMedian: med(hx), hitsN: hx.length };
    }
  }
  return out;
}
const gaps = Object.fromEntries(Object.entries(groups).map(([k, rs]) => [k, gapSummary(rs)]));

const lat = (key: keyof (typeof rows)[number]["measuredMs"]) => {
  const xs = rows.map((r) => r.measuredMs[key] as number).filter((x) => typeof x === "number");
  return { n: xs.length, median: med(xs), p25: q(xs, 0.25), p75: q(xs, 0.75), min: Math.min(...xs), max: Math.max(...xs) };
};
const latency = {
  firstTokenMs: lat("firstTokenMs"),
  firstDraftMs: lat("firstDraftMs"),
  allDraftsMs: lat("allDraftsMs"),
  allFirstAudioMs: lat("allFirstAudioMs"),
  allVoicedMs: lat("allVoicedMs"),
  ttfaTypedMs: lat("ttfaTypedMs"),
  ttfaChoiceMs: lat("ttfaChoiceMs"),
};
const allPrespeak = draft.turns.filter((t: any) => !t.error).flatMap((t: any) => t.prespeak);
const transportCounts = allPrespeak.reduce((a: any, p: any) => ((a[p.transport ?? "error"] = (a[p.transport ?? "error"] ?? 0) + 1), a), {});
const runaway = draft.turns
  .filter((t: any) => !t.error)
  .flatMap((t: any) => t.prespeak.map((p: any) => ({ id: t.id, text: p.text, chars: p.chars, audioSec: p.audioSec, secPerChar: p.audioSec / p.chars })))
  .filter((p: any) => p.secPerChar > 0.25);

const flagCounts = {
  judgeWrongLanguageBothRuns: rows.reduce((a, r) => a + r.judge.wrongLanguage.both.length, 0),
  judgeWrongLanguageEitherRun: rows.reduce((a, r) => a + r.judge.wrongLanguage.either.length, 0),
  judgeWrongScriptBothRuns: rows.reduce((a, r) => a + r.judge.wrongScript.both.length, 0),
  judgeWrongScriptEitherRun: rows.reduce((a, r) => a + r.judge.wrongScript.either.length, 0),
  deterministicScriptIssues: rows.reduce((a, r) => a + r.scriptCheck.draftsWithScriptIssue.length, 0),
  totalDrafts: rows.reduce((a, r) => a + r.drafts.length, 0),
};

const tokens = {
  promptMean: mean(rows.map((r) => r.tokens.prompt as number)),
  completionMean: mean(rows.map((r) => r.tokens.completion as number)),
  source: "usage object in the streamed chat response (measured)",
};

const result = {
  meta: {
    set: SET_LABEL,
    generated: new Date().toISOString(),
    draftRun: draft.meta,
    judgeRun: { ...judge.meta, systemPrompt: undefined },
    judgeSystemPrompt: judge.meta.systemPrompt,
    translitRun: translit.meta,
  },
  parameters: {
    measuredInApp: { sttFinalMs: STT_FINAL_MS_INAPP, sttUsedMs: STT_MS, playbackStartMs: PLAYBACK_START_MS, typedToAudibleMs: INAPP_TYPED_TO_AUDIBLE_MS },
    modeled: {
      charsPerWord: CHARS_PER_WORD,
      wpmDirect: WPM_DIRECT,
      wpmScan: WPM_SCAN,
      secPerCharDirect: SEC_PER_CHAR_DIRECT,
      secPerCharScan: SEC_PER_CHAR_SCAN,
      selectDirectS: SELECT_DIRECT_S,
      scanIntervalS: SCAN_INTERVAL_S,
      scanPressesPerChar: SCAN_PRESSES_PER_CHAR,
      missScanSteps: MISS_SCAN_STEPS,
      missDirectSelections: MISS_DIRECT_SELECTIONS,
    },
  },
  hit,
  motor,
  latency,
  transportCounts,
  runawayAudio: runaway,
  flagCounts,
  tokens,
  turnGap: gaps,
  turns: rows,
};
writeFileSync(`${OUT}/conversations.json`, JSON.stringify(result, null, 1));

// chart input for the Python renderer
writeFileSync(
  `${OUT}/conversations-chart.json`,
  JSON.stringify(
    {
      humanNormS: 0.2,
      dispreferredS: 0.7,
      groups: ["direct", "scan"].map((access) => ({
        access,
        bars: ["a", "b", "c"].map((c) => ({ cond: c, median: gaps.all[access][c].median, p25: gaps.all[access][c].p25, p75: gaps.all[access][c].p75, hitsMedian: gaps.all[access][c].hitsMedian })),
      })),
      hitTop4Pct: hit.all.top4Pct,
      n: rows.length,
    },
    null,
    1,
  ),
);

// ------------------------------------------------------------------ markdown
const L: string[] = [];
const P = (s = "") => L.push(s);
P("# Kanth conversation benchmark: hit rate, motor actions, turn gap");
P();
P(`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC from raw files in \`bench/results/conversations-raw-*.json\`. Code: \`bench/conversations.ts\` (API runs), \`bench/conversations_analyze.ts\` (this report), test set \`bench/conversations.data.ts\`.`);
P();
P("**Test set: SCRIPTED, not real users.** 36 hand-written partner turns in 12 three-turn threads (12 Tamil, 12 Hindi/Hinglish, 12 Indian English) for the fictional demo user Arjun (34, ALS, Chennai). Each turn has the reply the user actually wants to say. All 36 intended replies were written before any model drafted a reply for these turns, and none was changed after seeing model output.");
P();
P("**How to read the numbers.** Every number is labelled **MEASURED** (timed or counted in a run) or **MODELED** (computed from cited human rates and stated assumptions). The turn gaps are MODELED totals: they add measured system latencies to modeled human selection and typing times.");
P();
P(`**Measurement conditions.** Run started ${draft.meta.startedIST} IST on a home connection in India (Windows, Node ${draft.meta.node}). Up to two other agents may have been calling the same Sarvam account concurrently, so these latencies were measured under shared load.`);
P();

P("## 1. Do the drafts say what the user meant? (MEASURED, LLM-judged)");
P();
P("For each turn the real drafting code (`server/suggest.ts` `streamSuggestions`, model `sarvam-105b-conversations`, thinking off, temperature 0.7, tone warm, demo profile) drafted 4 replies. The history included the earlier turns of the same thread, with the intended replies standing in for the user's past turns.");
P();
P("A judge (`sarvam-105b`, reasoning on, temperature 0) was asked: *Which draft, if any, conveys the same core meaning and intent as the intended reply, such that the user would accept it as saying what they meant?* The judge ran twice per turn. A turn counts as a hit only if both runs named the same draft.");
P();
P("| Language | Turns | Top-1 hit | Top-4 hit | Judge runs agree | Hit in either run |");
P("|---|---:|---:|---:|---:|---:|");
for (const k of ["ta-IN", "hi-IN", "en-IN", "all"]) {
  const h = hit[k];
  P(`| ${k === "all" ? "**All**" : LNAME[k]} | ${h.n} | ${h.top1} (${f1(h.top1Pct)}%) | ${h.top4} (${f1(h.top4Pct)}%) | ${h.judgeAgree}/${h.n} | ${h.hitInEitherRun} |`);
}
P();
P(`What this means: on about ${f0(hit.all.top4Pct)}% of turns one of the four drafts says what the user meant, so one selection replaces typing. On the other ${f0(100 - hit.all.top4Pct)}%, the user types (Kanth's free-typing path). This is a finding about this scripted set. The intended replies are deliberately specific (a time, a side of the body, a drug name, a preference), and a draft cannot know those facts.`);
P();
P("**Language and script of the drafts.**");
P(`- Judge flags across all ${flagCounts.totalDrafts} drafts: wrong language ${flagCounts.judgeWrongLanguageBothRuns} (both runs) / ${flagCounts.judgeWrongLanguageEitherRun} (either run); wrong script ${flagCounts.judgeWrongScriptBothRuns} (both) / ${flagCounts.judgeWrongScriptEitherRun} (either).`);
P(`- Deterministic script check (Tamil drafts must contain Tamil script and no Devanagari; Hindi drafts must contain Devanagari and no Tamil; English drafts contain no Indic script): ${flagCounts.deterministicScriptIssues} drafts fail.`);
P();
P("Per-turn detail: the intended reply, the four drafts, both judge verdicts, and the judge's reasons are in `conversations.json` under `turns`.");
P();

P("## 2. Measured system latency (MEASURED, this run, n = 36 turns)");
P();
P("Clocks start when the drafting request is sent, which in the app is right after Saaras returns the final transcript.");
P();
P("| Stage | Median | P25 to P75 | Min to max |");
P("|---|---:|---:|---:|");
const latRow = (name: string, s: any) => P(`| ${name} | ${f0(s.median)} ms | ${f0(s.p25)} to ${f0(s.p75)} ms | ${f0(s.min)} to ${f0(s.max)} ms |`);
latRow("First draft parsed", latency.firstDraftMs);
latRow("All 4 drafts parsed", latency.allDraftsMs);
latRow("All 4 drafts have first audio (prespeak)", latency.allFirstAudioMs);
latRow("All 4 drafts fully synthesized (prespeak, pool of 4)", latency.allVoicedMs);
latRow("TTFA, single synthesis of a draft on choice (warm socket)", latency.ttfaChoiceMs);
latRow("TTFA, single synthesis of the typed reply (warm socket)", latency.ttfaTypedMs);
P();
P(`Prespeak ran exactly as \`server/session.ts\` runs it: each draft starts synthesizing on a \`TtsEngine\` pool of 4 warm Bulbul v4 Flash WebSockets the moment it is parsed. Transports used across ${allPrespeak.length} prespoken drafts: ${Object.entries(transportCounts).map(([k, v]) => `${k} ${v}`).join(", ")}.`);
P();
P("**Anomalies seen (MEASURED; they are kept in the medians above):**");
P("- ta05: one socket gave no audio within 5 s. The engine fell back to HTTP streaming (first audio at 5.4 s), so all 4 were voiced only at 6.1 s.");
if (runaway.length) for (const r of runaway) P(`- ${r.id}: Bulbul returned ${r.audioSec.toFixed(1)} s of audio for a ${r.chars}-character draft ("${r.text}"). Runaway audio like this would be heard by the partner if that draft were chosen. Kanth should cap playback by expected duration.`);
P();
P("**Comparison with the live app** (MEASURED in-app by the team, 3 demo turns): first draft 321 to 367 ms; all 4 drafts 480 to 561 ms; all 4 voiced 1.06 to 1.21 s; Saaras final transcript 102 to 123 ms after the partner stopped; choice to audible 58 to 59 ms when prespoken; typed text to audible about 397 ms.");
P(`- The in-app figures are counted from the partner stopping, and include the browser hop.`);
P(`- Cross-check for the typed path: TTFA here (median ${f0(latency.ttfaTypedMs.median)} ms) plus ${PLAYBACK_START_MS} ms playback start = ${f0(latency.ttfaTypedMs.median + PLAYBACK_START_MS)} ms, against about ${INAPP_TYPED_TO_AUDIBLE_MS} ms in the app.`);
P();

P("## 3. Motor actions per utterance (counted from the data; scanning presses are MODELED)");
P();
P("**Plain typing.** Keystrokes = characters of the intended reply on a Roman keyboard, + 1 to speak.");
P("- Tamil and Hindi replies were romanized with Sarvam `POST /transliterate` (native to `en-IN`). `research/probes/p08_translit_lid.py` shows this path works.");
P("- The romanization is not always right: for example, ta07 \"ஏழு மணிக்கு\" came back as \"satta gantalaku\". Its length is still a reasonable proxy for what a person would type.");
P("- No word prediction, no shift key. Native code-point counts are given as a sensitivity check.");
P();
P("**Kanth.** A hit is 1 selection. A miss costs the plain-typing count.");
P();
P("**Single-switch scanning.**");
P("- Typing on a scanning keyboard is modeled as 2 presses per character (row, then column), and the speak key counts as one more character.");
P("- A Kanth hit is 1 press, after waiting (index + 1) scan steps.");
P();
P("| Language | Typing keys (Roman) | Typing keys (native count) | Kanth, touch | Reduction | Scan presses, typing | Scan presses, Kanth | Reduction | Scan steps waited on hits |");
P("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const k of ["ta-IN", "hi-IN", "en-IN", "all"]) {
  const m = motor[k];
  P(`| ${k === "all" ? "**All**" : LNAME[k]} | ${f1(m.typingKeysMean)} | ${f1(m.typingKeysNativeCountMean)} | ${f1(m.kanthTouchMean)} | ${f0(m.touchReductionPct)}% | ${f1(m.scanTypingPressesMean)} | ${f1(m.scanKanthPressesMean)} | ${f0(m.scanReductionPct)}% | ${f1(m.scanWaitStepsOnHitsMean)} |`);
}
P();
P("Because a miss costs the full typing count, the reduction is roughly the hit rate. The hit rate is the lever.");
P();

P("## 4. Turn gap: partner stops speaking to the user's voice being audible (MODELED totals)");
P();
P("There are two access methods.");
P(`- **Direct selection** (touch, or an eye-gaze or head pointer). One selection or keystroke = ${SEC_PER_CHAR_DIRECT.toFixed(2)} s.`);
P(`  - This is derived from 4.2 wpm for cursor-based on-screen keyboards (Koester and Arthanat 2018, Assistive Technology 30(3), via research/evidence.md A2, verified) at 5 characters per word.`);
P(`- **Single-switch scanning** at the app's default 1.4 s interval. Typing costs ${SEC_PER_CHAR_SCAN.toFixed(2)} s per character, from 1.7 wpm for scanning on-screen keyboards (same source).`);
P();
P("| Part | Value | Status |");
P("|---|---|---|");
P(`| Saaras final transcript after partner stops | ${STT_MS} ms (upper end of 102 to 123 ms) | MEASURED in-app (not re-measured here) |`);
P("| Drafting, all 4 parsed | per turn | MEASURED this run |");
P("| All 4 prespoken, fully synthesized | per turn | MEASURED this run |");
P("| TTFA when synthesizing on choice or after typing | per turn | MEASURED this run (single synthesis, warm socket) |");
P(`| Playback start once audio is in the browser | ${PLAYBACK_START_MS} ms | MEASURED in-app |`);
P(`| Direct selection of a draft | ${SELECT_DIRECT_S.toFixed(2)} s (one keystroke-time) | MODELED from cited 4.2 wpm |`);
P(`| Scanning selection of draft i | (i + 1) x ${SCAN_INTERVAL_S} s | MODELED (app default interval) |`);
P(`| Typing | (chars + 1) x ${SEC_PER_CHAR_DIRECT.toFixed(2)} s direct, x ${SEC_PER_CHAR_SCAN.toFixed(2)} s scanning | MODELED from cited rates |`);
P(`| Miss overhead before typing | wait for drafts + 1 selection (direct) or ${MISS_SCAN_STEPS} scan steps (scanning) | MODELED |`);
P();
P("**The three conditions:**");
P("- **(a) Plain typing.** Typing time + TTFA + playback start.");
P("- **(b) Suggestions, no prespeak.**");
P("  - Hit: STT + all-4-drafted + selection + TTFA on choice + playback start.");
P("  - Miss: STT + all-4-drafted + miss overhead + typing + TTFA + playback start.");
P("- **(c) Suggestions with prespeak.**");
P("  - Hit: the choice happens at STT + all-4-drafted + selection. Audio starts at that moment if all 4 drafts were fully synthesized by then; otherwise it waits for the remainder. Then add playback start.");
P("  - Miss: same as (b), because typed text cannot be prespoken.");
P();
P("| Access | Condition | Median, all 36 turns | P25 to P75 | Median, hits only |");
P("|---|---|---:|---:|---:|");
const CN: Record<string, string> = { a: "(a) Plain typing", b: "(b) Suggestions, no prespeak", c: "(c) Suggestions + prespeak" };
for (const access of ["direct", "scan"]) {
  for (const c of ["a", "b", "c"]) {
    const g = gaps.all[access][c];
    P(`| ${access === "direct" ? "Direct (touch)" : "Switch scanning"} | ${CN[c]} | ${fs(g.median)} | ${fs(g.p25)} to ${fs(g.p75)} | ${c === "a" ? "n/a" : `${fs(g.hitsMedian)} (n=${g.hitsN})`} |`);
  }
}
P();
P("Per language (median over all turns of that language):");
P();
P("| Language | Direct (a) | Direct (b) | Direct (c) | Scan (a) | Scan (b) | Scan (c) |");
P("|---|---:|---:|---:|---:|---:|---:|");
for (const k of ["ta-IN", "hi-IN", "en-IN"]) {
  const g = gaps[k];
  P(`| ${LNAME[k]} | ${fs(g.direct.a.median)} | ${fs(g.direct.b.median)} | ${fs(g.direct.c.median)} | ${fs(g.scan.a.median)} | ${fs(g.scan.b.median)} | ${fs(g.scan.c.median)} |`);
}
P();
P("How to read this:");
P("- The human norm for a turn gap is about 200 ms. Levinson and Torreira 2015 put it \"of the order of 200 ms\", with modes of 0 to 200 ms across 10 languages (Stivers et al. 2009).");
P("- Gaps of 700 ms or more are heard as reluctance (Levinson and Torreira 2015). Both are in research/evidence.md A3, verified.");
P("- No condition reaches that norm for a person who has to select with their body. On a hit, Kanth removes the typing and leaves one selection.");
P("- Prespeak then removes the synthesis wait after that selection: direct-selection hits drop by about the TTFA, roughly 0.3 s.");
P("- When the median turn is a miss, the all-turns median is still a typing time. The hits-only column shows what a hit costs.");
P();
P("Chart: `docs/img/turn-gap.png` and `docs/img/turn-gap.svg`.");
P();

P("## 5. Caveats");
P("- **Scripted set, one author, 36 turns.** Intended replies are not real user data. Hit rates carry wide uncertainty: with n = 12 per language, one turn moves the rate by 8 points.");
P("- **LLM judge.** The judge is a Sarvam model judging Sarvam drafts, so self-preference is possible. Requiring two-run agreement reduces noise, not bias. The drafts were shown in app order, so position bias is possible.");
P("- **Human timing is modeled, not measured.**");
P("  - Seconds per keystroke come from population averages for text entry. Those averages already include whatever prediction the studied systems had, and errors.");
P("  - Reading the 4 drafts is folded into one selection time.");
P("  - Real users vary widely: SpeakFaster's two ALS gaze typists ran at 4.05 and 8.1 wpm (evidence.md A2).");
P("- STT latency is the in-app measurement from 3 turns (upper end used), not re-measured here.");
P("- Prespeak readiness uses the strict definition (all 4 fully synthesized). With streaming playback, the chosen draft could start as soon as its own first audio arrived.");
P("- Concurrency: other agents may have been using the same API key during the run.");
writeFileSync(`${OUT}/conversations.md`, L.join("\n") + "\n");
console.log(JSON.stringify({ hit: hit.all, perLang: LANGS.map((l) => [l, hit[l].top4Pct]), motor: motor.all, gaps: gaps.all, latency }, null, 1));
