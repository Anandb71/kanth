import { describe, expect, it } from "vitest";
import { detectScriptLanguage, hasLatinWords, resolveSpeaker } from "../shared/voices.ts";
import { clampProsody, TONES, toneById } from "../shared/tones.ts";
import { buildMessages, hasForeignScript, parseDraftLine, replyLanguage } from "../server/suggest.ts";
import { WavStripper, parseWav, wavFromPcm, resamplePcm16 } from "../server/pcm.ts";
import snapshot from "../shared/roster.json" with { type: "json" };
import type { Profile } from "../shared/protocol.ts";

const roster = (snapshot as Record<string, unknown>)["bulbul:v4-flash"] as string[];

const profile: Profile = {
  name: "Arjun",
  languages: ["ta-IN", "en-IN", "hi-IN"],
  mixStyle: "Tamil with English words",
  people: [{ name: "Amma", relation: "mother", addressAs: "Amma" }],
  notes: "",
};

describe("script detection", () => {
  it("detects Tamil, Hindi and English", () => {
    expect(detectScriptLanguage("கண்ணா, சாப்பிட்டியா?")).toBe("ta-IN");
    expect(detectScriptLanguage("आज pain कैसा है?")).toBe("hi-IN");
    expect(detectScriptLanguage("Call the nurse")).toBe("en-IN");
    expect(detectScriptLanguage("123 !!")).toBeUndefined();
  });
  it("finds code-mixed English words", () => {
    expect(hasLatinWords("आज थोड़ा better है")).toBe(true);
    expect(hasLatinWords("आज थोड़ा अच्छा है")).toBe(false);
  });
});

describe("speaker routing", () => {
  it("uses the requested voice when it has a persona in that language", () => {
    const r = resolveSpeaker(roster, "shubh", "hi-IN", "warm");
    expect(r.model).toBe("bulbul:v4-flash");
    expect(r.speaker.startsWith("shubh_hi_")).toBe(true);
    expect(r.substituted).toBe(false);
  });
  it("prefers an enhi persona for code-mixed Hindi", () => {
    const r = resolveSpeaker(roster, "shubh", "hi-IN", "warm", { codeMixedEnglish: true });
    expect(r.speaker.startsWith("shubh_enhi_")).toBe(true);
  });
  it("substitutes a Tamil voice when the chosen voice has no Tamil persona", () => {
    const r = resolveSpeaker(roster, "shubh", "ta-IN", "warm");
    expect(r.speaker.endsWith("_ta_narration") || r.speaker.includes("_ta_")).toBe(true);
    expect(r.substituted).toBe(true);
  });
  it("routes Malayalam and Odia to bulbul:v3", () => {
    expect(resolveSpeaker(roster, "shubh", "ml-IN", "warm").model).toBe("bulbul:v3");
    expect(resolveSpeaker(roster, "shubh", "od-IN", "warm").model).toBe("bulbul:v3");
  });
  it("honours an exact speaker id", () => {
    expect(resolveSpeaker(roster, "ritu_hi_medical", "hi-IN", "warm").speaker).toBe("ritu_hi_medical");
  });
  it("picks a tone-matched style when the voice has one", () => {
    const r = resolveSpeaker(roster, "ratan", "hi-IN", "whisper");
    expect(r.speaker).toBe("ratan_hi_latenight");
  });
});

describe("tones", () => {
  it("keeps every preset inside Bulbul's documented ranges", () => {
    for (const t of TONES) expect(clampProsody(t.prosody)).toEqual(t.prosody);
  });
  it("clamps out of range values", () => {
    expect(clampProsody({ pace: 3, pitch: -1, loudness: 0 })).toEqual({ pace: 2, pitch: -0.5, loudness: 0.1 });
  });
  it("makes tones audibly different", () => {
    expect(toneById("urgent").prosody.pace).toBeGreaterThan(toneById("whisper").prosody.pace);
    expect(toneById("urgent").prosody.loudness).toBeGreaterThan(toneById("whisper").prosody.loudness * 3);
  });
});

