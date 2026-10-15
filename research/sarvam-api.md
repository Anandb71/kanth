# Sarvam API reference for Kanth (live-verified)

Built from the raw probe results in `research/probes/out/*.json` (run 2026-10-14 evening IST, request ids dated `20261014_*`), plus a few small follow-up probes run on 2026-10-15 IST (p03c, p05e, p07c, p08b, p10, p99, marked **[10-15]**). Probe scripts are in `research/probes/`. All latencies were measured from a home connection in India. Treat them as indicative, not as SLAs.

Every call authenticates with the header `api-subscription-key: <SARVAM_API_KEY>`. WebSockets also accept the subprotocol `api-subscription-key.<KEY>` (verified on TTS, clone and STT sockets). Never use the subprotocol from a browser, because it puts the key in the page.

---

## 1. Bulbul TTS

### 1.1 WebSocket (primary transport)

```
wss://api.sarvam.ai/text-to-speech/ws?model=bulbul:v4-flash&send_completion_event=true
header: api-subscription-key: <KEY>
```

If you leave out `?model=`, the socket runs **bulbul:v3**. A bad speaker error lists the v3 roster (p10 **[10-15]**).

**Client to server messages (JSON text frames)**

```jsonc
// 1. config: must come first. Sending text before config returns an error and closes the socket.
{"type":"config","data":{
  "speaker":"aparna_hi_customer",      // v4 persona id (see section 2)
  "language_code":"hi-IN",             // field name is language_code
  "output_audio_codec":"linear16",     // mp3|wav|linear16|opus|flac|aac|mulaw|alaw
  "speech_sample_rate":24000,          // 8000|16000|22050|24000 only on WS
  "pace":1.0,                          // 0.5..2.0
  "pitch":0.0,                         // -0.5..0.5 (works on v4-flash, see 1.4)
  "loudness":1.0,                      // 0.1..2.5 (works on v4-flash)
  "enable_preprocessing":true
}}
// 2. text: may be sent several times
{"type":"text","data":{"text":"नमस्ते, आप कैसे हैं?"}}
// 3. flush: forces synthesis of buffered text and ends the utterance with a "final" event
{"type":"flush"}
// keepalive
{"type":"ping"}
```

**Server to client messages**

```jsonc
{"type":"audio","data":{"request_id":"20261014_…","content_type":"audio/pcm","audio":"<base64>"}}
{"type":"event","data":{"event_type":"final"}}            // only with send_completion_event=true, after flush
{"type":"error","data":{"request_id":"…","message":"400: …","code":422}}
```

`content_type` per codec: mp3 `audio/mpeg`, wav `audio/wav`, linear16 `audio/pcm` (raw little-endian PCM16 mono, no header), opus `audio/opus` (Ogg, `OggS`), flac `audio/flac`, aac `audio/aac` (ADTS), mulaw `audio/mulaw`, alaw `audio/alaw`. The codec value `pcm` is rejected: `{"message":"Input parameters has to be a valid dictionary","code":422}`.

**Behaviour verified (p01)**

- **Sample rates.** 8000, 16000, 22050 and 24000 all work. 44100 and 48000 return error `"Speech sample rate can only be 8000, 16000, 22050, 24000 Hz"` with code 400.
- **WAV header once per socket.** With `wav`, the first audio frame after connecting is a bare 44-byte RIFF header with data size `0xFFFFFFFF`. Later utterances on the same socket, even after a new config, start directly with PCM and have no header. `linear16` never has a header, so prefer it and avoid the issue.
- **Many utterances per socket.** Sequential config, text, flush cycles work indefinitely. Two back-to-back `text`+`flush` pairs sent without waiting are synthesized in order. Each ends with its own `final` (435 ms and 1044 ms), and all frames carry the **same `request_id`** (it is per connection, not per utterance). You cannot tell interleaved utterances apart, so send one at a time per socket.
- **Config swap mid-socket** works: speaker, language and pace all changed between utterances (hi to `vijay_ta_narration` ta-IN, pace 1.3).
- **No flush.** A short text (`"नमस्ते।"`) without flush produces no audio. A late `flush` then releases it. A 109-character text streams audio without a flush, but no `final` arrives until you flush. Always flush.
- **Idle timeout.** With no client messages, the server sends `{"type":"error","data":{"message":"Websocket was left open without any messages for too long.","code":408}}` at about 59.8 s, then closes with code 1000.
- **Ping.** `{"type":"ping"}` gets **no reply**, but sending one every 20 s kept a socket alive for 100 s, and the next utterance played normally (TTFA 336 ms).
- **Errors close the socket.** After any `error` frame the server closes with code 1000 and an empty reason. Reconnect after errors. Observed errors:
  - unknown speaker: `"400: Speaker 'nobody_hi_x' is not recognized. Available speakers for bulbul:v4-flash are: …"` (code 422)
  - v3 name on v4: `"400: Speaker 'ishita' is not compatible with model bulbul:v4-flash. …"` (422)
  - `"config required before text"` (422)
  - `"400: For the Bulbul V3 and V4 models, pitch should be between -0.5 and 0.5"` (422). The same pattern applies to loudness 0.1..2.5 and pace 0.5..2.0.
  - A config **without `language_code`** still synthesized audio (no error).
  - `temperature` is accepted and ignored.

