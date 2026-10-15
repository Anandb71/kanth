"""Saaras STT REST (POST /speech-to-text) probes, using Bulbul-generated audio as input.

Also used as an intelligibility check of: Hindi persona speaking Tamil, and the cloned voice in ta/hi/en.
"""
import base64
import json
import os

from common import HERE, body_text, out, post_json, post_multipart

R = []


def read(rel):
    with open(os.path.join(HERE, *rel.split("/")), "rb") as f:
        return f.read()


def stt(label, rel, fields):
    data = read(rel)
    r = post_multipart("/speech-to-text", fields, {"file": (os.path.basename(rel), data, "audio/wav")})
    rec = {"label": label, "file": rel, "fields": fields, "status": r.status, "ms": round(r.t_done * 1000)}
    if r.status == 200:
        j = json.loads(r.body)
        rec["response"] = j
    else:
        rec["error"] = body_text(r, 600)
    out(json.dumps(rec, ensure_ascii=False))
    R.append(rec)


# make a Hinglish code-mixed clip with Bulbul (16 kHz) for the codemix modes
mix_path = os.path.join(HERE, "out", "tts", "hinglish_mix.wav")
if not os.path.exists(mix_path):
    r = post_json("/text-to-speech", {"text": "मैं office जा रहा हूँ, meeting दस बजे है, तो lunch बाद में करेंगे।", "language_code": "hi-IN",
                                      "model": "bulbul:v4-flash", "speaker": "simran_enhi_customer", "speech_sample_rate": 16000})
    with open(mix_path, "wb") as f:
        f.write(base64.b64decode("".join(json.loads(r.body)["audios"])))

# models / language options on one Tamil clip (Tamil male persona)
for model in ["saaras:v4", "saaras:v3", "saarika:v2.5", "saaras:v3-realtime"]:
    stt(f"model_{model}", "out/tts/vijay_ta_narration__ta.wav", {"model": model, "language_code": "ta-IN"})
stt("default_model_unknown_lang", "out/tts/vijay_ta_narration__ta.wav", {"language_code": "unknown"})
stt("default_model_no_lang", "out/tts/vijay_ta_narration__ta.wav", {})
stt("lang_auto_value", "out/tts/vijay_ta_narration__ta.wav", {"language_code": "auto"})
# intelligibility of cross-language persona
stt("hi_persona_tamil", "out/tts/aparna_hi_customer__ta.wav", {"model": "saaras:v4", "language_code": "ta-IN"})
stt("en_persona_tamil", "out/tts/simran_en_customer__ta.wav", {"model": "saaras:v4", "language_code": "ta-IN"})
# cloned voice outputs (auto-detect language to also confirm which language was spoken)
for k in ["ta", "hi", "en"]:
    stt(f"clone_{k}", f"clone_{k}.wav", {"model": "saaras:v4", "language_code": "unknown"})
# modes on code-mixed Hinglish
for mode in ["transcribe", "codemix", "translit", "translate"]:
    stt(f"mix_v4_{mode}", "out/tts/hinglish_mix.wav", {"model": "saaras:v4", "language_code": "hi-IN", "mode": mode})
stt("mix_v3_codemix", "out/tts/hinglish_mix.wav", {"model": "saaras:v3", "language_code": "hi-IN", "mode": "codemix"})
stt("timestamps", "out/tts/hinglish_mix.wav", {"model": "saaras:v4", "language_code": "hi-IN", "with_timestamps": "true"})
stt("keyterms_v4", "out/tts/hinglish_mix.wav", {"model": "saaras:v4", "language_code": "hi-IN", "keyterms": json.dumps(["Kanth", "lunch"])})

with open(os.path.join(HERE, "out", "p06a_results.json"), "w", encoding="utf-8") as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
