# Kanth conversation benchmark: hit rate, motor actions, turn gap

Generated 2026-10-15 02:21 UTC from raw files in `bench/results/conversations-raw-*.json`. Code: `bench/conversations.ts` (API runs), `bench/conversations_analyze.ts` (this report), test set `bench/conversations.data.ts`.

**Test set: SCRIPTED, not real users.** 36 hand-written partner turns in 12 three-turn threads (12 Tamil, 12 Hindi/Hinglish, 12 Indian English) for the fictional demo user Arjun (34, ALS, Chennai). Each turn has the reply the user actually wants to say. All 36 intended replies were written before any model drafted a reply for these turns, and none was changed after seeing model output.

**How to read the numbers.** Every number is labelled **MEASURED** (timed or counted in a run) or **MODELED** (computed from cited human rates and stated assumptions). The turn gaps are MODELED totals: they add measured system latencies to modeled human selection and typing times.

**Measurement conditions.** Run started 15/10/2026, 7:39:37 am IST on a home connection in India (Windows, Node v25.2.1). Up to two other agents may have been calling the same Sarvam account concurrently, so these latencies were measured under shared load.

## 1. Do the drafts say what the user meant? (MEASURED, LLM-judged)

For each turn the real drafting code (`server/suggest.ts` `streamSuggestions`, model `sarvam-105b-conversations`, thinking off, temperature 0.7, tone warm, demo profile) drafted 4 replies. The history included the earlier turns of the same thread, with the intended replies standing in for the user's past turns.

A judge (`sarvam-105b`, reasoning on, temperature 0) was asked: *Which draft, if any, conveys the same core meaning and intent as the intended reply, such that the user would accept it as saying what they meant?* The judge ran twice per turn. A turn counts as a hit only if both runs named the same draft.

| Language | Turns | Top-1 hit | Top-4 hit | Judge runs agree | Hit in either run |
|---|---:|---:|---:|---:|---:|
| Tamil | 12 | 1 (8.3%) | 2 (16.7%) | 10/12 | 4 |
| Hindi | 12 | 0 (0.0%) | 2 (16.7%) | 11/12 | 3 |
| English | 12 | 1 (8.3%) | 1 (8.3%) | 11/12 | 2 |
| **All** | 36 | 2 (5.6%) | 5 (13.9%) | 32/36 | 9 |

Counting a hit when either judge run found one (an upper bound) gives 9/36 (25%).

