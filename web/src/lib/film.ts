// Film mode (?film): the scripted cut used to record the demo video.
// Everything runs live: Bulbul voices the partner, Saaras transcribes, drafts are generated and prespoken.
// A simulated user makes the choices, labelled on screen. Every number shown is measured during the take.
import type { ToneId } from "../../../shared/tones.ts";
import { kanth } from "./kanth.ts";
import { audio } from "./audio.ts";
import { SCENES, speakPartner, sleep, type Scene } from "./demo.ts";
import { median, fmtMs } from "./useKanth.ts";

export interface FilmState {
  running: boolean;
  scene: number;
  caption?: { who: string; line: string; where?: string };
  story?: { title: string; body?: string };
  end?: { lines: string[]; note?: string };
  black: boolean;
  offline: boolean;
  done: boolean;
}

type Listener = (s: FilmState) => void;

// Switch scanning averages 1.7 words a minute (Koester and Arthanat 2018; research/evidence.md A2).
// The same figure the live meter shows beside it. The often-quoted "15 wpm AAC average" is not supported.
const SCAN_WPM = 1.7;
/** Shortest time a caption stays up, so short replies can still be read. */
const MIN_CAPTION_MS = 2000;

/** A time relative to a moment: negative means before it. */
function when(ms: number | undefined, moment: string): string {
  if (ms === undefined) return `${fmtMs(ms)} after ${moment}`;
  return ms < 0 ? `${fmtMs(-ms)} before ${moment}` : `${fmtMs(ms)} after ${moment}`;
}

function since(m: { partnerEndAt?: number } | undefined, t: number | undefined): number | undefined {
  return m?.partnerEndAt && t ? t - m.partnerEndAt : undefined;
}

interface Beat extends Scene {
  /** Switch tone before choosing, to show the dial. */
  toneBeforeChoice?: ToneId;
  /** Steer with one press before choosing, to show the user giving the detail (never the model). */
  steerBeforeChoice?: string;
}

const BEATS: Beat[] = [
  { ...SCENES[0]!, pickHint: ["not yet", "minute", "later", "after", "soon", "wait", "eat", "ate", "hungry"] },
  { ...SCENES[1]!, steerBeforeChoice: "6", pickHint: ["6", "six", "छह", "छः"] },
  { ...SCENES[2]!, toneBeforeChoice: "joking", pickHint: ["van", "book", "yes", "sure", "ready", "come"] },
];

export class FilmDirector {
  state: FilmState = { running: false, scene: -1, black: true, offline: false, done: false };
  private listeners = new Set<Listener>();

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  /** What was on screen and when (wall-clock ms), for the recorder's subtitle file and trim point. */
  marks: { epochMs: number; key: string; value: unknown }[] = [];
  /** PCM of every played utterance, kept here because a new turn forgets the previous turn's audio. */
  private kept = new Map<string, Float32Array>();

  private set(patch: Partial<FilmState>): void {
    this.state = { ...this.state, ...patch };
    const epochMs = performance.timeOrigin + performance.now();
    for (const key of ["black", "caption", "story", "end", "offline", "done"] as const) {
      if (key in patch) this.marks.push({ epochMs, key, value: patch[key] ?? null });
    }
    for (const fn of this.listeners) fn(this.state);
  }

  /** Puts back any played audio that a later turn dropped, so audio.exportFilmLog() is complete. */
  private restoreFilmAudio(): void {
    for (const [id, f] of this.kept) if (!audio.isReady(id)) audio.loadSamples(id, f);
  }

