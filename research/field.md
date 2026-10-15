# Kanth: competitive field and judge signals

Compiled 2026-10-15 (IST), roughly 01:00 to 01:15 IST. The challenge deadline is 2026-10-15 20:00 IST, so more entries will land after this was written.

Ground rules: every claim links a URL that was opened while writing this. **UNVERIFIED** marks a claim seen only in a search-engine extract, or a source that could not be opened.

## How this was gathered (and what it misses)

- **GitHub**, via `gh`: `gh search repos "bulbul"` and `"sarvam"` (created on or after 2026-10-12), plus README-match searches for "Bulbul Build Challenge", "Bulbul V4 Flash", "bulbul v4" and "v4-flash". Code search covered `bulbul:v4-flash`, `shubh_enhi`, `enhi_ads` (the v4 default voice ID), "Bulbul V4" and "Build something that speaks". It hit the 10-requests-per-minute code-search limit once. READMEs were read with `gh api repos/OWNER/REPO/readme`.
- **Web search and fetch**: Sarvam blog, docs, product pages and news coverage.
- **X**: the `claude-in-chrome` extension was **not connected**, so the logged-in X quotes page and search could not be used. A built-in, logged-out browser pane opened individual public posts. `/quotes` redirected to the login page, and thread replies are hidden when logged out. **So entries posted only on X or Discord, with no GitHub repo, are under-counted.** Discord was not accessible at all.
- LinkedIn: search engine only. No posts were opened.

## 1. Entries table

Threat is to **Kanth**, an AAC app for people who cannot speak. "A11y" means disability accessibility.

### 1a. Confirmed or very likely Bulbul Build Challenge entries

