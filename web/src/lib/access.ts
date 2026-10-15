// Access methods beyond touch: switch scanning (one or two switches), dwell, and blink.
// A "switch press" is any of: Space or Enter key, a click on the big switch area, or a deliberate blink.
import { useEffect, useRef, type RefObject } from "react";

/** Dwell: hold the pointer over a target for `ms` to activate it. 0 disables. */
export function useDwell(ref: RefObject<HTMLElement | null>, ms: number, onFire: () => void): void {
  const fire = useRef(onFire);
  fire.current = onFire;
  useEffect(() => {
    const el = ref.current;
    if (!el || ms <= 0) return;
    let start = 0;
    let raf = 0;
    let armed = true;
    const tick = () => {
      const p = Math.min(1, (performance.now() - start) / ms);
      el.style.setProperty("--dwell", String(p));
      if (p >= 1) {
        armed = false;
        el.style.setProperty("--dwell", "0");
        fire.current();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    const enter = () => {
      if (!armed) return;
      start = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const leave = () => {
      cancelAnimationFrame(raf);
      el.style.setProperty("--dwell", "0");
      armed = true;
    };
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
    };
  }, [ref, ms]);
}

type Mode = "auto" | "step";

/**
 * Group-item scanning over the DOM. Top-level stops are elements marked data-scan-top, in page order.
 * A stop that is also data-scan-group="x" is entered on select, then its data-scan-item="x" children are scanned.
 * The replies group is always first, and when new replies arrive, scanning jumps straight into it.
 */
export class Scanner {
  private timer = 0;
  private level: "top" | "items" = "top";
  private items: HTMLElement[] = [];
  private pos = -1;
  private loops = 0;
  private group: string | null = null;
  private running = false;

  constructor(private mode: Mode, private intervalMs: number) {}

  start(): void {
    this.running = true;
    this.restart();
  }

  stop(): void {
    this.running = false;
    window.clearInterval(this.timer);
    this.clearHighlight();
  }

  /** Jump into the replies when they appear: the most likely next action is choosing one. */
  focusReplies(): void {
    if (!this.running) return;
    const cards = document.querySelector<HTMLElement>('[data-scan-group="cards"]');
    if (cards && cards.querySelector('[data-scan-item="cards"]')) this.enter("cards");
  }

  restart(): void {
    this.level = "top";
    this.group = null;
    this.items = this.topStops();
    this.pos = -1;
    this.loops = 0;
    this.advance();
    this.schedule();
  }

  /** The switch was pressed: select what is highlighted. */
  press(): void {
    if (!this.running) return;
    const el = this.items[this.pos];
    if (!el) return this.restart();
    if (el.dataset.scanExit !== undefined) return this.restart();
    if (this.level === "top" && el.dataset.scanGroup) {
      this.enter(el.dataset.scanGroup);
      return;
    }
    this.clearHighlight();
    el.click();
    window.setTimeout(() => this.restart(), 50);
  }

  /** Second switch in step mode: move to the next stop. */
  next(): void {
    if (!this.running) return;
    this.advance();
  }

  private enter(group: string): void {
    const root = document.querySelector<HTMLElement>(`[data-scan-group="${group}"]`);
    if (!root) return;
    const items = [...root.querySelectorAll<HTMLElement>(`[data-scan-item="${group}"]`)].filter(visible);
    if (!items.length) return;
    this.level = "items";
    this.group = group;
    this.items = [...items, exitStop()];
    this.pos = -1;
    this.loops = 0;
    this.advance();
    this.schedule();
  }

  private topStops(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>("[data-scan-top]")].filter(visible);
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
      // Stop after three silent loops to avoid fatigue; the next press restarts.
      window.clearInterval(this.timer);
      this.pos = -1;
      return;
    }
    const el = this.items[this.pos]!;
    if (el.dataset.scanExit !== undefined) {
      const root = document.querySelector<HTMLElement>(`[data-scan-group="${this.group}"]`);
      root?.classList.add("scan-focus");
      return;
    }
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

function exitStop(): HTMLElement {
  const el = document.createElement("span");
  el.dataset.scanExit = "";
  return el;
}
