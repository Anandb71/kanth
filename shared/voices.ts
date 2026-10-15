// Voice and language routing. Bulbul v4 Flash speaker IDs follow voice_language_style.
import type { ToneId } from "./tones.ts";
import { toneById } from "./tones.ts";

export type LangCode =
  | "hi-IN" | "en-IN" | "ta-IN" | "bn-IN" | "gu-IN" | "kn-IN"
  | "ml-IN" | "mr-IN" | "od-IN" | "pa-IN" | "te-IN";

export interface Language {
  code: LangCode;
  short: string; // roster segment, e.g. "ta"
  name: string;
  native: string;
  /** v4 Flash has no personas for this language yet; route to bulbul:v3. */
  v3Only?: boolean;
}

export const LANGUAGES: readonly Language[] = [
  { code: "ta-IN", short: "ta", name: "Tamil", native: "தமிழ்" },
  { code: "hi-IN", short: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "en-IN", short: "en", name: "English", native: "English" },
  { code: "bn-IN", short: "bn", name: "Bengali", native: "বাংলা" },
  { code: "te-IN", short: "te", name: "Telugu", native: "తెలుగు" },
  { code: "kn-IN", short: "kn", name: "Kannada", native: "ಕನ್ನಡ" },
  { code: "mr-IN", short: "mr", name: "Marathi", native: "मराठी" },
  { code: "gu-IN", short: "gu", name: "Gujarati", native: "ગુજરાતી" },
  { code: "pa-IN", short: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "ml-IN", short: "ml", name: "Malayalam", native: "മലയാളം", v3Only: true },
  { code: "od-IN", short: "od", name: "Odia", native: "ଓଡ଼ିଆ", v3Only: true },
] as const;

export function languageByCode(code: string): Language | undefined {
  return LANGUAGES.find((l) => l.code === code);
}

/** A voice the user speaks with. Persona voices resolve to a speaker ID per language and tone. */
export type VoiceRef =
  | { kind: "persona"; name: string }
  | { kind: "clone"; voiceId: string; label: string };

/** Default persona per language when the chosen voice has no persona in that language. */
export const LANGUAGE_DEFAULT_VOICE: Record<string, string> = {
  ta: "vijay",
  hi: "shubh",
  en: "shubh",
  bn: "arnab",
  te: "tarun",
  kn: "chetan",
  mr: "soham",
  gu: "bhavik",
  pa: "anand",
};

/** bulbul:v3 short-name speakers used for languages v4 Flash cannot voice yet. */
export const V3_FALLBACK_SPEAKER = "shubh";

export interface ResolvedSpeaker {
  model: "bulbul:v4-flash" | "bulbul:v3";
  speaker: string;
  /** True when we had to leave the requested voice to cover this language. */
  substituted: boolean;
}

/**
 * Pick the best speaker ID for a voice in a language and tone.
 * Code-mixed Hindi-English prefers an `enhi` persona of the same voice when one exists.
 */
export function resolveSpeaker(
  roster: readonly string[],
  voiceName: string,
  lang: LangCode,
  tone: ToneId,
  opts: { codeMixedEnglish?: boolean } = {},
): ResolvedSpeaker {
  const language = languageByCode(lang);
  if (!language) throw new Error(`unsupported language ${lang}`);
  if (language.v3Only) return { model: "bulbul:v3", speaker: V3_FALLBACK_SPEAKER, substituted: true };
  // An exact speaker ID is honoured as given (used for demo partner voices).
  if (roster.includes(voiceName)) return { model: "bulbul:v4-flash", speaker: voiceName, substituted: false };

  const styles = toneById(tone).preferStyles;
  const pick = (name: string, seg: string): string | undefined => {
    const prefix = `${name}_${seg}_`;
    const options = roster.filter((s) => s.startsWith(prefix));
    if (options.length === 0) return undefined;
    for (const style of styles) {
      const hit = options.find((s) => s.slice(prefix.length) === style);
      if (hit) return hit;
    }
    for (const style of styles) {
      const hit = options.find((s) => s.slice(prefix.length).startsWith(style));
      if (hit) return hit;
    }
    return options[0];
  };

  if (opts.codeMixedEnglish && language.short === "hi") {
    const mixed = pick(voiceName, "enhi");
    if (mixed) return { model: "bulbul:v4-flash", speaker: mixed, substituted: false };
  }
  const own = pick(voiceName, language.short);
  if (own) return { model: "bulbul:v4-flash", speaker: own, substituted: false };

  const fallbackName = LANGUAGE_DEFAULT_VOICE[language.short];
  const fallback = fallbackName ? pick(fallbackName, language.short) : undefined;
  if (fallback) return { model: "bulbul:v4-flash", speaker: fallback, substituted: true };

  const any = roster.find((s) => s.split("_")[1] === language.short);
  if (any) return { model: "bulbul:v4-flash", speaker: any, substituted: true };
  return { model: "bulbul:v3", speaker: V3_FALLBACK_SPEAKER, substituted: true };
}

/** Rough script detection so we can set language_code from the text the user chose. */
export function detectScriptLanguage(text: string): LangCode | undefined {
  const counts: Partial<Record<LangCode, number>> = {};
  const ranges: [LangCode, number, number][] = [
    ["hi-IN", 0x0900, 0x097f],
    ["bn-IN", 0x0980, 0x09ff],
    ["pa-IN", 0x0a00, 0x0a7f],
    ["gu-IN", 0x0a80, 0x0aff],
    ["od-IN", 0x0b00, 0x0b7f],
    ["ta-IN", 0x0b80, 0x0bff],
    ["te-IN", 0x0c00, 0x0c7f],
    ["kn-IN", 0x0c80, 0x0cff],
    ["ml-IN", 0x0d00, 0x0d7f],
  ];
  let latin = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) latin++;
    for (const [code, lo, hi] of ranges) {
      if (cp >= lo && cp <= hi) counts[code] = (counts[code] ?? 0) + 1;
    }
  }
  let best: LangCode | undefined;
  let bestN = 0;
  for (const [code, n] of Object.entries(counts) as [LangCode, number][]) {
    if (n > bestN) { best = code; bestN = n; }
  }
  if (best) return best;
  return latin > 0 ? "en-IN" : undefined;
}

/** True when an Indic-script utterance also carries English words in Latin script. */
export function hasLatinWords(text: string): boolean {
  return /[A-Za-z]{2,}/.test(text);
}
