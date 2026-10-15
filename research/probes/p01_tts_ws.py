"""Bulbul v4-flash TTS WebSocket probe.

wss://api.sarvam.ai/text-to-speech/ws?model=bulbul:v4-flash
Run with the research venv (needs `websockets`):  ../.venv/Scripts/python.exe p01_tts_ws.py [test ...]
Tests: warm (5-run TTFA), interleave, codecs, rates, nofllush, ping, configswap, badconfig, subprotocol, prosody
"""
import asyncio
import base64
import json
import os
import sys
import time

import common  # noqa: F401  (sets up long-path sys.path for websockets)
import websockets
import websockets.asyncio.client

from common import HERE, KEY, median, out, scrub, wav_info

URL = "wss://api.sarvam.ai/text-to-speech/ws?model=bulbul:v4-flash&send_completion_event=true"
HI_SHORT = "नमस्ते, आप कैसे हैं?"
OUTDIR = os.path.join(HERE, "out", "ws")
os.makedirs(OUTDIR, exist_ok=True)
RESULTS = {}


def summarize(msg):
    """Return a JSON-safe summary of a server message (audio replaced by its size)."""
    m = json.loads(msg)
    s = {"type": m.get("type")}
    d = m.get("data")
    if isinstance(d, dict):
        dd = {}
        for k, v in d.items():
            if k == "audio":
                dd["audio_b64_len"] = len(v)
                dd["audio_bytes"] = len(base64.b64decode(v))
                dd["audio_magic"] = base64.b64decode(v)[:4].hex()
            else:
                dd[k] = v
        s["data"] = dd
    else:
        s["data"] = d
    extra = {k: v for k, v in m.items() if k not in ("type", "data")}
    if extra:
        s["extra_top_level"] = extra
    return m, s


async def connect(url=URL, subprotocol=False):
    if subprotocol:
        return await websockets.asyncio.client.connect(url, subprotocols=[f"api-subscription-key.{KEY}"], max_size=None, open_timeout=20)
    return await websockets.asyncio.client.connect(url, additional_headers={"api-subscription-key": KEY}, max_size=None, open_timeout=20)


async def utter(ws, text, flush=True, timeout=15, keep=False):
    """Send text (+flush), collect until final event. Returns dict with timings and messages."""
    t0 = time.perf_counter()
    await ws.send(json.dumps({"type": "text", "data": {"text": text}}))
    if flush:
        await ws.send(json.dumps({"type": "flush"}))
    first = None
    first_real = None  # first audio message carrying more than a bare 44-byte WAV header
    msgs = []
    audio = bytearray()
    final = None
    while True:
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
        except asyncio.TimeoutError:
            break
        t = time.perf_counter() - t0
        m, s = summarize(raw)
        s["t_ms"] = round(t * 1000)
        msgs.append(s)
        if m.get("type") == "audio":
            chunk = base64.b64decode(m["data"]["audio"])
            if first is None:
                first = t
            if first_real is None and len(chunk) > 44:
                first_real = t
            audio.extend(chunk)
        if m.get("type") == "event" and (m.get("data") or {}).get("event_type") == "final":
            final = t
            break
        if m.get("type") == "error":
            break
    first_audio = next((s for s in msgs if s["type"] == "audio"), None)
    res = {"ttfa_ms": round(first * 1000) if first else None,
           "ttfa_real_audio_ms": round(first_real * 1000) if first_real else None,
           "final_ms": round(final * 1000) if final else None,
           "n_audio_msgs": sum(1 for s in msgs if s["type"] == "audio"), "audio_bytes": len(audio),
           "first_chunk": {"bytes": first_audio["data"]["audio_bytes"], "magic": first_audio["data"]["audio_magic"],
                           "content_type": first_audio["data"].get("content_type")} if first_audio else None,
           "msg_types": [s["type"] for s in msgs]}
    if keep:
        res["audio"] = bytes(audio)
        res["msgs"] = msgs
    return res


def cfg(**kw):
    d = {"speaker": "aparna_hi_customer", "language_code": "hi-IN", "output_audio_codec": "wav", "speech_sample_rate": 16000}
    d.update(kw)
    return {"type": "config", "data": d}


