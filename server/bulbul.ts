// Bulbul text-to-speech with three transports and automatic fallback.
//
// Primary: a pool of warm WebSocket connections (config -> text -> flush per utterance).
// Fallback 1: HTTP streaming (POST /text-to-speech/stream).
// Fallback 2: single-response REST (POST /text-to-speech).
// Every utterance resolves to PCM16 mono at 24 kHz, delivered chunk by chunk.
import WebSocket from "ws";
import { config } from "./env.ts";
import { WavStripper, parseWav, resamplePcm16 } from "./pcm.ts";
import type { Prosody } from "../shared/tones.ts";
import type { Transport } from "../shared/protocol.ts";
import { PCM_SAMPLE_RATE } from "../shared/protocol.ts";

export interface TtsParams {
  text: string;
  lang: string;
  model: "bulbul:v4-flash" | "bulbul:v3";
  speaker: string;
  prosody: Prosody;
}

export interface TtsResult {
  ttfaMs: number;
  totalMs: number;
  transport: Transport;
  samples: number;
}

export type ChunkSink = (pcm: Buffer) => void;
export type StateListener = (state: "ready" | "connecting" | "degraded" | "down", detail?: string) => void;

const FIRST_AUDIO_TIMEOUT_MS = 5000;
const UTTERANCE_TIMEOUT_MS = 20000;
const PING_EVERY_MS = 20000;

function bodyFor(p: TtsParams, sampleRate: number, codec: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    text: p.text,
    language_code: p.lang,
    model: p.model,
    speaker: p.speaker,
    speech_sample_rate: sampleRate,
    output_audio_codec: codec,
    pace: p.prosody.pace,
    enable_preprocessing: true,
  };
  // pitch and loudness are v4 Flash controls; v3 accepts pace only per the migration guide.
  if (p.model === "bulbul:v4-flash") {
    body.pitch = p.prosody.pitch;
    body.loudness = p.prosody.loudness;
  }
  return body;
}

class TtsError extends Error {
  constructor(message: string, readonly delivered: boolean, readonly fatal = false) {
    super(message);
  }
}

/** One warm Bulbul WebSocket. Carries one utterance at a time. */
class BulbulSocket {
  private ws: WebSocket | null = null;
  private opening: Promise<void> | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private failures = 0;
  busy = false;
  private handler: ((msg: { type: string; data?: any }) => void) | null = null;
  private closeHandler: ((code: number, reason: string) => void) | null = null;

