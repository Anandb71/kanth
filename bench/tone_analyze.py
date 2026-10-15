"""Tone proof, part 2: measure pitch, loudness, duration and speaking rate of each tone clip.

Run from kanth/ (needs numpy, soundfile, praat-parselmouth):
  uv run --no-project --python 3.13 --with numpy --with scipy --with matplotlib \
      --with soundfile --with praat-parselmouth python bench/tone_analyze.py

Reads bench/results/tone/manifest.json and the WAVs beside it.
Writes bench/results/tone.json and bench/results/tone.md.

Metrics per clip
  f0_median_hz   median F0 over voiced frames (Praat autocorrelation pitch, 10 ms step, 60-500 Hz)
  rms_dbfs       RMS level in dBFS (full scale = 1.0) over speech frames only. Speech frames are
                 20 ms frames (10 ms hop) within 35 dB of the clip's loudest frame, inside the
                 trimmed region.
  speech_sec     duration after trimming leading/trailing frames quieter than 40 dB below the
                 loudest frame
  rate_cps       characters of the text (letters, marks, digits; no spaces or punctuation)
                 per second of speech_sec
  peak_dbfs, clipped_frac   sanity checks for the loud presets
"""
import json
import os
import statistics as st
import sys
import unicodedata

import numpy as np
import parselmouth
import soundfile as sf

ROOT = os.getcwd()
TONE_DIR = os.path.join(ROOT, "bench", "results", "tone")
OUT_JSON = os.path.join(ROOT, "bench", "results", "tone.json")
OUT_MD = os.path.join(ROOT, "bench", "results", "tone.md")
ORDER = ["warm", "firm", "urgent", "joking", "whisper"]

FRAME = 0.020
HOP = 0.010
TRIM_DB = 40.0
SPEECH_DB = 35.0


def count_chars(text):
    return sum(1 for ch in text if not unicodedata.category(ch)[0] in ("Z", "P", "S", "C"))


def frame_db(x, sr):
    n, h = int(FRAME * sr), int(HOP * sr)
    if len(x) < n:
        return np.array([-120.0]), n, h
    idx = np.arange(0, len(x) - n + 1, h)
    e = np.array([np.mean(x[i : i + n] ** 2) for i in idx])
    return 10 * np.log10(e + 1e-12), n, h


def analyze(path, text):
    x, sr = sf.read(path, dtype="float64")
    if x.ndim > 1:
        x = x.mean(axis=1)
    db, n, h = frame_db(x, sr)
    top = db.max()
    active = np.where(db > top - TRIM_DB)[0]
    start = active[0] * h
    end = active[-1] * h + n
    speech_sec = (end - start) / sr
    seg = x[start:end]
    # speech frames for loudness
    sdb, _, _ = frame_db(seg, sr)
    keep = np.where(sdb > top - SPEECH_DB)[0]
    samples = np.concatenate([seg[i * h : i * h + n] for i in keep]) if len(keep) else seg
    rms = float(np.sqrt(np.mean(samples**2)))
    rms_dbfs = 20 * np.log10(rms + 1e-12)
    # pitch on the trimmed segment
    snd = parselmouth.Sound(seg, sampling_frequency=sr)
    pitch = snd.to_pitch(time_step=0.01, pitch_floor=60.0, pitch_ceiling=500.0)
    f0 = pitch.selected_array["frequency"]
    voiced = f0[f0 > 0]
    chars = count_chars(text)
    return {
        "sr": sr,
        "file_sec": round(len(x) / sr, 3),
        "speech_sec": round(speech_sec, 3),
        "chars": chars,
        "rate_cps": round(chars / speech_sec, 3),
        "f0_median_hz": round(float(np.median(voiced)), 2) if len(voiced) else None,
        "voiced_frames": int(len(voiced)),
        "rms_dbfs": round(float(rms_dbfs), 2),
        "peak_dbfs": round(float(20 * np.log10(np.max(np.abs(x)) + 1e-12)), 2),
        "clipped_frac": round(float(np.mean(np.abs(x) >= 0.999)), 5),
    }


