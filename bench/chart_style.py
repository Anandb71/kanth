"""Shared chart style for Kanth's evidence charts (docs/img/*.png|svg).

Palette validated with the dataviz skill's validate_palette.js on the warm-paper surface
(#efe9e1) and on white, --pairs all: "#b4441e,#00879c,#5a4fa8" passes every check
(worst CVD dE 12.2, worst normal-vision dE 16.9, all >= 3:1 contrast).
"""
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.path import Path  # noqa: E402
from matplotlib.patches import PathPatch  # noqa: E402

PAPER = "#efe9e1"  # brand warm paper, used as the chart surface
INK = "#2b2420"  # primary text
INK_2 = "#5e554d"  # secondary text
MUTED = "#8a8178"  # axis labels, ticks
GRID = "#ddd4c8"  # hairline grid, one step off the surface
AXIS = "#c4b9ab"  # baseline

TERRACOTTA = "#b4441e"  # slot 1 (brand accent)
TEAL = "#00879c"  # slot 2
VIOLET = "#5a4fa8"  # slot 3

FONT = ["Segoe UI", "system-ui", "Helvetica Neue", "Arial", "DejaVu Sans"]


def apply():
    plt.rcParams.update(
        {
            "font.family": "sans-serif",
            "font.sans-serif": FONT,
            "svg.fonttype": "none",
            "figure.facecolor": PAPER,
            "axes.facecolor": PAPER,
            "savefig.facecolor": PAPER,
            "axes.edgecolor": AXIS,
            "axes.labelcolor": INK_2,
            "axes.linewidth": 1.0,
            "xtick.color": MUTED,
            "ytick.color": MUTED,
            "xtick.labelcolor": INK_2,
            "ytick.labelcolor": INK_2,
            "grid.color": GRID,
            "grid.linewidth": 1.0,
            "grid.linestyle": "-",
            "font.size": 10.5,
        }
    )


def style_axes(ax, grid_axis="y"):
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    if grid_axis == "y":
        ax.spines["left"].set_visible(False)
        ax.tick_params(axis="y", length=0)
    else:
        ax.spines["bottom"].set_visible(False)
        ax.tick_params(axis="x", length=0)
    ax.grid(True, axis=grid_axis)
    ax.set_axisbelow(True)


def hbar_rounded(ax, y, x0, x1, height, color, radius_px=4.0):
    """Horizontal bar, square at the baseline (x0), 4 px rounded data end (x1)."""
    fig = ax.figure
    fig.canvas.draw()  # make sure transforms are current
    inv = ax.transData.inverted()
    p0 = inv.transform((0, 0))
    p1 = inv.transform((radius_px * fig.dpi / 96.0, radius_px * fig.dpi / 96.0))
    rx = abs(p1[0] - p0[0])
    ry = abs(p1[1] - p0[1])
    rx = min(rx, (x1 - x0) / 2)
    ry = min(ry, height / 2)
    yb, yt = y - height / 2, y + height / 2
    verts = [
        (x0, yb),
        (x1 - rx, yb),
        (x1, yb),
        (x1, yb + ry),
        (x1, yt - ry),
        (x1, yt),
        (x1 - rx, yt),
        (x0, yt),
        (x0, yb),
    ]
    codes = [Path.MOVETO, Path.LINETO, Path.CURVE3, Path.CURVE3, Path.LINETO, Path.CURVE3, Path.CURVE3, Path.LINETO, Path.CLOSEPOLY]
    ax.add_patch(PathPatch(Path(verts, codes), facecolor=color, edgecolor="none", zorder=3))
