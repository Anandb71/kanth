"""Chat model discovery: which model IDs answer on /v1 and /v2 with this key, and how reasoning toggles behave."""
import json
import os

from common import HERE, body_text, out, post_json, request

R = {}
r = request("GET", "/v2/models")
R["GET /v2/models"] = {"status": r.status, "body": body_text(r, 3000)}
out("GET /v2/models", r.status, body_text(r, 3000))
r = request("GET", "/v1/models")
R["GET /v1/models"] = {"status": r.status, "body": body_text(r, 1500)}
out("GET /v1/models", r.status, body_text(r, 1500))

MSG = [{"role": "user", "content": "Say hi in Tamil, one word."}]


def call(ver, model, **kw):
    p = {"model": model, "messages": MSG, "max_tokens": 400}
    p.update(kw)
    r = post_json(f"/{ver}/chat/completions", p)
    rec = {"status": r.status, "ms": round(r.t_done * 1000)}
    if r.status == 200:
        j = json.loads(r.body)
        msg = j["choices"][0]["message"]
        rec.update(model_echo=j.get("model"), content=(msg.get("content") or "")[:120], has_reasoning=bool(msg.get("reasoning_content")),
                   reasoning_len=len(msg.get("reasoning_content") or ""), finish=j["choices"][0].get("finish_reason"), usage=j.get("usage"),
                   message_keys=sorted(msg.keys()))
    else:
        rec["error"] = body_text(r, 500)
    key = f"{ver} {model} {json.dumps(kw)}"
    R[key] = rec
    out(key, json.dumps(rec, ensure_ascii=False))


for m in ["sarvam-105b", "sarvam-105b-conversations", "sarvam-m", "sarvam-30b", "sarvam-105b-chat"]:
    call("v1", m)
for m in ["sarvam-105b", "gemma4", "glm5.3", "deepseekv4.1-flash", "sarvam-105b-conversations"]:
    call("v2", m)
# reasoning toggles on v1
for kw in [{"reasoning_effort": None}, {"reasoning_effort": "low"}, {"reasoning_effort": "medium"}, {"reasoning_effort": "max"}]:
    call("v1", "sarvam-105b", **kw)
    call("v1", "sarvam-105b-conversations", **kw)

with open(os.path.join(HERE, "out", "p07a_results.json"), "w", encoding="utf-8") as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
