// One browser connection. Routes synthesis, drafting, speech recognition and transliteration,
// and reports every failure to the browser with what Kanth did about it.
import type WebSocket from "ws";
import { PCM_SAMPLE_RATE, type ClientMessage, type ServerMessage, type SuggestRequest, type SynthRequest } from "../shared/protocol.ts";
import { clampProsody, toneById } from "../shared/tones.ts";
import { hasLatinWords, resolveSpeaker } from "../shared/voices.ts";
import type { TtsEngine, TtsResult } from "./bulbul.ts";
import { currentRoster } from "./roster.ts";
import { streamSuggestions } from "./suggest.ts";
import { synthClone } from "./clone.ts";
import { SttSession } from "./stt.ts";
import { transliterate } from "./translit.ts";
import { keyPresent } from "./env.ts";

export class Session {
  private aborts = new Map<string, AbortController>();
  private stt = new Map<string, SttSession>();
  private closed = false;

  constructor(private ws: WebSocket, private tts: TtsEngine, private version: string) {
    this.send({ t: "hello", keyPresent: keyPresent(), roster: currentRoster().speakers, version });
    ws.on("message", (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      void this.handle(msg).catch((err: Error) => this.send({ t: "error", scope: "server", message: err.message }));
    });
    ws.on("close", () => this.dispose());
  }

  send(msg: ServerMessage): void {
    if (!this.closed && this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private async handle(msg: ClientMessage): Promise<void> {
    switch (msg.t) {
      case "ping":
        this.send({ t: "pong", at: msg.at, serverAt: Date.now() });
        return;
      case "synth":
        await this.synth(msg);
        return;
      case "suggest":
        await this.suggest(msg);
        return;
      case "cancel":
        this.aborts.get(msg.id)?.abort();
        return;
      case "translit": {
        try {
          const text = await transliterate(msg.text, msg.lang);
          this.send({ t: "translit", id: msg.id, text });
        } catch (err) {
          this.send({ t: "error", id: msg.id, scope: "translit", message: (err as Error).message, fallback: "Kept your text as typed." });
          this.send({ t: "translit", id: msg.id, text: msg.text });
        }
        return;
      }
      case "stt_start": {
        this.stt.get(msg.sessionId)?.close();
        const s = new SttSession(msg.sessionId, msg.lang ?? "unknown", (m) => this.send(m));
        this.stt.set(msg.sessionId, s);
        await s.start();
        return;
      }
      case "stt_audio":
        this.stt.get(msg.sessionId)?.audio(Buffer.from(msg.pcm, "base64"));
        return;
      case "stt_stop":
        this.stt.get(msg.sessionId)?.stop();
        return;
    }
  }

  /** Synthesizes one utterance and streams PCM chunks to the browser. */
  async synth(req: Omit<SynthRequest, "t">): Promise<TtsResult | null> {
    const ac = new AbortController();
    this.aborts.set(req.id, ac);
    let seq = 0;
    // Guard against runaway audio: we once measured 58 s of speech for a 42 character reply.
    // Nothing longer than a generous reading time is ever played.
    const maxSamples = Math.round((3 + req.text.length * 0.3) * PCM_SAMPLE_RATE);
    let sent = 0;
    let cut = false;
    const sink = (pcm: Buffer) => {
      if (cut) return;
      let chunk = pcm;
      if (sent + (chunk.length >> 1) > maxSamples) {
        chunk = chunk.subarray(0, Math.max(0, maxSamples - sent) * 2);
        cut = true;
        this.send({ t: "error", scope: "tts", message: "Bulbul returned far more audio than the text needs.", fallback: "Kanth cut it off so it cannot ramble." });
      }
      sent += chunk.length >> 1;
      if (chunk.length) this.send({ t: "audio", id: req.id, seq: seq++, pcm: chunk.toString("base64") });
    };
    const reset = () => this.send({ t: "error", id: req.id, scope: "tts", message: "reset", fallback: "Retrying on a backup connection." });
    const tone = toneById(req.tone);
    const prosody = clampProsody(tone.prosody);
    try {
      if (req.voice.kind === "clone") {
        const r = await synthClone({ voiceId: req.voice.voiceId, text: req.text, lang: req.lang, prosody }, sink, ac.signal);
        this.send({ t: "audio_end", id: req.id, ...r, model: "voice-clone", speaker: req.voice.label, substituted: false });
        return r;
      }
      const resolved = resolveSpeaker(currentRoster().speakers, req.voice.name, req.lang, req.tone, {
        codeMixedEnglish: hasLatinWords(req.text),
      });
      const r = await this.tts.synth({ text: req.text, lang: req.lang, model: resolved.model, speaker: resolved.speaker, prosody }, sink, reset, ac.signal);
      this.send({ t: "audio_end", id: req.id, ...r, model: resolved.model, speaker: resolved.speaker, substituted: resolved.substituted });
      return r;
    } catch (err) {
      this.send({
        t: "error",
        id: req.id,
        scope: "tts",
        message: (err as Error).message,
        fallback: req.purpose === "prespeak" ? "Will synthesize when you choose it." : "Using the device voice so you are not left silent.",
      });
      return null;
    } finally {
      this.aborts.delete(req.id);
    }
  }

  /** Drafts replies and prespeaks each as soon as it is parsed. */
  private async suggest(req: SuggestRequest): Promise<void> {
    const ac = new AbortController();
    this.aborts.set(req.turnId, ac);
    const t0 = performance.now();
    const synths: Promise<unknown>[] = [];
    try {
      const stats = await streamSuggestions(
        { profile: req.profile, history: req.history, partner: req.partner, tone: req.tone, keywords: req.keywords, signal: ac.signal },
        (d) => {
          this.send({ t: "suggestion", turnId: req.turnId, idx: d.idx, text: d.text, lang: d.lang, gloss: d.gloss, atMs: performance.now() - t0 });
          if (req.prespeak) {
            synths.push(
              this.synth({ id: `${req.turnId}:${d.idx}:${req.tone}`, text: d.text, lang: d.lang, voice: req.voice, tone: req.tone, purpose: "prespeak" }),
            );
          }
        },
      );
      this.send({ t: "suggestions_done", turnId: req.turnId, count: synths.length, firstTokenMs: stats.firstTokenMs, totalMs: stats.totalMs, model: stats.model });
      await Promise.allSettled(synths);
    } catch (err) {
      if (ac.signal.aborted) return;
      this.send({ t: "error", id: req.turnId, scope: "llm", message: (err as Error).message, fallback: "Showing your saved phrases. You can also type." });
    } finally {
      this.aborts.delete(req.turnId);
    }
  }

  private dispose(): void {
    this.closed = true;
    for (const ac of this.aborts.values()) ac.abort();
    for (const s of this.stt.values()) s.close();
  }
}
