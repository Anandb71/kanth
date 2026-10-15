import { useEffect, useRef } from "react";

export const REPO_URL = "https://github.com/Anandb71/kanth";
export const FILM_URL = "/media/kanth-demo.mp4";

/** Credit and links, on every screen. */
export function SiteFooter({ onFilm }: { onFilm: () => void }) {
  return (
    <footer className="site-footer">
      <span className="credit-line">
        Built with <b>Sarvam AI</b>: Bulbul voices what Kanth says (V4 Flash; v3 for Malayalam and Odia), Saaras listens, Sarvam-105B drafts.
        An entry to the <b>Sarvam Bulbul Build Challenge</b>.
      </span>
      <span className="footer-links">
        <button className="link-btn" onClick={onFilm}>Watch the 80 s film</button>
        <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
        <a href={`${REPO_URL}#measured`} target="_blank" rel="noreferrer">How it was measured</a>
      </span>
    </footer>
  );
}

/** The demo film in a dialog, with captions burned in and sound. Escape closes it. */
export function FilmModal({ onClose }: { onClose: () => void }) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="film-modal" role="dialog" aria-modal="true" aria-label="Kanth demo film" onClick={onClose}>
      <div className="film-modal-inner" onClick={(e) => e.stopPropagation()}>
        <video src={FILM_URL} poster="/media/poster.png" controls autoPlay playsInline />
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="hint">80 s, recorded from the app in film mode. A simulated conversation; every voice is Bulbul.</span>
          <button className="btn btn-soft btn-small" onClick={onClose} autoFocus data-dwell>Close</button>
        </div>
      </div>
    </div>
  );
}
