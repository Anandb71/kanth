import { useEffect, useMemo, useRef, useState } from "react";
import type { KanthState } from "../lib/kanth.ts";
import { HOSTED, kanth } from "../lib/kanth.ts";
import type { AccessMethod, Theme } from "../lib/settings.ts";
import { DEMO_PROFILE } from "../lib/settings.ts";
import { recordWav } from "../lib/listen.ts";

const ACCESS: { id: AccessMethod; label: string; help: string }[] = [
  { id: "touch", label: "Touch or click", help: "Tap a reply, or press 1 to 4." },
  {
    id: "scan-auto",
    label: "One switch",
    help: "Kanth highlights each choice in turn. Press and release Space, Enter, or your switch to pick. Hold it down for about 1.5 seconds to jump straight to the emergency phrases: It hurts, Suction and Call the nurse.",
  },
  {
    id: "scan-step",
    label: "Two switches",
    help: "Tab or Right arrow moves. Press and release Space or Enter to pick. Hold Space or Enter for about 1.5 seconds to jump straight to the emergency phrases.",
  },
  { id: "dwell", label: "Dwell", help: "Rest the pointer on any choice to pick it: replies, phrases, steering words and tones. Works with head pointers and eye trackers." },
  { id: "blink", label: "Blink", help: "One switch scanning, where a deliberate blink is the switch. Uses the camera on this device only." },
];

const THEMES: { id: Theme; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "contrast", label: "High contrast" },
];

