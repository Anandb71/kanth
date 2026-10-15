"""Instant Voice Cloning: list voices, then create one voice from probes/ref_clip.wav.

Saves the create response (voice_id etc.) to probes/out/clone_create.json.
Does NOT delete anything.
"""
import json
import os

from common import HERE, body_text, out, post_multipart, request

os.makedirs(os.path.join(HERE, "out"), exist_ok=True)

r = request("GET", "/voices")
out("GET /voices ->", r.status, round(r.t_done * 1000), "ms")
out(body_text(r, 2000))

existing = None
if r.status == 200:
    try:
        existing = json.loads(r.body)
    except Exception:
        pass

with open(os.path.join(HERE, "ref_clip.wav"), "rb") as f:
    clip = f.read()

r = post_multipart("/voices/create", {"name": "kanth-probe-ta-male", "language": "ta-IN"}, {"file": ("ref_clip.wav", clip, "audio/wav")})
out("POST /voices/create ->", r.status, round(r.t_done * 1000), "ms", "headers:", {k: v for k, v in r.headers.items() if k in ("content-type", "x-request-id")})
txt = body_text(r, 5000)
out(txt)
with open(os.path.join(HERE, "out", "clone_create.json"), "w", encoding="utf-8") as f:
    f.write(json.dumps({"status": r.status, "ms": round(r.t_done * 1000), "body": txt, "list_before": existing}, ensure_ascii=False, indent=1))
