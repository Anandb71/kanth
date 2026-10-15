"""POST /text-to-speech/stream (bulbul:v4-flash): response format + TTFB on a warm keep-alive connection.

TTFB = time from sending the request to the first response-body byte.
"""
import json
import os

from common import HERE, _conn, body_text, median, out, post_json, wav_info

OUT = os.path.join(HERE, "out", "stream")
os.makedirs(OUT, exist_ok=True)
HI_SHORT = "नमस्ते, आप कैसे हैं?"
R = {}


def payload(**kw):
    p = {"text": HI_SHORT, "language_code": "hi-IN", "model": "bulbul:v4-flash", "speaker": "aparna_hi_customer", "speech_sample_rate": 16000}
    p.update(kw)
    return p


def first_audio_ms(r):
    """Time of the first body byte beyond a 44-byte WAV header (= first real audio sample)."""
    skip = 44 if r.body[:4] == b"RIFF" else 0
    tot = 0
    for t, n in r.chunks:
        tot += n
        if tot > skip:
            return round(t * 1000)
    return None


def describe(r):
    return {"first_audio_ms": first_audio_ms(r), "status": r.status, "content_type": r.headers.get("content-type"), "transfer_encoding": r.headers.get("transfer-encoding"),
            "content_length": r.headers.get("content-length"), "request_id_hdr": {k: v for k, v in r.headers.items() if "request" in k or "id" in k},
            "headers_ms": round(r.t_headers * 1000), "ttfb_ms": round(r.t_first_byte * 1000) if r.t_first_byte else None,
            "done_ms": round(r.t_done * 1000), "n_reads": len(r.chunks), "bytes": len(r.body), "magic": r.body[:4].hex()}


# 1. default codec (omit output_audio_codec)
r = post_json("/text-to-speech/stream", payload(), stream=True)
R["default_codec"] = describe(r)
out("DEFAULT", json.dumps(R["default_codec"]))
if r.status != 200:
    out(body_text(r))

# 2. codecs
for codec in ["wav", "mp3", "linear16", "opus", "aac", "flac", "mulaw"]:
    kw = {"output_audio_codec": codec}
    r = post_json("/text-to-speech/stream", payload(**kw), stream=True)
    d = describe(r)
    if r.status == 200 and codec == "wav":
        d["wav"] = wav_info(r.body)
        with open(os.path.join(OUT, "stream_16k.wav"), "wb") as f:
            f.write(r.body)
    if r.status != 200:
        d["error"] = body_text(r, 400)
    R[f"codec_{codec}"] = d
    out("CODEC", codec, json.dumps(d))

# 3. warm TTFB: 1 warm-up + 5 runs on one keep-alive connection
for codec in ["wav", "mp3"]:
    c = _conn()
    post_json("/text-to-speech/stream", payload(output_audio_codec=codec), conn=c, stream=True)
    runs = []
    for i in range(5):
        r = post_json("/text-to-speech/stream", payload(output_audio_codec=codec), conn=c, stream=True)
        runs.append(describe(r))
    c.close()
    tt = [x["ttfb_ms"] for x in runs]
    fa = [x["first_audio_ms"] for x in runs]
    R[f"warm_{codec}"] = {"ttfb_ms": tt, "median_ttfb_ms": median(tt), "first_audio_ms": fa, "median_first_audio_ms": median(fa), "done_ms": [x["done_ms"] for x in runs],
                          "median_done_ms": median([x["done_ms"] for x in runs]), "headers_ms": [x["headers_ms"] for x in runs],
                          "n_reads": [x["n_reads"] for x in runs]}
    out("WARM", codec, json.dumps(R[f"warm_{codec}"]))

# 4. cold TTFB (new TLS connection each time), 3 runs
cold = []
for i in range(3):
    r = post_json("/text-to-speech/stream", payload(output_audio_codec="wav"), stream=True)
    d = describe(r)
    cold.append({"ttfb_ms": d["ttfb_ms"], "first_audio_ms": d["first_audio_ms"]})
R["cold_wav_ttfb_ms"] = cold
out("COLD", cold)

# 5. sample-rate ceiling on stream
for sr in [24000, 48000]:
    r = post_json("/text-to-speech/stream", payload(output_audio_codec="wav", speech_sample_rate=sr), stream=True)
    d = describe(r)
    d["wav"] = wav_info(r.body) if r.status == 200 else None
    if r.status != 200:
        d["error"] = body_text(r, 300)
    R[f"rate_{sr}"] = d
    out("RATE", sr, json.dumps(d))

# 6. longer text: chunking cadence
long_text = "आज सुबह मैंने चाय पी, फिर अख़बार पढ़ा। उसके बाद हम सब पार्क में टहलने गए। वहाँ बहुत सारे बच्चे खेल रहे थे।"
r = post_json("/text-to-speech/stream", payload(text=long_text, output_audio_codec="wav"), stream=True)
R["long_text"] = {**describe(r), "chunk_times_ms": [round(t * 1000) for t, n in r.chunks[:40]], "wav": wav_info(r.body)}
out("LONG", json.dumps(R["long_text"]))

with open(os.path.join(HERE, "out", "p04_results.json"), "w", encoding="utf-8") as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
