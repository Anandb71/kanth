// Cost per minute and per hour of Kanth conversation, from the measured conversation benchmark.
// No API calls. Reads bench/results/conversations.json, writes bench/results/cost.json and cost.md.
//
// Run from kanth/:  npx tsx bench/cost.ts
import { readFileSync, writeFileSync } from "node:fs";

const OUT = "bench/results";
const conv = JSON.parse(readFileSync(`${OUT}/conversations.json`, "utf8"));

// ---------------------------------------------------------------- prices (INR), fetched 2026-10-15
const PRICES = {
  fetched: "2026-10-15 (IST)",
  pricingPage: "https://docs.sarvam.ai/api/getting-started/pricing.md",
  llmInputPer1M: 15, // sarvam-105b-conversations, input (pricing page)
  llmCachedInputPer1M: 5, // cached input (pricing page); not assumed below
  llmOutputPer1M: 60, // output (pricing page)
  sttPerHour: 30, // "Speech to Text", priced per hour, billed per second (pricing page)
  ttsV4FlashPer10K: 20, // Bulbul v4 Flash: NOT on the pricing page on 2026-10-15; from https://www.sarvam.ai/blogs/bulbul-v4-flash
  ttsV4FlashSource: "https://www.sarvam.ai/blogs/bulbul-v4-flash (\"costs ₹20 per 10,000 characters\"); the pricing page lists only Bulbul v3 (₹30 per 10K characters) and Instant Voice Cloning (₹30)",
  ttsV3Per10K: 30, // pricing page; used as the high sensitivity
  translitPer10K: 20, // pricing page (Text Processing: Transliteration)
};

// ---------------------------------------------------------------- modeled human parameters
const PARTNER_WPM = 164; // turn-wise conversational rate, Yuan, Liberman and Cieri 2006 (research/evidence.md A1, VERIFIED)

const turns: any[] = conv.turns;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const perTurn = turns.map((t) => {
  const hit = t.judge.hitIdx != null;
  const partnerSec = (words(t.partner) / PARTNER_WPM) * 60; // MODELED
  const userAudioSec = hit ? t.audioSec.hitDraft ?? t.audioSec.intended : t.audioSec.intended; // MEASURED (Bulbul output duration)
  const ttsCharsPrespeak = t.chars.prespokenTotal + (hit ? 0 : t.chars.intendedNative); // MEASURED counts
  const ttsCharsNoPrespeak = hit ? t.chars.hitDraft : t.chars.intendedNative;
  const translitChars = !hit && t.lang !== "en-IN" ? t.chars.intendedRoman : 0; // typed Roman -> native on a miss
  const promptTok = t.tokens.prompt;
  const complTok = t.tokens.completion;
  const llmINR = (promptTok * PRICES.llmInputPer1M + complTok * PRICES.llmOutputPer1M) / 1e6;
  const ttsINR = (c: number, per10k: number) => (c * per10k) / 1e4;
  const translitINR = (translitChars * PRICES.translitPer10K) / 1e4;
  const sttINR = (partnerSec / 3600) * PRICES.sttPerHour;
  return {
    id: t.id,
    lang: t.lang,
    hit,
    partnerSec,
    userAudioSec,
    gapDirectB: t.turnGapSec.direct.b,
    gapDirectC: t.turnGapSec.direct.c,
    ttsCharsPrespeak,
    ttsCharsNoPrespeak,
    translitChars,
    promptTok,
    complTok,
    inr: {
      llm: llmINR,
      sttSpeechOnly: sttINR,
      translit: translitINR,
      ttsPrespeak: ttsINR(ttsCharsPrespeak, PRICES.ttsV4FlashPer10K),
      ttsNoPrespeak: ttsINR(ttsCharsNoPrespeak, PRICES.ttsV4FlashPer10K),
      ttsPrespeakV3Price: ttsINR(ttsCharsPrespeak, PRICES.ttsV3Per10K),
    },
  };
});