  constructor(readonly model: string, readonly index: number) {}

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  open(): Promise<void> {
    if (this.isOpen) return Promise.resolve();
    if (this.opening) return this.opening;
    const url = `${config.wsBase}/text-to-speech/ws?model=${encodeURIComponent(this.model)}&send_completion_event=true`;
    this.opening = new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url, { headers: { "api-subscription-key": config.sarvamKey } });
      const timer = setTimeout(() => {
        ws.terminate();
        reject(new Error("Bulbul socket did not open within 15 s"));
      }, 15000);
      ws.on("open", () => {
        clearTimeout(timer);
        this.ws = ws;
        this.failures = 0;
        this.startPing();
        resolve();
      });
      ws.on("message", (raw) => {
        let msg: { type: string; data?: any };
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }
        this.handler?.(msg);
      });
      ws.on("close", (code, reason) => {
        clearTimeout(timer);
        this.stopPing();
        if (this.ws === ws) this.ws = null;
        this.closeHandler?.(code, reason.toString());
        reject(new Error(`Bulbul socket closed ${code} ${reason.toString()}`));
      });
      ws.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    }).finally(() => {
      this.opening = null;
    });
    return this.opening;
  }

  /** Reconnect with exponential backoff and jitter. Resolves when open or gives up after 6 tries. */
  async reconnect(): Promise<boolean> {
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        await this.open();
        return true;
      } catch {
        this.failures++;
        const delay = Math.min(15000, 300 * 2 ** attempt) * (0.7 + Math.random() * 0.6);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    return false;
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.isOpen && !this.busy) this.ws!.send(JSON.stringify({ type: "ping" }));
    }, PING_EVERY_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  async synth(p: TtsParams, sink: ChunkSink): Promise<TtsResult> {
    await this.open();
    const ws = this.ws!;
    const t0 = performance.now();
    let first = 0;
    let samples = 0;
    let delivered = false;
    const stripper = new WavStripper();
    return new Promise<TtsResult>((resolve, reject) => {
      const done = (err?: Error) => {
        clearTimeout(firstTimer);
        clearTimeout(totalTimer);
        this.handler = null;
        this.closeHandler = null;
        if (err) reject(err);
        else resolve({ ttfaMs: first - t0, totalMs: performance.now() - t0, transport: "ws", samples });
      };
      const firstTimer = setTimeout(() => {
        ws.terminate();
        done(new TtsError("no audio within 5 s on WebSocket", false));
      }, FIRST_AUDIO_TIMEOUT_MS);
      const totalTimer = setTimeout(() => {
        ws.terminate();
        done(new TtsError("utterance took over 20 s on WebSocket", delivered));
      }, UTTERANCE_TIMEOUT_MS);
      this.closeHandler = (code, reason) => done(new TtsError(`socket closed ${code} ${reason}`, delivered, code >= 4000 && code < 5000));
      this.handler = (msg) => {
        if (msg.type === "audio" && msg.data?.audio) {
          if (!first) {
            first = performance.now();
            clearTimeout(firstTimer);
          }
          const pcm = stripper.push(Buffer.from(msg.data.audio, "base64"));
          if (pcm.length) {
            samples += pcm.length >> 1;
            delivered = true;
            sink(pcm);
          }
        } else if (msg.type === "event" && msg.data?.event_type === "final") {
          if (!first) first = performance.now();
          done();
        } else if (msg.type === "error") {
          const detail = typeof msg.data === "object" ? JSON.stringify(msg.data) : String(msg.data);
          done(new TtsError(`Bulbul error: ${detail}`, delivered, /speaker|language|invalid|400/i.test(detail)));
        }
      };
      ws.send(
        JSON.stringify({
          type: "config",
          data: {
            speaker: p.speaker,
            language_code: p.lang,
            speech_sample_rate: PCM_SAMPLE_RATE,
            output_audio_codec: "linear16",
            pace: p.prosody.pace,
            ...(p.model === "bulbul:v4-flash" ? { pitch: p.prosody.pitch, loudness: p.prosody.loudness } : {}),
            enable_preprocessing: true,
          },
        }),
      );
      ws.send(JSON.stringify({ type: "text", data: { text: p.text } }));
      ws.send(JSON.stringify({ type: "flush" }));
    });
  }

  close(): void {
    this.stopPing();
    this.ws?.close();
    this.ws = null;
  }
}

/** Synthesis over HTTP streaming. Used when the socket pool is unavailable. */
export async function synthHttpStream(p: TtsParams, sink: ChunkSink, signal?: AbortSignal): Promise<TtsResult> {
  const t0 = performance.now();
  const res = await fetch(`${config.apiBase}/text-to-speech/stream`, {
    method: "POST",
    headers: { "api-subscription-key": config.sarvamKey, "content-type": "application/json" },
    body: JSON.stringify(bodyFor(p, PCM_SAMPLE_RATE, "wav")),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new TtsError(`HTTP stream ${res.status}: ${text.slice(0, 300)}`, false, res.status === 400 || res.status === 403);
  }
  const stripper = new WavStripper();
  let first = 0;
  let samples = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    if (!first) first = performance.now();
    const pcm = stripper.push(Buffer.from(chunk));
    if (pcm.length) {
      samples += pcm.length >> 1;
      sink(pcm);
    }
  }
  return { ttfaMs: first - t0, totalMs: performance.now() - t0, transport: "http-stream", samples };
}

