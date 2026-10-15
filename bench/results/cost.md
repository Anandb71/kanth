# Kanth: cost per minute of conversation (INR)

Generated 2026-10-15 02:21 UTC by `bench/cost.ts` from `bench/results/conversations.json`. All inputs per turn are in `bench/results/cost.json`.

## Prices (fetched 2026-10-15)

| Item | Price | Source |
|---|---|---|
| Chat, `sarvam-105b-conversations` | ₹15 per 1M input tokens, ₹60 per 1M output tokens (₹5 cached input, not assumed) | https://docs.sarvam.ai/api/getting-started/pricing.md |
| Speech to text (Saaras) | ₹30 per hour, billed per second | https://docs.sarvam.ai/api/getting-started/pricing.md |
| Bulbul v4 Flash | ₹20 per 10K characters | https://www.sarvam.ai/blogs/bulbul-v4-flash. **Not listed on the pricing page on 2026-10-15**, which shows only Bulbul v3 at ₹30. |
| Transliteration | ₹20 per 10K characters | https://docs.sarvam.ai/api/getting-started/pricing.md |

research/field.md reports a ₹10 per 10K launch promotion for v4 Flash. It is only partly verified, so it is not used here.

## Per-turn inputs

| Input | Value | Status |
|---|---|---|
| Chat tokens per turn | 507 prompt + 81 completion (mean of 36) | MEASURED: `usage` in the streamed response |
| Characters synthesized per turn, with prespeak | 158.6 (4 drafts of mean 32.4 characters, plus the typed reply on a miss) | MEASURED |
| Characters synthesized per turn, without prespeak | 33.7 (the chosen draft, or the typed reply on a miss) | MEASURED |
| Prespeak character multiplier | 4.71x | MEASURED ratio |
| Partner speech per turn (the STT seconds) | words / 164 wpm | MODELED (Yuan et al. 2006 turn-wise rate, evidence.md A1) |
| User speech per turn | duration of the Bulbul audio for what was said | MEASURED |
| Turn gap | condition (c) or (b), direct selection, per turn, from conversations.md | MODELED total of measured and modeled parts |

Partner audio is not synthesized, because the partner is a human. Translation is not used.

**Turn-rate assumption.** One exchange is the partner's utterance, then the turn gap, then the user's utterance. Turns per minute = 60 / mean exchange length over the turns in the scenario.
- With 'as measured', misses include typing time, so turns are slow and cost per minute is low.
- The 'busiest case' uses only turns the judge counted as hits. This is the fastest conversation Kanth supports and the highest cost per minute.

## Cost

| Scenario | Prespeak | Turns/min | TTS chars/turn | ₹ per turn | ₹ per minute | ₹ per hour |
|---|---|---:|---:|---:|---:|---:|
| Test set as measured (misses typed), direct selection | yes | 0.60 | 159 | 0.3981 | 0.238 | 14.26 |
| Test set as measured (misses typed), direct selection | no | 0.60 | 34 | 0.1484 | 0.089 | 5.32 |
| Busiest case: every turn a hit, direct selection | yes | 5.83 | 137 | 0.3183 | 1.856 | 111.35 |
| Busiest case: every turn a hit, direct selection | no | 6.31 | 33 | 0.1107 | 0.699 | 41.96 |
| Busiest case, mic streamed to Saaras for the whole minute (STT billed for 60 s per minute) | yes | 5.83 | 137 | 0.2873 | 2.175 | 130.48 |

Breakdown, busiest case with prespeak, ₹ per minute:
- Bulbul 1.600
- chat 0.075
- Saaras 0.181
- transliteration 0.000

Sensitivity:
- At the Bulbul v3 price (₹30 per 10K characters), prespeak TTS per turn rises from ₹0.3171 to ₹0.4757.
- If cached-input pricing applied to the fixed system prompt, chat cost would fall further.

**Read this as:**
- Bulbul characters are the cost. On a hit, prespeak synthesizes 4.1x the characters actually spoken.
- In the busiest case (every turn a hit), that is ₹111.35 per hour with prespeak against ₹41.96 without. Per minute it is ₹1.86 against ₹0.70.
- On this test set as measured, most turns are typed, so the cost is ₹14.26 per hour with prespeak against ₹5.32 without.
- One way to cut it: prespeak only the first 1 or 2 drafts, or synthesize the rest only when the user's pointer or scan reaches them.
