// Microphone input: live listening to the conversation partner, and voice banking recordings.
import { useEffect, useRef, useState } from "react";
import { STT_SAMPLE_RATE } from "../../../shared/protocol.ts";
import { kanth } from "./kanth.ts";

function downsample(input: Float32Array, from: number, to: number): Int16Array {
  const ratio = from / to;
  const n = Math.floor(input.length / ratio);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j]!;
    const v = sum / Math.max(1, end - start);
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

interface Capture {
  stop: () => void;
}

async function capture(onPcm: (pcm16k: Int16Array) => void): Promise<Capture> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  // ScriptProcessor is deprecated but universally available and adequate for 16 kHz speech.
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  proc.onaudioprocess = (e) => onPcm(downsample(e.inputBuffer.getChannelData(0), ctx.sampleRate, STT_SAMPLE_RATE));
  src.connect(proc);
  proc.connect(ctx.destination);
  return {
    stop: () => {
      proc.disconnect();
      src.disconnect();
      for (const t of stream.getTracks()) t.stop();
      void ctx.close();
    },
  };
}

let micSeq = 0;

/** Live mode: stream the microphone to Saaras; each final transcript becomes a partner turn. */
export function useMic(): { listening: boolean; start: () => Promise<void>; stop: () => void } {
  const [listening, setListening] = useState(false);
  const cap = useRef<Capture | null>(null);
  const off = useRef<(() => void) | null>(null);
  const session = useRef("");

  const stop = () => {
    cap.current?.stop();
    cap.current = null;
    off.current?.();
    off.current = null;
    if (session.current) kanth.socket.send({ t: "stt_stop", sessionId: session.current });
    session.current = "";
    setListening(false);
  };

  const start = async () => {
    if (session.current) stop(); // never two captures at once
    // The recorded run has no live Saaras behind it, so it cannot hear a real microphone.
    if (kanth.replaying) {
      kanth.notify("stt", "Sarvam was not answering, so this page is showing a recorded run.", "Reload the page to try the microphone again, or type what was said.");
      return;
    }
    const sessionId = `mic${++micSeq}`;
    session.current = sessionId;
    kanth.socket.send({ t: "stt_start", sessionId, lang: "unknown" });
    let open = false;
    let lastFinalAt = -Infinity;
    off.current = kanth.socket.on((m) => {
      if (m.t !== "transcript" || m.sessionId !== sessionId || !m.text.trim()) return;
      if (!open) {
        kanth.partnerStarted("Them");
        open = true;
      }
      if (m.final) {
        open = false;
        // Speech that resumes within 4 s, before the user has replied, continues the same turn.
        const last = kanth.state.history[kanth.state.history.length - 1];
        const continues = last?.who === "partner" && performance.now() - lastFinalAt < 4000;
        lastFinalAt = performance.now();
        void kanth.partnerFinished(m.text, { who: "Them", endedAt: performance.now() - (m.afterEndMs ?? 0), transcriptAt: performance.now(), continues });
      }
    });
    try {
      // Never listen to ourselves: drop microphone audio while Kanth is speaking, and briefly after.
      let busyUntil = 0;
      const c = await capture((pcm) => {
        if (session.current !== sessionId) return;
        if (kanth.state.speakingText) busyUntil = performance.now() + 400;
        if (performance.now() < busyUntil) return;
        kanth.socket.send({ t: "stt_audio", sessionId, pcm: b64(pcm) });
      });
      // Stopped (or left the page) while the browser was still asking for the microphone: close it at once.
      if (session.current !== sessionId) {
        c.stop();
        return;
      }
      cap.current = c;
      setListening(true);
    } catch {
      // A newer start, or a stop, has already replaced this session: leave that one alone.
      if (session.current !== sessionId) return;
      kanth.notify("stt", "The microphone is not available.", "Try the demo, or type what was said.");
      stop();
    }
  };

  useEffect(() => () => stop(), []);
  return { listening, start, stop };
}

/** Records the microphone for `ms` and returns a 16 kHz mono WAV as base64. */
export async function recordWav(ms: number): Promise<string | null> {
  const parts: Int16Array[] = [];
  let cap: Capture;
  try {
    cap = await capture((pcm) => parts.push(pcm));
  } catch {
    return null;
  }
  await new Promise((r) => setTimeout(r, ms));
  cap.stop();
  const total = parts.reduce((n, p) => n + p.length, 0);
  const pcm = new Int16Array(total);
  let off = 0;
  for (const p of parts) {
    pcm.set(p, off);
    off += p.length;
  }
  const header = new DataView(new ArrayBuffer(44));
  const w = (o: number, s: string) => [...s].forEach((c, i) => header.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  header.setUint32(4, 36 + pcm.byteLength, true);
  w(8, "WAVE");
  w(12, "fmt ");
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, 1, true);
  header.setUint32(24, STT_SAMPLE_RATE, true);
  header.setUint32(28, STT_SAMPLE_RATE * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  w(36, "data");
  header.setUint32(40, pcm.byteLength, true);
  const bytes = new Uint8Array(44 + pcm.byteLength);
  bytes.set(new Uint8Array(header.buffer), 0);
  bytes.set(new Uint8Array(pcm.buffer), 44);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
