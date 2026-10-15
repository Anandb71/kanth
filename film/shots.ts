// Screenshots of Kanth for design review and the README. Needs the server running on :5173.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const base = process.env.KANTH_URL ?? "http://localhost:5173";
const out = process.argv[2] ?? "shots";
const theme = process.env.THEME ?? "light";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const width = Number(process.env.W ?? 1440), height = Number(process.env.H ?? 900);
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
await ctx.addInitScript((t) => localStorage.setItem("kanth.settings.v1", JSON.stringify({ theme: t })), theme);
const page = await ctx.newPage();
page.on("console", (m) => m.type() === "error" && console.log("console error:", m.text()));
await page.goto(base);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/home-${theme}.png` });
if (process.env.HOME_ONLY) { await browser.close(); process.exit(0); }
await page.goto(`${base}/?demo`);
await page.waitForTimeout(1500);
await page.evaluate(() => void (window as any).kanthDemo.run({ film: true }));
await page.waitForFunction(() => (window as any).kanth?.state.cards.length >= 4 && (window as any).kanth.state.cards.every((c: any) => c.ready), null, { timeout: 30000 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/talk-cards-${theme}.png` });
await page.waitForFunction(() => (window as any).kanthDemo?.state.phase === "done", null, { timeout: 90000 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/talk-done-${theme}.png` });
await browser.close();
console.log("saved to", out);
