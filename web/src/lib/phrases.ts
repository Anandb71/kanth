// The always-ready board: short phrases synthesized once, stored on the device in IndexedDB,
// and loaded into the audio engine at startup so they play even with no network.
import type { LangCode, VoiceRef } from "../../../shared/voices.ts";
import type { Phrase } from "../components/Talk.tsx";
import { audio } from "./audio.ts";
import { kanth } from "./kanth.ts";

const SETS: Partial<Record<LangCode, Omit<Phrase, "id">[]>> = {
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

function voiceKey(v: VoiceRef): string {
  return v.kind === "clone" ? `clone:${v.voiceId}` : `persona:${v.name}`;
}

export function phrasesFor(lang: LangCode, voice: VoiceRef): Phrase[] {
  const set = SETS[lang] ?? SETS["en-IN"]!;
  return set.map((p) => ({ ...p, id: `phrase:${voiceKey(voice)}:${p.lang}:${p.text}` }));
}

const DB = "kanth";
const STORE = "phrases";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getCached(id: string): Promise<Float32Array | undefined> {
  const db = await openDb();
  return new Promise((resolve) => {
    const req = db.transaction(STORE).objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as Float32Array | undefined);
    req.onerror = () => resolve(undefined);
  });
}

async function putCached(id: string, samples: Float32Array): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(samples, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/**
 * Makes every phrase playable offline. Loads from the device cache first;
 * synthesizes and stores anything missing. Returns the ids that are ready.
 */
export async function preparePhrases(phrases: Phrase[], voice: VoiceRef, onReady: (id: string) => void): Promise<void> {
  for (const p of phrases) {
    try {
      const cached = await getCached(p.id);
      if (cached && cached.length) {
        audio.loadSamples(p.id, cached);
        onReady(p.id);
        continue;
      }
    } catch {
      /* IndexedDB unavailable: fall through to network */
    }
    void kanth.presynth(p.id, p.text, p.lang, voice, "prespeak", p.urgent ? "urgent" : "warm").then(async (ok) => {
      if (!ok) return;
      onReady(p.id);
      try {
        await putCached(p.id, audio.samplesOf(p.id));
      } catch {
        /* not cached; still playable this session */
      }
    });
  }
}
