"""How each turn ends: first-draft hit, hit after one keyword steer, or typed (v1 vs v2).

Reads bench/results/conversations.json (written by bench/conversations_analyze.ts) and writes
docs/img/steering.png and docs/img/steering.svg.

Run from kanth/:  python bench/steering_chart.py   (system Python with matplotlib; the venv is broken)

Palette: terracotta and teal from chart_style.py (validated there), plus the warm gray #a39684 for
"typed", the de-emphasis gray already used in turn-gap. validate_palette.js on surface #efe9e1 for
"#b4441e,#00879c,#a39684": the gray fails the chroma floor by design (de-emphasis, not identity) and
gets a contrast WARN, relieved by the legend and by count labels on every segment; CVD and
normal-vision separations pass. Identity is carried by the legend and labels, never by color alone.
"""
import json
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

import chart_style as cs  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
conv = json.load(open(os.path.join(HERE, "results", "conversations.json"), encoding="utf-8"))
cs.apply()

v1 = conv["v1"]["hit"]["all"]
rows = [
    ("v2, held-out 24 turns\n(unbiased; new prompt)", conv["heldout"]["hit"]["all"], True),
    ("v2, original 36 turns\n(motivated the fix; biased)", conv["original"]["hit"]["all"], True),
    ("v1, original 36 turns\n(old prompt; no steering)", v1, False),
]
SEG = [
    ("First drafts hit", cs.TERRACOTTA),
    ("Hit after typing 1 to 2 steering words", cs.TEAL),
    ("Typed in full", "#a39684"),
]

fig, ax = plt.subplots(figsize=(9.2, 3.6))
fig.subplots_adjust(left=0.25, right=0.97, top=0.70, bottom=0.2)
for y, (label, h, steered) in enumerate(rows):
    n = h["n"]
    first = h["top4"]
    steer = h.get("steerHits", 0) if steered else 0
    typed = n - first - steer
    left = 0.0
    for (name, color), k in zip(SEG, [first, steer, typed]):
        w = 100.0 * k / n
        if w > 0:
            ax.barh(y, w, left=left, height=0.5, color=color, edgecolor=cs.PAPER, linewidth=2, zorder=3)
            txt_color = "white" if color != "#a39684" else cs.INK
            if w >= 7:
                ax.text(left + w / 2, y, f"{k}", ha="center", va="center", fontsize=9.5, color=txt_color, fontweight="semibold", zorder=4)
        left += w
    if not steered:
        ax.text(101, y, "steering not run", ha="left", va="center", fontsize=8.5, color=cs.MUTED)
ax.set_yticks(range(len(rows)))
ax.set_yticklabels([r[0] for r in rows], fontsize=9.5, color=cs.INK)
ax.set_xlim(0, 100)
ax.set_xticks([0, 25, 50, 75, 100])
ax.set_xticklabels(["0%", "25%", "50%", "75%", "100% of turns"], fontsize=9)
ax.set_ylim(-0.6, len(rows) - 0.4)
cs.style_axes(ax, grid_axis="x")
ax.tick_params(axis="y", length=0)
ax.spines["left"].set_visible(False)

handles = [plt.Rectangle((0, 0), 1, 1, color=c) for _, c in SEG]
fig.legend(handles, [s for s, _ in SEG], loc="upper left", bbox_to_anchor=(0.25, 0.82), ncol=3, frameon=False, fontsize=9, handlelength=1.2)
fig.text(0.02, 0.93, "How each scripted turn ends: one tap, a short steer, or typing", fontsize=13, color=cs.INK, fontweight="semibold", ha="left")
fig.text(
    0.02,
    0.05,
    "Counts of turns, LLM-judged (sarvam-105b, two runs must agree). Steering words chosen by sarvam-105b from the intended reply only. "
    "Scripted turns, not real users.",
    fontsize=7.6,
    color=cs.MUTED,
    ha="left",
)
out = os.path.join(ROOT, "docs", "img")
fig.savefig(os.path.join(out, "steering.png"), dpi=200)
fig.savefig(os.path.join(out, "steering.svg"))
print("wrote docs/img/steering.png and .svg")
