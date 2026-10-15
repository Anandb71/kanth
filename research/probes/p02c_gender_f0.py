"""Acoustic gender hint: synthesize one short line per persona and measure median F0.
Adult male speech typically ~85-155 Hz median F0, adult female ~165-255 Hz. This is a heuristic, not ground truth.
Covers all Tamil personas plus the personas whose first name is gender-ambiguous."""
import base64
import json
import os
import sys
import wave

import numpy as np

from common import HERE, out, post_json

sys.path.insert(0, HERE)
from p03b_analyze_audio import f0_median  # noqa: E402

LINES = {"ta-IN": "வணக்கம், இன்று வானிலை மிகவும் நன்றாக இருக்கிறது.", "hi-IN": "नमस्ते, आज मौसम बहुत अच्छा है।",
         "pa-IN": "ਸਤ ਸ੍ਰੀ ਅਕਾਲ, ਅੱਜ ਮੌਸਮ ਬਹੁਤ ਵਧੀਆ ਹੈ।", "mr-IN": "नमस्कार, आज हवामान खूप छान आहे.", "bn-IN": "নমস্কার, আজ আবহাওয়া খুব সুন্দর।"}
PERSONAS = [("gokul_ta_narration", "ta-IN"), ("vijay_ta_narration", "ta-IN"), ("aravind_ta_ads", "ta-IN"), ("aravind_ta_suspense", "ta-IN"),
            ("harpreet_pa_narration", "pa-IN"), ("mani_hi_conversational", "hi-IN"), ("mrunal_mr_narration", "mr-IN"), ("suman_hi_companion", "hi-IN"),
            ("kangkana_as_conversational", "bn-IN"), ("mouchumi_as_conversational", "bn-IN")]
res = {}
for spk, lc in PERSONAS:
    r = post_json("/text-to-speech", {"text": LINES[lc], "language_code": lc, "model": "bulbul:v4-flash", "speaker": spk, "speech_sample_rate": 16000})
    if r.status != 200:
        res[spk] = {"status": r.status, "error": r.body[:300].decode("utf-8", "replace")}
        out(spk, res[spk])
        continue
    raw = base64.b64decode("".join(json.loads(r.body)["audios"]))
    x = np.frombuffer(raw[44:], dtype=np.int16).astype(np.float32) / 32768.0
    f0, nv = f0_median(16000, x)
    res[spk] = {"language_code_used": lc, "f0_median_hz": round(f0, 1) if f0 else None, "voiced_frames": nv,
                "acoustic_gender_hint": None if not f0 else ("M" if f0 < 160 else "F")}
    out(spk, res[spk])
with open(os.path.join(HERE, "out", "p02c_gender_f0.json"), "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=1)
