"""Saaras streaming STT over WebSocket, fed with Bulbul-generated 16 kHz WAVs in real time.

Realtime: wss://api.sarvam.ai/speech-to-text-realtime/ws?language_code=..&model=..&stream_type=..
Legacy:   wss://api.sarvam.ai/speech-to-text/ws?language-code=..&model=..&vad_signals=true

Latency reported = time from sending the LAST chunk of the file's audio (real-time paced) to the
`transcript.final` (realtime) / `data` (legacy) message. After the file we keep sending silence
(real-time paced) so server VAD can close the turn.
Usage: python p06b_stt_ws.py [case ...]
"""
import asyncio
import base64
import json
import os
import sys
import time
import urllib.parse
import wave

import common  # noqa: F401
import websockets
import websockets.asyncio.client

from common import HERE, KEY, out, scrub

CHUNK_MS = 100
R = {}


def pcm16k(rel):
    with wave.open(os.path.join(HERE, *rel.split("/")), "rb") as w:
        assert w.getframerate() == 16000 and w.getnchannels() == 1 and w.getsampwidth() == 2, (w.getframerate(), w.getnchannels())
        return w.readframes(w.getnframes())


async def connect(url, sub=False):
    if sub:
        return await websockets.asyncio.client.connect(url, subprotocols=[f"api-subscription-key.{KEY}"], max_size=None, open_timeout=20)
    return await websockets.asyncio.client.connect(url, additional_headers={"api-subscription-key": KEY}, max_size=None, open_timeout=20)


async def realtime(name, rel, params, manual=False, sub=False, silence_s=2.5, end=True):
    url = "wss://api.sarvam.ai/speech-to-text-realtime/ws?" + urllib.parse.urlencode(params)
    pcm = pcm16k(rel)
    step = 16000 * 2 * CHUNK_MS // 1000
    events = []
    t_audio_end = None
    t0 = time.perf_counter()
    try:
        ws = await connect(url, sub=sub)
    except Exception as e:
        R[name] = {"connect_error": scrub(repr(e))[:400]}
        out(name, R[name])
        return
    t_conn = time.perf_counter() - t0

    async def sender():
        nonlocal t_audio_end
        if manual:
            await ws.send(json.dumps({"event": "speech_start"}))
        start = time.perf_counter()
        n = 0
        for i in range(0, len(pcm), step):
            await ws.send(json.dumps({"event": "audio_input", "audio": base64.b64encode(pcm[i:i + step]).decode()}))
            n += 1
            await asyncio.sleep(max(0, start + n * CHUNK_MS / 1000 - time.perf_counter()))
        t_audio_end = time.perf_counter()
        if manual:
            await ws.send(json.dumps({"event": "speech_end"}))
        else:
            sil = b"\x00" * step
            for k in range(int(silence_s * 1000 / CHUNK_MS)):
                await ws.send(json.dumps({"event": "audio_input", "audio": base64.b64encode(sil).decode()}))
                n += 1
                await asyncio.sleep(max(0, start + n * CHUNK_MS / 1000 - time.perf_counter()))
        if end:
            await ws.send(json.dumps({"event": "end"}))

    async def receiver():
        try:
            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout=20)
                m = json.loads(raw)
                tt = time.perf_counter()
                m["_t_since_audio_end_ms"] = round((tt - t_audio_end) * 1000) if t_audio_end else None
                m["_t_since_start_ms"] = round((tt - t0) * 1000)
                events.append(m)
                if m.get("event") == "session.end":
                    break
                if m.get("event") == "error" and m.get("is_fatal"):
                    break
        except websockets.ConnectionClosed as e:
            events.append({"_closed": e.rcvd.code if e.rcvd else None, "_reason": e.rcvd.reason if e.rcvd else None})
        except asyncio.TimeoutError:
            events.append({"_timeout": True})

    await asyncio.gather(sender(), receiver())
    try:
        await ws.close()
    except Exception:
        pass
    finals = [e for e in events if e.get("event") == "transcript.final"]
    partials = [e for e in events if e.get("event") == "transcript.partial"]
    vad_end = [e for e in events if e.get("event") == "vad.speech_end"]
    R[name] = {"url_params": params, "manual": manual, "subprotocol": sub, "connect_ms": round(t_conn * 1000),
               "audio_s": round(len(pcm) / 32000, 2),
               "event_sequence": [e.get("event") or ("closed" if "_closed" in e else "timeout") for e in events],
               "session_begin": next((e for e in events if e.get("event") == "session.begin"), None),
               "first_partial": partials[0] if partials else None, "n_partials": len(partials),
               "vad_speech_end": vad_end[0] if vad_end else None,
               "finals": finals, "session_end": next((e for e in events if e.get("event") == "session.end"), None),
               "errors": [e for e in events if e.get("event") == "error" or "_closed" in e],
               "final_latency_after_audio_end_ms": finals[0]["_t_since_audio_end_ms"] if finals else None}
    out("==", name, json.dumps(R[name], ensure_ascii=False)[:2500])


