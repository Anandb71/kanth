import { useEffect, useRef, useState, type CSSProperties } from "react";
import { TONES } from "../../../shared/tones.ts";
import { languageByCode, type LangCode } from "../../../shared/voices.ts";
import { kanth, type Card, type KanthState } from "../lib/kanth.ts";
import { fmtMs } from "../lib/useKanth.ts";
import { useDwell } from "../lib/access.ts";
import { Orb } from "./Orb.tsx";

// Cited text entry rates (Koester and Arthanat 2018): cursor-based on-screen keyboards
// (eye gaze, head pointer) average 4.2 wpm; switch scanning averages 1.7 wpm.
const POINTER_WPM = 4.2;
const SCAN_WPM = 1.7;

export function PartnerDisplay({ s, onListen, listening }: { s: KanthState; onListen?: () => void; listening?: boolean }) {
  const p = s.partner;
  const lang = p?.lang ? languageByCode(p.lang) : undefined;
  return (
    <section className="display" aria-labelledby="partner-h">
      <h2 id="partner-h" className="sr-only">What they said</h2>
      {p ? (
        <>
          <div className="display-head">
            <div className="avatar" aria-hidden="true">{p.who.slice(0, 1)}</div>
            <div>
              <div className="who">{p.who}</div>
              <div className="lang">{lang ? `${lang.native} · ${lang.name}` : "Listening"}</div>
            </div>
            {p.speaking ? (
              <span className="speaking">
                <span className="bars" aria-hidden="true"><i /><i /><i /><i /></span> Speaking · Saaras is transcribing
              </span>
            ) : (
              <span className="speaking"><span className="led ready" aria-hidden="true" /> Heard by Saaras</span>
            )}
          </div>
          <div className={`heard ${p.final ? "" : "partial"}`} lang={p.lang?.slice(0, 2)} aria-live="polite">
            {p.text || <span className="empty">Listening…</span>}
            {!p.final && p.text ? <span className="caret" aria-hidden="true" /> : null}
          </div>
          {s.settings.showGloss && p.gloss && p.final ? <div className="gloss" lang="en">“{p.gloss}”</div> : null}
        </>
      ) : (
        <div className="row" style={{ justifyContent: "space-between", gap: 20 }}>
          <div className="empty">When someone talks to you, their words appear here and Kanth drafts your replies while they speak.</div>
          {onListen ? (
            <button className="btn btn-soft" onClick={onListen} data-scan-top data-scan-order="6" aria-pressed={listening}>
              <span className={`led ${listening ? "busy" : ""}`} aria-hidden="true" />
              {listening ? "Stop listening" : "Listen with microphone"}
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function Tile({ c, s, index }: { c: Card; s: KanthState; index: number }) {
  const ref = useRef<HTMLButtonElement>(null);
  const choose = () => void kanth.choose(c.idx);
  useDwell(ref, s.settings.access === "dwell" ? s.settings.dwellMs : 0, choose);
  const last = s.history[s.history.length - 1];
  const chosen = last?.who === "me" && last.text === c.text;
  const lang = languageByCode(c.lang);
  const state = c.failed ? "Voice made when chosen" : c.ready ? "Voiced and ready" : s.settings.prespeak ? "Voicing…" : "Speaks when chosen";
  return (
    <button
      ref={ref}
      className={`tile ${chosen ? "chosen" : ""}`}
      onClick={choose}
      data-scan-item="cards"
      aria-label={`Say: ${c.text}${c.gloss ? `. Meaning: ${c.gloss}` : ""}`}
    >
      <span className="tile-top" lang="en">
        <span className={`led ${c.ready ? "ready" : c.failed ? "" : "busy"}`} aria-hidden="true" />
        {state}
        <span className="tile-num" aria-hidden="true">{index + 1}</span>
      </span>
      <span className="tile-text" lang={c.lang.slice(0, 2)}>{c.text}</span>
      {s.settings.showGloss && c.gloss ? <span className="tile-gloss" lang="en">{c.gloss}</span> : null}
      <span className="tile-foot" lang="en">{lang?.native} · {lang?.name}</span>
      <span className="dwell" aria-hidden="true" />
    </button>
  );
}

export function Replies({ s }: { s: KanthState }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || kanth.state.settings.access !== "touch") return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4) {
        const c = kanth.state.cards[n - 1];
        if (c) void kanth.choose(c.idx);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!s.cards.length && !s.drafting) return null;
  return (
    <section aria-labelledby="sugg-h">
      <h2 id="sugg-h" className="sr-only">Replies you can say</h2>
      <div className="tiles" data-scan-group="cards" data-scan-top data-scan-order="1">
        {[0, 1, 2, 3].map((i) => {
          const c = s.cards.find((x) => x.idx === i);
          if (c) return <Tile key={`${s.turnId}-${i}`} c={c} s={s} index={i} />;
          return s.drafting ? (
            <div key={`sk-${i}`} className="tile skeleton" aria-hidden="true">
              <div className="shimmer" />
              <div className="shimmer short" />
            </div>
          ) : null;
        })}
      </div>
      <div className="sr-only" aria-live="polite">
        {!s.drafting && s.cards.length ? `${s.cards.length} replies ready. ${s.cards.map((c, i) => `${i + 1}: ${c.text}`).join(". ")}` : ""}
      </div>
    </section>
  );
}

export function ToneDial({ s }: { s: KanthState }) {
  const i = Math.max(0, TONES.findIndex((t) => t.id === s.tone));
  const t = TONES[i]!;
  return (
    <div className="dial-wrap">
      <span className="eyebrow">Tone</span>
      <div className="dial" role="group" aria-label="Tone of voice" data-scan-group="tones" data-scan-top data-scan-order="4" style={{ "--n": TONES.length, "--i": i } as CSSProperties}>
        <span className="dial-knob" aria-hidden="true" />
        {TONES.map((x) => (
          <button key={x.id} aria-pressed={s.tone === x.id} onClick={() => kanth.setTone(x.id)} data-scan-item="tones" data-tone={x.id}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="dial-readout" aria-label="Bulbul prosody for this tone">
        pace {t.prosody.pace.toFixed(2)} · pitch {t.prosody.pitch >= 0 ? "+" : ""}{t.prosody.pitch.toFixed(2)}
        <br />
        loudness {t.prosody.loudness.toFixed(2)}
        {s.settings.voice.kind === "clone" ? (
          <>
            <br />
            A banked voice follows pace only.
          </>
        ) : null}
      </div>
    </div>
  );
}

const TYPE_LANGS: { code: LangCode; label: string; roman: boolean }[] = [
  { code: "en-IN", label: "English", roman: false },
  { code: "ta-IN", label: "தமிழ் (type in Roman)", roman: true },
  { code: "hi-IN", label: "हिन्दी (type in Roman)", roman: true },
];

export function Composer({ canSteer = false }: { canSteer?: boolean }) {
  const [text, setText] = useState("");
  const [lang, setLang] = useState<LangCode>("en-IN");
  const [busy, setBusy] = useState(false);
  const roman = !!TYPE_LANGS.find((l) => l.code === lang)?.roman && /[A-Za-z]/.test(text) && !/[^\x00-\x7F]/.test(text);

  const speak = async () => {
    if (!text.trim()) return;
    setBusy(true);
    let out = text.trim();
    if (roman) {
      out = await kanth.transliterate(out, lang);
      setText(out);
    }
    setBusy(false);
    await kanth.speakText(out, "typed", roman || lang !== "en-IN" ? lang : undefined);
    setText("");
  };

  return (
    <section className="panel" data-scan-group="compose" data-scan-top data-scan-order="5" aria-labelledby="compose-h">
      <div className="row">
        <h2 className="eyebrow" id="compose-h" style={{ margin: 0 }}>Say anything</h2>
        <div className="seg" role="group" aria-label="Typing language">
          {TYPE_LANGS.map((l) => (
            <button key={l.code} aria-pressed={lang === l.code} onClick={() => setLang(l.code)} data-scan-item="compose">
              {l.label}
            </button>
          ))}
        </div>
      </div>
      <div className="composer">
        <label htmlFor="compose" className="sr-only">Text to speak</label>
        <textarea
          id="compose"
          rows={2}
          value={text}
          placeholder={lang === "ta-IN" ? "amma charger edutthu vaa" : lang === "hi-IN" ? "paani chahiye please" : "Type, edit, then speak"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void speak();
            }
          }}
        />
        {canSteer ? (
          <button
            className="btn btn-soft"
            onClick={() => {
              void kanth.steer(text);
              setText("");
            }}
            disabled={!text.trim() || busy}
            data-scan-item="compose"
            title="Redraft the four replies around these words"
          >
            Draft with these words
          </button>
        ) : null}
        <button className="btn btn-primary" onClick={() => void speak()} disabled={!text.trim() || busy} data-scan-item="compose">
          {busy ? "Converting…" : "Speak"}
        </button>
      </div>
      {canSteer && !roman ? <div className="hint">None of the replies right? Type a word or two, like “tablet” or “4 pm”, and Kanth redrafts all four around it.</div> : null}
      {roman ? <div className="hint">Kanth converts this to {languageByCode(lang)?.native} script first, because Bulbul pronounces native script far better than Roman.</div> : null}
    </section>
  );
}

const SCALE_HINT = /\d|[०-९௦-௯]|scale|one to ten|out of ten|दस|பத்து/i;

/**
 * Steering without typing, for one switch and blink users: a short row of words that redraft the
 * four replies. When the partner asks for a number, a 0 to 10 row appears so the user gives the
 * number and the drafts never have to guess it.
 */
export function SteerRow({ s }: { s: KanthState }) {
  if (!s.partner?.final) return null;
  const numbers = SCALE_HINT.test(s.partner.text);
  const words: { label: string; steer: string }[] = [
    { label: "Yes", steer: "yes" },
    { label: "No", steer: "no" },
    { label: "Not now", steer: "not now, later" },
    { label: "Ask them back", steer: "ask them a question back" },
  ];
  return (
    <section className="panel" aria-labelledby="steer-h">
      <div className="row">
        <h2 className="eyebrow" id="steer-h" style={{ margin: 0 }}>Not quite? Steer the replies</h2>
        <span className="hint">Each word redrafts all four around it.</span>
      </div>
      <div className="phrases" data-scan-group="steer" data-scan-top data-scan-order="3">
        {numbers
          ? Array.from({ length: 11 }, (_, n) => (
              <button key={n} className="phrase num" data-scan-item="steer" onClick={() => void kanth.steer(String(n))} aria-label={`Redraft with the number ${n}`}>
                {n}
              </button>
            ))
          : null}
        {words.map((w) => (
          <button key={w.label} className="phrase" data-scan-item="steer" onClick={() => void kanth.steer(w.steer)}>
            {w.label}
          </button>
        ))}
      </div>
    </section>
  );
}

export interface Phrase {
  id: string;
  text: string;
  lang: LangCode;
  gloss: string;
  urgent?: boolean;
}

export function Phrases({ phrases, cached, s }: { phrases: Phrase[]; cached: Set<string>; s: KanthState }) {
  const allCached = phrases.every((p) => cached.has(p.id));
  return (
    <section className="panel" aria-labelledby="phrases-h">
      <div className="row">
        <h2 className="eyebrow" id="phrases-h" style={{ margin: 0 }}>Always ready</h2>
        <span className="hint">{allCached ? "Stored on this device. Works with no network." : "Saving to this device for offline use…"}</span>
      </div>
      <div className="phrases" data-scan-group="phrases" data-scan-top data-scan-order="2">
        {phrases.map((p) => (
          <button
            key={p.id}
            className={`phrase ${p.urgent ? "urgent" : ""}`}
            data-scan-item="phrases"
            data-phrase={p.text}
            data-ready={cached.has(p.id) ? "1" : "0"}
            lang={p.lang.slice(0, 2)}
            aria-label={`Say: ${p.text}. ${p.gloss}`}
            onClick={async () => {
              const ok = await kanth.sayCached(p.id, p.text, p.lang, p.gloss);
              if (!ok) await kanth.speakText(p.text, "phrase", p.lang, p.gloss);
            }}
          >
            <span className={`led ${cached.has(p.id) ? (p.urgent ? "down" : "ready") : ""}`} aria-hidden="true" />
            {p.text}
            {s.settings.showGloss && p.gloss !== p.text ? <span className="hint" lang="en">{p.gloss}</span> : null}
          </button>
        ))}
      </div>
    </section>
  );
}

export function VoicePanel({ s }: { s: KanthState }) {
  const v = s.settings.voice;
  const speaking = !!s.speakingText;
  return (
    <section className="voice" aria-label="Your voice">
      <Orb />
      <div>
        <div className="voice-name">{s.profile.name}{speaking ? " is speaking" : ""}</div>
        <div className="voice-sub">
          {v.kind === "clone" ? `${v.label} · Sarvam voice cloning (beta)` : `Bulbul V4 Flash · ${v.name} persona`}
          {" · "}prespeak {s.settings.prespeak ? "on" : "off"}
        </div>
      </div>
      {speaking ? (
        <button className="btn btn-soft btn-small" onClick={() => kanth.stopSpeaking()} aria-label="Stop speaking (Escape)">
          Stop speaking
        </button>
      ) : null}
    </section>
  );
}

function Gauge({ value, target, label, sub }: { value: number | undefined; target: number; label: string; sub: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const frac = value === undefined ? 0 : Math.min(1, value / (target * 2));
  const slow = value !== undefined && value > target;
  return (
    <div className="gauge-row">
      <div className="gauge" role="img" aria-label={`${label}: ${fmtMs(value)}, target under ${target} ms`}>
        <svg viewBox="0 0 128 128">
          <circle className="track" cx="64" cy="64" r={r} fill="none" strokeWidth="10" />
          <circle className={`arc ${slow ? "slow" : ""}`} cx="64" cy="64" r={r} fill="none" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
        </svg>
        <div className="gauge-face">
          <div>
            <div className="gauge-value">{value === undefined ? "–" : Math.round(value)}</div>
            <div className="gauge-unit">ms</div>
          </div>
        </div>
      </div>
      <div className="gauge-copy">
        <b>{label}</b>
        <span>{sub}</span>
      </div>
    </div>
  );
}

export function Meter({ s }: { s: KanthState }) {
  const done = [...s.metrics].reverse().find((m) => m.audibleAt && m.partnerEndAt);
  // "They stop" figures come from the first draft of the latest turn; redrafts include the user's own press.
  const live = [...s.metrics].reverse().find((m) => !m.redraft) ?? s.metrics[s.metrics.length - 1];
  const since = (t?: number) => (live?.partnerEndAt && t ? t - live.partnerEndAt : undefined);
  const heard = since(live?.transcriptAt);
  const first = since(live?.firstCardAt);
  const all = since(live?.allCardsAt);
  const voiced = since(live?.allReadyAt);
  const turnGap = done ? done.audibleAt! - done.partnerEndAt! : undefined;
  const lastMe = [...s.history].reverse().find((h) => h.who === "me");
  const words = lastMe ? lastMe.text.trim().split(/\s+/).length : 0;
  const cls = (v: number | undefined, target: number) => (v === undefined ? "" : v <= target ? "good" : "slow");
  // Negative means the replies were ready before the partner finished speaking.
  const rel = (v: number | undefined) => (v !== undefined && v < 0 ? `${fmtMs(-v)} early` : fmtMs(v));

  return (
    <section className="meter" aria-labelledby="meter-h">
      <div className="eyebrow" id="meter-h">Measured live, this conversation</div>
      <Gauge value={done?.toAudibleMs} target={150} label="You choose → you are heard" sub={done ? (done.prespoken ? "Played from prespoken audio." : "Synthesized after the choice.") : "Choose a reply to measure."} />
      <div className="stats">
        <div className="stat"><b className={cls(heard, 400)}>{fmtMs(heard)}</b><span>They stop → Saaras transcript</span></div>
        <div className="stat"><b className={cls(first, 1500)}>{rel(first)}</b><span>They stop → first reply</span></div>
        <div className="stat"><b className={cls(all, 1500)}>{rel(all)}</b><span>They stop → all 4 replies</span></div>
        <div className="stat"><b className={cls(voiced, 1500)}>{rel(voiced)}</b><span>They stop → all 4 voiced</span></div>
      </div>
      {turnGap !== undefined ? (
        <div className="compare">
          <div className="compare-row"><span>Turn gap, including the time spent choosing</span><b>{fmtMs(turnGap)}</b></div>
          {words ? (
            <>
              <div className="compare-row"><span>Typing those {words} words by eye gaze, at {POINTER_WPM} wpm</span><b>≈ {fmtMs((words / POINTER_WPM) * 60000)}</b></div>
              <div className="compare-row"><span>Typing them with one switch, at {SCAN_WPM} wpm</span><b>≈ {fmtMs((words / SCAN_WPM) * 60000)}</b></div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function History({ s }: { s: KanthState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" });
  }, [s.history.length]);
  if (!s.history.length) return null;
  return (
    <section className="history" ref={ref} aria-label="Conversation so far">
      {s.history.map((h, i) => (
        <div key={i} className={`bubble ${h.who}`} lang={h.lang?.slice(0, 2)}>
          {h.who === "partner" ? <div className="bubble-who" lang="en">{h.speaker}</div> : null}
          {h.text}
          {s.settings.showGloss && h.gloss && h.gloss !== h.text ? <small lang="en">{h.gloss}</small> : null}
        </div>
      ))}
    </section>
  );
}

export function Notices({ s }: { s: KanthState }) {
  if (!s.notices.length) return null;
  return (
    <div className="notices" role="status" aria-live="polite">
      {s.notices.map((n) => (
        <div key={n.id} className="notice">
          <span className={`led ${n.fallback ? "degraded" : "down"}`} aria-hidden="true" />
          <div>
            <b>{labelFor(n.scope)}: {shorten(n.message)}</b>
            {n.fallback ? <span className="fallback">{n.fallback}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function labelFor(scope: string): string {
  return ({ tts: "Voice", stt: "Listening", llm: "Drafting", translit: "Script", clone: "Voice bank", server: "Kanth" } as Record<string, string>)[scope] ?? scope;
}

function shorten(m: string): string {
  return m.length > 140 ? `${m.slice(0, 140)}…` : m;
}
