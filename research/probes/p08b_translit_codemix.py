"""Transliteration follow-up for server/translit.ts: Roman code-mixed input -> native script.

Questions p08 left open:
1. source_language_code "auto" vs "en-IN" vs the target language itself, for Romanised Tamil/Hindi
   (p08 showed en-IN dropping final long vowels: "kanna" -> "கண்ண").
2. What happens to English words inside Romanised Indic ("charger", "phone").
3. numerals_format native/international and digits in the input.
Saves probes/out/p08b_results.json.
"""
import json
import os

from common import HERE, _conn, body_text, out, post_json

R = []
c = _conn()
post_json("/text-lid", {"input": "warm up"}, conn=c)


def tr(payload):
    r = post_json("/transliterate", payload, conn=c)
    rec = {"request": payload, "status": r.status, "ms": round(r.t_done * 1000),
           "response": json.loads(r.body) if r.status == 200 else body_text(r, 400)}
    if isinstance(rec["response"], dict):
        rec["response"].pop("request_id", None)
    R.append(rec)
    out("TR", json.dumps(rec, ensure_ascii=False))


TA = "amma charger edutthu vaa"
for src in ["auto", "en-IN", "ta-IN"]:
    tr({"input": TA, "source_language_code": src, "target_language_code": "ta-IN"})
tr({"input": "kanna saapittiya", "source_language_code": "auto", "target_language_code": "ta-IN"})
tr({"input": "kanna saapittiya", "source_language_code": "ta-IN", "target_language_code": "ta-IN"})
HI = "mujhe phone charger chahiye, 2 baje tak"
for src in ["auto", "en-IN", "hi-IN"]:
    tr({"input": HI, "source_language_code": src, "target_language_code": "hi-IN"})
tr({"input": HI, "source_language_code": "auto", "target_language_code": "hi-IN", "numerals_format": "native"})
tr({"input": "naan office poren, meeting irukku", "source_language_code": "auto", "target_language_code": "ta-IN"})
tr({"input": "", "source_language_code": "auto", "target_language_code": "ta-IN"})
tr({"input": "amma vaa", "source_language_code": "auto", "target_language_code": "ml-IN"})
c.close()

with open(os.path.join(HERE, "out", "p08b_results.json"), "w", encoding="utf-8") as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
