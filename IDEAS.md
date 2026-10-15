# IDEAS: trying to kill Kanth

Before building, we tried to find something better than Kanth for the Sarvam Bulbul Build Challenge ("Build something that speaks", powered by Bulbul V4 Flash). This is the record of that tribunal: the candidates, the research, the scores, and the verdict.

Primary research files: [research/field.md](research/field.md) (the live field and judge signals), [research/evidence.md](research/evidence.md) (claims checked against primary sources, and the five challengers researched in depth), [research/sarvam-api.md](research/sarvam-api.md) (what the API really does).

## The rubric

| Criterion | Points |
|---|---|
| Bulbul is the hero | 25 |
| Flash latency is essential to the product | 15 |
| The demo lands in five seconds | 20 |
| Real stakes | 20 |
| Novelty | 10 |
| Survives the toughest judge question | 10 |

Why this rubric: Sarvam's Epoch buildathon guidance (seen through a search extract, and corroborated by a finalist's README: "One parameter. Extra APIs score zero.") rewards depth on the single Sarvam capability central to the user's job. Sarvam's Build with Sarvam showcases reward real, slightly unexpected, everyday Indian situations. Sarvam positions V4 Flash as the tier for "when a listener is waiting for the first word".

## 32 candidates

Accessibility
1. **Kanth**: AAC for people who cannot speak. Listen, draft four replies, prespeak them all, play the chosen one instantly.
2. Indic screen reader voice: Bulbul V4 Flash as an NVDA or browser synthesizer for blind users.
3. AI audio description for Indian video, narrated in dialogue gaps.
4. ICU board for intubated and temporarily voiceless patients.
5. Talking label and form reader for low literacy users.
6. Relay calls for deaf and mute users (text in, voice out on a phone call).
7. Sign language to speech.
8. Dysarthria interpreter: recognise unclear speech, re-speak it clearly.
9. Laryngectomy voice restoration from mouthed words.
10. Walking assistant that narrates obstacles for blind users.
11. Stammer-friendly phone call assistant.

Health and care
12. Hospital interpreter between a doctor and a migrant patient who speak different Indian languages.
13. Medicine reminder calls (taken: Yaad).
14. Discharge instructions read aloud in the family's language.

Everyday India
15. Vegetable vendor haggling agent (showcased already by Sarvam).
16. Fake lived-in household to deter burglars (showcased already).
17. Railway and bus announcements generated in every local language.
18. Kirana shop voice ledger.
19. Doorbell that answers in your language.
20. Voice-first government form filling.
21. Farmer advisory line.

Learning and play
22. Pronunciation shadowing coach using pace control.
23. Antakshari or voice quiz (taken: BhashaBuzzer).
24. Bedtime stories with the family's names.
25. Voice RPG with Bulbul characters.
26. Indian parent nag bot (taken: Mujhe Pata Hai).

Media and tools
27. AI radio station (taken: Tarang FM).
28. Cricket commentary (taken: Galli Commentary, and Sarvam already showcased a cricket commentary engine).
29. Documents to narrated shorts (taken: Indic Short Editor).
30. Voice for coding agents (taken: bolo).
31. Podcast from a PDF (won the previous Bulbul challenge).
32. Live dubbing for video calls.

Ideas 6, 7, 8 and 9 failed the constraint that we produce everything alone: they need telephony accounts, sign language data, or recordings of people with disordered speech, which we must not fabricate. Ideas already taken in the field were dropped unless we had a sharply different angle.

## The live field

We searched GitHub (repos and code created since the announcement), the web, and individual public posts on X. The X quotes page and Discord were behind logins, so the field is undercounted. Full table: [research/field.md](research/field.md).

- About 21 entries and candidates found. The strongest on craft are Tarang FM, Samjhao and Bawaal Bureau.
- **No entry serves people who cannot speak.** The only disability-focused V4 Flash project found (Saathi, for blind users) was built for a different hackathon.
- **In every entry found, Bulbul speaks to the user. Kanth is the only one where Bulbul speaks as the user.**
- At least four entries already show a time-to-first-audio counter, so a latency counter alone is table stakes. What no one else can show is choice-to-voice time near zero.
- Sarvam's own accessibility page covers blind, low-literacy and elderly users, and never mentions people who cannot speak.

## The five strongest challengers, researched

Full research with sources in [research/evidence.md](research/evidence.md), section B. Scores are the researcher's adversarial judgement.

