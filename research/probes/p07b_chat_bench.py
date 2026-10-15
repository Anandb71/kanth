"""Kanth reply-suggestion benchmark on /v1/chat/completions (SSE streaming).

For each config: 1 warm-up (not counted) + 3 runs on a warm keep-alive connection.
TTFT = time from request send to the first SSE chunk whose delta.content is non-empty.
"""
import json
import os
import sys
import time

from common import HERE, KEY, _conn, median, out, scrub

SYSTEM = (
    "You are the reply-suggestion engine of Kanth, an AAC app for a person who cannot speak. "
    "The conversation partner just said something to the user. Suggest exactly 4 short, natural replies the USER "
    "could say back, in the same language and code-mix style the partner used (Tamil written in Tamil script; "
    "English words may stay in Latin script, i.e. natural Tanglish/Hinglish). Each reply at most 8 words. "
    "Make them meaningfully different: e.g. yes, no, a detail, a question back. "
    'Respond ONLY with JSON: {"replies": ["...", "...", "...", "..."]}'
)
PARTNER = "கண்ணா, சாப்பிட்டியா?"
SCHEMA = {"type": "json_schema", "json_schema": {"name": "replies", "strict": True, "schema": {
    "type": "object", "properties": {"replies": {"type": "array", "items": {"type": "string"}, "minItems": 4, "maxItems": 4}},
    "required": ["replies"], "additionalProperties": False}}}


def sse_call(conn, payload):
    body = json.dumps(payload).encode()
    t0 = time.perf_counter()
    conn.request("POST", "/v1/chat/completions", body=body, headers={"api-subscription-key": KEY, "Content-Type": "application/json", "Accept": "text/event-stream"})
    resp = conn.getresponse()
    t_hdr = time.perf_counter() - t0
    if resp.status != 200:
        return {"status": resp.status, "error": scrub(resp.read().decode("utf-8", "replace"))[:600]}
    content, reasoning = [], []
    t_first_any = t_first_content = t_first_reason = None
    usage = None
    finish = None
    n_chunks = 0
    buf = b""
    done = False
    while not done:
        chunk = resp.read1(4096)
        if not chunk:
            break
        buf += chunk
        while b"\n" in buf:
            line, buf = buf.split(b"\n", 1)
            line = line.strip()
            if not line.startswith(b"data:"):
                continue
            data = line[5:].strip()
            if data == b"[DONE]":
                done = True
                break
            t = time.perf_counter() - t0
            if t_first_any is None:
                t_first_any = t
            n_chunks += 1
            j = json.loads(data)
            if j.get("usage"):
                usage = j["usage"]
            for ch in j.get("choices") or []:
                d = ch.get("delta") or {}
                if d.get("content"):
                    if t_first_content is None:
                        t_first_content = t
                    content.append(d["content"])
                if d.get("reasoning_content"):
                    if t_first_reason is None:
                        t_first_reason = t
                    reasoning.append(d["reasoning_content"])
                if ch.get("finish_reason"):
                    finish = ch["finish_reason"]
    # drain
    while resp.read1(4096):
        pass
    total = time.perf_counter() - t0
    text = "".join(content)
    try:
        parsed = json.loads(text)
        valid = isinstance(parsed, dict) and isinstance(parsed.get("replies"), list) and len(parsed["replies"]) == 4
    except Exception:
        parsed, valid = None, False
    return {"status": 200, "headers_ms": round(t_hdr * 1000), "first_chunk_ms": round(t_first_any * 1000) if t_first_any else None,
            "ttft_content_ms": round(t_first_content * 1000) if t_first_content else None,
            "first_reasoning_ms": round(t_first_reason * 1000) if t_first_reason else None,
            "total_ms": round(total * 1000), "n_chunks": n_chunks, "finish": finish, "usage": usage,
            "reasoning_chars": len("".join(reasoning)), "valid_json_4": valid, "replies": parsed.get("replies") if isinstance(parsed, dict) else text[:400]}


CONFIGS = {
    "conv_schema": {"model": "sarvam-105b-conversations", "response_format": SCHEMA},
    "conv_jsonobj": {"model": "sarvam-105b-conversations", "response_format": {"type": "json_object"}},
    "conv_plain": {"model": "sarvam-105b-conversations"},
    "105b_noreason_schema": {"model": "sarvam-105b", "reasoning_effort": None, "response_format": SCHEMA},
    "105b_noreason_jsonobj": {"model": "sarvam-105b", "reasoning_effort": None, "response_format": {"type": "json_object"}},
    "105b_low_schema": {"model": "sarvam-105b", "reasoning_effort": "low", "response_format": SCHEMA, "max_tokens": 2048},
}


def run(name, n=3):
    cfg = CONFIGS[name]
    payload = {"messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": PARTNER}], "stream": True,
               "max_tokens": 300, "temperature": 0.7}
    payload.update(cfg)
    c = _conn()
    warm = sse_call(c, payload)
    out("warmup", name, json.dumps(warm, ensure_ascii=False)[:800])
    runs = []
    for i in range(n):
        r = sse_call(c, payload)
        runs.append(r)
        out(f"  run{i+1}", name, json.dumps(r, ensure_ascii=False)[:900])
    c.close()
    ok = [r for r in runs if r.get("status") == 200]
    return {"config": {k: v for k, v in cfg.items() if k != "response_format"} | {"response_format": (cfg.get("response_format") or {}).get("type")},
            "warmup": warm, "runs": runs,
            "median_ttft_ms": median([r["ttft_content_ms"] for r in ok if r.get("ttft_content_ms")]),
            "median_total_ms": median([r["total_ms"] for r in ok]),
            "valid_json_4": [r.get("valid_json_4") for r in ok]}


if __name__ == "__main__":
    names = sys.argv[1:] or list(CONFIGS)
    R = {}
    for nme in names:
        R[nme] = run(nme)
        out("SUMMARY", nme, json.dumps({k: R[nme][k] for k in ("median_ttft_ms", "median_total_ms", "valid_json_4")}))
    with open(os.path.join(HERE, "out", f"p07b_{'_'.join(names) if len(names) < 3 else 'all'}.json"), "w", encoding="utf-8") as f:
        json.dump(R, f, ensure_ascii=False, indent=1)
