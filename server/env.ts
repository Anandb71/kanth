// Loads configuration from the environment and an optional .env file.
// The Sarvam key is read here and never leaves the server process.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv(path: string): void {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const name = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[name] === undefined) process.env[name] = value;
  }
}

loadDotEnv(resolve(process.cwd(), ".env"));

export const config = {
  sarvamKey: (process.env.SARVAM_API_KEY ?? "").trim(),
  port: Number(process.env.PORT ?? 5173),
  host: process.env.HOST ?? "127.0.0.1",
  apiBase: process.env.SARVAM_API_BASE ?? "https://api.sarvam.ai",
  wsBase: process.env.SARVAM_WS_BASE ?? "wss://api.sarvam.ai",
  /** Warm Bulbul sockets kept open. Four lets all four suggestions synthesize at once. */
  ttsPoolSize: Number(process.env.KANTH_TTS_POOL ?? 4),
  chatModel: process.env.KANTH_CHAT_MODEL ?? "sarvam-105b-conversations",
  dev: process.argv.includes("--dev"),
};

export function keyPresent(): boolean {
  return config.sarvamKey.length > 10;
}
