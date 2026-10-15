// The Kanth controller: conversation state, drafting, prespeak, choosing and metrics.
// React reads it through useKanth(); the demo director and tests drive it directly.
//
// Hard rule: nothing is spoken in the user's voice unless the user chose it.
// Prespoken audio is only ever stored; play() for channel "me" is called from choose() and speakText() alone.
import type { ServerMessage, ServiceName, ServiceState, Turn, Profile } from "../../../shared/protocol.ts";
import type { ToneId } from "../../../shared/tones.ts";
import type { LangCode, VoiceRef } from "../../../shared/voices.ts";
import { detectScriptLanguage } from "../../../shared/voices.ts";
import { KanthSocket, type LinkState } from "./socket.ts";
import { audio } from "./audio.ts";
import { loadProfile, loadSettings, saveProfile, saveSettings, type Settings } from "./settings.ts";

export interface Card {
  idx: number;
  text: string;
  gloss: string;
  lang: LangCode;
  ready: boolean;
  failed: boolean;
  atMs: number;
}

export interface HistoryItem extends Turn {
  at: number;
  gloss?: string;
  via?: "suggestion" | "typed" | "phrase";
}

export interface TurnMetric {
  turnId: string;
  partnerEndAt?: number;
  transcriptAt?: number;
  suggestRequestedAt?: number;
  firstCardAt?: number;
  allCardsAt?: number;
  allReadyAt?: number;
  chosenAt?: number;
  audibleAt?: number;
  toAudibleMs?: number;
  prespoken?: boolean;
  llmFirstTokenMs?: number;
  llmTotalMs?: number;
  ttfaMs?: number[];
  transport?: string;
  /** Drafted from a partial transcript while the partner was still talking, then confirmed. */
  speculative?: boolean;
}

export interface PartnerState {
  who: string;
  text: string;
  final: boolean;
  lang?: LangCode;
  gloss?: string;
  speaking: boolean;
}

export interface Notice {
  id: number;
  scope: string;
  message: string;
  fallback?: string;
  at: number;
}

export interface KanthState {
  link: LinkState;
  services: Partial<Record<ServiceName, { state: ServiceState; detail?: string }>>;
  keyPresent: boolean | null;
  roster: string[];
  profile: Profile;
  settings: Settings;
  tone: ToneId;
  partner: PartnerState | null;
  turnId: string | null;
  cards: Card[];
  drafting: boolean;
  history: HistoryItem[];
  speakingText: string | null;
  metrics: TurnMetric[];
  notices: Notice[];
}

