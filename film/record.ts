// Records the Kanth demo film and builds the README media from it.
//
// Before: the server is running on :5173 (or set KANTH_URL), and the client is built with your latest web changes
// (`npx vite build` in kanth/; the server serves kanth/dist and needs no restart for client changes).
//
// Run from kanth/film:
//   npx tsx record.ts --clean   record a take (~20 Bulbul + 4 LLM calls, about 2 to 3 minutes), build everything,
//                               then delete the frames. This is the one command for a final take.
//   npx tsx record.ts           same, but keep the frames in film/.frames so the media can be rebuilt
//   npx tsx record.ts build     rebuild the media from the kept frames, no API calls
//   npx tsx record.ts clean     delete film/.frames
// (`npm run record -- --clean` is the same as the first line.)
//
// It prints a JSON report: duration, sizes, the audio offset applied, and the time of every utterance and caption.
// Uses full Chromium if it can start, otherwise the Playwright headless shell (same rendering, same screencast).
//
// The take is the app's own ?film mode. Video comes from the CDP screencast (every composited frame, with its
// wall-clock timestamp). Sound is rebuilt sample-exact from the app's film log, which records the wall-clock
// start of every utterance it played, so picture and sound share one clock.
// Outputs: ../docs/media/kanth-demo.mp4, kanth-demo.srt, kanth-demo.gif, poster.png.
import { chromium, type Browser } from "playwright";
import ffmpegStatic from "ffmpeg-static";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRAMES = join(HERE, ".frames");
const TAKE = join(FRAMES, "take.json");
const MEDIA = join(HERE, "..", "docs", "media");
const BASE = process.env.KANTH_URL ?? "http://localhost:5173";
const FFMPEG = ffmpegStatic as unknown as string;
const W = 1920;
const H = 1080;
/** The video opens this long before the black overlay starts to fade: the human moment, not the loading. */
const LEAD_MS = 400;
const FPS = 30;
const SR = 24000;

