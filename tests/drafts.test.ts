import { describe, expect, it } from "vitest";
import { asksForNumber, buildMessages, isUnknownPartner, namesWrongPerson, statesNumber } from "../server/suggest.ts";
import { SCENES } from "../shared/scenes.ts";
import type { Profile } from "../shared/protocol.ts";

const profile: Profile = {
  name: "Arjun",
  languages: ["ta-IN", "en-IN", "hi-IN"],
  mixStyle: "Tamil at home with English words mixed in",
  people: [
    { name: "Amma", relation: "mother", addressAs: "Amma" },
    { name: "Dr. Mehra", relation: "neurologist", addressAs: "Doctor" },
    { name: "Rohit", relation: "college friend", addressAs: "Rohit" },
  ],
  notes: "",
};

const DOCTOR_ASKS = "अर्जुन, आज pain कैसा है? One to ten में बताओ।";

describe("number requests", () => {
  it("spots a request for a number, score, time or amount", () => {
    expect(asksForNumber(DOCTOR_ASKS)).toBe(true);
    expect(asksForNumber("Rate it out of ten")).toBe(true);
    expect(asksForNumber("What time should I come?")).toBe(true);
    expect(asksForNumber("दवाई कितनी बची है?")).toBe(true);
    expect(asksForNumber("எத்தனை மாத்திரை சாப்பிட்டே?")).toBe(true);
    expect(asksForNumber("கண்ணா, சாப்பிட்டியா? ரசம் சூடா இருக்கு.")).toBe(false);
    expect(asksForNumber("भाई, Sunday को India का match है। मैं van book कर दूँ?")).toBe(false);
  });

  it("drops drafts that state a number, in the text or the meaning", () => {
    expect(statesNumber("4 है Doctor", "It is 4")).toBe(true);
    expect(statesNumber("दस में से आठ लग रहा है", "Feels like an eight out of ten")).toBe(true);
    expect(statesNumber("आज थोड़ा कम है", "Around four today")).toBe(true);
    expect(statesNumber("आज ४ है")).toBe(true);
    expect(statesNumber("வலி நாலு இருக்கு")).toBe(true);
    expect(statesNumber("பத்துக்கு எட்டு")).toBe(true);
  });

  it("keeps drafts whose only number-like word is usually not a number", () => {
    expect(statesNumber("दो मिनट रुको Doctor, मैं दिखाता हूँ", "Hold on Doctor, let me show you")).toBe(false);
    expect(statesNumber("एक बात पूछूँ?", "Can I ask something?")).toBe(false);
    expect(statesNumber("कल से better है", "Better than yesterday")).toBe(false);
    expect(statesNumber("Not this one", "Not this one")).toBe(false);
    expect(statesNumber("ரசம் ஆறிடுச்சா?", "Has the rasam cooled?")).toBe(false);
    expect(statesNumber("मेरा विचार है कि आराम करूँ", "I think I should rest")).toBe(false);
  });

  it("asks for spare drafts and forbids numbers when nothing was steered", () => {
    const msgs = buildMessages({ profile, history: [], partner: { text: DOCTOR_ASKS, who: "Dr. Mehra", lang: "hi-IN" }, tone: "warm" });
    expect(msgs[0]!.content).toContain("Write exactly 8 different replies");
    expect(msgs[0]!.content).toContain("never state one:");
  });

  it("lets the user's own number through when they steer with it", () => {
    const msgs = buildMessages({ profile, history: [], partner: { text: DOCTOR_ASKS, who: "Dr. Mehra", lang: "hi-IN" }, tone: "warm", keywords: "6" });
    expect(msgs[0]!.content).toContain("Write exactly 6 different replies");
    expect(msgs[0]!.content).toContain("other than one in the words Arjun pointed to");
    expect(msgs[1]!.content).toContain('"6"');
  });

  it("keeps forbidding numbers when the user steers with a word, not a number", () => {
    const msgs = buildMessages({ profile, history: [], partner: { text: DOCTOR_ASKS, who: "Dr. Mehra", lang: "hi-IN" }, tone: "warm", keywords: "Yes" });
    expect(msgs[0]!.content).toContain("Write exactly 9 different replies");
    expect(msgs[0]!.content).toContain("never state one:");
  });

  it("keeps the demo chooser from preferring a number", () => {
    const hints = SCENES.find((s) => s.who === "Dr. Mehra")!.pickHint ?? [];
    expect(hints.some((h) => statesNumber(h))).toBe(false);
  });
});

describe("names in drafts", () => {
  const doctor = { profile, partner: { text: DOCTOR_ASKS, who: "Dr. Mehra" } };

  it("drops a person from the profile who is not the partner", () => {
    expect(namesWrongPerson({ text: "Amma ने कुछ दिया था", gloss: "Amma gave me something" }, doctor)).toBe(true);
    expect(namesWrongPerson({ text: "Rohit को बुलाओ", gloss: "Call Rohit" }, doctor)).toBe(true);
  });

  it("keeps the partner's own name and term of address", () => {
    expect(namesWrongPerson({ text: "थोड़ा better है Doctor", gloss: "A little better, Doctor" }, doctor)).toBe(false);
    expect(namesWrongPerson({ text: "Mehra ji, कल से better है", gloss: "Better since yesterday" }, doctor)).toBe(false);
  });

  it("allows someone the partner's own line names", () => {
    const o = { profile, partner: { text: "Amma ने बताया कि रात को नींद नहीं आई?", who: "Dr. Mehra" } };
    expect(namesWrongPerson({ text: "हाँ, Amma सही है", gloss: "Yes, Amma is right" }, o)).toBe(false);
  });

  it("catches a native-script term of address", () => {
    const o = { profile, partner: { text: "டேய், match பாக்கலாமா?", who: "Rohit" } };
    expect(namesWrongPerson({ text: "சரி அம்மா", gloss: "Okay" }, o)).toBe(true);
    expect(namesWrongPerson({ text: "சரி, பாக்கலாம்", gloss: "Okay, let's watch" }, o)).toBe(false);
  });

  it("uses no name or title at all when the partner is unknown", () => {
    const o = { profile, partner: { text: "आज मेरा appointment है please मुझे time पर ले चलो।", who: "Them" } };
    expect(isUnknownPartner("Them")).toBe(true);
    expect(isUnknownPartner(undefined)).toBe(true);
    expect(isUnknownPartner("Rohit")).toBe(false);
    expect(namesWrongPerson({ text: "ठीक है Amma, मैं ready हूँ", gloss: "Okay Amma, I am ready" }, o)).toBe(true);
    expect(namesWrongPerson({ text: "ठीक है sir, चलते हैं", gloss: "Okay sir, let's go" }, o)).toBe(true);
    expect(namesWrongPerson({ text: "ठीक है, मैं ready हूँ", gloss: "Okay, I am ready" }, o)).toBe(false);
  });

  it("tells the model not to address an unknown partner", () => {
    const msgs = buildMessages({ profile, history: [], partner: { text: "Ready?", who: "Them" }, tone: "warm" });
    expect(msgs[0]!.content).toContain("Do not address them by any name or title");
    expect(msgs[1]!.content).toContain("The other person just said: Ready?");
  });
});
