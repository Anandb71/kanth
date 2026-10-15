"""Shared helpers for Sarvam API probes.

Reads SARVAM_API_KEY from kanth/.env. Never prints or writes the key; every
string that is printed through `out()` is scrubbed of the key first.
"""
import http.client
import json
import os
import ssl
import sys
import time
import uuid

def lp(p):
    """Long-path-safe absolute path on Windows (this tree is deeper than MAX_PATH)."""
    p = os.path.abspath(p)
    if os.name == "nt" and not p.startswith("\\\\?\\"):
        return "\\\\?\\" + p
    return p


HERE = lp(os.path.dirname(os.path.abspath(__file__)))
RESEARCH = os.path.dirname(HERE)
ROOT = os.path.dirname(RESEARCH)
HOST = "api.sarvam.ai"

# The venv's site-packages sits deeper than MAX_PATH on this machine, so make it
# importable through a \\?\ long-path entry (needed for `websockets`).
_SP = os.path.join(RESEARCH, ".venv", "Lib", "site-packages")
if os.path.isdir(_SP) and _SP not in sys.path:
    sys.path.insert(0, _SP)


def _load_key():
    path = os.path.join(ROOT, ".env")
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("SARVAM_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("SARVAM_API_KEY not found in .env")


KEY = _load_key()


def scrub(s):
    if not isinstance(s, str):
        s = str(s)
    return s.replace(KEY, "<redacted>")


def out(*args):
    msg = " ".join(scrub(a) for a in args)
    try:
        sys.stdout.write(msg + "\n")
    except UnicodeEncodeError:
        sys.stdout.buffer.write((msg + "\n").encode("utf-8", "replace"))
    sys.stdout.flush()


def _conn():
    return http.client.HTTPSConnection(HOST, 443, timeout=120, context=ssl.create_default_context())


class Timed:
    """Result of an HTTP call with timings (seconds, relative to request send)."""

    def __init__(self):
        self.status = None
        self.headers = {}
        self.body = b""
        self.t_headers = None
        self.t_first_byte = None
        self.t_done = None
        self.chunks = []  # (t, nbytes)


def request(method, path, body=None, headers=None, conn=None, stream=False, read_size=1024):
    """Make an HTTPS request. If conn is given it is reused (warm connection).

    Returns Timed. t_* are measured from just before the request is sent.
    """
    h = {"api-subscription-key": KEY}
    if headers:
        h.update(headers)
    own = conn is None
    c = conn or _conn()
    if own:
        for attempt in range(3):  # retry transient TLS/connect resets (seen once on Windows)
            try:
                c.connect()
                break
            except (ConnectionResetError, ssl.SSLError, TimeoutError):
                c.close()
                time.sleep(1 + attempt)
                c = _conn()
    t0 = time.perf_counter()
    c.request(method, path, body=body, headers=h)
    r = c.getresponse()
    res = Timed()
    res.t_headers = time.perf_counter() - t0
    res.status = r.status
    res.headers = {k.lower(): v for k, v in r.getheaders()}
    buf = bytearray()
    while True:
        chunk = r.read1(read_size) if stream else r.read()
        if not chunk:
            break
        t = time.perf_counter() - t0
        if res.t_first_byte is None:
            res.t_first_byte = t
        res.chunks.append((t, len(chunk)))
        buf.extend(chunk)
        if not stream:
            break
    res.t_done = time.perf_counter() - t0
    res.body = bytes(buf)
    if own:
        c.close()
    return res


def post_json(path, payload, conn=None, stream=False, extra_headers=None):
    hdrs = {"Content-Type": "application/json"}
    if extra_headers:
        hdrs.update(extra_headers)
    return request("POST", path, json.dumps(payload).encode("utf-8"), hdrs, conn=conn, stream=stream)


def multipart(fields, files):
    """fields: dict name->str ; files: dict name->(filename, bytes, content_type)."""
    boundary = "----kanth" + uuid.uuid4().hex
    parts = []
    for k, v in fields.items():
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n".encode() + str(v).encode("utf-8") + b"\r\n")
    for k, (fn, data, ct) in files.items():
        parts.append(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"; filename=\"{fn}\"\r\nContent-Type: {ct}\r\n\r\n".encode()
            + data
            + b"\r\n"
        )
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def post_multipart(path, fields, files=None, conn=None, stream=False):
    body, ct = multipart(fields, files or {})
    return request("POST", path, body, {"Content-Type": ct}, conn=conn, stream=stream)


def body_text(res, limit=3000):
    try:
        t = res.body.decode("utf-8")
    except UnicodeDecodeError:
        return f"<{len(res.body)} binary bytes>"
    return scrub(t[:limit])


def save(path_rel, data):
    p = os.path.join(HERE, path_rel)
    with open(p, "wb") as f:
        f.write(data)
    return p


def wav_info(data):
    """Parse a RIFF/WAVE header; returns dict or None."""
    import struct

    if len(data) < 44 or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        return None
    i = 12
    info = {}
    while i + 8 <= len(data):
        cid = data[i : i + 4]
        size = struct.unpack("<I", data[i + 4 : i + 8])[0]
        if cid == b"fmt ":
            fmt, ch, sr, br, ba, bps = struct.unpack("<HHIIHH", data[i + 8 : i + 24])
            info.update(format=fmt, channels=ch, sample_rate=sr, bits=bps)
        elif cid == b"data":
            info["data_size_header"] = size
            info["data_offset"] = i + 8
            avail = len(data) - (i + 8)
            n = avail if size in (0, 0xFFFFFFFF) or size > avail else size
            if info.get("sample_rate"):
                info["duration_s"] = round(n / (info["sample_rate"] * info["channels"] * info["bits"] / 8), 3)
            break
        i += 8 + size + (size & 1)
    return info


def median(xs):
    s = sorted(xs)
    n = len(s)
    if n == 0:
        return None
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2
