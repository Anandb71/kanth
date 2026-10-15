// Tone proof, part 1: synthesize the same sentences under each of the five tone presets.
//
// Run from kanth/:  npx tsx bench/tone.ts
// Uses synthRest (server/bulbul.ts) with bulbul:v4-flash at 24 kHz. The speaker is held fixed per
// sentence so only pace, pitch and loudness change (the app also swaps persona style per tone;
// that is deliberately switched off here). Writes WAVs and manifest.json to bench/results/tone/.
import { mkdirSync, writeFileSync } from "node:fs";
import { config } from "../server/env.ts";
import { synthRest } from "../server/bulbul.ts";
import { wavFromPcm } from "../server/pcm.ts";
import { PCM_SAMPLE_RATE } from "../shared/protocol.ts";
import { TONES } from "../shared/tones.ts";

if (!config.sarvamKey) throw new Error("SARVAM_API_KEY missing (run from kanth/)");
const DIR = "bench/results/tone";
const REPS = 2;
const GAP_MS = 1000;

const SENTENCES = [
  { id: "hi1", lang: "hi-IN", speaker: "shubh_hi_customer", text: "आज मेरा appointment है, please मुझे time पर ले चलो।" },
  { id: "hi2", lang: "hi-IN", speaker: "shubh_hi_customer", text: "मुझे थोड़ा pain हो रहा है, nurse को बुला दो।" },
  { id: "ta1", lang: "ta-IN", speaker: "vijay_ta_narration", text: "நான் நல்லா இருக்கேன், நீங்க கவலைப்பட வேண்டாம்." },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const scrub = (s: string) => s.split(config.sarvamKey).join("<redacted>");

async function main() {
  mkdirSync(DIR, { recursive: true });
  const clips: unknown[] = [];
  const failures: unknown[] = [];
  const save = () =>
    writeFileSync(
      `${DIR}/manifest.json`,
      JSON.stringify(
        {
          generated: new Date().toISOString(),
          model: "bulbul:v4-flash",
          transport: "rest (synthRest)",
          sampleRate: PCM_SAMPLE_RATE,
          note: "Speaker fixed per sentence; only the preset pace/pitch/loudness vary.",
          tones: TONES.map((t) => ({ id: t.id, label: t.label, prosody: t.prosody })),
          sentences: SENTENCES,
          clips,
          failures,
        },
        null,
        1,
      ),
    );
  // Interleave tones within each repetition so drift cannot line up with one tone.
  for (let rep = 1; rep <= REPS; rep++) {
    for (const s of SENTENCES) {
      for (const tone of TONES) {
        let done = false;
        for (let attempt = 1; attempt <= 4 && !done; attempt++) {
          const chunks: Buffer[] = [];
          try {
            const r = await synthRest(
              { text: s.text, lang: s.lang, model: "bulbul:v4-flash", speaker: s.speaker, prosody: tone.prosody },
              (pcm) => chunks.push(pcm),
            );
            const pcm = Buffer.concat(chunks);
            const file = `${s.id}_${tone.id}_r${rep}.wav`;
            writeFileSync(`${DIR}/${file}`, wavFromPcm(pcm, PCM_SAMPLE_RATE));
            clips.push({ file, sentence: s.id, lang: s.lang, speaker: s.speaker, tone: tone.id, label: tone.label, rep, prosody: tone.prosody, audioSec: +(r.samples / PCM_SAMPLE_RATE).toFixed(3), ts: new Date().toISOString() });
            console.log(`${file} ${(r.samples / PCM_SAMPLE_RATE).toFixed(2)} s`);
            done = true;
          } catch (e) {
            const msg = scrub(String((e as Error).message));
            failures.push({ sentence: s.id, tone: tone.id, rep, attempt, error: msg.slice(0, 300) });
            console.log(`FAIL ${s.id} ${tone.id} r${rep} attempt ${attempt}: ${msg.slice(0, 200)}`);
            if (!/\b(429|5\d\d)\b|fetch failed|ECONNRESET/i.test(msg)) break;
            await sleep(1000 * 2 ** (attempt - 1));
          }
        }
        save();
        await sleep(GAP_MS);
      }
    }
  }
  save();
  console.log(`done: ${clips.length} clips, ${failures.length} failed attempts`);
}

main().catch((e) => {
  console.error(scrub(String(e?.stack ?? e)));
  process.exit(1);
});
