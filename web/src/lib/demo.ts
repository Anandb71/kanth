// Demo mode: a scripted conversation partner, voiced by Bulbul personas, talks to Kanth.
// The full pipeline runs for real: the partner's audio is streamed to Saaras for transcription,
// the transcript is drafted into replies, and the replies are prespoken with Bulbul.
// Replies are spoken only when the viewer chooses one. In film mode a simulated user chooses,
// and the film says so on screen.
import type { LangCode } from "../../../shared/voices.ts";
import { STT_SAMPLE_RATE, PCM_SAMPLE_RATE } from "../../../shared/protocol.ts";
import { kanth } from "./kanth.ts";
import { audio } from "./audio.ts";

export interface Scene {
  who: string;
  speaker: string;
  lang: LangCode;
  text: string;
  gloss: string;
  setting: string;
  /** Film mode only: words that suggest which reply a simulated user would pick. */
  pickHint?: string[];
}

export const SCENES: Scene[] = [
  {
    who: "Amma",
    speaker: "kavitha_te_conversation",
    lang: "ta-IN",
    text: "கண்ணா, சாப்பிட்டியா? ரசம் சூடா இருக்கு.",
    gloss: "Have you eaten, dear? The rasam is hot.",
    setting: "Home, Chennai. His mother, in Tamil.",
    pickHint: ["minute", "later", "wait", "not yet"],
  },
  {
    who: "Dr. Mehra",
    speaker: "ritu_hi_medical",
    lang: "hi-IN",
    text: "अर्जुन, आज pain कैसा है? One to ten में बताओ।",
    gloss: "Arjun, how is the pain today? Tell me on a scale of one to ten.",
    setting: "Clinic visit. His neurologist, in Hinglish.",
    pickHint: ["four", "4", "three", "3", "better", "little"],
  },
  {
    who: "Rohit",
    speaker: "rehan_hi_social",
    lang: "hi-IN",
    text: "भाई, Sunday को India का match है। मैं van book कर दूँ?",
    gloss: "Brother, India is playing on Sunday. Should I book the van?",
    setting: "A friend calls by. In Hindi.",
    pickHint: ["yes", "book", "definitely", "sure", "come"],
  },
];

export type DemoPhase = "idle" | "preparing" | "partner" | "waiting" | "speaking" | "done";

export interface DemoState {
  phase: DemoPhase;
  scene: number;
  caption?: { line: string; sub?: string };
  film: boolean;
  error?: string;
}

type Listener = (s: DemoState) => void;

let sttSeq = 0;

export class DemoDirector {
  state: DemoState = { phase: "idle", scene: -1, film: false };
  private listeners = new Set<Listener>();
  private stopped = false;

  constructor(private scenes: Scene[] = SCENES) {}

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<DemoState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  stop(): void {
    this.stopped = true;
    audio.stop("partner");
    this.set({ phase: "idle", scene: -1, caption: undefined });
  }

  async run(opts: { film?: boolean } = {}): Promise<void> {
    this.stopped = false;
    const film = !!opts.film;
    audio.unlock();
    kanth.resetConversation();
    this.set({ phase: "preparing", scene: 0, film, error: undefined });

    // Partner lines are synthesized up front. They are the other person's voice, not the user's.
    const ids = this.scenes.map((sc, i) => `demo-partner-${i}`);
    const ready = await Promise.all(
      this.scenes.map((sc, i) => kanth.presynth(ids[i]!, sc.text, sc.lang, { kind: "persona", name: sc.speaker }, "partner")),
    );
    if (ready.some((ok) => !ok)) {
      this.set({ phase: "idle", error: "Could not synthesize the demo voices. Check that the server has a valid SARVAM_API_KEY." });
      return;
    }

    for (let i = 0; i < this.scenes.length && !this.stopped; i++) {
      const sc = this.scenes[i]!;
      this.set({ scene: i, phase: "partner", caption: film ? { line: sc.setting } : undefined });
      kanth.partnerStarted(sc.who, sc.lang, sc.gloss);
      const heard = await speakPartner(ids[i]!, sc);
      if (this.stopped) return;
      this.set({ phase: "waiting" });
      await kanth.partnerFinished(heard.text, { who: sc.who, lang: sc.lang, gloss: sc.gloss, endedAt: heard.endedAt, transcriptAt: heard.transcriptAt });
      if (this.stopped) return;

      const before = kanth.state.history.length;
      if (film) await this.simulatedChoice(sc);
      await this.waitForReply(before);
      if (this.stopped) return;
      this.set({ phase: "speaking" });
      await this.waitUntilQuiet();
      await sleep(film ? 1100 : 900);
    }
    if (!this.stopped) this.set({ phase: "done", caption: undefined });
  }

