// Audio that never changes ships with the site (scripts/make-static-audio.ts): the demo partner's lines
// and the always-ready phrases in the default voice. Loading them is instant, works offline, and spends
// no synthesis. Anything not in the manifest is synthesized live as usual.
import { audio } from "./audio.ts";

interface Manifest {
  entries: Record<string, { file: string; samples: number }>;
}

let manifest: Promise<Manifest | null> | null = null;

function loadManifest(): Promise<Manifest | null> {
  manifest ??= fetch("/cache/manifest.json")
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
    .catch(() => null);
  return manifest;
}

/** Loads a pre-generated utterance into the audio engine. Resolves false if there is none. */
export async function loadStaticAudio(id: string): Promise<boolean> {
  const m = await loadManifest();
  const entry = m?.entries[id];
  if (!entry) return false;
  try {
    const r = await fetch(`/cache/${entry.file}`);
    if (!r.ok) return false;
    const pcm = new Int16Array(await r.arrayBuffer());
    const f = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) f[i] = pcm[i]! / 32768;
    audio.loadSamples(id, f);
    return true;
  } catch {
    return false;
  }
}