async def t_warm(codec="wav"):
    """5 warm runs of a short Hindi sentence on one connection (after one warm-up)."""
    t_conn = time.perf_counter()
    ws = await connect()
    conn_ms = round((time.perf_counter() - t_conn) * 1000)
    await ws.send(json.dumps(cfg(output_audio_codec=codec)))
    warm = await utter(ws, HI_SHORT, keep=True)
    out("warmup", json.dumps({k: v for k, v in warm.items() if k not in ("audio",)}, ensure_ascii=False)[:3000])
    with open(os.path.join(OUTDIR, f"warmup.{codec}"), "wb") as f:
        f.write(warm["audio"])
    if codec == "wav":
        out("warmup wav header:", wav_info(warm["audio"]))
    runs = []
    for i in range(5):
        r = await utter(ws, HI_SHORT)
        runs.append(r)
        out(f"run{i+1}", json.dumps(r))
        await asyncio.sleep(0.5)
    await ws.close()
    tt = [r["ttfa_ms"] for r in runs if r["ttfa_ms"]]
    tr = [r["ttfa_real_audio_ms"] for r in runs if r["ttfa_real_audio_ms"]]
    fin = [r["final_ms"] for r in runs if r["final_ms"]]
    RESULTS[f"warm_{codec}"] = {"connect_ms": conn_ms, "warmup_ttfa_ms": warm["ttfa_ms"], "warmup_ttfa_real_audio_ms": warm["ttfa_real_audio_ms"],
                                "ttfa_ms": tt, "median_ttfa_ms": median(tt), "ttfa_real_audio_ms": tr, "median_ttfa_real_audio_ms": median(tr),
                                "final_ms": fin, "median_final_ms": median(fin),
                                "first_chunk_per_run": [r["first_chunk"] for r in runs]}
    out("WARM", codec, json.dumps(RESULTS[f"warm_{codec}"]))


async def t_cold():
    """Cold: new connection + config + text each time (3 runs)."""
    vals = []
    for i in range(3):
        t0 = time.perf_counter()
        ws = await connect()
        tc = time.perf_counter() - t0
        await ws.send(json.dumps(cfg()))
        r = await utter(ws, HI_SHORT)
        vals.append({"connect_ms": round(tc * 1000), "first_msg_after_text_ms": r["ttfa_ms"], "ttfa_real_audio_after_text_ms": r["ttfa_real_audio_ms"], "total_from_connect_ms": round(tc * 1000) + (r["ttfa_real_audio_ms"] or 0)})
        await ws.close()
    RESULTS["cold"] = vals
    out("COLD", json.dumps(vals))


async def t_interleave():
    """Send utterance A then B back-to-back without waiting; observe ordering / finals."""
    ws = await connect()
    await ws.send(json.dumps(cfg()))
    t0 = time.perf_counter()
    await ws.send(json.dumps({"type": "text", "data": {"text": "पहला वाक्य यह है।"}}))
    await ws.send(json.dumps({"type": "flush"}))
    await ws.send(json.dumps({"type": "text", "data": {"text": "दूसरा वाक्य थोड़ा लंबा है, ठीक है?"}}))
    await ws.send(json.dumps({"type": "flush"}))
    seq = []
    finals = 0
    while finals < 2:
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=10)
        except asyncio.TimeoutError:
            seq.append("TIMEOUT")
            break
        m, s = summarize(raw)
        s["t_ms"] = round((time.perf_counter() - t0) * 1000)
        seq.append(s)
        if m.get("type") == "event":
            finals += 1
    await ws.close()
    compact = [(x if isinstance(x, str) else (x["type"], x["t_ms"], (x.get("data") or {}).get("request_id"), (x.get("data") or {}).get("event_type"), (x.get("data") or {}).get("audio_bytes"))) for x in seq]
    RESULTS["interleave"] = compact
    out("INTERLEAVE", json.dumps(compact, ensure_ascii=False))


async def t_codecs():
    res = {}
    for codec in ["mp3", "wav", "linear16", "pcm", "opus", "flac", "aac", "mulaw", "alaw"]:
        try:
            ws = await connect()
            await ws.send(json.dumps(cfg(output_audio_codec=codec, speech_sample_rate=16000)))
            r = await utter(ws, "नमस्ते।", keep=True, timeout=8)
            first = next((m for m in r["msgs"] if m["type"] in ("audio", "error")), None)
            res[codec] = {"ttfa_ms": r["ttfa_ms"], "types": r["msg_types"][:6], "first": first if first and first["type"] == "error" else
                          {"content_type": first["data"].get("content_type") if first else None, "magic": first["data"].get("audio_magic") if first else None},
                          "audio_bytes": r["audio_bytes"], "n_audio_msgs": r["n_audio_msgs"]}
            if codec == "wav":
                res[codec]["wav_header"] = wav_info(r["audio"])
            try:
                await ws.close()
            except Exception:
                pass
        except Exception as e:
            res[codec] = {"exception": scrub(repr(e))[:300]}
        out("CODEC", codec, json.dumps(res[codec], ensure_ascii=False)[:600])
    RESULTS["codecs"] = res


