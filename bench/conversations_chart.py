"""Turn-gap chart for the Kanth conversation benchmark (v2: held-out set, keyword steering included).

Reads bench/results/conversations-chart.json (written by bench/conversations_analyze.ts) and
writes docs/img/turn-gap.png and docs/img/turn-gap.svg.

Run from kanth/:  python bench/conversations_chart.py

Palette (validated with the dataviz skill's validate_palette.js on surface #efe9e1):
emphasis form - two warm grays for the baselines and terracotta for prespeak. The grays fail the
categorical chroma floor by design (they are de-emphasis, not identities). Identity is carried by
the row labels, never by color alone; every bar is value-labelled, which relieves the contrast WARN
for the light gray. Adjacent separations pass (normal-vision dE >= 15, CVD dE >= 15).
Re-run for v2 (2026-10-15, same three colors): same result (chroma FAIL for the two grays by design,
contrast WARN for #a39684 relieved by value labels, CVD and normal-vision separations PASS).
v2 adds one non-color marker (open circle, ink) for the median over steer hits; it is labelled.
The v1 chart is kept in bench/results/v1/turn-gap.png|svg.
"""
import json
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib import font_manager  # noqa: E402
from matplotlib.ticker import FixedLocator, NullLocator  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
data = json.load(open(os.path.join(HERE, "results", "conversations-chart.json"), encoding="utf-8"))

SURFACE = "#efe9e1"
INK = "#2b2420"
INK_2 = "#5c534a"
MUTED = "#857a6e"
GRID = "#dcd3c7"
COLORS = {"a": "#6f6458", "b": "#a39684", "c": "#b4441e"}
LABELS = {
    "a": "(a) Plain typing",
    "b": "(b) Suggestions, no prespeak",
    "c": "(c) Suggestions + prespeak",
}
TITLES = {
    "direct": "Direct selection (touch or pointer)",
    "scan": "Single-switch scanning, 1.4 s interval",
}

families = {f.name for f in font_manager.fontManager.ttflist}
for fam in ["Segoe UI", "Inter", "Noto Sans", "DejaVu Sans"]:
    if fam in families:
        plt.rcParams["font.family"] = fam
        break
plt.rcParams["svg.fonttype"] = "none"


def fmt(s):
    if s < 1:
        return f"{s * 1000:.0f} ms"
    if s < 10:
        return f"{s:.1f} s"
    if s < 120:
        return f"{s:.0f} s"
    return f"{s / 60:.1f} min"


XMIN, XMAX = 0.1, 600
fig, axes = plt.subplots(2, 1, figsize=(9.2, 6.0), sharex=True, facecolor=SURFACE)
fig.subplots_adjust(left=0.27, right=0.95, top=0.78, bottom=0.17, hspace=0.55)

