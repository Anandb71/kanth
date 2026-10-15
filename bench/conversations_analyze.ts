// Analysis for the conversation benchmark, v2. No API calls: reads the raw files written by
// bench/conversations.ts (bench/results/v2/*-raw-*.json) and the preserved v1 summary
// (bench/results/v1/conversations.json), and writes bench/results/conversations.json,
// conversations-chart.json and conversations.md.
//
// Run from kanth/:  npx tsx bench/conversations_analyze.ts
// The v1 version of this script is kept verbatim in bench/results/v1/conversations_analyze.v1.ts.txt.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as ORIGINAL from "./conversations.data.ts";
import * as HELDOUT from "./conversations.heldout.ts";
import type { ScriptedTurn } from "./conversations.data.ts";

const OUT = "bench/results";
const V2 = `${OUT}/v2`;
const load = (p: string): any => JSON.parse(readFileSync(p, "utf8"));
const loadOpt = (p: string): any => (existsSync(p) ? load(p) : null);

// ------------------------------------------------------------------ parameters (unchanged from v1)
// MEASURED in the live app (reported by the team from 3 demo turns; not re-measured here)
const STT_FINAL_MS_INAPP = { min: 102, max: 123 };
const STT_MS = STT_FINAL_MS_INAPP.max;
const PLAYBACK_START_MS = 59;
const INAPP_TYPED_TO_AUDIBLE_MS = 397;

// MODELED human timing (research/evidence.md A2): Koester and Arthanat 2018, 4.2 wpm cursor-based
// on-screen keyboard, 1.7 wpm scanning on-screen keyboard; 5 characters per word.
const CHARS_PER_WORD = 5;
const WPM_DIRECT = 4.2;
const WPM_SCAN = 1.7;
const SEC_PER_CHAR_DIRECT = 60 / (WPM_DIRECT * CHARS_PER_WORD); // 2.857 s
const SEC_PER_CHAR_SCAN = 60 / (WPM_SCAN * CHARS_PER_WORD); // 7.059 s
const SCAN_INTERVAL_S = 1.4;
const SELECT_DIRECT_S = SEC_PER_CHAR_DIRECT;
const SCAN_PRESSES_PER_CHAR = 2;
const MISS_SCAN_STEPS = 5;
const MISS_DIRECT_SELECTIONS = 1;

// ------------------------------------------------------------------ helpers
const med = (xs: number[]) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  const n = s.length;
  return n ? (n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2) : NaN;
};
const mean = (xs: number[]) => {
  const s = xs.filter(Number.isFinite);
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : NaN;
};
const pct = (k: number, n: number) => (n ? Math.round((1000 * k) / n) / 10 : NaN);
const q = (xs: number[], p: number) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
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

const LANGS = ["ta-IN", "hi-IN", "en-IN"] as const;
const LNAME: Record<string, string> = { "ta-IN": "Tamil", "hi-IN": "Hindi", "en-IN": "English" };
const SETS = { original: ORIGINAL, heldout: HELDOUT } as const;
type SetName = keyof typeof SETS;
const SET_NAMES: SetName[] = ["heldout", "original"];
const SET_TITLE: Record<SetName, string> = {
  heldout: "Held-out (24 new turns, unbiased)",
  original: "Original 36 (motivated the fix, biased)",
};

// Deterministic draft-problem detectors (same regexes as v1).
const rasamRe = /rasam|ரசம்|रसम/i;
const cricketRe = /cricket|கிரிக்கெட்|क्रिकेट/i; // the v2 profile note ("Follows cricket")
const cricketTopicRe = /cricket|match|kohli|கிரிக்கெட்|மேட்ச்|क्रिकेट|मैच/i; // the topic counts as raised if any of these was said
const ammaRe = /(^|[,\s])(Amma|அம்மா|अम्मा)[\s.!?]*$|^(Amma|அம்மா|अम्मा)\s*,/;
const deflectRe = /\brest\b|tired|sleep|ஓய்வு|சோர்வ|தூங்க|आराम कर|थक|सो जा|नींद/i; // "I need rest / I am tired" style deflections

function judgeSummary(runs: any[]) {
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
  return {
    run1: m1 === undefined ? "parse-fail" : (m1 ?? "none"),
    run2: m2 === undefined ? "parse-fail" : (m2 ?? "none"),
    agree,
    hitIdx,
    either: typeof m1 === "number" || typeof m2 === "number",
    reasons: runs.map((r) => r?.parsed?.reason ?? r?.error ?? null),
    wrongLanguage: flags("wrong_language"),
    wrongScript: flags("wrong_script"),
  };
}

type Outcome = "hit" | "steer-hit" | "steer-miss" | "miss-unsteered";

