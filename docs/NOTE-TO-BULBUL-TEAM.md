# A note for the Bulbul team

Thank you for V4 Flash. Kanth uses it as the voice of a person who cannot speak, which pushes on a few things most voice agents never touch. Here is what we found, measured on 2026-10-15 from a home connection in India. Raw data is in [bench/results](../bench/results) and [research/probes](../research/probes).

## What AAC needs from the roster

A person who cannot speak needs **one voice that is theirs in every language they use**. Today no persona spans Tamil and Hindi, so Kanth's Tamil-speaking user sounds like `shubh` in Hindi and English and like `vijay` in Tamil.

- **No female Tamil voice.** All four Tamil personas (`gokul_ta_narration`, `aravind_ta_ads`, `aravind_ta_suspense`, `vijay_ta_narration`) are male. Our demo's mother speaks Tamil through `kavitha_te_conversation`, a Telugu persona. Saaras transcribed her accurately, but a native Tamil woman's voice would be better.
- **No Malayalam or Odia personas** in V4 Flash, so Kanth routes those languages to v3.
- **A cross-language family of personas** (one voice across hi, ta, te, bn, en, enhi) would make Bulbul the natural choice for AAC. Voice cloning nearly does this, but see below.
- Persona styles map well onto tone. A few styles per voice that differ mainly in energy (a calm style, an urgent style, a quiet style) would let the tone dial change delivery, not just prosody.

## Latency

| Condition (n = 30, ta, hi, en) | p50 | p90 |
|---|---|---|
| V4 Flash, warm WebSocket | 304 ms | 317 ms |
| V4 Flash, HTTP stream | 322 ms | 356 ms |
| v3, warm WebSocket | 244 ms | 253 ms |
| v3, HTTP stream | 273 ms | 316 ms |
| Cloned voice, HTTP stream (n = 12) | 1,643 ms | 1,753 ms |

- From India, measured client-side including the network round trip, V4 Flash did not reach the "under 250 ms" in the launch post (https://www.sarvam.ai/blogs/bulbul-v4-flash) (fastest of 90 calls: 292 ms), and v3 was faster on every streaming transport.
- One warm V4 Flash WebSocket call took 3,002 ms to first audio.
- A first WebSocket connection once took 7.2 s to open. Later cold connections took about 120 ms.
- Four utterances on four warm sockets finish in about 484 ms; on one socket they queue to about 1,667 ms. A way to run several utterances in parallel on one socket would help anyone who prespeaks.

## Behaviour worth a look

- **Runaway audio.** One 42-character Hindi reply came back as 57.8 s of audio. Kanth now caps output at 3 s plus 0.3 s per character.
- **Run to run variation.** The same request sent twice differed by up to 48 Hz in median pitch and 0.98 s in duration. A `seed` parameter would make tone presets reproducible.
- **No cancel on the TTS WebSocket.** When a user changes tone or the partner keeps talking, Kanth abandons drafts already being voiced. A cancel message would save characters.
- **Cloning is not on the Flash tier.** `/voices/clone` ignores `model` (even `"not-a-model"` returns 200), takes about 1.6 s to first audio, and accepts pitch and loudness without changing the audio. For AAC, an own voice with V4 Flash speed and controls would be the single biggest win.

## Docs versus live behaviour

1. The TTS API reference says pitch and loudness are not supported on v3 and V4 Flash. Live, both work with ranges -0.5 to 0.5 and 0.1 to 2.5.
2. `vetri_ta_ads` and `vetri_ta_suspense` are documented; the live IDs are `aravind_ta_ads` and `aravind_ta_suspense`. The live roster has 224 IDs.
3. The clone WebSocket config needs `target_language_code`; every other endpoint uses `language_code`.
4. Saaras realtime defaults to `saaras:v4` and 1,000 ms silence, not the documented `saaras:v3-realtime` and 500 ms.
5. Odia is `or-IN` in realtime STT and `od-IN` everywhere else. Realtime STT wants `auto`; REST STT wants `unknown`.
6. V4 Flash is missing from the docs pricing page, and voice cloning has different prices on the docs page (₹30 per 10K) and sarvam.ai (₹20 per 10K).

The full list of 18 differences is in [research/sarvam-api.md](../research/sarvam-api.md), section 9.
