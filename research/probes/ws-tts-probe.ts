// Probe the Bulbul V4 Flash TTS WebSocket: message shapes, codecs, and time to first audio.
import WebSocket from "ws";
import { readFileSync } from "node:fs";
const key = readFileSync(".env", "utf8").match(/SARVAM_API_KEY=(.+)/)![1].trim();
const codec = process.argv[2] ?? "linear16";
const ws = new WebSocket("wss://api.sarvam.ai/text-to-speech/ws?model=bulbul:v4-flash&send_completion_event=true", { headers: { "api-subscription-key": key } });
const texts = ["இன்னும் இல்லம்மா, ஒரு பத்து நிமிஷம்.", "ஆமாம், ரசம் சூடா இருக்கட்டும்."];
let t0 = 0, first = 0, n = 0, bytes = 0, idx = 0;
function send(i: number) {
  t0 = performance.now(); first = 0; n = 0; bytes = 0;
  ws.send(JSON.stringify({ type: "config", data: { speaker: "vijay_ta_narration", language_code: "ta-IN", speech_sample_rate: 24000, output_audio_codec: codec, pace: 1.0, enable_preprocessing: true } }));
  ws.send(JSON.stringify({ type: "text", data: { text: texts[i] } }));
  ws.send(JSON.stringify({ type: "flush" }));
}
const tOpen = performance.now();
ws.on("open", () => { console.log("open in", Math.round(performance.now() - tOpen), "ms"); send(0); });
ws.on("message", (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.type === "audio") {
    const b = Buffer.from(m.data.audio, "base64");
    if (!first) { first = performance.now(); console.log(`utt${idx} first audio ${Math.round(first - t0)}ms, keys=${Object.keys(m.data)}, head=${b.subarray(0, 12).toString("hex")} ct=${m.data.content_type ?? ""}`); }
    n++; bytes += b.length;
  } else {
    console.log(`utt${idx} msg`, JSON.stringify(m).slice(0, 300), `after ${Math.round(performance.now() - t0)}ms chunks=${n} bytes=${bytes}`);
    if (m.type === "event" && m.data?.event_type === "final") {
      idx++;
      if (idx < texts.length) send(idx); else ws.close();
    }
  }
});
ws.on("close", (c, r) => console.log("close", c, r.toString()));
ws.on("error", (e) => console.log("error", e.message));
setTimeout(() => { console.log("timeout"); process.exit(0); }, 15000);