**Latency (bulbul:v4-flash, short Hindi line, 16 kHz)**

| Case | Result |
|---|---|
| Connect (TLS + upgrade) | 153–346 ms |
| Cold socket: config + text + flush to first real audio | 279–290 ms (a 44-byte WAV header arrives at about 100 ms) |
| Warm socket TTFA, 5 runs each | median 184 ms wav, 182 ms mp3, 182 ms linear16 (range 178–199) |
| Warm socket, utterance complete (`final`) | median 393–408 ms |
| 4 utterances queued on one socket (p09) | all done at median 1667 ms |
| 4 utterances on 4 warm sockets in parallel (p09) | all done at median **484 ms** (TTFA 236–324 ms) |
| 4 parallel REST calls (p09) | all done at median 794 ms |

### 1.2 HTTP streaming

```
POST https://api.sarvam.ai/text-to-speech/stream
Content-Type: application/json
{"text":"…","language_code":"hi-IN","model":"bulbul:v4-flash","speaker":"aparna_hi_customer",
 "output_audio_codec":"wav","speech_sample_rate":16000,"pace":1.0,"pitch":0.0,"loudness":1.0,"enable_preprocessing":true}
```

The response is chunked binary audio. The `Content-Type` header matches the codec, and the request id is in the `x-request-id` header. With WAV you get one RIFF header with data size `0xFFFFFFFF`, then PCM. The default codec, when omitted, is mp3 (`audio/mpeg`). All 8 codecs work, including opus and linear16. Sample rates are the same as WS: 48000 returns HTTP 400 `{"error":{"message":"Speech sample rate can only be 8000, 16000, 22050, 24000 Hz","code":"invalid_request_error",…}}`.

Latency (p04): cold first audio 275–310 ms. On a warm keep-alive connection, wav first audio median 199 ms (headers at 54 ms) and mp3 first audio median 201 ms. A 7.3 s utterance was fully received in 1393 ms.

### 1.3 REST

```
POST https://api.sarvam.ai/text-to-speech
{"text":"…","language_code":"hi-IN","model":"bulbul:v4-flash","speaker":"…","speech_sample_rate":24000,"output_audio_codec":"wav"}
→ 200 {"request_id":"…","audios":["<base64 WAV>"]}
```

- REST also accepts **`target_language_code`** in place of `language_code` (200, p03).
- If `model` is omitted, REST uses **bulbul:v3** (p10).
- If `speaker` is omitted on v4-flash, you get the default persona (documented as `shubh_enhi_ads`, male, F0 about 101 Hz).
- The default sample rate is 22050 Hz. REST accepts 48000 (`wav_48k` returned 200, the only high rate probed). The docs also list 32000 and 44100.
- **opus works on REST** when the sample rate is opus-compatible: 16000 and 24000 both return 200 with an `OggS` payload **[10-15]**. With the default 22050 it fails: `"OPUS codec requires one of these sample rates: 8000, 12000, 16000, 24000, 48000 Hz. Current sample rate: 22050 Hz…"`.
- Range errors return HTTP 400 `invalid_request_error`, for example `"For the Bulbul V3 and V4 models, pitch should be between -0.5 and 0.5"`. Loudness 2.5 is OK, 3.0 is 400. Pace 2.0 is OK, 2.5 is 400.
- Latency for a 49-character Hindi line on a cold connection: 0.9–1.1 s per call.
- Input limit: 2,500 characters per request (docs).

### 1.4 Prosody actually changes the audio (acoustic check, p03b on saved files)

| Transport | Setting | Measured |
|---|---|---|
| REST | pitch -0.5 / 0 / +0.5 | median F0 178 / 198 / 246 Hz |
| REST | loudness 0.5 / 1.0 / 2.0 | RMS -20.8 / -15.8 / -9.3 dBFS |
| REST | pace 0.5 / 2.0 | 6.69 s / 1.89 s (vs about 3.4 s at 1.0) |
| WS, one socket, config swapped between utterances (p09) | base / pitch -0.5 / pitch +0.5 | F0 228 / 174 / 262 Hz |
| WS (same) | loudness 0.5 / 2.0 | RMS -21.2 / -11.4 dBFS (base -16.8) |
| WS (same) | pace 0.7 / 1.5 | 5.39 s / 2.51 s (base 3.85 s) |

Changing the tone mid-socket costs nothing extra: TTFA stayed between 264 and 415 ms.

