// SCRIPTED test set for the Kanth conversation benchmark. NOT real users, NOT real transcripts.
//
// 36 partner turns in 12 short threads (3 turns each): 12 Tamil, 12 Hindi/Hinglish, 12 Indian English.
// The scenario is daily life for "Arjun", the fictional demo user (34, ALS, Chennai), at home,
// at the clinic, with a home nurse or attendant, with friends, and on errands where he speaks
// face to face (no phone calls).
//
// `intended` is what the user actually wants to say in reply. Every intended reply was written by
// hand on 2026-10-15 BEFORE any model draft for these turns was generated, and none was edited
// after seeing model output. They are deliberately specific (a time, a side, a drug name, a
// preference), because real replies are specific; a modest hit rate is therefore expected.
//
// Script convention (matches Saaras `codemix` output and what Bulbul wants): Tamil and Hindi words
// in their own script, English words in Latin script.
import type { LangCode } from "../shared/voices.ts";

export interface ScriptedTurn {
  id: string;
  thread: string;
  lang: LangCode;
  /** Who is speaking to the user, as Kanth would label them. */
  who: string;
  /** Relation, for the report. */
  relation: string;
  setting: string;
  partner: string;
  intended: string;
}

export const SET_LABEL = "Scripted (hand-written, not real users); intended replies fixed before any model output";