What this means: on about 14% of turns one of the four drafts says what the user meant, so one selection replaces typing. On the other 86%, the user types (Kanth's free-typing path). This is a finding about this scripted set. The intended replies are deliberately specific (a time, a side of the body, a drug name, a preference), and a draft cannot know those facts.

**Language and script of the drafts.**
- Judge flags across all 144 drafts: wrong language 0 (both runs) / 1 (either run); wrong script 1 (both) / 15 (either).
  - Reading the flagged drafts, the single-run script flags are almost all Latin-script words inside Hindi or Tamil drafts. Most are English words (allowed by Kanth's script rule).
  - A few are Indic words in Latin script, "Amma" and "rasam". The model copies these from the profile, which spells them in Latin. The one draft flagged by both runs is hi02 "Amma ने pillow adjust किया था".
- Deterministic script check (Tamil drafts must contain Tamil script and no Devanagari; Hindi drafts must contain Devanagari and no Tamil; English drafts contain no Indic script): 0 drafts fail.

Per-turn detail: the intended reply, the four drafts, both judge verdicts, and the judge's reasons are in `conversations.json` under `turns`.

**Problems seen in the drafts.** These are deterministic counts over all 144 drafts, not judge outputs.
- **Profile leakage:** 15 drafts bring up rasam (the profile note "loves his mother's rasam") when nobody in the thread had mentioned it. Examples: `ta01: என்னோட favourite rasam ஊத்தி குடுங்கம்மா`; `ta05: ரசம் குடிச்சிட்டு மாத்துங்க சிஸ்டர்`; `ta06: ரசம் குடிச்சா நல்லா இருக்குமா?`.
- **Wrong addressee:** 5 drafts address someone other than his mother as "Amma": `hi07 (Ramesh): बस 5 minute रुकना, Amma`; `hi08 (Ramesh): बस एक चम्मच डालो, Amma`; `en02 (Physiotherapist): It's a little stiff, Amma`; `en03 (Physiotherapist): Evening is perfect, Amma`; `en07 (Mrs. Iyer): Just some rasam ingredients, Amma`.
  - Mentions of Amma ("ask Amma first") are not counted.
  - The Tamil "-ம்மா" suffix used with the nurse is ordinary politeness to a woman, so it is not counted either.
  - Others use the partner's label as a name: hi11 says "Lab technician", and hi10 addresses the user himself ("Arjun").
- Both problems lower the hit rate, and both can be fixed in the prompt (`server/suggest.ts` `buildMessages`).

## 2. Measured system latency (MEASURED, this run, n = 36 turns)

Clocks start when the drafting request is sent, which in the app is right after Saaras returns the final transcript.

| Stage | Median | P25 to P75 | Min to max |
|---|---:|---:|---:|
| First draft parsed | 157 ms | 139 to 172 ms | 125 to 248 ms |
| All 4 drafts parsed | 352 ms | 306 to 377 ms | 277 to 562 ms |
| All 4 drafts have first audio (prespeak) | 676 ms | 621 to 708 ms | 586 to 5980 ms |
| All 4 drafts fully synthesized (prespeak, pool of 4) | 946 ms | 851 to 1013 ms | 765 to 8650 ms |
| TTFA, single synthesis of a draft on choice (warm socket) | 301 ms | 299 to 303 ms | 285 to 416 ms |
| TTFA, single synthesis of the typed reply (warm socket) | 301 ms | 299 to 303 ms | 291 to 404 ms |

Prespeak ran exactly as `server/session.ts` runs it: each draft starts synthesizing on a `TtsEngine` pool of 4 warm Bulbul v4 Flash WebSockets the moment it is parsed. Transports used across 144 prespoken drafts: ws 143, http-stream 1.

**Anomalies seen (MEASURED; they are kept in the medians above):**
- ta05: one socket gave no audio within 5 s. The engine fell back to HTTP streaming (first audio at 5.4 s), so all 4 were voiced only at 6.1 s.
- hi11: Bulbul returned 57.8 s of audio for a 42-character draft ("हाँ, सुबह से कुछ नहीं खाया, Lab technician"). Runaway audio like this would be heard by the partner if that draft were chosen. Kanth should cap playback by expected duration.

**Comparison with the live app** (MEASURED in-app by the team, 3 demo turns): first draft 321 to 367 ms; all 4 drafts 480 to 561 ms; all 4 voiced 1.06 to 1.21 s; Saaras final transcript 102 to 123 ms after the partner stopped; choice to audible 58 to 59 ms when prespoken; typed text to audible about 397 ms.
- The in-app figures are counted from the partner stopping, and include the browser hop.
- Cross-check for the typed path: TTFA here (median 301 ms) plus 59 ms playback start = 360 ms, against about 397 ms in the app.

## 3. Motor actions per utterance (counted from the data; scanning presses are MODELED)

**Plain typing.** Keystrokes = characters of the intended reply on a Roman keyboard, + 1 to speak.
- Tamil and Hindi replies were romanized with Sarvam `POST /transliterate` (native to `en-IN`). `research/probes/p08_translit_lid.py` shows this path works.
- The romanization is not always right: for example, ta07 "ஏழு மணிக்கு" came back as "satta gantalaku". Its length is still a reasonable proxy for what a person would type.
- No word prediction, no shift key. Native code-point counts are given as a sensitivity check.

**Kanth.** A hit is 1 selection. A miss costs the plain-typing count.

**Single-switch scanning.**
- Typing on a scanning keyboard is modeled as 2 presses per character (row, then column), and the speak key counts as one more character.
- A Kanth hit is 1 press, after waiting (index + 1) scan steps.

| Language | Typing keys (Roman) | Typing keys (native count) | Kanth, touch | Reduction | Scan presses, typing | Scan presses, Kanth | Reduction | Scan steps waited on hits |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Tamil | 35.9 | 34.7 | 29.2 | 19% | 71.8 | 58.2 | 19% | 1.5 |
| Hindi | 38.0 | 32.7 | 31.5 | 17% | 76.0 | 62.8 | 17% | 3.0 |
| English | 38.2 | 38.2 | 34.9 | 9% | 76.3 | 69.8 | 9% | 1.0 |
| **All** | 37.4 | 35.2 | 31.9 | 15% | 74.7 | 63.6 | 15% | 2.0 |

Because a miss costs the full typing count, the reduction is roughly the hit rate. The hit rate is the lever.

## 4. Turn gap: partner stops speaking to the user's voice being audible (MODELED totals)

There are two access methods.
- **Direct selection** (touch, or an eye-gaze or head pointer). One selection or keystroke = 2.86 s.
  - This is derived from 4.2 wpm for cursor-based on-screen keyboards (Koester and Arthanat 2018, Assistive Technology 30(3), via research/evidence.md A2, verified) at 5 characters per word.
- **Single-switch scanning** at the app's default 1.4 s interval. Typing costs 7.06 s per character, from 1.7 wpm for scanning on-screen keyboards (same source).

| Part | Value | Status |
|---|---|---|
| Saaras final transcript after partner stops | 123 ms (upper end of 102 to 123 ms) | MEASURED in-app (not re-measured here) |
| Drafting, all 4 parsed | per turn | MEASURED this run |
| All 4 prespoken, fully synthesized | per turn | MEASURED this run |
| TTFA when synthesizing on choice or after typing | per turn | MEASURED this run (single synthesis, warm socket) |
| Playback start once audio is in the browser | 59 ms | MEASURED in-app |
| Direct selection of a draft | 2.86 s (one keystroke-time) | MODELED from cited 4.2 wpm |
| Scanning selection of draft i | (i + 1) x 1.4 s | MODELED (app default interval) |
| Typing | (chars + 1) x 2.86 s direct, x 7.06 s scanning | MODELED from cited rates |
| Miss overhead before typing | wait for drafts + 1 selection (direct) or 5 scan steps (scanning) | MODELED |

**The three conditions:**
- **(a) Plain typing.** Typing time + TTFA + playback start.
- **(b) Suggestions, no prespeak.**
  - Hit: STT + all-4-drafted + selection + TTFA on choice + playback start.
  - Miss: STT + all-4-drafted + miss overhead + typing + TTFA + playback start.
- **(c) Suggestions with prespeak.**
  - Hit: the choice happens at STT + all-4-drafted + selection. Audio starts at that moment if all 4 drafts were fully synthesized by then; otherwise it waits for the remainder. Then add playback start.
  - Miss: same as (b), because typed text cannot be prespoken.

| Access | Condition | Median, all 36 turns | Mean, all 36 turns | P25 to P75 | Median, hits only |
|---|---|---:|---:|---:|---:|
| Direct (touch) | (a) Plain typing | 108.9 s | 107.1 s | 94.6 s to 115.4 s | n/a |
| Direct (touch) | (b) Suggestions, no prespeak | 105.1 s | 94.3 s | 88.1 s to 115.9 s | 3.70 s (n=5) |
| Direct (touch) | (c) Suggestions + prespeak | 105.1 s | 94.4 s | 88.1 s to 115.9 s | 3.42 s (n=5) |
| Switch scanning | (a) Plain typing | 268.6 s | 264.1 s | 233.3 s to 284.5 s | n/a |
| Switch scanning | (b) Suggestions, no prespeak | 258.4 s | 231.2 s | 216.2 s to 284.9 s | 3.66 s (n=5) |
| Switch scanning | (c) Suggestions + prespeak | 258.4 s | 231.2 s | 216.2 s to 284.9 s | 3.36 s (n=5) |

Per language (median over all turns of that language):

| Language | Direct (a) | Direct (b) | Direct (c) | Scan (a) | Scan (b) | Scan (c) |
|---|---:|---:|---:|---:|---:|---:|
| Tamil | 94.6 s | 93.8 s | 93.8 s | 233.3 s | 230.3 s | 230.3 s |
| Hindi | 110.4 s | 109.4 s | 109.4 s | 272.1 s | 269.0 s | 269.0 s |
| English | 110.4 s | 112.2 s | 112.2 s | 272.1 s | 276.0 s | 276.0 s |

How to read this:
- The human norm for a turn gap is about 200 ms. Levinson and Torreira 2015 put it "of the order of 200 ms", with modes of 0 to 200 ms across 10 languages (Stivers et al. 2009).
- Gaps of 700 ms or more are heard as reluctance (Levinson and Torreira 2015). Both are in research/evidence.md A3, verified.
- No condition reaches that norm for a person who has to select with their body. On a hit, Kanth removes the typing and leaves one selection.
- Prespeak then removes the synthesis wait after that selection: direct-selection hits drop by about the TTFA, roughly 0.3 s.
- When the median turn is a miss, the all-turns median is still a typing time. The hits-only column shows what a hit costs.
- Scanning hits come out faster than direct-selection hits. This is a modeling artifact: a direct selection is charged one full keystroke-time at 4.2 wpm (2.86 s, which includes searching a keyboard), while a scanning hit on draft 1 waits one 1.4 s step. Choosing among 4 large cards is probably faster than that, so the direct-selection hit times are conservative.

Chart: `docs/img/turn-gap.png` and `docs/img/turn-gap.svg`.

## 5. Caveats
- **Scripted set, one author, 36 turns.** Intended replies are not real user data. Hit rates carry wide uncertainty: with n = 12 per language, one turn moves the rate by 8 points.
- **LLM judge.** The judge is a Sarvam model judging Sarvam drafts, so self-preference is possible. Requiring two-run agreement reduces noise, not bias. The drafts were shown in app order, so position bias is possible.
- **Human timing is modeled, not measured.**
  - Seconds per keystroke come from population averages for text entry. Those averages already include whatever prediction the studied systems had, and errors.
  - Reading the 4 drafts is folded into one selection time.
  - Real users vary widely: SpeakFaster's two ALS gaze typists ran at 4.05 and 8.1 wpm (evidence.md A2).
- STT latency is the in-app measurement from 3 turns (upper end used), not re-measured here.
- Prespeak readiness uses the strict definition (all 4 fully synthesized). With streaming playback, the chosen draft could start as soon as its own first audio arrived.
- Concurrency: other agents may have been using the same API key during the run.

## Appendix A. Per-turn verdicts

Judge columns give the draft number each run chose (none = no draft qualified). A hit needs both runs to agree.

| Turn | Partner | Intended reply | Run 1 | Run 2 | Hit | All 4 drafted | All 4 voiced |
|---|---|---|---:|---:|---:|---:|---:|
| ta01 | Amma | இட்லி போதும் Amma, ரெண்டு மட்டும் | none | none | miss | 504 ms | 1108 ms |
| ta02 | Amma | பரவாயில்ல Amma, பக்கத்துல தண்ணி வச்சுடுங்க | none | none | miss | 348 ms | 988 ms |
| ta03 | Amma | ஆமா Amma, ரசம் சாதம் வேணும் | none | 1 | miss | 451 ms | 957 ms |
| ta04 | Sister Kavitha | சரி, பண்ணுங்க. தொண்டை அடைக்குது | none | none | miss | 382 ms | 933 ms |
| ta05 | Sister Kavitha | ஆமா, இடது பக்கம் திருப்புங்க | none | none | miss | 562 ms | 6134 ms |
| ta06 | Sister Kavitha | இல்ல, ஆனா கொஞ்சம் tired-ஆ இருக்கு | none | none | miss | 387 ms | 872 ms |
| ta07 | Karthik | வா டா, ஏழு மணிக்கு வா | none | none | miss | 489 ms | 1217 ms |
| ta08 | Karthik | நீ வாங்கிக்கோ, நான் Amma ரசம் சாப்பிடறேன் | 2 | 2 | draft 2 | 444 ms | 1038 ms |
| ta09 | Karthik | நான் நல்லா இருக்கேன்னு சொல்லு, எல்லாரையும் miss பண்றேன் | none | none | miss | 360 ms | 970 ms |
| ta10 | Pharmacist | Same salt-ஆ இருந்தா குடுங்க | none | none | miss | 360 ms | 1009 ms |
| ta11 | Pharmacist | GPay பண்றேன், QR காட்டுங்க | 4 | none | miss | 331 ms | 872 ms |
| ta12 | Pharmacist | ஆமா, delivery பண்ணுங்க, அதே address தான் | 1 | 1 | draft 1 | 362 ms | 969 ms |
| hi01 | Dr. Mehra | निगलने में थोड़ी दिक्कत बढ़ गई है | none | none | miss | 377 ms | 1245 ms |
| hi02 | Dr. Mehra | हाँ, लेटने पर साँस फूलती है | 2 | 2 | draft 2 | 377 ms | 1026 ms |
| hi03 | Dr. Mehra | क्या mask पूरी रात पहनना पड़ेगा? | none | none | miss | 362 ms | 943 ms |
| hi04 | Rohit | अरे Rohit! तुझे देखकर बहुत अच्छा लगा | none | none | miss | 420 ms | 852 ms |
| hi05 | Rohit | हाँ देखा, last over में मज़ा आ गया | none | none | miss | 349 ms | 847 ms |
| hi06 | Rohit | शाम को चलेंगे, धूप में नहीं | none | none | miss | 355 ms | 787 ms |
| hi07 | Ramesh | दस मिनट रुको, पहले चाय पीनी है | none | none | miss | 332 ms | 842 ms |
| hi08 | Ramesh | हाँ, बस आधा चम्मच | none | none | miss | 359 ms | 1112 ms |
| hi09 | Ramesh | हाँ याद है, उससे पहले मुझे बैठा देना | none | none | miss | 342 ms | 769 ms |
| hi10 | Lab technician | बाएँ हाथ से लीजिए, वहाँ vein अच्छी है | 1 | none | miss | 361 ms | 930 ms |
| hi11 | Lab technician | नहीं, रात दस बजे के बाद कुछ नहीं खाया | 4 | 4 | draft 4 | 325 ms | 8650 ms |
| hi12 | Lab technician | Doctor को भी copy भेज दीजिए please | none | none | miss | 348 ms | 852 ms |
| en01 | Physiotherapist | Let's start, but go slow on the legs. | none | none | miss | 321 ms | 948 ms |
| en02 | Physiotherapist | Cramps at night, mostly in the fingers. | none | none | miss | 360 ms | 906 ms |
| en03 | Physiotherapist | Evening is fine, after six. | none | none | miss | 285 ms | 977 ms |
| en04 | Priya | Yes, I'd love that. Send me small PRs. | none | none | miss | 306 ms | 1053 ms |
| en05 | Priya | Keep it short, I get tired quickly. | none | none | miss | 299 ms | 844 ms |
| en06 | Priya | That sounds lovely, but keep it small. | none | none | miss | 306 ms | 844 ms |
| en07 | Mrs. Iyer | Yes aunty, some bananas and bread please. | none | none | miss | 298 ms | 981 ms |
| en08 | Mrs. Iyer | She's not sleeping well, she worries about me. | none | none | miss | 290 ms | 765 ms |
| en09 | Mrs. Iyer | That would be so kind, thank you aunty. | 1 | 1 | draft 1 | 279 ms | 1009 ms |
| en10 | Emergency doctor | Chest feels tight since this morning. | none | none | miss | 277 ms | 778 ms |
| en11 | Emergency doctor | Only riluzole, no new medicines. | none | none | miss | 289 ms | 894 ms |
| en12 | Emergency doctor | Please call my mother, she's outside. | none | 2 | miss | 282 ms | 834 ms |

## Appendix B. Files
- `bench/conversations.data.ts`: the scripted test set.
- `bench/conversations.ts`: API runs (draft, judge, translit).
- `bench/conversations_analyze.ts`: this report.
- `bench/conversations_chart.py`: the chart.
- `bench/results/conversations-raw-draft.json`: every draft, timing, prespeak synthesis and token usage.
- `bench/results/conversations-raw-judge.json`: both judge runs, with content, usage and timing.
- `bench/results/conversations-raw-translit.json`: romanizations.
- `bench/results/conversations.json`: the joined per-turn data and aggregates.
- `bench/results/conversations-*.log`: run logs.
