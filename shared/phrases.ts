// The always-ready phrase board. Shared by the browser and the script that pre-generates its audio.
import type { LangCode, VoiceRef } from "./voices.ts";

export interface Phrase {
  id: string;
  text: string;
  lang: LangCode;
  gloss: string;
  urgent?: boolean;
}

export const SETS: Partial<Record<LangCode, Omit<Phrase, "id">[]>> = {
  "ta-IN": [
    { text: "வலிக்குது", lang: "ta-IN", gloss: "It hurts", urgent: true },
    { text: "Suction வேணும்", lang: "ta-IN", gloss: "I need suction", urgent: true },
    { text: "Nurse-ஐ கூப்பிடுங்க", lang: "ta-IN", gloss: "Call the nurse", urgent: true },
    { text: "ஆமா", lang: "ta-IN", gloss: "Yes" },
    { text: "இல்ல", lang: "ta-IN", gloss: "No" },
    { text: "ஒரு நிமிஷம்", lang: "ta-IN", gloss: "One minute" },
    { text: "மறுபடியும் சொல்லுங்க", lang: "ta-IN", gloss: "Please say that again" },
    { text: "Thank you", lang: "en-IN", gloss: "Thank you" },
  ],
  "hi-IN": [
    { text: "दर्द हो रहा है", lang: "hi-IN", gloss: "I am in pain", urgent: true },
    { text: "Suction चाहिए", lang: "hi-IN", gloss: "I need suction", urgent: true },
    { text: "Nurse को बुलाइए", lang: "hi-IN", gloss: "Call the nurse", urgent: true },
    { text: "हाँ", lang: "hi-IN", gloss: "Yes" },
    { text: "नहीं", lang: "hi-IN", gloss: "No" },
    { text: "एक मिनट", lang: "hi-IN", gloss: "One minute" },
    { text: "फिर से बोलिए", lang: "hi-IN", gloss: "Please say that again" },
    { text: "Thank you", lang: "en-IN", gloss: "Thank you" },
  ],
  "en-IN": [
    { text: "It hurts", lang: "en-IN", gloss: "It hurts", urgent: true },
    { text: "I need suction", lang: "en-IN", gloss: "I need suction", urgent: true },
    { text: "Please call the nurse", lang: "en-IN", gloss: "Call the nurse", urgent: true },
    { text: "Yes", lang: "en-IN", gloss: "Yes" },
    { text: "No", lang: "en-IN", gloss: "No" },
    { text: "One minute", lang: "en-IN", gloss: "One minute" },
    { text: "Please say that again", lang: "en-IN", gloss: "Please say that again" },
    { text: "Thank you", lang: "en-IN", gloss: "Thank you" },
  ],
};

export function voiceKey(v: VoiceRef): string {
  return v.kind === "clone" ? `clone:${v.voiceId}` : `persona:${v.name}`;
}

export function phrasesFor(lang: LangCode, voice: VoiceRef): Phrase[] {
  const set = SETS[lang] ?? SETS["en-IN"]!;
  return set.map((p) => ({ ...p, id: `phrase:${voiceKey(voice)}:${p.lang}:${p.text}` }));
}

