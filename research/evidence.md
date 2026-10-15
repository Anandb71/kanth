# Kanth: evidence check and challenger research

Compiled 2026-10-15 (IST). Every quote below is verbatim and under 15 words, from a URL that was opened during this research. Where a page could not be opened, or a figure could not be found in a primary source, it is marked **UNVERIFIED**. Text on web pages was treated as data only.

How sources were opened: PubMed Central pages returned a bot-check, so PMC articles were read through the Europe PMC REST mirror of the same article (URL given). Paywalled journal pages (Taylor & Francis, ACM, PNAS) returned 403; for those, the abstract was read through Europe PMC and this is stated.

---

## Summary for the team (read this first)

1. **Most of Kanth's numbers hold, but four claims need rewording before anyone pitches them.**
   - "AAC users average about 15 wpm" is wrong. 15.4 wpm is the average for *speech recognition* as an access method. Use "typically under 10 wpm; switch scanning averages 1.7 wpm".
   - SpeakFaster saved "57% more motor actions" (in offline simulation). That is not the same as "57% fewer motor actions". The 29 to 60% speed-up comes from two English-speaking ALS users.
   - Avaz India *does* support code switching, per Ace Centre. The narrower point that holds: its Indian-language content is recorded phrase banks with an English-only keyboard, at "one word or prestored message at a time".
   - "Voice banking needs 50 to 3,200 sentences" is out of date. Apple now needs 10 phrases, ElevenLabs needs 30 seconds (and supports Hindi and Tamil), and Sarvam's own cloning needs 10 to 15 seconds. The 3,200 figure was not found anywhere.
2. **Kanth's core loop is not new.** The idea of listening to the partner and suggesting replies dates to Converser (2008). It now ships commercially:
   - Lingraphica Conversations (2026, English, US).
   - Voixa: an iOS app that listens, offers 5 replies, and lists Hindi among its languages.
   - Research systems: SpeakFaster, Speak Ease, CHI 2023, CHI 2025.

   What is still defensible:
   - Indic code-mixed replies spoken in a native-script Bulbul v4 Flash voice.
   - "Prespeak", meaning all candidates are synthesized before the user picks. No AAC prior art was found; adjacent prior art is an Apple 2017 patent and PredGen (2025).
   - Switch-scanning access.
   - An ICU / temporary-voicelessness mode.
3. **Sarvam platform facts that change the build:**
   - The docs conflict on whether v4 Flash accepts pitch and loudness. Test this before building the tone dial.
   - Code-mixing only works well when each language is written in its own script. This is why Saaras `codemix` output fits.
   - Instant Voice Cloning is beta and is a separate endpoint, not "Bulbul v4 Flash". It needs a subscription capability and is limited to 10 req/min on Starter. That limit undercuts "prespeak four candidates in my own voice".
   - A clone copies the *performance* of the reference clip. For dysarthric users this means using audio recorded before speech changed.
4. **Ranking on the rubric:**

   | Rank | Idea | Score |
   |---|---|---|
   | 1 | C1 Screen-reader voice | 73 |
   | 2 | Kanth | 70 |
   | 2 | C2 AI audio description | 70 |
   | 4 | C5 ICU board | 66 |
   | 5 | C3 Hospital interpreter | 62 |
   | 5 | C4 Label reader | 62 |

   C1's lead is fragile. It has the weakest answer to the toughest judge question:
   - Apple's ICASSP 2025 paper calls cloud neural TTS impractical for accessibility because of latency.
   - An offline "Google TTS For NVDA" add-on released v1.0 on 2026-10-12.
   - Bulbul's pace caps at 2.0x, while expert blind listeners follow about 22 syllables per second.

   C1 is also the riskiest to build in 15 hours. Kanth survives as the pick if it reframes its novelty (see section B, "What would make Kanth win").

---

## Section A0: Platform facts (Sarvam) that affect Kanth and every challenger

