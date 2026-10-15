// Messages between the browser and the Kanth server over /ws.
// Audio travels as base64 PCM16 mono so the browser can schedule it gaplessly.
import type { ToneId } from "./tones.ts";
import type { LangCode, VoiceRef } from "./voices.ts";

export const PCM_SAMPLE_RATE = 24000;
export const STT_SAMPLE_RATE = 16000;

export type SynthPurpose = "speak" | "prespeak" | "partner";

export interface SynthRequest {
  t: "synth";
  id: string;
  text: string;
  lang: LangCode;
  voice: VoiceRef;
  tone: ToneId;
  purpose: SynthPurpose;
}

export interface Turn {
  who: "partner" | "me";
  text: string;
  lang?: LangCode;
  /** Display name of a partner speaker, e.g. "Amma". */
  speaker?: string;
}

export interface Profile {
  name: string;
  /** Languages the user speaks, most used first. */
  languages: LangCode[];
  /** How the user mixes languages, in their own words. e.g. "Tamil with English words". */
  mixStyle: string;
  /** People in the user's life: how the user addresses them. */
  people: { name: string; relation: string; addressAs: string }[];
  /** Free notes the user wants the drafts to know (condition, routines, likes). */
  notes: string;
}

export interface SuggestRequest {
  t: "suggest";
  turnId: string;
  history: Turn[];
  partner: { text: string; lang?: LangCode; who?: string };
  profile: Profile;
  tone: ToneId;
  voice: VoiceRef;
  /** When set, also prespeak each suggestion as soon as it is drafted. */
  prespeak: boolean;
}

export interface SttStart {
  t: "stt_start";
  sessionId: string;
  lang?: LangCode | "unknown";
}
export interface SttStop {
  t: "stt_stop";
  sessionId: string;
}
/** PCM16 mono at STT_SAMPLE_RATE, base64. */
export interface SttAudio {
  t: "stt_audio";
  sessionId: string;
  pcm: string;
}

export interface TransliterateRequest {
  t: "translit";
  id: string;
  text: string;
  lang: LangCode;
}

export type ClientMessage =
  | SynthRequest
  | SuggestRequest
  | SttStart
  | SttStop
  | SttAudio
  | TransliterateRequest
  | { t: "cancel"; id: string }
  | { t: "ping"; at: number };

export interface AudioChunk {
  t: "audio";
  id: string;
  seq: number;
  pcm: string;
}

export interface AudioEnd {
  t: "audio_end";
  id: string;
  /** Server-side ms from request to first audio byte from Sarvam. */
  ttfaMs: number;
  totalMs: number;
  transport: Transport;
  model: string;
  speaker: string;
  substituted: boolean;
  samples: number;
}

export type Transport = "ws" | "http-stream" | "rest" | "clone-ws" | "clone-stream" | "clone-rest";

export interface Suggestion {
  t: "suggestion";
  turnId: string;
  idx: number;
  text: string;
  lang: LangCode;
  /** English gloss so non-speakers can follow along. Never spoken. */
  gloss: string;
  /** ms from suggest request to this suggestion being parsed. */
  atMs: number;
}

export interface SuggestionsDone {
  t: "suggestions_done";
  turnId: string;
  count: number;
  firstTokenMs: number;
  totalMs: number;
  model: string;
}

export interface Transcript {
  t: "transcript";
  sessionId: string;
  text: string;
  final: boolean;
  lang?: string;
  /** ms from stt_stop (end of partner speech) to this final transcript, when known. */
  afterEndMs?: number;
}

export type ServiceName = "tts" | "stt" | "llm" | "clone" | "translit";
export type ServiceState = "ready" | "connecting" | "degraded" | "down" | "no-key";

export interface StatusMessage {
  t: "status";
  service: ServiceName;
  state: ServiceState;
  detail?: string;
}

export interface ErrorMessage {
  t: "error";
  id?: string;
  scope: ServiceName | "server";
  message: string;
  /** What Kanth did about it, in plain words. */
  fallback?: string;
}

export type ServerMessage =
  | AudioChunk
  | AudioEnd
  | Suggestion
  | SuggestionsDone
  | Transcript
  | StatusMessage
  | ErrorMessage
  | { t: "translit"; id: string; text: string }
  | { t: "pong"; at: number; serverAt: number }
  | { t: "hello"; keyPresent: boolean; roster: string[]; version: string };