for ax, group in zip(axes, data["groups"]):
    ax.set_facecolor(SURFACE)
    bars = group["bars"]
    ys = list(range(len(bars)))[::-1]
    for y, b in zip(ys, bars):
        v = b["median"]
        ax.barh(y, v - XMIN, left=XMIN, height=0.62, color=COLORS[b["cond"]], edgecolor=SURFACE, linewidth=2, zorder=3)
        ax.text(v * 1.12, y, fmt(v), va="center", ha="left", fontsize=10, color=INK, fontweight="semibold", zorder=4)
        if b["cond"] != "a" and b.get("hitsMedian") is not None and abs(b["hitsMedian"] - v) / v > 0.05:
            h = b["hitsMedian"]
            ax.plot([h], [y], marker="D", markersize=7, markerfacecolor=SURFACE, markeredgecolor=INK, markeredgewidth=1.4, zorder=5, linestyle="none")
            ax.text(h, y + 0.43, f"first-draft hits {fmt(h)}", va="bottom", ha="center", fontsize=8, color=INK_2, zorder=5)
        sh = b.get("steerHitsMedian")
        if b["cond"] != "a" and sh is not None and sh == sh:  # skip NaN
            ax.plot([sh], [y], marker="o", markersize=8, markerfacecolor=SURFACE, markeredgecolor=INK, markeredgewidth=1.4, zorder=5, linestyle="none")
            ax.text(sh, y + 0.43, f"steer hits {fmt(sh)}", va="bottom", ha="center", fontsize=8, color=INK_2, zorder=5)
    ax.set_yticks(ys)
    ax.set_yticklabels([LABELS[b["cond"]] for b in bars], fontsize=10, color=INK)
    ax.set_ylim(-0.6, len(bars) + (0.35 if group["access"] == "direct" else -0.25))
    ax.set_title(TITLES[group["access"]], loc="left", fontsize=10.5, color=INK, fontweight="semibold", pad=6)
    ax.set_xscale("log")
    ax.set_xlim(XMIN, XMAX)
    ax.xaxis.set_major_locator(FixedLocator([0.1, 0.2, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600]))
    ax.xaxis.set_minor_locator(NullLocator())
    ax.set_xticklabels(["0.1 s", "0.2", "0.5", "1", "2", "5", "10", "30", "1 min", "2", "5", "10 min"], fontsize=9, color=MUTED)
    ax.grid(axis="x", color=GRID, linewidth=0.8, zorder=0)
    ax.tick_params(axis="y", length=0)
    ax.tick_params(axis="x", length=0, colors=MUTED)
    for s in ["top", "right", "left"]:
        ax.spines[s].set_visible(False)
    ax.spines["bottom"].set_color(GRID)
    # human norms
    ax.axvline(data["humanNormS"], color=INK, linewidth=1.4, zorder=6)
    ax.axvline(data["dispreferredS"], color=MUTED, linewidth=1, linestyle=(0, (3, 3)), zorder=2)

nb = len(data["groups"][0]["bars"])
axes[0].text(data["humanNormS"], nb - 0.55, " typical human reply, ~200 ms", fontsize=8.5, color=INK, va="center", ha="left", zorder=7, bbox=dict(facecolor=SURFACE, edgecolor="none", pad=1.5))
axes[0].text(data["dispreferredS"], nb - 0.05, " 700 ms or more is heard as reluctance", fontsize=8.5, color=MUTED, va="center", ha="left")
axes[1].set_xlabel("Turn gap, log scale: partner stops speaking to the user's voice being audible", fontsize=9.5, color=INK_2)

fig.text(0.02, 0.95, f"Kanth turn gap, median of {data['n']} held-out scripted turns", fontsize=14, color=INK, fontweight="semibold", ha="left")
fig.text(
    0.02,
    0.895,
    f"First drafts hit {data['hitTop4Pct']:.0f}% of turns; 1 to 2 steering words recover {data['steerHits']} of {data['steered']} misses; the rest are typed. "
    "Diamond = median over first-draft hits,\ncircle = median over steer hits. System latencies MEASURED; human selection, keyword and typing times MODELED.",
    fontsize=9.2,
    color=INK_2,
    ha="left",
)
fig.text(
    0.02,
    0.035,
    "Typing rates: 4.2 wpm cursor on-screen keyboard, 1.7 wpm scanning (Koester and Arthanat 2018), 5 chars/word. "
    "Human norm: Levinson and Torreira 2015;\nStivers et al. 2009. "
    "Measured: Sarvam drafting and steered redrafting, Bulbul v4 Flash prespeak and TTFA (this run), Saaras STT and playback start (in-app). "
    "Test set is scripted, not real users.",
    fontsize=7.6,
    color=MUTED,
    ha="left",
)

out = os.path.join(ROOT, "docs", "img")
os.makedirs(out, exist_ok=True)
fig.savefig(os.path.join(out, "turn-gap.png"), dpi=200, facecolor=SURFACE)
fig.savefig(os.path.join(out, "turn-gap.svg"), facecolor=SURFACE)
print("wrote docs/img/turn-gap.png and .svg")
