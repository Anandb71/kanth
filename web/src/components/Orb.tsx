import { useEffect, useRef, type CSSProperties } from "react";
import { audio, type Channel } from "../lib/audio.ts";

/**
 * The voice orb. Its rings swell with the real loudness of the audio Kanth is playing,
 * read from a Web Audio analyser, so what you see is the voice you hear.
 */
export function Orb({ channel = "me", size, glyph = "कंठ", live = true }: { channel?: Channel; size?: number; glyph?: string; live?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!live) return;
    let raf = 0;
    let smooth = 0;
    const tick = () => {
      const target = audio.ctx ? audio.level(channel) : 0;
      smooth = smooth * 0.65 + target * 0.35;
      const el = ref.current;
      if (el) {
        el.style.setProperty("--level", smooth.toFixed(3));
        el.classList.toggle("idle", smooth < 0.02);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [channel, live]);
  return (
    <div ref={ref} className={`orb idle ${channel === "partner" ? "partner" : ""}`} style={size ? ({ "--size": `${size}px` } as CSSProperties) : undefined} aria-hidden="true">
      <div className="orb-ring" />
      <div className="orb-well" />
      <div className="orb-wave" />
      <div className="orb-wave w2" />
      <div className="orb-core" lang="hi">{glyph}</div>
    </div>
  );
}
