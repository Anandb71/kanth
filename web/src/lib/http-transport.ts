// Hosted mode transport: the same messages as the /ws socket, carried over short streaming HTTP requests,
// for serverless hosting that cannot keep a WebSocket open. Prespeak runs here: as each draft arrives,
// the browser asks for its audio in parallel. Speech recognition is batch: the partner's whole line is
// sent once it ends, so there are no partial transcripts and no drafting while they talk. For the live
// microphone, the browser detects where each turn ends (vad.ts) and sends each finished turn.
import type { ClientMessage, ServerMessage, SuggestRequest, SynthRequest } from "../../../shared/protocol.ts";
import type { LinkState } from "./socket.ts";
import { TurnDetector } from "./vad.ts";

type Listener = (msg: ServerMessage) => void;

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export class HttpTransport {
  private listeners = new Set<Listener>();
  private stateListeners = new Set<(s: LinkState) => void>();
  private aborts = new Map<string, AbortController>();
  private stt = new Map<string, { lang: string; chunks: string[]; vad?: TurnDetector }>();
  state: LinkState = "connecting";
  rttMs = 0;
  readonly hosted = true;

  constructor() {
    void this.connect();
    window.addEventListener("offline", () => this.dropForOffline());
    window.addEventListener("online", () => void this.connect());
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onState(fn: (s: LinkState) => void): () => void {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  dropForOffline(): void {
    this.setState("closed");
  }

  close(): void {
    for (const ac of this.aborts.values()) ac.abort();
  }

  private emit(m: ServerMessage): void {
    for (const fn of this.listeners) fn(m);
  }

  private setState(s: LinkState): void {
    this.state = s;
    for (const fn of this.stateListeners) fn(s);
  }

  private async connect(attempt = 0): Promise<void> {
    this.setState("connecting");
    try {
      const t0 = performance.now();
      const r = await fetch("/api/status", { cache: "no-store" });
      const j = (await r.json()) as { keyPresent: boolean; roster: string[]; version: string };
      this.rttMs = performance.now() - t0;
      this.setState("open");
      this.emit({ t: "hello", keyPresent: j.keyPresent, roster: j.roster, version: j.version });
      this.emit({ t: "status", service: "tts", state: j.keyPresent ? "ready" : "no-key", detail: "hosted, HTTP streaming" });
      this.emit({ t: "status", service: "stt", state: "ready", detail: "hosted, batch" });
      this.warm();
    } catch {
      this.setState("closed");
      if (navigator.onLine) window.setTimeout(() => void this.connect(attempt + 1), Math.min(8000, 400 * 2 ** attempt));
    }
  }

  /** Wakes the serverless functions so their cold start overlaps the person speaking, not the wait after. */
  private warm(): void {
    for (const f of ["stt", "suggest", "synth"]) void fetch(`/api/${f}`, { method: "GET", cache: "no-store" }).catch(() => {});
  }

  send(msg: ClientMessage): void {
    switch (msg.t) {
      case "synth":
        void this.synth(msg);
        return;
      case "suggest":
        void this.suggest(msg);
        return;
      case "cancel":
        for (const [id, ac] of this.aborts) if (id === msg.id || id.startsWith(`${msg.id}:`)) ac.abort();
        return;
      case "translit":
        void fetch("/api/translit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: msg.text, lang: msg.lang }) })
          .then((r) => r.json())
          .then((j: { text?: string }) => this.emit({ t: "translit", id: msg.id, text: j.text ?? msg.text }))
          .catch(() => this.emit({ t: "translit", id: msg.id, text: msg.text }));
        return;
      case "stt_start": {
        const lang = msg.lang ?? "unknown";
        const sessionId = msg.sessionId;
        // A live microphone session (no known language) gets turn detection in the browser.
        const vad =
          lang === "unknown"
            ? new TurnDetector(
                () => this.emit({ t: "transcript", sessionId, text: "…", final: false }),
                (turn) => void this.transcribePcm(sessionId, new Uint8Array(turn.pcm.buffer, turn.pcm.byteOffset, turn.pcm.byteLength), lang, turn.endedAgoMs),
              )
            : undefined;
        this.stt.set(sessionId, { lang, chunks: [], vad });
        if (vad) this.warm();
        return;
      }
      case "stt_audio": {
        const s = this.stt.get(msg.sessionId);
        if (!s) return;
        if (s.vad) {
          const bytes = Uint8Array.from(atob(msg.pcm), (c) => c.charCodeAt(0));
          s.vad.push(new Int16Array(bytes.buffer, 0, bytes.byteLength >> 1));
        } else s.chunks.push(msg.pcm);
        return;
      }
      case "stt_stop": {
        const s = this.stt.get(msg.sessionId);
        if (s?.vad) {
          s.vad.flush();
          this.stt.delete(msg.sessionId);
        } else void this.transcribe(msg.sessionId);
        return;
      }
      default:
        return;
    }
  }

  private async synth(m: Omit<SynthRequest, "t">): Promise<void> {
    const ac = new AbortController();
    this.aborts.set(m.id, ac);
    const t0 = performance.now();
    try {
      const r = await fetch("/api/synth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: m.text, lang: m.lang, voice: m.voice, tone: m.tone }),
        signal: ac.signal,
      });
      if (!r.ok || !r.body) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      const reader = r.body.getReader();
      let first = 0;
      let seq = 0;
      let samples = 0;
      let carry: Uint8Array | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        let bytes = value;
        if (carry) {
          const joined = new Uint8Array(carry.length + bytes.length);
          joined.set(carry);
          joined.set(bytes, carry.length);
          bytes = joined;
          carry = null;
        }
        if (bytes.length % 2) {
          carry = bytes.subarray(bytes.length - 1);
          bytes = bytes.subarray(0, bytes.length - 1);
        }
        if (!bytes.length) continue;
        if (!first) first = performance.now();
        samples += bytes.length >> 1;
        this.emit({ t: "audio", id: m.id, seq: seq++, pcm: b64(bytes) });
      }
      this.emit({
        t: "audio_end",
        id: m.id,
        ttfaMs: (first || performance.now()) - t0,
        totalMs: performance.now() - t0,
        transport: "http-stream",
        model: r.headers.get("x-kanth-model") ?? "bulbul:v4-flash",
        speaker: r.headers.get("x-kanth-speaker") ?? "",
        substituted: r.headers.get("x-kanth-substituted") === "1",
        samples,
      });
    } catch (e) {
      if (ac.signal.aborted) return;
      this.emit({
        t: "error",
        id: m.id,
        scope: "tts",
        message: (e as Error).message,
        fallback: m.purpose === "prespeak" ? "Will synthesize when you choose it." : "Using the device voice so you are not left silent.",
      });
    } finally {
      this.aborts.delete(m.id);
    }
  }

  private async suggest(m: SuggestRequest): Promise<void> {
    const ac = new AbortController();
    this.aborts.set(m.turnId, ac);
    try {
      const r = await fetch("/api/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ turnId: m.turnId, history: m.history, partner: m.partner, profile: m.profile, tone: m.tone, keywords: m.keywords }),
        signal: ac.signal,
      });
      if (!r.ok || !r.body) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const msg = JSON.parse(line) as ServerMessage;
          this.emit(msg);
          // Prespeak: voice each draft the moment it arrives, all in parallel. Nothing is played.
          if (msg.t === "suggestion" && m.prespeak) {
            void this.synth({ id: `${m.turnId}:${msg.idx}:${m.tone}`, text: msg.text, lang: msg.lang, voice: m.voice, tone: m.tone, purpose: "prespeak" });
          }
        }
      }
    } catch (e) {
      if (ac.signal.aborted) return;
      this.emit({ t: "error", id: m.turnId, scope: "llm", message: (e as Error).message, fallback: "Showing your saved phrases. You can also type." });
    } finally {
      this.aborts.delete(m.turnId);
    }
  }

  private async transcribe(sessionId: string): Promise<void> {
    const s = this.stt.get(sessionId);
    this.stt.delete(sessionId);
    if (!s || !s.chunks.length) return;
    const parts = s.chunks.map((c) => Uint8Array.from(atob(c), (ch) => ch.charCodeAt(0)));
    const total = parts.reduce((n, p) => n + p.length, 0);
    const all = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      all.set(p, off);
      off += p.length;
    }
    await this.transcribePcm(sessionId, all, s.lang, 0);
  }

  /** Sends one finished turn to batch speech recognition. endedAgoMs: how long ago the speech itself ended. */
  private async transcribePcm(sessionId: string, pcm: Uint8Array, lang: string, endedAgoMs: number): Promise<void> {
    const stopAt = performance.now() - endedAgoMs;
    try {
      const r = await fetch(`/api/stt?lang=${encodeURIComponent(lang)}`, {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body: pcm as Uint8Array<ArrayBuffer>,
      });
      const j = (await r.json()) as { text?: string; language?: string; error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      if (!j.text?.trim()) return; // nothing intelligible: not a turn
      this.emit({ t: "transcript", sessionId, text: j.text, final: true, lang: j.language, afterEndMs: performance.now() - stopAt });
    } catch (e) {
      this.emit({ t: "error", id: sessionId, scope: "stt", message: (e as Error).message, fallback: "Try again, or type what was said." });
    }
  }
}
