export const REPO_URL = "https://github.com/Anandb71/kanth";
export const FILM_URL = "/media/kanth-demo.mp4";

/** Credit and links, on every screen. */
export function SiteFooter({ onFilm }: { onFilm: () => void }) {
  return (
    <footer className="site-footer">
      <span className="credit-line">
        Built with <b>Sarvam AI</b>: Bulbul V4 Flash for every word Kanth says, Saaras for listening, Sarvam-105B for drafting.
        An entry to the <b>Sarvam Bulbul Build Challenge</b>.
      </span>
      <span className="footer-links">
        <button className="link-btn" onClick={onFilm}>Watch the 70 s film</button>
        <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
        <a href={`${REPO_URL}#measured`} target="_blank" rel="noreferrer">How it was measured</a>
      </span>
    </footer>
  );
}

/** The demo film in a dialog, with captions burned in and sound. */
export function FilmModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="film-modal" role="dialog" aria-modal="true" aria-label="Kanth demo film" onClick={onClose}>
      <div className="film-modal-inner" onClick={(e) => e.stopPropagation()}>
        <video src={FILM_URL} poster="/media/poster.png" controls autoPlay playsInline />
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="hint">69 s, recorded from the app in film mode. A simulated conversation; every voice is Bulbul.</span>
          <button className="btn btn-soft btn-small" onClick={onClose} autoFocus>Close</button>
        </div>
      </div>
    </div>
  );
}
