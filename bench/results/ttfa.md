# Time to first audio (TTFA), Bulbul

Measured on a home connection in India, 2026-10-15 07:36–07:40 IST. 228 of 228 planned calls succeeded.

**Measurement conditions.** One Windows laptop on a home connection in India; Node v25.2.1. Calls ran strictly one at a time from this bench, shuffled with a fixed seed (20261015), at least 1 s apart. Two other agents may have been calling the Sarvam API from the same machine and account at the same time, so some runs may include their load.

**What TTFA means here.** Wall-clock time from just before the client call (the same functions the app uses: `synthRest`, `synthHttpStream`, `TtsEngine` in server/bulbul.ts; `synthClone` in server/clone.ts) until the first non-empty PCM chunk reaches the playback sink. For REST it is the full response, because REST returns all audio at once. WebSocket warm: a socket opened before the run, plus 2 unrecorded warm-up utterances per model. WebSocket cold: a new socket per call, so TTFA includes the connection; the connect time is also reported on its own. Clone REST: POST /voices/clone (base64 WAV in JSON).

Texts (Warm preset: pace 0.95, pitch 0, loudness 1; v3 receives pace only):

- `ta` ta-IN, 39 chars, v4 Flash `vijay_ta_narration`, v3 `vijay`: அம்மா, எனக்கு கொஞ்சம் தண்ணீர் வேண்டும்.
- `hi` hi-IN, 50 chars, v4 Flash `shubh_hi_customer`, v3 `shubh`: मुझे थोड़ा rest चाहिए, doctor को बाद में call करो।
- `en` en-IN, 41 chars, v4 Flash `shubh_en_narration`, v3 `shubh`: I'm a bit tired. Can we talk after lunch?
- Clone: banked voice from a Bulbul-generated reference clip (no real person), same three texts.

## All languages pooled (ms), sorted by p50

| Condition | n | p50 | p90 | mean | min | max | total p50 | failed |
|---|---|---|---|---|---|---|---|---|
| v3 · WebSocket, warm | 30 | 244 | 253 | 246 | 239 | 261 | 527 | 0 |
| v3 · HTTP stream | 30 | 273 | 316 | 283 | 260 | 376 | 566 | 0 |
| V4 Flash · WebSocket, warm | 30 | 304 | 317 | 397 | 292 | 3002 | 600 | 0 |
| V4 Flash · HTTP stream | 30 | 322 | 356 | 329 | 304 | 446 | 638 | 0 |
| v3 · WebSocket, cold | 12 | 393 | 433 | 408 | 377 | 540 | 630 | 0 |
| V4 Flash · WebSocket, cold | 12 | 457 | 557 | 490 | 421 | 801 | 777 | 0 |
| v3 · REST | 30 | 661 | 776 | 674 | 568 | 850 | 661 | 0 |
| V4 Flash · REST | 30 | 710 | 852 | 741 | 616 | 1024 | 710 | 0 |
| Clone · HTTP stream | 12 | 1643 | 1753 | 1624 | 1419 | 1794 | 1715 | 0 |
| Clone · REST | 12 | 1670 | 2146 | 1757 | 1331 | 2219 | 1670 | 0 |

## Cold WebSocket: connection vs first audio (ms)

| Condition | n | connect p50 | connect p90 | connect min–max | first audio after connect p50 | TTFA p50 |
|---|---|---|---|---|---|---|
| V4 Flash · WebSocket, cold | 12 | 121 | 237 | 103–410 | 329 | 457 |
| v3 · WebSocket, cold | 12 | 112 | 142 | 103–264 | 276 | 393 |

## Tamil (ta-IN) (ms)

| Condition | n | p50 | p90 | mean | min | max |
|---|---|---|---|---|---|---|
| v3 · WebSocket, warm | 10 | 242 | 247 | 243 | 240 | 248 |
| v3 · HTTP stream | 10 | 269 | 356 | 286 | 260 | 376 |
| V4 Flash · WebSocket, warm | 10 | 299 | 307 | 300 | 292 | 311 |
| V4 Flash · HTTP stream | 10 | 321 | 335 | 321 | 308 | 339 |
| v3 · WebSocket, cold | 4 | 381 | 384 | 381 | 377 | 384 |
| V4 Flash · WebSocket, cold | 4 | 442 | 464 | 443 | 421 | 466 |
| v3 · REST | 10 | 660 | 775 | 684 | 629 | 821 |
| V4 Flash · REST | 10 | 710 | 746 | 717 | 687 | 770 |
| Clone · HTTP stream | 4 | 1591 | 1702 | 1612 | 1532 | 1734 |
| Clone · REST | 4 | 1494 | 1664 | 1505 | 1331 | 1699 |

## Hindi with English words (hi-IN) (ms)