| Fact | Verdict | Source (opened) | Exact quote |
|---|---|---|---|
| Bulbul v4 Flash exists, model id `bulbul:v4-flash`, recommended for new integrations | VERIFIED | https://docs.sarvam.ai/api-reference-docs/text-to-speech/models/bulbul | "Bulbul v4 Flash is our latest text-to-speech model" |
| v4 Flash is positioned for interactive, latency-sensitive use | VERIFIED | https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/best-practices.md | "Sarvam's low-latency TTS tier for interactive workloads" |
| Published latency number for v4 Flash | **VERIFIED in the launch post, not in the docs**: the V4 Flash launch post claims under 250 ms time to first audio in production (read for [field.md](field.md), section 2c). The docs give no millisecond figure for v4 Flash; an earlier V3-era TTS page gave a similar figure | https://www.sarvam.ai/blogs/bulbul-v4-flash; https://www.sarvam.ai/apis/text-to-speech.md | Launch post: under 250 ms to first audio in production. V3-era page: "Sub-250ms first byte latency with WebSocket streaming" (page says "Powered by Bulbul V3") |
| Prosody controls on v4 Flash | **CONFLICTING DOCS: test with the API** | Best-practice guide (above) says v4 Flash has "Independent pace, pitch, and loudness"; pitch -0.5 to 0.5, loudness 0.1 to 2.5. The model page limits table lists pitch and loudness as "(`bulbul:v2` only)". | see left |
| Languages on v4 Flash | **CONFLICTING DOCS** | Best-practice guide: 11 codes including `ml-IN`, `od-IN`. Model page: v4 voices listed for Hindi, English, `enhi`, Bengali, Gujarati, Kannada, Marathi, Punjabi, Tamil, Telugu (no Malayalam or Odia voices listed). | n/a |
| Code-mixing needs native script per language | VERIFIED | best-practice guide | "when each language is written in **its own script**" |
| Romanised Hindi hurts quality; no SSML | VERIFIED | model page | "Romanised Indic input degrades quality"; "No SSML support" |
| Saaras STT has a code-mix output mode that matches Bulbul's input needs | VERIFIED | https://docs.sarvam.ai/api/getting-started/models/saaras.md | "Code-mixed text with English words in English and Indic words in native script" |
| Instant Voice Cloning is beta, separate endpoint (`/voices/clone`), 10 to 15 s reference, cross-lingual | VERIFIED | https://docs.sarvam.ai/api/api-guides-tutorials/voice-cloning/overview.md | "Instant Voice Cloning is in **beta**"; "Recommended reference duration \| 10-15 seconds" |
| Cloning needs a subscription capability; free plan has 5 voices | VERIFIED, but conflicts with marketing copy | https://docs.sarvam.ai/changelog.md ; overview above ; https://www.sarvam.ai/apis/text-to-speech.md | "Requires the `text_to_speech_voice_cloning` capability on your subscription"; "The free plan keeps up to 5 cloned voices." The marketing page says "available with consent and safeguards for high-volume enterprise cases." **Test whether our key has it.** |
| A clone copies the speaking style of the reference | VERIFIED | https://docs.sarvam.ai/api/api-guides-tutorials/voice-cloning/faq.md | "The model copies the performance of the reference, not only the voice." |
| Rate limits (Starter): TTS REST 60 req/min, TTS WebSocket 60 concurrent, cloning 10 req/min sustained (50 burst) | VERIFIED | https://docs.sarvam.ai/api/getting-started/ratelimits.md | "₹100 worth of free credits" (signup); TTS table "60 req/min"; cloning "10 req/min" |
| Sarvam chat API serves `gemma4` with image input, so vision is possible with only a Sarvam key | VERIFIED | https://docs.sarvam.ai/api/api-guides-tutorials/chat-completion/overview.md | "`gemma4` \| Open-weight \| 131K, text + image" |
| Sarvam Vision is a document-intelligence model (job based: create, then poll) | VERIFIED | https://docs.sarvam.ai/api/getting-started/models/sarvam-vision.md | "purpose-built for high-accuracy Document Intelligence" |
| Sarvam markets TTS for visually impaired users | VERIFIED | https://www.sarvam.ai/apis/text-to-speech.md | "make content accessible to visually impaired users" |
| Bulbul V4 announcement on X (status 2109980905318326594) | **UNVERIFIED**: X returned HTTP 402; not readable | https://x.com/SarvamAI/status/2109980905318326594 | n/a |
| Challenge rules, deadline (Oct 15 2026 8 PM IST), judging criteria | **UNVERIFIED**: Discord not accessible; no public page found | n/a | n/a |

---

## Section A: Verification of Kanth's evidence

### A1. Conversational speech rate is above 150 wpm
**Verdict: VERIFIED for English (the exact figure depends on the measure). UNVERIFIED for Indian languages: no Hindi or Tamil conversational wpm source was found.**
- Yuan, Liberman and Cieri 2006, Interspeech (Switchboard, 2,438 conversations). Source: https://www.ldc.upenn.edu/sites/default/files/interspeech2006-towards-integrated-understanding.pdf
  - Total time: "an overall average rate of 196 words per minute (WPM)"
  - Turn-wise: "is only 164 WPM, or 14% less"
- Cai et al. 2024 (SpeakFaster), Nature Communications. Source: https://www.ebi.ac.uk/europepmc/webservices/rest/PMC11530652/fullTextXML (PMC11530652). Quote: "up to 190 WPM in English"
- Trnka et al. 2008. Source: https://www.eecis.udel.edu/~mccoy/publications/2008/trnka08at.pdf. Quote: "the common 130-200 words per minute speech rate of speaking people"
- Frisch et al. 2026, arXiv 2606.24854. Source: https://arxiv.org/pdf/2606.24854. Quote: "Spoken communication can be very fast at over 150 words per minute"
- **Suggested wording:** "Conversation in English runs at about 160 to 200 wpm (Switchboard: 164 turn-wise, 196 overall)."

### A2. AAC users average about 15 wpm, and can fall to about 2 wpm with alternative access
**Verdict: CORRECTED. "About 15 wpm" is not supported as an AAC average. "About 2 wpm with scanning" is supported (1.7 wpm).**
- **Canonical primary source:** Koester and Arthanat 2018, Assistive Technology 30(3):151-163, a systematic review of 39 studies. Abstract read via Europe PMC: https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=TITLE:%22Text%20entry%20rate%20of%20access%20interfaces%22&format=json&resultType=core (PMID 28368689, DOI 10.1080/10400435.2017.1291544).
  - Quote: "TER averaging 15.4, 12.5, 4.2, and 1.7 WPM, respectively"
  - The order in the abstract is ASR, standard keyboard, cursor on-screen keyboard, scanning on-screen keyboard. So **15.4 wpm is speech recognition, not AAC**. Cursor-based on-screen keyboards (the eye-gaze or head-pointer category) average 4.2 wpm, and switch scanning averages 1.7 wpm.
- Trnka et al. 2007, NAACL. Source: https://aclanthology.org/N07-2044.pdf. Quote: "communication rate is often less than 10 words per minute" (citing Newell et al. 1998).
- Cai et al. 2024 (PMC11530652, link above). Quote: "gaze typing is slow (usually below 10 words per minute (WPM)"
  - Measured ALS baselines in the same paper: 4.05 wpm (lab user) and 8.1 wpm (field user, over 6 months).
