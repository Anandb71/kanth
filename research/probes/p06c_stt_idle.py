"""Realtime STT WebSocket idle behaviour: connect and send nothing; does a JSON ping keep it alive?
Case A: no messages at all -> when/how does the server close?
Case B: {"event":"ping"} every 10 s for 70 s -> pong replies? still open?
"""
import asyncio
import json
import os
import time

import common  # noqa: F401
import websockets
import websockets.asyncio.client

from common import HERE, KEY, out

URL = "wss://api.sarvam.ai/speech-to-text-realtime/ws?language_code=ta-IN&stream_type=fast"
R = {}


async def case_a(limit=180):
    ws = await websockets.asyncio.client.connect(URL, additional_headers={"api-subscription-key": KEY})
    t0 = time.perf_counter()
    msgs = []
    try:
        while True:
            raw = await asyncio.wait_for(ws.recv(), timeout=limit)
            msgs.append({"t_s": round(time.perf_counter() - t0, 1), "msg": json.loads(raw)})
    except websockets.ConnectionClosed as e:
        R["no_messages"] = {"closed_after_s": round(time.perf_counter() - t0, 1), "code": e.rcvd.code if e.rcvd else None,
                            "reason": e.rcvd.reason if e.rcvd else None, "msgs": msgs}
    except asyncio.TimeoutError:
        R["no_messages"] = {"still_open_after_s": limit, "msgs": msgs}
    out("A", json.dumps(R["no_messages"], ensure_ascii=False))


async def case_b(total=70, every=10):
    ws = await websockets.asyncio.client.connect(URL, additional_headers={"api-subscription-key": KEY})
    t0 = time.perf_counter()
    msgs = []
    alive = True
    while time.perf_counter() - t0 < total:
        await ws.send(json.dumps({"event": "ping"}))
        try:
            end = time.perf_counter() + every
            while time.perf_counter() < end:
                raw = await asyncio.wait_for(ws.recv(), timeout=max(0.1, end - time.perf_counter()))
                msgs.append({"t_s": round(time.perf_counter() - t0, 1), "msg": json.loads(raw)})
        except asyncio.TimeoutError:
            pass
        except websockets.ConnectionClosed as e:
            alive = False
            msgs.append({"closed": e.rcvd.code if e.rcvd else None, "reason": e.rcvd.reason if e.rcvd else None, "t_s": round(time.perf_counter() - t0, 1)})
            break
    R["json_ping_every_10s"] = {"alive_after_s": round(time.perf_counter() - t0, 1), "alive": alive, "msgs": msgs[:12]}
    out("B", json.dumps(R["json_ping_every_10s"], ensure_ascii=False))
    if alive:
        await ws.send(json.dumps({"event": "end"}))
        try:
            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout=5)
                out("B end:", raw[:300])
        except Exception:
            pass


async def main():
    await asyncio.gather(case_a(), case_b())
    with open(os.path.join(HERE, "out", "p06c_results.json"), "w", encoding="utf-8") as f:
        json.dump(R, f, ensure_ascii=False, indent=1)


asyncio.run(main())
