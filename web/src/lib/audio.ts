// Holds synthesized utterances and plays them with Web Audio.
// Prespoken utterances sit here fully decoded, so choosing one starts sound on the next audio frame.
import { PCM_SAMPLE_RATE } from "../../../shared/protocol.ts";

export type Channel = "me" | "partner";

interface Utterance {
  id: string;
  chunks: Float32Array[];
  samples: number;
  done: boolean;
  failed: boolean;
  buffer: AudioBuffer | null;
  onChunk: Set<(c: Float32Array) => void>;
  onDone: Set<() => void>;
  meta?: Record<string, unknown>;
}

export interface PlayResult {
  /** ms from the request to play until sound reaches the speakers, including device output latency. */
  toAudibleMs: number;
  /** Whether the audio was fully prespoken when play was requested. */
  prespoken: boolean;
  ended: Promise<void>;
  durationMs: number;
}

export interface PlayEvent {
  id: string;
  channel: Channel;
  at: number;
  toAudibleMs: number;
  prespoken: boolean;
  text?: string;
}

function pcm16ToFloat(b64: string): Float32Array {
  const bin = atob(b64);
  const n = bin.length >> 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    if (v >= 0x8000) v -= 0x10000;
    out[i] = v / 32768;
  }
  return out;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private utterances = new Map<string, Utterance>();
  private current = new Map<Channel, { stop: () => void }>();
  private playListeners = new Set<(e: PlayEvent) => void>();
  recordDest: MediaStreamAudioDestinationNode | null = null;

  /** Must be called from a user gesture once, to satisfy browser autoplay rules. */
  unlock(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      for (const ch of ["me", "partner"] as Channel[]) {
        const g = this.ctx.createGain();
        const an = this.ctx.createAnalyser();
        an.fftSize = 512;
        an.smoothingTimeConstant = 0.6;
        g.connect(an);
        g.connect(this.master);
        this.channels.set(ch, { gain: g, analyser: an, buf: new Float32Array(an.fftSize) });
      }
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private channels = new Map<Channel, { gain: GainNode; analyser: AnalyserNode; buf: Float32Array<ArrayBuffer> }>();

  /** Current loudness of a channel, 0 to 1, for the voice orb. Reads the real audio signal. */
  level(channel: Channel): number {
    const c = this.channels.get(channel);
    if (!c) return 0;
    c.analyser.getFloatTimeDomainData(c.buf);
    let sum = 0;
    for (let i = 0; i < c.buf.length; i++) sum += c.buf[i]! * c.buf[i]!;
    const rms = Math.sqrt(sum / c.buf.length);
    return Math.min(1, rms * 5);
  }

  private out(channel: Channel): AudioNode {
    return this.channels.get(channel)?.gain ?? this.master!;
  }

  get unlocked(): boolean {
    return !!this.ctx && this.ctx.state === "running";
  }

  /** Routes everything Kanth plays into a MediaStream as well, for recording the demo film. */
  recordStream(): MediaStream {
    const ctx = this.unlock();
    if (!this.recordDest) {
      this.recordDest = ctx.createMediaStreamDestination();
      this.master!.connect(this.recordDest);
    }
    return this.recordDest.stream;
  }

  onPlay(fn: (e: PlayEvent) => void): () => void {
    this.playListeners.add(fn);
    return () => this.playListeners.delete(fn);
  }

  private get(id: string): Utterance {
    let u = this.utterances.get(id);
    if (!u) {
      u = { id, chunks: [], samples: 0, done: false, failed: false, buffer: null, onChunk: new Set(), onDone: new Set() };
      this.utterances.set(id, u);
    }
    return u;
  }

  has(id: string): boolean {
    return this.utterances.has(id);
  }

  status(id: string): "none" | "streaming" | "ready" | "failed" {
    const u = this.utterances.get(id);
    if (!u) return "none";
    if (u.failed || (u.done && u.samples === 0)) return "failed";
    return u.done ? "ready" : "streaming";
  }

  drop(id: string): void {
    this.utterances.delete(id);
  }

  isReady(id: string): boolean {
    const u = this.utterances.get(id);
    return !!u && u.done && !u.failed && u.samples > 0;
  }

  /** Called for each audio chunk from the server. */
  push(id: string, b64: string): void {
    const u = this.get(id);
    const f = pcm16ToFloat(b64);
    u.chunks.push(f);
    u.samples += f.length;
    u.buffer = null;
    for (const fn of u.onChunk) fn(f);
  }

  /** Loads a complete utterance from the device cache. */
  loadSamples(id: string, samples: Float32Array): void {
    const u = this.get(id);
    u.chunks = [samples];
    u.samples = samples.length;
    u.buffer = null;
    u.done = true;
    u.failed = false;
  }

  /** Drops partial audio when the server retries on another transport. */
  reset(id: string): void {
    const u = this.utterances.get(id);
    if (!u) return;
    u.chunks = [];
    u.samples = 0;
    u.buffer = null;
  }

  finish(id: string, meta?: Record<string, unknown>): void {
    const u = this.get(id);
    u.done = true;
    u.meta = meta;
    for (const fn of u.onDone) fn();
  }

  fail(id: string): void {
    const u = this.get(id);
    u.failed = true;
    u.done = true;
    for (const fn of u.onDone) fn();
  }

  forget(prefix: string): void {
    for (const id of [...this.utterances.keys()]) if (id.startsWith(prefix)) this.utterances.delete(id);
  }

  /** Waits until the utterance is fully received (or failed). */
  whenDone(id: string): Promise<boolean> {
    const u = this.get(id);
    if (u.done) return Promise.resolve(!u.failed && u.samples > 0);
    return new Promise((resolve) => {
      const fn = () => {
        u.onDone.delete(fn);
        resolve(!u.failed && u.samples > 0);
      };
      u.onDone.add(fn);
    });
  }

  /** Concatenated PCM as Float32, for streaming partner audio to speech recognition. */
  samplesOf(id: string): Float32Array {
    const u = this.utterances.get(id);
    if (!u) return new Float32Array(0);
    const out = new Float32Array(u.samples);
    let off = 0;
    for (const c of u.chunks) {
      out.set(c, off);
      off += c.length;
    }
    return out;
  }

  durationMs(id: string): number {
    const u = this.utterances.get(id);
    return u ? (u.samples / PCM_SAMPLE_RATE) * 1000 : 0;
  }

  stop(channel: Channel): void {
    this.current.get(channel)?.stop();
    this.current.delete(channel);
  }

  /**
   * Plays an utterance on a channel, replacing whatever that channel was saying.
   * If the utterance is still streaming, chunks are scheduled gaplessly as they arrive.
   */
  play(id: string, channel: Channel, requestedAt = performance.now(), text?: string): PlayResult {
    const ctx = this.unlock();
    this.stop(channel);
    const u = this.get(id);
    const outputLatencyMs = ((ctx.baseLatency ?? 0) + ((ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0)) * 1000;
    const prespoken = u.done && u.samples > 0;
    const sources: AudioBufferSourceNode[] = [];
    let stopped = false;
    let resolveEnded!: () => void;
    const ended = new Promise<void>((r) => (resolveEnded = r));

    const schedule = (data: Float32Array, when: number): number => {
      const buf = ctx.createBuffer(1, data.length, PCM_SAMPLE_RATE);
      buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.out(channel));
      src.start(when);
      sources.push(src);
      return when + buf.duration;
    };

    let toAudibleMs = 0;
    if (prespoken) {
      if (!u.buffer) {
        const all = this.samplesOf(id);
        u.buffer = ctx.createBuffer(1, all.length, PCM_SAMPLE_RATE);
        u.buffer.copyToChannel(all as Float32Array<ArrayBuffer>, 0);
      }
      const src = ctx.createBufferSource();
      src.buffer = u.buffer;
      src.connect(this.out(channel));
      src.onended = () => resolveEnded();
      src.start();
      sources.push(src);
      toAudibleMs = performance.now() - requestedAt + outputLatencyMs;
    } else {
      // Streaming: start each chunk right after the previous one.
      let cursor = 0;
      let started = false;
      const onChunk = (c: Float32Array) => {
        if (stopped) return;
        const now = ctx.currentTime;
        if (!started) {
          started = true;
          cursor = now + 0.02;
          toAudibleMs = performance.now() - requestedAt + 20 + outputLatencyMs;
          this.emitPlay({ id, channel, at: performance.now(), toAudibleMs, prespoken: false, text });
        }
        cursor = schedule(c, Math.max(cursor, now));
      };
      for (const c of u.chunks) onChunk(c);
      u.onChunk.add(onChunk);
      const onDone = () => {
        u.onChunk.delete(onChunk);
        u.onDone.delete(onDone);
        const wait = Math.max(0, cursor - ctx.currentTime) * 1000;
        window.setTimeout(() => resolveEnded(), wait);
      };
      if (u.done) onDone();
      else u.onDone.add(onDone);
    }

    this.current.set(channel, {
      stop: () => {
        stopped = true;
        for (const s of sources) {
          try {
            s.stop();
          } catch {
            /* already stopped */
          }
        }
        resolveEnded();
      },
    });
    if (prespoken) this.emitPlay({ id, channel, at: performance.now(), toAudibleMs, prespoken, text });
    return { toAudibleMs, prespoken, ended, durationMs: this.durationMs(id) };
  }

  private emitPlay(e: PlayEvent): void {
    if (this.filmLog) this.filmLog.push({ id: e.id, channel: e.channel, epochMs: performance.timeOrigin + e.at });
    for (const fn of this.playListeners) fn(e);
  }

  /** Film recording: remembers when each utterance started so the soundtrack can be rebuilt exactly. */
  filmLog: { id: string; channel: Channel; epochMs: number }[] | null = null;

  startFilmLog(): void {
    this.filmLog = [];
  }

  /** Every played utterance as PCM16 base64 with its wall-clock start time. */
  exportFilmLog(): { id: string; channel: Channel; epochMs: number; sampleRate: number; pcm: string }[] {
    return (this.filmLog ?? []).map((e) => {
      const f = this.samplesOf(e.id);
      const pcm = new Int16Array(f.length);
      for (let i = 0; i < f.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(f[i]! * 32767)));
      const bytes = new Uint8Array(pcm.buffer);
      let s = "";
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { ...e, sampleRate: PCM_SAMPLE_RATE, pcm: btoa(s) };
    });
  }

  /** Last resort so the user is never left silent: the device's own speech engine. */
  speakWithDevice(text: string, lang: string): Promise<void> {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.speak(u);
    });
  }
}

export const audio = new AudioEngine();