| Condition | n | p50 | p90 | mean | min | max |
|---|---|---|---|---|---|---|
| v3 · WebSocket, warm | 10 | 245 | 252 | 247 | 239 | 261 |
| v3 · HTTP stream | 10 | 278 | 316 | 289 | 266 | 359 |
| V4 Flash · WebSocket, warm | 10 | 306 | 589 | 576 | 299 | 3002 |
| V4 Flash · HTTP stream | 10 | 315 | 363 | 332 | 304 | 446 |
| v3 · WebSocket, cold | 4 | 406 | 503 | 434 | 385 | 540 |
| V4 Flash · WebSocket, cold | 4 | 524 | 730 | 570 | 432 | 801 |
| v3 · REST | 10 | 664 | 782 | 683 | 598 | 850 |
| V4 Flash · REST | 10 | 641 | 684 | 651 | 616 | 690 |
| Clone · HTTP stream | 4 | 1661 | 1756 | 1652 | 1489 | 1794 |
| Clone · REST | 4 | 2119 | 2199 | 2025 | 1641 | 2219 |

## English (en-IN) (ms)

| Condition | n | p50 | p90 | mean | min | max |
|---|---|---|---|---|---|---|
| v3 · WebSocket, warm | 10 | 245 | 254 | 247 | 240 | 254 |
| v3 · HTTP stream | 10 | 272 | 282 | 273 | 264 | 283 |
| V4 Flash · WebSocket, warm | 10 | 306 | 323 | 314 | 301 | 378 |
| V4 Flash · HTTP stream | 10 | 323 | 376 | 333 | 308 | 402 |
| v3 · WebSocket, cold | 4 | 407 | 428 | 410 | 391 | 435 |
| V4 Flash · WebSocket, cold | 4 | 455 | 474 | 456 | 434 | 481 |
| v3 · REST | 10 | 656 | 717 | 656 | 568 | 786 |
| V4 Flash · REST | 10 | 841 | 965 | 855 | 744 | 1024 |
| Clone · HTTP stream | 4 | 1630 | 1737 | 1609 | 1419 | 1756 |
| Clone · REST | 4 | 1748 | 1924 | 1742 | 1527 | 1942 |

## Against Sarvam's stated figure

Sarvam describes Bulbul V4 Flash as reaching first audio in under 250 ms. Client-side, from this connection (TTFA here includes the network round trip from India to the API, which a server-side figure may not):

- V4 Flash · REST: 0 of 30 calls under 250 ms (fastest 616 ms).
- V4 Flash · HTTP stream: 0 of 30 calls under 250 ms (fastest 304 ms).
- V4 Flash · WebSocket, warm: 0 of 30 calls under 250 ms (fastest 292 ms).
- v3 · REST: 0 of 30 calls under 250 ms (fastest 568 ms).
- v3 · HTTP stream: 0 of 30 calls under 250 ms (fastest 260 ms).
- v3 · WebSocket, warm: 23 of 30 calls under 250 ms (fastest 239 ms).
- V4 Flash · WebSocket, cold: 0 of 12 calls under 250 ms (fastest 421 ms).
- v3 · WebSocket, cold: 0 of 12 calls under 250 ms (fastest 377 ms).
- Clone · HTTP stream: 0 of 12 calls under 250 ms (fastest 1419 ms).
- Clone · REST: 0 of 12 calls under 250 ms (fastest 1331 ms).

## Failures, retries, anomalies

- Failed calls (after up to 4 attempts with 1/2/4 s backoff on 429, 5xx and network errors): 0. Calls that succeeded only on a retry: 0.
- V4 Flash · WebSocket, warm: calls where the warm socket had closed before the call: 0.
- v3 · WebSocket, warm: calls where the warm socket had closed before the call: 0.
- Outlier: V4 Flash · WebSocket, warm, hi run 8 (trial 114, 2026-10-15T02:08:51.033Z): TTFA 3002 ms, total 3024 ms, over ws (socket already open: True). It is kept in the stats; it moves the mean, not the p50/p90.
- No network outage was detected during this run.
- Warm-up utterances (not recorded): [{"model": "bulbul:v4-flash", "text": "ta", "transport": "ws", "wallMs": 602}, {"model": "bulbul:v4-flash", "text": "hi", "transport": "ws", "wallMs": 565}, {"model": "bulbul:v3", "text": "ta", "transport": "ws", "wallMs": 694}, {"model": "bulbul:v3", "text": "hi", "transport": "ws", "wallMs": 533}]
- Clone pre-flight (not recorded): {"voice": "banked", "wallMs": 2051}
- An earlier attempt (2026-10-15 01:27 IST) lost its network at trial 156 of 228; its rows are kept in `ttfa-raw-interrupted.json` and are not used here.

Raw rows: `bench/results/ttfa-raw.json`. Summary: `bench/results/ttfa-summary.json`. Script: `bench/ttfa.ts`, `bench/ttfa_summary.py`.
