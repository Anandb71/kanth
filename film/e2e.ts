// End-to-end checks of Kanth in a real browser, against any running copy:
//   local server  KANTH_URL=http://localhost:5173
//   hosted build  KANTH_URL=http://localhost:5190   (node scripts/serve-vercel-output.mjs 5190)
//   live site     KANTH_URL=https://kanth-nu.vercel.app
// Run from kanth/film: npx tsx e2e.ts [mic-clip.wav]. Exits non-zero if any check fails.
// Uses real Sarvam calls (about 3 demo runs' worth) except the fallback check, which blocks them.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

const base = process.env.KANTH_URL ?? "http://localhost:5190";
const micClip = process.argv[2];
const results: { name: string; ok: boolean; detail: string }[] = [];

async function check(name: string, fn: () => Promise<string>): Promise<void> {
  if (process.env.E2E_ONLY && !name.includes(process.env.E2E_ONLY)) return;
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: `${detail} (${((Date.now() - t0) / 1000).toFixed(1)} s)` });
  } catch (e) {
    results.push({ name, ok: false, detail: (e as Error).message.split("\n")[0]! });
  }
  const r = results[results.length - 1]!;
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${name}: ${r.detail}`);
}

async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw new Error(`${label}: ${(e as Error).message.split("\n")[0]}`);
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function open(browser: Browser, opts: { settings?: object; viewport?: { width: number; height: number } } = {}): Promise<{ ctx: BrowserContext; page: Page; errors: string[] }> {
  const ctx = await browser.newContext({ viewport: opts.viewport ?? { width: 1440, height: 900 }, permissions: ["microphone"] });
  if (opts.settings) await ctx.addInitScript((s) => localStorage.setItem("kanth.settings.v1", JSON.stringify(s)), opts.settings);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/ERR_BLOCKED|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  return { ctx, page, errors };
}

const runDemo = (page: Page) =>
  page.evaluate(async () => {
    const w = (window as any);
    w.kanthAudio.unlock();
    await w.kanthDemo.run({ film: true });
    return {
      demo: w.kanthDemo.state,
      me: w.kanth.state.history.filter((h: any) => h.who === "me").map((h: any) => h.text),
      metrics: w.kanth.state.metrics.filter((m: any) => m.partnerEndAt && !m.redraft).map((m: any) => ({ spec: !!m.speculative, audible: m.toAudibleMs, voiced: m.allReadyAt ? m.allReadyAt - m.partnerEndAt : null })),
    };
  });

const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });

await check("home: loads clean, links, no red alarm while loading", async () => {
  const { ctx, page, errors } = await open(browser);
  await page.goto(base);
  await page.waitForTimeout(250);
  const redEarly = await page.locator(".led.down, .led.no-key").count();
  await page.waitForTimeout(2000);
  const gh = await page.locator('a[href*="github.com/Anandb71/kanth"]').count();
  const credit = (await page.locator(".site-footer").innerText()).includes("Sarvam");
  await page.getByRole("button", { name: /Watch the (80 s )?film/ }).first().click();
  const video = await page.locator(".film-modal video").getAttribute("src");
  const head = await page.request.get(`${base}${video}`, { headers: { range: "bytes=0-1023" } });
  await ctx.close();
  assert(redEarly === 0, `${redEarly} red status lights during load`);
  assert(gh >= 1 && credit, "GitHub link or Sarvam credit missing");
  assert(head.ok(), `film ${video} returned ${head.status()}`);
  assert(errors.length === 0, `console errors: ${errors.join(" | ").slice(0, 200)}`);
  return `GitHub link, credit, film ${head.status()}`;
});

await check("demo: three scenes, four voiced replies each, instant voice", async () => {
  const { ctx, page, errors } = await open(browser);
  await page.goto(`${base}/?demo`);
  await page.waitForTimeout(2000);
  const r = await runDemo(page);
  await ctx.close();
  assert(r.demo.phase === "done", `demo ended in phase ${r.demo.phase}`);
  assert(!r.demo.replay, "fell back to the recorded run while the live service should be up");
  assert(r.me.length === 3, `${r.me.length} replies spoken, expected 3`);
  const slow = r.metrics.filter((m: any) => !(m.audible < 100));
  assert(!slow.length, `choice to voice over 100 ms: ${JSON.stringify(slow)}`);
  assert(errors.length === 0, `console errors: ${errors.join(" | ").slice(0, 200)}`);
  const spec = r.metrics.filter((m: any) => m.spec).length;
  return `replies: ${r.me.join(" / ")}; voiced before choice ${r.metrics.map((m: any) => Math.round(m.voiced)).join(", ")} ms after the line; ${spec} of ${r.metrics.length} drafted while the partner spoke`;
});

await check("steer and tone: a number redrafts, a tone redrafts", async () => {
  const { ctx, page } = await open(browser);
  await page.goto(`${base}/?demo`);
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const w = window as any; w.kanthAudio.unlock(); void w.kanthDemo.run(); });
  // Answer Amma with the first reply once she has finished, then wait for the doctor, who asks for a number.
  await step("wait 1", () => page.waitForFunction(() => { const w = window as any; return w.kanthDemo.state.phase === "waiting" && w.kanth.state.cards.length >= 4 && !w.kanth.state.drafting; }, null, { timeout: 40000 }));
  await page.waitForTimeout(700);
  await page.locator('[data-scan-item="cards"]').first().click();
  await step("wait 2", () => page.waitForFunction(() => { const w = window as any; return w.kanthDemo.state.scene === 1 && w.kanthDemo.state.phase === "waiting" && w.kanth.state.cards.length >= 4 && !w.kanth.state.drafting; }, null, { timeout: 60000 }));
  const before = await page.evaluate(() => (window as any).kanth.state.cards.map((c: any) => c.text).join("|"));
  await page.waitForTimeout(700);
  await page.locator('[data-scan-group="numbers"] button', { hasText: /^6$/ }).click();
  await step("wait 3", () => page.waitForFunction((b) => { const k = (window as any).kanth; return !k.state.drafting && k.state.cards.length >= 3 && k.state.cards.map((c: any) => c.text).join("|") !== b; }, before, { timeout: 30000 }));
  const steered = await page.evaluate(() => (window as any).kanth.state.cards.map((c: any) => c.text));
  const hasSix = steered.some((t: string) => /6|छह|छः|six/i.test(t));
  await page.waitForTimeout(700);
  await page.locator('.dial button[data-tone="urgent"]').click();
  await step("wait 4", () => page.waitForFunction((b) => { const k = (window as any).kanth; return !k.state.drafting && k.state.cards.length >= 3 && k.state.cards.map((c: any) => c.text).join("|") !== b; }, steered.join("|"), { timeout: 30000 }));
  const readout = await page.locator(".dial-readout").innerText();
  await page.evaluate(() => (window as any).kanthDemo.stop());
  await ctx.close();
  assert(hasSix, `no steered reply mentions 6: ${steered.join(" / ")}`);
  assert(readout.includes("1.22"), `tone readout did not change: ${readout}`);
  return `steered: ${steered[0]}; urgent pace 1.22`;
});

// A key switch selects on release; holding it never repeats (and a long hold jumps to the emergency phrases instead).
await check("scanning: a held switch says exactly one reply", async () => {
  const { ctx, page } = await open(browser, { settings: { access: "scan-auto", scanIntervalMs: 700 } });
  await page.goto(`${base}/?demo`);
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const w = window as any; w.kanthAudio.unlock(); void w.kanthDemo.run(); });
  await page.waitForFunction(() => { const k = (window as any).kanth; return k.state.partner?.final && k.state.cards.length >= 4 && !k.state.drafting && k.state.cards.every((c: any) => c.ready); }, null, { timeout: 40000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    for (let i = 0; i < 8; i++) window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", repeat: true, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }));
  });
  await page.waitForTimeout(2500);
  const spoken = await page.evaluate(() => (window as any).kanth.state.history.filter((h: any) => h.who === "me").length);
  await page.evaluate(() => (window as any).kanthDemo.stop());
  await ctx.close();
  assert(spoken === 1, `${spoken} replies spoken`);
  return "1 reply";
});

// No Sarvam needed: the replies are injected. A press on Suction must never be swallowed because new replies landed.
await check("scanning: highlight on Suction, replies change, press, Suction is spoken", async () => {
  const { ctx, page, errors } = await open(browser, { settings: { access: "scan-step", scanIntervalMs: 1200 } });
  await page.goto(`${base}/#talk`);
  await page.waitForSelector('[data-scan-item="urgent"]', { timeout: 15000 });
  await page.waitForTimeout(800);
  const key = (type: "keydown" | "keyup", k: string) => page.evaluate(([t, kk]) => window.dispatchEvent(new KeyboardEvent(t!, { key: kk!, bubbles: true })), [type, k]);
  // Hold the switch for 1.7 s: straight to the emergency phrases, nothing selected.
  await key("keydown", " ");
  await page.waitForTimeout(1700);
  await key("keyup", " ");
  const idx = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-scan-item="urgent"]')].findIndex((el) => /suction/i.test(el.dataset.phrase ?? "")));
  assert(idx >= 0, "no Suction phrase on the emergency board");
  for (let i = 0; i < idx; i++) await key("keydown", "ArrowRight");
  await page.waitForTimeout(600); // past the bounce lock from the hold, as a person would be
  const parked = await page.evaluate(() => document.querySelector<HTMLElement>(".scan-focus")?.dataset.phrase ?? null);
  assert(parked && /suction/i.test(parked), `highlight on ${parked}, not Suction`);
  const saidBefore = await page.evaluate(() => (window as any).kanth.state.history.filter((h: any) => h.who === "me").length);
  // New replies land, then the user presses at once.
  await page.evaluate(() => {
    const k = (window as any).kanth;
    k.partnerStarted("Amma", "ta-IN");
    k.set({ turnId: "te2e" });
    for (let i = 0; i < 4; i++) k.onMessage({ t: "suggestion", turnId: "te2e", idx: i, text: `test reply ${i + 1}`, gloss: `test reply ${i + 1}`, lang: "ta-IN", atMs: 0 });
  });
  await page.waitForTimeout(100);
  const stillParked = await page.evaluate(() => document.querySelector<HTMLElement>(".scan-focus")?.dataset.phrase ?? null);
  await key("keydown", " ");
  await page.waitForTimeout(120);
  await key("keyup", " ");
  await page.waitForTimeout(800);
  const said = await page.evaluate(() => (window as any).kanth.state.history.filter((h: any) => h.who === "me").map((h: any) => h.text));
  await page.evaluate(() => (window as any).kanth.stopSpeaking());
  await ctx.close();
  assert(stillParked && /suction/i.test(stillParked), `new replies moved the highlight to ${stillParked}`);
  assert(said.length === saidBefore + 1, `${said.length - saidBefore} things said, expected 1`);
  assert(/suction/i.test(said[said.length - 1] ?? ""), `said "${said[said.length - 1]}", not Suction`);
  // This check needs no server, so a missing socket is not a failure here.
  const pageErrors = errors.filter((e) => !/WebSocket/.test(e));
  assert(pageErrors.length === 0, `console errors: ${pageErrors.join(" | ").slice(0, 200)}`);
  return `said "${said[said.length - 1]}"`;
});