export const TURNS: ScriptedTurn[] = [
  // ---------------- Tamil (12) ----------------
  // ta-1: Amma, breakfast and lunch at home
  { id: "ta01", thread: "ta-1", lang: "ta-IN", who: "Amma", relation: "mother", setting: "home, breakfast",
    partner: "கண்ணா, டிபன் ரெடி. இட்லி சாப்பிடறியா இல்ல dosa வேணுமா?",
    intended: "இட்லி போதும் Amma, ரெண்டு மட்டும்" },
  { id: "ta02", thread: "ta-1", lang: "ta-IN", who: "Amma", relation: "mother", setting: "home, breakfast",
    partner: "சட்னி கொஞ்சம் காரமா இருக்கு, பரவாயில்லையா?",
    intended: "பரவாயில்ல Amma, பக்கத்துல தண்ணி வச்சுடுங்க" },
  { id: "ta03", thread: "ta-1", lang: "ta-IN", who: "Amma", relation: "mother", setting: "home, breakfast",
    partner: "மதியம் உனக்கு பிடிச்ச ரசம் வைக்கட்டுமா?",
    intended: "ஆமா Amma, ரசம் சாதம் வேணும்" },

  // ta-2: home nurse
  { id: "ta04", thread: "ta-2", lang: "ta-IN", who: "Sister Kavitha", relation: "home nurse", setting: "home, nursing care",
    partner: "Sir, suction பண்ணட்டுமா? சத்தம் கேக்குது.",
    intended: "சரி, பண்ணுங்க. தொண்டை அடைக்குது" },
  { id: "ta05", thread: "ta-2", lang: "ta-IN", who: "Sister Kavitha", relation: "home nurse", setting: "home, nursing care",
    partner: "Position மாத்தணுமா? ரொம்ப நேரமா இதே பக்கம் இருக்கீங்க.",
    intended: "ஆமா, இடது பக்கம் திருப்புங்க" },
  { id: "ta06", thread: "ta-2", lang: "ta-IN", who: "Sister Kavitha", relation: "home nurse", setting: "home, nursing care",
    partner: "BP check பண்ணிட்டேன், கொஞ்சம் low-ஆ இருக்கு. தலை சுத்துதா?",
    intended: "இல்ல, ஆனா கொஞ்சம் tired-ஆ இருக்கு" },

  // ta-3: school friend, cricket evening
  { id: "ta07", thread: "ta-3", lang: "ta-IN", who: "Karthik", relation: "school friend", setting: "home visit",
    partner: "டேய், இன்னிக்கு India match பாக்கலாமா? நான் வீட்டுக்கு வரேன்.",
    intended: "வா டா, ஏழு மணிக்கு வா" },
  { id: "ta08", thread: "ta-3", lang: "ta-IN", who: "Karthik", relation: "school friend", setting: "home visit",
    partner: "என்ன வாங்கிட்டு வரட்டும்? Biryani ஓகேவா?",
    intended: "நீ வாங்கிக்கோ, நான் Amma ரசம் சாப்பிடறேன்" },
  { id: "ta09", thread: "ta-3", lang: "ta-IN", who: "Karthik", relation: "school friend", setting: "home visit",
    partner: "Office-ல எல்லாரும் உன்ன கேட்டாங்க டா. என்ன சொல்லட்டும்?",
    intended: "நான் நல்லா இருக்கேன்னு சொல்லு, எல்லாரையும் miss பண்றேன்" },

  // ta-4: medical shop, face to face
  { id: "ta10", thread: "ta-4", lang: "ta-IN", who: "Pharmacist", relation: "pharmacist at the medical shop", setting: "errand, medical shop",
    partner: "Sir, இந்த tablet stock இல்ல. வேற brand குடுக்கட்டுமா?",
    intended: "Same salt-ஆ இருந்தா குடுங்க" },
  { id: "ta11", thread: "ta-4", lang: "ta-IN", who: "Pharmacist", relation: "pharmacist at the medical shop", setting: "errand, medical shop",
    partner: "Total ஆயிரத்து இருநூறு ரூபாய். GPay-ஆ cash-ஆ?",
    intended: "GPay பண்றேன், QR காட்டுங்க" },
  { id: "ta12", thread: "ta-4", lang: "ta-IN", who: "Pharmacist", relation: "pharmacist at the medical shop", setting: "errand, medical shop",
    partner: "Syrup அடுத்த வாரம் தான் வரும். Home delivery பண்ணட்டுமா?",
    intended: "ஆமா, delivery பண்ணுங்க, அதே address தான்" },

  // ---------------- Hindi / Hinglish (12) ----------------
  // hi-1: neurologist, clinic
  { id: "hi01", thread: "hi-1", lang: "hi-IN", who: "Dr. Mehra", relation: "neurologist", setting: "clinic, follow-up",
    partner: "Arjun, पिछले हफ्ते से कैसा feel हो रहा है? कोई नई problem?",
    intended: "निगलने में थोड़ी दिक्कत बढ़ गई है" },
  { id: "hi02", thread: "hi-1", lang: "hi-IN", who: "Dr. Mehra", relation: "neurologist", setting: "clinic, follow-up",
    partner: "रात को नींद ठीक आती है? लेटने पर साँस लेने में तकलीफ़ होती है?",
    intended: "हाँ, लेटने पर साँस फूलती है" },
  { id: "hi03", thread: "hi-1", lang: "hi-IN", who: "Dr. Mehra", relation: "neurologist", setting: "clinic, follow-up",
    partner: "तो हम रात के लिए BiPAP start करते हैं। कोई सवाल?",
    intended: "क्या mask पूरी रात पहनना पड़ेगा?" },

  // hi-2: college friend visiting from Delhi
  { id: "hi04", thread: "hi-2", lang: "hi-IN", who: "Rohit", relation: "college friend", setting: "home visit",
    partner: "भाई, Delhi से सिर्फ तुझसे मिलने आया हूँ! कैसा है तू?",
    intended: "अरे Rohit! तुझे देखकर बहुत अच्छा लगा" },
  { id: "hi05", thread: "hi-2", lang: "hi-IN", who: "Rohit", relation: "college friend", setting: "home visit",
    partner: "कल का match देखा? Kohli ने क्या खेला यार!",
    intended: "हाँ देखा, last over में मज़ा आ गया" },
  { id: "hi06", thread: "hi-2", lang: "hi-IN", who: "Rohit", relation: "college friend", setting: "home visit",
    partner: "चल, कल Marina beach चलते हैं। Wheelchair मैं संभाल लूँगा।",
    intended: "शाम को चलेंगे, धूप में नहीं" },

  // hi-3: home attendant
  { id: "hi07", thread: "hi-3", lang: "hi-IN", who: "Ramesh", relation: "home attendant", setting: "home, morning routine",
    partner: "भैया, नहाने का पानी गरम कर दिया है। अभी नहाएँगे?",
    intended: "दस मिनट रुको, पहले चाय पीनी है" },
  { id: "hi08", thread: "hi-3", lang: "hi-IN", who: "Ramesh", relation: "home attendant", setting: "home, morning routine",
    partner: "चाय में चीनी कम डालूँ ना?",
    intended: "हाँ, बस आधा चम्मच" },
  { id: "hi09", thread: "hi-3", lang: "hi-IN", who: "Ramesh", relation: "home attendant", setting: "home, morning routine",
    partner: "आज physiotherapy वाले चार बजे आएँगे, याद है?",
    intended: "हाँ याद है, उससे पहले मुझे बैठा देना" },

  // hi-4: lab technician, face to face
  { id: "hi10", thread: "hi-4", lang: "hi-IN", who: "Lab technician", relation: "lab technician", setting: "errand, diagnostic lab",
    partner: "Sir, blood sample लेना है। किस हाथ से लूँ?",
    intended: "बाएँ हाथ से लीजिए, वहाँ vein अच्छी है" },
  { id: "hi11", thread: "hi-4", lang: "hi-IN", who: "Lab technician", relation: "lab technician", setting: "errand, diagnostic lab",
    partner: "Fasting में हैं ना? सुबह से कुछ खाया तो नहीं?",
    intended: "नहीं, रात दस बजे के बाद कुछ नहीं खाया" },
  { id: "hi12", thread: "hi-4", lang: "hi-IN", who: "Lab technician", relation: "lab technician", setting: "errand, diagnostic lab",
    partner: "Report कल शाम तक email पर आ जाएगी। और कुछ?",
    intended: "Doctor को भी copy भेज दीजिए please" },

  // ---------------- Indian English (12) ----------------
  // en-1: physiotherapist at home
  { id: "en01", thread: "en-1", lang: "en-IN", who: "Physiotherapist", relation: "physiotherapist", setting: "home, physiotherapy",
    partner: "Good morning Arjun! Shall we start with the stretches, or do you want to rest first?",
    intended: "Let's start, but go slow on the legs." },
  { id: "en02", thread: "en-1", lang: "en-IN", who: "Physiotherapist", relation: "physiotherapist", setting: "home, physiotherapy",
    partner: "How is the right hand? Any cramps since last week?",
    intended: "Cramps at night, mostly in the fingers." },
  { id: "en03", thread: "en-1", lang: "en-IN", who: "Physiotherapist", relation: "physiotherapist", setting: "home, physiotherapy",
    partner: "Okay, I'll teach your mother a massage for that. Is evening okay for her?",
    intended: "Evening is fine, after six." },

  // en-2: manager visiting from work
  { id: "en04", thread: "en-2", lang: "en-IN", who: "Priya", relation: "manager at work", setting: "home visit",
    partner: "Arjun, the team really misses you. Would you like to review some code from home?",
    intended: "Yes, I'd love that. Send me small PRs." },
  { id: "en05", thread: "en-2", lang: "en-IN", who: "Priya", relation: "manager at work", setting: "home visit",
    partner: "Great. Is typing long review comments okay, or should we keep it short?",
    intended: "Keep it short, I get tired quickly." },
  { id: "en06", thread: "en-2", lang: "en-IN", who: "Priya", relation: "manager at work", setting: "home visit",
    partner: "We're also planning a team lunch at your place next Friday. Is that too much?",
    intended: "That sounds lovely, but keep it small." },

  // en-3: neighbour at the door
  { id: "en07", thread: "en-3", lang: "en-IN", who: "Mrs. Iyer", relation: "neighbour", setting: "home, at the door",
    partner: "Arjun, I'm going to the market. Do you need anything?",
    intended: "Yes aunty, some bananas and bread please." },
  { id: "en08", thread: "en-3", lang: "en-IN", who: "Mrs. Iyer", relation: "neighbour", setting: "home, at the door",
    partner: "How is your mother keeping? She looked tired yesterday.",
    intended: "She's not sleeping well, she worries about me." },
  { id: "en09", thread: "en-3", lang: "en-IN", who: "Mrs. Iyer", relation: "neighbour", setting: "home, at the door",
    partner: "Shall I come and sit with you on Sunday so she can go out?",
    intended: "That would be so kind, thank you aunty." },

  // en-4: emergency department doctor
  { id: "en10", thread: "en-4", lang: "en-IN", who: "Emergency doctor", relation: "doctor in the emergency department", setting: "hospital, emergency",
    partner: "Arjun, can you tell me where it hurts? Chest or stomach?",
    intended: "Chest feels tight since this morning." },
  { id: "en11", thread: "en-4", lang: "en-IN", who: "Emergency doctor", relation: "doctor in the emergency department", setting: "hospital, emergency",
    partner: "Are you on any blood thinners or any new medicines?",
    intended: "Only riluzole, no new medicines." },
  { id: "en12", thread: "en-4", lang: "en-IN", who: "Emergency doctor", relation: "doctor in the emergency department", setting: "hospital, emergency",
    partner: "We'll keep you overnight for observation. Shall we call anyone?",
    intended: "Please call my mother, she's outside." },
];