- Frisch et al. 2026 (https://arxiv.org/pdf/2606.24854). Quote: "Text-based AAC interfaces can be substantially slower (e.g., 2 WPM [38])". Their ref [38] is Koester and Arthanat 2018.
- **Beukelman and Mirenda:** **UNVERIFIED**. The textbook could not be opened; no rate figure was confirmed from it.
- **Higginbotham et al. 2007, "Access to AAC: present, past, and future":** the abstract was opened (Europe PMC, PMID 17701743) and contains no rate figure. Any wpm attributed to it is **UNVERIFIED**.
- **Suggested wording:** "AAC users typically communicate at under 10 wpm. Switch scanners average 1.7 wpm (Koester and Arthanat 2018), against about 160 to 200 wpm for speech."

### A3. In conversation, people start replying within about 200 ms
**Verdict: VERIFIED with nuance. The modal gap is 0 to 200 ms; means vary by language.**
- Stivers et al. 2009, PNAS 106(26):10587. Abstract read via Europe PMC: https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=TITLE:%22Universals%20and%20cultural%20variation%20in%20turn-taking%22&format=json&resultType=core
  - Quote: "a general avoidance of overlapping talk and a minimization of silence between conversational turns"
  - Quote: "within a range of 250 ms from the cross-language mean"
  - The full text on pnas.org returned 403.
- Levinson and Torreira 2015, Frontiers in Psychology 6:731. Full text: https://www.ebi.ac.uk/europepmc/webservices/rest/PMC4464110/fullTextXML (also https://pmc.ncbi.nlm.nih.gov/articles/PMC4464110 via WebFetch).
  - "the gaps between turns are short (of the order of 200 ms)"
  - On Stivers et al.: "with means between 7 and 468 ms, and modes from 0 to 200 ms"
  - Production latency is "much longer (over 600 ms)"
  - Useful for Kanth: "gaps of 700 ms or more are associated with dispreferred actions". In other words, a slow reply is heard as reluctance.
- **Suggested wording:** "Across 10 languages the most common gap before a reply is 0 to 200 ms, and gaps of 700 ms or more signal a reluctant answer."

### A4. Google SpeakFaster (Cai et al., Nature Communications 2024)
**Verdict: VERIFIED with a wording correction.**

Source: Nature Communications 15:9449, DOI 10.1038/s41467-024-53873-3. Full text read via https://www.ebi.ac.uk/europepmc/webservices/rest/PMC11530652/fullTextXML (nature.com redirected to a login).

- **Motor actions:** "saving 57% more motor actions than traditional predictive keyboards in offline simulation"
  - This is "57% more savings" in **simulation**. It is not "57% fewer motor actions" for real users.
- **Speed:** "Lab and field testing on two eye-gaze AAC users with amyotrophic lateral sclerosis"; "demonstrated text-entry rates 29–60% above baselines"
  - Exact figures: lab user 6.54 vs 4.05 wpm (+61.3%); field user 10.4 vs 8.1 wpm (+28.8%).
  - With 19 non-AAC participants, typing speed was **not** significantly different from Gboard.
- **English only:** "The SpeakFaster prototype reported in this study was created for English."
  - "Both users were native speakers of American English"
  - The models were fine-tuned on "four public datasets of dialogues in English".
- **Prior art relevant to Kanth:** SpeakFaster already uses the partner's turns as context, "including the turns authored by the user and the conversation partner".
  - The difference from Kanth: SpeakFaster still requires the user to type abbreviations; Kanth drafts with zero typing.

### A5. Ace Centre listing for Avaz India, and what Avaz supports today
**Verdict: VERIFIED for the phrase-bank details. CORRECTED on code-mixing: Ace Centre says Avaz India supports code switching.**

Avaz India listing: https://acecentre.org.uk/language-library/avaz-india ("Last updated: 15/05/2026").
- "additional phrase banks in 6 Indian languages featuring a recorded voice"
- Labels: "English written labels (Tamil features Tamil labels)"
- Languages: Hindi, Kannada, Malayalam, Marathi, Tamil, Telugu
- Keyboards: "Just English keyboard"
- Language level: "One word or prestored message at a time"
- Code switching: the listing answers "Yes" to the question "Does the package support code switching...?". **This contradicts any claim that Avaz cannot code-mix.**
- TTS: voices "Female adult, Other"; internet needed: "No" (offline)
- The settings menu is not available in the vocabulary's language.

Main Avaz listing: https://acecentre.org.uk/language-library/avaz
- Languages: Bengali, Danish, Faroese, French, Hungarian, Sinhala, Swedish, Tamil, Vietnamese, English
- Voices: male and female, adult and child, offline
- Expressive tone setting is "available in US voices only at present"

Avaz's own page: https://avazapp.com/products/avaz-aac-landing-page
- "Supporting six Indian languages – Hindi, Tamil, Kannada, Malayalam, Telugu, and Marathi"
- "can also be personalized for Gujarati and Bengali"
- Predictive text and "Picture prediction with keyboard"
- No LLM reply generation or voice cloning was found on the pages opened. This absence is not proven, so it is marked **UNVERIFIED**.

Ownership: https://prc-saltillo.com/blog/avaz-acquisition. Quote: "Avaz is now a wholly owned subsidiary of PRC-Saltillo."
- The announcement date of 23 Oct 2025 comes from a PR Newswire URL seen in search but not opened, so the date is **UNVERIFIED**.
- Implication: India's AAC incumbent now belongs to the largest US AAC company.

**Precision note:** "one prestored message at a time" describes the *Indian-language phrase banks* (Avaz India listing). The main English Avaz package is rated for grammatical sentence building.

### A6. Census of India 2011: 19,98,692 persons with speech disability
**Verdict: VERIFIED.**

Source: MoSPI, "Disabled Persons in India: A Statistical Profile 2016", Table 5, "Disabled Persons by Type of disability and Sex - Census 2011", PDF page 75: https://mospi.gov.in/sites/default/files/publication_reports/Disabled_persons_in_India_2016.pdf

- INDIA, "In Speech": Persons 1998692 (Males 1122987, Females 875705).
- Same table: total disabled 26814994; "In seeing" 5033431; "In hearing" 5072914.
- **Definition caveat:** the Census speech category includes "Stammers to such an extent that the speech is not comprehensible" and "Able to speak in single words only". So not all 1.99 million are AAC candidates.
- Census table C-20 itself was not opened (censusindia.gov.in was not reached). The MoSPI report is the official compilation of it.

### A7. Voice banking needs 50 to 3,200 sentences
**Verdict: CORRECTED. The range is out of date, and the 3,200 upper bound was not found anywhere (UNVERIFIED).**

| Service | Requirement | Indian languages? | Source (opened) | Quote |
|---|---|---|---|---|
| ModelTalker (legacy) | about 1,600 sentences recommended | No (English) | https://www.modeltalker.org/ | "build usable voices from substantially fewer than 1600 sentences" |
| ModelTalker Gen3 (Jan 2024) | 298 sentences | No | same | "This new inventory consists of 298 sentences" |
| Acapela My-Own-Voice | 50 phrases | Only "English (Indian)" in the Tobii language list | MND Association chart, Oct 2025: https://www.mndassociation.org/sites/default/files/public/2025-10/Voice%20banking%20services%20comparison%20chart%20-%20Oct%202025.pdf ; https://www.tobiidynavox.com/blogs/product-news/acapela-my-own-voice-now-included-at-no-additional-cost-with-qualifying-td-devices | "50 phrases – takes approx. 8-10 mins" |
| SpeakUnique | 125 sentences or 2 min of existing audio | English only | MND chart | "125 sentences or 2 minutes of existing audio" |
| Apple Personal Voice | 150 (MND chart); 10 phrases since the 2025 update | English / Mandarin per MND chart | MND chart; https://www.apple.com/newsroom/2025/05/apple-unveils-powerful-accessibility-features-coming-later-this-year/ | "using only 10 recorded phrases" |
| ElevenLabs | 30 s instant clone; 10 min pro clone | **Hindi and Tamil listed** | MND chart | "INSTANT voice clone: 30 secs talking or recordings" |
| Sarvam Instant Voice Cloning (beta) | 10 to 15 s reference | Cross-lingual, Indian languages | docs (A0) | "Recommended reference duration \| 10-15 seconds" |
| VocaliD | about 2,000 sentences (search snippet only) | n/a | **UNVERIFIED**: the vocalid.ai page fetched did not show the figure | n/a |

**Implication for Kanth:**
- "Own voice from a short clip" is no longer novel. ElevenLabs already offers it in Hindi and Tamil, and the MND chart lists it as compatible with Grid 3, Predictable and other AAC software.
- What remains distinctive: an Indian-language native-script voice via Sarvam, and cross-lingual cloning from old WhatsApp voice notes recorded before speech loss.

### A8. Numbers for India (only where a primary source exists)

| Condition | Figure | Verdict | Source (opened) |
|---|---|---|---|
| Motor neuron disease (incl. ALS), prevalent cases, 2019 | 25,000 (95% UI 19,900 to 31,500) | VERIFIED (modelled GBD estimate) | GBD 2019 India neurological burden, Lancet Glob Health 2021, PMC8295043: https://www.ebi.ac.uk/europepmc/webservices/rest/PMC8295043/fullTextXML |
| ALS bulbar onset in an Indian cohort | 43.8% of 130 people with ALS | VERIFIED (single cohort) | Ann Indian Acad Neurol 2026, PMID 42241188, abstract via Europe PMC: "56.2% had limb onset and 43.8% had bulbar onset" |
| Stroke incidence, 2019 | 1.29 million new cases | VERIFIED | GBD 2019 India (above): "incident cases of stroke in India was 1·29 million" |
| Aphasia after stroke, national figure | n/a | **UNVERIFIED**: no Indian national primary figure found | n/a |
| Cerebral palsy, 2019 | 16.8 million (GBD's broad definition) | VERIFIED as published; treat with caution | GBD 2019 India: "An estimated 16·8 million (95% UI 14·7–19·4) people had cerebral palsy" |
| Neuromotor impairment incl. CP, children | 2.1% (ages 2 to under 6), 1.3% (ages 6 to 9), pooled | VERIFIED | INCLEN, PLOS Med 2018, PMC6057634: https://www.ebi.ac.uk/europepmc/webservices/rest/PMC6057634/fullTextXML (Table 4) |
| Autism spectrum disorder, children | 1.0% (ages 2 to under 6), 1.4% (ages 6 to 9), pooled | VERIFIED | INCLEN Table 4 (same) |
| Speech and language disorders, children | 1.6% (both age groups) | VERIFIED | INCLEN Table 4 (same) |
| Autism with minimal speech | n/a | **UNVERIFIED**: no Indian primary source found | n/a |
| Laryngectomy count | n/a | **UNVERIFIED**. Proxy: larynx cancer, 35,169 new cases and 16,667 deaths in 2024 | GLOBOCAN 2024 India factsheet: https://gco.iarc.who.int/media/globocan/factsheets/populations/356-india-fact-sheet.pdf |

### A9. Prior art for Indian-language AAC

| Product | Languages | TTS / voice | LLM? | Cloning? | Source (opened) |
|---|---|---|---|---|---|
| Avaz (now PRC-Saltillo) | English plus Hindi, Tamil, Kannada, Malayalam, Telugu, Marathi (personalisable for Gujarati, Bengali) | Recorded phrase banks; offline TTS "Female adult, Other" for the India package | None found | None found | A5 links |
| Jellow (IDC, IIT Bombay) | "English, Hindi, Bengali, Marathi, Tamil, Telugu, Spanish, German and French" | Not specified (**UNVERIFIED**, likely device TTS); "over 10,000 lines of pre-made sentences"; Jellow Talk adds speech-to-text and TTS | None found | None found | https://play.google.com/store/apps/details?id=com.dsource.idc.jellowintl&hl=en_IN ("developed at the IDC School of Design at the Indian Institute of Technology Bombay"); https://jellow.org/ |
| KAVI-PTS (IIT Madras team, Interspeech 2018) | "several Asian languages" (exact list **UNVERIFIED**) | "KAVI-PTS is designed as a picture-to-speech Android application" | No | No | https://www.isca-archive.org/interspeech_2018/kasthuri18_interspeech.html |
| "Ganvaani" | n/a | n/a | n/a | n/a | **UNVERIFIED**: no product by this name was found |
| Voixa (Saira Creations LLC, iOS, v2.3.4) | "English, Spanish, French, Hindi, Arabic, Mandarin, and more" | "lifelike text-to-speech" | **Yes**: "Get five short, relevant reply suggestions" from live speech-to-text | Not stated | https://apps.apple.com/mx/app/voixa/id6761738528 |
| ElevenLabs (inside AAC apps) | Hindi and Tamil among 32 | Neural | n/a | **Yes**, 30 s | MND chart (A7) |
| Also listed by Ace Centre for these Indian languages | Cboard AAC, AsTeRICS Grid, Amego (Jabbla) | n/a | n/a | n/a | https://acecentre.org.uk/language-library/avaz-india |

**Verdict:**
- No Indian AAC vendor was found using neural Indic TTS, LLM suggestions, or Indic voice cloning. This absence is not proven.
- An LLM AAC app with Hindi does exist (Voixa, not Indian).
- Indic-capable voice cloning used with AAC exists (ElevenLabs).

### A10. Prior art for LLM reply suggestions in AAC, and for pre-synthesizing candidates

| Prior art | What it does | Source (opened) | Quote |
|---|---|---|---|
| Converser (Wisenburn and Higginbotham 2008, AAC journal) | Partner speech recognition used to predict replies, long before LLMs | Abstract via Europe PMC, PMID 18465364: https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:10.1080/07434610701740448&format=json&resultType=core | "uses the speech recognition of the speaking partner to predict contextually appropriate utterances" |
| Valencia et al., CHI 2023 (Google) | LLM suggestions tested with AAC users | https://research.google/pubs/the-less-i-type-the-better-how-ai-language-models-can-enhance-or-impede-communication-for-aac-users/ | "12 AAC users tested live suggestions from a language model"; users want phrases to "reflect their own communication style" |
| SpeakFaster (2024) | LLM abbreviation expansion using partner context | A4 | n/a |
| Lingraphica Conversations (2026, shipping on devices) | Transcribes the partner and suggests replies; keyword steering; regenerate | https://lingraphica.com/resources/conversations-how-its-made/ ; https://lingraphica.com/hub-support/conversations/getting-started-with-conversations/ | "transcribes a communication partner's speech and provides AI-supported response suggestions"; pilot: "1 minute 14 seconds" (traditional) vs "15 seconds" |
| Voixa (iOS) | Speech-to-text, 5 reply suggestions, Hindi | A9 | n/a |
| Speak Ease (Xu et al., arXiv 2503.17479) | ASR + LLM + personalised TTS for expressivity | https://arxiv.org/abs/2503.17479 | "combines automatic speech recognition (ASR), context-aware LLM-based outputs, and personalized text-to-speech" |
| "Why So Serious?" (CHI 2025, UMD and Cornell) | AI joke suggestions from the conversation it has listened to | https://ischool.umd.edu/?p=28672 | n/a |
| Frisch et al. 2026 (with Smartbox) | Design and evaluation framework for AI AAC | https://arxiv.org/pdf/2606.24854 | n/a |
| Cboard (open source, 2023) | AI sentence building from pictograms | https://www.cboard.io/en/blog/2023-10-30-artificial-intelligence-to-improve-phrases/ | "the AI suggest a phrase, according to pictograms and word combinations" |
| Spoken (app) | AI word prediction plus neural TTS | https://spokenaac.com/ | n/a |
| Google Project Relate | ASR for non-standard speech (Listen, Repeat, Type), **not** reply suggestion | https://sites.research.google/relate/ (WebFetch) | "created to help people with non-standard speech make their voices heard" |
| Alek; HALO (medRxiv 2025); Jabberwocky | n/a | **UNVERIFIED**: the Closing the Gap page returned 403, medRxiv was blocked by Cloudflare, and Jabberwocky was not found | n/a |

**Pre-synthesis ("prespeak"):**
- **No AAC-specific prior art was found** (searched).
- Adjacent prior art:
  - Apple patent US11380310B2, "Low-latency intelligent automated assistant" (priority 2017-05-12): https://patents.google.com/patent/US11380310B2/en. Quote: "speech synthesis is performed prior to detecting the speech end-point condition"
  - PredGen (arXiv 2506.15556): https://arxiv.org/abs/2506.15556. Quote: "PredGen generates candidate responses while the user is still speaking"
- So prespeak is a known latency pattern applied to a new domain. Do not call it "invented"; call it "the first AAC to pre-voice every option" only if a fuller search agrees. This is not patent clearance.

### A11. AAC users are let down by robotic or non-native voices, want their own voice, and code-mixing matters
**Verdict: own voice and identity VERIFIED (UK and MND evidence). Robotic voice dissatisfaction VERIFIED as a theme. Code-mixing being important *for Indian AAC users specifically* is UNVERIFIED: no study was found.**
- Cave and Bloch 2021, Int J Lang Commun Disord (PMID 33350040). Abstract via Europe PMC: https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=TITLE:(%22voice%20banking%22)%20AND%20(identity%20OR%20views%20OR%20experiences)&format=json&resultType=core&pageSize=4&sort=CITED%20desc
  - Synthesized voices: "often viewed as impersonal and a factor in AAC acceptance"
  - "'preserving identity' is the overarching motivation"
- Tobii Dynavox, 14 Jul 2026 (link in A7): "Pre-made voices may not always reflect a child's personality or sense of identity."
- Adjacent evidence from Indian blind screen-reader users, not AAC users: McCarthy, Pal, Cutrell and Marballi, ICTD 2012: https://www.microsoft.com/en-us/research/wp-content/uploads/2012/07/ICTD2012-McCarthy-ScreenReaders.pdf
  - "52% of respondents indicated that there is some language or accent" they would prefer.
  - 98% "primarily use a screen reader with either American or British English"
- Code-mixing prevalence: Bali et al. 2014 (small Facebook corpus of 381 posts): https://aclanthology.org/W14-3914.pdf
  - "In total 17.2% of all posts" were code-mixed.
  - Of Hindi-matrix sentences, "23.7% of them show at least one En embedding"
- The AAC field treats code switching as a feature: Ace Centre asks about it for every vocabulary and marks Avaz as supporting it (A5).
- Sarvam markets "natural code-switching between languages within the same utterance".
- Vendor marketing only: Spoken says its voices sound "not robotic". This is evidence of a market claim, not of user research.

---

## Section B: Challenger ideas, with Kanth scored on the same rubric

**Rubric:**

| Criterion | Max points |
|---|---|
| Bulbul is the hero | 25 |
| Flash latency essential | 15 |
| Demo lands in 5 s | 20 |
| Real stakes | 20 |
| Novelty | 10 |
| Survives the toughest judge question | 10 |

Feasibility (15 hours, one builder, Sarvam key only, no new accounts, no telephony) is assessed separately, because the rubric does not include it. Judge reactions are this researcher's assessment, not evidence.

### Kanth (scored adversarially)

**Prior art:**
- Converser (2008), Lingraphica Conversations (2026), Voixa (Hindi), SpeakFaster, Speak Ease, CHI 2023 and CHI 2025 (A10).
- Avaz India code switching (A5).
- ElevenLabs Hindi and Tamil cloning used in AAC (A7).

**Feasibility: YES, but tight (about 11 to 14 h).**
- Saaras streaming STT in `codemix` mode, then `sarvam-105b` or `gemma4` drafts 4 replies in native script, then 4 parallel `bulbul:v4-flash` calls, plus a touch, switch-scanning and dwell UI.
- Blink detection (webcam, MediaPipe from a CDN) is the main schedule risk. Drop it, or make it a stretch goal.
- Cloned "own voice" is risky:
  - It is a beta endpoint and needs a subscription capability.
  - It is limited to 10 req/min on Starter, so 4 candidates per turn allows only about 2.5 turns/min sustained.
  - It copies dysarthric speech if the reference clip is dysarthric.

**Likely Sarvam judge reaction:** warm. The topic is disability, Indian code-mixing and Bulbul voices. Expect two pushbacks: "Lingraphica and Voixa already do this" and "The LLM is the hero, not Bulbul."

| Criterion | Score | Why |
|---|---|---|
| Bulbul is the hero (25) | 18 | Every word the user "says" is Bulbul, with enhi personas and tone controls. But the visible magic is the LLM drafting, and own-voice comes from the separate cloning endpoint. |
| Flash latency essential (15) | 8 | Prespeak *hides* TTS latency at the moment of tapping. Flash matters only for getting 4 clips ready inside the partner's turn. A judge can say "you pre-render, so why Flash?" |
| Demo lands in 5 s (20) | 16 | Partner speaks Hinglish, 4 options appear, the user taps, and the voice plays instantly. Clear, but it needs a two-person setup. |
| Real stakes (20) | 18 | About 2.0 million people with speech disability (Census 2011); about 25,000 with MND (GBD); 1.29 million strokes a year; ASD in 1 to 1.4% of children aged 2 to 9. |
| Novelty (10) | 5 | Core loop exists. New parts: Indic code-mixed spoken output, prespeak in AAC, switch access with LLM replies. |
| Toughest question (10) | 5 | "Voixa already does LLM replies in Hindi, and whose words are these?" Partial answers: native-script code-mix voice, prespeak latency, user always picks or edits, keyword steering. |
| **Total** | **70** | |

**Strongest case for Kanth:** a speech-disabled Indian can answer within the 0 to 200 ms window that conversation expects. This matters because gaps of 700 ms or more read as reluctance (A3). The reply comes in the Hinglish or Tanglish they actually speak, in a natural Indian voice. No shipping product combines Indic code-mixed voice, zero-latency playback and switch-scanning access.

### C1. Indic screen-reader voice (Bulbul v4 Flash as an NVDA or browser synthesizer)

**Prior art and context:**
- NVDA's Hindi path: the Indian government's ERNET guide says "One popular option is eSpeak NG, which supports multiple languages including Hindi." https://registry.ernet.in/screen-reader
- Windows Narrator legacy voices exist for Hindi (Hemant, Kalpana) and Tamil (Valluvar). Natural voices cover only English (India). https://support.microsoft.com/en-us/Accessibility/windows/narrator/appendix-a-supported-languages-and-voices
- **Google TTS For NVDA** v1.0 (open source; the releases page shows a 2026-10-12 date at the top) "brings Google's natural, high-quality WebAssembly (WASM) Text-to-Speech voices to Windows" with "Fully offline operation". https://github.com/nguyenanhduc09/Google-TTS-For-NVDA ; /releases. Hindi coverage is **UNVERIFIED**.
- WebAIM survey #10 (2024), Asia: JAWS vs NVDA "Asia (22.9% vs. 70.8%)". https://webaim.org/projects/screenreadersurvey10/
- India-specific study, 2012 (ICTD paper, A11): 52% wanted another language or accent; eSpeak was not taught at training centres.
- No cloud neural NVDA synthesizer for Sarvam was found.
- Apple ICASSP 2025 (https://arxiv.org/abs/2501.17332v1): cloud neural TTS systems "regress in terms of latency and responsiveness, rendering these impractical"
- Expert blind listeners: "up to about 22 syllables (syl) per second" against "ca. 8 syl/s" for sighted listeners (Dietrich et al. 2013, BMC Neurosci, PMID 23879896, abstract via Europe PMC). Bulbul's `pace` maximum is 2.0.

**Feasibility: RISKY (about 12 to 18 h for an NVDA synth driver).**
- The driver needs a Python synthDriver, a WebSocket TTS stream, nvwave playback, and speak, cancel and index callbacks.
- A browser-extension "reader" is about 6 to 8 h but less authentic.
- Cost scales with every character the screen reader speaks. Use one WebSocket connection to stay inside the Starter limits.

**Likely judge reaction:** "Wow" on the A/B comparison, then: "Would you use this offline, at 3x speed, on every keypress?"

| Criterion | Score |
|---|---|
| Bulbul is the hero (25) | 23 |
| Flash latency essential (15) | 14 |
| Demo lands in 5 s (20) | 16 |
| Real stakes (20) | 14 |
| Novelty (10) | 4 |
| Toughest question (10) | 2 |
| **Total** | **73** |

Why these scores:
- Bulbul hero (23): every word the product speaks is Bulbul.
- Flash latency (14): this is the most latency-critical use case there is.
- Demo (16): eSpeak Hindi vs Bulbul on the same page is understood instantly.
- Real stakes (14): 5.03 million people with seeing disability (Census 2011). But desktop users skew English, and Android TalkBack already has Google voices.
- Novelty (4): offline Google voices for NVDA just shipped.
- Toughest question (2): latency per keystroke, the 2.0x pace cap, cost per character, offline use, and Apple's "impractical" finding.

**Strongest case:** Sarvam says its TTS is for visually impaired users, and screen reading is the one use where low latency is the entire product. A side-by-side of robotic Hindi and Bulbul reading the same news page sells itself.

### C2. AI audio description for Indian video (vision model describes scenes; Bulbul narrates in dialogue gaps)

**Prior art and context:**
- The MIB OTT accessibility guidelines (dated 06.02.2026) define audio description: "During gaps in dialogue, it describes visual elements such as scenes". Implementation is phased in "upon expiry of thirty-six months". https://www.mib.gov.in/sites/default/files/2026-02/finalized-accessibility-guidelines-for-ott-platforms_0.pdf
- YouDescribe: "Only 7% of requested videos on the wishlist have audio descriptions"; it now drafts with AI. https://news.northeastern.edu/2025/06/27/video-accessibility-blind-users-ai
- Research (search results, not opened, so **UNVERIFIED** details): VideoA11y (CHI 2025), an AD review (arXiv 2410.08860), a NeurIPS 2026 inline-AD dataset, ViDscribe 2026.
- Indic-language AI audio description: no product found.

**Feasibility: YES for one pre-processed clip (about 10 to 14 h). NO for live.**
- Browser frame sampling, then `gemma4` image input on Sarvam, then a short Hindi description.
- Find gaps with Saaras timestamps or simple energy-based voice activity detection.
- Fit lines with Bulbul `pace`, and duck the original audio under the narration.
- Use a self-shot or CC-licensed clip to avoid copyright problems.

**Likely judge reaction:** strong emotional pull and a timely policy hook. But "the vision model is the hero" and "you can pre-render offline, so why Flash?"

| Criterion | Score |
|---|---|
| Bulbul is the hero (25) | 20 |
| Flash latency essential (15) | 7 |
| Demo lands in 5 s (20) | 17 |
| Real stakes (20) | 16 |
| Novelty (10) | 6 |
| Toughest question (10) | 4 |
| **Total** | **70** |

Why these scores:
- Toughest question (4): vision hallucination, and who verifies? Fitting lines into gaps is hard, which the research literature itself flags.

**Strongest case:** Indian law now requires audio description, and India has 5 million people with seeing disability. Human audio description cannot scale. Bulbul narrating Hindi descriptions in dialogue gaps is a 10-second demo anyone understands.

### C3. Hospital interpreter (doctor and migrant patient; Saaras + translation + Bulbul)

**Prior art and context:**
- Google Translate live conversation (26 Aug 2025): "back-and-forth conversations in over 70 languages", "including Arabic, French, Hindi, Korean, Spanish, and Tamil", "available starting today for users in the U.S., India and Mexico". https://blog.google/products/translate/language-learning-live-translate/
- Google conversation mode had Hindi by 2017, then added "Bengali and Tamil". https://india.googleblog.com/2017/09/making-google-translate-betterand-more.html
- Government Bhashini app: "communicate with other who do not know your language". https://apps.apple.com/app/id6446089978
- Need: Narayan 2013, NMJI: "the issue of language barriers to healthcare has received very little attention in India". https://nmji.in/nmji/archives/Volume-26/Issue-4/SFM-II.pdf
- No quantitative Indian study of language discordance was found (**UNVERIFIED** magnitude).

**Feasibility: YES (about 6 to 8 h).** Saaras `transcribe` (its `translate` mode only outputs English), then Sarvam text translate, then Bulbul. The UI is two panes.

**Likely judge reaction:** "This is Google Translate." There are also medical-liability worries.

| Criterion | Score |
|---|---|
| Bulbul is the hero (25) | 15 |
| Flash latency essential (15) | 13 |
| Demo lands in 5 s (20) | 15 |
| Real stakes (20) | 15 |
| Novelty (10) | 2 |
| Toughest question (10) | 2 |
| **Total** | **62** |

Why these scores:
- Bulbul hero (15): only one of three stages is Bulbul.
- Toughest question (2): "How is this better than Google Translate live, and who is liable for a mistranslated dose?"

**Strongest case:** Indian-to-Indian language pairs (for example Odia to Tamil) with medical vocabulary and code-mixed speech. Saaras keyterms (up to 50 domain terms) could beat generic translators on drug names. This is untested.

### C4. Talking label and document reader for low-literacy users

**Prior art and context:**
- Google Lookout lists Hindi, Tamil, Bengali and more. "Lookout automatically identifies and reads text in any supported language". It has a Documents mode. "Food labels mode is only available in some countries." https://support.google.com/accessibility/android/answer/9031274?hl=en
- Pictogram study in India (Joshi and Kothiyal 2011, PMID via Europe PMC, PMC3122047): "indicating the need of using pictograms along with verbal reinforcement"
- National literacy rate: Census 2011 "74.04%" appears in search snippets only. The government pages could not be reached, so it is **UNVERIFIED** here.

**Feasibility: YES (about 5 to 8 h).**
- Camera capture, then `gemma4` image input (fast) or Sarvam Vision Document AI (job based, slower), then a plain-language explanation, then Bulbul.

**Likely judge reaction:** likes the full Sarvam stack (Vision + LLM + Bulbul), but "Lookout already reads Hindi aloud, free."

| Criterion | Score |
|---|---|
| Bulbul is the hero (25) | 18 |
| Flash latency essential (15) | 6 |
| Demo lands in 5 s (20) | 17 |
| Real stakes (20) | 15 |
| Novelty (10) | 3 |
| Toughest question (10) | 3 |
| **Total** | **62** |

Why these scores:
- Toughest question (3): an existing free product, and liability when a dose is misread.

**Strongest case:** it *explains* rather than reads ("take one after food, twice daily") in the user's code-mixed register, and it uses three Sarvam products end to end.

### C5. ICU communication board for intubated or temporarily voiceless patients (could be a Kanth mode)

**Prior art and context:**
- Mysuru, India, 2026 preprint (82 intubated adults): "usual care plus a Kannada-language VCB, a modified VIDATAK EZ board"; "between-group difference was 9.4 points" on ease of communication (Cohen's d = 1.73). Abstract via Europe PMC: https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:10.21203/rs.3.rs-10211307/v1&format=json&resultType=core
- Amritsar, India, 2024 (n = 80, PMC11691107): "communication board intervention significantly enhanced satisfaction scores".
- Iran 2018 (PMC6111665): "patients' anxiety had significantly decreased in the experimental group".
- The prior art is low-tech, laminated boards. A voice-output, multilingual, partner-listening digital version was not found as a product (**UNVERIFIED** absence).

**Feasibility: YES (about 5 to 8 h standalone; about 3 to 4 h as a Kanth mode).** It needs phrase sets in 2 to 3 languages, a nurse-side Saaras capture, and Bulbul output. Phrases can be pre-cached.

**Likely judge reaction:** high empathy and a clear clinical scenario. The question to expect: "Why not a ₹10 laminated board?"

| Criterion | Score |
|---|---|
| Bulbul is the hero (25) | 16 |
| Flash latency essential (15) | 6 |
| Demo lands in 5 s (20) | 17 |
| Real stakes (20) | 17 |
| Novelty (10) | 5 |
| Toughest question (10) | 5 |
| **Total** | **66** |

Why these scores:
- Flash latency (6): phrases can be cached, so latency barely matters.
- Toughest question (5): answerable by pointing to voice output to family, partner-question listening, and language switching. Infection control and patient strength remain open.

**Strongest case:** Indian ICU trials already show native-language boards cut communication difficulty with a large effect. Kanth's ICU mode makes that board speak, in the patient's language, to nurses and family.

---

## Ranked table (including Kanth)

| Rank | Idea | Bulbul hero /25 | Flash essential /15 | Demo in 5 s /20 | Real stakes /20 | Novelty /10 | Toughest Q /10 | **Total /100** | 15 h feasible? |
|---|---|---|---|---|---|---|---|---|---|
| 1 | C1 Indic screen-reader voice | 23 | 14 | 16 | 14 | 4 | 2 | **73** | Risky |
| 2 (tie) | **Kanth** | 18 | 8 | 16 | 18 | 5 | 5 | **70** | Yes, tight |
| 2 (tie) | C2 AI audio description | 20 | 7 | 17 | 16 | 6 | 4 | **70** | Yes, offline demo only |
| 4 | C5 ICU board (standalone) | 16 | 6 | 17 | 17 | 5 | 5 | **66** | Yes |
| 5 (tie) | C3 Hospital interpreter | 15 | 13 | 15 | 15 | 2 | 2 | **62** | Yes |
| 5 (tie) | C4 Talking label reader | 18 | 6 | 17 | 15 | 3 | 3 | **62** | Yes |

**Honest read:**
- On this rubric, C1 edges Kanth by 3 points. That lead comes almost entirely from the two Bulbul-centric criteria.
- C1 is the most likely to collapse under one informed question, and the least likely to be finished in 15 hours.
- Kanth is not killed. But its current pitch is exposed:
  - "first LLM AAC" is false;
  - "Avaz can't code-mix" is false;
  - "voice banking needs thousands of sentences" is outdated;
  - "15 wpm" is the wrong statistic.

## What would make Kanth win (evidence-backed changes)

1. **Make Flash essential, not hidden.** Start drafting and synthesizing while the partner is still talking (PredGen-style), and show a live "4 of 4 voices ready" meter.
   - Measure and display the time from the partner's end of turn to audio, against the 200 ms norm and the 700 ms threshold (A3).
   - The bar to beat is Lingraphica's reported 15-second conversation completion.
2. **Make Bulbul the visible hero.**
   - Code-mixed native-script output (Saaras `codemix`, then the LLM, then Bulbul `enhi` personas).
   - A tone dial on pace, pitch and loudness, *after* confirming that v4 Flash accepts pitch and loudness (the docs conflict).
   - An A/B against a robotic voice.
3. **Rewrite the novelty claim** as: "first AAC that pre-voices every suggestion in natural Indian code-mixed speech, operable by one switch." Credit Converser, Lingraphica, Voixa and SpeakFaster openly. Judges respect this more than a novelty claim they can puncture.
4. **Treat own voice as optional and honest.**
   - Clone from pre-onset audio (old voice notes), because the model copies the reference performance.
   - Cloning is beta and capped at 10 req/min on Starter, so prespeak with a cloned voice needs throttling.
5. **Add C5 as a mode.** ICU and temporary voicelessness gives a 5-second, high-stakes demo scene backed by Indian trial data.
