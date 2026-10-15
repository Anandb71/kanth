// Drafts four replies the user might want to say next, streamed so each one can be
// prespoken the moment it is complete. Uses Sarvam chat completions with thinking off.
import { config } from "./env.ts";
import type { Profile, Turn } from "../shared/protocol.ts";
import type { LangCode } from "../shared/voices.ts";
import { detectScriptLanguage, languageByCode } from "../shared/voices.ts";
import type { ToneId } from "../shared/tones.ts";
import { toneById } from "../shared/tones.ts";

export interface Draft {
  idx: number;
  text: string;
  gloss: string;
  lang: LangCode;
}

export interface SuggestOptions {
  profile: Profile;
  history: Turn[];
  partner: { text: string; lang?: LangCode; who?: string };
  tone: ToneId;
  count?: number;
  model?: string;
  signal?: AbortSignal;
}

export interface SuggestStats {
  firstTokenMs: number;
  totalMs: number;
  model: string;
}

const SEP = "|||";

/** One format example per reply language, so the example never pulls in another language. */
const FORMAT_EXAMPLES: Partial<Record<LangCode, string>> = {
  "ta-IN": `இன்னும் இல்லம்மா, பத்து நிமிஷம் ஆகட்டும் ${SEP} Not yet Amma, give it ten minutes`,
  "hi-IN": `आज थोड़ा better है, Doctor ${SEP} A little better today, Doctor`,
  "en-IN": `Give me ten minutes, I'll be ready ${SEP} Give me ten minutes, I'll be ready`,
  "bn-IN": `একটু পরে খাব, Ma ${SEP} I'll eat a little later, Ma`,
  "te-IN": `ఇంకా పది నిమిషాలు, Amma ${SEP} Ten more minutes, Amma`,
  "kn-IN": `ಇನ್ನೂ ಹತ್ತು ನಿಮಿಷ, Amma ${SEP} Ten more minutes, Amma`,
  "mr-IN": `अजून दहा मिनिटं, Aai ${SEP} Ten more minutes, Aai`,
  "gu-IN": `હજી દસ મિનિટ, Mummy ${SEP} Ten more minutes, Mummy`,
  "pa-IN": `ਹਾਲੇ ਦਸ ਮਿੰਟ, Mummy ${SEP} Ten more minutes, Mummy`,
  "ml-IN": `ഇനിയും പത്ത് മിനിറ്റ്, Amma ${SEP} Ten more minutes, Amma`,
  "od-IN": `ଆଉ ଦଶ ମିନିଟ, Maa ${SEP} Ten more minutes, Maa`,
};

/** The language replies should be in: what the partner spoke, else the user's first language. */
export function replyLanguage(o: Pick<SuggestOptions, "partner" | "profile">): LangCode {
  return o.partner.lang ?? detectScriptLanguage(o.partner.text) ?? o.profile.languages[0] ?? "en-IN";
}

/** True if text uses an Indic script other than the reply language's (Latin is always allowed). */
export function hasForeignScript(text: string, lang: LangCode): boolean {
  for (const ch of text) {
    const l = detectScriptLanguage(ch);
    if (l && l !== "en-IN" && l !== lang) return true;
  }
  return false;
}

export function buildMessages(o: SuggestOptions): { role: "system" | "user"; content: string }[] {
  const p = o.profile;
  const n = o.count ?? 4;
  const tone = toneById(o.tone);
  const langs = p.languages.map((c) => languageByCode(c)?.name ?? c).join(", ");
  const people = p.people.length
    ? p.people.map((x) => `${x.name} (${x.relation}): ${p.name} calls them "${x.addressAs}"`).join("; ")
    : "none given";
  const replyLang = replyLanguage(o);
  const replyLangName = languageByCode(replyLang)?.name ?? "English";

  const who = o.partner.who ?? "the other person";
  const system = [
    `You draft spoken replies for ${p.name}, who cannot speak aloud and talks through an app called Kanth.`,
    `${p.name} will choose one of your drafts and Kanth will say it aloud in ${p.name}'s own voice, so every draft must be something ${p.name} would really say, in first person, to ${who}.`,
    ``,
    `About ${p.name}: speaks ${langs}. Mixing style: ${p.mixStyle}. People: ${people}. Notes: ${p.notes || "none"}.`,
    ``,
    `Rules:`,
    `1. Write exactly ${n} different replies. Make them genuinely different choices, for example one agreeing, one declining or delaying, one asking something back, one sharing a need or feeling. Never four versions of the same answer.`,
    `2. Keep each reply short and spoken: 2 to 12 words, the way people actually talk at home, not written prose.`,
    `3. You are answering ${who} only. If you address them, use the name ${p.name} uses for ${who}. Never address anyone who is not in this conversation.`,
    `4. Every reply is in ${replyLangName}${replyLangName === "English" ? "" : `, with English words mixed in the way ${p.name} does`}. Use no other Indian language in this turn.`,
    `5. Script matters because a speech engine reads your text: ${replyLangName === "English" ? "plain English in Latin script." : `${replyLangName} words in ${replyLangName} script and English words in Latin script. Never romanize ${replyLangName}.`}`,
    `6. Tone for this turn: ${tone.wording}.`,
    `7. Do not invent facts about ${p.name}'s health or plans beyond what a natural reply needs.`,
    ``,
    `Output exactly ${n} lines and nothing else: no numbering, no tags, no quotes. Each line is the reply, then ${SEP}, then a short English meaning. Example of the line format:`,
    FORMAT_EXAMPLES[replyLang] ?? FORMAT_EXAMPLES["en-IN"]!,
  ].join("\n");

  const lines: string[] = [];
  const recent = o.history.slice(-8);
  if (recent.length) {
    lines.push("Conversation so far:");
    for (const t of recent) lines.push(`${t.who === "me" ? p.name : t.speaker ?? who}: ${t.text}`);
    lines.push("");
  }
  lines.push(`${who} just said: ${o.partner.text}`);
  lines.push("");
  lines.push(`Write ${n} replies for ${p.name}.`);
  return [
    { role: "system", content: system },
    { role: "user", content: lines.join("\n") },
  ];
}

