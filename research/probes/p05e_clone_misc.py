"""GET /voices/{voice_id} shape, and inline ref_audio on POST /voices/clone (no saved voice)."""
import base64
import json
import os
import re
import sys

from common import HERE, body_text, out, post_multipart, request, wav_info

VOICE = sys.argv[1]
r = request("GET", f"/voices/{VOICE}")
txt = body_text(r, 4000)
# signed URLs are long-lived-ish secrets for the audio: redact query strings before printing
txt = re.sub(r"(https://[^\"?]+)\?[^\"]+", r"\1?<signed-query-redacted>", txt)
out("GET /voices/{id} ->", r.status, round(r.t_done * 1000), "ms", txt)

with open(os.path.join(HERE, "ref_clip.wav"), "rb") as f:
    clip = f.read()
r = post_multipart("/voices/clone", {"text": "நன்றி, நான் நல்லா இருக்கேன்.", "language_code": "ta-IN", "output_audio_codec": "wav"},
                   {"ref_audio": ("ref_clip.wav", clip, "audio/wav")})
if r.status == 200:
    j = json.loads(r.body)
    out("inline ref_audio ->", r.status, round(r.t_done * 1000), "ms", wav_info(base64.b64decode(j["audio_b64"])), "keys", sorted(j))
else:
    out("inline ref_audio ->", r.status, body_text(r, 500))
r = post_multipart("/voices/clone", {"voice_id": VOICE, "text": "நன்றி.", "language_code": "ta-IN"}, {"ref_audio": ("ref_clip.wav", clip, "audio/wav")})
out("both voice_id + ref_audio ->", r.status, body_text(r, 300))
