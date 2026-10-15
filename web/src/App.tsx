import { useEffect, useMemo, useRef, useState } from "react";
import { useKanth } from "./lib/useKanth.ts";
import { HOSTED, kanth } from "./lib/kanth.ts";
import { audio } from "./lib/audio.ts";
import { demo, SCENES, type DemoState } from "./lib/demo.ts";
import { film } from "./lib/film.ts";
import { Scanner, startDwell } from "./lib/access.ts";
import { phrasesFor, preparePhrases } from "./lib/phrases.ts";
import { Composer, History, Meter, Notices, PartnerDisplay, Phrases, Replies, SteerRow, ToneDial, VoicePanel } from "./components/Talk.tsx";
import { SettingsDrawer } from "./components/Settings.tsx";
import { Hero } from "./components/Hero.tsx";
import { FilmLayer } from "./components/FilmLayer.tsx";
import { FilmModal, REPO_URL, SiteFooter } from "./components/Footer.tsx";
import { useMic } from "./lib/listen.ts";

const params = new URLSearchParams(location.search);
const FILM = params.has("film");
/** Holding a key switch this long jumps to the emergency phrases instead of selecting. */
const HOLD_MS = 1500;

export function App() {
  const s = useKanth();
  const [view, setView] = useState<"home" | "talk">(params.has("demo") || FILM || location.hash === "#talk" ? "talk" : "home");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filmOpen, setFilmOpen] = useState(false);
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
  const urgentPhrases = useMemo(() => phrases.filter((p) => p.urgent), [phrases]);
  const otherPhrases = useMemo(() => phrases.filter((p) => !p.urgent), [phrases]);
  useEffect(() => {
    if (s.link !== "open" || s.keyPresent === false) return;
    // After first paint, so the board never slows the first screen.
    const t = window.setTimeout(() => void preparePhrases(phrases, s.settings.voice, (id) => setCached((prev) => new Set(prev).add(id))), 1500);
    return () => window.clearTimeout(t);
  }, [phrases, s.link, s.keyPresent, s.settings.voice]);

  // Switch scanning (one switch, two switches, or blink as the switch), on the home page and the talk view.
  const scanner = useRef<Scanner | null>(null);
  const [scanPaused, setScanPaused] = useState(false);
  const [scanRefused, setScanRefused] = useState(false);
  const refusedTimer = useRef(0);
  useEffect(() => {
    const a = s.settings.access;
    // Scanning is paused while Settings or the film is open, so a switch press can never act on the page behind it.
    if (settingsOpen || filmOpen || (a !== "scan-auto" && a !== "scan-step" && a !== "blink")) return;
    const sc = new Scanner(a === "scan-step" ? "step" : "auto", s.settings.scanIntervalMs);
    sc.onState((st) => {
      setScanPaused(st.paused);
      if (st.refused) {
        setScanRefused(true);
        window.clearTimeout(refusedTimer.current);
        refusedTimer.current = window.setTimeout(() => setScanRefused(false), 1500);
      }
    });
    scanner.current = sc;
    sc.start();
    // While Kanth is speaking, a switch press stops the speech instead of selecting.
    const switchPress = () => (kanth.state.speakingText ? kanth.stopSpeaking() : sc.press());
    // A key switch selects on release, so holding it can do something else: after HOLD_MS it jumps
    // straight to the emergency phrases, and nothing else is selected. The highlight stays still while held.
    let down = false;
    let jumped = false;
    let holdTimer = 0;
    const isSwitch = (e: KeyboardEvent) => e.key === " " || e.key === "Enter";
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      return t.tagName === "TEXTAREA" || t.tagName === "INPUT";
    };
    const onKey = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (isSwitch(e)) {
        e.preventDefault();
        if (e.repeat || down) return; // a held switch must never repeat
        down = true;
        jumped = false;
        sc.hold();
        holdTimer = window.setTimeout(() => {
          if (!down) return;
          jumped = true;
          if (kanth.state.speakingText) kanth.stopSpeaking();
          sc.enterGroup("urgent");
        }, HOLD_MS);
      } else if (a === "scan-step" && (e.key === "Tab" || e.key === "ArrowRight")) {
        e.preventDefault();
        if (!e.repeat) sc.next();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!isSwitch(e) || !down) return;
      e.preventDefault();
      down = false;
      window.clearTimeout(holdTimer);
      if (jumped) return;
      switchPress();
    };
    const onBlur = () => {
      if (!down) return;
      down = false;
      window.clearTimeout(holdTimer);
      sc.resume();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    let stopBlink: (() => void) | undefined;
    if (a === "blink") {
      void import("./lib/blink.ts").then((m) =>
        m.startBlinkSwitch(s.settings.blinkHoldMs, switchPress, (msg) => kanth.notify("server", msg, "Use Space or Enter as the switch instead.")).then((stop) => (stopBlink = stop)),
      );
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.clearTimeout(holdTimer);
      sc.stop();
      stopBlink?.();
      scanner.current = null;
      setScanPaused(false);
      setScanRefused(false);
    };
  }, [s.settings.access, s.settings.scanIntervalMs, s.settings.blinkHoldMs, view, settingsOpen, filmOpen]);

  // Dwell: every choice on the page can be picked by resting a head pointer or eye tracker on it.
  useEffect(() => {
    if (s.settings.access !== "dwell" || settingsOpen) return;
    return startDwell(s.settings.dwellMs, () => kanth.state.cardsChangedAt);
  }, [s.settings.access, s.settings.dwellMs, settingsOpen]);

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

  // The microphone never keeps listening once you leave the talk view.
  const stopMic = useRef(mic.stop);
  stopMic.current = mic.stop;
  useEffect(() => {
    if (view !== "talk") stopMic.current();
  }, [view]);

  // A redraft (steer word, number or tone) brings the new replies into view, so the change is seen.
  useEffect(() => {
    if (FILM || !s.cards.length) return;
    if (!s.metrics.find((m) => m.turnId === s.turnId)?.redraft) return;
    const tiles = document.querySelector(".tiles");
    if (!tiles) return;
    const top = tiles.getBoundingClientRect().top;
    if (top >= 0 && top < window.innerHeight - 160) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    tiles.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [s.cardsChangedAt]);

  const startDemo = () => {
    mic.stop();
    audio.unlock();
    setView("talk");
    void demo.run();
    // The button that was pressed is gone: keep keyboard focus on the demo's own controls.
    window.setTimeout(() => document.querySelector<HTMLElement>(".strip button")?.focus({ preventScroll: true }), 0);
  };

  // Talking with the microphone always starts a fresh conversation, never on top of the demo's.
  const startTalk = () => {
    demo.stop();
    mic.stop();
    kanth.resetConversation();
    audio.unlock();
    setView("talk");
  };

  const goHome = () => {
    mic.stop();
    demo.stop();
    setView("home");
  };

  // Until the first answer from the server, everything shows a neutral "checking", never a red alarm.
  const checking = s.keyPresent === null;
  const ttsRaw = s.keyPresent === false ? "no-key" : s.services.tts?.state ?? "checking";
  const replaying = kanth.replaying;
  // With no connection, neither service can answer, whatever it last reported.
  const offline = !replaying && !checking && s.link === "closed";
  const ttsState = offline ? "down" : checking || ttsRaw === "connecting" ? "checking" : ttsRaw;
  const sttState = offline ? "down" : checking ? "checking" : s.services.stt?.state ?? (s.link === "open" ? "ready" : "checking");
  const linkState = replaying ? "degraded" : s.link === "open" ? "ready" : checking ? "checking" : s.link === "connecting" ? "checking" : "down";
  const linkLabel = replaying ? "Recorded run" : s.link === "open" ? "Online" : linkState === "checking" ? "Checking…" : "Offline";
  const sim = view === "talk" && (d.phase !== "idle" || FILM);

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" onClick={(e) => { e.preventDefault(); goHome(); }} aria-label="Kanth, home">
          <span className="brand-mark" aria-hidden="true"><span>कं</span></span>
          <span className="brand-name">Kanth</span>
          <span className="brand-native" lang="hi">कंठ</span>
        </a>
        {sim ? <span className="chip sim">Simulated conversation · every voice is Bulbul</span> : null}
        {mic.listening ? (
          <span className="chip mic-on" role="status">
            <span className="led busy" aria-hidden="true" />
            Microphone on
          </span>
        ) : null}
        {HOSTED ? <span className="chip hosted" title="The hosted demo sends speech to Saaras about every 0.7 s, so it drafts while they talk. Voice banking runs in the local version. See the README.">Hosted demo</span> : null}
        <div className="topbar-spacer" />
        <div className="pills" aria-label="Service status">
          <StatusChip label="Bulbul V4 Flash" short="Bulbul" state={ttsState} detail={s.services.tts?.detail} />
          <StatusChip label="Saaras" short="Saaras" state={sttState} detail={s.services.stt?.detail} />
          <StatusChip label={linkLabel} short={linkLabel} state={linkState} />
        </div>
        <a className="btn btn-soft btn-small gh" href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
        <button ref={settingsBtn} className="btn btn-soft btn-small" onClick={() => setSettingsOpen(true)} aria-haspopup="dialog">Settings</button>
      </header>

      {s.keyPresent !== false && s.services.tts?.detail === "Sarvam rejected the key" ? (
        <div className="banner" role="alert">
          {HOSTED ? (
            <>The demo's Sarvam key was rejected, so Kanth cannot speak live right now. Press Hear a conversation to watch a recorded run, or run Kanth locally with your own key.</>
          ) : (
            <>Sarvam rejected the API key on the server, so Kanth cannot speak yet. Check <code>SARVAM_API_KEY</code> and restart the server.</>
          )}
        </div>
      ) : null}
      {s.keyPresent === false ? (
        <div className="banner" role="alert">
          {HOSTED ? (
            <>The demo's server has no Sarvam key right now, so Kanth cannot speak live. Press Hear a conversation to watch a recorded run, or run Kanth locally with your own key.</>
          ) : (
            <>The server has no Sarvam key, so Kanth cannot speak yet. Stop the server and run <code>SARVAM_API_KEY=sk_... npm start</code>, or put the key in a <code>.env</code> file. The key stays on the server.</>
          )}
        </div>
      ) : null}

      {view === "home" ? (
        <Hero onDemo={startDemo} onTalk={startTalk} onFilm={() => setFilmOpen(true)} />
      ) : (
        <main className="main">
          <h1 className="sr-only">Talking with {s.partner?.who ?? "someone"}</h1>
          <div className="col">
            {FILM ? null : d.phase !== "idle" || d.error ? (
              <div className="strip" role="status">
                {d.error ? (
                  <span>{d.error}</span>
                ) : d.phase === "done" ? (
                  <>
                    <span className="scene">That was the demo.</span>
                    <span>
                      {d.replay
                        ? "That was a recorded run. Every reply in it was drafted by Sarvam-105B and voiced by Bulbul when it was recorded, and spoken only when chosen."
                        : "Every reply was drafted live, and spoken in Arjun's voice only when chosen."}
                    </span>
                    <span className="status">
                      <button className="btn btn-soft btn-small" onClick={() => void demo.run()} data-scan-top data-scan-order="7">Play again</button>
                      {/* A recorded run means live Saaras is not answering, so the microphone would be a dead end. */}
                      {d.replay ? null : <button className="btn btn-soft btn-small" onClick={startTalk} data-scan-top data-scan-order="7.5">Talk with your microphone</button>}
                    </span>
                  </>
                ) : (
                  <>
                    {d.replay ? (
                      <span className="replay-note">
                        Sarvam is not answering right now, so this is a recorded run of the same conversation. Every transcript, reply and voice in it came from Sarvam.
                      </span>
                    ) : null}
                    <span className="scene">Scene {Math.max(1, d.scene + 1)} of {SCENES.length}</span>
                    <span>{SCENES[Math.max(0, d.scene)]?.setting}</span>
                    <span className="status">
                      <span className={`led ${d.phase === "waiting" ? "ready" : "busy"}`} aria-hidden="true" />
                      {d.phase === "preparing"
                        ? "Preparing voices"
                        : d.phase === "partner"
                          ? "Listening"
                          : d.phase === "waiting"
                            ? d.replyStopped
                              ? "Stopped. Choose again."
                              : !s.cards.length && !s.drafting
                                ? "No replies this time. Choose a phrase, or type."
                                : "Your turn. Nothing is said until you choose."
                            : "Speaking"}
                      <button className="btn btn-soft btn-small" onClick={() => demo.stop()} data-dwell>Stop</button>
                    </span>
                  </>
                )}
              </div>
            ) : !s.partner && !s.history.length ? (
              // A stop for switch and dwell users, so nobody needs a mouse to start the demo from here.
              <div className="strip">
                <span>The demo needs no microphone. A mother, a doctor and a friend talk to Arjun, and you choose what he says.</span>
                <span className="status">
                  <button className="btn btn-soft btn-small" onClick={startDemo} data-scan-top data-scan-order="7">Hear a conversation</button>
                </span>
              </div>
            ) : null}
            <PartnerDisplay s={s} onListen={() => (mic.listening ? mic.stop() : void mic.start())} listening={mic.listening} scripted={sim} />
            <Replies s={s} />
            <SteerRow s={s} />
            <ToneDial s={s} />
            <Composer canSteer={!!s.partner?.final} />
            <Phrases phrases={otherPhrases} cached={cached} s={s} />
          </div>
          <aside className="col" aria-label="Emergency phrases, your voice and measurements">
            <Phrases phrases={urgentPhrases} cached={cached} s={s} urgent />
            <VoicePanel s={s} />
            <Meter s={s} />
            <History s={s} />
          </aside>
        </main>
      )}

      {scanPaused ? (
        <div className="scan-paused" role="status">Scanning paused. Press your switch to start again from the replies.</div>
      ) : scanRefused ? (
        <div className="scan-paused" role="status">New replies just arrived. Nothing was said. Press again when you have read them.</div>
      ) : null}
      {s.unspoken ? (
        <div className="unspoken" role="alert">
          <div className="unspoken-card">
            <div className="eyebrow">Not spoken aloud. Please show this screen.</div>
            <div className="unspoken-text" lang={s.unspoken.lang.slice(0, 2)}>{s.unspoken.text}</div>
            {s.unspoken.gloss ? <div className="hint" lang="en">{s.unspoken.gloss}</div> : null}
            <button className="btn btn-soft" onClick={() => kanth.dismissUnspoken()} data-dwell data-scan-top data-scan-order="0">Done</button>
          </div>
        </div>
      ) : null}
      {FILM ? null : <SiteFooter onFilm={() => setFilmOpen(true)} />}
      {filmOpen ? <FilmModal onClose={() => setFilmOpen(false)} /> : null}
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

function StatusChip({ label, short, state, detail }: { label: string; short: string; state: string; detail?: string }) {
  const word = ({ ready: "ready", checking: "checking", connecting: "connecting", degraded: "degraded", down: "unavailable", "no-key": "no key" } as Record<string, string>)[state] ?? state;
  return (
    <span className="chip" title={detail}>
      <span className={`led ${state}`} aria-hidden="true" />
      <span className="lbl">{label}</span>
      <span className="lbl-short" aria-hidden="true">{short}</span>
      <span className="sr-only">: {word}</span>
    </span>
  );
}