function buildRows(setName: SetName) {
  const turns: ScriptedTurn[] = SETS[setName].TURNS;
  const draft = load(`${V2}/${setName}-raw-draft.json`);
  const judge = load(`${V2}/${setName}-raw-judge.json`);
  // The original set's intended replies are unchanged since v1, so its v1 romanizations are reused.
  const translit = setName === "original" ? load(`${OUT}/v1/conversations-raw-translit.json`) : load(`${V2}/heldout-raw-translit.json`);
  const kw = loadOpt(`${V2}/${setName}-raw-keywords.json`);
  const steer = loadOpt(`${V2}/${setName}-raw-steer.json`);
  const steerJudge = loadOpt(`${V2}/${setName}-raw-steerjudge.json`);
  const typedTtfaFallback = med(draft.turns.filter((x: any) => !x.error).map((x: any) => x.singleIntended?.ttfaMs as number));

  return turns.map((t) => {
    const d = draft.turns.find((x: any) => x.id === t.id && !x.error);
    if (!d) throw new Error(`no draft for ${setName}/${t.id}`);
    const j = judge.turns.find((x: any) => x.id === t.id);
    const js = judgeSummary(j?.runs ?? []);
    const hitIdx = js.hitIdx;
    const tr = translit.rows.find((x: any) => x.id === t.id);
    const kwRow = hitIdx == null ? (kw?.rows.find((x: any) => x.id === t.id) ?? null) : null;
    const sd = hitIdx == null ? (steer?.turns.find((x: any) => x.id === t.id && !x.error) ?? null) : null;
    const sj = hitIdx == null ? (steerJudge?.turns.find((x: any) => x.id === t.id) ?? null) : null;
    const sjs = sj ? judgeSummary(sj.runs) : null;
    const steered = hitIdx == null && !!sd && !!sjs;
    const steerHitIdx = steered ? sjs!.hitIdx : null;
    const keywords: string | null = steered ? (sd.keywords as string) : null;
    const kwChars = keywords ? cp(keywords) : 0;
    const outcome: Outcome = hitIdx != null ? "hit" : !steered ? "miss-unsteered" : steerHitIdx != null ? "steer-hit" : "steer-miss";

    const scriptIssues = (drafts: any[]) =>
      drafts
        .map((x: any, i: number) => {
          const s = x.text as string;
          if (t.lang === "en-IN") return hasIndic(s) ? i + 1 : null;
          if (t.lang === "ta-IN") return !hasTamil(s) || hasDeva(s) ? i + 1 : null;
          return !hasDeva(s) || hasTamil(s) ? i + 1 : null;
        })
        .filter((x: number | null) => x != null);

    const roman: string = t.lang === "en-IN" ? t.intended : (tr?.roman ?? t.intended);
    const romanChars = cp(roman);
    const nativeChars = cp(t.intended);
    const typingKeys = romanChars + 1; // +1 to speak

    // ---- motor actions (counted; scanning presses MODELED at 2 per character)
    const touchNoSteer = hitIdx != null ? 1 : typingKeys;
    const touchSteer = outcome === "hit" ? 1 : outcome === "steer-hit" ? kwChars + 1 + 1 : outcome === "steer-miss" ? kwChars + 1 + typingKeys : typingKeys;
    const scanTyping = typingKeys * SCAN_PRESSES_PER_CHAR;
    const kwScan = (kwChars + 1) * SCAN_PRESSES_PER_CHAR; // keywords, then the steer key counted as one more character
    const scanNoSteer = hitIdx != null ? 1 : scanTyping;
    const scanSteer = outcome === "hit" ? 1 : outcome === "steer-hit" ? kwScan + 1 : outcome === "steer-miss" ? kwScan + scanTyping : scanTyping;

    // ---- timings (seconds); measured parts from this run, human parts modeled
    const allDrafts = (d.allDraftsMs ?? d.llmTotalMs) / 1000; // fewer than 4 drafts -> end of stream
    const allVoiced = (d.allVoicedMs ?? d.allVoicedWallMs) / 1000;
    const ttfaTyped = (d.singleIntended?.ttfaMs ?? typedTtfaFallback) / 1000;
    const ttfaChoice = (d.singleDraft0?.ttfaMs ?? d.singleIntended?.ttfaMs ?? typedTtfaFallback) / 1000;
    const sAll = sd ? (sd.allDraftsMs ?? sd.llmTotalMs) / 1000 : NaN;
    const sVoiced = sd ? (sd.allVoicedMs ?? sd.allVoicedWallMs) / 1000 : NaN;
    const sTtfa = sd ? (sd.singleDraft0?.ttfaMs ?? sd.singleIntended?.ttfaMs ?? typedTtfaFallback) / 1000 : NaN;
    const stt = STT_MS / 1000;
    const play = PLAYBACK_START_MS / 1000;
    const spc = (a: "direct" | "scan") => (a === "direct" ? SEC_PER_CHAR_DIRECT : SEC_PER_CHAR_SCAN);
    const typingTime = (a: "direct" | "scan") => typingKeys * spc(a);
    const kwTime = (a: "direct" | "scan") => (kwChars + 1) * spc(a); // keywords + steer key
    const selectTime = (a: "direct" | "scan", idx: number) => (a === "direct" ? SELECT_DIRECT_S : (idx + 1) * SCAN_INTERVAL_S);
    const missOverhead = (a: "direct" | "scan") => (a === "direct" ? MISS_DIRECT_SELECTIONS * SELECT_DIRECT_S : MISS_SCAN_STEPS * SCAN_INTERVAL_S);

    const gaps: Record<string, Record<string, number>> = {};
    const gapsNoSteer: Record<string, Record<string, number>> = {};
    for (const access of ["direct", "scan"] as const) {
      const a = typingTime(access) + ttfaTyped + play;
      let b: number;
      let c: number;
      if (hitIdx != null) {
        const choiceAt = stt + allDrafts + selectTime(access, hitIdx);
        b = choiceAt + ttfaChoice + play;
        c = Math.max(choiceAt, stt + allVoiced) + play;
      } else {
        b = c = stt + allDrafts + missOverhead(access) + typingTime(access) + ttfaTyped + play;
      }
      gapsNoSteer[access] = { a, b, c };
      if (outcome === "steer-hit" || outcome === "steer-miss") {
        const steerStart = stt + allDrafts + missOverhead(access) + kwTime(access);
        if (outcome === "steer-hit") {
          const choiceAt = steerStart + sAll + selectTime(access, steerHitIdx!);
          b = choiceAt + sTtfa + play;
          c = Math.max(choiceAt, steerStart + sVoiced) + play;
        } else {
          // honest worst case: keywords typed and steered drafts waited for, then a second miss
          // overhead and the full reply typed (typed text is not prespoken)
          b = c = steerStart + sAll + missOverhead(access) + typingTime(access) + ttfaTyped + play;
        }
      }
      gaps[access] = { a, b, c };
    }

    const priorThread = turns.filter((x) => x.thread === t.thread && x.id < t.id);
    const leakRe = (re: RegExp) => (text: string) => re.test(text) && !re.test(t.partner) && !priorThread.some((x) => re.test(x.partner + x.intended));
    const leak = leakRe(rasamRe);
    const cricketLeak = (text: string) => cricketRe.test(text) && !cricketTopicRe.test(t.partner) && !priorThread.some((x) => cricketTopicRe.test(x.partner + x.intended));
    const wrongAddr = (text: string) => t.who !== "Amma" && ammaRe.test(text);
    const sDrafts: any[] = sd?.drafts ?? [];

    return {
      set: setName,
      id: t.id,
      thread: t.thread,
      lang: t.lang,
      who: t.who,
      relation: t.relation,
      setting: t.setting,
      partner: t.partner,
      intended: t.intended,
      outcome,
      drafts: d.drafts.map((x: any) => ({ text: x.text, gloss: x.gloss, atMs: x.atMs })),
      judge: js,
      steer: steered
        ? {
            keywords,
            keywordChars: kwChars,
            keywordModelRaw: kwRow?.content ?? null,
            drafts: sDrafts.map((x: any) => ({ text: x.text, gloss: x.gloss, atMs: x.atMs })),
            judge: sjs,
            hitIdx: steerHitIdx,
            measuredMs: {
              firstDraftMs: sd.firstDraftMs,
              allDraftsMs: sd.allDraftsMs,
              llmTotalMs: sd.llmTotalMs,
              allVoicedMs: sd.allVoicedMs,
              ttfaChoiceMs: sd.singleDraft0?.ttfaMs ?? null,
            },
            tokens: { prompt: sd.usageStream?.prompt_tokens ?? null, completion: sd.usageStream?.completion_tokens ?? null },
            chars: { prespokenTotal: sd.prespeak.reduce((a: number, p: any) => a + p.chars, 0), hitDraft: steerHitIdx != null ? cp(sd.drafts[steerHitIdx].text) : null },
            audioSecHitDraft: steerHitIdx != null ? (sd.prespeak[steerHitIdx]?.audioSec ?? null) : null,
          }
        : null,
      steerSkippedReason: hitIdx == null && !steered ? (kwRow ? "steer draft or judge missing" : "no keywords derived") : null,
      scriptCheck: { draftsWithScriptIssue: scriptIssues(d.drafts), steerDraftsWithScriptIssue: scriptIssues(sDrafts) },
      problems: {
        rasamLeak: d.drafts.filter((x: any) => leak(x.text)).map((x: any) => x.text),
        cricketLeak: d.drafts.filter((x: any) => cricketLeak(x.text)).map((x: any) => x.text),
        wrongAddressAmma: d.drafts.filter((x: any) => wrongAddr(x.text)).map((x: any) => x.text),
        steerRasamLeak: sDrafts.filter((x: any) => leak(x.text)).map((x: any) => x.text),
        steerWrongAddressAmma: sDrafts.filter((x: any) => wrongAddr(x.text)).map((x: any) => x.text),
      },
      measuredMs: {
        firstTokenMs: d.firstTokenMs,
        firstDraftMs: d.firstDraftMs,
        allDraftsMs: d.allDraftsMs,
        llmTotalMs: d.llmTotalMs,
        allVoicedMs: d.allVoicedMs,
        allFirstAudioMs: d.allFirstAudioMs,
        ttfaTypedMs: d.singleIntended?.ttfaMs ?? null,
        ttfaChoiceMs: d.singleDraft0?.ttfaMs ?? null,
        prespeakTransports: d.prespeak.map((p: any) => p.transport),
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
      audioSec: { intended: d.singleIntended?.audioSec ?? null, hitDraft: hitIdx != null ? (d.prespeak[hitIdx]?.audioSec ?? null) : null },
      motor: {
        typingKeys,
        typingKeysNativeCount: nativeChars + 1,
        keywordChars: kwChars,
        kanthTouchNoSteer: touchNoSteer,
        kanthTouch: touchSteer,
        scanTypingPresses: scanTyping,
        scanKanthPressesNoSteer: scanNoSteer,
        scanKanthPresses: scanSteer,
      },
      turnGapSec: gaps, // MODELED totals, steering included (the v2 headline)
      turnGapNoSteerSec: gapsNoSteer, // MODELED totals, v1 rule (miss = type)
      wallClock: d.at,
    };
  });
}

type Row = ReturnType<typeof buildRows>[number];

function hitStats(rs: Row[]) {
  const n = rs.length;
  const top1 = rs.filter((r) => r.judge.hitIdx === 0).length;
  const top4 = rs.filter((r) => r.judge.hitIdx != null).length;
  const misses = rs.filter((r) => r.judge.hitIdx == null).length;
  const steered = rs.filter((r) => r.steer).length;
  const steerHits = rs.filter((r) => r.outcome === "steer-hit").length;
  const steerAgree = rs.filter((r) => r.steer?.judge?.agree).length;
  const steerEither = rs.filter((r) => r.steer?.judge?.either).length;
  return {
    n,
    top1,
    top4,
    top1Pct: pct(top1, n),
    top4Pct: pct(top4, n),
    judgeAgree: rs.filter((r) => r.judge.agree).length,
    hitInEitherRun: rs.filter((r) => r.judge.either).length,
    misses,
    steered,
    steerHits,
    steerHitPctOfSteered: pct(steerHits, steered),
    steerJudgeAgree: steerAgree,
    steerHitInEitherRun: steerEither,
    resolvedWithoutTyping: top4 + steerHits,
    resolvedWithoutTypingPct: pct(top4 + steerHits, n),
  };
}

function motorStats(rs: Row[]) {
  const tk = mean(rs.map((r) => r.motor.typingKeys));
  const ktn = mean(rs.map((r) => r.motor.kanthTouchNoSteer));
  const kt = mean(rs.map((r) => r.motor.kanthTouch));
  const sp = mean(rs.map((r) => r.motor.scanTypingPresses));
  const skn = mean(rs.map((r) => r.motor.scanKanthPressesNoSteer));
  const sk = mean(rs.map((r) => r.motor.scanKanthPresses));
  return {
    typingKeysMean: tk,
    typingKeysNativeCountMean: mean(rs.map((r) => r.motor.typingKeysNativeCount)),
    keywordCharsMeanOnSteered: mean(rs.filter((r) => r.steer).map((r) => r.motor.keywordChars)),
    kanthTouchNoSteerMean: ktn,
    touchReductionNoSteerPct: 100 * (1 - ktn / tk),
    kanthTouchMean: kt,
    touchReductionPct: 100 * (1 - kt / tk),
    scanTypingPressesMean: sp,
    scanKanthPressesNoSteerMean: skn,
    scanReductionNoSteerPct: 100 * (1 - skn / sp),
    scanKanthPressesMean: sk,
    scanReductionPct: 100 * (1 - sk / sp),
  };
}

function gapStats(rs: Row[]) {
  const out: any = {};
  for (const variant of ["steer", "noSteer"] as const) {
    out[variant] = {};
    for (const access of ["direct", "scan"] as const) {
      out[variant][access] = {};
      for (const cond of ["a", "b", "c"] as const) {
        const g = (r: Row) => (variant === "steer" ? r.turnGapSec : r.turnGapNoSteerSec)[access]![cond]!;
        const xs = rs.map(g);
        const by = (o: Outcome) => rs.filter((r) => r.outcome === o).map(g);
        out[variant][access][cond] = {
          median: med(xs),
          mean: mean(xs),
          p25: q(xs, 0.25),
          p75: q(xs, 0.75),
          min: Math.min(...xs),
          max: Math.max(...xs),
          hitsMedian: med(by("hit")),
          hitsN: by("hit").length,
          steerHitsMedian: med(by("steer-hit")),
          steerHitsN: by("steer-hit").length,
          steerMissMedian: med(by("steer-miss")),
          steerMissN: by("steer-miss").length,
        };
      }
    }
  }
  return out;
}

function latencyStats(rs: Row[]) {
  const s = (xs: number[]) => {
    const v = xs.filter((x) => typeof x === "number" && Number.isFinite(x));
    return { n: v.length, median: med(v), p25: q(v, 0.25), p75: q(v, 0.75), min: Math.min(...v), max: Math.max(...v) };
  };
  return {
    firstDraftMs: s(rs.map((r) => r.measuredMs.firstDraftMs)),
    allDraftsMs: s(rs.map((r) => r.measuredMs.allDraftsMs)),
    allFirstAudioMs: s(rs.map((r) => r.measuredMs.allFirstAudioMs)),
    allVoicedMs: s(rs.map((r) => r.measuredMs.allVoicedMs)),
    ttfaChoiceMs: s(rs.map((r) => r.measuredMs.ttfaChoiceMs)),
    ttfaTypedMs: s(rs.map((r) => r.measuredMs.ttfaTypedMs)),
    steerFirstDraftMs: s(rs.filter((r) => r.steer).map((r) => r.steer!.measuredMs.firstDraftMs)),
    steerAllDraftsMs: s(rs.filter((r) => r.steer).map((r) => r.steer!.measuredMs.allDraftsMs ?? r.steer!.measuredMs.llmTotalMs)),
    steerAllVoicedMs: s(rs.filter((r) => r.steer).map((r) => r.steer!.measuredMs.allVoicedMs)),
    fewerThan4Drafts: rs.filter((r) => r.measuredMs.allDraftsMs == null).map((r) => r.id),
    steerFewerThan4Drafts: rs.filter((r) => r.steer && r.steer.measuredMs.allDraftsMs == null).map((r) => r.id),
  };
}

function problemStats(rs: Row[]) {
  const c = (k: keyof Row["problems"]) => rs.reduce((a, r) => a + r.problems[k].length, 0);
  return {
    totalDrafts: rs.reduce((a, r) => a + r.drafts.length, 0),
    totalSteerDrafts: rs.reduce((a, r) => a + (r.steer?.drafts.length ?? 0), 0),
    rasamLeak: c("rasamLeak"),
    cricketLeak: c("cricketLeak"),
    examplesCricket: rs.flatMap((r) => r.problems.cricketLeak.map((x: string) => `${r.id}: ${x}`)),
    wrongAddressAmma: c("wrongAddressAmma"),
    deflect: rs.reduce((a, r) => a + r.drafts.filter((x: any) => deflectRe.test(x.text) && !deflectRe.test(r.partner)).length, 0),
    steerRasamLeak: c("steerRasamLeak"),
    steerWrongAddressAmma: c("steerWrongAddressAmma"),
    deterministicScriptIssues: rs.reduce((a, r) => a + r.scriptCheck.draftsWithScriptIssue.length, 0),
    steerDeterministicScriptIssues: rs.reduce((a, r) => a + r.scriptCheck.steerDraftsWithScriptIssue.length, 0),
    judgeWrongLanguageBothRuns: rs.reduce((a, r) => a + r.judge.wrongLanguage.both.length, 0),
    judgeWrongScriptBothRuns: rs.reduce((a, r) => a + r.judge.wrongScript.both.length, 0),
    examplesRasam: rs.flatMap((r) => r.problems.rasamLeak.map((x: string) => `${r.id}: ${x}`)),
    examplesAmma: rs.flatMap((r) => r.problems.wrongAddressAmma.map((x: string) => `${r.id} (${r.who}): ${x}`)),
  };
}

function tokenStats(rs: Row[]) {
  return {
    promptMean: mean(rs.map((r) => r.tokens.prompt as number)),
    completionMean: mean(rs.map((r) => r.tokens.completion as number)),
    steerPromptMean: mean(rs.filter((r) => r.steer).map((r) => r.steer!.tokens.prompt as number)),
    steerCompletionMean: mean(rs.filter((r) => r.steer).map((r) => r.steer!.tokens.completion as number)),
    meanDraftChars: mean(rs.map((r) => r.chars.drafts.reduce((a: number, b: number) => a + b, 0) / r.chars.drafts.length)),
    meanPrespokenChars: mean(rs.map((r) => r.chars.prespokenTotal)),
  };
}

function summarize(rs: Row[]) {
  const groups: Record<string, Row[]> = { all: rs };
  for (const l of LANGS) groups[l] = rs.filter((r) => r.lang === l);
  const per = <T>(f: (x: Row[]) => T) => Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, f(v)])) as Record<string, T>;
  return { hit: per(hitStats), motor: per(motorStats), gaps: per(gapStats), latency: latencyStats(rs), problems: problemStats(rs), tokens: tokenStats(rs) };
}