async def legacy(name, rel, params):
    url = "wss://api.sarvam.ai/speech-to-text/ws?" + urllib.parse.urlencode(params)
    pcm = pcm16k(rel)
    step = 16000 * 2 * CHUNK_MS // 1000
    events = []
    t_audio_end = None
    try:
        ws = await connect(url)
    except Exception as e:
        R[name] = {"connect_error": scrub(repr(e))[:400]}
        out(name, R[name])
        return

    async def sender():
        nonlocal t_audio_end
        start = time.perf_counter()
        n = 0
        sil = b"\x00" * step
        for i in range(0, len(pcm), step):
            await ws.send(json.dumps({"audio": {"data": base64.b64encode(pcm[i:i + step]).decode(), "sample_rate": "16000", "encoding": "audio/wav"}}))
            n += 1
            await asyncio.sleep(max(0, start + n * CHUNK_MS / 1000 - time.perf_counter()))
        t_audio_end = time.perf_counter()
        for k in range(25):
            await ws.send(json.dumps({"audio": {"data": base64.b64encode(sil).decode(), "sample_rate": "16000", "encoding": "audio/wav"}}))
            n += 1
            await asyncio.sleep(max(0, start + n * CHUNK_MS / 1000 - time.perf_counter()))

    async def receiver():
        try:
            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout=8)
                m = json.loads(raw)
                m["_t_since_audio_end_ms"] = round((time.perf_counter() - t_audio_end) * 1000) if t_audio_end else None
                events.append(m)
                if m.get("type") == "data":
                    break
        except websockets.ConnectionClosed as e:
            events.append({"_closed": e.rcvd.code if e.rcvd else None, "_reason": e.rcvd.reason if e.rcvd else None})
        except asyncio.TimeoutError:
            events.append({"_timeout": True})

    await asyncio.gather(sender(), receiver())
    try:
        await ws.close()
    except Exception:
        pass
    R[name] = {"url_params": params, "events": events}
    out("==", name, json.dumps(R[name], ensure_ascii=False)[:2500])


TA = "out/tts/vijay_ta_narration__ta.wav"      # Tamil, 4.0 s
TA_F = "out/tts/aparna_hi_customer__ta.wav"     # Tamil, 3.4 s, female voice
MIX = "out/tts/hinglish_mix.wav"                # Hinglish, ~3.9 s

CASES = {
    "rt_v3_ta_balanced": lambda: realtime("rt_v3_ta_balanced", TA, {"language_code": "ta-IN"}),
    "rt_v3_ta_fast": lambda: realtime("rt_v3_ta_fast", TA, {"language_code": "ta-IN", "stream_type": "fast"}),
    "rt_v4_ta_fast": lambda: realtime("rt_v4_ta_fast", TA, {"language_code": "ta-IN", "model": "saaras:v4", "stream_type": "fast"}),
    "rt_v4_ta_fast_2": lambda: realtime("rt_v4_ta_fast_2", TA_F, {"language_code": "ta-IN", "model": "saaras:v4", "stream_type": "fast"}),
    "rt_v3_ta_fast_2": lambda: realtime("rt_v3_ta_fast_2", TA_F, {"language_code": "ta-IN", "stream_type": "fast"}),
    "rt_auto_mix": lambda: realtime("rt_auto_mix", MIX, {"language_code": "auto", "stream_type": "fast"}),
    "rt_auto_ta": lambda: realtime("rt_auto_ta", TA, {"language_code": "auto", "model": "saaras:v4", "stream_type": "fast"}),
    "rt_mix_codemix": lambda: realtime("rt_mix_codemix", MIX, {"language_code": "hi-IN", "model": "saaras:v4", "stream_type": "fast", "mode": "codemix"}),
    "rt_silence300": lambda: realtime("rt_silence300", TA, {"language_code": "ta-IN", "model": "saaras:v4", "stream_type": "fast", "silence_duration_ms": 300}),
    "rt_explicit_v3rt": lambda: realtime("rt_explicit_v3rt", TA, {"language_code": "ta-IN", "model": "saaras:v3-realtime", "stream_type": "fast"}),
    "rt_silence600": lambda: realtime("rt_silence600", TA, {"language_code": "ta-IN", "model": "saaras:v4", "stream_type": "fast", "silence_duration_ms": 600}),
    "rt_simulated": lambda: realtime("rt_simulated", TA, {"language_code": "ta-IN", "model": "saaras:v4", "stream_type": "simulated"}),
    "rt_manual": lambda: realtime("rt_manual", TA, {"language_code": "ta-IN", "model": "saaras:v4", "stream_type": "fast", "endpointing": "manual"}, manual=True),
    "rt_subprotocol": lambda: realtime("rt_subprotocol", TA, {"language_code": "ta-IN", "stream_type": "fast"}, sub=True),
    "rt_bad_rate": lambda: realtime("rt_bad_rate", TA, {"language_code": "ta-IN", "sample_rate": 22050}),
    "rt_unknown_lang": lambda: realtime("rt_unknown_lang", TA, {"language_code": "unknown"}),
    "legacy_v4_ta": lambda: legacy("legacy_v4_ta", TA, {"language-code": "ta-IN", "model": "saaras:v4", "vad_signals": "true"}),
    "legacy_unknown": lambda: legacy("legacy_unknown", MIX, {"language-code": "unknown", "model": "saaras:v4", "vad_signals": "true"}),
}


async def main(names):
    for n in names:
        try:
            await CASES[n]()
        except Exception as e:
            R[n] = {"exception": scrub(repr(e))[:500]}
            out("FAILED", n, R[n])
    tag = names[0] if len(names) == 1 else "batch_" + str(int(time.time()))
    with open(os.path.join(HERE, "out", f"p06b_{tag}.json"), "w", encoding="utf-8") as f:
        json.dump(R, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:] or ["rt_v3_ta_balanced"]))
