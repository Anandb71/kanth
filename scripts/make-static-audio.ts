// Pre-generates, with Bulbul V4 Flash, the audio that never changes: the demo partner's lines and the
// always-ready phrases in the default voice. They ship as static files, so the demo starts instantly,
// the phrase board works offline on the very first visit, and visitors do not spend synthesis on them.
// Everything the user says in reply is still synthesized live.
// Run from kanth/ with SARVAM_API_KEY set: npx tsx scripts/make-static-audio.ts
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { synthRest } from "../server/bulbul.ts";
import { currentRoster, refreshRoster } from "../server/roster.ts";
import { SCENES } from "../shared/scenes.ts";
import { SETS, phrasesFor } from "../shared/phrases.ts";
import { clampProsody, toneById, type ToneId } from "../shared/tones.ts";
import { hasLatinWords, resolveSpeaker, type LangCode, type VoiceRef } from "../shared/voices.ts";

const OUT = join(process.cwd(), "web", "public", "cache");
mkdirSync(OUT, { recursive: true });
await refreshRoster();
const roster = currentRoster().speakers;
const DEFAULT_VOICE: VoiceRef = { kind: "persona", name: "shubh" };

interface Entry {
  file: string;
  samples: number;
  speaker: string;
  text: string;
}
const entries: Record<string, Entry> = {};

async function make(ids: string[], text: string, lang: LangCode, voiceName: string, tone: ToneId): Promise<void> {
  const r = resolveSpeaker(roster, voiceName, lang, tone, { codeMixedEnglish: hasLatinWords(text) });
  const chunks: Buffer[] = [];
  await synthRest({ text, lang, model: r.model, speaker: r.speaker, prosody: clampProsody(toneById(tone).prosody) }, (pcm) => chunks.push(pcm));
  const pcm = Buffer.concat(chunks);
  const file = `${createHash("sha1").update(ids[0]!).digest("hex").slice(0, 16)}.pcm`;
  writeFileSync(join(OUT, file), pcm);
  for (const id of ids) entries[id] = { file, samples: pcm.length >> 1, speaker: r.speaker, text };
  console.log(`${ids[0]}  ${r.speaker}  ${(pcm.length / 48000).toFixed(2)} s`);
}

// The partner's lines, used by both the interactive demo and the film.
for (let i = 0; i < SCENES.length; i++) {
  const sc = SCENES[i]!;
  await make([`demo-partner-${i}`, `film-partner-${i}`], sc.text, sc.lang, sc.speaker, "warm");
}
// The always-ready phrases in the default voice, for every language that has a set.
for (const lang of Object.keys(SETS) as LangCode[]) {
  for (const p of phrasesFor(lang, DEFAULT_VOICE)) await make([p.id], p.text, p.lang, "shubh", p.urgent ? "urgent" : "warm");
}

writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ generated: new Date().toISOString(), model: "bulbul:v4-flash", sampleRate: 24000, format: "pcm_s16le_mono", entries }, null, 1));
console.log(`${Object.keys(entries).length} ids, written to web/public/cache`);