await check("offline: the emergency board speaks with no network", async () => {
  const { ctx, page } = await open(browser);
  await page.goto(`${base}/#talk`);
  await page.waitForFunction(() => document.querySelector('.phrase.urgent[data-ready="1"]') !== null, null, { timeout: 20000 });
  await ctx.setOffline(true);
  await page.waitForTimeout(500);
  const played = await page.evaluate(async () => {
    const w = window as any;
    w.kanthAudio.unlock();
    let n = 0;
    w.kanthAudio.onPlay(() => n++);
    (document.querySelector('.phrase.urgent[data-ready="1"]') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 1200));
    return { n, link: w.kanth.state.link };
  });
  await ctx.close();
  assert(played.n >= 1, "no audio played offline");
  return `played offline, link ${played.link}`;
});

// The recorded-run fallback belongs to the hosted site; locally the judge's own key is the live service.
if (!base.includes(":5173")) await check("fallback: with Sarvam unreachable, the demo replays a recorded run", async () => {
  const { ctx, page } = await open(browser);
  await ctx.route("**/api/**", (route) => route.abort());
  await ctx.route("**/ws", (route) => route.abort());
  await page.goto(`${base}/?demo`);
  await page.waitForTimeout(1500);
  const r = await runDemo(page);
  const note = await page.locator(".replay-note").count();
  await ctx.close();
  assert(r.demo.replay, "did not switch to the recorded run");
  assert(r.demo.phase === "done" && r.me.length === 3, `phase ${r.demo.phase}, ${r.me.length} replies`);
  assert(note >= 0, "no replay note");
  return `replayed: ${r.me.join(" / ")}`;
});