// ------------------------------------------------------------------ build
const rows: Record<SetName, Row[]> = { heldout: buildRows("heldout"), original: buildRows("original") };
const S = { heldout: summarize(rows.heldout), original: summarize(rows.original) };
const raw = (set: SetName, stage: string) => loadOpt(`${V2}/${set}-raw-${stage}.json`);

// v1 (preserved) for comparison; problem counts recomputed from the v1 drafts with the same regexes
const v1 = load(`${OUT}/v1/conversations.json`);
const v1Problems = (() => {
  let rasam = 0;
  let amma = 0;
  let cricket = 0;
  let deflect = 0;
  for (const r of v1.turns as any[]) {
    const prior = ORIGINAL.TURNS.filter((x) => x.thread === r.thread && x.id < r.id);
    for (const d of r.drafts as any[]) {
      if (rasamRe.test(d.text) && !rasamRe.test(r.partner) && !prior.some((x) => rasamRe.test(x.partner + x.intended))) rasam++;
      if (cricketRe.test(d.text) && !cricketTopicRe.test(r.partner) && !prior.some((x) => cricketTopicRe.test(x.partner + x.intended))) cricket++;
      if (r.who !== "Amma" && ammaRe.test(d.text)) amma++;
      if (deflectRe.test(d.text) && !deflectRe.test(r.partner)) deflect++;
    }
  }
  return { rasamLeak: rasam, cricketLeak: cricket, deflect, wrongAddressAmma: amma, totalDrafts: (v1.turns as any[]).reduce((a: number, r: any) => a + r.drafts.length, 0) };
})();

