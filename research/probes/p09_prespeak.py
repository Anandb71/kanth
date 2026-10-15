"""Kanth-specific probes.

(a) Tone dial over WebSocket: on ONE socket, swap config (pitch / loudness / pace) between utterances and
    save each result so p03b_analyze_audio.py can verify the change actually lands mid-connection.
(b) "Prespeak" strategies: time until all 4 reply candidates are fully synthesized
    - 4 parallel REST /text-to-speech calls
    - 4 utterances queued on one warm WebSocket
    - 4 parallel WebSocket connections (each warm)
    - 4 parallel /voices/clone calls (cloned voice), if a voice_id is given
Usage: python p09_prespeak.py [voice_id]
"""
import asyncio
import base64
import json
import os
import sys
import time

import common  # noqa: F401
import websockets
import websockets.asyncio.client

from common import HERE, KEY, median, out, post_json, post_multipart

REPLIES = ["ஆமா, சாப்பிட்டேன்.", "இன்னும் சாப்பிடல.", "நீ சாப்பிட்டியா?", "பசிக்குது, சாப்பிடுறேன்."]
SPEAKER = "aparna_hi_customer"  # female persona speaking Tamil (no Tamil-native female persona exists)
VOICE = sys.argv[1] if len(sys.argv) > 1 else None
OUT = os.path.join(HERE, "out", "tone_ws")
os.makedirs(OUT, exist_ok=True)
URL = "wss://api.sarvam.ai/text-to-speech/ws?model=bulbul:v4-flash&send_completion_event=true"
R = {}


async def ws_connect():
    return await websockets.asyncio.client.connect(URL, additional_headers={"api-subscription-key": KEY}, max_size=None)


def cfg(**kw):
    d = {"speaker": SPEAKER, "language_code": "ta-IN", "output_audio_codec": "linear16", "speech_sample_rate": 16000}
    d.update(kw)
    return json.dumps({"type": "config", "data": d})


async def ws_utter(ws, text):
    t0 = time.perf_counter()
    await ws.send(json.dumps({"type": "text", "data": {"text": text}}))
    await ws.send(json.dumps({"type": "flush"}))
    pcm = bytearray()
    first = None
    while True:
        m = json.loads(await asyncio.wait_for(ws.recv(), timeout=20))
        if m["type"] == "audio":
            if first is None:
                first = time.perf_counter() - t0
            pcm.extend(base64.b64decode(m["data"]["audio"]))
        elif m["type"] == "event":
            return bytes(pcm), first, time.perf_counter() - t0
        elif m["type"] == "error":
            raise RuntimeError(m)


def save_wav(path, pcm, sr=16000):
    import wave
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm)


async def tone_dial():
    text = "நான் நல்லா இருக்கேன், நீங்க எப்படி இருக்கீங்க? இன்னைக்கு வானிலை ரொம்ப நல்லா இருக்கு."
    ws = await ws_connect()
    res = {}
    for label, kw in [("base", {}), ("pitch_-0.5", {"pitch": -0.5}), ("pitch_+0.5", {"pitch": 0.5}), ("loud_0.5", {"loudness": 0.5}),
                      ("loud_2.0", {"loudness": 2.0}), ("pace_0.7", {"pace": 0.7}), ("pace_1.5", {"pace": 1.5}), ("base_again", {})]:
        await ws.send(cfg(**kw))
        pcm, first, total = await ws_utter(ws, text)
        save_wav(os.path.join(OUT, f"{label}.wav"), pcm)
        res[label] = {"ttfa_ms": round(first * 1000), "total_ms": round(total * 1000), "dur_s": round(len(pcm) / 32000, 2)}
        out("TONE", label, res[label])
    await ws.close()
    R["tone_dial_ws"] = res


def rest_one(text):
    r = post_json("/text-to-speech", {"text": text, "language_code": "ta-IN", "model": "bulbul:v4-flash", "speaker": SPEAKER, "speech_sample_rate": 16000})
    return r.status, r.t_done


async def prespeak_rest():
    loop = asyncio.get_running_loop()
    t0 = time.perf_counter()
    res = await asyncio.gather(*[loop.run_in_executor(None, rest_one, t) for t in REPLIES])
    return {"all_done_ms": round((time.perf_counter() - t0) * 1000), "each_ms": [round(t * 1000) for s, t in res], "statuses": [s for s, t in res]}


async def prespeak_ws_queue(ws):
    t0 = time.perf_counter()
    firsts = []
    for t in REPLIES:
        pcm, first, total = await ws_utter(ws, t)
        firsts.append(round((time.perf_counter() - t0) * 1000))
    return {"all_done_ms": round((time.perf_counter() - t0) * 1000), "cumulative_done_ms": firsts}


async def prespeak_ws_parallel(socks):
    t0 = time.perf_counter()
    res = await asyncio.gather(*[ws_utter(s, t) for s, t in zip(socks, REPLIES)])
    return {"all_done_ms": round((time.perf_counter() - t0) * 1000), "ttfa_ms": [round(f * 1000) for _, f, _ in res], "each_total_ms": [round(x * 1000) for _, _, x in res]}


def clone_one(text):
    r = post_multipart("/voices/clone", {"voice_id": VOICE, "text": text, "language_code": "ta-IN", "output_audio_codec": "wav", "speech_sample_rate": "16000"})
    return r.status, r.t_done


async def prespeak_clone():
    loop = asyncio.get_running_loop()
    t0 = time.perf_counter()
    res = await asyncio.gather(*[loop.run_in_executor(None, clone_one, t) for t in REPLIES])
    return {"all_done_ms": round((time.perf_counter() - t0) * 1000), "each_ms": [round(t * 1000) for s, t in res], "statuses": [s for s, t in res]}


async def main():
    await tone_dial()
    # (b) prespeak, 3 rounds each
    rest = [await prespeak_rest() for _ in range(3)]
    out("PRESPEAK rest", rest)
    ws = await ws_connect()
    await ws.send(cfg(output_audio_codec="wav"))
    await ws_utter(ws, "சரி.")  # warm-up
    q = [await prespeak_ws_queue(ws) for _ in range(3)]
    await ws.close()
    out("PRESPEAK ws_queue", q)
    socks = [await ws_connect() for _ in range(4)]
    for s in socks:
        await s.send(cfg(output_audio_codec="wav"))
    await asyncio.gather(*[ws_utter(s, "சரி.") for s in socks])  # warm-up
    p = [await prespeak_ws_parallel(socks) for _ in range(3)]
    for s in socks:
        await s.close()
    out("PRESPEAK ws_parallel", p)
    R["prespeak"] = {"rest_parallel_4": rest, "median_rest_all_done_ms": median([x["all_done_ms"] for x in rest]),
                     "ws_one_socket_queue_4": q, "median_ws_queue_all_done_ms": median([x["all_done_ms"] for x in q]),
                     "ws_4_sockets_parallel": p, "median_ws_parallel_all_done_ms": median([x["all_done_ms"] for x in p])}
    if VOICE:
        c = [await prespeak_clone() for _ in range(2)]
        out("PRESPEAK clone_parallel", c)
        R["prespeak"]["clone_rest_parallel_4"] = c
    with open(os.path.join(HERE, "out", "p09_results.json"), "w", encoding="utf-8") as f:
        json.dump(R, f, ensure_ascii=False, indent=1)


asyncio.run(main())
