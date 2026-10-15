import { Orb } from "./Orb.tsx";

export function Hero({ onDemo, onTalk }: { onDemo: () => void; onTalk: () => void }) {
  return (
    <main className="hero">
      <div className="hero-copy">
        <h1>
          A reply that arrives a minute late is <em>not a conversation.</em>
        </h1>
        <p className="lede">
          Kanth listens to the person in front of you, drafts four replies in your language, and has every one of them
          already spoken by Bulbul V4 Flash before you choose. You pick. It speaks, instantly. Tamil, Hindi, English, and
          the way you mix them.
        </p>
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={onDemo} autoFocus>
            Hear a conversation
          </button>
          <button className="btn btn-soft" onClick={onTalk}>
            Start talking
          </button>
        </div>
        <p className="hint" style={{ margin: 0 }}>
          No microphone needed. In the demo, a mother, a doctor and a friend talk to Arjun, a fictional man with ALS, and you choose what he says.
        </p>
      </div>
      <div className="hero-art">
        <Orb />
      </div>
      <div className="facts">
        <div className="fact">
          <b>160–200</b>
          <span>words per minute in everyday conversation</span>
          <cite>Yuan, Liberman and Cieri, 2006</cite>
        </div>
        <div className="fact">
          <b>under 10</b>
          <span>words per minute for most people who talk with AAC, and 1.7 with switch scanning</span>
          <cite>Koester and Arthanat, 2018; Trnka et al., 2007</cite>
        </div>
        <div className="fact">
          <b>0–200 ms</b>
          <span>the usual gap before a reply. Gaps of 700 ms or more sound reluctant</span>
          <cite>Levinson and Torreira, 2015; Stivers et al., 2009</cite>
        </div>
      </div>
    </main>
  );
}
