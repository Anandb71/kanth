"""Tone proof chart: docs/img/tone-proof.png|svg from bench/results/tone.json.

Run from kanth/ after bench/tone_analyze.py. Three small multiples (pitch, loudness, rate), each on
its own single y-axis; x = the five presets; one dot per clip (colored by speaker), a mean bar per tone.
"""
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import chart_style as cs  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.lines import Line2D  # noqa: E402

SRC = "bench/results/tone.json"
IMG = "docs/img/tone-proof"
ORDER = ["warm", "firm", "urgent", "joking", "whisper"]
PANELS = [
    ("f0_median_hz", "Pitch", "median F0, Hz", "{:.0f} Hz"),
    ("rms_dbfs", "Loudness", "RMS level on speech, dBFS", "{:.1f} dB"),
    ("rate_cps", "Speaking rate", "characters per second", "{:.1f}/s"),
]


def main():
    d = json.load(open(SRC, encoding="utf-8"))
    clips = d["clips"]
    labels = {t: d["by_tone"][t]["label"] for t in ORDER}
    speakers = sorted({c["speaker"] for c in clips}, key=lambda s: (not s.startswith("shubh"), s))
    col = {speakers[0]: cs.TERRACOTTA}
    if len(speakers) > 1:
        col[speakers[1]] = cs.TEAL
    n_per_tone = min(sum(1 for c in clips if c["tone"] == t) for t in ORDER)
    sent_lang = {}
    for c in clips:
        sent_lang.setdefault(c["speaker"], set()).add(c["sentence"])

    cs.apply()
    fig = plt.figure(figsize=(11.5, 5.7), dpi=100)
    H = fig.get_figheight()
    top_in, bot_in = 1.85, 0.95
    left, gap, right = 0.06, 0.075, 0.015
    w = (1 - left - right - 2 * gap) / 3
    rng = np.random.default_rng(7)
    for k, (key, title, ylab, fmt) in enumerate(PANELS):
        ax = fig.add_axes([left + k * (w + gap), bot_in / H, w, 1 - (top_in + bot_in) / H])
        cs.style_axes(ax, grid_axis="y")
        ax.spines["bottom"].set_color(cs.AXIS)
        ax.tick_params(axis="x", length=0, pad=6)
        means = []
        for i, t in enumerate(ORDER):
            rows = [c for c in clips if c["tone"] == t and c[key] is not None]
            vals = np.array([c[key] for c in rows], dtype=float)
            m = float(vals.mean())
            means.append(m)
            ax.plot([i - 0.3, i + 0.3], [m, m], color=cs.INK, linewidth=2.6, solid_capstyle="round", zorder=4)
            jit = rng.uniform(-0.17, 0.17, size=len(rows))
            for c, j in zip(rows, jit):
                ax.scatter(i + j, c[key], s=34, color=col[c["speaker"]], edgecolors=cs.PAPER, linewidths=1.6, zorder=5)
        ax.set_xticks(range(len(ORDER)))
        ax.set_xticklabels([f"{labels[t]}\n{fmt.format(m).replace('-', '−')}" for t, m in zip(ORDER, means)], fontsize=9.5, linespacing=1.5)
        for lab in ax.get_xticklabels():
            lab.set_color(cs.INK_2)
        ax.set_xlim(-0.6, len(ORDER) - 0.4)
        lo, hi = ax.get_ylim()
        pad = (hi - lo) * 0.08
        ax.set_ylim(lo - pad, hi + pad)
        ax.text(0, 1.035, title, transform=ax.transAxes, fontsize=11.5, fontweight="semibold", color=cs.INK, va="bottom")
        ax.set_ylabel(ylab, color=cs.MUTED, fontsize=9)
    fig.text(0.015, 1 - 0.3 / H, "Same sentence, five tones", fontsize=16, fontweight="semibold", color=cs.INK, va="top")
    spk = " · ".join(f"{s}: {len(sent_lang[s])} {'Hindi-English sentences' if s.startswith('shubh') else 'Tamil sentence'}" for s in speakers)
    sub = ("Bulbul V4 Flash via REST, 24 kHz. The speaker is held fixed per sentence, so only the preset's pace, pitch and loudness change.\n"
           f"{spk} · n = {n_per_tone} clips per tone (3 sentences × 2 repetitions).\n"
           "Dot = one clip, bar = mean of all clips (value under each tone).")
    fig.text(0.015, 1 - 0.66 / H, sub, fontsize=9.2, color=cs.INK_2, va="top", linespacing=1.45)
    handles = [Line2D([0], [0], marker="o", linestyle="none", markersize=7, markerfacecolor=col[s], markeredgecolor="none", label=f"{s} ({'Hindi-English' if s.startswith('shubh') else 'Tamil'})") for s in speakers]
    handles.append(Line2D([0], [0], color=cs.INK, linewidth=2.6, label="mean of all clips"))
    fig.legend(handles=handles, loc="lower right", bbox_to_anchor=(0.995, 0.005), ncol=len(handles), frameon=False, fontsize=9,
               labelcolor=cs.INK_2, handletextpad=0.4, columnspacing=1.5)
    os.makedirs(os.path.dirname(IMG), exist_ok=True)
    fig.savefig(IMG + ".png", dpi=200)
    fig.savefig(IMG + ".svg")
    plt.close(fig)
    print("wrote", IMG + ".png", IMG + ".svg")


if __name__ == "__main__":
    main()