def summ(vals):
    vals = [v for v in vals if v is not None]
    if not vals:
        return {"n": 0}
    return {
        "n": len(vals),
        "mean": round(st.mean(vals), 3),
        "sd": round(st.stdev(vals), 3) if len(vals) > 1 else 0.0,
        "min": round(min(vals), 3),
        "max": round(max(vals), 3),
    }


def main():
    man = json.load(open(os.path.join(TONE_DIR, "manifest.json"), encoding="utf-8"))
    texts = {s["id"]: s["text"] for s in man["sentences"]}
    labels = {t["id"]: t["label"] for t in man["tones"]}
    prosody = {t["id"]: t["prosody"] for t in man["tones"]}
    clips = []
    for c in man["clips"]:
        m = analyze(os.path.join(TONE_DIR, c["file"]), texts[c["sentence"]])
        clips.append({**{k: c[k] for k in ("file", "sentence", "lang", "speaker", "tone", "label", "rep")}, **m})
    metrics = ["f0_median_hz", "rms_dbfs", "rate_cps", "speech_sec"]

    by_tone = {}
    for t in ORDER:
        rows = [c for c in clips if c["tone"] == t]
        by_tone[t] = {"label": labels[t], "prosody": prosody[t], **{m: summ([r[m] for r in rows]) for m in metrics}}

    by_tone_sentence = {}
    for t in ORDER:
        for s in texts:
            rows = [c for c in clips if c["tone"] == t and c["sentence"] == s]
            by_tone_sentence[f"{t}/{s}"] = {m: summ([r[m] for r in rows]) for m in metrics}

    # Change relative to Warm (neutral prosody), computed per sentence and rep, then pooled.
    deltas = {}
    for t in ORDER:
        st_d, db_d, rate_d = [], [], []
        for c in clips:
            if c["tone"] != t:
                continue
            base = [b for b in clips if b["tone"] == "warm" and b["sentence"] == c["sentence"]]
            b_f0 = st.mean([b["f0_median_hz"] for b in base])
            b_db = st.mean([b["rms_dbfs"] for b in base])
            b_rate = st.mean([b["rate_cps"] for b in base])
            st_d.append(12 * np.log2(c["f0_median_hz"] / b_f0))
            db_d.append(c["rms_dbfs"] - b_db)
            rate_d.append(100 * (c["rate_cps"] / b_rate - 1))
        deltas[t] = {"pitch_semitones": summ([float(v) for v in st_d]), "loudness_db": summ(db_d), "rate_pct": summ(rate_d)}

    out = {
        "generated_from": "bench/results/tone/manifest.json",
        "method": __doc__.strip(),
        "speakers": sorted({c["speaker"] for c in clips}),
        "n_clips": len(clips),
        "by_tone": by_tone,
        "by_tone_sentence": by_tone_sentence,
        "delta_vs_warm": deltas,
        "clips": clips,
        "failures": man.get("failures", []),
    }
    with open(OUT_JSON, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)

    def ms(d, nd=1):
        return f"{d['mean']:.{nd}f} ± {d['sd']:.{nd}f}"

    L = []
    L.append("# Tone proof: five presets, measured\n")
    L.append(f"Generated {man['generated'][:10]} from {len(clips)} clips: bulbul:v4-flash via `synthRest` (server/bulbul.ts), 24 kHz WAV.")
    L.append("Three sentences (2 Hindi with English words, speaker `shubh_hi_customer`; 1 Tamil, speaker `vijay_ta_narration`) × 5 tones × 2 repetitions.")
    L.append("The speaker is held fixed per sentence, so only the preset pace / pitch / loudness differ. (In the app each tone also prefers a persona style, e.g. `companion` for Warm; that is switched off here so the measured difference comes from prosody alone.)\n")
    L.append("Sentences:\n")
    for s in man["sentences"]:
        L.append(f"- `{s['id']}` ({s['lang']}, {s['speaker']}): {s['text']}")
    L.append("")
    L.append("## Per tone (all 3 sentences pooled; mean ± sd)\n")
    L.append("| Tone | pace / pitch / loudness sent | n | Median F0 (Hz) | RMS level (dBFS) | Speaking rate (chars/s) | Speech duration (s) |")
    L.append("|---|---|---|---|---|---|---|")
    for t in ORDER:
        b = by_tone[t]
        p = b["prosody"]
        L.append(f"| {b['label']} | {p['pace']} / {p['pitch']} / {p['loudness']} | {b['f0_median_hz']['n']} | {ms(b['f0_median_hz'])} | {ms(b['rms_dbfs'])} | {ms(b['rate_cps'], 2)} | {ms(b['speech_sec'], 2)} |")
    L.append("")
    L.append("Pooled F0 mixes two male speakers, so its sd includes the speaker difference. The table below removes that by comparing each clip with Warm for the same sentence.\n")
    L.append("## Change relative to Warm, same sentence (mean ± sd, n = 6 per tone)\n")
    L.append("| Tone | Pitch (semitones) | Level (dB) | Speaking rate (%) |")
    L.append("|---|---|---|---|")
    for t in ORDER:
        d = deltas[t]
        L.append(f"| {labels[t]} | {d['pitch_semitones']['mean']:+.2f} ± {d['pitch_semitones']['sd']:.2f} | {d['loudness_db']['mean']:+.1f} ± {d['loudness_db']['sd']:.1f} | {d['rate_pct']['mean']:+.1f} ± {d['rate_pct']['sd']:.1f} |")
    L.append("")
    L.append("## Per tone and sentence (mean of 2 repetitions)\n")
    L.append("| Tone | Sentence | F0 (Hz) | RMS (dBFS) | Rate (chars/s) |")
    L.append("|---|---|---|---|---|")
    for t in ORDER:
        for s in texts:
            b = by_tone_sentence[f"{t}/{s}"]
            L.append(f"| {labels[t]} | {s} | {b['f0_median_hz']['mean']:.1f} | {b['rms_dbfs']['mean']:.1f} | {b['rate_cps']['mean']:.2f} |")
    L.append("")
    clipped = [c for c in clips if c["clipped_frac"] > 0]
    L.append("## Notes\n")
    L.append(f"- Peak level range across clips: {min(c['peak_dbfs'] for c in clips):.1f} to {max(c['peak_dbfs'] for c in clips):.1f} dBFS; clips with any sample at full scale: {len(clipped)}.")
    # Repeatability: the same request (sentence, tone) sent twice.
    pairs = []
    for t in ORDER:
        for s in texts:
            a = [c for c in clips if c["tone"] == t and c["sentence"] == s]
            if len(a) == 2:
                pairs.append((t, s, a[0], a[1]))
    if pairs:
        for key, unit, nd in (("f0_median_hz", "Hz", 1), ("rms_dbfs", "dB", 2), ("speech_sec", "s", 2)):
            diffs = [(abs(p[2][key] - p[3][key]), p) for p in pairs]
            worst = max(diffs, key=lambda x: x[0])
            L.append(f"- Repeat-to-repeat difference for an identical request, {key}: mean {st.mean(d for d, _ in diffs):.{nd}f} {unit}, "
                     f"largest {worst[0]:.{nd}f} {unit} ({labels[worst[1][0]]}, {worst[1][1]}: {worst[1][2][key]} vs {worst[1][3][key]}).")
        L.append("- Bulbul output is not deterministic: identical requests can differ in pauses and intonation. Loudness separates the presets cleanly; "
                 "speaking rate and pitch move in the preset's direction on average but overlap between neighbouring presets at n = 6. "
                 "Speech duration (and so rate) includes pauses inside the sentence.")
    if man.get("failures"):
        L.append(f"- Failed synthesis attempts (retried): {len(man['failures'])}, see manifest.json.")
    L.append("- Method: " + " ".join(line.strip() for line in __doc__.strip().splitlines()[8:]))
    L.append("- Raw per-clip values: `bench/results/tone.json`. Audio: `bench/results/tone/*.wav`.")
    with open(OUT_MD, "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")
    sys.stdout.reconfigure(encoding="utf-8")
    print("\n".join(L))


if __name__ == "__main__":
    main()
