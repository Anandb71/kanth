"""REST /text-to-speech: does opus work when the sample rate is opus-compatible? (docs say opus errors on REST)."""
import base64
import json

from common import body_text, out, post_json

for sr in [24000, 16000]:
    r = post_json("/text-to-speech", {"text": "नमस्ते।", "language_code": "hi-IN", "model": "bulbul:v4-flash", "speaker": "aparna_hi_customer",
                                      "output_audio_codec": "opus", "speech_sample_rate": sr})
    if r.status == 200:
        raw = base64.b64decode("".join(json.loads(r.body)["audios"]))
        out("opus", sr, "->", r.status, len(raw), "bytes, magic", raw[:4])
    else:
        out("opus", sr, "->", r.status, body_text(r, 300))
