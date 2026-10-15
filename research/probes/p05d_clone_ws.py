"""Instant Voice Cloning WebSocket probe: wss://api.sarvam.ai/voices/clone/ws

Usage: python p05d_clone_ws.py <voice_id>
"""
import asyncio
import base64
import json
import os
import sys
import time

import common  # noqa: F401  (long-path sys.path for websockets)
import websockets
import websockets.asyncio.client

from common import HERE, KEY, median, out, scrub, wav_info

VOICE = sys.argv[1]
URL = "wss://api.sarvam.ai/voices/clone/ws?send_completion_event=true"
TA = "கண்ணா, நான் சாப்பிட்டேன். நீ சாப்பிட்டியா?"
R = {}


async def connect(sub=False):
    if sub:
        return await websockets.asyncio.client.connect(URL, subprotocols=[f"api-subscription-key.{KEY}"], max_size=None, open_timeout=20)
    return await websockets.asyncio.client.connect(URL, additional_headers={"api-subscription-key": KEY}, max_size=None, open_timeout=20)


def cfg(**kw):
    d = {"target_language_code": "ta-IN", "voice_id": VOICE, "output_audio_codec": "wav", "speech_sample_rate": 24000}
    d.update(kw)
    return json.dumps({"type": "config", "data": d})


async def utter(ws, text, timeout=20):
    t0 = time.perf_counter()
    await ws.send(json.dumps({"type": "text", "data": {"text": text}}))
    await ws.send(json.dumps({"type": "flush"}))
    first = first_real = final = None
    audio = bytearray()
    types = []
    msgs = []
    while True:
        try:
            raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
        except asyncio.TimeoutError:
            types.append("TIMEOUT")
            break
        except websockets.ConnectionClosed as e:
            types.append(f"CLOSED {e.rcvd.code if e.rcvd else None} {e.rcvd.reason if e.rcvd else ''}")
            break
        t = time.perf_counter() - t0
        m = json.loads(raw)
        types.append(m.get("type"))
        if m.get("type") == "audio":
            ch = base64.b64decode(m["data"]["audio"])
            if first is None:
                first = t
                msgs.append({"first_audio_keys": sorted(m["data"].keys()), "content_type": m["data"].get("content_type"), "bytes": len(ch), "magic": ch[:4].hex()})
            if first_real is None and len(ch) > 44:
                first_real = t
            audio.extend(ch)
        else:
            msgs.append(m)
            if m.get("type") == "event":
                final = t
                break
            if m.get("type") == "error":
                break
    return {"ttfa_ms": round(first * 1000) if first else None, "ttfa_real_ms": round(first_real * 1000) if first_real else None,
            "final_ms": round(final * 1000) if final else None, "types": types[:8], "n_types": len(types), "msgs": msgs[:3], "audio": bytes(audio)}


async def main():
    # warm-up + 5 warm runs
    ws = await connect()
    await ws.send(cfg())
    w = await utter(ws)  if False else await utter(ws, TA)
    out("warmup", json.dumps({k: v for k, v in w.items() if k != "audio"}, ensure_ascii=False)[:1500], wav_info(w["audio"]))
    with open(os.path.join(HERE, "out", "clone", "ws_warmup.wav"), "wb") as f:
        f.write(w["audio"])
    runs = []
    for i in range(5):
        r = await utter(ws, TA)
        runs.append({k: v for k, v in r.items() if k not in ("audio", "msgs")})
        out("run", i + 1, json.dumps(runs[-1]))
    # multi-language on one socket via config swap
    await ws.send(cfg(target_language_code="hi-IN"))
    h = await utter(ws, "हाँ बेटा, मैंने खाना खा लिया।")
    R["config_swap_hi"] = {k: v for k, v in h.items() if k not in ("audio",)}
    out("swap_hi", json.dumps(R["config_swap_hi"], ensure_ascii=False)[:600])
    await ws.close()
    tr = [x["ttfa_real_ms"] for x in runs if x["ttfa_real_ms"]]
    R["warm"] = {"warmup_ttfa_real_ms": w["ttfa_real_ms"], "runs": runs, "median_ttfa_real_ms": median(tr), "median_final_ms": median([x["final_ms"] for x in runs if x["final_ms"]])}
    out("WARM", json.dumps(R["warm"])[:1500])

    # field-name / param checks, each on its own socket
    checks = {
        "language_code_instead_of_target": json.dumps({"type": "config", "data": {"language_code": "ta-IN", "voice_id": VOICE, "output_audio_codec": "wav"}}),
        "pitch_in_config": cfg(pitch=0.4),
        "loudness_in_config": cfg(loudness=2.0),
        "pace_1.5": cfg(pace=1.5),
        "codec_flac": cfg(output_audio_codec="flac"),
        "codec_mp3": cfg(output_audio_codec="mp3"),
        "no_voice": json.dumps({"type": "config", "data": {"target_language_code": "ta-IN"}}),
        "model_param": cfg(model="bulbul:v4-flash"),
    }
    for name, c in checks.items():
        try:
            ws = await connect()
            await ws.send(c)
            r = await utter(ws, "நன்றி.", timeout=15)
            R[name] = {k: v for k, v in r.items() if k != "audio"}
            R[name]["audio_bytes"] = len(r["audio"])
            try:
                await ws.close()
            except Exception:
                pass
        except Exception as e:
            R[name] = {"exception": scrub(repr(e))[:300]}
        out("CHECK", name, json.dumps(R[name], ensure_ascii=False)[:700])

    # subprotocol auth
    try:
        ws = await connect(sub=True)
        await ws.send(cfg())
        r = await utter(ws, "நன்றி.")
        R["subprotocol"] = {"ok": True, "ttfa_real_ms": r["ttfa_real_ms"], "types": r["types"]}
        await ws.close()
    except Exception as e:
        R["subprotocol"] = {"ok": False, "exception": scrub(repr(e))[:300]}
    out("SUBPROTOCOL", json.dumps(R["subprotocol"]))

    with open(os.path.join(HERE, "out", "p05d_results.json"), "w", encoding="utf-8") as f:
        json.dump(R, f, ensure_ascii=False, indent=1, default=str)


asyncio.run(main())
