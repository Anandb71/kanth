// Access methods beyond touch: switch scanning (one or two switches), dwell, and blink.
// A "switch press" is any of: Space or Enter key, a click on the big switch area, or a deliberate blink.

/** Everything a pointer can dwell on: every scan stop that is a button, plus a few controls marked data-dwell. */
const DWELL_TARGETS = "[data-scan-item], button[data-scan-top], [data-dwell]";

/**
 * Dwell: rest the pointer (a head pointer or eye tracker) on any choice for `ms` to press it.
 * One delegated listener covers replies, phrases, steering words, tones and the rest, so nothing on
 * the talk view needs a mouse click. Each dwell fires once; move away and back to fire again.
 *
 * Safety: if the replies change while the pointer rests on a reply, the dwell starts again, so a reply
 * is never chosen before it has been on screen for a full dwell.
 */
export function startDwell(ms: number, repliesChangedAt: () => number): () => void {
  let el: HTMLElement | null = null;
  let fired: HTMLElement | null = null;
  let start = 0;
  let raf = 0;

  const paint = (t: HTMLElement, p: number) => {
    t.style.setProperty("--dwell", String(p));
    // Reply tiles draw their own bar from --dwell. Everything else gets a bar along its bottom edge.
    if (t.querySelector(":scope > .dwell")) return;
    if (p <= 0) {
      t.style.removeProperty("background-image");
      t.style.removeProperty("background-size");
      t.style.removeProperty("background-repeat");
      t.style.removeProperty("background-position");
      return;
    }
    t.style.backgroundImage = "linear-gradient(var(--accent), var(--accent))";
    t.style.backgroundSize = `${(p * 100).toFixed(1)}% 5px`;
    t.style.backgroundRepeat = "no-repeat";
    t.style.backgroundPosition = "left bottom";
  };

  const cancel = () => {
    cancelAnimationFrame(raf);
    if (el) paint(el, 0);
    el = null;
  };

  const tick = () => {
    const t = el;
    if (!t) return;
    if (!t.isConnected || (t as HTMLButtonElement).disabled) return cancel();
    const now = performance.now();
    const begin = t.dataset.scanItem === "cards" ? Math.max(start, repliesChangedAt() + 600) : start;
    const p = Math.max(0, Math.min(1, (now - begin) / ms));
    paint(t, p);
    if (p >= 1) {
      cancel();
      fired = t;
      t.click();
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  const over = (e: PointerEvent) => {
    const t = (e.target as Element | null)?.closest<HTMLElement>(DWELL_TARGETS) ?? null;
    if (t !== fired) fired = null;
    if (t === el || (t && t === fired)) return;
    cancel();
    if (!t || (t as HTMLButtonElement).disabled) return;
    el = t;
    start = performance.now();
    raf = requestAnimationFrame(tick);
  };

  const out = (e: PointerEvent) => {
    const to = (e.relatedTarget as Element | null)?.closest<HTMLElement>(DWELL_TARGETS) ?? null;
    if (to === el) return;
    cancel();
    if (to !== fired) fired = null;
  };

  document.addEventListener("pointerover", over);
  document.addEventListener("pointerout", out);
  return () => {
    cancel();
    document.removeEventListener("pointerover", over);
    document.removeEventListener("pointerout", out);
  };
}

type Mode = "auto" | "step";

export interface ScanState {
  paused: boolean;
  /** A press on a reply was refused because the replies had only just changed. Nothing was said. */
  refused?: boolean;
}

/** How long after the last press the user counts as moving, so new replies do not pull the highlight away. */
const ACTIVE_MS = 4000;

/**
 * Group-item scanning over the DOM. Top-level stops are elements marked data-scan-top, sorted by
 * data-scan-order (replies first, then the emergency phrases). A stop that is also data-scan-group="x"
 * is entered on select, then its data-scan-item="x" children are scanned, ending with a visible Back stop.
 *
 * Safety: presses are ignored for a short lockout after every selection, so a held switch or a bounce can
 * never say something twice. After the replies change, a press on a reply is refused for a moment (and the
 * user is told), so Kanth never says text the user has not read. That reply lock never blocks anything else:
 * the emergency phrases always work.
 */
export class Scanner {
  private timer = 0;
  private enterTimer = 0;
  private level: "top" | "items" = "top";
  private items: HTMLElement[] = [];
  private pos = -1;
  private loops = 0;
  private group: string | null = null;
  private running = false;
  private paused = false;
  /** Bounce lock: applies to every press. */
  private lockUntil = 0;
  /** Reply lock: applies only to choosing a reply, right after the replies change. */
  private replyLockUntil = 0;
  private lastPressAt = -Infinity;
  private back: HTMLElement | null = null;
  private listener: (s: ScanState) => void = () => {};

  constructor(private mode: Mode, private intervalMs: number, private lockoutMs = 450) {}

  onState(fn: (s: ScanState) => void): void {
    this.listener = fn;
  }

  start(): void {
    this.running = true;
    this.restart();
  }

  stop(): void {
    this.running = false;
    window.clearInterval(this.timer);
    window.clearTimeout(this.enterTimer);
    this.clearHighlight();
    this.removeBack();
  }

  /**
   * Move into the replies. The first reply is highlighted only once it can be chosen,
   * so a highlighted reply is never one that a press would refuse.
   */
  focusReplies(): void {
    if (!this.running) return;
    window.clearTimeout(this.enterTimer);
    const cards = document.querySelector<HTMLElement>('[data-scan-group="cards"]');
    if (!cards || !cards.querySelector('[data-scan-item="cards"]')) return this.restart();
    const wait = this.replyLockUntil - performance.now();
    if (wait <= 0) {
      if (!this.enter("cards")) this.restart();
      return;
    }
    window.clearInterval(this.timer);
    this.clearHighlight();
    this.removeBack();
    this.level = "top";
    this.group = null;
    this.items = [];
    this.pos = -1;
    this.enterTimer = window.setTimeout(() => {
      if (this.running && !this.enter("cards")) this.restart();
    }, wait);
  }

  /**
   * The replies just changed. Choosing a reply is refused for `ms`. If the user has not pressed for a few
   * seconds and is on the replies (or at the top level, but not on the emergency phrases), the scan moves
   * to the first reply. A user who is moving, or who is on another group, keeps their place.
   */
  holdOff(ms = 600): void {
    const now = performance.now();
    this.replyLockUntil = Math.max(this.replyLockUntil, now + ms);
    if (!this.running || this.paused) return;
    if (now - this.lastPressAt <= ACTIVE_MS) return;
    const here = this.items[this.pos];
    const onEmergency = this.level === "top" && here?.dataset.scanGroup === "urgent";
    if (this.group === "cards" || (this.level === "top" && !onEmergency)) this.focusReplies();
  }

  restart(): void {
    window.clearTimeout(this.enterTimer);
    this.removeBack();
    this.level = "top";
    this.group = null;
    this.items = this.topStops();
    this.pos = -1;
    this.loops = 0;
    this.paused = false;
    this.listener({ paused: false });
    this.advance();
    this.schedule();
  }

  /** The switch went down: hold the highlight still until it is released, so the release selects what was seen. */
  hold(): void {
    if (!this.running) return;
    window.clearInterval(this.timer);
  }

  /** The switch was pressed (or released, for a key switch): select what is highlighted. */
  press(): void {
    if (!this.running) return;
    const now = performance.now();
    if (now < this.lockUntil) return this.resume();
    this.lastPressAt = now;
    if (this.pos < 0) {
      // Resuming after a pause, or waiting for new replies to become choosable.
      this.lockUntil = now + this.lockoutMs;
      this.paused = false;
      return this.focusReplies();
    }
    const el = this.items[this.pos];
    if (!el || !el.isConnected) {
      this.lockUntil = now + this.lockoutMs;
      return this.restart();
    }
    if (this.group === "cards" && el.dataset.scanItem === "cards" && now < this.replyLockUntil) {
      // Never say a reply the user may not have read. Say so, and keep the highlight where it is.
      this.listener({ paused: false, refused: true });
      return this.resume();
    }
    this.lockUntil = now + this.lockoutMs;
    if (el.dataset.scanExit !== undefined) return this.restart();
    if (this.level === "top" && el.dataset.scanGroup) {
      if (el.dataset.scanGroup === "cards") return this.focusReplies();
      if (!this.enter(el.dataset.scanGroup)) this.resume();
      return;
    }
    this.clearHighlight();
    el.click();
    window.setTimeout(() => {
      if (this.running) this.restart();
    }, 50);
  }

  /** A long hold: go straight to the emergency phrases, wherever the scan is. */
  enterGroup(group: string): boolean {
    if (!this.running) return false;
    const now = performance.now();
    this.lastPressAt = now;
    this.lockUntil = now + this.lockoutMs;
    const ok = this.enter(group);
    if (!ok) this.resume();
    return ok;
  }

  /** Second switch in step mode: move to the next stop. */
  next(): void {
    if (!this.running) return;
    this.lastPressAt = performance.now();
    this.advance();
  }

  /** Lets the scan move again after hold(), for example when the window loses focus mid-press. */
  resume(): void {
    if (this.running && !this.paused && this.pos >= 0) this.schedule();
  }

  private enter(group: string): boolean {
    const root = document.querySelector<HTMLElement>(`[data-scan-group="${group}"]`);
    if (!root) return false;
    const items = [...root.querySelectorAll<HTMLElement>(`[data-scan-item="${group}"]`)].filter(visible);
    if (!items.length) return false;
    window.clearTimeout(this.enterTimer);
    this.removeBack();
    this.back = document.createElement("span");
    this.back.className = "scan-back";
    this.back.dataset.scanExit = "";
    this.back.textContent = "Back";
    root.appendChild(this.back);
    this.level = "items";
    this.group = group;
    this.items = [...items, this.back];
    this.pos = -1;
    this.loops = 0;
    this.paused = false;
    this.listener({ paused: false });
    this.advance();
    this.schedule();
    return true;
  }

  private removeBack(): void {
    this.back?.remove();
    this.back = null;
  }

  private topStops(): HTMLElement[] {
    const order = (el: HTMLElement) => Number(el.dataset.scanOrder ?? 50);
    return [...document.querySelectorAll<HTMLElement>("[data-scan-top]")].filter(visible).sort((a, b) => order(a) - order(b));
  }

  private schedule(): void {
    window.clearInterval(this.timer);
    if (this.mode === "auto") this.timer = window.setInterval(() => this.advance(), this.intervalMs);
  }

  private advance(): void {
    if (!this.items.length) this.items = this.topStops();
    if (!this.items.length) return;
    this.clearHighlight();
    this.pos = (this.pos + 1) % this.items.length;
    if (this.pos === 0) this.loops++;
    if (this.mode === "auto" && this.loops > 3) {
      // Pause after three silent loops to avoid fatigue. The next press resumes on the replies.
      window.clearInterval(this.timer);
      this.pos = -1;
      this.paused = true;
      this.listener({ paused: true });
      return;
    }
    const el = this.items[this.pos]!;
    el.classList.add("scan-focus");
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  private clearHighlight(): void {
    for (const el of document.querySelectorAll(".scan-focus")) el.classList.remove("scan-focus");
  }
}

function visible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}