async def t_rates():
    res = {}
    for sr in [8000, 16000, 22050, 24000, 44100, 48000]:
        try:
            ws = await connect()
            await ws.send(json.dumps(cfg(output_audio_codec="wav", speech_sample_rate=sr)))
            r = await utter(ws, "नमस्ते।", keep=True, timeout=8)
            err = next((m for m in r["msgs"] if m["type"] == "error"), None)
            res[sr] = {"ttfa_ms": r["ttfa_ms"], "wav": wav_info(r["audio"]) if r["audio"] else None, "error": err}
            await ws.close()
        except Exception as e:
            res[sr] = {"exception": scrub(repr(e))[:300]}
        out("RATE", sr, json.dumps(res[sr], ensure_ascii=False)[:500])
    RESULTS["rates"] = res


async def t_noflush():
    """Text below/above min_buffer_size without flush: does audio come?"""
    res = {}
    ws = await connect()
    await ws.send(json.dumps(cfg()))
    r = await utter(ws, "नमस्ते।", flush=False, timeout=6)
    res["short_no_flush"] = r
    r = await utter(ws, "", flush=True, timeout=8) if False else None
    await ws.send(json.dumps({"type": "flush"}))
    r2 = None
    try:
        raw = await asyncio.wait_for(ws.recv(), timeout=8)
        r2 = summarize(raw)[1]
    except asyncio.TimeoutError:
        r2 = "TIMEOUT"
    res["after_late_flush_first_msg"] = r2
    # drain
    try:
        while True:
            raw = await asyncio.wait_for(ws.recv(), timeout=3)
            if json.loads(raw).get("type") == "event":
                break
    except asyncio.TimeoutError:
        pass
    long_text = "आज सुबह मैंने चाय पी, फिर अख़बार पढ़ा, और उसके बाद हम सब पार्क में टहलने गए। वहाँ बहुत सारे बच्चे खेल रहे थे।"
    r3 = await utter(ws, long_text, flush=False, timeout=8)
    res["long_no_flush"] = {**r3, "text_len": len(long_text)}
    await ws.close()
    RESULTS["noflush"] = res
    out("NOFLUSH", json.dumps(res, ensure_ascii=False, default=str)[:1500])


async def t_ping():
    ws = await connect()
    await ws.send(json.dumps(cfg()))
    await ws.send(json.dumps({"type": "ping"}))
    try:
        raw = await asyncio.wait_for(ws.recv(), timeout=5)
        r = summarize(raw)[1]
    except asyncio.TimeoutError:
        r = "no reply within 5s"
    RESULTS["ping"] = r
    out("PING", json.dumps(r, ensure_ascii=False))
    await ws.close()


async def t_configswap():
    """Change speaker/language/pace mid-connection via a new config message."""
    ws = await connect()
    await ws.send(json.dumps(cfg()))
    a = await utter(ws, HI_SHORT)
    await ws.send(json.dumps(cfg(speaker="vijay_ta_narration", language_code="ta-IN", pace=1.3)))
    b = await utter(ws, "வணக்கம், எப்படி இருக்கீங்க?", keep=True)
    with open(os.path.join(OUTDIR, "configswap_tamil.wav"), "wb") as f:
        f.write(b["audio"])
    await ws.close()
    RESULTS["configswap"] = {"a": a, "b": {k: v for k, v in b.items() if k not in ("audio", "msgs")}}
    out("CONFIGSWAP", json.dumps(RESULTS["configswap"]))


async def t_prosody():
    """pitch / loudness in WS config: accepted? errors?"""
    res = {}
    for name, extra in [("pitch_0.3", {"pitch": 0.3}), ("loudness_1.5", {"loudness": 1.5}), ("pitch_0.9", {"pitch": 0.9}),
                        ("loudness_3.0", {"loudness": 3.0}), ("pace_2.5", {"pace": 2.5}), ("temperature", {"temperature": 0.3})]:
        ws = await connect()
        await ws.send(json.dumps(cfg(**extra)))
        r = await utter(ws, "नमस्ते।", keep=True, timeout=8)
        err = next((m for m in r["msgs"] if m["type"] == "error"), None)
        res[name] = {"ttfa_ms": r["ttfa_ms"], "audio_bytes": r["audio_bytes"], "error": err}
        if r["audio"]:
            with open(os.path.join(OUTDIR, f"prosody_{name}.wav"), "wb") as f:
                f.write(r["audio"])
        try:
            await ws.close()
        except Exception:
            pass
        out("PROSODY", name, json.dumps(res[name], ensure_ascii=False)[:500])
    RESULTS["prosody"] = res