type Listener = () => void;
let seq = 0;
const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
const uid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export class Kanth {
  readonly socket: KanthSocket;
  private listeners = new Set<Listener>();
  private suggestionWaiters = new Map<string, () => void>();
  private translitWaiters = new Map<string, (t: string) => void>();
  private noticeSeq = 0;
  /** Drafting started from a partial transcript while the partner is still speaking. */
  private spec: { turnId: string; words: number; count: number } | null = null;
  state: KanthState;

  constructor() {
    this.state = {
      link: "connecting",
      services: {},
      keyPresent: null,
      roster: [],
      profile: loadProfile(),
      settings: loadSettings(),
      tone: "warm",
      partner: null,
      turnId: null,
      cards: [],
      drafting: false,
      history: [],
      speakingText: null,
      metrics: [],
      notices: [],
    };
    this.socket = new KanthSocket();
    this.socket.onState((link) => this.set({ link }));
    this.socket.on((m) => this.onMessage(m));
  }

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getState = (): KanthState => this.state;

  private set(patch: Partial<KanthState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  private metric(turnId: string, patch: Partial<TurnMetric>): void {
    const metrics = [...this.state.metrics];
    const i = metrics.findIndex((m) => m.turnId === turnId);
    if (i >= 0) metrics[i] = { ...metrics[i]!, ...patch };
    else metrics.push({ turnId, ...patch });
    this.set({ metrics: metrics.slice(-60) });
  }

  notify(scope: string, message: string, fallback?: string): void {
    const n: Notice = { id: ++this.noticeSeq, scope, message, fallback, at: Date.now() };
    this.set({ notices: [...this.state.notices.slice(-4), n] });
    window.setTimeout(() => this.set({ notices: this.state.notices.filter((x) => x.id !== n.id) }), 9000);
  }

  updateSettings(patch: Partial<Settings>): void {
    const settings = { ...this.state.settings, ...patch };
    saveSettings(settings);
    this.set({ settings });
  }

  updateProfile(profile: Profile): void {
    saveProfile(profile);
    this.set({ profile });
  }

  private onMessage(m: ServerMessage): void {
    switch (m.t) {
      case "hello":
        this.set({ keyPresent: m.keyPresent, roster: m.roster });
        return;
      case "status":
        this.set({ services: { ...this.state.services, [m.service]: { state: m.state, detail: m.detail } } });
        return;
      case "audio":
        audio.push(m.id, m.pcm);
        return;
      case "audio_end": {
        audio.finish(m.id, { ...m });
        const [turnId, idxStr] = m.id.split(":");
        if (turnId && turnId === this.state.turnId && idxStr !== undefined) {
          const idx = Number(idxStr);
          const cards = this.state.cards.map((c) => (c.idx === idx ? { ...c, ready: true } : c));
          this.set({ cards });
          const met = this.state.metrics.find((x) => x.turnId === turnId);
          this.metric(turnId, { ttfaMs: [...(met?.ttfaMs ?? []), m.ttfaMs], transport: m.transport });
          if (cards.length >= 4 && cards.every((c) => c.ready || c.failed)) this.metric(turnId, { allReadyAt: performance.now() });
        }
        return;
      }
      case "suggestion": {
        if (m.turnId !== this.state.turnId) return;
        const now = performance.now();
        const card: Card = { idx: m.idx, text: m.text, gloss: m.gloss, lang: m.lang, ready: false, failed: false, atMs: m.atMs };
        const cards = [...this.state.cards.filter((c) => c.idx !== m.idx), card].sort((a, b) => a.idx - b.idx);
        this.set({ cards });
        if (m.idx === 0) this.metric(m.turnId, { firstCardAt: now });
        return;
      }
      case "suggestions_done":
        if (m.turnId !== this.state.turnId) return;
        this.set({ drafting: false });
        this.metric(m.turnId, { allCardsAt: performance.now(), llmFirstTokenMs: m.firstTokenMs, llmTotalMs: m.totalMs });
        this.suggestionWaiters.get(m.turnId)?.();
        this.suggestionWaiters.get(`${m.turnId}#adopt`)?.();
        this.suggestionWaiters.delete(`${m.turnId}#adopt`);
        return;
      case "transcript":
        this.onTranscript(m.text, m.final, m.lang);
        return;
      case "translit":
        this.translitWaiters.get(m.id)?.(m.text);
        this.translitWaiters.delete(m.id);
        return;
      case "error": {
        if (m.message === "reset" && m.id) {
          audio.reset(m.id);
          return;
        }
        if (m.id) {
          if (audio.has(m.id)) audio.fail(m.id);
          const [turnId, idxStr] = m.id.split(":");
          if (turnId === this.state.turnId && idxStr !== undefined) {
            this.set({ cards: this.state.cards.map((c) => (c.idx === Number(idxStr) ? { ...c, failed: true } : c)) });
          }
          if (m.scope === "llm") {
            this.set({ drafting: false });
            this.suggestionWaiters.get(m.id)?.();
          }
        }
        // Prespeak misses are recovered silently at choose time; everything else is shown.
        if (!(m.scope === "tts" && m.fallback?.startsWith("Will synthesize"))) this.notify(m.scope, m.message, m.fallback);
        return;
      }
      default:
        return;
    }
  }

  // ---------- Listening ----------

  /** Live transcript from speech recognition updates what the partner is saying. */
  private onTranscript(text: string, final: boolean, lang?: string): void {
    const p = this.state.partner;
    if (!p) return;
    const code = (lang && /^[a-z]{2}-IN$/.test(lang) ? (lang as LangCode) : undefined) ?? detectScriptLanguage(text) ?? p.lang;
    this.set({ partner: { ...p, text, final, lang: code } });
    if (!final && p.speaking && this.state.settings.speculate) this.maybeSpeculate(text);
  }

  /**
   * Draft while they talk. Once enough words are heard, Kanth drafts and voices replies from the partial
   * transcript, and drafts again as the sentence grows, so four voiced replies are often ready the moment
   * the partner stops. Nothing is spoken: speculative replies are only shown and cached.
   */
  private maybeSpeculate(text: string): void {
    const words = wordCount(text);
    if (words < 4) return;
    const spec = this.spec;
    if (spec) {
      const inFlight = this.state.drafting && this.state.turnId === spec.turnId;
      if (inFlight || spec.count >= 3 || words < spec.words + 2) return;
    }
    const p = this.state.partner;
    if (!p) return;
    const turnId = this.startDraft({ ...p, text }, false, { speculative: true });
    this.spec = { turnId, words, count: (spec?.count ?? 0) + 1 };
  }

  /** The partner started speaking (live mic or demo). */
  partnerStarted(who: string, lang?: LangCode, gloss?: string): void {
    this.spec = null;
    this.set({ partner: { who, text: "", final: false, lang, gloss, speaking: true }, cards: [], turnId: null });
  }

  /** The partner finished. Kicks off drafting with whatever was heard. */
  async partnerFinished(text: string, opts: { who: string; lang?: LangCode; gloss?: string; endedAt: number; transcriptAt?: number }): Promise<string> {
    const lang = opts.lang ?? detectScriptLanguage(text);
    const partner: PartnerState = { who: opts.who, text, final: true, lang, gloss: opts.gloss, speaking: false };
    const history: HistoryItem[] = [...this.state.history, { who: "partner", speaker: opts.who, text, lang, at: Date.now(), gloss: opts.gloss }];
    this.set({ partner, history });
    const spec = this.spec;
    this.spec = null;
    // Keep the speculative drafts if the final transcript added little (scripts may differ: partials are
    // plain transcription and the final is code-mixed, so compare word counts rather than words).
    const finalWords = wordCount(text);
    if (spec && this.state.turnId === spec.turnId && finalWords - spec.words <= Math.max(2, Math.round(finalWords * 0.3))) {
      this.metric(spec.turnId, { speculative: true });
      this.metric(spec.turnId, { partnerEndAt: opts.endedAt, transcriptAt: opts.transcriptAt });
      if (this.state.drafting) await new Promise<void>((resolve) => this.suggestionWaiters.set(`${spec.turnId}#adopt`, resolve));
      return spec.turnId;
    }
    return this.requestSuggestions({ partnerEndAt: opts.endedAt, transcriptAt: opts.transcriptAt });
  }

  // ---------- Drafting ----------

  requestSuggestions(m: Partial<TurnMetric> = {}): Promise<string> {
    const p = this.state.partner;
    if (!p) return Promise.resolve("");
    const turnId = this.startDraft(p, p.final, m);
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        this.suggestionWaiters.delete(turnId);
        resolve(turnId);
      }, 12000);
      this.suggestionWaiters.set(turnId, () => {
        window.clearTimeout(timer);
        this.suggestionWaiters.delete(turnId);
        resolve(turnId);
      });
    });
  }

  /** Sends a draft request for what the partner said (final, or partial while speculating). */
  private startDraft(p: PartnerState, partnerInHistory: boolean, m: Partial<TurnMetric>): string {
    if (this.state.turnId) {
      this.socket.send({ t: "cancel", id: this.state.turnId });
      audio.forget(`${this.state.turnId}:`);
    }
    const turnId = uid("t");
    this.set({ turnId, cards: [], drafting: true });
    this.metric(turnId, { ...m, suggestRequestedAt: performance.now() });
    // Only this partner's thread: replies to Amma should not leak into a talk with the doctor.
    const prior = partnerInHistory ? this.state.history.slice(0, -1) : this.state.history;
    const thread: HistoryItem[] = [];
    for (let i = 0; i < prior.length; i++) {
      const h = prior[i]!;
      if (h.who === "partner" ? h.speaker === p.who : prior[i - 1]?.who === "partner" && prior[i - 1]?.speaker === p.who) thread.push(h);
    }
    const history = thread.slice(-8).map(({ who, text, lang, speaker }) => ({ who, text, lang, speaker }));
    this.socket.send({
      t: "suggest",
      turnId,
      history,
      partner: { text: p.text, lang: p.lang, who: p.who },
      profile: this.state.profile,
      tone: this.state.tone,
      voice: this.state.settings.voice,
      prespeak: this.state.settings.prespeak,
    });
    return turnId;
  }

  /** Changing tone redrafts: urgent words differ from warm words, not just the voice. */
  setTone(tone: ToneId): void {
    if (tone === this.state.tone) return;
    this.set({ tone });
    if (this.state.partner?.final && this.state.cards.length) void this.requestSuggestions();
  }

  // ---------- Speaking (only on the user's choice) ----------

  /** The user chose a suggestion. Plays it in their voice immediately if it was prespoken. */
  async choose(idx: number, chosenAt = performance.now()): Promise<void> {
    const turnId = this.state.turnId;
    const card = this.state.cards.find((c) => c.idx === idx);
    if (!turnId || !card) return;
    const id = `${turnId}:${idx}:${this.state.tone}`;
    this.metric(turnId, { chosenAt });
    await this.say(id, card.text, card.lang, chosenAt, turnId, card.gloss, "suggestion");
  }

  /** The user typed or picked a phrase. */
  async speakText(text: string, via: "typed" | "phrase" = "typed", lang?: LangCode, gloss?: string): Promise<void> {
    const clean = text.trim();
    if (!clean) return;
    const code = lang ?? detectScriptLanguage(clean) ?? this.state.profile.languages[0] ?? "en-IN";
    await this.say(uid("u"), clean, code, performance.now(), null, gloss, via);
  }

  /** Plays prespoken audio by id if present (used for cached phrases). */
  async sayCached(id: string, text: string, lang: LangCode, gloss?: string): Promise<boolean> {
    if (!audio.isReady(id)) return false;
    await this.say(id, text, lang, performance.now(), null, gloss, "phrase");
    return true;
  }

  private async say(id: string, text: string, lang: LangCode, chosenAt: number, turnId: string | null, gloss: string | undefined, via: HistoryItem["via"]): Promise<void> {
    audio.unlock();
    this.set({
      speakingText: text,
      history: [...this.state.history, { who: "me", text, lang, at: Date.now(), gloss, via }],
    });
    const st = audio.status(id);
    if (st === "none" || st === "failed") {
      audio.drop(id);
      this.socket.send({ t: "synth", id, text, lang, voice: this.state.settings.voice, tone: this.state.tone, purpose: "speak" });
    }
    const result = audio.play(id, "me", chosenAt, text);
    let audibleMs = result.toAudibleMs;
    if (!result.prespoken) {
      audibleMs = await new Promise<number>((resolve) => {
        const off = audio.onPlay((e) => {
          if (e.id === id) {
            off();
            resolve(e.toAudibleMs);
          }
        });
        void audio.whenDone(id).then((ok) => {
          if (!ok) {
            off();
            resolve(-1);
          }
        });
      });
      if (audibleMs < 0) {
        this.notify("tts", "Bulbul could not be reached.", "Spoke with the device voice so you were not left silent.");
        await audio.speakWithDevice(text, lang);
        this.set({ speakingText: null });
        return;
      }
    }
    if (turnId) this.metric(turnId, { audibleAt: chosenAt + audibleMs, toAudibleMs: audibleMs, prespoken: result.prespoken });
    await result.ended;
    if (this.state.speakingText === text) this.set({ speakingText: null });
  }

  /** Synthesize something into the cache without playing it (cached phrases, partner lines). */
  presynth(id: string, text: string, lang: LangCode, voice: VoiceRef, purpose: "prespeak" | "partner", tone: ToneId = "warm"): Promise<boolean> {
    if (!audio.has(id)) this.socket.send({ t: "synth", id, text, lang, voice, tone, purpose });
    return audio.whenDone(id);
  }

  transliterate(text: string, lang: LangCode): Promise<string> {
    const id = uid("x");
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => resolve(text), 4000);
      this.translitWaiters.set(id, (t) => {
        window.clearTimeout(timer);
        resolve(t);
      });
      this.socket.send({ t: "translit", id, text, lang });
    });
  }

  /** Used by the film when the recorder cuts the network. */
  goOffline(): void {
    this.socket.dropForOffline();
  }

  stopSpeaking(): void {
    audio.stop("me");
    this.set({ speakingText: null });
  }

  resetConversation(): void {
    this.set({ partner: null, turnId: null, cards: [], history: [], drafting: false, metrics: [] });
  }
}

export const kanth = new Kanth();