  /** Film mode only: a simulated user picks a reply after a human-like pause. Labelled on screen. */
  async simulatedChoice(sc: Scene): Promise<void> {
    const start = performance.now();
    while (kanth.state.cards.length < 4 && performance.now() - start < 6000) await sleep(80);
    await sleep(1700);
    const cards = kanth.state.cards;
    if (!cards.length) return;
    const hints = sc.pickHint ?? [];
    const scored = cards.map((c) => ({ c, score: hints.reduce((n, h) => n + (`${c.gloss} ${c.text}`.toLowerCase().includes(h) ? 1 : 0), 0) }));
    scored.sort((a, b) => b.score - a.score || a.c.idx - b.c.idx);
    const pick = scored[0]!.c;
    const el = document.querySelectorAll<HTMLElement>('[data-scan-item="cards"]')[cards.indexOf(pick)];
    el?.classList.add("scan-focus");
    await sleep(450);
    el?.classList.remove("scan-focus");
    await kanth.choose(pick.idx);
  }

  private waitForReply(historyLen: number): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.stopped || kanth.state.history.length > historyLen) {
          off();
          resolve();
        }
      };
      const off = kanth.subscribe(check);
      check();
    });
  }

  private waitUntilQuiet(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.stopped || !kanth.state.speakingText) {
          off();
          resolve();
        }
      };
      const off = kanth.subscribe(check);
      check();
    });
  }
}

/** Plays the partner line and streams the same audio to Saaras in real time. */
export async function speakPartner(id: string, sc: Scene): Promise<{ text: string; endedAt: number; transcriptAt?: number }> {
  const sessionId = `demo${++sttSeq}`;
  let finalText = "";
  let transcriptAt: number | undefined;
  let gotFinal: () => void = () => {};
  const finalPromise = new Promise<void>((r) => (gotFinal = r));
  const off = kanth.socket.on((m) => {
    if (m.t === "transcript" && m.sessionId === sessionId && m.text) {
      if (m.final) {
        finalText = finalText ? `${finalText} ${m.text}` : m.text;
        transcriptAt = performance.now();
        gotFinal();
      }
    }
  });
  kanth.socket.send({ t: "stt_start", sessionId, lang: sc.lang });

  const samples = audio.samplesOf(id);
  const pcm16k = toPcm16k(samples);
  const frame = STT_SAMPLE_RATE / 10; // 100 ms frames
  const playback = audio.play(id, "partner");
  const started = performance.now();
  let sent = 0;
  const pump = window.setInterval(() => {
    const due = Math.min(pcm16k.length, Math.floor(((performance.now() - started) / 1000) * STT_SAMPLE_RATE) + frame);
    while (sent < due) {
      const end = Math.min(due, sent + frame);
      kanth.socket.send({ t: "stt_audio", sessionId, pcm: b64(pcm16k.subarray(sent, end)) });
      sent = end;
    }
  }, 50);
  await playback.ended;
  const endedAt = performance.now();
  window.clearInterval(pump);
  while (sent < pcm16k.length) {
    const end = Math.min(pcm16k.length, sent + frame);
    kanth.socket.send({ t: "stt_audio", sessionId, pcm: b64(pcm16k.subarray(sent, end)) });
    sent = end;
  }
  kanth.socket.send({ t: "stt_stop", sessionId });
  await Promise.race([finalPromise, sleep(3000)]);
  off();
  if (!finalText) {
    kanth.notify("stt", "Saaras did not return a transcript in time.", "Using the scripted line so the demo can continue.");
    return { text: sc.text, endedAt };
  }
  return { text: finalText.trim(), endedAt, transcriptAt };
}


export function sleep(ms: number): Promise<void> {
  return new Promise((r) => window.setTimeout(r, ms));
}

/** 24 kHz float to 16 kHz PCM16 for speech recognition. */
function toPcm16k(f: Float32Array): Int16Array {
  const ratio = PCM_SAMPLE_RATE / STT_SAMPLE_RATE;
  const n = Math.floor(f.length / ratio);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const v = (f[i0] ?? 0) * (1 - frac) + (f[Math.min(f.length - 1, i0 + 1)] ?? 0) * frac;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
  }
  return out;
}

function b64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export const demo = new DemoDirector();
