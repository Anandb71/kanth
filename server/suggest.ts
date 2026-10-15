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
  /** Words the user typed or picked to steer the drafts toward what they mean. */
  keywords?: string;
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
  "ta-IN": `இன்னும் பத்து நிமிஷம் ஆகட்டும் ${SEP} Give it ten more minutes`,
  "hi-IN": `आज थोड़ा better लग रहा है ${SEP} Feeling a little better today`,
  "en-IN": `Give me ten minutes, I'll be ready ${SEP} Give me ten minutes, I'll be ready`,
  "bn-IN": `একটু পরে খাব ${SEP} I'll eat a little later`,
  "te-IN": `ఇంకా పది నిమిషాలు ఆగు ${SEP} Wait ten more minutes`,
  "kn-IN": `ಇನ್ನೂ ಹತ್ತು ನಿಮಿಷ ಬೇಕು ${SEP} I need ten more minutes`,
  "mr-IN": `अजून दहा मिनिटं थांब ${SEP} Wait ten more minutes`,
  "gu-IN": `હજી દસ મિનિટ રાહ જુઓ ${SEP} Wait ten more minutes`,
  "pa-IN": `ਹਾਲੇ ਦਸ ਮਿੰਟ ਰੁਕੋ ${SEP} Wait ten more minutes`,
  "ml-IN": `ഇനിയും പത്ത് മിനിറ്റ് വേണം ${SEP} I need ten more minutes`,
  "od-IN": `ଆଉ ଦଶ ମିନିଟ ଅପେକ୍ଷା କର ${SEP} Wait ten more minutes`,
};

/** The language replies should be in: what the partner spoke, else the user's first language. */
export function replyLanguage(o: Pick<SuggestOptions, "partner" | "profile">): LangCode {
  return o.partner.lang ?? detectScriptLanguage(o.partner.text) ?? o.profile.languages[0] ?? "en-IN";
}

const ROMANIZED_INDIC = new Set([
  "haan", "han", "nahi", "nahin", "nahi.", "bhai", "kya", "hai", "hain", "accha", "achha", "acha", "theek", "thik", "chalo", "abhi",
  "mujhe", "mera", "meri", "tum", "tumhe", "aap", "aapka", "kal", "aaj", "raha", "rahi", "karo", "karna", "dena", "batao", "bilkul",
  "illa", "illai", "aama", "aamaa", "seri", "sari", "enna", "romba", "konjam", "vaa", "venum", "vendam", "saapten", "nalla",
]);

/** True if an Indian-language reply contains an Indian word written in Roman letters, which Bulbul reads badly. */
export function hasRomanizedIndic(text: string, lang: LangCode): boolean {
  if (lang === "en-IN") return false;
  return (text.toLowerCase().match(/[a-z]+/g) ?? []).some((w) => ROMANIZED_INDIC.has(w));
}

/** True when two replies say nearly the same thing (most of their words are shared). */
export function isNearDuplicate(a: string, b: string): boolean {
  const words = (t: string) => new Set(t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean));
  const A = words(a);
  const B = words(b);
  if (A.size < 3 || B.size < 3) return a.trim().toLowerCase() === b.trim().toLowerCase();
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.min(A.size, B.size) >= 0.85;
}

/** True if text uses an Indic script other than the reply language's (Latin is always allowed). */
export function hasForeignScript(text: string, lang: LangCode): boolean {
  for (const ch of text) {
    const l = detectScriptLanguage(ch);
    if (l && l !== "en-IN" && l !== lang) return true;
  }
  return false;
}

/** Not a letter or a combining mark: the edge of a word in any script. */
const EDGE_BEFORE = "(?<![\\p{L}\\p{M}])";
const EDGE_AFTER = "(?![\\p{L}\\p{M}])";

/**
 * True when the partner asks for a number, a score, a time or an amount (the same signal that shows the
 * 0 to 10 row, plus common "how much / what time" questions).
 */
export function asksForNumber(partnerText: string): boolean {
  return (
    /\p{Nd}|scale|one to ten|out of ten|दस|பத்து/iu.test(partnerText) ||
    /what time|how (much|many|long|often|old)|kitn[aei]|कितन[ाेी]|எத்தனை|எவ்வளவு|எத்தன/iu.test(partnerText)
  );
}

// Number words that are clear signals. Deliberately left out because they are usually not numbers:
// English "one", Hindi एक (also "a") and दो (also "give"), Tamil ஒன்று (also "something") and ஆறு (also "cool down").
const NUMBER_WORDS_WHOLE = [
  "zero", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "fifteen", "twenty", "thirty", "fifty", "hundred",
  "शून्य", "तीन", "चार", "पाँच", "पांच", "छह", "छः", "सात", "आठ", "नौ", "दस", "ग्यारह", "बारह", "पंद्रह", "बीस", "तीस", "पचास",
];
// Tamil adds case endings straight onto the number (பத்துக்கு), so these only need a word start.
const NUMBER_WORDS_PREFIX = ["பூஜ்ஜியம்", "இரண்டு", "ரெண்டு", "மூன்று", "மூணு", "நான்கு", "நாலு", "ஐந்து", "அஞ்சு", "ஏழு", "எட்டு", "ஒன்பது", "பத்து"];
const NUMBER_RE = new RegExp(
  `\\p{Nd}|${EDGE_BEFORE}(?:${NUMBER_WORDS_WHOLE.join("|")})${EDGE_AFTER}|${EDGE_BEFORE}(?:${NUMBER_WORDS_PREFIX.join("|")})`,
  "iu",
);