/** Parses one output line into a draft, or returns null if it is not a usable reply. */
export function parseDraftLine(line: string, idx: number, fallbackLang: LangCode): Draft | null {
  let s = line.trim();
  if (!s) return null;
  s = s
    .replace(/<\/?[a-z_ ]+>/gi, " ")
    .replace(/^(\d+[.)]|[-*•>])\s*/, "")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .trim();
  let text = s;
  let gloss = "";
  const at = s.indexOf(SEP);
  if (at >= 0) {
    text = s.slice(0, at).trim();
    gloss = s.slice(at + SEP.length).trim();
  } else if (s.includes("||")) {
    const [a, b] = s.split("||");
    text = (a ?? "").trim();
    gloss = (b ?? "").trim();
  }
  text = text.replace(/^["'“”]+|["'“”]+$/g, "").trim();
  gloss = gloss.replace(/\|+\s*$/, "").replace(/^[>("'“”\s]+|[)"'“”\s]+$/g, "").trim();
  if (!text || text.length > 240) return null;
  if (/^(here are|replies|sure|output)/i.test(text)) return null;
  const lang = detectScriptLanguage(text) ?? fallbackLang;
  return { idx, text, gloss, lang };
}

/**
 * Streams drafts. Calls onDraft as each line completes. Resolves with timing stats.
 */
export async function streamSuggestions(o: SuggestOptions, onDraft: (d: Draft) => void): Promise<SuggestStats> {
  const model = o.model ?? config.chatModel;
  const t0 = performance.now();
  const res = await fetch(`${config.apiBase}/v1/chat/completions`, {
    method: "POST",
    headers: { "api-subscription-key": config.sarvamKey, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: buildMessages(o),
      stream: true,
      temperature: 0.7,
      top_p: 0.95,
      max_tokens: 400,
      reasoning_effort: null,
    }),
    signal: o.signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`chat ${res.status}: ${text.slice(0, 300)}`);
  }

  const fallbackLang = replyLanguage(o);
  const want = o.count ?? 4;
  let firstTokenMs = 0;
  let sse = "";
  let line = "";
  let emitted = 0;
  const seen = new Set<string>();
  const flushLine = (raw: string) => {
    if (emitted >= want) return;
    const d = parseDraftLine(raw, emitted, fallbackLang);
    if (!d || hasForeignScript(d.text, fallbackLang)) return;
    const key = d.text.replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    emitted++;
    onDraft(d);
  };

  const decoder = new TextDecoder();
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    sse += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = sse.indexOf("\n")) >= 0) {
      const ev = sse.slice(0, nl).trim();
      sse = sse.slice(nl + 1);
      if (!ev.startsWith("data:")) continue;
      const data = ev.slice(5).trim();
      if (data === "[DONE]") continue;
      let delta = "";
      try {
        const j = JSON.parse(data);
        delta = j.choices?.[0]?.delta?.content ?? "";
      } catch {
        continue;
      }
      if (!delta) continue;
      if (!firstTokenMs) firstTokenMs = performance.now() - t0;
      line += delta;
      let cut: number;
      while ((cut = line.indexOf("\n")) >= 0) {
        flushLine(line.slice(0, cut));
        line = line.slice(cut + 1);
      }
    }
  }
  if (line.trim()) flushLine(line);
  return { firstTokenMs, totalMs: performance.now() - t0, model };
}