---

## 2. Speaker roster (bulbul:v4-flash)

Source: the live 400 error that lists every valid speaker (`research/speakers-v4-flash.json`, `research/roster-live.json`). The roster has **224 speaker ids from 83 voice names**. The docs say 222.

| Tag | hi | en | enhi | mr | kn | pa | ta | te | bn | gu | as |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ids | 116 | 62 | 13 | 9 | 4 | 4 | 4 | 4 | 3 | 3 | 2 |

- **Tamil personas:** `gokul_ta_narration`, `vijay_ta_narration`, `aravind_ta_ads`, `aravind_ta_suspense`. The `vetri_ta_ads` and `vetri_ta_suspense` ids in the docs are **not live**. All four are male, both by name and by measured F0 (gokul 140 Hz, vijay 130, aravind_ads 132, aravind_suspense 126). **There is no female Tamil persona.**
- **No ml or od personas.** Malayalam and Odia have no v4 voices.
- **`as` personas** (`kangkana_as_conversational`, `mouchumi_as_conversational`) exist, but `language_code=as-IN` returns 400 `"Please request beta access to as-IN by contacting our support team."` **[10-15]**. With bn-IN they speak, and both are female (F0 237 and 205 Hz).
- Other live ids missing from the docs: `arnab_bn_conversation`. Documented but not live: `bappa_bn_conversation`.
- **Personas speak other languages.** `aparna_hi_customer` (female, F0 211 Hz) and `simran_en_customer` (female, F0 216 Hz) produce intelligible Tamil with `language_code=ta-IN`. Saaras v4 transcribed both outputs word for word (p06a). This is how to get a female Tamil voice.
- Other F0 checks (p02c): `mani_hi_conversational` 96 Hz (M), `harpreet_pa_narration` 127 Hz (M), `mrunal_mr_narration` 208 Hz (F), `suman_hi_companion` 229 Hz (F).
- v3 has 37 short names (aditya, ritu, …, gokul, vijay, kavitha, …). Using a v3 name on v4 is an error.
- Gender is not an API field. `gender_inferred` in the JSON is a guess from the first name.

---

## 3. Instant Voice Cloning (beta)

All clone endpoints **ignore `model`**: `bulbul:v4-flash`, `bulbul:v3` and `"not-a-model"` all return 200 (p05c, p05d). Cloned speech does not run on the v4 Flash tier, and its latency is about 7 times higher.

### 3.1 Create and inspect a voice

```
POST https://api.sarvam.ai/voices/create          (multipart/form-data)
  name=kanth-probe-ta-male  language=ta-IN  file=@ref_clip.wav     (13.5 s, single speaker)
→ 201 {"status":"success","data":{"voice_id":"svc-<uuid>","status":"saved","reference_text":"<ASR transcript of the clip>"}}
```

This took 1990 ms. `GET /voices` returns `{"status":"success","total":N,…}`, and each item has the fields `id, name, language, gender, accent, descriptor, status, source, created_at, created_by*, has_preview, sample_duration_seconds, is_favorited`.

`GET /voices/{voice_id}` took 314 ms **[10-15]** and returns:
`{"status":"success","data":{"id","name","language","gender":null,"accent":null,"descriptor":null,"status":"active","source":"cloned","created_at","has_preview":true,"sample_duration_seconds":13.52,"reference_text","preview_audio_url","reference_audio_url","recorded_audio_url","previews":[],"noise_reduction_applied":true,"tags":[],"metadata":{}}}`. The three URLs are time-limited signed Azure blob URLs, so do not log them.

The probe voice `svc-39a58f95-5c20-4d96-ad7d-105f94c45f8b` ("kanth-probe-ta-male") still exists. The free plan keeps 5 cloned voices (docs).

### 3.2 One-shot generate

```
POST https://api.sarvam.ai/voices/clone           (multipart/form-data)
  voice_id=svc-…  (OR ref_audio=@clip.wav [+ ref_text]; exactly one of the two)
  text=…  (≤1000 chars)  language_code=ta-IN  output_audio_codec=wav  speech_sample_rate=24000
  [pace=0.5..2.0] [enable_qc=true] [pitch] [loudness]
→ 200 {"audio_b64":"<base64 WAV>","audio":"<same, deprecated>","audio_duration":2.865,"request_id":"…"}
```