const result = {
  meta: {
    generated: new Date().toISOString(),
    version: "v2",
    sets: Object.fromEntries(SET_NAMES.map((s) => [s, { label: SETS[s].SET_LABEL, n: rows[s].length }])),
    runs: Object.fromEntries(
      SET_NAMES.map((s) => [
        s,
        Object.fromEntries(["draft", "judge", "translit", "keywords", "steer", "steerjudge"].map((st) => [st, raw(s, st)?.meta ? { ...raw(s, st).meta, systemPrompt: undefined, profile: undefined, ttsStates: undefined } : null])),
      ]),
    ),
    judgeSystemPrompt: raw("heldout", "judge")?.meta?.systemPrompt,
    keywordInstruction: raw("heldout", "keywords")?.meta?.instruction ?? raw("original", "keywords")?.meta?.instruction,
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
  v1: { hit: v1.hit, motor: v1.motor, turnGap: v1.turnGap, tokens: v1.tokens, problems: v1Problems, latency: v1.latency },
  heldout: S.heldout,
  original: S.original,
  // all v2 turns, held-out first; each row carries `set`
  turns: [...rows.heldout, ...rows.original],
};
writeFileSync(`${OUT}/conversations.json`, JSON.stringify(result, null, 1));

// chart input for the Python renderer: v2 held-out, steering included
const H = S.heldout;
writeFileSync(
  `${OUT}/conversations-chart.json`,
  JSON.stringify(
    {
      humanNormS: 0.2,
      dispreferredS: 0.7,
      set: "heldout",
      groups: ["direct", "scan"].map((access) => ({
        access,
        bars: ["a", "b", "c"].map((c) => {
          const g = H.gaps.all!.steer[access][c];
          return { cond: c, median: g.median, p25: g.p25, p75: g.p75, hitsMedian: g.hitsMedian, steerHitsMedian: g.steerHitsMedian };
        }),
      })),
      hitTop4Pct: H.hit.all!.top4Pct,
      resolvedPct: H.hit.all!.resolvedWithoutTypingPct,
      steerHits: H.hit.all!.steerHits,
      steered: H.hit.all!.steered,
      n: rows.heldout.length,
    },
    null,
    1,
  ),
);

// ------------------------------------------------------------------ markdown
const L: string[] = [];
const P = (s = "") => L.push(s);
const CN: Record<string, string> = { a: "(a) Plain typing", b: "(b) Suggestions, no prespeak", c: "(c) Suggestions + prespeak" };
const dm = raw("heldout", "draft")?.meta;
const om = raw("original", "draft")?.meta;
// one prompt version across every v2 drafting/steering run
const PROMPT_SHAS = (() => {
  const metas = SET_NAMES.flatMap((s) => ["draft", "steer"].map((st) => raw(s, st)?.meta)).filter(Boolean);
  return { n: metas.length, shas: new Set(metas.map((m: any) => m.suggestTsSha256)), notes: new Set(metas.map((m: any) => m.profileNotes)), dirty: metas.some((m: any) => m.suggestTsGit?.dirty !== false) };
})();
const PROMPT_CONSISTENT = PROMPT_SHAS.shas.size === 1 && PROMPT_SHAS.notes.size === 1 && !PROMPT_SHAS.dirty;
if (!PROMPT_CONSISTENT) console.warn("WARNING: v2 raw files record more than one prompt version", PROMPT_SHAS);

P("# Kanth conversation benchmark v2: held-out set, keyword steering, motor actions, turn gap");
P();
P(`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC by \`bench/conversations_analyze.ts\` from the raw files in \`bench/results/v2/\`. The v1 report, data and chart are preserved unchanged in \`bench/results/v1/\`.`);
P();
P("**Every number is labelled MEASURED (timed or counted in a run, or judged by the LLM judge) or MODELED (computed from cited human rates and stated assumptions).** Hit rates are MEASURED by an LLM judge; motor actions are counted from the data, with scanning presses MODELED; turn gaps are MODELED totals that add measured system latencies to modeled human times.");
P();
P("## 0. Headline");
P();
const hh = S.heldout.hit.all!;
const oh = S.original.hit.all!;
P("| | v1 (old prompt) | v2, original 36 (biased) | v2, held-out 24 (unbiased) |");
P("|---|---:|---:|---:|");
P(`| Top-4 hit rate, first drafts (MEASURED, judge) | ${v1.hit.all.top4}/36 (${f1(v1.hit.all.top4Pct)}%) | ${oh.top4}/${oh.n} (${f1(oh.top4Pct)}%) | ${hh.top4}/${hh.n} (${f1(hh.top4Pct)}%) |`);
P(`| Top-1 hit rate (MEASURED) | ${v1.hit.all.top1}/36 (${f1(v1.hit.all.top1Pct)}%) | ${oh.top1}/${oh.n} (${f1(oh.top1Pct)}%) | ${hh.top1}/${hh.n} (${f1(hh.top1Pct)}%) |`);
P(`| Steer hit rate on misses, one round of 1 to 2 keywords (MEASURED) | not run | ${oh.steerHits}/${oh.steered} (${f1(oh.steerHitPctOfSteered)}%) | ${hh.steerHits}/${hh.steered} (${f1(hh.steerHitPctOfSteered)}%) |`);
P(`| Turns resolved without typing the reply (first drafts or one steer) | ${v1.hit.all.top4}/36 (${f1(v1.hit.all.top4Pct)}%) | ${oh.resolvedWithoutTyping}/${oh.n} (${f1(oh.resolvedWithoutTypingPct)}%) | ${hh.resolvedWithoutTyping}/${hh.n} (${f1(hh.resolvedWithoutTypingPct)}%) |`);
P(`| Touch motor actions vs plain typing (counted) | ${f0(-v1.motor.all.touchReductionPct)}% | ${f0(-S.original.motor.all!.touchReductionPct)}% | ${f0(-S.heldout.motor.all!.touchReductionPct)}% |`);
P(`| Scanning presses vs plain typing (MODELED, 2 per char) | ${f0(-v1.motor.all.scanReductionPct)}% | ${f0(-S.original.motor.all!.scanReductionPct)}% | ${f0(-S.heldout.motor.all!.scanReductionPct)}% |`);
for (const access of ["direct", "scan"] as const) {
  for (const c of ["a", "c"] as const) {
    P(`| Median turn gap, ${access === "direct" ? "direct selection" : "switch scanning"}, ${CN[c]} (MODELED) | ${fs(v1.turnGap.all[access][c].median)} | ${fs(S.original.gaps.all!.steer[access][c].median)} | ${fs(S.heldout.gaps.all!.steer[access][c].median)} |`);
  }
}
P();
P("- v1 numbers are the preserved v1 run (old prompt, no steering). v2 motor and turn-gap numbers include the steering round; section 3 and 4 also give them without steering.");
P("- **The held-out number is the one to quote.** The original 36 turns are the set whose failures motivated the prompt fix, so their v2 hit rate is not an unbiased estimate.");
P();

P("## 1. What changed between v1 and v2, and the method");
P();
P("**Prompt (not edited by this benchmark).** Between v1 and v2 the lead changed `server/suggest.ts`:");
P("- the format examples no longer contain names;");
P("- a rule that names such as Amma or Doctor belong only to their owners;");
P("- a rule to use profile notes only when they bear on what was said;");
P("- a new optional `keywords` field (steering: \"Every reply must say that, built around these words\").");
P("- The lead then made one more change before the v2 runs: rule 7 now reads \"Never invent facts: no appointments, plans, symptoms or events that were not mentioned. When <name> might need to give a detail you do not know, write a reply that asks or defers instead.\"");
P(`- The demo profile notes were trimmed to "${dm?.profileNotes ?? "n/a"}" (v1: "... Loves cricket and his mother's rasam.").`);
P(`- **Prompt version for every v2 number:** \`server/suggest.ts\` at git commit \`${dm?.suggestTsGit?.commit ?? "n/a"}\` (sha256 \`${String(dm?.suggestTsSha256 ?? "").slice(0, 16)}...\`, uncommitted changes: ${dm?.suggestTsGit?.dirty === false ? "none" : "UNKNOWN"}), with the profile from \`web/src/lib/settings.ts\` at \`${dm?.settingsTsGit?.commit ?? "n/a"}\`.`);
P(`  - ${PROMPT_CONSISTENT ? `All ${PROMPT_SHAS.n} v2 drafting and steering raw files record this same sha256 and these profile notes.` : "**WARNING: the v2 raw files record different prompt versions; see conversations.json meta.runs.**"}`);
P("  - A first v2 attempt began before that last change and was stopped. Its partial raw files are kept in `bench/results/v2/superseded-stale-prompt/` and are not used anywhere in this report.");
P();
P("**Held-out set.** `bench/conversations.heldout.ts`: 24 new turns in 9 threads, 8 Tamil, 8 Hindi/Hinglish, 8 Indian English.");
P("- Partners: elder sister, physiotherapist, office colleagues, a ward nurse, an electronics shopkeeper, a speech therapist, a college friend, a bank officer. None of these partners or topics is in the original 36.");
P("- The turns and intended replies were written after the prompt fix and **before any model output for them existed**, and were not changed after seeing output.");
P(`- The file's sha256 at run time (\`${String(dm?.setFileSha256 ?? "").slice(0, 16)}...\`) is recorded in every v2 raw file, so later edits would be detectable.`);
P("- Same format and same fictional user (Arjun) as the original set. They were written by a different author (agent) from the original 36, but one author for all 24.");
P();
P("**Drafting.** As v1:");
P("- the real `streamSuggestions` (model `sarvam-105b-conversations`, thinking off, temperature 0.7, tone warm, demo profile);");
P("- history = earlier turns of the same thread, with the intended replies standing in for the user's past turns;");
P("- prespeak on a pool of 4 warm Bulbul v4 Flash sockets, plus single-synthesis TTFA for the typed reply and for draft 1.");
P(`- Runs: original started ${om?.startedIST ?? "n/a"} IST, held-out started ${dm?.startedIST ?? "n/a"} IST, on a home connection in India, possibly with other agents using the same Sarvam account.`);
P();
P("**Judge (same protocol as v1).**");
P("- Model `sarvam-105b`, reasoning on, temperature 0, with the identical v1 system prompt, run twice per turn.");
P("- A turn is a hit only if both runs parsed and named the same draft.");
P();
P("**Keyword steering (new in v2), for every miss.** Pre-declared, fixed rule, written into `bench/conversations.ts` before any steering run.");
P(`- Steering words come from \`sarvam-105b\` at temperature 0, given **only the intended reply** (no partner turn, no drafts, no language label), with the instruction: *"${(result.meta.keywordInstruction ?? "").replace(/"/g, "'")}"* followed by "Reply with only those words."`);
P("- Post-processing: first non-empty line, quotes and a leading label stripped, at most two tokens kept. No manual edits.");
P("- The miss is then redrafted with `keywords=<those words>` through the same `streamSuggestions`, with the same history, and prespoken the same way. The steered drafts are judged with the same two-run protocol.");
P("- This simulates a user who types one or two Roman words. The model that picks the words never saw the drafts.");
P();

P("## 2. Do the drafts say what the user meant? (MEASURED, LLM-judged)");
P();
for (const s of SET_NAMES) {
  P(`### ${SET_TITLE[s]}`);
  P();
  P("| Language | Turns | Top-1 hit | Top-4 hit | Judge runs agree | Hit in either run | Misses steered | Steer hits | Resolved without typing |");
  P("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const k of ["ta-IN", "hi-IN", "en-IN", "all"]) {
    const h = S[s].hit[k]!;
    P(`| ${k === "all" ? "**All**" : LNAME[k]} | ${h.n} | ${h.top1} (${f1(h.top1Pct)}%) | ${h.top4} (${f1(h.top4Pct)}%) | ${h.judgeAgree}/${h.n} | ${h.hitInEitherRun} | ${h.steered}/${h.misses} | ${h.steerHits} (${f1(h.steerHitPctOfSteered)}%) | ${h.resolvedWithoutTyping} (${f1(h.resolvedWithoutTypingPct)}%) |`);
  }
  P();
}
P("v1, same original 36 turns, old prompt (preserved in `bench/results/v1/`):");
P();
P("| Language | Top-1 | Top-4 |");
P("|---|---:|---:|");
for (const k of ["ta-IN", "hi-IN", "en-IN", "all"]) {
  const h = v1.hit[k];
  P(`| ${k === "all" ? "**All**" : LNAME[k]} | ${h.top1}/${h.n} (${f1(h.top1Pct)}%) | ${h.top4}/${h.n} (${f1(h.top4Pct)}%) |`);
}
P();
P("Chart: `docs/img/steering.png` and `.svg` (`bench/steering_chart.py`). It shows how each turn ends: first-draft hit, steer hit, or typed.");
P();
P("**Did the prompt fix remove the two v1 problems?** Deterministic counts over drafts, with the same regexes as v1:");
P();
P("| | v1, original (144 drafts) | v2 original, first drafts | v2 held-out, first drafts | v2 steered drafts (both sets) |");
P("|---|---:|---:|---:|---:|");
P(`| Rasam brought up unprompted (profile leakage) | ${v1Problems.rasamLeak} | ${S.original.problems.rasamLeak} | ${S.heldout.problems.rasamLeak} | ${S.original.problems.steerRasamLeak + S.heldout.problems.steerRasamLeak} |`);
P(`| Cricket brought up when nobody mentioned cricket or a match (profile leakage) | ${v1Problems.cricketLeak} | ${S.original.problems.cricketLeak} | ${S.heldout.problems.cricketLeak} | n/a |`);
P(`| Drafts that deflect to rest, tiredness or sleep (counted only when the partner did not raise it) | ${v1Problems.deflect} | ${S.original.problems.deflect} | ${S.heldout.problems.deflect} | n/a |`);
P(`| Someone other than his mother addressed as "Amma" | ${v1Problems.wrongAddressAmma} | ${S.original.problems.wrongAddressAmma} | ${S.heldout.problems.wrongAddressAmma} | ${S.original.problems.steerWrongAddressAmma + S.heldout.problems.steerWrongAddressAmma} |`);
P(`| Drafts failing the deterministic script check | ${v1.flagCounts?.deterministicScriptIssues ?? "n/a"} | ${S.original.problems.deterministicScriptIssues} | ${S.heldout.problems.deterministicScriptIssues} | ${S.original.problems.steerDeterministicScriptIssues + S.heldout.problems.steerDeterministicScriptIssues} |`);
P(`| Total drafts | ${v1Problems.totalDrafts} | ${S.original.problems.totalDrafts} | ${S.heldout.problems.totalDrafts} | ${S.original.problems.totalSteerDrafts + S.heldout.problems.totalSteerDrafts} |`);
P();
const ex = [...S.original.problems.examplesRasam, ...S.heldout.problems.examplesRasam, ...S.original.problems.examplesCricket, ...S.heldout.problems.examplesCricket, ...S.original.problems.examplesAmma, ...S.heldout.problems.examplesAmma];
if (ex.length) P(`Remaining examples: ${ex.slice(0, 6).map((x) => `\`${x}\``).join("; ")}.`);
P();
P("- The v2 profile notes no longer mention rasam, so a zero in the rasam row is expected from the notes change alone. It does not by itself show that the rule \"use notes only when relevant\" works.");
P("- The cricket row is the fairer test of that rule: cricket is still in the v2 notes (\"Follows cricket\"). A draft counts if it mentions cricket when nobody in the thread said cricket, match or Kohli.");
P();

P("## 3. Motor actions per utterance (counted from the data; scanning presses are MODELED)");
P();
P("**Counting rules** (v1 rules, extended for steering):");
P("- **Plain typing:** characters of the intended reply on a Roman keyboard, + 1 to speak.");
P("  - Tamil and Hindi replies are romanized with Sarvam `POST /transliterate`. The original set reuses its v1 romanizations, since its replies are unchanged.");
P("- **Kanth, first drafts hit:** 1.");
P("- **Kanth, miss then steer hit:** keyword characters + 1 (steer) + 1 (select).");
P("- **Kanth, miss after steering (honest worst case):** keyword characters + 1, already spent, + the full typing cost.");
P("- **Single-switch scanning:**");
P("  - 2 presses per character, with the speak key and the steer key each counted as one more character.");
P("  - A selection of a draft is 1 press.");
P("- \"Without steering\" is the v1 rule: a hit is 1, a miss is the full typing cost.");
P();
for (const s of SET_NAMES) {
  P(`### ${SET_TITLE[s]}`);
  P();
  P("| Language | Typing keys (Roman) | Kanth touch, no steering | Reduction | Kanth touch, with steering | Reduction | Scan presses, typing | Scan, Kanth no steering | Reduction | Scan, Kanth with steering | Reduction | Mean keyword chars (steered turns) |");
  P("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const k of ["ta-IN", "hi-IN", "en-IN", "all"]) {
    const m = S[s].motor[k]!;
    P(`| ${k === "all" ? "**All**" : LNAME[k]} | ${f1(m.typingKeysMean)} | ${f1(m.kanthTouchNoSteerMean)} | ${f0(m.touchReductionNoSteerPct)}% | ${f1(m.kanthTouchMean)} | ${f0(m.touchReductionPct)}% | ${f1(m.scanTypingPressesMean)} | ${f1(m.scanKanthPressesNoSteerMean)} | ${f0(m.scanReductionNoSteerPct)}% | ${f1(m.scanKanthPressesMean)} | ${f0(m.scanReductionPct)}% | ${f1(m.keywordCharsMeanOnSteered)} |`);
  }
  P();
}
P(`v1 (original 36, no steering): typing ${f1(v1.motor.all.typingKeysMean)} keys, Kanth ${f1(v1.motor.all.kanthTouchMean)} (${f0(v1.motor.all.touchReductionPct)}% fewer); scanning ${f1(v1.motor.all.scanTypingPressesMean)} vs ${f1(v1.motor.all.scanKanthPressesMean)} presses (${f0(v1.motor.all.scanReductionPct)}% fewer).`);
P();

