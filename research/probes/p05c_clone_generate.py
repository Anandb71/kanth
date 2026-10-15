"""Instant Voice Cloning generation probes (REST one-shot + HTTP stream) with the saved voice.

Usage: python p05c_clone_generate.py <voice_id>
Saves clone_ta.wav / clone_hi.wav / clone_en.wav in probes/ and results in probes/out/p05c_results.json
"""
import base64
import json
import os
import sys

from common import HERE, _conn, body_text, median, out, post_multipart, wav_info

VOICE = sys.argv[1]
TEXTS = {
    "ta": ("ta-IN", "கண்ணா, நான் சாப்பிட்டேன். நீ சாப்பிட்டியா?"),
    "hi": ("hi-IN", "हाँ बेटा, मैंने खाना खा लिया। तुमने खाया?"),
    "en": ("en-IN", "Yes, I have eaten. Did you have your lunch?"),
}
R = {}
CLONE_OUT = os.path.join(HERE, "out", "clone")
os.makedirs(CLONE_OUT, exist_ok=True)


def clone(label, fields, save=None):
    f = {"voice_id": VOICE, "output_audio_codec": "wav", "speech_sample_rate": "24000"}
    f.update(fields)
    r = post_multipart("/voices/clone", f)
    rec = {"label": label, "fields": {k: v for k, v in f.items() if k not in ("voice_id",)}, "status": r.status, "ms": round(r.t_done * 1000)}
    if r.status == 200:
        j = json.loads(r.body)
        rec["response_keys"] = sorted(j.keys())
        rec["audio_duration"] = j.get("audio_duration")
        rec["audio_equals_audio_b64"] = j.get("audio") == j.get("audio_b64")
        raw = base64.b64decode(j.get("audio_b64") or j.get("audio"))
        rec["wav"] = wav_info(raw)
        rec["magic"] = raw[:4].hex()
        rec["request_id"] = j.get("request_id")
        if save:
            with open(os.path.join(save[0], save[1]), "wb") as fh:
                fh.write(raw)
            rec["saved"] = save[1]
    else:
        rec["error"] = body_text(r, 800)
    out(json.dumps(rec, ensure_ascii=False))
    R[label] = rec
    return rec


# 1. Per-language outputs (cross-lingual from a Tamil reference)
for k, (lc, txt) in TEXTS.items():
    clone(f"lang_{k}", {"text": txt, "language_code": lc}, (HERE, f"clone_{k}.wav"))

ta_lc, ta_txt = TEXTS["ta"]
# 2. model parameter: accepted / ignored / rejected?
for m in ["bulbul:v4-flash", "bulbul:v3", "not-a-model"]:
    clone(f"model_{m}", {"text": ta_txt, "language_code": ta_lc, "model": m})
# 3. prosody: pitch / loudness (undocumented for cloning) and pace (documented)
clone("baseline", {"text": ta_txt, "language_code": ta_lc}, (CLONE_OUT, "baseline.wav"))
clone("pitch_0.4", {"text": ta_txt, "language_code": ta_lc, "pitch": "0.4"}, (CLONE_OUT, "pitch_0.4.wav"))
clone("pitch_-0.4", {"text": ta_txt, "language_code": ta_lc, "pitch": "-0.4"}, (CLONE_OUT, "pitch_-0.4.wav"))
clone("loudness_2.0", {"text": ta_txt, "language_code": ta_lc, "loudness": "2.0"}, (CLONE_OUT, "loudness_2.0.wav"))
clone("loudness_0.4", {"text": ta_txt, "language_code": ta_lc, "loudness": "0.4"}, (CLONE_OUT, "loudness_0.4.wav"))
clone("pace_1.5", {"text": ta_txt, "language_code": ta_lc, "pace": "1.5"}, (CLONE_OUT, "pace_1.5.wav"))
clone("pace_0.7", {"text": ta_txt, "language_code": ta_lc, "pace": "0.7"}, (CLONE_OUT, "pace_0.7.wav"))
clone("pace_2.5", {"text": ta_txt, "language_code": ta_lc, "pace": "2.5"})
# 4. QC on (latency cost)
clone("enable_qc", {"text": ta_txt, "language_code": ta_lc, "enable_qc": "true"})
# 5. language_code not in list (as-IN is listed for cloning; xx-IN invalid)
clone("bad_lang", {"text": ta_txt, "language_code": "xx-IN"})

# 6. REST one-shot latency (3 runs, warm connection)
c = _conn()
oneshot = []
for i in range(4):
    r = post_multipart("/voices/clone", {"voice_id": VOICE, "text": ta_txt, "language_code": ta_lc, "output_audio_codec": "wav", "speech_sample_rate": "24000"}, conn=c)
    oneshot.append(round(r.t_done * 1000))
c.close()
R["oneshot_ms"] = {"runs": oneshot[1:], "median": median(oneshot[1:]), "first": oneshot[0]}
out("ONESHOT", R["oneshot_ms"])


# 7. HTTP stream: response format + TTFB (1 warm-up + 5 runs on one keep-alive connection)
def first_audio_ms(r):
    skip = 44 if r.body[:4] == b"RIFF" else 0
    tot = 0
    for t, n in r.chunks:
        tot += n
        if tot > skip:
            return round(t * 1000)


for codec in ["wav", "mp3"]:
    c = _conn()
    r0 = post_multipart("/voices/clone/stream", {"voice_id": VOICE, "text": ta_txt, "language_code": ta_lc, "output_audio_codec": codec, "speech_sample_rate": "24000"}, conn=c, stream=True)
    runs = []
    for i in range(5):
        r = post_multipart("/voices/clone/stream", {"voice_id": VOICE, "text": ta_txt, "language_code": ta_lc, "output_audio_codec": codec, "speech_sample_rate": "24000"}, conn=c, stream=True)
        runs.append({"status": r.status, "ttfb_ms": round(r.t_first_byte * 1000) if r.t_first_byte else None, "first_audio_ms": first_audio_ms(r),
                     "done_ms": round(r.t_done * 1000), "bytes": len(r.body)})
    c.close()
    R[f"stream_{codec}"] = {"warmup": {"status": r0.status, "content_type": r0.headers.get("content-type"), "transfer_encoding": r0.headers.get("transfer-encoding"),
                                       "magic": r0.body[:4].hex(), "wav": wav_info(r0.body) if codec == "wav" else None,
                                       "first_audio_ms": first_audio_ms(r0), "error": body_text(r0, 400) if r0.status != 200 else None},
                            "runs": runs, "median_first_audio_ms": median([x["first_audio_ms"] for x in runs if x["first_audio_ms"]]),
                            "median_done_ms": median([x["done_ms"] for x in runs])}
    out("STREAM", codec, json.dumps(R[f"stream_{codec}"]))

# 8. stream with pitch (undocumented) and enable_qc (documented as not accepted)
for label, extra in [("stream_pitch", {"pitch": "0.4"}), ("stream_enable_qc", {"enable_qc": "true"}), ("stream_flac", {"output_audio_codec": "flac"})]:
    f = {"voice_id": VOICE, "text": ta_txt, "language_code": ta_lc, "output_audio_codec": "wav"}
    f.update(extra)
    r = post_multipart("/voices/clone/stream", f, stream=True)
    R[label] = {"status": r.status, "bytes": len(r.body), "error": body_text(r, 400) if r.status != 200 else None}
    out(label, json.dumps(R[label], ensure_ascii=False))

with open(os.path.join(HERE, "out", "p05c_results.json"), "w", encoding="utf-8") as fh:
    json.dump(R, fh, ensure_ascii=False, indent=1)