- Latency: median **1515 ms** over 3 runs (1491–2080). Inline `ref_audio` took 2991 ms **[10-15]**. 4 parallel calls finished in 2.7–3.1 s.
- **Cross-lingual works.** A Tamil reference clip spoke ta, hi and en, and Saaras transcribed all three exactly (p06a).
- Accepted `language_code` values: as, bn, en, gu, hi, kn, ml, mr, od, pa, ta, te, ur. Anything else returns 400 with a validation list.
- Sending both `voice_id` and `ref_audio` returns 400 `"Send exactly one of ref_audio or voice_id, not both. …"` **[10-15]**.
- `pace` works: 0.7 gives 5.31 s and 1.5 gives 2.27 s, against 3.51 s at the default. 2.5 returns 400 `"pace: Input should be less than or equal to 2"`.
- **`pitch` and `loudness` are accepted (200) but have no measurable effect.** pitch ±0.4 gave F0 117.6 and 120.3 Hz against 115.9 Hz at baseline. loudness 0.4 and 2.0 both gave RMS -13.0 dBFS, the same as baseline, so the output appears loudness-normalised. For a cloned voice, apply loudness client-side.
- `enable_qc=true` returns 200 (2161 ms).

### 3.3 HTTP stream

`POST /voices/clone/stream` takes the same multipart fields. It returns chunked binary audio: `audio/wav` with a `0xFFFFFFFF` header, or `audio/mpeg`.

- First audio: median **1639 ms** for wav and **1524 ms** for mp3. The whole response is done about 0.1 s later, so streaming barely helps.
- Codecs: mp3, linear16, mulaw, alaw and wav only. `flac` returns 400.

### 3.4 WebSocket

```
wss://api.sarvam.ai/voices/clone/ws?send_completion_event=true
{"type":"config","data":{"target_language_code":"ta-IN","voice_id":"svc-…","output_audio_codec":"wav","speech_sample_rate":24000}}
{"type":"text","data":{"text":"…"}}
{"type":"flush"}
```

- The config **must use `target_language_code`**. With `language_code` you get `"400: config.data.target_language_code: Field required"` (code 422).
- No voice: `"400: Either ref_audio or voice_id is required."`
- `flac`: `"400: output_audio_codec='flac' is not supported on the WebSocket streaming endpoint. Use mp3, wav, linear16, mulaw, or alaw."`
- Messages and the `final` event have the same shape as TTS WS. Audio frames carry `audio, content_type, request_id`.
- Warm TTFA median **1404 ms** (1097–1549 ms over 5 runs). Final at about 4.0 s for a sentence of about 3 s.
- A config swap to hi-IN on the same socket works (TTFA 3056 ms).
- pitch, loudness, pace and model are all accepted.

### 3.5 Rate limits (docs, ratelimits page)

Instant Voice Cloning: Starter 10 req/min sustained with a burst of 50; Pro 50/100; Business 500/600. Over the limit you get 429. Our probes never hit a limit.

---

## 4. Saaras realtime STT

```
wss://api.sarvam.ai/speech-to-text-realtime/ws?language_code=ta-IN&model=saaras:v4&stream_type=fast&mode=transcribe&endpointing=vad&sample_rate=16000
```

**Query parameters**

| Param | Values |
|---|---|
| `language_code` (required) | `auto`, en-IN, hi-IN, bn-IN, kn-IN, ml-IN, mr-IN, **or-IN** (not od-IN), pa-IN, ta-IN, te-IN, gu-IN, as-IN, ur-IN, ne-IN, kok-IN, ks-IN, sd-IN, sa-IN, sat-IN, mni-IN, brx-IN, mai-IN, doi-IN. `unknown` closes with 4000 `"Unsupported language_code 'unknown'…"`. |
| `model` | `saaras:v3-realtime`, `saaras:v4`. **When omitted, `session.begin` reports `saaras:v4`.** |
| `stream_type` | `fast` (low-latency partials), `balanced` (default), `simulated` (no partials) |
| `mode` | transcribe (default), translate, verbatim, translit, codemix. Applies to finals only. |
| `endpointing` | `vad` (default), `manual` |
| `encoding` | linear16 (default), linear32, mulaw, alaw (mono) |
| `sample_rate` | 16000 (default) or 8000. 22050 closes with 4000 `"Invalid sample_rate '22050'. Only 8000 and 16000 are supported."` |
| VAD | `threshold` 0.3, `prefix_padding_ms` 300, `silence_duration_ms` **1000 live** (docs say 500), `min_speech_duration_ms` 250 |
| others | `prompt`, `keyterms` (saaras:v4), `return_timestamps` |

**Client events:**

- `{"event":"audio_input","audio":"<base64 PCM16 chunk>"}`. We sent 100 ms chunks at real-time pace.
- `{"event":"speech_start"}` and `{"event":"speech_end"}`, for manual endpointing.
- `{"event":"flush"}` forces finalisation (manual mode).
- `{"event":"config.update", …}` changes settings mid-call. The server answers `config.updated`.
- `{"event":"end"}` closes gracefully.
- `{"event":"ping"}` gets a `{"event":"pong"}` reply.

**Server events:**

