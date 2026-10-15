// Saaras realtime speech recognition over WebSocket.
//   wss://api.sarvam.ai/speech-to-text-realtime/ws?language_code=..&model=..&stream_type=fast&endpointing=..
//   client: {"event":"audio_input","audio":<b64 pcm16 16 kHz>}, speech_start / speech_end (manual), end
//   server: session.begin, transcript.partial {text}, transcript.final {text, language?}, vad.*, error, session.end
// Demo mode knows exactly when the partner stops, so it uses manual endpointing.
// Live microphone mode lets Saaras detect the end of each turn.
import WebSocket from "ws";
import { config } from "./env.ts";
import type { ServerMessage } from "../shared/protocol.ts";

export type Endpointing = "manual" | "vad";

export class SttSession {
  private ws: WebSocket | null = null;
  private pending: string[] = [];
  private stoppedAt = 0;
  private closed = false;
  private speechStarted = false;

  constructor(
    readonly id: string,
    readonly lang: string,
    private emit: (m: ServerMessage) => void,
    private endpointing: Endpointing = lang === "unknown" || lang === "auto" ? "vad" : "manual",
  ) {}

  async start(): Promise<void> {
    if (!config.sarvamKey) {
      this.emit({ t: "status", service: "stt", state: "no-key" });
      return;
    }
    const params = new URLSearchParams({
      language_code: this.lang === "unknown" ? "auto" : this.lang,
      model: process.env.KANTH_STT_MODEL ?? "saaras:v3-realtime",
      stream_type: "fast",
      mode: process.env.KANTH_STT_MODE ?? "codemix",
      sample_rate: "16000",
      endpointing: this.endpointing,
    });
    if (this.endpointing === "vad") params.set("silence_duration_ms", "450");
    const ws = new WebSocket(`${config.wsBase}/speech-to-text-realtime/ws?${params}`, {
      headers: { "api-subscription-key": config.sarvamKey },
    });
    this.ws = ws;
    ws.on("open", () => {
      this.emit({ t: "status", service: "stt", state: "ready" });
      if (this.endpointing === "manual") ws.send(JSON.stringify({ event: "speech_start" }));
      this.speechStarted = true;
      for (const m of this.pending.splice(0)) ws.send(m);
      if (this.stoppedAt) this.finishTurn();
    });
    ws.on("message", (raw) => {
      let m: { event?: string; text?: string; language?: string; message?: string; is_fatal?: boolean; code?: number };
      try {
        m = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (m.event === "transcript.partial" && m.text) {
        this.emit({ t: "transcript", sessionId: this.id, text: m.text, final: false, lang: m.language });
      } else if (m.event === "transcript.final") {
        this.emit({
          t: "transcript",
          sessionId: this.id,
          text: m.text ?? "",
          final: true,
          lang: m.language,
          afterEndMs: this.stoppedAt ? performance.now() - this.stoppedAt : undefined,
        });
        // A demo turn is one utterance: close once it is final.
        if (this.endpointing === "manual" && this.stoppedAt) this.close();
      } else if (m.event === "error") {
        this.emit({ t: "error", id: this.id, scope: "stt", message: m.message ?? "speech recognition error", fallback: m.is_fatal ? "Type what was said, or use the demo." : undefined });
        if (m.is_fatal) this.emit({ t: "status", service: "stt", state: "degraded", detail: m.message });
      }
    });
    ws.on("close", (code, reason) => {
      if (!this.closed && code !== 1000 && code !== 1005) {
        this.emit({ t: "status", service: "stt", state: "degraded", detail: `closed ${code} ${reason.toString()}` });
      }
    });
    ws.on("error", (err) => {
      this.emit({ t: "error", id: this.id, scope: "stt", message: err.message, fallback: "The demo continues with the scripted line." });
    });
  }

  private sendEvent(obj: Record<string, unknown>): void {
    const msg = JSON.stringify(obj);
    if (this.ws?.readyState === WebSocket.OPEN && this.speechStarted) this.ws.send(msg);
    else this.pending.push(msg);
  }

  audio(pcm: Buffer): void {
    if (this.closed) return;
    this.sendEvent({ event: "audio_input", audio: pcm.toString("base64") });
  }

  /** The partner stopped speaking. In manual mode this finalizes the turn immediately. */
  stop(): void {
    this.stoppedAt = performance.now();
    if (this.ws?.readyState === WebSocket.OPEN) this.finishTurn();
  }

  private finishTurn(): void {
    if (this.endpointing === "manual") this.sendEvent({ event: "speech_end" });
    else this.close();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ event: "end" }));
    } catch {
      /* socket already gone */
    }
    setTimeout(() => this.ws?.close(), 3000);
  }
}
