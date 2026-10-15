// Hosted mode: the same Sarvam calls as the local server, as short streaming HTTP handlers that run
// on serverless platforms (Vercel functions), which cannot hold Kanth's long-lived WebSocket.
//
// A public URL spends the deployer's Sarvam credits, so every handler checks that the request comes from
// Kanth's own page, rate limits each visitor, and caps text and audio sizes. Voice cloning is not offered.
import type { IncomingMessage, ServerResponse } from "node:http";
import { config, keyPresent } from "./env.ts";
import { synthHttpStream, synthRest, type TtsParams } from "./bulbul.ts";
import { streamSuggestions } from "./suggest.ts";
import { transliterate } from "./translit.ts";
import { currentRoster } from "./roster.ts";
import { wavFromPcm } from "./pcm.ts";
import { clampProsody, toneById, type ToneId } from "../shared/tones.ts";
import { hasLatinWords, languageByCode, resolveSpeaker, type LangCode, type VoiceRef } from "../shared/voices.ts";
import { STT_SAMPLE_RATE, PCM_SAMPLE_RATE, type Profile, type Turn } from "../shared/protocol.ts";

type Req = IncomingMessage & { body?: unknown };
type Res = ServerResponse;

// Requests per visitor per minute, sized for real use: drafting while the partner talks can make up to four
// draft sets per line, each prespoken four times, and speech recognition sends rolling partials.
const LIMITS = { synth: 300, suggest: 120, stt: 120, translit: 60 } as const;
const buckets = new Map<string, { count: number; resetAt: number }>();

function visitor(req: Req): string {
  const fwd = String(req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim();
  return fwd || req.socket.remoteAddress || "unknown";
}

function rateLimited(req: Req, kind: keyof typeof LIMITS): boolean {
  const key = `${kind}:${visitor(req)}`;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    if (buckets.size > 5000) buckets.clear();
    return false;
  }
  b.count++;
  return b.count > LIMITS[kind];
}

