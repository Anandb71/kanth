// HELD-OUT scripted test set for the Kanth conversation benchmark (v2). NOT real users, NOT real transcripts.
//
// 24 partner turns in 9 short threads: 8 Tamil, 8 Hindi/Hinglish, 8 Indian English. Same user
// ("Arjun", the fictional demo user: 34, ALS, Chennai), same format and conventions as
// bench/conversations.data.ts, but every turn is new and none of these partners or topics appear
// in the original 36. Partners: elder sister, physiotherapist, office colleagues, hospital ward
// nurse, electronics shopkeeper, speech therapist, college friend, bank officer.
//
// Written on 2026-10-15, AFTER the prompt fix in server/suggest.ts and BEFORE any model draft for
// these turns existed. Nothing in this file was run through Kanth before it was written, and the
// `intended` replies are fixed: they must not be edited after seeing model output. This set did not
// motivate the prompt fix, so its hit rate is the unbiased estimate; the original 36 did.
//
// Like the original set, the intended replies are deliberately specific where a real reply would be
// (a duration, a day, a price, a side effect, a name), so a modest hit rate is expected.
//
// Script convention (same as the original): Tamil and Hindi words in their own script, English
// words in Latin script.
import type { ScriptedTurn } from "./conversations.data.ts";

export const SET_LABEL =
  "Held-out scripted set (hand-written, not real users; written after the prompt fix and before any model output for these turns; intended replies never edited)";