  async run(): Promise<void> {
    if (this.state.running) return;
    this.marks = [];
    (window as unknown as { __filmMarks?: unknown }).__filmMarks = this.marks;
    this.set({ running: true, black: true, done: false });
    audio.unlock();
    audio.startFilmLog();
    audio.onPlay((e) => void audio.whenDone(e.id).then((ok) => ok && this.kept.set(e.id, audio.samplesOf(e.id))));
    kanth.resetConversation();
    kanth.setTone("warm");

    const ids = BEATS.map((_, i) => `film-partner-${i}`);
    await Promise.all(BEATS.map((b, i) => kanth.presynth(ids[i]!, b.text, b.lang, { kind: "persona", name: b.speaker }, "partner")));
    await this.waitForPhrase("Suction");
    (window as unknown as { __filmReadyAt?: number }).__filmReadyAt = performance.timeOrigin + performance.now();
    (window as unknown as { __filmReady?: boolean }).__filmReady = true;
    await sleep(600);
    this.set({ black: false });
    await sleep(500);

    for (let i = 0; i < BEATS.length; i++) {
      const b = BEATS[i]!;
      this.set({ scene: i, story: undefined });
      kanth.setTone("warm");
      kanth.partnerStarted(b.who, b.lang, b.gloss);
      this.set({ caption: { who: b.who, line: b.gloss, where: b.setting } });
      const heard = await speakPartner(ids[i]!, b);
      await kanth.partnerFinished(heard.text, { who: b.who, lang: b.lang, gloss: b.gloss, endedAt: heard.endedAt, transcriptAt: heard.transcriptAt });
      this.set({ caption: undefined });
      await this.waitForCards();

      if (i === 0) {
        const m = kanth.state.metrics.find((x) => x.turnId === kanth.state.turnId);
        const drafted = since(m, m?.allCardsAt);
        const first = drafted !== undefined && drafted < 0 ? "Before his mother finished speaking, Kanth had drafted four replies." : "Kanth heard his mother and drafted four replies.";
        this.set({ story: { title: "Arjun cannot speak.", body: `${first} Bulbul V4 Flash voiced every one ${when(since(m, m?.allReadyAt), "her last word")}. He only has to choose.` } });
        await sleep(5000);
      }
      if (b.steerBeforeChoice) {
        this.set({ story: { title: "He gives the number. Kanth never guesses it.", body: `One press on ${b.steerBeforeChoice} redrafts all four replies around it.` } });
        await sleep(2200);
        await this.pressSteer(b.steerBeforeChoice);
        await sleep(300);
        await this.waitForCards();
        await sleep(1800);
      }
      if (b.toneBeforeChoice) {
        this.set({ story: { title: "Tone changes the words and the voice.", body: "Joking redrafts the replies and speaks them faster and brighter." } });
        await sleep(1800);
        this.pressTone(b.toneBeforeChoice);
        await sleep(200);
        await this.waitForCards();
        await sleep(2000);
      }
      this.set({ story: undefined });

      const card = await this.scanAndChoose(b);
      if (card) {
        this.set({ caption: { who: "Arjun", line: card.gloss || card.text } });
        await this.holdCaption();
      }
      this.set({ caption: undefined });

      if (i === 0) {
        const m = kanth.state.metrics[kanth.state.metrics.length - 1];
        const words = card?.text.trim().split(/\s+/).length ?? 0;
        const typingS = (words / SCAN_WPM) * 60;
        const typing = typingS >= 90 ? `${Math.round(typingS / 60)} minutes` : `${Math.round(typingS)} seconds`;
        this.set({
          story: {
            title: `Heard ${fmtMs(m?.toAudibleMs)} after he chose.`,
            body: `Spelling those ${words} words with one switch, at the published average of ${SCAN_WPM} words a minute, takes about ${typing}.`,
          },
        });
        await sleep(5200);
        this.set({ story: undefined });
      }
      await sleep(1500);
    }

    // Offline: the recorder cuts the network for real. The emergency board still speaks.
    this.set({ story: { title: "The network drops.", body: "The emergency board is stored on the device, in his voice." } });
    (window as unknown as { __filmWantsOffline?: boolean }).__filmWantsOffline = true;
    await this.waitForOffline();
    this.set({ offline: true });
    await sleep(700);
    const phrase = document.querySelector<HTMLElement>('.phrase.urgent[data-phrase*="Suction"]');
    // The board sits below the replies: bring it into view so the choice is seen.
    phrase?.closest<HTMLElement>("[data-scan-group]")?.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep(1500);
    phrase?.classList.add("scan-focus");
    await sleep(700);
    phrase?.classList.remove("scan-focus");
    phrase?.click();
    this.set({ caption: { who: "Arjun", line: "I need suction.", where: "Emergency board, offline" } });
    await this.holdCaption();
    this.set({ caption: undefined });
    await sleep(1500);

    // Closing card: the take's own measurements.
    const ms = kanth.state.metrics.filter((m) => m.partnerEndAt && !m.redraft);
    const heard = median(ms.map((m) => since(m, m.transcriptAt)));
    const drafted = median(ms.map((m) => since(m, m.allCardsAt)));
    const voiced = median(ms.map((m) => since(m, m.allReadyAt)));
    const spoken = median(ms.map((m) => m.toAudibleMs));
    this.set({
      story: undefined,
      end: {
        lines: [
          `Saaras transcribed each line ${fmtMs(heard)} after it ended.`,
          `Four replies were drafted ${when(drafted, "the line ended")}.`,
          `Bulbul V4 Flash had all four voiced ${when(voiced, "it ended")}.`,
          `Arjun was heard ${fmtMs(spoken)} after he chose.`,
        ],
        note: `Medians of the ${ms.length} partner turns, measured live in this take`,
      },
    });
    await sleep(9000);
    this.restoreFilmAudio();
    this.set({ done: true, running: false });
    (window as unknown as { __filmDone?: boolean }).__filmDone = true;
  }