/** Requests must come from Kanth's own page; requests without an Origin are rejected in hosted mode. */
function sameSite(req: Req): boolean {
  const origin = req.headers.origin;
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").toLowerCase();
  if (!origin) return false;
  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

function json(res: Res, code: number, body: unknown): void {
  if (res.headersSent) return void res.end();
  res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJson<T>(req: Req, limit: number): Promise<T> {
  if (req.body && typeof req.body === "object") return req.body as T;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new Error("request too large");
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

async function readRaw(req: Req, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new Error("request too large");
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

/** Shared checks. Returns false (after answering) when the request must not proceed. */
async function guard(req: Req, res: Res, kind: keyof typeof LIMITS): Promise<boolean> {
  if (req.method !== "POST") return json(res, 405, { error: "POST only" }), false;
  if (!sameSite(req)) return json(res, 403, { error: "Requests from other websites are not allowed." }), false;
  if (!keyPresent()) return json(res, 503, { error: "This deployment has no Sarvam key." }), false;
  if (rateLimited(req, kind)) return json(res, 429, { error: "Too many requests from this device. Wait a minute and try again." }), false;
  return true;
}

const isLang = (l: unknown): l is LangCode => typeof l === "string" && !!languageByCode(l);
const isTone = (t: unknown): t is ToneId => typeof t === "string" && ["warm", "firm", "urgent", "joking", "whisper"].includes(t);

/**
 * One entry point for every hosted endpoint, so a single warm function instance serves them all
 * (fewer cold starts) and the per-visitor limits are shared. The route arrives as ?fn= or the last path part.
 */
export async function handleApi(req: Req, res: Res): Promise<void> {
  const u = new URL(req.url ?? "/", "http://kanth");
  const fn = u.searchParams.get("fn") ?? u.pathname.split("/").filter(Boolean).pop() ?? "";
  switch (fn) {
    case "status":
      return handleStatus(req, res);
    case "synth":
      return handleSynth(req, res);
    case "suggest":
      return handleSuggest(req, res);
    case "stt":
      return handleStt(req, res);
    case "translit":
      return handleTranslit(req, res);
    default:
      return json(res, 404, { error: "unknown endpoint" });
  }
}

export async function handleStatus(_req: Req, res: Res): Promise<void> {
  json(res, 200, { hosted: true, keyPresent: keyPresent(), roster: currentRoster().speakers, version: "hosted" });
}

export async function handleSynth(req: Req, res: Res): Promise<void> {
  if (!(await guard(req, res, "synth"))) return;
  let body: { text?: string; lang?: string; voice?: VoiceRef; tone?: string };
  try {
    body = await readJson(req, 8_000);
  } catch (e) {
    return json(res, 400, { error: (e as Error).message });
  }
  const text = String(body.text ?? "").trim();
  if (!text || text.length > 400) return json(res, 400, { error: "Text must be 1 to 400 characters." });
  if (!isLang(body.lang) || !isTone(body.tone)) return json(res, 400, { error: "Unknown language or tone." });
  if (body.voice?.kind === "clone") return json(res, 403, { error: "Voice banking runs only in the local version." });
  const name = body.voice?.kind === "persona" && /^[a-z_]{2,40}$/.test(body.voice.name) ? body.voice.name : "shubh";
  const r = resolveSpeaker(currentRoster().speakers, name, body.lang, body.tone, { codeMixedEnglish: hasLatinWords(text) });
  const params: TtsParams = { text, lang: body.lang, model: r.model, speaker: r.speaker, prosody: clampProsody(toneById(body.tone).prosody) };
  const maxSamples = Math.round((3 + text.length * 0.3) * PCM_SAMPLE_RATE);
  let sent = 0;
  const sink = (pcm: Buffer) => {
    if (!res.headersSent) {
      res.writeHead(200, {
        "content-type": "application/octet-stream",
        "cache-control": "no-store",
        "x-kanth-model": r.model,
        "x-kanth-speaker": r.speaker,
        "x-kanth-substituted": r.substituted ? "1" : "0",
      });
    }
    if (sent >= maxSamples) return; // runaway audio guard
    const chunk = pcm.subarray(0, Math.max(0, maxSamples - sent) * 2);
    sent += chunk.length >> 1;
    if (chunk.length) res.write(chunk);
  };
  try {
    await synthHttpStream(params, sink);
  } catch (e) {
    if (res.headersSent) return void res.end();
    try {
      await synthRest(params, sink);
    } catch {
      return json(res, 502, { error: friendly((e as Error).message) });
    }
  }
  res.end();
}

export async function handleSuggest(req: Req, res: Res): Promise<void> {
  if (!(await guard(req, res, "suggest"))) return;
  let body: { turnId?: string; history?: Turn[]; partner?: { text?: string; lang?: string; who?: string }; profile?: Profile; tone?: string; keywords?: string };
  try {
    body = await readJson(req, 24_000);
  } catch (e) {
    return json(res, 400, { error: (e as Error).message });
  }
  const partnerText = String(body.partner?.text ?? "").slice(0, 500);
  if (!partnerText || !body.profile || !isTone(body.tone)) return json(res, 400, { error: "Missing partner text, profile or tone." });
  const history = (body.history ?? []).slice(-8).map((t) => ({ ...t, text: String(t.text).slice(0, 300) }));
  const turnId = String(body.turnId ?? "t").slice(0, 40);
  res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-store" });
  const line = (o: unknown) => res.write(`${JSON.stringify(o)}\n`);
  const t0 = performance.now();
  try {
    let count = 0;
    const stats = await streamSuggestions(
      {
        profile: body.profile,
        history,
        partner: { text: partnerText, lang: isLang(body.partner?.lang) ? body.partner.lang : undefined, who: String(body.partner?.who ?? "").slice(0, 40) || undefined },
        tone: body.tone,
        keywords: body.keywords ? String(body.keywords).slice(0, 60) : undefined,
      },
      (d) => {
        count++;
        line({ t: "suggestion", turnId, idx: d.idx, text: d.text, lang: d.lang, gloss: d.gloss, atMs: performance.now() - t0 });
      },
    );
    line({ t: "suggestions_done", turnId, count, firstTokenMs: stats.firstTokenMs, totalMs: stats.totalMs, model: stats.model });
  } catch (e) {
    line({ t: "error", id: turnId, scope: "llm", message: friendly((e as Error).message), fallback: "Showing your saved phrases. You can also type." });
  }
  res.end();
}

/** Batch speech recognition for the hosted demo: the partner's whole line, once it has ended. */
export async function handleStt(req: Req, res: Res): Promise<void> {
  if (!(await guard(req, res, "stt"))) return;
  // Raw 16 kHz PCM16 as the body (smaller to upload), language in the query. JSON with base64 also accepted.
  let body: { pcm?: string; lang?: string };
  let pcm: Buffer;
  try {
    if (String(req.headers["content-type"] ?? "").startsWith("application/octet-stream")) {
      pcm = await readRaw(req, 1_000_000);
      body = { lang: String(req.headers["x-kanth-lang"] ?? new URL(req.url ?? "/", "http://x").searchParams.get("lang") ?? "unknown") };
    } else {
      body = await readJson(req, 1_500_000);
      pcm = Buffer.from(String(body.pcm ?? ""), "base64");
    }
  } catch (e) {
    return json(res, 400, { error: (e as Error).message });
  }
  if (pcm.length < 3200 || pcm.length > STT_SAMPLE_RATE * 2 * 30) return json(res, 400, { error: "Audio must be 0.1 to 30 seconds." });
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(wavFromPcm(pcm, STT_SAMPLE_RATE))], { type: "audio/wav" }), "partner.wav");
  form.set("model", "saaras:v4");
  form.set("mode", "codemix");
  form.set("language_code", isLang(body.lang) ? body.lang : "unknown");
  const t0 = performance.now();
  try {
    const r = await fetch(`${config.apiBase}/speech-to-text`, {
      method: "POST",
      headers: { "api-subscription-key": config.sarvamKey },
      body: form,
      signal: AbortSignal.timeout(15000),
    });
    const j = (await r.json().catch(() => ({}))) as { transcript?: string; language_code?: string; error?: { message?: string } };
    if (!r.ok) return json(res, 502, { error: friendly(j.error?.message ?? `speech to text ${r.status}`) });
    json(res, 200, { text: j.transcript ?? "", language: j.language_code, ms: performance.now() - t0 });
  } catch (e) {
    json(res, 502, { error: friendly((e as Error).message) });
  }
}

export async function handleTranslit(req: Req, res: Res): Promise<void> {
  if (!(await guard(req, res, "translit"))) return;
  try {
    const body = await readJson<{ text?: string; lang?: string }>(req, 4_000);
    const text = String(body.text ?? "").slice(0, 500);
    if (!isLang(body.lang)) return json(res, 400, { error: "Unknown language." });
    json(res, 200, { text: await transliterate(text, body.lang) });
  } catch (e) {
    json(res, 502, { error: friendly((e as Error).message) });
  }
}

function friendly(message: string): string {
  if (/\b(401|403)\b|invalid api key|unauthor/i.test(message)) return "Sarvam rejected this deployment's API key.";
  if (/\b429\b|rate limit/i.test(message)) return "Sarvam is rate limiting this deployment. Try again in a moment.";
  return message;
}