export function SettingsDrawer({ s, onClose }: { s: KanthState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab" || !ref.current) return;
      // Keep focus inside the drawer while it is open.
      const items = [...ref.current.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]")].filter((el) => !el.hasAttribute("disabled"));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const st = s.settings;
  const set = kanth.updateSettings.bind(kanth);

  const personas = useMemo(() => {
    const names = new Map<string, Set<string>>();
    for (const id of s.roster) {
      const [name, lang] = id.split("_");
      if (!name || !lang) continue;
      if (!names.has(name)) names.set(name, new Set());
      names.get(name)!.add(lang);
    }
    return [...names.entries()]
      .map(([name, langs]) => ({ name, langs: [...langs].sort() }))
      .sort((a, b) => b.langs.length - a.langs.length || a.name.localeCompare(b.name));
  }, [s.roster]);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="settings-h" ref={ref}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <h2 id="settings-h">Settings</h2>
          <button className="btn btn-soft btn-small" style={{ marginLeft: "auto" }} onClick={onClose}>Close</button>
        </div>

        <div className="field">
          <span className="label">How you choose</span>
          <div className="seg" role="group" aria-label="Access method">
            {ACCESS.map((a) => (
              <button key={a.id} aria-pressed={st.access === a.id} onClick={() => set({ access: a.id })}>{a.label}</button>
            ))}
          </div>
          <span className="hint">{ACCESS.find((a) => a.id === st.access)?.help}</span>
        </div>

        {st.access === "scan-auto" || st.access === "blink" ? (
          <div className="field">
            <label htmlFor="scan">Scan speed: {(st.scanIntervalMs / 1000).toFixed(1)} s per step</label>
            <input id="scan" type="range" min={500} max={4000} step={100} value={st.scanIntervalMs} onChange={(e) => set({ scanIntervalMs: Number(e.target.value) })} />
          </div>
        ) : null}
        {st.access === "dwell" ? (
          <div className="field">
            <label htmlFor="dwell">Dwell time: {(st.dwellMs / 1000).toFixed(1)} s</label>
            <input id="dwell" type="range" min={300} max={3000} step={100} value={st.dwellMs} onChange={(e) => set({ dwellMs: Number(e.target.value) })} />
          </div>
        ) : null}
        {st.access === "blink" ? (
          <div className="field">
            <label htmlFor="blink">Blink must last at least {st.blinkHoldMs} ms</label>
            <input id="blink" type="range" min={120} max={800} step={20} value={st.blinkHoldMs} onChange={(e) => set({ blinkHoldMs: Number(e.target.value) })} />
            <span className="hint">Longer than a natural blink, so ordinary blinking does not select anything.</span>
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="scale">Text size: {Math.round(st.textScale * 100)}%</label>
          <input id="scale" type="range" min={0.85} max={1.6} step={0.05} value={st.textScale} onChange={(e) => set({ textScale: Number(e.target.value) })} />
        </div>

        <div className="field">
          <span className="label">Theme</span>
          <div className="seg" role="group" aria-label="Theme">
            {THEMES.map((t) => (
              <button key={t.id} aria-pressed={st.theme === t.id} onClick={() => set({ theme: t.id })}>{t.label}</button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label">Show English meaning under replies</span>
          <div className="seg">
            <button aria-pressed={st.showGloss} onClick={() => set({ showGloss: true })}>Show</button>
            <button aria-pressed={!st.showGloss} onClick={() => set({ showGloss: false })}>Hide</button>
          </div>
        </div>

        <div className="field">
          <span className="label">Voice replies before I choose</span>
          <div className="seg">
            <button aria-pressed={st.prespeak} onClick={() => set({ prespeak: true })}>On</button>
            <button aria-pressed={!st.prespeak} onClick={() => set({ prespeak: false })}>Off (for comparison)</button>
          </div>
          <span className="hint">With prespeak on, Kanth voices all four replies while you read them, and plays the one you choose instantly. Nothing is played until you choose.</span>
        </div>

        <div className="field">
          <span className="label">Draft while they talk</span>
          <div className="seg">
            <button aria-pressed={st.speculate} onClick={() => set({ speculate: true })}>On</button>
            <button aria-pressed={!st.speculate} onClick={() => set({ speculate: false })}>Off (fewer API calls)</button>
          </div>
          <span className="hint">Kanth starts drafting and voicing replies from the words heard so far, so they are often ready the moment the other person stops. If the end of their sentence changes the meaning, Kanth drafts again.</span>
        </div>

        <div className="field">
          <span className="label">Voice</span>
          <select
            value={st.voice.kind === "persona" ? st.voice.name : "__clone"}
            onChange={(e) => e.target.value !== "__clone" && set({ voice: { kind: "persona", name: e.target.value } })}
            aria-label="Bulbul voice"
          >
            {st.voice.kind === "clone" ? <option value="__clone">{st.voice.label} (your banked voice)</option> : null}
            {personas.map((p) => (
              <option key={p.name} value={p.name}>{p.name} · {p.langs.join(", ")}</option>
            ))}
          </select>
          <span className="hint">Bulbul personas cover some languages each. Where a voice has no persona for a language, Kanth uses the closest available one and says so. A banked voice speaks every language.</span>
        </div>

        {HOSTED ? (
          <div className="field card-soft">
            <span className="label">Bank your own voice</span>
            <span className="hint">Voice banking runs only in the local version, so recordings of real voices never pass through a public demo. Run Kanth locally with your own Sarvam key to use it.</span>
          </div>
        ) : (
          <VoiceBank s={s} />
        )}

        <div className="field">
          <span className="label">Profile</span>
          <span className="hint">Drafts use your name, the people in your life, and how you mix languages. Stored on this device only.</span>
          {s.profile.name === "Arjun" ? (
            <span className="hint" style={{ color: "var(--accent)", fontWeight: 650 }}>
              This is the demo profile for Arjun, a fictional user. Replace it with your own before real use.
            </span>
          ) : null}
          <ProfileEditor s={s} />
        </div>
      </div>
    </>
  );
}

function ProfileEditor({ s }: { s: KanthState }) {
  const [draft, setDraft] = useState(() => JSON.stringify(s.profile, null, 2));
  const [err, setErr] = useState("");
  return (
    <div className="field">
      <textarea rows={10} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Profile as JSON" style={{ fontFamily: "var(--font-mono)", fontSize: 13 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-soft btn-small"
          onClick={() => {
            try {
              kanth.updateProfile(JSON.parse(draft));
              setErr("Saved.");
            } catch (e) {
              setErr(`Not saved: ${(e as Error).message}`);
            }
          }}
        >
          Save profile
        </button>
        <button className="btn btn-soft btn-small" onClick={() => { kanth.updateProfile(DEMO_PROFILE); setDraft(JSON.stringify(DEMO_PROFILE, null, 2)); }}>Reset to demo</button>
        <button
          className="btn btn-soft btn-small"
          onClick={() => {
            const blank = { name: "Your name", languages: ["en-IN"], mixStyle: "How you mix languages, in your words", people: [{ name: "Amma", relation: "mother", addressAs: "Amma" }], notes: "" };
            setDraft(JSON.stringify(blank, null, 2));
            setErr("Edit the fields, then Save profile.");
          }}
        >
          Start my own
        </button>
        <span className="hint" role="status">{err}</span>
      </div>
    </div>
  );
}

/** Bank a voice with Sarvam Instant Voice Cloning. Consent comes first, always. */
function VoiceBank({ s }: { s: KanthState }) {
  const [name, setName] = useState("");
  const [own, setOwn] = useState(false);
  const [understand, setUnderstand] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const consentOk = name.trim().length > 1 && own && understand;
  const script = `My name is ${name.trim() || "____"}. I am recording my voice so that Kanth can speak for me, in my own voice, only when I choose what to say.`;

  const create = async (audioB64: string, demoReference: boolean) => {
    setBusy(true);
    setStatus("Banking voice…");
    try {
      const res = await fetch("/api/voices/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: demoReference ? "Arjun (demo voice)" : `${name.trim()}'s voice`,
          audio: audioB64,
          consent: { speakerName: demoReference ? "Bulbul generated reference" : name.trim(), statement: demoReference ? "Reference clip generated by Bulbul. No real person's voice." : script, at: new Date().toISOString(), demoReference },
        }),
      });
      const body = (await res.json()) as { voiceId?: string; name?: string; error?: string };
      if (!res.ok || !body.voiceId) throw new Error(body.error ?? `HTTP ${res.status}`);
      kanth.updateSettings({ voice: { kind: "clone", voiceId: body.voiceId, label: body.name ?? "Banked voice" } });
      setStatus("Done. Kanth now speaks in this voice, in every language.");
    } catch (e) {
      setStatus(`Could not bank the voice: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field card-soft">
      <span className="label">Bank your own voice</span>
      <span className="hint">Ten to fifteen seconds of speech is enough for Sarvam Instant Voice Cloning. Traditional voice banking asks for hundreds of sentences.</span>
      <label htmlFor="vb-name">Your name</label>
      <input id="vb-name" type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      <label className="check">
        <input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} /> This is my own voice, or the speaker has given me permission to bank it.
      </label>
      <label className="check">
        <input type="checkbox" checked={understand} onChange={(e) => setUnderstand(e.target.checked)} /> I understand the recording is sent to Sarvam to create the voice, and that Kanth only ever speaks what I choose.
      </label>
      {consentOk ? <div className="hint">Read this aloud when recording. It is your consent and your reference clip in one: <em>“{script}”</em></div> : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          className="btn btn-primary"
          disabled={!consentOk || busy}
          onClick={async () => {
            setStatus("Recording for 14 seconds. Read the sentence above.");
            const wav = await recordWav(14000);
            if (!wav) return setStatus("The microphone was not available.");
            await create(wav, false);
          }}
        >
          Record and bank
        </button>
        <button
          className="btn btn-soft"
          disabled={busy}
          onClick={async () => {
            setStatus("Generating a reference clip with Bulbul…");
            const r = await fetch("/api/voices/demo-reference", { method: "POST" });
            const body = (await r.json()) as { audio?: string; error?: string };
            if (!body.audio) return setStatus(`Could not make the demo reference: ${body.error ?? r.status}`);
            await create(body.audio, true);
          }}
        >
          Use the demo voice instead
        </button>
        <label className="btn btn-soft" style={{ cursor: consentOk && !busy ? "pointer" : "not-allowed", opacity: consentOk && !busy ? 1 : 0.55 }}>
          Upload an old recording
          <input
            type="file"
            accept="audio/wav,audio/x-wav,.wav"
            disabled={!consentOk || busy}
            style={{ display: "none" }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 6 * 1024 * 1024) return setStatus("That file is too large. Use 10 to 15 seconds of WAV audio.");
              const bytes = new Uint8Array(await f.arrayBuffer());
              let bin = "";
              for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
              await create(btoa(bin), false);
            }}
          />
        </label>
      </div>
      <span className="hint">Someone who can no longer speak can use an old voice note, saved as WAV, recorded before their speech changed. The same consent applies.</span>
      <span className="hint">The demo voice is cloned from a clip that Bulbul itself generated, so no real person's voice is involved.</span>
      {s.settings.voice.kind === "clone" ? (
        <button className="btn btn-soft btn-small" onClick={() => kanth.updateSettings({ voice: { kind: "persona", name: "shubh" } })}>Stop using the banked voice</button>
      ) : null}
      <span className="hint" role="status">{status}</span>
    </div>
  );
}