describe("draft parsing", () => {
  it("parses a reply and its gloss", () => {
    const d = parseDraftLine("இன்னும் இல்லம்மா ||| Not yet Amma", 0, "ta-IN");
    expect(d).toEqual({ idx: 0, text: "இன்னும் இல்லம்மா", gloss: "Not yet Amma", lang: "ta-IN" });
  });
  it("strips numbering, quotes, tags and stray separators", () => {
    const d = parseDraftLine('2. "<reply>आज थोड़ा better है</reply>" ||| > A little better |||', 1, "hi-IN");
    expect(d?.text).toBe("आज थोड़ा better है");
    expect(d?.gloss).toBe("A little better");
    expect(d?.lang).toBe("hi-IN");
  });
  it("rejects preambles and empty lines", () => {
    expect(parseDraftLine("Here are four replies:", 0, "en-IN")).toBeNull();
    expect(parseDraftLine("   ", 0, "en-IN")).toBeNull();
  });
  it("flags replies that drift into another Indian script", () => {
    expect(hasForeignScript("अभी body கொஞ்சம் weak है", "hi-IN")).toBe(true);
    expect(hasForeignScript("अभी थोड़ा weak हूँ", "hi-IN")).toBe(false);
  });
  it("answers in the partner's language", () => {
    expect(replyLanguage({ partner: { text: "आज कैसा है?" }, profile })).toBe("hi-IN");
    expect(replyLanguage({ partner: { text: "x", lang: "ta-IN" }, profile })).toBe("ta-IN");
  });
  it("only shows a format example in the reply language", () => {
    const msgs = buildMessages({ profile, history: [], partner: { text: "आज कैसा है?", who: "Dr. Mehra" }, tone: "warm" });
    expect(msgs[0]!.content).toContain("आज थोड़ा better लग रहा है");
    expect(msgs[0]!.content).not.toContain("இன்னும்");
    expect(msgs[0]!.content).toContain("Dr. Mehra");
  });
  it("keeps names to their owners and the examples free of names", () => {
    const msgs = buildMessages({ profile, history: [], partner: { text: "கண்ணா, சாப்பிட்டியா?", who: "Amma" }, tone: "warm" });
    const example = msgs[0]!.content.split(String.fromCharCode(10)).pop()!;
    expect(example).not.toMatch(/Amma|Doctor/);
    expect(msgs[0]!.content).toContain("never call anyone else by it");
  });
  it("steers every draft with the user's keywords", () => {
    const msgs = buildMessages({ profile, history: [], partner: { text: "What time?", who: "Nurse" }, tone: "warm", keywords: "4 pm" });
    expect(msgs[1]!.content).toContain('"4 pm"');
  });
});

describe("pcm", () => {
  const pcm = Buffer.alloc(200);
  for (let i = 0; i < 100; i++) pcm.writeInt16LE(i * 100, i * 2);
  it("strips a WAV header across arbitrary chunk boundaries", () => {
    const wav = wavFromPcm(pcm, 24000);
    const s = new WavStripper();
    const out = Buffer.concat([s.push(wav.subarray(0, 7)), s.push(wav.subarray(7, 50)), s.push(wav.subarray(50, 51)), s.push(wav.subarray(51))]);
    expect(out.equals(pcm)).toBe(true);
  });
  it("passes raw PCM through and keeps samples whole", () => {
    const s = new WavStripper();
    const a = s.push(pcm.subarray(0, 33));
    const b = s.push(pcm.subarray(33));
    expect(a.length % 2).toBe(0);
    expect(Buffer.concat([a, b]).equals(pcm)).toBe(true);
  });
  it("parses a WAV file", () => {
    const p = parseWav(wavFromPcm(pcm, 22050));
    expect(p.sampleRate).toBe(22050);
    expect(p.pcm.equals(pcm)).toBe(true);
  });
  it("resamples to the expected length", () => {
    expect(resamplePcm16(pcm, 24000, 16000).length).toBe(Math.floor((100 * 16000) / 24000) * 2);
  });
});