interface Frame { n: number; ts: number; rx: number }
interface LogEntry { id: string; channel: "me" | "partner"; epochMs: number; sampleRate: number; pcm: string }
interface Mark { epochMs: number; key: string; value: unknown }
interface Take {
  frames: Frame[];
  log: LogEntry[];
  marks: Mark[];
  readyAt?: number;
  readyPolledAt?: number;
  doneAt?: number;
  clockSkewMs: number;
  /** AudioContext base + output latency: how long after play() the sound reached the speakers live. */
  outputLatencyMs?: number;
  browser: string;
  metrics: unknown[];
  history: unknown[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const name = (n: number) => `${String(n).padStart(6, "0")}.jpg`;

function ffmpeg(args: string[], cwd = HERE, input?: Buffer): Buffer {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", ...args], { cwd, input, maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg failed (${r.status}): ${r.stderr?.toString().slice(-2000)}`);
  return r.stdout;
}

// ---------------------------------------------------------------- record

async function launch(): Promise<Browser> {
  const args = ["--autoplay-policy=no-user-gesture-required"];
  try {
    return await chromium.launch({ channel: "chromium", args });
  } catch (e) {
    console.log(`full Chromium unavailable (${String(e).split("\n")[0]}); using the headless shell`);
    return chromium.launch({ args });
  }
}

async function record(): Promise<void> {
  rmSync(FRAMES, { recursive: true, force: true });
  mkdirSync(FRAMES, { recursive: true });
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && console.log(`  [page ${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => console.log(`  [page exception] ${e.message}`));

  const cdp = await context.newCDPSession(page);
  const frames: Frame[] = [];
  const writes: Promise<void>[] = [];
  cdp.on("Page.screencastFrame", (f) => {
    const rx = Date.now();
    void cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    const n = frames.length + 1;
    frames.push({ n, ts: f.metadata.timestamp ? f.metadata.timestamp * 1000 : rx, rx });
    writes.push(writeFile(join(FRAMES, name(n)), Buffer.from(f.data, "base64")));
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });

  await page.goto(`${BASE}/?film`);
  const start = Date.now();
  let readyPolledAt: number | undefined;
  let wentOffline = false;
  let seen = 0;
  for (;;) {
    if (Date.now() - start > 240_000) throw new Error("the take did not finish within 4 minutes");
    const s = await page.evaluate(() => {
      const w = window as any;
      return { ready: !!w.__filmReady, offline: !!w.__filmWantsOffline, done: !!w.__filmDone, marks: (w.__filmMarks ?? []) as Mark[] };
    });
    if (s.ready && !readyPolledAt) readyPolledAt = Date.now();
    for (const m of s.marks.slice(seen)) {
      const v = m.value as any;
      const what = m.key === "caption" ? (v ? `${v.who}: ${v.line}` : "-") : m.key === "story" ? (v ? v.title : "-") : m.key === "end" ? (v ? v.lines.join(" | ") : "-") : JSON.stringify(v);
      console.log(`  ${((m.epochMs - start) / 1000).toFixed(1).padStart(6)}s ${m.key.padEnd(7)} ${what}`);
    }
    seen = s.marks.length;
    if (s.offline && !wentOffline) {
      await context.setOffline(true);
      wentOffline = true;
      console.log("  network cut (context offline)");
    }
    if (s.done) break;
    await sleep(100);
  }
  const doneAt = Date.now();
  await sleep(300);

  const out = await page.evaluate(() => {
    const w = window as any;
    return {
      log: w.kanthAudio.exportFilmLog() as LogEntry[],
      marks: w.__filmMarks as Mark[],
      readyAt: w.__filmReadyAt as number | undefined,
      clockSkewMs: Date.now() - (performance.timeOrigin + performance.now()),
      outputLatencyMs: ((w.kanthAudio.ctx?.baseLatency ?? 0) + (w.kanthAudio.ctx?.outputLatency ?? 0)) * 1000,
      metrics: w.kanth.state.metrics,
      history: w.kanth.state.history.map((h: any) => ({ who: h.who, speaker: h.speaker, text: h.text, gloss: h.gloss, via: h.via })),
    };
  });
  await cdp.send("Page.stopScreencast");
  await Promise.all(writes);
  await context.setOffline(false);
  const version = browser.version();
  await browser.close();

  const take: Take = { frames, ...out, readyPolledAt, doneAt, browser: version };
  writeFileSync(TAKE, JSON.stringify(take));
  console.log(`recorded ${frames.length} frames over ${((frames.at(-1)!.ts - frames[0]!.ts) / 1000).toFixed(1)} s; ${out.log.length} utterances`);
}

// ---------------------------------------------------------------- build

function wav(samples: Float32Array, rate: number): Buffer {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + samples.length * 2, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i]! * 32767))), 44 + i * 2);
  return b;
}

function pcmOf(e: LogEntry): Float32Array {
  const raw = Buffer.from(e.pcm, "base64");
  const out = new Float32Array(raw.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = raw.readInt16LE(i * 2) / 32768;
  return out;
}

function srtTime(ms: number): string {
  const t = Math.max(0, Math.round(ms));
  const h = Math.floor(t / 3600000), m = Math.floor((t % 3600000) / 60000), s = Math.floor((t % 60000) / 1000), x = t % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(x).padStart(3, "0")}`;
}

/** Mean luma (0-255) of each listed frame, from a 32x18 grayscale thumbnail of a crop. */
function luma(frames: Frame[], crop?: string): number[] {
  if (!frames.length) return [];
  const list = join(FRAMES, "probe.txt");
  writeFileSync(list, frames.map((f) => `file '${name(f.n)}'\nduration 0.04\n`).join(""));
  const vf = `${crop ? `crop=${crop},` : ""}scale=32:18,format=gray`;
  const raw = ffmpeg(["-f", "concat", "-safe", "0", "-i", "probe.txt", "-vf", vf, "-fps_mode", "passthrough", "-f", "rawvideo", "-"], FRAMES);
  const per = 32 * 18;
  const out: number[] = [];
  for (let i = 0; i + per <= raw.length; i += per) {
    let s = 0;
    for (let k = 0; k < per; k++) s += raw[i + k]!;
    out.push(s / per);
  }
  return out;
}

function build(): void {
  if (!existsSync(TAKE)) throw new Error("no take recorded yet; run without arguments first");
  mkdirSync(MEDIA, { recursive: true });
  const take = JSON.parse(readFileSync(TAKE, "utf8")) as Take;
  const frames = [...take.frames].sort((a, b) => a.ts - b.ts);
  const fadeAt = take.marks.find((m) => m.key === "black" && m.value === false)?.epochMs ?? (take.readyAt ?? frames[0]!.ts) + 600;
  const doneAt = take.marks.find((m) => m.key === "done" && m.value === true)?.epochMs ?? take.doneAt ?? frames.at(-1)!.ts;
  const t0 = fadeAt - LEAD_MS;

  // Video: each screencast frame is held until the next one arrives (the screencast only emits on change).
  let first = frames.findIndex((f) => f.ts > t0) - 1;
  if (first < 0) first = 0;
  const used = frames.slice(first).filter((f) => f.ts <= doneAt);
  const lines: string[] = [];
  for (let i = 0; i < used.length; i++) {
    const from = Math.max(used[i]!.ts, t0);
    const to = i + 1 < used.length ? used[i + 1]!.ts : from + 1000;
    lines.push(`file '${name(used[i]!.n)}'`, `duration ${((to - from) / 1000).toFixed(6)}`);
  }
  lines.push(`file '${name(used.at(-1)!.n)}'`);
  writeFileSync(join(FRAMES, "frames.txt"), lines.join("\n") + "\n");
  const durMs = used.at(-1)!.ts + 1000 - t0;
  const durS = durMs / 1000;

  // Display latency: the page logs a state change before the screencast shows it. Measure it on the fade-in
  // (the black overlay starts its 900 ms ease transition at the logged moment) and delay the sound by the same
  // amount, so picture and sound keep the relation they had live. The ease curve keeps the first frame of the
  // transition under the threshold, so the transition began about half a frame before the last unchanged frame.
  const early = used.filter((f) => f.ts < fadeAt + 1200);
  const lum = luma(early);
  const base = lum[0] ?? 0;
  const onsetIdx = lum.findIndex((l) => l > base + 1.5);
  const onsetMs = onsetIdx >= 0 ? early[onsetIdx]!.ts - fadeAt : NaN;
  const prevMs = onsetIdx > 0 ? early[onsetIdx - 1]!.ts - fadeAt : NaN;
  const audioDelayMs = Number.isFinite(prevMs) ? Math.min(100, Math.max(0, prevMs - 8)) : 50;

  // Sound: every utterance at its logged start plus that display latency.
  // A new utterance on a channel cuts off the previous one, as in the app.
  const mix = new Float32Array(Math.ceil(durS * SR));
  const log = [...take.log].sort((a, b) => a.epochMs - b.epochMs);
  const placed: { id: string; channel: string; startMs: number; endMs: number }[] = [];
  for (let i = 0; i < log.length; i++) {
    const e = log[i]!;
    if (e.sampleRate !== SR) throw new Error(`unexpected sample rate ${e.sampleRate}`);
    let pcm = pcmOf(e);
    const next = log.slice(i + 1).find((x) => x.channel === e.channel);
    if (next) pcm = pcm.subarray(0, Math.max(0, Math.round(((next.epochMs - e.epochMs) / 1000) * SR)));
    const at = Math.round(((e.epochMs + audioDelayMs - t0) / 1000) * SR);
    for (let k = Math.max(0, -at); k < pcm.length && at + k < mix.length; k++) mix[at + k]! += pcm[k]!;
    placed.push({ id: e.id, channel: e.channel, startMs: e.epochMs + audioDelayMs - t0, endMs: e.epochMs + audioDelayMs - t0 + (pcm.length / SR) * 1000 });
    if (!pcm.length) console.warn(`  warning: utterance ${e.id} has no audio`);
  }
  let peak = 0;
  for (let i = 0; i < mix.length; i++) {
    const a = Math.abs(mix[i]!);
    if (a > 0.95) mix[i] = Math.sign(mix[i]!) * (0.95 + 0.05 * Math.tanh((a - 0.95) / 0.05));
    peak = Math.max(peak, a);
  }
  writeFileSync(join(FRAMES, "sound.wav"), wav(mix, SR));

  const mp4 = join(MEDIA, "kanth-demo.mp4");
  const fadeOut = Math.max(0, durS - 0.6).toFixed(3);
  ffmpeg([
    "-y", "-f", "concat", "-safe", "0", "-i", "frames.txt", "-i", "sound.wav",
    "-vf", `fps=${FPS},fade=t=out:st=${fadeOut}:d=0.6,format=yuv420p`, "-af", `afade=t=out:st=${fadeOut}:d=0.6`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-t", durS.toFixed(3), "-movflags", "+faststart", mp4,
  ], FRAMES);

  // Subtitles: exactly the captions the film burned in, from the moment each appeared until it was cleared.
  const caps = take.marks.filter((m) => m.key === "caption");
  const srt: string[] = [];
  for (let i = 0; i < caps.length; i++) {
    const v = caps[i]!.value as { who: string; line: string } | null;
    if (!v) continue;
    const end = caps[i + 1]?.epochMs ?? doneAt;
    srt.push(`${srt.length / 4 + 1}`, `${srtTime(caps[i]!.epochMs - t0)} --> ${srtTime(Math.min(end, t0 + durMs) - t0)}`, `${v.who}: ${v.line}`, "");
  }
  writeFileSync(join(MEDIA, "kanth-demo.srt"), srt.join("\r\n"));

  // README GIF: Amma speaking through Arjun's first reply. It has no sound, so it starts once the fade-in is done
  // (the overlay's transition is 900 ms) with her caption already up.
  const amma = placed.find((p) => p.channel === "partner");
  const reply = placed.find((p) => p.channel === "me");
  const gifFrom = Math.max(LEAD_MS + 900, (amma?.startMs ?? 1000) - 300) / 1000;
  const gifTo = Math.min(durS, ((reply?.endMs ?? 14000) + 500) / 1000);
  const gif = join(MEDIA, "kanth-demo.gif");
  ffmpeg([
    "-y", "-ss", gifFrom.toFixed(3), "-t", (gifTo - gifFrom).toFixed(3), "-i", mp4,
    "-vf", "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
    "-loop", "0", gif,
  ]);

  // Poster: the four voiced replies, just before the simulated user starts scanning in the first scene.
  const storyMarks = take.marks.filter((m) => m.key === "story");
  const firstStoryOff = storyMarks.find((m, i) => m.value === null && i > 0 && storyMarks[i - 1]!.value !== null);
  const posterAt = (firstStoryOff?.epochMs ?? t0 + 12000) + 700;
  const pf = frames.filter((f) => f.ts <= posterAt).at(-1)!;
  ffmpeg(["-y", "-i", name(pf.n), "-frames:v", "1", join(MEDIA, "poster.png")], FRAMES);

  // The second caption: the first one appears while the black overlay is still fading, which skews the luma.
  const ammaCap = caps.filter((m) => m.value)[1];
  let capOnset = NaN;
  if (ammaCap) {
    const near = used.filter((f) => f.ts > ammaCap.epochMs - 300 && f.ts < ammaCap.epochMs + 600);
    const l = luma(near, "600:60:660:960");
    const b0 = l[0] ?? 0;
    const full = b0 - (l.at(-1) ?? b0);
    const k = l.findIndex((x) => b0 - x > Math.max(1.5, full * 0.1));
    capOnset = k >= 0 ? near[k]!.ts - ammaCap.epochMs : NaN;
  }
  const lat = take.frames.map((f) => f.rx - f.ts).sort((a, b) => a - b);
  const intervals = used.slice(1).map((f, i) => f.ts - used[i]!.ts).sort((a, b) => a - b);

  const size = (p: string) => `${(statSync(p).size / 1024 / 1024).toFixed(2)} MB`;
  const probe = spawnSync(FFMPEG, ["-hide_banner", "-i", mp4], { encoding: "utf8" }).stderr;
  const report = {
    browser: take.browser,
    frames: { total: take.frames.length, used: used.length, medianIntervalMs: intervals[intervals.length >> 1], p95IntervalMs: intervals[Math.floor(intervals.length * 0.95)] },
    durationS: +durS.toFixed(2),
    ffprobe: probe.split("\n").filter((l) => /Duration|Stream/.test(l)).map((l) => l.trim()),
    sizes: { mp4: size(mp4), gif: size(gif), poster: size(join(MEDIA, "poster.png")) },
    gif: { fromS: +gifFrom.toFixed(2), toS: +gifTo.toFixed(2) },
    posterAtS: +((pf.ts - t0) / 1000).toFixed(2),
    sync: {
      pageClockMinusPerfClockMs: +take.clockSkewMs.toFixed(2),
      screencastReceiptMinusTimestampMs: { median: lat[lat.length >> 1], max: lat.at(-1) },
      fadeStartS: LEAD_MS / 1000,
      audioDelayMs: +audioDelayMs.toFixed(1),
      audioContextReportedLatencyMs: take.outputLatencyMs,
      fadeVisibleOnsetAfterLogMs: { firstChangedFrame: +onsetMs.toFixed(1), frameBefore: +prevMs.toFixed(1) },
      firstCaptionVisibleAfterLogMs: +capOnset.toFixed(1),
      readyPolledMinusReadyLoggedMs: take.readyPolledAt && take.readyAt ? Math.round(take.readyPolledAt - take.readyAt) : undefined,
      peakBeforeLimiter: +peak.toFixed(3),
    },
    utterances: placed.map((p) => ({ id: p.id, ch: p.channel, startS: +(p.startMs / 1000).toFixed(3), endS: +(p.endMs / 1000).toFixed(3) })),
    captions: srt.filter((_, i) => i % 4 === 1 || i % 4 === 2),
  };
  writeFileSync(join(FRAMES, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

const args = process.argv.slice(2);
const mode = args.find((a) => !a.startsWith("--")) ?? "all";
if (mode === "clean") rmSync(FRAMES, { recursive: true, force: true });
else {
  if (mode !== "build") await record();
  build();
  if (args.includes("--clean")) rmSync(FRAMES, { recursive: true, force: true });
}
