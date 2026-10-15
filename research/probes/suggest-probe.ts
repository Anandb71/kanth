import { streamSuggestions } from "../../server/suggest.ts";
import type { Profile } from "../../shared/protocol.ts";
const profile: Profile = {
  name: "Arjun", languages: ["ta-IN", "en-IN", "hi-IN"], mixStyle: "Tamil with English words, Hindi with colleagues",
  people: [{ name: "Amma", relation: "mother", addressAs: "Amma" }, { name: "Dr. Mehra", relation: "neurologist", addressAs: "Doctor" }],
  notes: "Has ALS. Uses Kanth with a switch.",
};
const model = process.argv[2] ?? "sarvam-105b";
for (const [text, lang] of [["கண்ணா, சாப்பிட்டியா? ரசம் சூடா இருக்கு.", "ta-IN"], ["अर्जुन, आज pain कैसा है? One to ten में बताओ।", "hi-IN"], ["Bhai, कल match देखने चलेगा? Tickets मेरे पास हैं।", "hi-IN"]] as const) {
  const t0 = performance.now();
  const stats = await streamSuggestions({ profile, history: [], partner: { text, lang, who: lang === "ta-IN" ? "Amma" : text.startsWith("Bhai") ? "Rohit (friend)" : "Dr. Mehra" }, tone: "warm", model }, (d) =>
    console.log(`  +${Math.round(performance.now() - t0)}ms [${d.lang}] ${d.text}  ||  ${d.gloss}`));
  console.log(model, JSON.stringify(stats));
}
