# Tone proof: five presets, measured

Generated 2026-10-15 from 30 clips: bulbul:v4-flash via `synthRest` (server/bulbul.ts), 24 kHz WAV.
Three sentences (2 Hindi with English words, speaker `shubh_hi_customer`; 1 Tamil, speaker `vijay_ta_narration`) × 5 tones × 2 repetitions.
The speaker is held fixed per sentence, so only the preset pace / pitch / loudness differ. (In the app each tone also prefers a persona style, e.g. `companion` for Warm; that is switched off here so the measured difference comes from prosody alone.)

Sentences:

- `hi1` (hi-IN, shubh_hi_customer): आज मेरा appointment है, please मुझे time पर ले चलो।
- `hi2` (hi-IN, shubh_hi_customer): मुझे थोड़ा pain हो रहा है, nurse को बुला दो।
- `ta1` (ta-IN, vijay_ta_narration): நான் நல்லா இருக்கேன், நீங்க கவலைப்பட வேண்டாம்.

## Per tone (all 3 sentences pooled; mean ± sd)

| Tone | pace / pitch / loudness sent | n | Median F0 (Hz) | RMS level (dBFS) | Speaking rate (chars/s) | Speech duration (s) |
|---|---|---|---|---|---|---|
| Warm | 0.95 / 0 / 1 | 6 | 117.8 ± 16.6 | -14.5 ± 0.4 | 16.95 ± 2.21 | 2.25 ± 0.45 |
| Firm | 0.88 / -0.12 / 1.45 | 6 | 114.1 ± 17.2 | -11.9 ± 0.5 | 15.11 ± 1.37 | 2.49 ± 0.35 |
| Urgent | 1.22 / 0.14 / 2.1 | 6 | 126.0 ± 7.6 | -9.7 ± 0.5 | 19.33 ± 1.02 | 1.94 ± 0.24 |
| Joking | 1.1 / 0.2 / 1.15 | 6 | 135.5 ± 26.3 | -13.9 ± 0.8 | 19.16 ± 1.94 | 1.98 ± 0.35 |
| Quiet | 0.86 / -0.05 / 0.4 | 6 | 107.5 ± 11.0 | -22.4 ± 0.6 | 13.86 ± 2.20 | 2.75 ± 0.50 |

Pooled F0 mixes two male speakers, so its sd includes the speaker difference. The table below removes that by comparing each clip with Warm for the same sentence.

## Change relative to Warm, same sentence (mean ± sd, n = 6 per tone)

| Tone | Pitch (semitones) | Level (dB) | Speaking rate (%) |
|---|---|---|---|
| Warm | -0.12 ± 2.21 | +0.0 ± 0.3 | +0.0 ± 12.5 |
| Firm | -0.70 ± 2.32 | +2.6 ± 0.5 | -10.8 ± 8.1 |
| Urgent | +1.15 ± 1.17 | +4.8 ± 0.4 | +14.1 ± 4.7 |
| Joking | +2.18 ± 3.82 | +0.6 ± 0.7 | +12.8 ± 6.7 |
| Quiet | -1.65 ± 2.53 | -7.9 ± 0.5 | -18.3 ± 11.5 |

## Per tone and sentence (mean of 2 repetitions)

| Tone | Sentence | F0 (Hz) | RMS (dBFS) | Rate (chars/s) |
|---|---|---|---|---|
| Warm | hi1 | 124.6 | -14.7 | 16.50 |
| Warm | hi2 | 112.2 | -14.4 | 17.95 |
| Warm | ta1 | 116.7 | -14.3 | 16.39 |
| Firm | hi1 | 122.9 | -11.6 | 15.96 |
| Firm | hi2 | 109.9 | -12.4 | 15.57 |
| Firm | ta1 | 109.4 | -11.6 | 13.79 |
| Urgent | hi1 | 126.8 | -10.3 | 18.75 |
| Urgent | hi2 | 121.6 | -9.5 | 20.18 |
| Urgent | ta1 | 129.5 | -9.2 | 19.07 |
| Joking | hi1 | 120.7 | -14.6 | 17.55 |
| Joking | hi2 | 166.8 | -13.0 | 21.53 |
| Joking | ta1 | 119.1 | -14.1 | 18.40 |
| Quiet | hi1 | 95.5 | -23.0 | 12.86 |
| Quiet | hi2 | 117.1 | -22.0 | 15.01 |
| Quiet | ta1 | 109.8 | -22.2 | 13.70 |

## Notes

- Peak level range across clips: -9.1 to -0.3 dBFS; clips with any sample at full scale: 0.
- Repeat-to-repeat difference for an identical request, f0_median_hz: mean 15.7 Hz, largest 48.2 Hz (Warm, hi1: 148.72 vs 100.53).
- Repeat-to-repeat difference for an identical request, rms_dbfs: mean 0.44 dB, largest 1.29 dB (Quiet, ta1: -21.6 vs -22.89).
- Repeat-to-repeat difference for an identical request, speech_sec: mean 0.26 s, largest 0.98 s (Warm, hi1: 2.03 vs 3.01).
- Bulbul output is not deterministic: identical requests can differ in pauses and intonation. Loudness separates the presets cleanly; speaking rate and pitch move in the preset's direction on average but overlap between neighbouring presets at n = 6. Speech duration (and so rate) includes pauses inside the sentence.
- Method: Metrics per clip f0_median_hz   median F0 over voiced frames (Praat autocorrelation pitch, 10 ms step, 60-500 Hz) rms_dbfs       RMS level in dBFS (full scale = 1.0) over speech frames only. Speech frames are 20 ms frames (10 ms hop) within 35 dB of the clip's loudest frame, inside the trimmed region. speech_sec     duration after trimming leading/trailing frames quieter than 40 dB below the loudest frame rate_cps       characters of the text (letters, marks, digits; no spaces or punctuation) per second of speech_sec peak_dbfs, clipped_frac   sanity checks for the loud presets
- Raw per-clip values: `bench/results/tone.json`. Audio: `bench/results/tone/*.wav`.
