// Turn detection in the browser, for the hosted version where Saaras realtime cannot be used.
// Energy based with an adaptive noise floor: speech starts after a short run of loud frames and ends after
// a run of quiet ones. Each finished utterance is handed over whole, with a little audio from before it began.

export interface TurnDetectorOptions {
  sampleRate: number;
  /** Loud audio needed before a turn counts as started. */
  startMs: number;
  /** Quiet audio needed before a turn counts as ended. */
  endMs: number;
  /** Audio kept from just before the start, so the first syllable is not clipped. */
  prerollMs: number;
  /** Turns shorter than this are dropped as noise. */
  minSpeechMs: number;
  /** Longest turn sent as one piece. */
  maxMs: number;
}

export interface TurnEnd {
  pcm: Int16Array;
  /** How long ago, in ms, the speech itself ended (the quiet run that confirmed the end). */
  endedAgoMs: number;
}

const DEFAULTS: TurnDetectorOptions = { sampleRate: 16000, startMs: 160, endMs: 1000, prerollMs: 800, minSpeechMs: 350, maxMs: 25000 };

export class TurnDetector {
  private o: TurnDetectorOptions;
  private floor = 0;
  private speaking = false;
  private loudMs = 0;
  private quietMs = 0;
  private speechMs = 0;
  private pre: Int16Array[] = [];
  private seg: Int16Array[] = [];

  constructor(private onStart: () => void, private onEnd: (t: TurnEnd) => void, opts: Partial<TurnDetectorOptions> = {}) {
    this.o = { ...DEFAULTS, ...opts };
  }

  /** RMS level of a frame, 0 to 1. */
  static level(frame: Int16Array): number {
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i]! * frame[i]!;
    return frame.length ? Math.sqrt(sum / frame.length) / 32768 : 0;
  }

  get threshold(): number {
    return Math.max(0.012, this.floor * 3.5);
  }

  push(frame: Int16Array): void {
    const ms = (frame.length / this.o.sampleRate) * 1000;
    const rms = TurnDetector.level(frame);
    if (!this.speaking) {
      // Track the room's noise floor while nobody is speaking: falls fast, rises slowly.
      this.floor = this.floor === 0 ? rms : rms < this.floor ? 0.8 * this.floor + 0.2 * rms : 0.995 * this.floor + 0.005 * rms;
      this.pre.push(frame);
      let kept = this.pre.reduce((n, f) => n + f.length, 0);
      while (this.pre.length > 1 && (kept - this.pre[0]!.length) / this.o.sampleRate * 1000 >= this.o.prerollMs) kept -= this.pre.shift()!.length;
      this.loudMs = rms > this.threshold ? this.loudMs + ms : 0;
      if (this.loudMs >= this.o.startMs) {
        this.speaking = true;
        this.seg = [...this.pre];
        this.pre = [];
        this.speechMs = this.loudMs;
        this.quietMs = 0;
        this.onStart();
      }
      return;
    }
    this.seg.push(frame);
    this.speechMs += ms;
    this.quietMs = rms < this.threshold * 0.7 ? this.quietMs + ms : 0;
    if (this.quietMs >= this.o.endMs || this.speechMs >= this.o.maxMs) this.finish();
  }

  /** Ends the current turn now, if one is in progress (for example when listening stops). */
  flush(): void {
    if (this.speaking) this.finish();
  }

  private finish(): void {
    const endedAgoMs = this.quietMs;
    const voiced = this.speechMs - this.quietMs;
    const total = this.seg.reduce((n, f) => n + f.length, 0);
    const pcm = new Int16Array(total);
    let off = 0;
    for (const f of this.seg) {
      pcm.set(f, off);
      off += f.length;
    }
    this.speaking = false;
    this.seg = [];
    this.loudMs = 0;
    this.quietMs = 0;
    this.speechMs = 0;
    if (voiced >= this.o.minSpeechMs) this.onEnd({ pcm, endedAgoMs });
  }
}