async def t_badconfig():
    res = {}
    for name, c in [("bad_speaker", cfg(speaker="nobody_hi_x")), ("missing_lang", {"type": "config", "data": {"speaker": "aparna_hi_customer"}}),
                    ("text_before_config", None), ("v3_name", cfg(speaker="ishita"))]:
        ws = await connect()
        if c:
            await ws.send(json.dumps(c))
        r = await utter(ws, "नमस्ते।", keep=True, timeout=6)
        res[name] = {"types": r["msg_types"], "msgs": [m for m in r["msgs"] if m["type"] != "audio"][:3], "audio_bytes": r["audio_bytes"]}
        try:
            await asyncio.wait_for(ws.recv(), timeout=2)
        except Exception as e:
            res[name]["after"] = scrub(repr(e))[:200]
        res[name]["close_code"] = ws.close_code
        res[name]["close_reason"] = ws.close_reason
        try:
            await ws.close()
        except Exception:
            pass
        out("BADCONFIG", name, json.dumps(res[name], ensure_ascii=False)[:1200])
    RESULTS["badconfig"] = res


async def t_subprotocol():
    try:
        ws = await connect(subprotocol=True)
        sp = ws.subprotocol
        await ws.send(json.dumps(cfg()))
        r = await utter(ws, "नमस्ते।", timeout=8)
        RESULTS["subprotocol"] = {"accepted": True, "echoed_subprotocol_is_key_form": bool(sp and sp.startswith("api-subscription-key.")), "ttfa_ms": r["ttfa_ms"], "types": r["msg_types"][:5]}
        await ws.close()
    except Exception as e:
        RESULTS["subprotocol"] = {"accepted": False, "exception": scrub(repr(e))[:400]}
    out("SUBPROTOCOL", json.dumps(RESULTS["subprotocol"]))


async def t_idle(limit=150):
    """Measure server idle timeout: connect, config, one utterance, then stay silent."""
    ws = await connect()
    await ws.send(json.dumps(cfg()))
    await utter(ws, "नमस्ते।")
    t0 = time.perf_counter()
    reason = None
    try:
        while time.perf_counter() - t0 < limit:
            raw = await asyncio.wait_for(ws.recv(), timeout=limit)
            out("IDLE msg", summarize(raw)[1])
    except websockets.ConnectionClosed as e:
        reason = {"code": e.rcvd.code if e.rcvd else None, "reason": e.rcvd.reason if e.rcvd else None}
    except asyncio.TimeoutError:
        reason = "still open"
    el = round(time.perf_counter() - t0, 1)
    RESULTS["idle"] = {"closed_after_s": el, "close": reason}
    out("IDLE", json.dumps(RESULTS["idle"]))


async def t_idle_ping(total=100, every=20):
    """Ping every 20 s for 100 s: does it keep the socket alive, and does the server answer pings?"""
    ws = await connect()
    await ws.send(json.dumps(cfg()))
    await utter(ws, "नमस्ते।")
    t0 = time.perf_counter()
    replies = []
    alive = True
    while time.perf_counter() - t0 < total:
        await ws.send(json.dumps({"type": "ping"}))
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=every)
            replies.append(summarize(raw)[1])
        except asyncio.TimeoutError:
            pass
        except websockets.ConnectionClosed as e:
            alive = False
            replies.append({"closed": e.rcvd.code if e.rcvd else None, "at_s": round(time.perf_counter() - t0, 1)})
            break
    r = None
    if alive:
        r = await utter(ws, "फिर से नमस्ते।", timeout=8)
    RESULTS["idle_ping"] = {"alive_after_s": round(time.perf_counter() - t0, 1), "alive": alive, "replies": replies[:5], "utter_after": r}
    out("IDLE_PING", json.dumps(RESULTS["idle_ping"], ensure_ascii=False))
    if alive:
        await ws.close()


TESTS = {"warm": t_warm, "warm_mp3": lambda: t_warm("mp3"), "warm_linear16": lambda: t_warm("linear16"), "cold": t_cold, "interleave": t_interleave, "codecs": t_codecs, "rates": t_rates, "noflush": t_noflush,
         "ping": t_ping, "configswap": t_configswap, "prosody": t_prosody, "badconfig": t_badconfig, "subprotocol": t_subprotocol,
         "idle": t_idle, "idle_ping": t_idle_ping}


async def main(names):
    for n in names:
        try:
            await TESTS[n]()
        except Exception as e:
            out("TEST FAILED", n, scrub(repr(e))[:500])
            RESULTS[n] = {"exception": scrub(repr(e))[:500]}
    tag = "_".join(names) if len(names) < 4 else "multi"
    with open(os.path.join(HERE, "out", f"p01_ws_{tag}.json"), "w", encoding="utf-8") as f:
        json.dump(RESULTS, f, ensure_ascii=False, indent=1, default=str)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:] or ["warm"]))