P("## 4. Turn gap: partner stops speaking to the user's voice being audible (MODELED totals)");
P();
P("**Parts and their status** (unchanged from v1, plus steering):");
P();
P("| Part | Value | Status |");
P("|---|---|---|");
P(`| Saaras final transcript after partner stops | ${STT_MS} ms (upper end of 102 to 123 ms) | MEASURED in-app (not re-measured) |`);
P("| Drafting, all 4 parsed (or end of stream if fewer than 4) | per turn | MEASURED this run |");
P("| All 4 prespoken, fully synthesized | per turn | MEASURED this run |");
P("| TTFA when synthesizing on choice, or after typing | per turn | MEASURED this run (single synthesis, warm socket) |");
P("| Steered redraft, all 4 parsed; steered prespeak; TTFA of steered draft 1 | per steered turn | MEASURED this run |");
P(`| Playback start once audio is in the browser | ${PLAYBACK_START_MS} ms | MEASURED in-app |`);
P(`| Direct selection of a draft | ${SELECT_DIRECT_S.toFixed(2)} s (one keystroke-time) | MODELED from cited 4.2 wpm |`);
P(`| Scanning selection of draft i | (i + 1) x ${SCAN_INTERVAL_S} s | MODELED (app default interval) |`);
P(`| Typing, and typing the keywords + steer key | (chars + 1) x ${SEC_PER_CHAR_DIRECT.toFixed(2)} s direct, x ${SEC_PER_CHAR_SCAN.toFixed(2)} s scanning | MODELED from cited 4.2 and 1.7 wpm, 5 chars/word |`);
P(`| Miss overhead (reach the keyboard) | 1 selection (direct) or ${MISS_SCAN_STEPS} scan steps | MODELED |`);
P();
P("**Conditions** (b and c include steering):");
P("- **(a) Plain typing.** Typing time + TTFA + playback start.");
P("- **(b) Suggestions, no prespeak.**");
P("  - Hit: STT + all-4-drafted + selection + TTFA + playback.");
P("  - Steer hit: STT + all-4-drafted + miss overhead + keyword typing (+ steer key) + measured steered redraft + selection + TTFA of the steered draft + playback.");
P("  - Steer miss: STT + all-4-drafted + miss overhead + keyword typing + steered redraft + miss overhead + full typing + TTFA + playback.");
P("- **(c) Suggestions + prespeak.** As (b), but a chosen draft (first or steered) is audible at max(choice time, its batch fully synthesized) + playback. Typed text is not prespoken.");
P();
for (const s of SET_NAMES) {
  P(`### ${SET_TITLE[s]}`);
  P();
  P("| Access | Condition | Median, all turns | Mean | P25 to P75 | Median, first-draft hits | Median, steer hits | Median, steer misses | Median without steering (v1 rule) |");
  P("|---|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const access of ["direct", "scan"] as const) {
    for (const c of ["a", "b", "c"] as const) {
      const g = S[s].gaps.all!.steer[access][c];
      const gn = S[s].gaps.all!.noSteer[access][c];
      P(`| ${access === "direct" ? "Direct (touch)" : "Switch scanning"} | ${CN[c]} | ${fs(g.median)} | ${fs(g.mean)} | ${fs(g.p25)} to ${fs(g.p75)} | ${c === "a" ? "n/a" : `${fs(g.hitsMedian)} (n=${g.hitsN})`} | ${c === "a" ? "n/a" : `${fs(g.steerHitsMedian)} (n=${g.steerHitsN})`} | ${c === "a" ? "n/a" : `${fs(g.steerMissMedian)} (n=${g.steerMissN})`} | ${fs(gn.median)} |`);
    }
  }
  P();
  P("Per language (median, steering included):");
  P();
  P("| Language | Direct (a) | Direct (b) | Direct (c) | Scan (a) | Scan (b) | Scan (c) |");
  P("|---|---:|---:|---:|---:|---:|---:|");
  for (const k of LANGS) {
    const g = S[s].gaps[k]!.steer;
    P(`| ${LNAME[k]} | ${fs(g.direct.a.median)} | ${fs(g.direct.b.median)} | ${fs(g.direct.c.median)} | ${fs(g.scan.a.median)} | ${fs(g.scan.b.median)} | ${fs(g.scan.c.median)} |`);
  }
  P();
}
P(`v1 medians (original 36, no steering): direct ${fs(v1.turnGap.all.direct.a.median)} / ${fs(v1.turnGap.all.direct.b.median)} / ${fs(v1.turnGap.all.direct.c.median)}; scanning ${fs(v1.turnGap.all.scan.a.median)} / ${fs(v1.turnGap.all.scan.b.median)} / ${fs(v1.turnGap.all.scan.c.median)} for (a) / (b) / (c).`);
P();
P("Chart: `docs/img/turn-gap.png` and `.svg` (v2 held-out, steering included). The v1 chart is in `bench/results/v1/turn-gap.png`.");
P();