| # | Entry | Author | Links | What it does | Sarvam capabilities | A11y? | Threat | Why |
|---|---|---|---|---|---|---|---|---|
| 1 | **Tarang FM** | harshbhx (Harsh Bhanushali) | https://github.com/harshbhx/tarang-fm | AI radio station. Hindi, Marathi, Tamil, Bangla and Gujarati stations, "29 distinct personas", RJ call-ins by voice. Each line's delivery maps to `pace`, `loudness` and `temperature`. | Bulbul v4 Flash (HTTP streaming, linear16), Saaras v4, Sarvam-105B | No (captions only) | **High** | Most polished and judge-aware entry. Its PRD scripts "A judge's first two minutes" on a phone, and it shows off the V4 persona catalog more than any other entry. Different problem space, but strong on craft. |
| 2 | **Samjhao** | thebrokenapp | https://github.com/thebrokenapp/samjhao | Turns "how do I...?" phone help into one WhatsApp voice note in the parent's language. Polite "you" forms, gender agreement, an OTP/UPI scam-safety line. Shows measured time to first audio (about 250 ms). | Bulbul v4 Flash (HTTP stream, MP3 parts concatenated byte for byte), Sarvam-105B | Adjacent (elderly digital inclusion, not disability) | **High** | The entry closest to an "assistive" story, with deep V4-specific craft. It competes for the same "voice that helps someone" emotional slot. |
| 3 | **Bawaal Bureau** | vishalsingh2972 (Vishal Singh) | https://github.com/vishalsingh2972/bawaal-bureau-101 · https://x.com/vishalsingh2972/status/2110414735187624138 | Satirical "crisis room" that turns tiny problems into national emergencies. Pre-generated five-language relay, plus a live Hindi/Hinglish desk. | Bulbul V4 Flash, Sarvam 105B | No | **Medium-High** | Same builder as "Hyderabadi Sabzi Aunty", which Sarvam already featured in Build with Sarvam #4 (see 2b), so the judges likely know him. Not the same problem space. |
| 4 | **Mujhe Pata Hai** | garimapahwa | https://github.com/garimapahwa/mujhe-pata-hai · https://garimapahwa.github.io/mujhe-pata-hai | macOS idle detector that nags like an Indian parent. Five characters. Escalates through `pace`/`pitch`/`loudness` (1.0/0.0/1.0 → 1.15/0.1/1.6 → ...). Common lines pre-cached. | Bulbul v4 Flash (`/text-to-speech/stream`), Saaras v4, Sarvam-105B | No (README says no Accessibility permission is needed) | **Medium** | Already shows "prosody as a dial", the same V4 control Kanth's tone dial uses. Kanth's dial needs a clearer human reason than comedy. |
| 5 | **BhashaBuzzer** | choksi2212 | https://github.com/choksi2212/sarvam-challenge | Hinglish voice quiz show with an AI host. "Honest latency ticker" (75–197 ms TTFB measured), STT, an LLM judge, and a sha256 audio cache. | Bulbul V4 Flash (WebSocket), saaras:v4, sarvam-105b | No | **Medium** | Best latency engineering and measurement in the field, so "we show latency" is no longer a differentiator. |
| 6 | **Dost** | Vardhu2706 / @var_ayy (Vardhaman) | https://github.com/Vardhu2706/dost · https://x.com/var_ayy/status/2110368539198845174 | "A friend you can call. No app, no login." Hindi, English and Telugu. Says it is an AI first, refers to Tele-MANAS 14416, and is "Not clinically validated". | Bulbul v4 Flash (streamed) | No (wellbeing) | **Medium** | Social-good framing with careful safety copy. Competes for the "empathy" vote. The X post had 28 views when opened. |
| 7 | **Yaad** | Sujithkrys | https://github.com/Sujithkrys/yaad · https://yaad-alpha.vercel.app | Family schedules medication reminders, and a voice agent calls the parent in their language and logs the answer. | Sarvam voice agent (README configures `SARVAM_WORKSPACE_ID`). Exact Bulbul model not stated in README. | Adjacent (elder care) | **Medium** | Care-for-a-vulnerable-person narrative, but no disability focus. |
| 8 | **Awaaz** | prince1120 | https://github.com/prince1120/awaaz | Multi-agent voice roundtable with distinct voices, clause-level streaming (claims under 500 ms TTFA) and barge-in in under 10 ms. | Bulbul V4 Flash, Saaras STT, Sarvam-105b | No | Low-Medium | Pipeline showcase in a crowded "AI characters talking" niche. |
| 9 | **bolo** | Vedant020000 | https://github.com/Vedant020000/bolo | speak/listen MCP plugin for coding agents (Claude Code, Codex, VS Code, and others). README says "Built for the Sarvam Discord Community Challenge". | Bulbul V4 Flash (200+ personas), Saaras V4 | No | Low-Medium | A novel dev tool that could appeal to devrel judges. No overlap with AAC. |
| 10 | **Galli Commentary** | Anandb71 (**the same GitHub account as this workspace**) | https://github.com/Anandb71/galli-commentary | Tap a ball and hear it called in Hinglish, Tamil, Telugu or Bengali. Visible click-to-first-audio counter. | Bulbul v4 streaming TTS, Sarvam 105B | No | n/a (own) | Note: Build with Sarvam #1 (Apr 2026) already featured "an AI cricket commentary engine" (see 2b). |
| 11 | **callmi** | pratyush06-aec | https://github.com/pratyush06-aec/callmi_2.0 | Outbound sales agent for a web agency. Hindi, English and Telugu, with WhatsApp follow-ups. | Bulbul v4 Flash TTS only (LiveKit + Groq gpt-oss-20b + Deepgram STT) | No | Low | Generic sales agent. The repo was created 2026-08-27, before the challenge. |
| 12 | **Indic Short Editor** (probable match) | YUGESHKARAN | https://github.com/YUGESHKARAN/indic_research_scholar · https://indic-research-scholar.vercel.app | "Shorts Studio": script or doc to narrated MP4. A 2026-10-14 commit reads "Indic shorts implemented with sarvam:bulbul-v4-flash". | bulbul:v4-flash, sarvam-105b | No | Low | Matching it to the name "Indic Short Editor" is **UNVERIFIED**. The repo dates from July 2026. |
| 13 | **Chakravyuh Live** | ? | not found | 4-agent negotiation arena (from the brief) | ? | ? | Low? | **UNVERIFIED**: no repo or post found on GitHub or the web. |

### 1b. New candidates (Bulbul V4 Flash, created in or near the window; entry status unconfirmed)