function scenario(name: string, rows: typeof perTurn, prespeak: boolean, sttMode: "speech" | "open") {
  const exchangeSec = rows.map((r) => r.partnerSec + (prespeak ? r.gapDirectC : r.gapDirectB) + r.userAudioSec);
  const meanExchange = mean(exchangeSec);
  const turnsPerMin = 60 / meanExchange;
  const perTurnINR = {
    llm: mean(rows.map((r) => r.inr.llm)),
    tts: mean(rows.map((r) => (prespeak ? r.inr.ttsPrespeak : r.inr.ttsNoPrespeak))),
    translit: mean(rows.map((r) => r.inr.translit)),
    stt: sttMode === "speech" ? mean(rows.map((r) => r.inr.sttSpeechOnly)) : 0,
  };
  const sttPerMin = sttMode === "open" ? PRICES.sttPerHour / 60 : perTurnINR.stt * turnsPerMin;
  const perMin = {
    llm: perTurnINR.llm * turnsPerMin,
    tts: perTurnINR.tts * turnsPerMin,
    translit: perTurnINR.translit * turnsPerMin,
    stt: sttPerMin,
  };
  const totalMin = perMin.llm + perMin.tts + perMin.translit + perMin.stt;
  return {
    name,
    prespeak,
    sttMode,
    turns: rows.length,
    meanExchangeSec: meanExchange,
    turnsPerMin,
    meanTtsCharsPerTurn: mean(rows.map((r) => (prespeak ? r.ttsCharsPrespeak : r.ttsCharsNoPrespeak))),
    perTurnINR: { ...perTurnINR, total: perTurnINR.llm + perTurnINR.tts + perTurnINR.translit + perTurnINR.stt },
    perMinINR: { ...perMin, total: totalMin },
    perHourINR: totalMin * 60,
  };
}

const hits = perTurn.filter((r) => r.hit);
const scenarios = [
  scenario("Test set as measured (misses typed), direct selection", perTurn, true, "speech"),
  scenario("Test set as measured (misses typed), direct selection", perTurn, false, "speech"),
  scenario("Busiest case: every turn a hit, direct selection", hits.length ? hits : perTurn, true, "speech"),
  scenario("Busiest case: every turn a hit, direct selection", hits.length ? hits : perTurn, false, "speech"),
  scenario("Busiest case, mic streamed to Saaras for the whole minute", hits.length ? hits : perTurn, true, "open"),
];

const tok = { prompt: mean(perTurn.map((r) => r.promptTok)), completion: mean(perTurn.map((r) => r.complTok)) };
const charsPre = mean(perTurn.map((r) => r.ttsCharsPrespeak));
const charsNo = mean(perTurn.map((r) => r.ttsCharsNoPrespeak));
const draftChars = mean(turns.map((t) => sum(t.chars.drafts) / t.chars.drafts.length));

writeFileSync(
  `${OUT}/cost.json`,
  JSON.stringify({ prices: PRICES, modeled: { partnerWpm: PARTNER_WPM }, measured: { meanPromptTokens: tok.prompt, meanCompletionTokens: tok.completion, meanTtsCharsPrespeak: charsPre, meanTtsCharsNoPrespeak: charsNo, meanDraftChars: draftChars }, scenarios, perTurn }, null, 1),
);