  private async pressSteer(word: string): Promise<void> {
    const btn = [...document.querySelectorAll<HTMLButtonElement>('[data-scan-group="steer"] button')].find((b) => b.textContent?.trim() === word);
    btn?.scrollIntoView({ block: "center", behavior: "smooth" });
    btn?.classList.add("scan-focus");
    await sleep(700);
    btn?.classList.remove("scan-focus");
    void kanth.steer(word);
  }

  private pressTone(t: ToneId): void {
    const btn = [...document.querySelectorAll<HTMLButtonElement>(".tone")].find((b) => b.dataset.tone === t);
    btn?.classList.add("scan-focus");
    window.setTimeout(() => btn?.classList.remove("scan-focus"), 500);
    kanth.setTone(t);
  }

  /** Single-switch scanning, shown at a brisk pace: the highlight steps across the cards to the pick. */
  private async scanAndChoose(b: Beat) {
    const cards = kanth.state.cards;
    if (!cards.length) return undefined;
    const hints = b.pickHint ?? [];
    const scored = cards.map((c) => ({ c, score: hints.reduce((n, h) => n + (`${c.gloss} ${c.text}`.toLowerCase().includes(h) ? 1 : 0), 0) }));
    scored.sort((x, y) => y.score - x.score || x.c.idx - y.c.idx);
    const pick = scored[0]!.c;
    this.marks.push({ epochMs: performance.timeOrigin + performance.now(), key: "pick", value: { idx: pick.idx, options: cards.map((c) => c.gloss || c.text) } });
    await sleep(1300);
    const els = [...document.querySelectorAll<HTMLElement>('[data-scan-item="cards"]')];
    for (let k = 0; k <= pick.idx; k++) {
      for (const e of els) e.classList.remove("scan-focus");
      els[k]?.classList.add("scan-focus");
      await sleep(650);
    }
    for (const e of els) e.classList.remove("scan-focus");
    void kanth.choose(pick.idx);
    await sleep(50);
    return pick;
  }

  private async waitForCards(): Promise<void> {
    const t = performance.now();
    while (performance.now() - t < 10000) {
      const s = kanth.state;
      if (!s.drafting && s.cards.length >= 4 && s.cards.every((c) => c.ready || c.failed)) return;
      await sleep(50);
    }
  }

  /** Waits for Arjun to finish speaking, keeping the caption up long enough to read. */
  private async holdCaption(): Promise<void> {
    const shown = performance.now();
    await this.waitUntilQuiet();
    await sleep(Math.max(0, MIN_CAPTION_MS - (performance.now() - shown)));
  }

  private async waitUntilQuiet(): Promise<void> {
    await sleep(100);
    while (kanth.state.speakingText) await sleep(50);
  }

  private async waitForPhrase(fragment: string): Promise<void> {
    const t = performance.now();
    while (performance.now() - t < 15000) {
      const el = document.querySelector<HTMLElement>(`.phrase.urgent[data-phrase*="${fragment}"]`);
      if (el?.dataset.ready === "1") return;
      await sleep(100);
    }
  }

  private async waitForOffline(): Promise<void> {
    const t = performance.now();
    while (navigator.onLine && performance.now() - t < 8000) await sleep(50);
    kanth.goOffline();
  }
}

export const film = new FilmDirector();