/** True if a draft (its text or its English meaning) states a number: digits in any script or a clear number word. */
export function statesNumber(text: string, gloss = ""): boolean {
  return NUMBER_RE.test(text) || NUMBER_RE.test(gloss);
}

/** True when the partner's name is missing or is the placeholder for a voice Kanth cannot name. */
export function isUnknownPartner(who: string | undefined): boolean {
  return !who?.trim() || /^(them|someone|unknown|the other person)$/i.test(who.trim());
}

/** Native-script spellings of common terms of address, so a Tamil "அம்மா" is caught like a Latin "Amma". */
const ADDRESS_VARIANTS: Record<string, string[]> = {
  amma: ["அம்மா", "अम्मा"],
  appa: ["அப்பா", "अप्पा"],
  doctor: ["டாக்டர்", "डॉक्टर", "डाक्टर"],
  maa: ["माँ", "मां"],
  papa: ["पापा"],
  bhai: ["भाई"],
  didi: ["दीदी"],
  anna: ["அண்ணா"],
  akka: ["அக்கா"],
};
/** Titles a draft must not use for someone whose name Kanth does not know. */
const GENERIC_TITLES = ["Amma", "Appa", "Maa", "Mummy", "Papa", "Doctor", "Bhai", "Didi", "Anna", "Akka", "Sir", "Madam", "Aunty", "Uncle", "Beta"];

function nameTerms(names: string[]): string[] {
  const out = new Set<string>();
  for (const raw of names) {
    const n = raw.trim();
    if (!n) continue;
    out.add(n);
    // "Dr. Mehra" is also "Mehra".
    for (const w of n.split(/[\s.]+/)) if (w.length >= 3 && !/^(dr|mr|mrs|ms|sri|shri)$/i.test(w)) out.add(w);
    for (const v of ADDRESS_VARIANTS[n.toLowerCase()] ?? []) out.add(v);
  }
  return [...out];
}

