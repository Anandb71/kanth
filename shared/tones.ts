// Tone presets. Each tone changes the words the model drafts (through the prompt)
// and the way Bulbul says them (through pace, pitch and loudness).
// Ranges per the Bulbul v4 Flash reference: pace 0.5–2.0, pitch -0.5–0.5, loudness 0.1–2.5.

export type ToneId = "warm" | "firm" | "urgent" | "joking" | "whisper";

export interface Prosody {
  pace: number;
  pitch: number;
  loudness: number;
}

export interface Tone {
  id: ToneId;
  label: string;
  /** Short instruction given to the suggestion model. */
  wording: string;
  prosody: Prosody;
  /** Persona style segments to prefer for this tone when the voice offers them. */
  preferStyles: string[];
}

export const TONES: readonly Tone[] = [
  {
    id: "warm",
    label: "Warm",
    wording: "affectionate, gentle and relaxed",
    prosody: { pace: 0.95, pitch: 0.0, loudness: 1.0 },
    preferStyles: ["companion", "conversational", "conversation", "narration"],
  },
  {
    id: "firm",
    label: "Firm",
    wording: "clear, decisive and polite but not soft; no hedging",
    prosody: { pace: 0.88, pitch: -0.12, loudness: 1.45 },
    preferStyles: ["customer", "news", "narration", "conversation"],
  },
  {
    id: "urgent",
    label: "Urgent",
    wording: "urgent, short and direct, still answering exactly what was asked; ask for help only if the conversation calls for it",
    prosody: { pace: 1.22, pitch: 0.14, loudness: 2.1 },
    preferStyles: ["news", "ads", "sports"],
  },
  {
    id: "joking",
    label: "Joking",
    wording: "playful and teasing, with light humour that fits the relationship",
    prosody: { pace: 1.1, pitch: 0.2, loudness: 1.15 },
    preferStyles: ["social", "reels", "ads", "conversational"],
  },
  {
    id: "whisper",
    label: "Quiet",
    wording: "soft and private, few words, for a quiet room",
    prosody: { pace: 0.86, pitch: -0.05, loudness: 0.4 },
    preferStyles: ["latenight", "companion", "suspense"],
  },
] as const;

export function toneById(id: ToneId): Tone {
  const t = TONES.find((x) => x.id === id);
  if (!t) throw new Error(`unknown tone ${id}`);
  return t;
}

export function clampProsody(p: Prosody): Prosody {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  return {
    pace: clamp(p.pace, 0.5, 2.0),
    pitch: clamp(p.pitch, -0.5, 0.5),
    loudness: clamp(p.loudness, 0.1, 2.5),
  };
}
