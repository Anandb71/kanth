// The always-ready board: short phrases synthesized once, stored on the device in IndexedDB,
// and loaded into the audio engine at startup so they play even with no network.
import type { VoiceRef } from "../../../shared/voices.ts";
import { phrasesFor, type Phrase } from "../../../shared/phrases.ts";
export { phrasesFor };
import { audio } from "./audio.ts";
import { kanth } from "./kanth.ts";

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
