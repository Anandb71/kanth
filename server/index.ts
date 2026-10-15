// Kanth server: serves the app, holds the Sarvam key, and bridges the browser to Sarvam.
import http from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { WebSocketServer } from "ws";
import { config, keyPresent } from "./env.ts";
import { TtsEngine, synthRest } from "./bulbul.ts";
import { Session } from "./session.ts";
import { currentRoster, refreshRoster } from "./roster.ts";
import { createVoice } from "./clone.ts";
import { wavFromPcm } from "./pcm.ts";
import { PCM_SAMPLE_RATE, type ServerMessage, type ServiceName, type ServiceState } from "../shared/protocol.ts";

const DEMO_REFERENCE_TEXT =
  "नमस्ते, मेरा नाम अर्जुन है। मैं Chennai में software engineer हूँ। सुबह filter coffee के बिना मेरा दिन शुरू नहीं होता, और Sunday को cricket देखना मुझे सबसे ज़्यादा पसंद है। Amma के हाथ का rasam, बस वही चाहिए।";

const VERSION = JSON.parse(readFileSync(resolve("package.json"), "utf8")).version as string;
const DIST = resolve("dist");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".txt": "text/plain; charset=utf-8",
};

const tts = new TtsEngine();
const sessions = new Set<Session>();
const lastStatus = new Map<ServiceName, { state: ServiceState; detail?: string }>();

function broadcastStatus(service: ServiceName, state: ServiceState, detail?: string): void {
  lastStatus.set(service, { state, detail });
  const msg: ServerMessage = { t: "status", service, state, detail };
  for (const s of sessions) s.send(msg);
}
tts.onState((state, detail) => broadcastStatus("tts", state, detail));

/**
 * Only this app's own page may use the server, so a website open in another tab cannot spend the key.
 * Requests without an Origin header (scripts, benchmarks) are allowed: they already run on this machine.
 */
function allowedOrigin(req: http.IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const o = new URL(origin);
    const host = (req.headers.host ?? "").toLowerCase();
    return o.host.toLowerCase() === host || ["localhost", "127.0.0.1", "[::1]"].includes(o.hostname) && o.port === String(config.port);
  } catch {
    return false;
  }
}

function sendJson(res: http.ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage, limit = 8 * 1024 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new Error("request too large");
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, path: string): Promise<boolean> {
  if (req.method !== "GET" && !allowedOrigin(req)) {
    sendJson(res, 403, { error: "Requests from other websites are not allowed." });
    return true;
  }
  if (req.method === "POST" && path === "/api/voices/create" && !(req.headers["content-type"] ?? "").startsWith("application/json")) {
    sendJson(res, 415, { error: "Send JSON." });
    return true;
  }
  if (path === "/api/status" && req.method === "GET") {
    sendJson(res, 200, {
      version: VERSION,
      keyPresent: keyPresent(),
      roster: { count: currentRoster().speakers.length, source: currentRoster().source },
      services: Object.fromEntries(lastStatus),
    });
    return true;
  }
  if (path === "/api/voices/demo-reference" && req.method === "POST") {
    // A reference clip spoken by a Bulbul persona, so the demo clones no real person's voice.
    try {
      const chunks: Buffer[] = [];
      await synthRest(
        { text: DEMO_REFERENCE_TEXT, lang: "hi-IN", model: "bulbul:v4-flash", speaker: "shubh_hi_customer", prosody: { pace: 1, pitch: 0, loudness: 1 } },
        (pcm) => chunks.push(pcm),
      );
      sendJson(res, 200, { audio: wavFromPcm(Buffer.concat(chunks), PCM_SAMPLE_RATE).toString("base64"), speaker: "shubh_hi_customer", text: DEMO_REFERENCE_TEXT });
    } catch (err) {
      sendJson(res, 502, { error: (err as Error).message });
    }
    return true;
  }
  if (path === "/api/voices/create" && req.method === "POST") {
    // Body: { consent: { speakerName, statement, at }, audio: base64 wav, name }
    try {
      const body = JSON.parse((await readBody(req)).toString("utf8")) as {
        consent?: { speakerName?: string; statement?: string; at?: string; demoReference?: boolean };
        audio?: string;
        name?: string;
      };
      if (!body.consent?.statement || !body.consent.at) {
        sendJson(res, 400, { error: "Consent is required before a voice can be banked." });
        return true;
      }
      if (!body.audio) {
        sendJson(res, 400, { error: "No reference audio received." });
        return true;
      }
      const voice = await createVoice(Buffer.from(body.audio, "base64"), body.name ?? "My voice", body.consent.demoReference ? "hi-IN" : "en-IN");
      console.log(`  Voice banked (${body.consent.demoReference ? "demo reference generated by Bulbul" : "consent recorded"}) at ${body.consent.at}`);
      sendJson(res, 200, voice);
    } catch (err) {
      sendJson(res, 502, { error: (err as Error).message });
    }
    return true;
  }
  return false;
}

function serveStatic(res: http.ServerResponse, urlPath: string): void {
  let rel = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  if (rel === "/" || !extname(rel)) rel = "/index.html";
  const file = normalize(join(DIST, rel));
  if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
    return;
  }
  const type = MIME[extname(file)] ?? "application/octet-stream";
  const immutable = rel.startsWith("/assets/");
  res.writeHead(200, {
    "content-type": type,
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
  });
  res.end(readFileSync(file));
}

async function main(): Promise<void> {
  let vite: import("vite").ViteDevServer | undefined;
  if (config.dev) {
    const { createServer } = await import("vite");
    vite = await createServer({ server: { middlewareMode: true, hmr: { port: config.port + 1 } }, appType: "spa" });
  } else if (!existsSync(join(DIST, "index.html"))) {
    console.error("No build found. Run `npm start` (it builds first) or `npm run dev`.");
    process.exit(1);
  }

  const server = http.createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0] ?? "/";
    void (async () => {
      if (path.startsWith("/api/")) {
        if (await handleApi(req, res, path)) return;
        sendJson(res, 404, { error: "unknown endpoint" });
        return;
      }
      if (vite) vite.middlewares(req, res, () => serveStatic(res, req.url ?? "/"));
      else serveStatic(res, req.url ?? "/");
    })().catch((err) => sendJson(res, 500, { error: (err as Error).message }));
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });
  server.on("upgrade", (req, socket, head) => {
    if ((req.url ?? "").startsWith("/ws")) {
      if (!allowedOrigin(req)) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        const s = new Session(ws, tts, VERSION);
        sessions.add(s);
        for (const [service, st] of lastStatus) s.send({ t: "status", service, state: st.state, detail: st.detail });
        ws.on("close", () => sessions.delete(s));
      });
    }
  });

  server.listen(config.port, config.host, () => {
    const url = `http://${config.host === "0.0.0.0" ? "localhost" : config.host}:${config.port}`;
    console.log(`\n  Kanth ${VERSION} is running at ${url}\n`);
    if (!keyPresent()) {
      console.log("  No SARVAM_API_KEY found. Add it to .env or run: SARVAM_API_KEY=sk_... npm start\n");
      broadcastStatus("tts", "no-key");
    }
  });

  if (keyPresent()) {
    const check = await refreshRoster();
    if (check === "rejected") {
      console.log("  Sarvam rejected this SARVAM_API_KEY. Check the key and restart.\n");
      broadcastStatus("tts", "no-key", "Sarvam rejected the key");
      return;
    }
    await tts.warm();
  }

  const shutdown = () => {
    tts.close();
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void main();