```jsonc
{"event":"session.begin","request_id":"…","config":{"model":"saaras:v4","language_code":"ta-IN","encoding":"linear16","sample_rate":16000,"stream_type":"fast","mode":"transcribe","prompt":null,"keyterms":null,"turn_detection":"vad","threshold":0.3,"prefix_padding_ms":300,"silence_duration_ms":1000,"min_speech_duration_ms":250,"return_timestamps":false}}
{"event":"vad.speech_start","utterance_idx":0}
{"event":"transcript.partial","utterance_idx":0,"text":"வணக்கம்"}
{"event":"vad.speech_end","utterance_idx":0,"confidence":0.02}
{"event":"transcript.final","utterance_idx":0,"text":"வணக்கம், இன்று வானிலை மிகவும் நன்றாக இருக்கிறது."}
{"event":"transcript.final","utterance_idx":0,"text":"मैं ऑफिस…","language":"hi-IN","language_confidence":1.0}   // language fields only with language_code=auto
{"event":"error","code":"inactivity_timeout","message":"No audio received for 60s.","is_fatal":true,"status_code":408}
{"event":"session.end","request_id":"…","total_duration_s":6.59,"total_utterances":1,"audio_duration_s":6.5}
```

Bad query parameters close the socket during the handshake with code **4000** and the reason text. No `error` event is sent in that case.

**Idle behaviour (p06c).** With no messages, the server sends an `inactivity_timeout` error at 59.9 s, then `session.end`, and closes with **1008 "Inactivity timeout"**. Sending `{"event":"ping"}` every 10 s gets a `pong` each time, and the socket was still alive at 70 s with `audio_duration_s: 0.0`. The docs call `audio_duration_s` "the billed audio", so a pinged idle socket appears to cost nothing.

**Measured latency.** Input was Bulbul-generated Tamil (4.0 s) and Hinglish (3.84 s) at 16 kHz, streamed in real time. "Final after audio" is the time from the last speech chunk to `transcript.final`.

| Case | Connect | First partial (from connect) | Final after audio |
|---|---|---|---|
| ta, default model (v4), balanced | 374 ms | 1296 ms | 1110 ms |
| ta, fast (v4) | 147–275 ms | 546–715 ms | 1097–1210 ms |
| ta, fast, `saaras:v3-realtime` | 397 ms | 806 ms | 1126 ms |
| ta, fast, simulated | 165 ms | none | 1111 ms |
| ta, fast, `silence_duration_ms=600` | 172 ms | 572 ms | **728 ms** |
| ta, fast, `silence_duration_ms=300` | 329 ms | 710 ms | 403 ms, but the sentence was split into 3 finals |
| ta, fast, **manual** (`speech_end` sent at audio end) | 186 ms | 711 ms | **107 ms** |
| `auto`, Hinglish | 282 ms | 705 ms | 1126 ms (`language":"hi-IN"`) |
| hi-IN, `mode=codemix` | 164 ms | 564 ms | 1130 ms: `"मैं office जा रहा हूँ meeting 10 बजे है तो lunch बाद में करेंगे।"` |

With VAD endpointing, the final arrives about 80–100 ms after `vad.speech_end`, which in turn fires about `silence_duration_ms` after speech stops. Transcripts were exact in every case.

The legacy socket `wss://api.sarvam.ai/speech-to-text/ws?language-code=ta-IN&model=saaras:v4&vad_signals=true` takes `{"audio":{"data":"<b64>","sample_rate":"16000","encoding":"audio/wav"}}` frames. It answers with `{"type":"events","data":{"signal_type":"START_SPEECH"|"END_SPEECH"}}` and then `{"type":"data","data":"<JSON string with transcript, language_code, …>"}`. Its final arrived 611–630 ms after the audio ended.

**Batch and REST STT**

```
POST https://api.sarvam.ai/speech-to-text  (multipart)
  file=@clip.wav  model=saaras:v4|saaras:v3|saarika:v2.5
  language_code=ta-IN|…|unknown  [mode=transcribe|translate|translit|codemix|verbatim] [with_timestamps=true] [keyterms='["Kanth"]']
→ {"request_id","transcript","language_code","language_probability"?,"timestamps"?}
```

- About 270–320 ms for a 3–4 s clip. saaras:v3 with codemix took 534 ms.
- `language_code=auto` is **rejected** on REST. Use `unknown`.
- `saaras:v3-realtime` returns 400 on REST.
- Example `mode` outputs for the same Hinglish clip:
  - codemix: `मैं office जा रहा हूँ meeting दस बजे है …`
  - translit: `Main office ja raha hoon, …`
  - translate: `I am going to the office, …`

---

## 5. Chat completions

```
POST https://api.sarvam.ai/v1/chat/completions
{"model":"sarvam-105b-conversations","messages":[…],"stream":true,"response_format":{"type":"json_schema","json_schema":{"name":"replies","strict":true,"schema":{…}}}}
```

**Models**

