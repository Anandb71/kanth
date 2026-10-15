import { useEffect, useMemo, useRef, useState } from "react";
import { useKanth } from "./lib/useKanth.ts";
import { HOSTED, kanth } from "./lib/kanth.ts";
import { audio } from "./lib/audio.ts";
import { demo, SCENES, type DemoState } from "./lib/demo.ts";
import { film } from "./lib/film.ts";
import { Scanner } from "./lib/access.ts";
import { phrasesFor, preparePhrases } from "./lib/phrases.ts";
import { Composer, History, Meter, Notices, PartnerDisplay, Phrases, Replies, SteerRow, ToneDial, VoicePanel } from "./components/Talk.tsx";
import { SettingsDrawer } from "./components/Settings.tsx";
import { Hero } from "./components/Hero.tsx";
import { FilmLayer } from "./components/FilmLayer.tsx";
import { useMic } from "./lib/listen.ts";

const params = new URLSearchParams(location.search);
const FILM = params.has("film");

export function App() {
  const s = useKanth();
  const [view, setView] = useState<"home" | "talk">(params.has("demo") || FILM || location.hash === "#talk" ? "talk" : "home");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsBtn = useRef<HTMLButtonElement>(null);
  const [d, setD] = useState<DemoState>(demo.state);
  const [cached, setCached] = useState<Set<string>>(new Set());
  const mic = useMic();

  useEffect(() => demo.on(setD), []);

  useEffect(() => {
    document.documentElement.dataset.theme = s.settings.theme;
    document.documentElement.style.setProperty("--scale", String(s.settings.textScale));
  }, [s.settings.theme, s.settings.textScale]);

  // The always-ready board, cached on the device for offline use.
  const phrases = useMemo(() => phrasesFor(s.profile.languages[0] ?? "en-IN", s.settings.voice), [s.profile.languages, s.settings.voice]);
  useEffect(() => {
    if (s.link !== "open" || s.keyPresent === false) return;
    void preparePhrases(phrases, s.settings.voice, (id) => setCached((prev) => new Set(prev).add(id)));
  }, [phrases, s.link, s.keyPresent, s.settings.voice]);

  // Switch scanning (one switch, two switches, or blink as the switch).
  const scanner = useRef<Scanner | null>(null);
  const [scanPaused, setScanPaused] = useState(false);
  useEffect(() => {
    const a = s.settings.access;
    // Scanning is paused while Settings is open, so a switch press can never act on the page behind it.
    if (view !== "talk" || settingsOpen || (a !== "scan-auto" && a !== "scan-step" && a !== "blink")) return;
    const sc = new Scanner(a === "scan-step" ? "step" : "auto", s.settings.scanIntervalMs);
    sc.onState((st) => setScanPaused(st.paused));
    scanner.current = sc;
    sc.start();
    // While Kanth is speaking, a switch press stops the speech instead of selecting.
    const switchPress = () => (kanth.state.speakingText ? kanth.stopSpeaking() : sc.press());
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "TEXTAREA" || t.tagName === "INPUT") return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!e.repeat) switchPress(); // a held switch must never repeat
      } else if (a === "scan-step" && (e.key === "Tab" || e.key === "ArrowRight")) {
        e.preventDefault();
        if (!e.repeat) sc.next();
      }
    };
    window.addEventListener("keydown", onKey);
    let stopBlink: (() => void) | undefined;
    if (a === "blink") {
      void import("./lib/blink.ts").then((m) =>
        m.startBlinkSwitch(s.settings.blinkHoldMs, switchPress, (msg) => kanth.notify("server", msg, "Use Space or Enter as the switch instead.")).then((stop) => (stopBlink = stop)),
      );
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      sc.stop();
      stopBlink?.();
      scanner.current = null;
      setScanPaused(false);
    };
  }, [s.settings.access, s.settings.scanIntervalMs, s.settings.blinkHoldMs, view, settingsOpen]);

  // New or changed replies: block presses briefly, then scan from the first reply.
  useEffect(() => {
    if (s.cards.length) scanner.current?.holdOff();
  }, [s.cardsChangedAt, s.cards.length]);

  // While Settings is open, the page behind it cannot be focused or clicked.
  useEffect(() => {
    for (const el of document.querySelectorAll("main, header.topbar")) el.toggleAttribute("inert", settingsOpen);
  }, [settingsOpen, view]);

  // Escape always stops speech, for every access method.
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && kanth.state.speakingText && kanth.stopSpeaking();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  // Film mode runs the scripted take on its own once the server link is up.
  useEffect(() => {
    if (!FILM || s.link !== "open") return;
    const t = window.setTimeout(() => void film.run(), 800);
    return () => window.clearTimeout(t);
  }, [s.link]);

  const startDemo = () => {
    audio.unlock();
    setView("talk");
    void demo.run();
  };

  const ttsState = s.keyPresent === false ? "no-key" : s.services.tts?.state ?? (s.link === "open" ? "connecting" : "down");
  const sim = view === "talk" && (d.phase !== "idle" || FILM);

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); demo.stop(); setView("home"); }} aria-label="Kanth, home">
          <span className="brand-mark" aria-hidden="true"><span>कं</span></span>
          <span className="brand-name">Kanth</span>
          <span className="brand-native" lang="hi">कंठ</span>
        </a>
        {sim ? <span className="chip sim">Simulated conversation · every voice is Bulbul</span> : null}
        {HOSTED ? <span className="chip" title="The hosted demo detects turns in the browser and transcribes each finished line. Voice banking runs in the local version. See the README.">Hosted demo</span> : null}
        <div className="topbar-spacer" />
        <div className="pills" aria-label="Service status">
          <StatusChip label="Bulbul V4 Flash" state={ttsState} detail={s.services.tts?.detail} />
          <StatusChip label="Saaras" state={s.services.stt?.state ?? (s.link === "open" ? "ready" : "down")} detail={s.services.stt?.detail} />
          <StatusChip label={s.link === "open" ? "Online" : s.link === "connecting" ? "Connecting" : "Offline"} state={s.link === "open" ? "ready" : s.link === "connecting" ? "connecting" : "down"} />
        </div>
        <button ref={settingsBtn} className="btn btn-soft btn-small" onClick={() => setSettingsOpen(true)} aria-haspopup="dialog">Settings</button>
      </header>

      {s.keyPresent !== false && s.services.tts?.detail === "Sarvam rejected the key" ? (
        <div className="banner" role="alert">
          Sarvam rejected the API key on the server, so Kanth cannot speak yet. Check <code>SARVAM_API_KEY</code> and restart the server.
        </div>
      ) : null}
      {s.keyPresent === false ? (
        <div className="banner" role="alert">
          The server has no Sarvam key, so Kanth cannot speak yet. Stop the server and run <code>SARVAM_API_KEY=sk_... npm start</code>, or put the key in a <code>.env</code> file. The key stays on the server.
        </div>
      ) : null}

      {view === "home" ? (
        <Hero onDemo={startDemo} onTalk={() => { audio.unlock(); setView("talk"); }} />
      ) : (
        <main className="main">
          <div className="col">
            {FILM ? null : d.phase !== "idle" || d.error ? (
              <div className="strip" role="status">
                {d.error ? (
                  <span>{d.error}</span>
                ) : d.phase === "done" ? (
                  <>
                    <span className="scene">That was the demo.</span>
                    <span>Every reply was drafted live, and spoken in Arjun's voice only when chosen.</span>
                    <span className="status"><button className="btn btn-soft btn-small" onClick={() => void demo.run()}>Play again</button></span>
                  </>
                ) : (
                  <>
                    <span className="scene">Scene {Math.max(1, d.scene + 1)} of {SCENES.length}</span>
                    <span>{SCENES[Math.max(0, d.scene)]?.setting}</span>
                    <span className="status">
                      <span className={`led ${d.phase === "waiting" ? "ready" : "busy"}`} aria-hidden="true" />
                      {d.phase === "preparing" ? "Preparing voices" : d.phase === "partner" ? "Listening" : d.phase === "waiting" ? "Your turn. Nothing is said until you choose." : "Speaking"}
                      <button className="btn btn-soft btn-small" onClick={() => demo.stop()}>Stop</button>
                    </span>
                  </>
                )}
              </div>
            ) : null}
            <PartnerDisplay s={s} onListen={() => (mic.listening ? mic.stop() : void mic.start())} listening={mic.listening} />
            <Replies s={s} />
            <SteerRow s={s} />
            <ToneDial s={s} />
            <Composer canSteer={!!s.partner?.final} />
            <Phrases phrases={phrases} cached={cached} s={s} />
          </div>
          <aside className="col" aria-label="Your voice and measurements">
            <VoicePanel s={s} />
            <Meter s={s} />
            <History s={s} />
          </aside>
        </main>
      )}

      {scanPaused ? (
        <div className="scan-paused" role="status">Scanning paused. Press your switch to start again from the replies.</div>
      ) : null}
      {s.unspoken ? (
        <div className="unspoken" role="alert">
          <div className="unspoken-card">
            <div className="eyebrow">Not spoken aloud. Please show this screen.</div>
            <div className="unspoken-text" lang={s.unspoken.lang.slice(0, 2)}>{s.unspoken.text}</div>
            {s.unspoken.gloss ? <div className="hint" lang="en">{s.unspoken.gloss}</div> : null}
            <button className="btn btn-soft" onClick={() => kanth.dismissUnspoken()}>Done</button>
          </div>
        </div>
      ) : null}
      {FILM ? <FilmLayer /> : null}
      <Notices s={s} />
      {settingsOpen ? (
        <SettingsDrawer
          s={s}
          onClose={() => {
            setSettingsOpen(false);
            window.setTimeout(() => settingsBtn.current?.focus(), 0);
          }}
        />
      ) : null}
    </div>
  );
}

function StatusChip({ label, state, detail }: { label: string; state: string; detail?: string }) {
  const word = ({ ready: "ready", connecting: "connecting", degraded: "degraded", down: "unavailable", "no-key": "no key" } as Record<string, string>)[state] ?? state;
  return (
    <span className="chip" title={detail}>
      <span className={`led ${state}`} aria-hidden="true" />
      <span className="lbl">{label}</span>
      <span className="sr-only">: {word}</span>
    </span>
  );
}