| # | Entry | Author | Links | What it does | Sarvam capabilities | A11y? | Threat | Why |
|---|---|---|---|---|---|---|---|---|
| 14 | **Bulbul Build** (Talking Bulbul, Udhaar Wapas) | adsk2050 | https://github.com/adsk2050/bulbul-build | "Indian voice toys built on Sarvam Bulbul V4 Flash": a parrot that repeats you while "Sharma uncle" cuts in, and a polite debt-recovery voice note in 10 languages. Repo created 2026-10-14. | Bulbul V4 Flash, Sarvam LLM | No | Low | Toy or comedy. Entry status **UNVERIFIED** (README does not name the challenge). |
| 15 | **Stereo Sabha** | TheRealSaiTama | https://github.com/TheRealSaiTama/stereo-sabha | Two AI voices, one in each ear, and you can jump in by mic. Hindi and English. | Sarvam 105B, **Bulbul v3** (per README), Sarvam STT | No | Low | Uses v3, not V4 Flash. Entry status **UNVERIFIED**. |
| 16 | **Saathi** | 1012aaditya | https://github.com/1012aaditya/saathi-offline-assistant | Voice-first Android assistant for **blind and low-vision** users in Hindi, English and Hinglish, with a deterministic "never send, order or pay without yes" gate. | `bulbul:v4-flash` + `saaras:v4` (laptop prototype, per PROJECT.md); OpenAI for reasoning and vision | **YES (blind)** | Low-Medium | **Built for HACK47: OFFGRID (Devpost), not this challenge**, per its PROJECT.md. It would only matter if cross-posted. The only disability-focused project found that uses V4 Flash. |
| 17 | **Interactive Tech Tutor** | YatinG021 | https://github.com/YatinG021/interactive_tech_tutor | Animated tech-concept explainers narrated by Bulbul. Keyboard shortcuts, subtitles, reduced motion. Created 2026-10-13. | `bulbul:v4-flash` | Partial (UI a11y) | Low | No challenge mention. |
| 18 | **Shawtty** | PallabDev | https://github.com/PallabDev/Shawtty | Automated 9:16 reel generator with narration. Created 2026-10-12. | `bulbul:v4-flash` | No | Low | No challenge mention. |
| 19 | **AI Allergen Detector** | ricksohamdas-sudo | https://github.com/ricksohamdas-sudo/ai-allergen-detector | Reads food-safety warnings aloud in English, Hindi and Bengali. Created 2026-10-12. | `bulbul:v4-flash` | Minor ("Indic voice accessibility") | Low | No challenge mention. |
| 20 | **Mahi Voice Assist** | ShabariES | https://github.com/ShabariES/Mahi-Voice-Assist | Voice-driven form filling: TTS asks the question and the user answers by voice. Created 2026-10-09. | Bulbul v4 Flash (falls back to ElevenLabs) | Adjacent | Low | Predates the announcement. Not an entry as far as can be seen. |
| 21 | **web-readaloud-extension** | SiddharthChillale | https://github.com/SiddharthChillale/web-readaloud-extension | Browser extension that reads articles aloud, with a two-host podcast mode. Created 2026-10-10. | Bulbul v4 Flash voices | Adjacent (read-aloud) | Low | Predates the announcement. |

Context from the same window (not challenge entries): Sarvam Campus '26 hackathons (for example Aawaz at https://github.com/shubhamiitshk/AWAAZ-SARVAM, which is a maths tutor and not the "Awaaz" roundtable), the IndiaMART Voice AI Hackathon 2.0 (https://github.com/Pratik-Singh-web/Murmur), and an Inter IIT Tech Meet 15.0 Sarvam problem statement (https://github.com/adit1290codesrank/interiit_minips). Many repos used `bulbul:v4-flash` **before** the 2026-10-13 X post. The model was in the API by about 2026-10-06 (see 3c).

### 1c. Accessibility / AAC overlap flag

- **No AAC, speech-disability, deaf or non-verbal entry was found** among roughly 20 entries and candidates. GitHub README searches for AAC, augmentative, non-verbal, speech impaired, aphasia, ALS, cerebral palsy, deaf, eye gaze, switch scanning and blink, each combined with sarvam or bulbul, returned nothing relevant. The two "AAC" hits were the audio codec.
- The only disability-focused V4 Flash project is **Saathi** (blind users). It was built for a different hackathon.
- **Samjhao** and **Yaad** are the nearest neighbours in narrative: both help elderly parents. Neither involves disability, and in both Bulbul is the *app's* voice, not the user's.
- **Kanth appears to be the only entry where Bulbul speaks *as the user*, in first person.** In every other entry Bulbul is an AI character, narrator or agent speaking *to* the user.