- `GET /v1/models` lists `sarvam-105b` and `sarvam-105b-conversations`.
- `GET /v2/models` lists glm5.3, gemma4 and sarvam-105b, and returns 200 **without any key** **[10-15]**.
- `/v2/chat/completions` returns 400 `"This endpoint is currently in beta and not available…"` for every model.
- **`sarvam-m` and `sarvam-30b` are deprecated.** Both return 400 `"Model 'sarvam-m' has been deprecated. Please use one of the available models instead: sarvam-105b, sarvam-105b-conversations."`.

**Reasoning**

- `sarvam-105b` **thinks by default**. With `max_tokens` 400, 399 tokens went to reasoning and `content` came back empty (`finish_reason: "length"`, 2.5 s).
- **`"reasoning_effort": null` disables thinking**: `reasoning_tokens: 0`, 152 ms.
- `"low"` and `"medium"` still spent the whole budget on reasoning.
- `sarvam-105b-conversations` never reasons, whatever `reasoning_effort` says.
- In non-streaming responses, `message.reasoning_content` is **empty** even when `reasoning_tokens` is 825. The reasoning text is not returned, and `content` had a leading `\n` **[10-15]**.

**SSE stream shape (p07c [10-15])**

The response uses `content-type: text/event-stream; charset=utf-8` and is a sequence of `data: {json}` lines:

```
data: {"id":"20261015_…","object":"chat.completion.chunk","model":"sarvam-105b-conversations","created":…,"choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}],"usage":null}
data: {…,"choices":[{"index":0,"delta":{"content":"ஆம்"},"finish_reason":null}]}
data: {…,"choices":[{"index":0,"delta":{"content":null},"finish_reason":"stop"}]}
data: {…,"choices":[],"usage":{"prompt_tokens":22,"completion_tokens":2,"total_tokens":24},"system_fingerprint":"vllm-…"}
data: [DONE]
```

With reasoning on, the thinking tokens arrive as **`delta.reasoning`** (not `reasoning_content`) with `content: null`. The usage chunk always arrives last, with `choices: []`.

**Latency (p07b, 4-reply JSON task, about 155 prompt tokens, 3 runs each)**

| Config | TTFT median | Total median | Valid JSON |
|---|---|---|---|
| conversations, plain | 90 ms | 194 ms | 3/3 |
| conversations, `json_object` | 104 ms | 187 ms | 3/3 |
| conversations, `json_schema` strict | 111 ms | 211 ms | 3/3 |
| 105b, `reasoning_effort:null`, json_schema | 122 ms | 302 ms | 3/3 |
| 105b, `reasoning_effort:null`, json_object | 110 ms | 373 ms | 3/3 |
| 105b, `reasoning_effort:"low"`, json_schema, max_tokens 2048 | 6.2 s | 6.8 s | 2/3 (one run used all 2048 tokens on reasoning) |

Rate limits (docs, Starter): 60 req/min for the default models, **40 req/min for Sarvam-105B**.

---

## 6. Transliteration and language identification

### 6.1 Transliteration

```
POST https://api.sarvam.ai/transliterate
{"input":"amma charger edutthu vaa","source_language_code":"en-IN","target_language_code":"ta-IN"}
→ 200 {"request_id":"…","transliterated_text":"அம்மா சார்ஜர் எடுத்து வா","source_language_code":"en-IN"}
```

- **Codes.** Source: `auto` or bn, en, gu, hi, kn, ml, mr, **od**, pa, ta, te (all `-IN`). Target: the same list without `auto`.
- **Optional fields:**
  - `numerals_format`: `international` (default) or `native`. With native, "2 baje" became "२ बजे".
  - `spoken_form` (bool)
  - `spoken_form_numerals_language` (`english` or `native`)
- **English words in Roman input** come back spelled phonetically in the target script:
  - `charger` → `சார்ஜர்`, `phone` → `फ़ोन`
  - `"naan office poren, meeting irukku"` → `"நான் ஆஃபிஸ் போறேன், மீட்டிங் இருக்கு"`
  - There is no option to keep English words in Latin script.