P("## 5. Measured system latency (MEASURED, this run)");
P();
P("| Stage | Held-out median (P25 to P75) | Original median (P25 to P75) | v1 median |");
P("|---|---:|---:|---:|");
const lr = (name: string, k: string, v1k?: string) => {
  const a = (S.heldout.latency as any)[k];
  const b = (S.original.latency as any)[k];
  const c = v1k ? v1.latency?.[v1k] : null;
  P(`| ${name} | ${f0(a.median)} ms (${f0(a.p25)} to ${f0(a.p75)}), n=${a.n} | ${f0(b.median)} ms (${f0(b.p25)} to ${f0(b.p75)}), n=${b.n} | ${c ? `${f0(c.median)} ms` : "n/a"} |`);
};
lr("First draft parsed", "firstDraftMs", "firstDraftMs");
lr("All 4 drafts parsed", "allDraftsMs", "allDraftsMs");
lr("All 4 drafts fully synthesized (prespeak)", "allVoicedMs", "allVoicedMs");
lr("TTFA, draft synthesized on choice", "ttfaChoiceMs", "ttfaChoiceMs");
lr("TTFA, typed reply", "ttfaTypedMs", "ttfaTypedMs");
lr("Steered redraft, first draft parsed", "steerFirstDraftMs");
lr("Steered redraft, all 4 parsed (end of stream if fewer)", "steerAllDraftsMs");
lr("Steered drafts fully synthesized (prespeak)", "steerAllVoicedMs");
P();
const few = [...S.heldout.latency.fewerThan4Drafts, ...S.original.latency.fewerThan4Drafts];
const sfew = [...S.heldout.latency.steerFewerThan4Drafts, ...S.original.latency.steerFewerThan4Drafts];
P(`Turns where the stream yielded fewer than 4 usable drafts (end of stream used as "all drafted"): first drafts ${few.length ? few.join(", ") : "none"}; steered ${sfew.length ? sfew.join(", ") : "none"}.`);
P();
P(`Tokens per drafting call (MEASURED, streamed \`usage\`): held-out ${f0(S.heldout.tokens.promptMean)} prompt + ${f0(S.heldout.tokens.completionMean)} completion; original ${f0(S.original.tokens.promptMean)} + ${f0(S.original.tokens.completionMean)}; steered calls ${f0(mean([...rows.heldout, ...rows.original].filter((r) => r.steer).map((r) => r.steer!.tokens.prompt as number)))} + ${f0(mean([...rows.heldout, ...rows.original].filter((r) => r.steer).map((r) => r.steer!.tokens.completion as number)))}; v1 ${f0(v1.tokens.promptMean)} + ${f0(v1.tokens.completionMean)}. Mean draft length: held-out ${f1(S.heldout.tokens.meanDraftChars)} characters, original ${f1(S.original.tokens.meanDraftChars)}.`);
P();

