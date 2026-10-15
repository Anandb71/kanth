"""Scan research/ (excluding .venv) for the API key value. Prints only file names that contain it, never the key."""
import os

from common import KEY, RESEARCH

hits = []
n = 0
for root, dirs, files in os.walk(RESEARCH):
    dirs[:] = [d for d in dirs if d != ".venv"]
    for fn in files:
        p = os.path.join(root, fn)
        try:
            with open(p, "rb") as f:
                data = f.read()
        except OSError:
            continue
        n += 1
        if KEY.encode() in data:
            hits.append(p)
print(f"scanned {n} files; files containing the key: {len(hits)}")
for h in hits:
    print("  LEAK:", h)