function mentions(text: string, term: string): boolean {
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${EDGE_BEFORE}${esc}${EDGE_AFTER}`, "iu").test(text);
}

/**
 * True if a draft names or addresses someone it should not: a person from the profile other than the current
 * partner (unless the partner's own line names them), or, when the partner is unknown, anyone at all.
 */
export function namesWrongPerson(
  draft: { text: string; gloss?: string },
  o: { profile: Pick<SuggestOptions["profile"], "people">; partner: Pick<SuggestOptions["partner"], "text" | "who">; keywords?: string },
): boolean {
  const said = `${draft.text} ${draft.gloss ?? ""}`;
  // A name the partner said, or one the user steered with, may be used.
  const context = `${o.partner.text} ${o.keywords ?? ""}`;
  const unknown = isUnknownPartner(o.partner.who);
  const who = (o.partner.who ?? "").trim().toLowerCase();
  const partnerPerson = unknown
    ? undefined
    : o.profile.people.find((x) => x.name.trim().toLowerCase() === who || x.addressAs.trim().toLowerCase() === who);
  const allowed = new Set(unknown ? [] : nameTerms([o.partner.who!, ...(partnerPerson ? [partnerPerson.name, partnerPerson.addressAs] : [])]).map((t) => t.toLowerCase()));
  // One group per person or title, so naming a person in any spelling allows every spelling of them.
  const groups = [
    ...o.profile.people.filter((x) => x !== partnerPerson).map((x) => nameTerms([x.name, x.addressAs])),
    ...(unknown ? GENERIC_TITLES.map((t) => nameTerms([t])) : []),
  ].map((g) => g.filter((t) => !allowed.has(t.toLowerCase())));
  return groups.some((g) => g.some((t) => mentions(said, t)) && !g.some((t) => mentions(context, t)));
}

export function buildMessages(o: SuggestOptions): { role: "system" | "user"; content: string }[] {
  const p = o.profile;
  const steering = !!o.keywords?.trim();
  // Steering with a word such as Yes does not give a number; only steering with a number (for example "6") does.
  const userNumber = steering && statesNumber(o.keywords!);
  const noNumbers = asksForNumber(o.partner.text) && !userNumber;
  // Spare drafts, so a near-duplicate, a romanized reply or a misplaced name can be dropped and four still remain.
  // Steering words make drafts converge, so steering asks for one more. A request for a number asks for three
  // more, because every draft that states a number is dropped.
  const n = (o.count ?? 4) + (steering ? 2 : 1) + (noNumbers ? 3 : 0);
  const tone = toneById(o.tone);
  const langs = p.languages.map((c) => languageByCode(c)?.name ?? c).join(", ");
  const people = p.people.length
    ? p.people.map((x) => `${x.name} (${x.relation}): ${p.name} calls them "${x.addressAs}"`).join("; ")
    : "none given";
  const replyLang = replyLanguage(o);
  const replyLangName = languageByCode(replyLang)?.name ?? "English";

  const unknown = isUnknownPartner(o.partner.who);
  const who = unknown ? "someone whose name you do not know" : o.partner.who!;
  const speakerName = unknown ? "The other person" : who;
  const system = [
    `You draft spoken replies for ${p.name}, who cannot speak aloud and talks through an app called Kanth.`,
    `${p.name} will choose one of your drafts and Kanth will say it aloud in ${p.name}'s own voice, so every draft must be something ${p.name} would really say, in first person, to ${who}.`,
    ``,
    `About ${p.name}: speaks ${langs}. Mixing style: ${p.mixStyle}. People: ${people}. Notes: ${p.notes || "none"}.`,
    ``,
    `Rules:`,
    `1. Write exactly ${n} different replies. Make them genuinely different choices, for example one agreeing, one declining or delaying, one asking something back, one sharing a feeling about it. Every reply must respond to what was just said. Never several versions of the same answer. Never contradict what ${unknown ? "they" : who} just said: if they say the food is hot, no reply may say it is cold.`,
    `2. Keep each reply short and spoken: 2 to 12 words, the way people actually talk at home, not written prose. Every reply is ${p.name} talking to ${unknown ? "them" : who} in first person (I, me, my). Never narrate or describe what other people are doing.`,
    unknown
      ? `3. You do not know who is speaking. Do not address them by any name or title (no Amma, Doctor, Bhai, Sir or similar), and do not mention the people listed above unless their line does.`
      : `3. You are answering ${who} only. Names and terms of address such as Amma, Appa or Doctor belong to the specific people listed above: use one only when talking to that person, and never call anyone else by it. Do not bring the other people listed above into the reply unless ${who} mentioned them.`,
    `4. Every reply is in ${replyLangName}${replyLangName === "English" ? "" : `, with English words mixed in the way ${p.name} does`}. Use no other Indian language in this turn.`,
    `5. Script matters because a speech engine reads your text: ${replyLangName === "English" ? "plain English in Latin script." : `${replyLangName} words in ${replyLangName} script and English words in Latin script. Never romanize ${replyLangName}.`}`,
    `6. Tone for this turn: ${tone.wording}.`,
    `7. Never invent facts: no appointments, plans, symptoms or events that were not mentioned. When ${p.name} might need to give a detail you do not know, write a reply that asks or defers instead.`,
    `8. Use the notes about ${p.name} only when they bear on what was just said. Never bring up a topic from the notes that nobody mentioned.`,
    `9. If ${unknown ? "they ask" : `${who} asks`} for a number, a score, a time or an amount, never state one${userNumber ? " other than one in the words " + p.name + " pointed to" : ""}: ${p.name} gives it with the number buttons. Write replies that say how it feels without a number, compare with before, ask something back, or say "let me show you".`,
    ``,
    `Output exactly ${n} lines and nothing else: no numbering, no tags, no quotes. Each line is the reply, then ${SEP}, then a short English meaning. Example of the line format:`,
    FORMAT_EXAMPLES[replyLang] ?? FORMAT_EXAMPLES["en-IN"]!,
  ].join("\n");

  const lines: string[] = [];
  const recent = o.history.slice(-8);
  if (recent.length) {
    lines.push("Conversation so far:");
    for (const t of recent) lines.push(`${t.who === "me" ? p.name : t.speaker ?? speakerName}: ${t.text}`);
    lines.push("");
  }
  lines.push(`${speakerName} just said: ${o.partner.text}`);
  lines.push("");
  if (o.keywords?.trim()) {
    lines.push(`${p.name} has pointed to what they want to say with these words: "${o.keywords.trim()}".`);
    lines.push(`Every reply must say that, built around these words (put them into ${replyLangName} where natural), in ${n} different ways.`);
    lines.push("");
  }
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
      max_tokens: 640,
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
  const kept: string[] = [];
  // Asked for a number and the user has not given one: the number is theirs to give, so no draft may state one.
  // When they steer with a number (for example "6"), their own number must come through. Steering with a word
  // such as Yes or Not now gives no number, so the guard stays on.
  const noNumbers = asksForNumber(o.partner.text) && !statesNumber(o.keywords ?? "");
  const flushLine = (raw: string) => {
    if (emitted >= want) return;
    const d = parseDraftLine(raw, emitted, fallbackLang);
    if (!d || hasForeignScript(d.text, fallbackLang) || hasRomanizedIndic(d.text, fallbackLang)) return;
    if (noNumbers && statesNumber(d.text, d.gloss)) return;
    if (namesWrongPerson(d, o)) return;
    if (kept.some((k) => isNearDuplicate(k, d.text))) return;
    kept.push(d.text);
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