## 2. Judge signals

### 2a. Epoch buildathon handbook: "depth over breadth"

- Handbook URL: https://growthx.club/docs/sarvam. **Opened, but it is login-walled**: it redirects to `growthx.club/login`. Its text could not be read directly.
- A search-engine extract of that page (**UNVERIFIED**) says the following. Judges score the single Sarvam capability most central to completing the user's job, and extra capabilities add no points. Depth on one capability beats breadth. Judges score the demonstrated product, not the pitch, architecture diagram or number of APIs. The rubric runs from L1 (Floor) to L5 (Exceptional).
- **Corroboration (opened)**: the README of an Epoch National Finals team, https://github.com/xreedev/NyayBandh, line 6, reads "**Declared Sarvam parameter: VOICE EXPERIENCE.** One parameter. Extra APIs score zero."
- Caveat: Epoch was a separate GrowthX x Sarvam in-person buildathon (July 2026). Whether the Discord "Bulbul Build Challenge" uses the same rubric is **UNVERIFIED**.

### 2b. What Sarvam has publicly showcased or praised

- **Build with Bulbul Challenge (Feb 2026, Bulbul V3)**: rules post at https://x.com/SarvamAI/status/2020110829476307056 (opened). It said: "Build something with Bulbul V3. Post your creation. Tag @SarvamAI. Use #TheMicIsYours", with the top 3 flown to Delhi.
  - Winner 1, https://x.com/SarvamAI/status/2022380045952831860 (opened): @noctus91's **AI Podcast Generator**. It turns DOCX, PPTX, PDFs, blog URLs or images into multi-voice podcasts in 11 Indian languages, using Document Intelligence, Sarvam-M and Bulbul v3.
  - Winners 2 and 3 (**UNVERIFIED**, search extract only; thread replies hidden when logged out): @jaygala223's Indilingo Sanskrit AI tutor, praised as "already used by real learners", and @krishships's Patshaala lesson videos.
- **Build with Sarvam #1** (2026-04-03), from https://www.newsbytesapp.com/news/science/sarvam-launches-build-with-sarvam-series-to-break-language-barriers/tldr (opened): OpenCut AI (video editor that transcribes and translates in 22 languages), a call-centre intelligence platform for mixed-language calls, **an AI cricket commentary engine**, and a Kannada/Hindi learning app.
- **Build with Sarvam #3** (2026-06-23): https://x.com/SarvamAI/status/2069390984073683410 (opened, but the projects in the thread are hidden). From a search extract (**UNVERIFIED**): a Gujarati/Hindi voice-note shopping agent and an application-guidance tool.
- **Build with Sarvam #4** (2026-08-19), from a secondary source, https://explainx.ai/blog/build-with-sarvam-edition-4-fake-family-sabzi-aunty-drishti-2026 (opened). Sarvam's original post was **not found (UNVERIFIED primary)**.
  - **Fake Family** by Pankaj (@the2ndfloorguy): a Raspberry Pi burglar deterrent that plays ambient household audio made with Bulbul.
  - **Hyderabadi Sabzi Aunty** by Vishal Singh (@vishalsingh2972): a vegetable-vendor haggling voice agent that mixes Hindi, Telugu and English and handles interruptions.
  - **Drishti** by Nithin Varghese (@call_me_Nithin): a regional-language CCTV investigation copilot built at the Epoch Buildathon.
- **Pattern**: India-specific everyday situations, code-mixing, several voices or characters, a concrete user job, and "real users" or production use. Nothing showcased so far covers disability or AAC.
- **Sarvam's own accessibility page**, https://www.sarvam.ai/text-to-speech/accessibility (opened): titled "Voice for the half of India that prefers listening". It targets the visually impaired (62M), people with limited literacy and the elderly, and cites RPWD Act 2016 sections 40–46, GIGW 3.0 and WCAG 2.1 AA. Its examples use `bulbul:v3`. **It never mentions people who cannot speak, speech disability or AAC.**

### 2c. How Sarvam positions Bulbul V4 Flash

