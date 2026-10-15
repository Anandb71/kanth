// The demo's safety net. If Sarvam cannot be reached (an outage, a rejected key, spent credits), the
// interactive demo replays a recorded real run instead of failing, and says so on screen. Every
// transcript, draft and voice in the recording is what Sarvam returned when it was made
// (film/record-replay.ts). Requests the recording does not cover fail with a clear message.
import type { ClientMessage, ServerMessage, SuggestRequest, SynthRequest } from "../../../shared/protocol.ts";
import type { LinkState } from "./socket.ts";
import snapshot from "../../../shared/roster.json";

interface Replay {
  recorded: string;
  finals: string[];
  synth: Record<string, { file: string; speaker: string; model: string; substituted: boolean }>;
  suggest: Record<string, string[]>;
}

type Listener = (msg: ServerMessage) => void;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export class ReplayTransport {
  private listeners = new Set<Listener>();
  private stateListeners = new Set<(s: LinkState) => void>();
  private data: Promise<Replay | null>;
  private sessions = 0;
  state: LinkState = "open";
  rttMs = 0;
  readonly replay = true;

  constructor() {
    this.data = fetch("/replay/replay.json")
      .then((r) => (r.ok ? (r.json() as Promise<Replay>) : null))
      .catch(() => null);
    window.setTimeout(() => {
      this.emit({ t: "hello", keyPresent: true, roster: (snapshot as Record<string, unknown>)["bulbul:v4-flash"] as string[], version: "replay" });
      this.emit({ t: "status", service: "tts", state: "degraded", detail: "replaying a recorded run" });
      this.emit({ t: "status", service: "stt", state: "degraded", detail: "replaying a recorded run" });
    }, 0);
  }

  /** True if a recording ships with this build. */
  async available(): Promise<boolean> {
    return !!(await this.data);
  }

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onState(fn: (s: LinkState) => void): () => void {
    this.stateListeners.add(fn);
    fn(this.state);
    return () => this.stateListeners.delete(fn);
  }

  dropForOffline(): void {}

  close(): void {}

  private emit(m: ServerMessage): void {
    for (const fn of this.listeners) fn(m);
  }

  send(msg: ClientMessage): void {
    switch (msg.t) {
      case "synth":
        void this.synth(msg);
        return;
      case "suggest":
        void this.suggest(msg);
        return;
      case "stt_start":
        return;
      case "stt_stop": {
        const k = this.sessions++;
        void this.data.then(async (d) => {
          await sleep(300);
          const text = d?.finals[k];
          if (text) this.emit({ t: "transcript", sessionId: msg.sessionId, text, final: true, afterEndMs: 300 });
        });
        return;
      }
      case "translit":
        this.emit({ t: "translit", id: msg.id, text: msg.text });
        return;
      default:
        return;
    }
  }

  private async synth(m: Omit<SynthRequest, "t">): Promise<void> {
    const d = await this.data;
    const voiceName = m.voice.kind === "persona" ? m.voice.name : "";
    const entry = d?.synth[[m.text, m.lang, m.tone, voiceName].join("|")];
    if (!entry) {
      this.emit({ t: "error", id: m.id, scope: "tts", message: "Not in the recorded run.", fallback: m.purpose === "prespeak" ? "Will synthesize when you choose it." : "Using the device voice so you are not left silent." });
      return;
    }
    const t0 = performance.now();
    const bytes = new Uint8Array(await (await fetch(`/replay/${entry.file}`)).arrayBuffer());
    this.emit({ t: "audio", id: m.id, seq: 0, pcm: b64(bytes.subarray(0, bytes.length - (bytes.length % 2))) });
    this.emit({ t: "audio_end", id: m.id, ttfaMs: performance.now() - t0, totalMs: performance.now() - t0, transport: "replay", model: entry.model, speaker: entry.speaker, substituted: entry.substituted, samples: bytes.length >> 1 });
  }

  private async suggest(m: SuggestRequest): Promise<void> {
    const d = await this.data;
    const lines = d?.suggest[[m.partner.text, m.tone, m.keywords ?? ""].join("|")];
    if (!lines) {
      this.emit({ t: "error", id: m.turnId, scope: "llm", message: "This change is not in the recorded run.", fallback: "The live service is unavailable; try the demo's own choices, or type." });
      return;
    }
    let count = 0;
    for (const line of lines) {
      const msg = JSON.parse(line) as ServerMessage;
      await sleep(70);
      if (msg.t === "suggestion") {
        count++;
        this.emit({ ...msg, turnId: m.turnId });
        if (m.prespeak) void this.synth({ id: `${m.turnId}:${msg.idx}:${m.tone}`, text: msg.text, lang: msg.lang, voice: m.voice, tone: m.tone, purpose: "prespeak" });
      } else if (msg.t === "suggestions_done") this.emit({ ...msg, turnId: m.turnId, count });
    }
  }
}
