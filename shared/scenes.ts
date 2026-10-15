// The demo's scripted conversation partner. Shared by the browser demo and the script that
// pre-generates the partner's audio (scripts/make-static-audio.ts).
import type { LangCode } from "./voices.ts";

export interface Scene {
  who: string;
  speaker: string;
  lang: LangCode;
  text: string;
  gloss: string;
  setting: string;
  /** Film mode only: words that suggest which reply a simulated user would pick. */
  pickHint?: string[];
}

export const SCENES: Scene[] = [
  {
    who: "Amma",
    speaker: "kavitha_te_conversation",
    lang: "ta-IN",
    text: "கண்ணா, சாப்பிட்டியா? ரசம் சூடா இருக்கு.",
    gloss: "Have you eaten, dear? The rasam is hot.",
    setting: "Home, Chennai. His mother, in Tamil.",
    pickHint: ["minute", "later", "wait", "not yet"],
  },
  {
    who: "Dr. Mehra",
    speaker: "ritu_hi_medical",
    lang: "hi-IN",
    text: "अर्जुन, आज pain कैसा है? One to ten में बताओ।",
    gloss: "Arjun, how is the pain today? Tell me on a scale of one to ten.",
    setting: "Clinic visit. His neurologist, in Hinglish.",
    pickHint: ["four", "4", "three", "3", "better", "little"],
  },
  {
    who: "Rohit",
    speaker: "rehan_hi_social",
    lang: "hi-IN",
    text: "भाई, Sunday को India का match है। मैं van book कर दूँ?",
    gloss: "Brother, India is playing on Sunday. Should I book the van?",
    setting: "A friend calls by. In Hindi.",
    pickHint: ["yes", "book", "definitely", "sure", "come"],
  },
];