| Idea | Hero /25 | Flash /15 | 5 s demo /20 | Stakes /20 | Novelty /10 | Toughest Q /10 | Total | Buildable alone today? |
|---|---|---|---|---|---|---|---|---|
| C1 Indic screen reader voice | 23 | 14 | 16 | 14 | 4 | 2 | **73** | Risky |
| **Kanth** (before changes) | 18 | 8 | 16 | 18 | 5 | 5 | **70** | Yes, tight |
| C2 AI audio description | 20 | 7 | 17 | 16 | 6 | 4 | **70** | Offline demo only |
| C5 ICU board (standalone) | 16 | 6 | 17 | 17 | 5 | 5 | **66** | Yes |
| C3 Hospital interpreter | 15 | 13 | 15 | 15 | 2 | 2 | **62** | Yes |
| C4 Talking label reader | 18 | 6 | 17 | 15 | 3 | 3 | **62** | Yes |

**The strongest case for C1 (screen reader voice).** Blind users in India listen to robotic eSpeak Hindi and Tamil all day; a natural Indic voice there is pure Bulbul, and every keystroke echo is latency critical. Why it did not win: it collapses under one informed question. Expert blind listeners run speech at speeds Bulbul's pace cap of 2.0x cannot reach; Apple's ICASSP 2025 work calls cloud neural TTS impractical for screen reading because of latency; an offline Google TTS add-on for NVDA shipped on 2026-10-12. It is also the riskiest to build and to demo in five seconds. A 3 point lead built on fragile ground is not a clear margin.

**The strongest case for C2 (audio description).** A blind viewer hears what happens on screen, in their language. Why not: Flash latency is irrelevant for offline narration, the vision model would be the hero rather than Bulbul, and the demo needs licensed video.

**C5 (ICU board)** is a mode of Kanth, not a rival. We folded it in: the always-ready board ("It hurts", "I need suction", "Call the nurse") is cached on the device and speaks with no network, which we show in the film.

**C3 (interpreter)** is a pipeline showcase in which Bulbul is one of three equal parts, and live dubbing is well covered by others. **C4 (label reader)** is solid but expected, with no latency story.

## What the research changed in Kanth

The challenger research did not beat Kanth by a clear margin, so we kept the idea. It did expose four weaknesses, and we fixed each one:

1. **"You pre-render, so why does Flash matter?"** We now draft and voice replies from Saaras partial transcripts while the partner is still talking. Measured in the live demo: four replies on screen 0.4 s before the partner finished. Flash is now what puts four voiced replies inside the partner's turn, not after it.
2. **Wrong numbers in the original pitch.** "AAC users average 15 wpm" is the speech recognition figure from Koester and Arthanat 2018; the right statement is "typically under 10 wpm, and 1.7 wpm with switch scanning". "57% fewer motor actions" for SpeakFaster was a simulation result. "Voice banking needs 3,200 sentences" is out of date. All public copy was corrected.
3. **Overclaimed novelty.** Listening to the partner and suggesting replies is not new: Converser (2008), Lingraphica Conversations (2026), Voixa (which lists Hindi), SpeakFaster. We credit them. What we found no prior art for in AAC is prespeaking every option before the choice, in natural code-mixed Indian speech, operable with one switch. Even that we state as "no prior art found", not "first".
4. **Own voice is not the headline.** Sarvam voice cloning is a separate beta API that ignores the model parameter, takes about 1.6 s to first audio, and in our tests honours only pace, not pitch or loudness. The default voice is a Bulbul V4 Flash persona. Banking your own voice is an optional, consent-gated extra.

## Verdict

Kanth stays. No challenger beat it by a clear margin with evidence, and the only one that edged it on paper was the least likely to survive a judge's first question. After the changes above, our own adversarial re-score is: Bulbul hero 20 (every word the user says is Bulbul, with the tone dial on pace, pitch and loudness), Flash essential 12 (drafting and voicing inside the partner's turn), demo in five seconds 17, real stakes 18, novelty 6, toughest question 8. That is 81, against 73 for the best challenger. This re-score is ours and is not independent.

The toughest question we expect, and our answer:

> "Your own benchmark shows the drafts match what the user meant only some of the time. So what is this for?"

Kanth is the fastest path when a draft fits, and it never stands in the way when one does not: one or two typed words redraft all four, and free typing is always there. The benchmark numbers, including the misses, are in the README.
