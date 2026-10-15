"""Print the raw SSE chunk shapes of /v1/chat/completions (first chunks + last chunks) for
sarvam-105b with reasoning ON (low) and for sarvam-105b-conversations, to document the wire format."""
import json

from common import KEY, _conn, out, scrub


def raw(payload, keep_first=4, keep_last=3):
    c = _conn()
    c.request("POST", "/v1/chat/completions", body=json.dumps(payload).encode(),
              headers={"api-subscription-key": KEY, "Content-Type": "application/json"})
    r = c.getresponse()
    out("status", r.status, "content-type", r.getheader("content-type"))
    lines = [ln for ln in r.read().decode("utf-8").splitlines() if ln.strip()]
    c.close()
    for ln in lines[:keep_first]:
        out("  FIRST", scrub(ln)[:600])
    out("  ...", len(lines), "lines total")
    for ln in lines[-keep_last:]:
        out("  LAST", scrub(ln)[:600])


msgs = [{"role": "user", "content": "Reply with one Tamil word for yes."}]
raw({"model": "sarvam-105b", "messages": msgs, "stream": True, "reasoning_effort": "low", "max_tokens": 120})
raw({"model": "sarvam-105b-conversations", "messages": msgs, "stream": True, "max_tokens": 20})
# Non-streaming with reasoning on: is reasoning text returned?
c = _conn()
c.request("POST", "/v1/chat/completions", body=json.dumps({"model": "sarvam-105b", "messages": msgs, "reasoning_effort": "low", "max_tokens": 1500}).encode(),
          headers={"api-subscription-key": KEY, "Content-Type": "application/json"})
j = json.loads(c.getresponse().read())
m = j["choices"][0]["message"]
out("NONSTREAM content:", repr(m.get("content")), "| reasoning_content len:", len(m.get("reasoning_content") or ""), "| usage:", json.dumps(j.get("usage")))
