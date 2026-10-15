// Roman to native script transliteration through Sarvam POST /transliterate.
//
// Verified against the live API on 2026-10-15 (research/sarvam-api.md, probes p08 and p08b):
//   request  { input, source_language_code, target_language_code, numerals_format? }
//   response { request_id, transliterated_text, source_language_code }
// "amma charger edutthu vaa" -> "அம்மா சார்ஜர் எடுத்து வா" for ta-IN.
// English words come back spelled phonetically in the target script ("charger" -> "சார்ஜர்",
// "phone" -> "फ़ोन"), which Bulbul pronounces as the English word. The API has no switch to keep
// them in Latin script. Native-script words already in the input pass through unchanged, and
// digits stay as typed unless numerals_format is "native".
// source_language_code "en-IN" gives the same output as "auto" about 500 ms sooner (0.6 s vs 1.1 s),
// because "auto" runs language identification first.
// spoken_form is left off: it garbles times ("9:30am" came back as "नौ बजे तीन बजे ए, एम"),
// and Bulbul's own preprocessing already reads numbers aloud.
import { config } from "./env.ts";

const TIMEOUT_MS = 4000;
/** Documented input ceiling. Longer text returns 422. */
const MAX_INPUT_CHARS = 1000;

/** Target scripts the API writes. en-IN is left out: Roman to Roman has nothing to do. */
const TARGETS: ReadonlySet<string> = new Set([
  "bn-IN",
  "gu-IN",
  "hi-IN",
  "kn-IN",
  "ml-IN",
  "mr-IN",
  "od-IN",
  "pa-IN",
  "ta-IN",
  "te-IN",
]);

/**
 * The target_language_code for an app language, or undefined when the API cannot write that script.
 * Saaras realtime spells Odia `or-IN`; this endpoint only accepts `od-IN`.
 */
export function translitTarget(lang: string): string | undefined {
  const code = lang === "or-IN" ? "od-IN" : lang;
  return TARGETS.has(code) ? code : undefined;
}

/** True when the text has Roman letters to convert. Pure native-script text skips the network. */
export function hasRoman(text: string): boolean {
  return /[A-Za-z]/.test(text);
}

/** Splits leading and trailing whitespace off, so the reply keeps the spacing the user typed. */
export function splitPadding(text: string): { lead: string; core: string; trail: string } {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  return { lead: m?.[1] ?? "", core: m?.[2] ?? text, trail: m?.[3] ?? "" };
}

/** JSON body for POST /transliterate. */
export function translitBody(input: string, target: string): Record<string, string> {
  return {
    input,
    source_language_code: "en-IN",
    target_language_code: target,
    numerals_format: "international",
  };
}

/**
 * Converts Roman-script input to the native script of `lang`. Returns the text unchanged when there
 * is nothing to convert or the language has no transliteration target. Throws on any API failure
 * or after 4 s; the caller then keeps the typed text.
 */
export async function transliterate(text: string, lang: string): Promise<string> {
  const target = translitTarget(lang);
  if (!target || !hasRoman(text)) return text;
  if (!config.sarvamKey) throw new Error("SARVAM_API_KEY is not set");
  const { lead, core, trail } = splitPadding(text);
  if (core.length > MAX_INPUT_CHARS) throw new Error(`Transliteration takes at most ${MAX_INPUT_CHARS} characters`);

  let res: Response;
  try {
    res = await fetch(`${config.apiBase}/transliterate`, {
      method: "POST",
      headers: { "api-subscription-key": config.sarvamKey, "content-type": "application/json" },
      body: JSON.stringify(translitBody(core, target)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const name = (err as Error).name;
    if (name === "TimeoutError" || name === "AbortError") throw new Error(`Transliteration timed out after ${TIMEOUT_MS / 1000} s`);
    throw new Error(`Transliteration request failed: ${(err as Error).message}`);
  }
  const json = (await res.json().catch(() => ({}))) as { transliterated_text?: unknown; error?: { message?: string } };
  const out = typeof json.transliterated_text === "string" ? json.transliterated_text.trim() : "";
  if (!res.ok || !out) {
    throw new Error(`Transliteration ${res.status}: ${json.error?.message ?? "no text returned"}`);
  }
  return lead + out + trail;
}
