// The live Bulbul v4 Flash speaker roster. Sarvam returns the full list in the 400 error
// for an unknown speaker, so we ask for it once at startup and fall back to a snapshot.
import { config } from "./env.ts";
import snapshot from "../shared/roster.json" with { type: "json" };

let roster: string[] = (snapshot as Record<string, unknown>)["bulbul:v4-flash"] as string[];
let source: "snapshot" | "live" = "snapshot";

export function currentRoster(): { speakers: string[]; source: "snapshot" | "live" } {
  return { speakers: roster, source };
}

export async function refreshRoster(): Promise<void> {
  if (!config.sarvamKey) return;
  try {
    const res = await fetch(`${config.apiBase}/text-to-speech`, {
      method: "POST",
      headers: { "api-subscription-key": config.sarvamKey, "content-type": "application/json" },
      body: JSON.stringify({ text: "नमस्ते", language_code: "hi-IN", model: "bulbul:v4-flash", speaker: "kanth_roster_probe" }),
      signal: AbortSignal.timeout(8000),
    });
    const body = (await res.json()) as { error?: { message?: string } };
    const msg = body.error?.message ?? "";
    const at = msg.indexOf("are:");
    if (res.status !== 400 || at < 0) return;
    const list = msg
      .slice(at + 4)
      .split(",")
      .map((s) => s.trim().replace(/\.$/, ""))
      .filter((s) => /^[a-z]+_[a-z]+_[a-z_]+$/.test(s));
    if (list.length > 50) {
      roster = list;
      source = "live";
    }
  } catch {
    // Keep the snapshot. The UI shows which source is in use.
  }
}
