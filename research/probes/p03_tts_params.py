"""bulbul:v4-flash REST parameter probes (POST /text-to-speech).

- cross-language persona (Hindi female persona speaking Tamil)
- language_code vs target_language_code field name
- v3 short speaker name on v4-flash
- pitch / loudness / pace acceptance + ranges (outputs saved for acoustic analysis by p03b)
- sample-rate / codec variants

Outputs: probes/out/tts/*.wav and probes/out/p03_results.json
"""
import base64
import json
import os

from common import HERE, body_text, out, post_json, wav_info

OUT = os.path.join(HERE, "out", "tts")
os.makedirs(OUT, exist_ok=True)
HI = "नमस्ते, आज मौसम बहुत अच्छा है। चलो बाहर चलते हैं।"
TA = "வணக்கம், இன்று வானிலை மிகவும் நன்றாக இருக்கிறது."
results = []


def tts(label, payload, save_as=None):
    base = {"model": "bulbul:v4-flash"}
    base.update(payload)
    r = post_json("/text-to-speech", base)
    rec = {"label": label, "request": {k: v for k, v in base.items() if k != "text"}, "text_len": len(base.get("text", "")),
           "status": r.status, "ms": round(r.t_done * 1000)}
    if r.status == 200:
        j = json.loads(r.body)
        audios = j.get("audios") or []
        rec["response_keys"] = sorted(j.keys())
        rec["n_audios"] = len(audios)
        raw = base64.b64decode("".join(audios)) if audios else b""
        rec["bytes"] = len(raw)
        rec["magic"] = raw[:4].hex()
        rec["wav"] = wav_info(raw)
        rec["request_id"] = j.get("request_id")
        if save_as:
            with open(os.path.join(OUT, save_as), "wb") as f:
                f.write(raw)
            rec["saved"] = "out/tts/" + save_as
    else:
        rec["error"] = body_text(r, 600)
    out(json.dumps(rec, ensure_ascii=False))
    results.append(rec)
    return rec


# 1. cross-language persona: Hindi female persona speaking Tamil
tts("hi_persona_speaks_tamil", {"text": TA, "language_code": "ta-IN", "speaker": "aparna_hi_customer", "speech_sample_rate": 16000}, "aparna_hi_customer__ta.wav")
tts("ta_persona_baseline", {"text": TA, "language_code": "ta-IN", "speaker": "vijay_ta_narration", "speech_sample_rate": 16000}, "vijay_ta_narration__ta.wav")
tts("en_female_speaks_tamil", {"text": TA, "language_code": "ta-IN", "speaker": "simran_en_customer", "speech_sample_rate": 16000}, "simran_en_customer__ta.wav")
# 2. field name: target_language_code instead of language_code
tts("target_language_code_field", {"text": HI, "target_language_code": "hi-IN", "speaker": "aparna_hi_customer", "speech_sample_rate": 16000})
# 3. v3 short name on v4-flash
tts("v3_short_name_on_v4", {"text": HI, "language_code": "hi-IN", "speaker": "ishita", "speech_sample_rate": 16000})
# 4. omit speaker
tts("no_speaker", {"text": HI, "language_code": "hi-IN", "speech_sample_rate": 16000}, "default_speaker__hi.wav")
# 5. pitch
for p in [-0.5, 0.0, 0.5]:
    tts(f"pitch_{p}", {"text": HI, "language_code": "hi-IN", "speaker": "aparna_hi_customer", "pitch": p, "speech_sample_rate": 16000}, f"pitch_{p}.wav")
for p in [0.75, 1.0]:
    tts(f"pitch_range_{p}", {"text": HI, "language_code": "hi-IN", "speaker": "aparna_hi_customer", "pitch": p, "speech_sample_rate": 16000})
# 6. loudness
for l in [0.5, 1.0, 2.0]:
    tts(f"loudness_{l}", {"text": HI, "language_code": "hi-IN", "speaker": "aparna_hi_customer", "loudness": l, "speech_sample_rate": 16000}, f"loudness_{l}.wav")
for l in [2.5, 3.0, 0.1]:
    tts(f"loudness_range_{l}", {"text": HI, "language_code": "hi-IN", "speaker": "aparna_hi_customer", "loudness": l, "speech_sample_rate": 16000})
# 7. pace
for pc in [0.5, 2.0]:
    tts(f"pace_{pc}", {"text": HI, "language_code": "hi-IN", "speaker": "aparna_hi_customer", "pace": pc, "speech_sample_rate": 16000}, f"pace_{pc}.wav")
tts("pace_range_2.5", {"text": HI, "language_code": "hi-IN", "speaker": "aparna_hi_customer", "pace": 2.5, "speech_sample_rate": 16000})
# 8. temperature (docs: silently ignored on v4)
tts("temperature_0.1", {"text": HI, "language_code": "hi-IN", "speaker": "aparna_hi_customer", "temperature": 0.1, "speech_sample_rate": 16000})
# 9. codecs / rates on REST
tts("mp3_24k", {"text": HI, "language_code": "hi-IN", "speaker": "aparna_hi_customer", "output_audio_codec": "mp3", "speech_sample_rate": 24000})
tts("linear16_8k", {"text": HI, "language_code": "hi-IN", "speaker": "aparna_hi_customer", "output_audio_codec": "linear16", "speech_sample_rate": 8000})
tts("wav_48k", {"text": HI, "language_code": "hi-IN", "speaker": "aparna_hi_customer", "output_audio_codec": "wav", "speech_sample_rate": 48000})
tts("opus", {"text": HI, "language_code": "hi-IN", "speaker": "aparna_hi_customer", "output_audio_codec": "opus"})

with open(os.path.join(HERE, "out", "p03_results.json"), "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=1)
