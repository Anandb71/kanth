// User settings and profile, kept on this device only.
import type { Profile } from "../../../shared/protocol.ts";
import type { VoiceRef } from "../../../shared/voices.ts";

export type AccessMethod = "touch" | "scan-auto" | "scan-step" | "dwell" | "blink";
export type Theme = "light" | "dark" | "contrast";

export interface Settings {
  access: AccessMethod;
  scanIntervalMs: number;
  dwellMs: number;
  blinkHoldMs: number;
  textScale: number;
  theme: Theme;
  showGloss: boolean;
  prespeak: boolean;
  /** Draft and voice replies from the partial transcript while the partner is still talking. */
  speculate: boolean;
  voice: VoiceRef;
}

export const DEFAULT_SETTINGS: Settings = {
  access: "touch",
  scanIntervalMs: 1400,
  dwellMs: 900,
  blinkHoldMs: 220,
  textScale: 1,
  theme: "light",
  showGloss: true,
  prespeak: true,
  speculate: true,
  voice: { kind: "persona", name: "shubh" },
};

/** The fictional demo user. Clearly labelled as simulated everywhere it appears. */
export const DEMO_PROFILE: Profile = {
  name: "Arjun",
  languages: ["ta-IN", "en-IN", "hi-IN"],
  mixStyle: "Tamil at home with English words mixed in; Hindi with his doctor and his Delhi friends",
  people: [
    { name: "Amma", relation: "mother", addressAs: "Amma" },
    { name: "Dr. Mehra", relation: "neurologist", addressAs: "Doctor" },
    { name: "Rohit", relation: "college friend", addressAs: "Rohit" },
  ],
  notes: "34, software engineer in Chennai. Has ALS and can no longer speak. Follows cricket.",
};

const KEY = "kanth.settings.v1";
const PROFILE_KEY = "kanth.profile.v1";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* storage blocked: use defaults */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: settings last for this visit only */
  }
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return JSON.parse(raw) as Profile;
  } catch {
    /* ignore */
  }
  return DEMO_PROFILE;
}

export function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
