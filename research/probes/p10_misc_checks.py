"""Small doc-vs-reality checks.
1. TTS WS with no ?model= : which model does the server use? (error lists speakers for the resolved model)
2. TTS REST with language_code=as-IN (Assamese personas exist in the live roster)
3. TTS REST with no model: which model? (invalid speaker error names it)
4. GET /v2/models without an API key (docs: unauthenticated)
"""
import asyncio
import json

import common  # noqa: F401
import websockets.asyncio.client

from common import KEY, body_text, out, post_json, request
import http.client
import ssl


async def ws_default_model():
    ws = await websockets.asyncio.client.connect("wss://api.sarvam.ai/text-to-speech/ws", additional_headers={"api-subscription-key": KEY})
    await ws.send(json.dumps({"type": "config", "data": {"speaker": "zz_none", "language_code": "hi-IN"}}))
    await ws.send(json.dumps({"type": "text", "data": {"text": "नमस्ते।"}}))
    await ws.send(json.dumps({"type": "flush"}))
    m = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
    msg = (m.get("data") or {}).get("message", "")
    out("WS no ?model ->", m.get("type"), msg[:160])
    try:
        await ws.close()
    except Exception:
        pass


asyncio.run(ws_default_model())

r = post_json("/text-to-speech", {"text": "নমস্কাৰ", "language_code": "as-IN", "model": "bulbul:v4-flash", "speaker": "kangkana_as_conversational"})
out("REST as-IN ->", r.status, body_text(r, 400) if r.status != 200 else "200 audio")

r = post_json("/text-to-speech", {"text": "नमस्ते", "language_code": "hi-IN", "speaker": "zz_none"})
out("REST no model ->", r.status, body_text(r, 200))

c = http.client.HTTPSConnection("api.sarvam.ai", 443, context=ssl.create_default_context())
c.request("GET", "/v2/models")
resp = c.getresponse()
out("GET /v2/models without key ->", resp.status, resp.read()[:300].decode("utf-8", "replace"))
c.close()