export const TURNS: ScriptedTurn[] = [
  // ---------------- Tamil (8) ----------------
  // ta-h1: elder sister visiting with her children
  { id: "tah01", thread: "ta-h1", lang: "ta-IN", who: "Divya", relation: "elder sister", setting: "home, Sunday visit",
    partner: "தம்பி, பசங்க உன்ன பாக்கணும்னு அடம் பிடிச்சாங்க. உள்ள கூட்டிட்டு வரட்டுமா?",
    intended: "கூட்டிட்டு வா அக்கா, ரொம்ப நாளாச்சு" },
  { id: "tah02", thread: "ta-h1", lang: "ta-IN", who: "Divya", relation: "elder sister", setting: "home, Sunday visit",
    partner: "சின்னவன் உனக்கு ஒரு drawing வரைஞ்சிருக்கான். பாக்கறியா?",
    intended: "காட்டு, அதை சுவர்ல ஒட்டி வை" },
  { id: "tah03", thread: "ta-h1", lang: "ta-IN", who: "Divya", relation: "elder sister", setting: "home, Sunday visit",
    partner: "உனக்காக பொங்கல் கொண்டு வந்திருக்கேன். இப்பவே சாப்பிடறியா?",
    intended: "இப்போ வேண்டாம், ராத்திரிக்கு வச்சுடு" },

  // ta-h2: physiotherapist at home
  { id: "tah04", thread: "ta-h2", lang: "ta-IN", who: "Selvi", relation: "physiotherapist", setting: "home, physiotherapy",
    partner: "Sir, இன்னிக்கு standing frame-ல பத்து நிமிஷம் நிக்கலாமா?",
    intended: "அஞ்சு நிமிஷம் மட்டும், கால் வலிக்குது" },
  { id: "tah05", thread: "ta-h2", lang: "ta-IN", who: "Selvi", relation: "physiotherapist", setting: "home, physiotherapy",
    partner: "Neck collar சரியா இருக்கா? இன்னும் கொஞ்சம் tight பண்ணட்டுமா?",
    intended: "கொஞ்சம் loose பண்ணுங்க, மூச்சு முட்டுது" },
  { id: "tah06", thread: "ta-h2", lang: "ta-IN", who: "Selvi", relation: "physiotherapist", setting: "home, physiotherapy",
    partner: "அடுத்த session வியாழக்கிழமை வச்சுக்கலாமா?",
    intended: "வியாழன் முடியாது, வெள்ளிக்கிழமை வாங்க" },

  // ta-h3: office colleague visiting
  { id: "tah07", thread: "ta-h3", lang: "ta-IN", who: "Suresh", relation: "office colleague", setting: "home visit",
    partner: "Bro, உன் project-அ நான் take over பண்ணிருக்கேன். Documentation எங்க இருக்கு?",
    intended: "Confluence-ல என் page-ல எல்லாம் இருக்கு" },
  { id: "tah08", thread: "ta-h3", lang: "ta-IN", who: "Suresh", relation: "office colleague", setting: "home visit",
    partner: "Client meeting-ல உன்ன பத்தி கேட்டாங்க. ஏதாவது சொல்லணுமா?",
    intended: "என் thanks சொல்லு, ரொம்ப support பண்ணாங்க" },

  // ---------------- Hindi / Hinglish (8) ----------------
  // hi-h1: ward nurse, hospital admission for a feeding tube
  { id: "hih01", thread: "hi-h1", lang: "hi-IN", who: "Nurse Anjali", relation: "ward nurse", setting: "hospital ward",
    partner: "Arjun जी, feeding tube से खाना देने का time हो गया। अभी दे दूँ?",
    intended: "दे दीजिए, पर धीरे धीरे" },
  { id: "hih02", thread: "hi-h1", lang: "hi-IN", who: "Nurse Anjali", relation: "ward nurse", setting: "hospital ward",
    partner: "पेट में कोई दर्द या भारीपन तो नहीं लग रहा?",
    intended: "थोड़ा भारी लग रहा है, शायद gas है" },
  { id: "hih03", thread: "hi-h1", lang: "hi-IN", who: "Nurse Anjali", relation: "ward nurse", setting: "hospital ward",
    partner: "ठीक है, मैं doctor को बता देती हूँ। Bed थोड़ा ऊपर कर दूँ?",
    intended: "हाँ, थोड़ा और ऊपर कर दीजिए" },

  // hi-h2: electronics shop, face to face
  { id: "hih04", thread: "hi-h2", lang: "hi-IN", who: "Shopkeeper", relation: "electronics shopkeeper", setting: "errand, electronics shop",
    partner: "Sir, ये tablet stand ले लीजिए, wheelchair पर fit हो जाएगा। दिखाऊँ?",
    intended: "हाँ दिखाइए, पर clamp मज़बूत होना चाहिए" },
  { id: "hih05", thread: "hi-h2", lang: "hi-IN", who: "Shopkeeper", relation: "electronics shopkeeper", setting: "errand, electronics shop",
    partner: "ये वाला दो हज़ार का है, और ये साढ़े तीन हज़ार का। कौन सा दूँ?",
    intended: "दो हज़ार वाला ठीक है" },
  { id: "hih06", thread: "hi-h2", lang: "hi-IN", who: "Shopkeeper", relation: "electronics shopkeeper", setting: "errand, electronics shop",
    partner: "Warranty एक साल की है। Bill किस नाम से बनाऊँ?",
    intended: "मेरे नाम से बनाइए, Arjun" },

  // hi-h3: colleague from the Delhi office visiting
  { id: "hih07", thread: "hi-h3", lang: "hi-IN", who: "Vikram", relation: "colleague from the Delhi office", setting: "home visit",
    partner: "यार, team ने तेरे लिए एक card भेजा है। पढ़ के सुनाऊँ?",
    intended: "हाँ, ज़रूर पढ़ के सुना" },
  { id: "hih08", thread: "hi-h3", lang: "hi-IN", who: "Vikram", relation: "colleague from the Delhi office", setting: "home visit",
    partner: "अगले महीने office party है। तू online join करेगा?",
    intended: "Video पर join करूँगा, link भेज देना" },

  // ---------------- Indian English (8) ----------------
  // en-h1: speech and language therapist, clinic
  { id: "enh01", thread: "en-h1", lang: "en-IN", who: "Dr. Shalini", relation: "speech and language therapist", setting: "clinic, AAC review",
    partner: "Arjun, how are you finding the eye-gaze board? Is it tiring your eyes?",
    intended: "My eyes get dry after twenty minutes." },
  { id: "enh02", thread: "en-h1", lang: "en-IN", who: "Dr. Shalini", relation: "speech and language therapist", setting: "clinic, AAC review",
    partner: "We could try a bigger font on the screen. Would that help?",
    intended: "Yes, bigger font and a darker background." },
  { id: "enh03", thread: "en-h1", lang: "en-IN", who: "Dr. Shalini", relation: "speech and language therapist", setting: "clinic, AAC review",
    partner: "Shall we meet again in two weeks to see how it's going?",
    intended: "Two weeks is fine, mornings are better for me." },

  // en-h2: college friend visiting
  { id: "enh04", thread: "en-h2", lang: "en-IN", who: "Meera", relation: "college friend", setting: "home visit",
    partner: "Arjun! I got you that Murakami book you wanted. Shall I read you a chapter?",
    intended: "Not today, I'd rather just chat with you." },
  { id: "enh05", thread: "en-h2", lang: "en-IN", who: "Meera", relation: "college friend", setting: "home visit",
    partner: "Okay! So did you finish the new season of that series we were talking about?",
    intended: "Only two episodes, I keep falling asleep." },
  { id: "enh06", thread: "en-h2", lang: "en-IN", who: "Meera", relation: "college friend", setting: "home visit",
    partner: "Also, I'm moving to Bangalore next month for a new job.",
    intended: "Congratulations! Visit me whenever you're in Chennai." },

  // en-h3: bank branch, face to face
  { id: "enh07", thread: "en-h3", lang: "en-IN", who: "Bank officer", relation: "bank officer", setting: "errand, bank branch",
    partner: "Sir, for the KYC update we need your signature. Can you sign, or shall we take a thumb impression?",
    intended: "Thumb impression please, I can't hold a pen." },
  { id: "enh08", thread: "en-h3", lang: "en-IN", who: "Bank officer", relation: "bank officer", setting: "errand, bank branch",
    partner: "Done. Would you also like to add a nominee to this account?",
    intended: "Yes, please add my mother as nominee." },
];
