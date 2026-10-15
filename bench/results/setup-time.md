# Setup time, fresh clone

Measured 2026-10-15 about 09:10 IST on the development machine (Windows 11, Node 25.2.1, home connection in India), npm cache warm.

| Step | Seconds |
|---|---|
| `git clone https://github.com/Anandb71/kanth` | 5 |
| `npm install` (73 packages) | 4 |
| `npm start` until `/api/status` answered (includes the Vite build) | 2 |
| **Total** | **11** |

Then a WebSocket synth request on the fresh clone returned audio with 450 ms to first audio on a cold socket. A machine with a cold npm cache will take longer to install.

## Second measurement, after the demo film was added to the repo

2026-10-15 about 13:05 IST, same machine, warm npm cache: clone, `npm install` (73 packages, 4 s), `npm start` and the first `/api/status` answer took **34 s** in total. The clone is larger because `docs/media` holds the 6 MB film. The fresh clone then spoke a Tamil sentence with 409 ms to first audio, and refused a WebSocket from a foreign origin with HTTP 403.