- **Announcement**: https://x.com/SarvamAI/status/2109980905318326594 (opened), 5:43 PM, Oct 13, 2026: "natural, expressive speech across Indian languages... frontier-quality speech into a smaller, more efficient model... significantly faster." It had 145.7K views when opened.
- **Blog**: https://www.sarvam.ai/blogs/bulbul-v4-flash (opened). Claims: under 250 ms time to first audio in production; up to 40% faster than V3 under comparable load; 83 voices and 224 voice-style combinations; 11 languages; ₹20 per 10K characters versus ₹30 for V3. Use cases: real-time voice agents, customer care, sales, collections, banking, ecommerce, education and narration. **Bulbul V4 Pro** (laughter, sighs, fear) is previewed as next. The blog does not mention accessibility.
- **Product page**: https://www.sarvam.ai/apis/text-to-speech (opened): "Under 250 ms to first audio... over HTTP streaming, WebSocket or a single response". Controls: "**Pace, pitch and loudness**, sample rates from 8 kHz to 48 kHz". Code-mixed text works "when each language uses its own script".
- **Docs best practices**: https://docs.sarvam.ai/api/api-guides-tutorials/text-to-speech/best-practices.md (opened).
  - "Flash is the **interactive tier** of the v4 family".
  - Prosody: independent `pace` 0.5–2.0, `pitch` -0.5–0.5 and `loudness` 0.1–2.5.
  - **`temperature` is "Silently ignored"** on v4-flash.
  - Recommends "`pace` 0.8 – 0.9" for "EdTech, wellness, **accessibility**, instructional content".
  - No SSML.
  - "no `ml` / `od` personas yet": Malayalam and Odia have no v4 voices.
- **CONFLICT in Sarvam's own docs**: the API reference, https://docs.sarvam.ai/api-reference-docs/text-to-speech/convert (opened), still says "Pitch and loudness parameters are NOT supported" for v3 and v4-flash.
  - Sarvam's official skills repo, https://github.com/sarvamai/skills (text-to-speech/SKILL.md, commit of 2026-10-06), says pitch and loudness are accepted on v4-flash, with out-of-range values returning 400. It also says v3 accepts them "as of 2026-10-06 (live-verified)" and that the "v2-only ranges in the model-page limits table do not apply".
  - Two entries already use pitch and loudness on v4-flash (Mujhe Pata Hai, Tarang FM).
  - **Treat pitch and loudness as supported, but verify live.**
