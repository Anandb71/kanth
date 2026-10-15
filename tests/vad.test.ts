import { describe, expect, it } from "vitest";
import { TurnDetector, type TurnEnd } from "../web/src/lib/vad.ts";

const RATE = 16000;
const FRAME = 1365; // about 85 ms, like the microphone capture

function frame(amplitude: number, noise = 0.002): Int16Array {
  const f = new Int16Array(FRAME);
  for (let i = 0; i < FRAME; i++) f[i] = Math.round((Math.sin(i / 3) * amplitude + (Math.random() - 0.5) * noise) * 32767);
  return f;
}

function run(pattern: [number, number][]): { starts: number; ends: TurnEnd[] } {
  let starts = 0;
  const ends: TurnEnd[] = [];
  const d = new TurnDetector(() => starts++, (t) => ends.push(t), { sampleRate: RATE });
  for (const [amp, ms] of pattern) for (let t = 0; t < ms; t += (FRAME / RATE) * 1000) d.push(frame(amp));
  return { starts, ends };
}

describe("turn detection for the hosted microphone", () => {
  it("ignores a quiet room", () => {
    const r = run([[0, 3000]]);
    expect(r.starts).toBe(0);
    expect(r.ends).toHaveLength(0);
  });

  it("finds one turn: speech, then a pause", () => {
    const r = run([[0, 1000], [0.2, 1500], [0, 1500]]);
    expect(r.starts).toBe(1);
    expect(r.ends).toHaveLength(1);
    const secs = r.ends[0]!.pcm.length / RATE;
    expect(secs).toBeGreaterThan(1.5); // the speech plus preroll and the confirming pause
    expect(secs).toBeLessThan(3.5);
    expect(r.ends[0]!.endedAgoMs).toBeGreaterThanOrEqual(1000);
  });

  it("drops a short click", () => {
    const r = run([[0, 1000], [0.3, 100], [0, 1500]]);
    expect(r.ends).toHaveLength(0);
  });

  it("separates two turns with a pause between them", () => {
    const r = run([[0, 800], [0.2, 1000], [0, 1500], [0.2, 900], [0, 1500]]);
    expect(r.ends).toHaveLength(2);
  });
});