const r2 = (x: number) => x.toFixed(2);
const r3 = (x: number) => x.toFixed(3);
const r4 = (x: number) => x.toFixed(4);
const L: string[] = [];
const P = (s = "") => L.push(s);
P("# Kanth: cost per minute of conversation (INR)");
P();
P(`Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC by \`bench/cost.ts\` from \`bench/results/conversations.json\`. All inputs per turn are in \`bench/results/cost.json\`.`);
P();
P("## Prices (fetched 2026-10-15)");
P();
P(`| Item | Price | Source |`);
P(`|---|---|---|`);
P(`| Chat, \`sarvam-105b-conversations\` | ₹${PRICES.llmInputPer1M} per 1M input tokens, ₹${PRICES.llmOutputPer1M} per 1M output tokens (₹${PRICES.llmCachedInputPer1M} cached input, not assumed) | ${PRICES.pricingPage} |`);
P(`| Speech to text (Saaras) | ₹${PRICES.sttPerHour} per hour, billed per second | ${PRICES.pricingPage} |`);
P(`| Bulbul v4 Flash | ₹${PRICES.ttsV4FlashPer10K} per 10K characters | https://www.sarvam.ai/blogs/bulbul-v4-flash. **Not listed on the pricing page on 2026-10-15**, which shows only Bulbul v3 at ₹${PRICES.ttsV3Per10K}. |`);
P(`| Transliteration | ₹${PRICES.translitPer10K} per 10K characters | ${PRICES.pricingPage} |`);
P();
P("research/field.md reports a ₹10 per 10K launch promotion for v4 Flash. It is only partly verified, so it is not used here.");
P();
P("## Per-turn inputs");
P();
P("| Input | Value | Status |");
P("|---|---|---|");
P(`| Chat tokens per turn | ${tok.prompt.toFixed(0)} prompt + ${tok.completion.toFixed(0)} completion (mean of 36) | MEASURED: \`usage\` in the streamed response |`);
P(`| Characters synthesized per turn, with prespeak | ${charsPre.toFixed(1)} (4 drafts of mean ${draftChars.toFixed(1)} characters, plus the typed reply on a miss) | MEASURED |`);
P(`| Characters synthesized per turn, without prespeak | ${charsNo.toFixed(1)} (the chosen draft, or the typed reply on a miss) | MEASURED |`);
P(`| Prespeak character multiplier | ${(charsPre / charsNo).toFixed(2)}x | MEASURED ratio |`);
P(`| Partner speech per turn (the STT seconds) | words / ${PARTNER_WPM} wpm | MODELED (Yuan et al. 2006 turn-wise rate, evidence.md A1) |`);
P("| User speech per turn | duration of the Bulbul audio for what was said | MEASURED |");
P("| Turn gap | condition (c) or (b), direct selection, per turn, from conversations.md | MODELED total of measured and modeled parts |");
P();
P("Partner audio is not synthesized, because the partner is a human. Translation is not used.");
P();
P("**Turn-rate assumption.** One exchange is the partner's utterance, then the turn gap, then the user's utterance. Turns per minute = 60 / mean exchange length over the turns in the scenario.");
P("- With 'as measured', misses include typing time, so turns are slow and cost per minute is low.");
P("- The 'busiest case' uses only turns the judge counted as hits. This is the fastest conversation Kanth supports and the highest cost per minute.");
P();
P("## Cost");
P();
P("| Scenario | Prespeak | Turns/min | TTS chars/turn | ₹ per turn | ₹ per minute | ₹ per hour |");
P("|---|---|---:|---:|---:|---:|---:|");
for (const s of scenarios) {
  P(`| ${s.name}${s.sttMode === "open" ? " (STT billed for 60 s per minute)" : ""} | ${s.prespeak ? "yes" : "no"} | ${r2(s.turnsPerMin)} | ${s.meanTtsCharsPerTurn.toFixed(0)} | ${r4(s.perTurnINR.total)} | ${r3(s.perMinINR.total)} | ${r2(s.perHourINR)} |`);
}
P();
const busy = scenarios[2]!;
P("Breakdown, busiest case with prespeak, ₹ per minute:");
P(`- Bulbul ${r3(busy.perMinINR.tts)}`);
P(`- chat ${r3(busy.perMinINR.llm)}`);
P(`- Saaras ${r3(busy.perMinINR.stt)}`);
P(`- transliteration ${r3(busy.perMinINR.translit)}`);
P();
P("Sensitivity:");
P(`- At the Bulbul v3 price (₹30 per 10K characters), prespeak TTS per turn rises from ₹${r4(mean(perTurn.map((r) => r.inr.ttsPrespeak)))} to ₹${r4(mean(perTurn.map((r) => r.inr.ttsPrespeakV3Price)))}.`);
P("- If cached-input pricing applied to the fixed system prompt, chat cost would fall further.");
P();
P("**Read this as:** prespeak multiplies speech-synthesis characters by about 4, and is still a few rupees per hour at most.");
writeFileSync(`${OUT}/cost.md`, L.join("\n") + "\n");
console.log(JSON.stringify(scenarios.map((s) => ({ n: s.name, p: s.prespeak, stt: s.sttMode, tpm: s.turnsPerMin, min: s.perMinINR.total, hr: s.perHourINR })), null, 1));