- **Model page**: https://docs.sarvam.ai/api/getting-started/models/bulbul (opened). Romanised Indic input "significantly reduces output quality", so use native script. Pronunciation dictionaries (`dict_id`) work on v4-flash (per the skills repo).
- **Timeline** (changelog https://docs.sarvam.ai/api-reference-docs/changelog, opened):
  - Oct 6: Bulbul V4 for Voice Agents.
  - Oct 12: Instant Voice Cloning in the SDKs (beta).
  - Oct 14: Bulbul V3 end of life for Voice Agents (Nov 10).
  - The V4 Flash integration PRs predate the X post: https://github.com/livekit/agents/pull/7335 (merged 2026-10-09) and https://github.com/sarvamai/sarvam-mcp/pull/92 (merged 2026-10-06).
- **Voice cloning is a separate API**: `/voices/clone`, beta, billed as `text_to_speech_voice_cloning`, per https://docs.sarvam.ai/api/api-guides-tutorials/voice-cloning/overview.md and its FAQ (opened). **A cloned "own voice" is not Bulbul V4 Flash.** Commercial use of cloned audio has consent requirements.
- **Launch promotion**: ₹10 per 10K characters through Nov 12, per https://runtimewire.com/article/sarvam-bulbul-v4-flash-pricing-launch (opened). That article cites a Sarvam X post that was not opened (**partly UNVERIFIED**). AIM coverage: https://analyticsindiamag.com/ai-news/sarvam-ai-launches-bulbul-v4-flash-for-real-time-speech-in-11-indian-languages (opened, dated 14 Oct 2026).

### 2d. Who is likely judging

- **Specific judges: UNVERIFIED.** No public judge list was found.
- Sarvam's Discord offers "biweekly challenges", per https://docs.sarvam.ai/api/getting-started/welcome (opened).
- The Sarvam "Developer Relations Engineer – Community Manager" listing (aggregator mirror, opened: https://freehire.me/jobs/developer-relations-engineer-community-manager-sarvam-bjql7wvx) includes "Manage the Discord community", "plan and execute hackathons" and "**Recognise and grow our best builders**". The official listing at https://www.sarvam.ai/careers/jobs/50cc51f1-0229-460a-b60b-bf747059f034 would not load. The likely judges are Sarvam DevRel and community staff (**UNVERIFIED**).
- Public Sarvam engineers who shipped V4 Flash integrations (not confirmed as judges):
  - `dhruvladia-sarvam` (LiveKit PR #7335)
  - `adityachaudhary-sarvam` (sarvam-mcp PR #92)
  - `vinayak-sarvam` (top contributor to https://github.com/sarvamai/skills)
  - A LinkedIn search result shows Shachi Sejpal (Sarvam) posting the V4 Flash launch (**UNVERIFIED**, not opened).
- **Submission mechanics** (from an entrant's plan, not an official source; **UNVERIFIED as official**). Per https://github.com/harshbhx/tarang-fm/blob/main/docs/BUILD-PLAN.md:
  - Public repo with a live link and demo video.
  - An X or LinkedIn post **quoting Sarvam's announcement post** (https://x.com/SarvamAI/status/2109980905318326594).
  - A Discord post in the projects channel tagged `Sarvam Bulbul Build Challenge` with Name, Project, Social Post and GitHub.
  - Dost's X post is indeed a quote of the announcement.

## 3. Implications for Kanth

**The open gap.** No entry so far serves people who cannot speak, and Sarvam's own accessibility page leaves them out (it covers blind, low-literacy and elderly users). Kanth is the only entry where Bulbul is *the user's own voice* rather than an AI talking to the user. Lead with that one sentence.

**What to emphasise**

1. **Declare one central capability: Bulbul V4 Flash as the user's voice.** Treat STT and the LLM as plumbing, consistent with the Epoch "one parameter, extra APIs score zero" signal. Make the demo prove that V4 Flash, and nothing else, gives this person a natural Hinglish voice.
2. **Prespeak is the latency story no one else has.** At least four entries already show a time-to-first-audio counter (BhashaBuzzer, Samjhao, Galli, Mujhe Pata Hai), so a counter alone is table stakes. Kanth should show **pick-to-sound** time, which is near zero because all four replies are synthesised before the pick. Show it next to V4 Flash's under-250 ms TTFA as the fallback, and give an honest cost per turn (4 syntheses × characters × ₹20 per 10K, or ₹10 during the promotion).
3. **Tone dial = `pace` + `pitch` + `loudness` + persona style, all documented V4 Flash controls.** Do **not** use `temperature` (ignored on v4). Keep within -0.5–0.5 for pitch and 0.1–2.5 for loudness, and verify live, since the API reference contradicts the product page and skills repo. Mujhe Pata Hai already uses prosody for comedy; Kanth's version must carry meaning (urgent, polite, joking, upset).
4. **Use V4-specific depth.**
   - Persona styles for the user's identity (`companion`, `conversational`, `customer_warm`).
   - Native-script output from the LLM: Devanagari for Hindi words, Latin for English. This is official guidance and has a large quality impact.
   - A `dict_id` pronunciation dictionary for the names of family members and caregivers.
5. **Make the judge's first two minutes work on a phone**, with no install and a demo mode that does not need mic permission. Tarang FM designs explicitly for this, so match it.
6. Follow the submission mechanics the entrants describe: a quote-post of the announcement with video and live link, plus a Discord projects post with Name, Project, Social Post and GitHub.

**What to avoid**

- Leading with the cloned "own voice". It is a separate beta API, not Bulbul V4 Flash, and carries consent requirements. Keep it optional and labelled, with V4 Flash personas as the default.
- Claiming Malayalam or Odia V4 voices (there are none), or sending romanised Hindi to TTS.
- Pitching breadth (STT + LLM + cloning + translation). Under the Epoch-style rubric that scores zero.
- Positioning Kanth as a generic voice companion or agent. That niche is crowded (Dost, Awaaz, Yaad, callmi, Stereo Sabha).
- Clinical or efficacy claims. Dost's "Not clinically validated" line is the norm to follow.
- Inventing users. Sarvam praised "real learners" for Winner 2 (UNVERIFIED), but a fabricated testimonial would backfire.

**Biggest risks to watch before 20:00 IST**

- Samjhao and Tarang FM on polish and V4 craft.
- Bawaal Bureau, because the judges already know its builder.
- Any late X- or Discord-only accessibility entry. This scan could not see the X quotes list or Discord, so re-check them, logged in, before submitting.
