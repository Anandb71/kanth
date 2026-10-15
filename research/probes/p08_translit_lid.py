"""Transliteration (POST /transliterate) and language identification (POST /text-lid): shapes + latency."""
import json
import os

from common import HERE, _conn, body_text, median, out, post_json

R = {"transliterate": [], "text-lid": []}
c = _conn()
post_json("/text-lid", {"input": "warm up"}, conn=c)  # warm the connection


def tr(payload, n=3):
    times, last = [], None
    for _ in range(n):
        r = post_json("/transliterate", payload, conn=c)
        times.append(round(r.t_done * 1000))
        last = r
    rec = {"request": payload, "status": last.status, "ms": times, "median_ms": median(times),
           "response": json.loads(last.body) if last.status == 200 else body_text(last, 500)}
    R["transliterate"].append(rec)
    out("TR", json.dumps(rec, ensure_ascii=False))


def lid(text, n=3):
    times, last = [], None
    for _ in range(n):
        r = post_json("/text-lid", {"input": text}, conn=c)
        times.append(round(r.t_done * 1000))
        last = r
    rec = {"input": text, "status": last.status, "ms": times, "median_ms": median(times),
           "response": json.loads(last.body) if last.status == 200 else body_text(last, 500)}
    R["text-lid"].append(rec)
    out("LID", json.dumps(rec, ensure_ascii=False))


tr({"input": "kanna saapittiya", "source_language_code": "en-IN", "target_language_code": "ta-IN"})
tr({"input": "naan saapten, nee saapttiya?", "source_language_code": "auto", "target_language_code": "ta-IN"})
tr({"input": "aap kaise ho, khana kha liya?", "source_language_code": "en-IN", "target_language_code": "hi-IN"})
tr({"input": "मैं office जा रहा हूँ", "source_language_code": "hi-IN", "target_language_code": "en-IN"})
tr({"input": "கண்ணா, சாப்பிட்டியா?", "source_language_code": "ta-IN", "target_language_code": "en-IN"})
tr({"input": "मुझे कल 9:30am को appointment है", "source_language_code": "hi-IN", "target_language_code": "hi-IN", "spoken_form": True}, n=1)
tr({"input": "kanna saapittiya", "source_language_code": "en-IN", "target_language_code": "ta-IN", "model": "x"}, n=1)

for t in ["கண்ணா, சாப்பிட்டியா?", "kanna saapittiya", "aap kaise ho, khana kha liya?", "मैं office जा रहा हूँ",
          "Did you eat your lunch?", "ఎలా ఉన్నారు?", "naan office poren, meeting irukku"]:
    lid(t)
c.close()

with open(os.path.join(HERE, "out", "p08_results.json"), "w", encoding="utf-8") as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