- **Mixed-script input** works: native words pass through unchanged. `"அம்மா charger edutthu vaa"` → `"அம்மா சார்ஜர் எடுத்து வா"` **[10-15]**.
- **Punctuation and digits** are preserved. `"mujhe phone charger chahiye, 2 baje tak"` → `"मुझे फ़ोन चार्जर चाहिए, 2 बजे तक"`.
- **`source_language_code: "auto"` gives identical output but costs about 500 ms more**, because it runs language identification first: 1.07–1.28 s against 0.58–0.75 s for `en-IN` or the target code (p08b). Its detection is also odd: `"amma charger edutthu vaa"` was detected as ml-IN.
- **Final long vowels need the user to spell them.** `"kanna saapittiya"` → `"கண்ண சாப்பிட்டிய"` with every source setting (auto, en-IN, ta-IN), while `"naan saapten, nee saapttiya?"` → `"நான் சாப்டன், நீ சாப்ட்டியா?"`.
- **Avoid `spoken_form=true`.** `"मुझे कल 9:30am को appointment है"` came back as `"मुझे कल सुबह नौ बजे तीन बजे ए, एम को अपॉइंटमेंट है"`, which is wrong.
- **Indic to Roman is weak for Tamil.** `"கண்ணா, சாப்பிட்டியா?"` → `"Kannaa, chavichitaia?"`. Hindi `"मैं office जा रहा हूँ"` → `"Main office ja raha hun"` is fine.
- **Errors.** Empty input returns 400 `"Input text must not be empty."`. The docs give 422 for text over 1000 characters. An unknown `model` field is ignored (200).
- **Latency** with a warm connection: median 598–614 ms for short strings.
- **Kanth's implementation** (`server/translit.ts`) sends `source_language_code: "en-IN"` and `numerals_format: "international"`. It skips the call when the text has no Roman letters or the language has no target (en-IN, as-IN), maps `or-IN` to `od-IN`, keeps the user's leading and trailing whitespace, and has a 4 s timeout.

### 6.2 Language identification

```
POST https://api.sarvam.ai/text-lid   {"input":"kanna saapittiya"}
→ 200 {"request_id":"…","language_code":"ta-IN","script_code":"Latn"}
```

It correctly identified Romanised Tamil and Hindi (`Latn`), Tamil script (`Taml`), Devanagari, English and Telugu (`Telu`). Latency is a median of 568–615 ms.

---

## 7. Kanth-specific probes and checks

**Prespeak (p09).** The task is to have all 4 Tamil reply candidates fully synthesized:

| Strategy | All 4 done (median) |
|---|---|
| 4 warm WS sockets in parallel | **484 ms** |
| 4 parallel REST | 794 ms |
| 1 warm socket, 4 queued | 1667 ms |
| 4 parallel `/voices/clone` (cloned voice) | 2.7–3.1 s |

This is why `config.ttsPoolSize` is 4. A cloned voice has to be prespoken, because a single clone line takes about 1.5 s.

**Tone dial on one socket (p09).** Config swaps between utterances land immediately. See table 1.4.

**Misc checks (p10 [10-15])**

- TTS WS without `?model=` uses bulbul:v3.
- TTS REST with `as-IN` returns 400 "request beta access".
- TTS REST without `model` uses bulbul:v3.
- `GET /v2/models` without a key returns 200.

**Key-leak check (p99 [10-15]).** It scanned 169 files under `research/` (excluding `.venv`), and **0 files** contain the key. A grep over the whole `kanth/` tree, excluding `.env`, `node_modules` and `.venv`, also found 0.

---

## 8. Pricing

Read on **2026-10-15, about 07:35 IST**.

**Sources**

1. https://docs.sarvam.ai/api/getting-started/pricing.md (identical to the copy saved in `research/docs/gs_pricing.md`)
2. https://www.sarvam.ai/api-pricing (marketing pricing page, per-plan table)
3. https://www.sarvam.ai/blogs/bulbul-v4-flash

**Prices**

| Service | Docs pricing page | sarvam.ai/api-pricing (Pay as you go / Pro / Growth / Business) |
|---|---|---|
| **Bulbul v4 Flash** | **not listed** | **₹2.00 / ₹1.85 / ₹1.70 / ₹1.70 per 1K chars** (= ₹20 per 10K PAYG). The same rate applies to real-time, streaming and WebSocket. The blog also says "₹20 per 10,000 characters", a third less than v3. |
| Bulbul v3 | ₹30 per 10K chars | ₹3.00 / ₹2.85 / ₹2.70 / ₹2.70 per 1K chars |
| Instant Voice Cloning | **₹30 per 10K chars** | **₹2.00 per 1K chars** (= ₹20 per 10K) on every plan. The two pages disagree. |
| Speech to Text (incl. Saaras realtime) | ₹30 per hour, billed per second | Real-time ₹0.49 / ₹0.45 / ₹0.41 / ₹0.41 per minute (₹29.4 per hour PAYG). Batch is the same. Batch with diarization is ₹0.59 per minute. |
| Sarvam 105B (`sarvam-105b` and `sarvam-105b-conversations`) | ₹15 input, ₹5 cached input, ₹60 output per 1M tokens | ₹15 / ₹5 / ₹60 per 1M tokens |
| Transliteration | ₹20 per 10K chars | ₹2.00 / ₹2.00 / ₹1.80 / ₹1.70 per 1K chars |
| Language identification | ₹3.5 per 10K chars | ₹0.35 / ₹0.35 / ₹0.31 / ₹0.29 per 1K chars |

**Other notes**

