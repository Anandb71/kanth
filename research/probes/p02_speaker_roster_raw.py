"""Trigger 400 invalid-speaker errors to dump the live speaker roster.

Writes raw error bodies to probes/out/roster_<model>.json (no audio generated).
"""
import json
import os

from common import HERE, body_text, out, post_json

os.makedirs(os.path.join(HERE, "out"), exist_ok=True)

for model in ["bulbul:v4-flash", "bulbul:v3"]:
    for path in ["/text-to-speech"]:
        r = post_json(path, {"text": "नमस्ते", "language_code": "hi-IN", "model": model, "speaker": "zz_not_a_voice"})
        out(f"== {model} {path} -> HTTP {r.status} ({r.t_done*1000:.0f} ms)")
        txt = body_text(r, limit=200000)
        out(txt[:1500])
        fn = os.path.join(HERE, "out", f"roster_{model.replace(':', '_')}.json")
        with open(fn, "w", encoding="utf-8") as f:
            f.write(txt)

# Also: what does the WebSocket-style default (no speaker) resolve to? (no call here; see p01)
