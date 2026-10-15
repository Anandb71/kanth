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
  caption?: { who: string; line: string };
  story?: { title: string; body?: string };
  end?: { lines: string[] };
  black: boolean;
  offline: boolean;
  done: boolean;
}

type Listener = (s: FilmState) => void;

const AAC_WPM = 15;

interface Beat extends Scene {
  /** Switch tone before choosing, to show the dial. */
  toneBeforeChoice?: ToneId;
}

const BEATS: Beat[] = [
  { ...SCENES[0]!, pickHint: ["minute", "wait", "later", "not yet", "little"] },
  { ...SCENES[1]!, pickHint: ["four", "4", "three", "3", "better", "less"] },
  { ...SCENES[2]!, toneBeforeChoice: "joking", pickHint: ["van", "book", "yes", "sure", "ready"] },
];

export class FilmDirector {
  state: FilmState = { running: false, scene: -1, black: true, offline: false, done: false };
  private listeners = new Set<Listener>();

  on(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<FilmState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  async run(): Promise<void> {
    if (this.state.running) return;
    this.set({ running: true, black: true, done: false });
    audio.unlock();
    audio.startFilmLog();
    kanth.resetConversation();
    kanth.setTone("warm");

    const ids = BEATS.map((_, i) => `film-partner-${i}`);
    await Promise.all(BEATS.map((b, i) => kanth.presynth(ids[i]!, b.text, b.lang, { kind: "persona", name: b.speaker }, "partner")));
    await this.waitForPhrase("Suction");
    (window as unknown as { __filmReady?: boolean }).__filmReady = true;
    await sleep(600);
    this.set({ black: false });
    await sleep(500);

    for (let i = 0; i < BEATS.length; i++) {
      const b = BEATS[i]!;
      this.set({ scene: i, story: undefined });
      kanth.setTone("warm");
      kanth.partnerStarted(b.who, b.lang, b.gloss);
      this.set({ caption: { who: b.who, line: b.gloss } });
      const heard = await speakPartner(ids[i]!, b);
      await kanth.partnerFinished(heard.text, { who: b.who, lang: b.lang, gloss: b.gloss, endedAt: heard.endedAt, transcriptAt: heard.transcriptAt });
      this.set({ caption: undefined });
      await this.waitForCards();

      if (i === 0) {
        this.set({ story: { title: "Arjun cannot speak.", body: "While his mother was talking, Kanth heard her, drafted four replies, and voiced every one with Bulbul V4 Flash. He only has to choose." } });
        await sleep(3800);
      }
      if (b.toneBeforeChoice) {
        this.set({ story: { title: "Tone changes the words and the voice.", body: "Joking redrafts the replies and speaks them faster and brighter." } });
        await sleep(1400);
        this.pressTone(b.toneBeforeChoice);
        await sleep(200);
        await this.waitForCards();
        await sleep(1600);
      }
      this.set({ story: undefined });

      const card = await this.scanAndChoose(b);
      if (card) {
        this.set({ caption: { who: "Arjun", line: card.gloss || card.text } });
        await this.waitUntilQuiet();
      }
      this.set({ caption: undefined });

      if (i === 0) {
        const m = kanth.state.metrics[kanth.state.metrics.length - 1];
        const words = card?.text.trim().split(/\s+/).length ?? 0;
        const typingS = Math.round((words / AAC_WPM) * 60);
        this.set({
          story: {
            title: `Heard ${fmtMs(m?.toAudibleMs)} after he chose.`,
            body: `Typing those ${words} words at the AAC average of ${AAC_WPM} words a minute takes about ${typingS} seconds.`,
          },
        });
        await sleep(4200);
        this.set({ story: undefined });
      }
      await sleep(700);
    }

    // Offline: the recorder cuts the network for real. The emergency board still speaks.
    this.set({ story: { title: "The network drops.", body: "The emergency board is stored on the device, in his voice." } });
    (window as unknown as { __filmWantsOffline?: boolean }).__filmWantsOffline = true;
    await this.waitForOffline();
    this.set({ offline: true });
    await sleep(1500);
    const phrase = document.querySelector<HTMLElement>('.phrase.urgent[data-phrase*="Suction"]');
    phrase?.classList.add("scan-focus");
    await sleep(600);
    phrase?.classList.remove("scan-focus");
    phrase?.click();
    this.set({ caption: { who: "Arjun", line: "I need suction." } });
    await sleep(400);
    await this.waitUntilQuiet();
    this.set({ caption: undefined });
    await sleep(1200);

    // Closing card: the take's own measurements.
    const ms = kanth.state.metrics.filter((m) => m.partnerEndAt);
    const heard = median(ms.map((m) => (m.transcriptAt && m.partnerEndAt ? m.transcriptAt - m.partnerEndAt : undefined)));
    const drafted = median(ms.map((m) => (m.allCardsAt && m.partnerEndAt ? m.allCardsAt - m.partnerEndAt : undefined)));
    const voiced = median(ms.map((m) => (m.allReadyAt && m.partnerEndAt ? m.allReadyAt - m.partnerEndAt : undefined)));
    const spoken = median(ms.map((m) => m.toAudibleMs));
    this.set({
      story: undefined,
      end: {
        lines: [
          `Saaras transcribed each line ${fmtMs(heard)} after it ended.`,
          `Four replies were drafted in ${fmtMs(drafted)}.`,
          `Bulbul V4 Flash had all four voiced in ${fmtMs(voiced)}.`,
          `Arjun was heard ${fmtMs(spoken)} after he chose.`,
        ],
      },
    });
    await sleep(7000);
    this.set({ done: true, running: false });
    (window as unknown as { __filmDone?: boolean }).__filmDone = true;
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
    await sleep(900);
    const els = [...document.querySelectorAll<HTMLElement>('[data-scan-item="cards"]')];
    for (let k = 0; k <= pick.idx; k++) {
      for (const e of els) e.classList.remove("scan-focus");
      els[k]?.classList.add("scan-focus");
      await sleep(550);
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
