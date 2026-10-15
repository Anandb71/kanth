"""Acoustic check that pitch / loudness / pace actually change bulbul:v4-flash output.

Measures: duration, RMS level (dBFS), active-speech RMS, median F0 (autocorrelation, voiced frames).
Needs numpy (system python). Usage: python p03b_analyze_audio.py [files...] (defaults to out/tts/*.wav)
"""
import glob
import os
import sys
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
if os.name == "nt":
    HERE = "\\\\?\\" + HERE


def load(path):
    with wave.open(path, "rb") as w:
        sr = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    return sr, x


def f0_median(sr, x, fmin=70, fmax=400):
    frame = int(0.04 * sr)
    hop = int(0.01 * sr)
    f0s = []
    energy_thr = 0.02
    for i in range(0, len(x) - frame, hop):
        fr = x[i : i + frame]
        fr = fr - fr.mean()
        if np.sqrt(np.mean(fr ** 2)) < energy_thr:
            continue
        ac = np.correlate(fr, fr, mode="full")[frame - 1 :]
        lo, hi = int(sr / fmax), int(sr / fmin)
        if hi >= len(ac):
            continue
        lag = lo + int(np.argmax(ac[lo:hi]))
        if ac[lag] / (ac[0] + 1e-9) > 0.45:
            f0s.append(sr / lag)
    return (float(np.median(f0s)) if f0s else None), len(f0s)


def stats(path):
    sr, x = load(path)
    rms = float(np.sqrt(np.mean(x ** 2)))
    peak = float(np.max(np.abs(x)))
    act = x[np.abs(x) > 0.01]
    arms = float(np.sqrt(np.mean(act ** 2))) if len(act) else 0.0
    f0, nv = f0_median(sr, x)
    db = lambda v: round(20 * np.log10(v + 1e-12), 1)
    return {"file": os.path.basename(path), "sr": sr, "dur_s": round(len(x) / sr, 2), "rms_dbfs": db(rms),
            "active_rms_dbfs": db(arms), "peak_dbfs": db(peak), "f0_median_hz": round(f0, 1) if f0 else None, "voiced_frames": nv}


files = sys.argv[1:] or sorted(glob.glob(os.path.join(HERE, "out", "tts", "*.wav")))
for f in files:
    print(stats(f))