/** Synthesis over single-response REST. Slowest to first audio, most widely available. */
export async function synthRest(p: TtsParams, sink: ChunkSink, signal?: AbortSignal): Promise<TtsResult> {
  const t0 = performance.now();
  const res = await fetch(`${config.apiBase}/text-to-speech`, {
    method: "POST",
    headers: { "api-subscription-key": config.sarvamKey, "content-type": "application/json" },
    body: JSON.stringify(bodyFor(p, PCM_SAMPLE_RATE, "wav")),
    signal,
  });
  const json = (await res.json().catch(() => ({}))) as { audios?: string[]; error?: { message?: string } };
  if (!res.ok || !json.audios?.length) {
    throw new TtsError(`REST ${res.status}: ${json.error?.message ?? "no audio"}`, false, res.status === 400 || res.status === 403);
  }
  const first = performance.now();
  let samples = 0;
  for (const b64 of json.audios) {
    const wav = parseWav(Buffer.from(b64, "base64"));
    const pcm = wav.sampleRate && wav.sampleRate !== PCM_SAMPLE_RATE ? resamplePcm16(wav.pcm, wav.sampleRate, PCM_SAMPLE_RATE) : wav.pcm;
    samples += pcm.length >> 1;
    sink(pcm);
  }
  return { ttfaMs: first - t0, totalMs: performance.now() - t0, transport: "rest", samples };
}

/** Pool of warm sockets per model, with fallback to HTTP streaming and REST. */
export class TtsEngine {
  private pools = new Map<string, BulbulSocket[]>();
  private waiters: (() => void)[] = [];
  private listener: StateListener = () => {};

  onState(listener: StateListener): void {
    this.listener = listener;
  }

  /** Opens the v4 Flash pool so the first utterance does not pay connection setup. */
  async warm(): Promise<void> {
    if (!config.sarvamKey) {
      this.listener("down", "no key");
      return;
    }
    this.listener("connecting");
    const pool = this.pool("bulbul:v4-flash");
    const results = await Promise.allSettled(pool.map((s) => s.open()));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    if (ok === pool.length) this.listener("ready", `${ok} warm sockets`);
    else if (ok > 0) this.listener("degraded", `${ok}/${pool.length} sockets open`);
    else {
      this.listener("degraded", "WebSocket unavailable, using HTTP streaming");
      for (const s of pool) void s.reconnect().then((up) => up && this.listener("ready", "sockets recovered"));
    }
  }

  private pool(model: string): BulbulSocket[] {
    let pool = this.pools.get(model);
    if (!pool) {
      const size = model === "bulbul:v4-flash" ? config.ttsPoolSize : 1;
      pool = Array.from({ length: size }, (_, i) => new BulbulSocket(model, i));
      this.pools.set(model, pool);
    }
    return pool;
  }

  private async acquire(model: string, waitMs: number): Promise<BulbulSocket | null> {
    const pool = this.pool(model);
    const deadline = performance.now() + waitMs;
    for (;;) {
      const free = pool.find((s) => !s.busy && s.isOpen) ?? pool.find((s) => !s.busy);
      if (free) {
        free.busy = true;
        return free;
      }
      const left = deadline - performance.now();
      if (left <= 0) return null;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  private release(sock: BulbulSocket): void {
    sock.busy = false;
    this.waiters.shift()?.();
  }

  /**
   * Synthesize with the best available transport. `onReset` is called if a transport failed
   * after delivering audio, so the caller can drop partial audio before the retry arrives.
   */
  async synth(p: TtsParams, sink: ChunkSink, onReset: () => void, signal?: AbortSignal): Promise<TtsResult> {
    if (!config.sarvamKey) throw new TtsError("SARVAM_API_KEY is not set", false, true);
    const sock = await this.acquire(p.model, 1500);
    if (sock) {
      try {
        const r = await sock.synth(p, sink);
        return r;
      } catch (err) {
        const e = err as TtsError;
        if (e.fatal) throw e;
        if (e.delivered) onReset();
        this.listener("degraded", `socket ${sock.index}: ${e.message}; falling back to HTTP streaming`);
        void sock.reconnect().then((up) => up && this.listener("ready", "socket recovered"));
      } finally {
        this.release(sock);
      }
    }
    let delivered = false;
    const track: ChunkSink = (pcm) => {
      delivered = true;
      sink(pcm);
    };
    try {
      return await synthHttpStream(p, track, signal);
    } catch (err) {
      const e = err as TtsError;
      if (e.fatal) throw e;
      if (delivered) onReset();
      return await synthRest(p, sink, signal);
    }
  }

  close(): void {
    for (const pool of this.pools.values()) for (const s of pool) s.close();
  }
}
