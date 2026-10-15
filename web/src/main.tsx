import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/noto-sans/400.css";
import "@fontsource/noto-sans/500.css";
import "@fontsource/noto-sans/600.css";
import "@fontsource/noto-sans/700.css";
import "@fontsource/noto-sans-tamil/400.css";
import "@fontsource/noto-sans-tamil/500.css";
import "@fontsource/noto-sans-tamil/600.css";
import "@fontsource/noto-sans-devanagari/400.css";
import "@fontsource/noto-sans-devanagari/500.css";
import "@fontsource/noto-sans-devanagari/600.css";
import "@fontsource/noto-sans-bengali/500.css";
import "@fontsource/noto-sans-telugu/500.css";
import "@fontsource/noto-sans-kannada/500.css";
import "@fontsource/noto-sans-gujarati/500.css";
import "@fontsource/noto-sans-gurmukhi/500.css";
import "@fontsource/noto-sans-malayalam/500.css";
import "@fontsource/noto-sans-oriya/500.css";
import "@fontsource-variable/fraunces";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "./styles.css";
import { App } from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ("serviceWorker" in navigator && location.hostname !== "") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline support unavailable in this browser */
    });
  });
}

// Handles for automation (the demo film and end-to-end checks). Nothing secret lives in the browser.
import { kanth } from "./lib/kanth.ts";
import { audio } from "./lib/audio.ts";
import { demo } from "./lib/demo.ts";
Object.assign(window, { kanth, kanthAudio: audio, kanthDemo: demo });