P("## 6. Steering: what the user would have typed, and what came back");
P();
P("Every miss, with the pre-declared steering words. The verdict uses the same two-run judge.");
P();
P("| Set | Turn | Intended reply | Steering words (chars) | Steer judge runs | Result | Steered draft 1 |");
P("|---|---|---|---|---|---|---|");
for (const s of SET_NAMES)
  for (const r of rows[s].filter((x) => x.outcome !== "hit"))
    P(`| ${s} | ${r.id} | ${r.intended} | ${r.steer ? `\`${r.steer.keywords}\` (${r.steer.keywordChars})` : "n/a"} | ${r.steer ? `${r.steer.judge!.run1}, ${r.steer.judge!.run2}` : "n/a"} | ${r.outcome} | ${r.steer?.drafts[0]?.text ?? r.steerSkippedReason ?? ""} |`);
P();

P("## 7. Caveats");
P("- **Scripted sets.** Two sets of AI-written turns, each by a single author. The intended replies are not real user data.");
P("  - The held-out author also knew the v1 failure modes, which may have shaped the turns, for example by avoiding rasam topics. The turns were still written blind to any v2 draft.");
P("  - Small n: 24 held-out turns, 8 per language, so one turn moves a language's rate by 12.5 points.");
P("- **Self-judging.** The judge (`sarvam-105b`) is a Sarvam model judging Sarvam drafts, and the steering words come from the same model. Self-preference is possible.");
P("  - Two-run agreement reduces noise, not bias.");
P("  - The drafts are shown in app order, so position bias is possible.");
P("- **The original-set v2 number is biased.** Those 36 turns motivated the prompt fix.");
P("- **Steering is simulated.**");
P("  - A model, not a person, chose the 1 to 2 words, given only the intended reply. Real users might pick different words, or more of them.");
P("  - Only one steering round is modeled.");
P("- **Human times are modeled, not measured.**");
P("  - Keystroke and selection times come from population text-entry rates (4.2 and 1.7 wpm, 5 characters per word).");
P("  - Reading the drafts is folded into one selection time.");
P("  - STT and playback-start latencies are the in-app measurements from 3 turns.");
P("- **Measurement conditions.** System latencies were measured on a home connection under possible shared load from other agents on the same Sarvam account.");
P("- **Judge parse failures and disagreements count as misses,** as in v1.");
P();
P("## Appendix A. Per-turn verdicts");
P();
P("| Set | Turn | Partner | Intended reply | First drafts: run 1, run 2 | Outcome | All 4 drafted | All 4 voiced |");
P("|---|---|---|---|---|---|---:|---:|");
for (const s of SET_NAMES) for (const r of rows[s]) P(`| ${s} | ${r.id} | ${r.who} | ${r.intended} | ${r.judge.run1}, ${r.judge.run2} | ${r.outcome}${r.judge.hitIdx != null ? ` (draft ${r.judge.hitIdx + 1})` : r.steer?.hitIdx != null ? ` (steered draft ${r.steer.hitIdx + 1})` : ""} | ${f0(r.measuredMs.allDraftsMs ?? NaN)} ms | ${f0(r.measuredMs.allVoicedMs ?? NaN)} ms |`);
P();
P("## Appendix B. Files");
P("- `bench/conversations.data.ts`: original 36 turns.");
P("- `bench/conversations.heldout.ts`: held-out 24 turns.");
P("- `bench/conversations.ts`: API runs (draft, judge, translit, keywords, steer, steerjudge), per set.");
P("- `bench/conversations_analyze.ts`: this report.");
P("- `bench/conversations_chart.py`: the turn-gap chart (`docs/img/turn-gap.*`).");
P("- `bench/steering_chart.py`: the outcome chart (`docs/img/steering.*`).");
P("- `bench/results/v2/<set>-raw-{draft,judge,translit,keywords,steer,steerjudge}.json`: every call kept.");
P("  - The original set has no v2 translit file; it reuses `v1/conversations-raw-translit.json`.");
P("- `bench/results/v2/*.log`: run logs.");
P("- `bench/results/conversations.json`: joined per-turn rows for both sets, plus aggregates and the v1 summary.");
P("- `bench/results/v1/`: the v1 run, unchanged.");
P("  - It contains raw files, report, chart and the v1 analysis code as `.txt`.");
P("  - `bench/results/conversations-raw-*.json` at the top level are the same v1 raw files, left in place.");
writeFileSync(`${OUT}/conversations.md`, L.join("\n") + "\n");
console.log(
  JSON.stringify(
    {
      heldout: { hit: S.heldout.hit.all, motor: S.heldout.motor.all, gapsSteer: S.heldout.gaps.all!.steer, problems: { ...S.heldout.problems, examplesRasam: undefined, examplesAmma: undefined } },
      original: { hit: S.original.hit.all, motor: S.original.motor.all, gapsSteer: S.original.gaps.all!.steer, problems: { ...S.original.problems, examplesRasam: undefined } },
      v1Problems,
    },
    null,
    1,
  ),
);