await check("phone: no sideways scroll, headline and buttons on the first screen", async () => {
  const { ctx, page } = await open(browser, { viewport: { width: 390, height: 844 } });
  await page.goto(base);
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    h1: document.querySelector("h1")!.getBoundingClientRect().top,
    btn: document.querySelector(".hero-actions .btn")!.getBoundingClientRect().bottom,
  }));
  const labels = await page.locator(".chip .lbl-short:visible").count();
  await ctx.close();
  assert(m.sw <= 390, `page is ${m.sw} px wide`);
  assert(m.h1 < 300 && m.btn < 844, `headline at ${Math.round(m.h1)} px, first button ends at ${Math.round(m.btn)} px`);
  assert(labels >= 3, `${labels} labelled status chips`);
  return `width ${m.sw}, headline at ${Math.round(m.h1)} px, button ends ${Math.round(m.btn)} px`;
});

if (micClip) {
  await check("microphone: speech becomes a turn and four replies", async () => {
    const micBrowser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${micClip}`] });
    const { ctx, page } = await open(micBrowser);
    await page.goto(`${base}/#talk`);
    await page.waitForTimeout(2000);
    await page.getByRole("button", { name: /Listen with microphone/ }).click();
    await page.waitForFunction(() => { const k = (window as any).kanth; return k.state.partner?.final && k.state.cards.length >= 4 && !k.state.drafting; }, null, { timeout: 40000 });
    await page.waitForTimeout(3000);
    const r = await page.evaluate(() => ({ heard: (window as any).kanth.state.partner.text, cards: (window as any).kanth.state.cards.map((c: any) => c.text) }));
    await ctx.close();
    await micBrowser.close();
    assert(/रोहित|Rohit/.test(r.heard), `heard: ${r.heard}`);
    return `heard "${r.heard}"; first reply "${r.cards[0]}"`;
  });
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed against ${base}`);

// Runs against a deployed copy are kept as evidence; local runs are not.
const host = new URL(base).hostname;
if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(host)) {
  const time = new Date().toISOString();
  const out = join(dirname(fileURLToPath(import.meta.url)), "..", "bench", "results", "e2e-live.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(results.map((r) => ({ name: r.name, ok: r.ok, detail: r.detail, base, time })), null, 2)}\n`);
  console.log(`wrote ${out}`);
}
process.exit(failed.length ? 1 : 0);
