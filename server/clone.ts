// Sarvam Instant Voice Cloning (beta): bank a voice from 10 to 15 seconds of speech,
// then speak any supported language in it.
//
// Verified against the live API on 2026-10-15 (see research/sarvam-api.md):
//   POST /voices/create         multipart: name, language, file (wav)  -> 201 { data: { voice_id, reference_text } }
//   POST /voices/clone/stream   multipart: voice_id, text, language_code, output_audio_codec, speech_sample_rate, pace, pitch, loudness
// The clone endpoints ignore `model`, so cloned speech does not run on the v4 Flash tier.
// Its first audio arrives in about 1.5 s, which is why Kanth prespeaks.
import { config } from "./env.ts";
import { WavStripper } from "./pcm.ts";
import type { Prosody } from "../shared/tones.ts";
import { PCM_SAMPLE_RATE } from "../shared/protocol.ts";
import type { ChunkSink, TtsResult } from "./bulbul.ts";

export interface CloneParams {
  voiceId: string;
  text: string;
  lang: string;
  prosody: Prosody;
}

export interface CreatedVoice {
  voiceId: string;
  name: string;
  referenceText?: string;
}

export async function synthClone(p: CloneParams, sink: ChunkSink, signal?: AbortSignal): Promise<TtsResult> {
  if (!config.sarvamKey) throw new Error("SARVAM_API_KEY is not set");
  const form = new FormData();
  form.set("voice_id", p.voiceId);
  form.set("text", p.text.slice(0, 1000));
  form.set("language_code", p.lang);
  form.set("output_audio_codec", "wav");
  form.set("speech_sample_rate", String(PCM_SAMPLE_RATE));
  form.set("pace", String(p.prosody.pace));
  form.set("pitch", String(p.prosody.pitch));
  form.set("loudness", String(p.prosody.loudness));
  const t0 = performance.now();
  const res = await fetch(`${config.apiBase}/voices/clone/stream`, {
    method: "POST",
    headers: { "api-subscription-key": config.sarvamKey },
    body: form,
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`voice clone ${res.status}: ${text.slice(0, 300)}`);
  }
  const stripper = new WavStripper();
  let first = 0;
  let samples = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    const pcm = stripper.push(Buffer.from(chunk));
    if (!pcm.length) continue;
    if (!first) first = performance.now();
    samples += pcm.length >> 1;
    sink(pcm);
  }
  return { ttfaMs: first - t0, totalMs: performance.now() - t0, transport: "clone-stream", samples };
}

export async function createVoice(wav: Buffer, name: string, language = "en-IN"): Promise<CreatedVoice> {
  if (!config.sarvamKey) throw new Error("SARVAM_API_KEY is not set");
  const form = new FormData();
  form.set("name", name.slice(0, 60));
  form.set("language", language);
  form.set("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "reference.wav");
  const res = await fetch(`${config.apiBase}/voices/create`, {
    method: "POST",
    headers: { "api-subscription-key": config.sarvamKey },
    body: form,
    signal: AbortSignal.timeout(30000),
  });
  const body = (await res.json().catch(() => ({}))) as { data?: { voice_id?: string; reference_text?: string }; error?: { message?: string } };
  if (!res.ok || !body.data?.voice_id) throw new Error(body.error?.message ?? `voice create ${res.status}`);
  return { voiceId: body.data.voice_id, name, referenceText: body.data.reference_text };
}