- Reasoning tokens are billed as output tokens. The docs state this explicitly for GLM and DeepSeek, and the `usage.completion_tokens` field includes `reasoning_tokens` for sarvam-105b too.
- New accounts get ₹100 of free credits. Credits never expire.
- **Launch promotion.** Neither the docs pricing page nor sarvam.ai/api-pricing mentions one. A third-party article (https://runtimewire.com/article/sarvam-bulbul-v4-flash-pricing-launch, read 2026-10-15) reports **Bulbul V4 Flash at ₹10 per 10K characters through November 12**, citing a Sarvam X post from October 13. That X post has not been opened. Treat the promotion as **unverified**, and quote ₹20 per 10K as the list price.
- Kanth's cost per suggestion: 4 Tamil replies of about 25 characters each is about 100 characters, so about ₹0.02 at list price.

---

## 9. Docs vs reality

1. **pitch and loudness on v3 and v4-flash.**
   - Docs: the TTS API reference (`/text-to-speech`) says "Pitch and loudness parameters are NOT supported" for v3 and v4-flash, and lists v2 ranges (pitch ±0.75, loudness 0.3–3.0).
   - Live: both are accepted on REST, HTTP stream and WS. They audibly change the output (F0 178→246 Hz, RMS -20.8→-9.3 dBFS). The enforced ranges are **pitch -0.5..0.5 and loudness 0.1..2.5**.
2. **Tamil voice ids.**
   - Docs: `vetri_ta_ads` and `vetri_ta_suspense` are listed in the Voices page and the WS enum.
   - Live: those ids do not exist. The live ids are **`aravind_ta_ads` and `aravind_ta_suspense`**.
   - Same kind of mismatch: `bappa_bn_conversation` is documented but not live, while `arnab_bn_conversation`, `kangkana_as_conversational` and `mouchumi_as_conversational` are live but undocumented. The roster has 224 ids, not the documented 222.
3. **Clone WS language field.** The clone WS config requires **`target_language_code`**. `language_code` is rejected with "Field required". Every other clone and TTS endpoint uses `language_code`.
4. **Clone `model`.** It is ignored, even `"not-a-model"`, so cloning never runs on v4 Flash. Clone **pitch and loudness are accepted but have no audible effect** (F0 and RMS unchanged), and the clone reference documents only `pace`.
5. **REST opus.**
   - Docs: the model page says `opus` "currently returns an error on /text-to-speech".
   - Live: it works at 16000 and 24000 Hz (OggS). It only fails at the 22050 default.
6. **TTS sample rates.** The docs say "Streaming accepts 8000–24000 Hz". WS and HTTP stream gave errors for 44100 and 48000, and the error text names the accepted set: exactly 8000, 16000, 22050 and 24000. REST accepted 48000.
7. **Default model.** The docs say bulbul:v3 is the API default, and that is confirmed live. But the sample WS URL is easy to copy without `?model=`, and then you silently get v3 voices.
8. **Saaras realtime defaults.**
   - Model: the docs say the default is `saaras:v3-realtime`. Live, `session.begin` reports **`saaras:v4`** when `model` is omitted.
   - Silence: the docs say `silence_duration_ms` defaults to 500. Live, it is **1000**.
9. **Odia codes.** Saaras realtime uses `or-IN`. TTS, transliteration, REST STT and cloning use `od-IN`.
10. **`auto` versus `unknown`.** Realtime STT needs `auto` and rejects `unknown`. REST STT needs `unknown` and rejects `auto`.
11. **as-IN.** v4-flash has two `as` personas, but TTS `language_code=as-IN` needs beta access (400). Cloning accepts `as-IN` and `ur-IN`.
12. **WS `language_code` "required".** A TTS WS config without `language_code` still synthesized audio.
13. **WS ping.** The TTS docs say to send `ping` to keep the socket alive. It works, but the server never replies. The STT socket does reply with `pong`.
14. **WS errors.** The `code` field in a TTS WS error is 422 while the message text starts with "400:". After every error the socket closes with code 1000.
15. **Chat reasoning.**
   - `sarvam-105b` reasons by default, and `reasoning_effort: "low"` still used all of a 2048-token budget in 1 of 3 runs. Use `null` to disable it.
   - The streamed field is `delta.reasoning`, not `reasoning_content`.
   - Non-streaming `reasoning_content` is empty.
16. **Unauthenticated endpoint.** `GET /v2/models` works without a key.
17. **Pricing.**
   - Bulbul v4 Flash is missing from the docs pricing page but is ₹20 per 10K on sarvam.ai.
   - Voice cloning is ₹30 per 10K in the docs and ₹20 per 10K on sarvam.ai.
   - STT is ₹30 per hour in the docs and ₹0.49 per minute (₹29.4 per hour) on sarvam.ai.
   - The ₹10 per 10K launch promotion for v4 Flash appears only in third-party press.
18. **Clone status.** `POST /voices/create` returns `status: "saved"`, while `GET /voices/{id}` reports `status: "active"`. Both are usable immediately.
