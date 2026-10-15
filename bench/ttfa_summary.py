"""Summarise bench/results/ttfa-raw.json -> ttfa-summary.json, ttfa.md, docs/img/ttfa.png|svg.

Run from kanth/:  bench/.venv/Scripts/python.exe bench/ttfa_summary.py
Percentiles: numpy linear interpolation (type 7). Only rows with ok=true are summarised;
failures and fallbacks are counted and listed.
"""
import json
import os
import sys
from datetime import datetime, timedelta, timezone

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import chart_style as cs  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.lines import Line2D  # noqa: E402

RAW = "bench/results/ttfa-raw.json"
OUT_JSON = "bench/results/ttfa-summary.json"
OUT_MD = "bench/results/ttfa.md"
IMG = "docs/img/ttfa"

LABEL = {
    "v4-flash/ws-warm": "V4 Flash · WebSocket, warm",
    "v4-flash/http-stream": "V4 Flash · HTTP stream",
    "v4-flash/rest": "V4 Flash · REST",
    "v4-flash/ws-cold": "V4 Flash · WebSocket, cold",
    "v3/ws-warm": "v3 · WebSocket, warm",
    "v3/http-stream": "v3 · HTTP stream",
    "v3/rest": "v3 · REST",
    "v3/ws-cold": "v3 · WebSocket, cold",
    "clone/http-stream": "Clone · HTTP stream",
    "clone/rest": "Clone · REST",
}
LANGS = ["ta", "hi", "en"]
IST = timezone(timedelta(hours=5, minutes=30))


def stats(vals):
    v = np.array([x for x in vals if x is not None], dtype=float)
    if len(v) == 0:
        return {"n": 0}
    return {
        "n": int(len(v)),
        "p50": round(float(np.percentile(v, 50)), 1),
        "p90": round(float(np.percentile(v, 90)), 1),
        "mean": round(float(v.mean()), 1),
        "min": round(float(v.min()), 1),
        "max": round(float(v.max()), 1),
    }


def main():
    raw = json.load(open(RAW, encoding="utf-8"))
    meta, rows = raw["meta"], raw["rows"]
    started = datetime.fromisoformat(meta["started"].replace("Z", "+00:00")).astimezone(IST)
    finished = datetime.fromisoformat(meta.get("finished", meta["started"]).replace("Z", "+00:00")).astimezone(IST)
    when = f"{started:%Y-%m-%d %H:%M}–{finished:%H:%M} IST"
    context = f"a home connection in India, {when}"

    conds = [c["id"] for c in meta["conditions"]]
    summary = {}
    for cid in conds:
        rs = [r for r in rows if r["condition"] == cid]
        ok = [r for r in rs if r["ok"]]
        s = {
            "label": LABEL.get(cid, cid),
            "planned": len(rs),
            "ok": len(ok),
            "failed": len(rs) - len(ok),
            "retried_ok": sum(1 for r in ok if r["attempts"] > 1),
            "ttfa_ms": stats([r["ttfaMs"] for r in ok]),
            "total_ms": stats([r["totalMs"] for r in ok]),
            "audio_sec": stats([r["audioSec"] for r in ok]),
            "by_lang": {l: stats([r["ttfaMs"] for r in ok if r["textId"] == l]) for l in LANGS},
            "failures": [{"order": r["order"], "lang": r["textId"], "run": r["run"], "error": r["error"], "attempts": r["attempts"]} for r in rs if not r["ok"]],
        }
        if cid.endswith("ws-cold"):
            s["connect_ms"] = stats([r["connectMs"] for r in ok])
            s["ttfa_after_connect_ms"] = stats([r["ttfaMs"] - r["connectMs"] for r in ok if r["connectMs"] is not None])
        if cid.endswith("ws-warm"):
            s["socket_not_open_before_call"] = sum(1 for r in ok if r["socketWasOpen"] is False)
        # library's own TTFA (http-stream counts the first byte, maybe a bare WAV header)
        s["lib_ttfa_ms"] = stats([r["libTtfaMs"] for r in ok])
        summary[cid] = s

    by_lang_all = {}
    for l in LANGS:
        by_lang_all[l] = {cid: summary[cid]["by_lang"][l] for cid in conds}

    out = {
        "source": RAW,
        "context": context,
        "started": meta["started"],
        "finished": meta.get("finished"),
        "percentile_method": "numpy.percentile linear interpolation (type 7)",
        "measurement_conditions": [
            "a home connection in India",
            meta.get("concurrency", ""),
            "Node " + meta["node"] + " on " + meta["os"],
        ],
        "texts": meta["texts"],
        "prosody": meta["prosody"],
        "warmups": meta["warmups"],
        "clone_preflight": meta.get("clonePreflight"),
        "outages": meta.get("outages", []),
        "total_rows": len(rows),
        "total_ok": sum(1 for r in rows if r["ok"]),
        "conditions": summary,
    }
    json.dump(out, open(OUT_JSON, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # ---------------- Markdown ----------------
    order = sorted(conds, key=lambda c: summary[c]["ttfa_ms"].get("p50", 1e9))
    L = []
    L.append("# Time to first audio (TTFA), Bulbul\n")
    L.append(f"Measured on {context}. {out['total_ok']} of {len(rows)} planned calls succeeded.\n")
    L.append("**Measurement conditions.** One Windows laptop on a home connection in India; Node " + meta["node"] + ". "
             "Calls ran strictly one at a time from this bench, shuffled with a fixed seed (" + str(meta["seed"]) + "), at least 1 s apart. "
             "Two other agents may have been calling the Sarvam API from the same machine and account at the same time, so some runs may include their load.\n")
    L.append("**What TTFA means here.** Wall-clock time from just before the client call (the same functions the app uses: "
             "`synthRest`, `synthHttpStream`, `TtsEngine` in server/bulbul.ts; `synthClone` in server/clone.ts) until the first non-empty "
             "PCM chunk reaches the playback sink. For REST it is the full response, because REST returns all audio at once. "
             "WebSocket warm: a socket opened before the run, plus 2 unrecorded warm-up utterances per model. WebSocket cold: a new socket per call, "
             "so TTFA includes the connection; the connect time is also reported on its own. Clone REST: POST /voices/clone (base64 WAV in JSON).\n")
    L.append("Texts (Warm preset: pace " + str(meta["prosody"]["pace"]) + ", pitch " + str(meta["prosody"]["pitch"]) + ", loudness " + str(meta["prosody"]["loudness"]) + "; v3 receives pace only):\n")
    for t in meta["texts"]:
        L.append(f"- `{t['id']}` {t['lang']}, {t['chars']} chars, v4 Flash `{t['v4Speaker']}`, v3 `{t['v3Speaker']}`: {t['text']}")
    L.append("- Clone: banked voice from a Bulbul-generated reference clip (no real person), same three texts.\n")
    L.append("## All languages pooled (ms), sorted by p50\n")
    L.append("| Condition | n | p50 | p90 | mean | min | max | total p50 | failed |")
    L.append("|---|---|---|---|---|---|---|---|---|")
    for c in order:
        s = summary[c]
        t, tot = s["ttfa_ms"], s["total_ms"]
        if t.get("n", 0) == 0:
            L.append(f"| {s['label']} | 0 | – | – | – | – | – | – | {s['failed']} |")
            continue
        L.append(f"| {s['label']} | {t['n']} | {t['p50']:.0f} | {t['p90']:.0f} | {t['mean']:.0f} | {t['min']:.0f} | {t['max']:.0f} | {tot['p50']:.0f} | {s['failed']} |")
    L.append("")
    L.append("## Cold WebSocket: connection vs first audio (ms)\n")
    L.append("| Condition | n | connect p50 | connect p90 | connect min–max | first audio after connect p50 | TTFA p50 |")
    L.append("|---|---|---|---|---|---|---|")
    for c in conds:
        if not c.endswith("ws-cold"):
            continue
        s = summary[c]
        k, a, t = s["connect_ms"], s["ttfa_after_connect_ms"], s["ttfa_ms"]
        if k.get("n", 0) == 0:
            continue
        L.append(f"| {s['label']} | {k['n']} | {k['p50']:.0f} | {k['p90']:.0f} | {k['min']:.0f}–{k['max']:.0f} | {a['p50']:.0f} | {t['p50']:.0f} |")
    L.append("")
    names = {"ta": "Tamil (ta-IN)", "hi": "Hindi with English words (hi-IN)", "en": "English (en-IN)"}
    for l in LANGS:
        L.append(f"## {names[l]} (ms)\n")
        L.append("| Condition | n | p50 | p90 | mean | min | max |")
        L.append("|---|---|---|---|---|---|---|")
        for c in order:
            t = summary[c]["by_lang"][l]
            if t.get("n", 0) == 0:
                L.append(f"| {summary[c]['label']} | 0 | – | – | – | – | – |")
                continue
            L.append(f"| {summary[c]['label']} | {t['n']} | {t['p50']:.0f} | {t['p90']:.0f} | {t['mean']:.0f} | {t['min']:.0f} | {t['max']:.0f} |")
        L.append("")
    L.append("## Against Sarvam's stated figure\n")
    L.append("Sarvam describes Bulbul V4 Flash as reaching first audio in under 250 ms. Client-side, from this connection "
             "(TTFA here includes the network round trip from India to the API, which a server-side figure may not):\n")
    for c in conds:
        ok = [r for r in rows if r["condition"] == c and r["ok"]]
        if not ok:
            continue
        under = sum(1 for r in ok if r["ttfaMs"] < 250)
        L.append(f"- {summary[c]['label']}: {under} of {len(ok)} calls under 250 ms (fastest {min(r['ttfaMs'] for r in ok):.0f} ms).")
    L.append("")
    L.append("## Failures, retries, anomalies\n")
    nfail = sum(s["failed"] for s in summary.values())
    nretry = sum(s["retried_ok"] for s in summary.values())
    L.append(f"- Failed calls (after up to 4 attempts with 1/2/4 s backoff on 429, 5xx and network errors): {nfail}. Calls that succeeded only on a retry: {nretry}.")
    for c in conds:
        for f in summary[c]["failures"]:
            L.append(f"  - {summary[c]['label']}, {f['lang']} run {f['run']} (trial {f['order']}): {f['error']}")
    for c in conds:
        if c.endswith("ws-warm"):
            L.append(f"- {summary[c]['label']}: calls where the warm socket had closed before the call: {summary[c]['socket_not_open_before_call']}.")
    for c in conds:
        p50 = summary[c]["ttfa_ms"].get("p50")
        for r in rows:
            if r["condition"] == c and r["ok"] and p50 and r["ttfaMs"] > 3 * p50:
                L.append(f"- Outlier: {summary[c]['label']}, {r['textId']} run {r['run']} (trial {r['order']}, {r['ts']}): "
                         f"TTFA {r['ttfaMs']:.0f} ms, total {r['totalMs']:.0f} ms, over {r['transportUsed']} "
                         f"(socket already open: {r['socketWasOpen']}). It is kept in the stats; it moves the mean, not the p50/p90.")
    if out["outages"]:
        L.append(f"- Network outages detected and waited out: {json.dumps(out['outages'])}")
    else:
        L.append("- No network outage was detected during this run.")
    L.append(f"- Warm-up utterances (not recorded): {json.dumps(meta['warmups'])}")
    L.append(f"- Clone pre-flight (not recorded): {json.dumps(meta.get('clonePreflight'))}")
    L.append("- An earlier attempt (2026-10-15 01:27 IST) lost its network at trial 156 of 228; its rows are kept in "
             "`ttfa-raw-interrupted.json` and are not used here.\n")
    L.append("Raw rows: `bench/results/ttfa-raw.json`. Summary: `bench/results/ttfa-summary.json`. Script: `bench/ttfa.ts`, `bench/ttfa_summary.py`.")
    open(OUT_MD, "w", encoding="utf-8").write("\n".join(L) + "\n")

    chart(summary, conds, context, started)
    sys.stdout.reconfigure(encoding="utf-8")
    print("\n".join(L))


def chart(summary, conds, context, started):
    cs.apply()
    order = [c for c in sorted(conds, key=lambda c: summary[c]["ttfa_ms"].get("p50", 1e9)) if summary[c]["ttfa_ms"].get("n", 0)]
    color = lambda c: cs.TERRACOTTA if c.startswith("v4-flash") else (cs.TEAL if c.startswith("v3") else cs.VIOLET)
    n_rows = len(order)
    fig = plt.figure(figsize=(9.6, 2.2 + 0.42 * n_rows), dpi=100)
    top_in = 1.55
    ax = fig.add_axes([0.27, 0.55 / fig.get_figheight(), 0.66, 1 - (top_in + 0.55) / fig.get_figheight()])
    xmax = max(summary[c]["ttfa_ms"]["p90"] for c in order)
    ax.set_xlim(0, xmax * 1.22)
    ax.set_ylim(n_rows - 0.4, -1.15)
    cs.style_axes(ax, grid_axis="x")
    ax.spines["left"].set_visible(True)
    ax.spines["left"].set_color(cs.AXIS)
    ax.tick_params(axis="y", length=0, pad=8)
    ax.set_yticks(range(n_rows))
    ax.set_yticklabels([summary[c]["label"] for c in order])
    for lab, c in zip(ax.get_yticklabels(), order):
        lab.set_color(cs.INK if c.startswith("v4-flash") else cs.INK_2)
        if c.startswith("v4-flash"):
            lab.set_fontweight("semibold")
    ax.set_xlabel("milliseconds to first audio", color=cs.MUTED, fontsize=9.5)
    ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{v:,.0f}"))
    # reference: Sarvam's stated first-audio time for v4 Flash
    ax.axvline(250, color=cs.INK_2, linewidth=1.0, zorder=2)
    ax.text(262, -1.05, "250 ms: Sarvam's stated first-audio time for V4 Flash", fontsize=8.5, color=cs.INK_2, va="top", ha="left")
    bar_h = 0.46
    fig.canvas.draw()
    for i, c in enumerate(order):
        t = summary[c]["ttfa_ms"]
        cs.hbar_rounded(ax, i, 0, t["p50"], bar_h, color(c))
        ax.plot([t["p50"], t["p90"]], [i, i], color=cs.INK_2, linewidth=1.2, zorder=4, solid_capstyle="butt")
        ax.plot([t["p90"], t["p90"]], [i - 0.13, i + 0.13], color=cs.INK_2, linewidth=1.2, zorder=4)
        ax.text(t["p90"] + xmax * 0.015, i, f"{t['p50']:,.0f}  ·  p90 {t['p90']:,.0f}", va="center", ha="left", fontsize=9, color=cs.INK_2)
    # titles + legend
    def nrange(cs_):
        v = sorted({summary[c]["ttfa_ms"]["n"] for c in cs_})
        return str(v[0]) if len(v) == 1 else f"{v[0]}–{v[-1]}"
    small = [c for c in order if c.endswith("ws-cold") or c.startswith("clone")]
    main = [c for c in order if c not in small]
    fig.text(0.03, 1 - 0.32 / fig.get_figheight(), "Time to first audio", fontsize=16, fontweight="semibold", color=cs.INK, va="top")
    sub = (f"Bar = p50, whisker = p90. n = {nrange(main)} per main condition (10 runs × 3 languages), "
           f"{nrange(small)} for cold WebSocket and clone (4 × 3). Warm preset, 24 kHz.\n"
           f"Measured on {context}; other agents may have shared the API at the same time.")
    fig.text(0.03, 1 - 0.68 / fig.get_figheight(), sub, fontsize=9.2, color=cs.INK_2, va="top", linespacing=1.45)
    handles = [Line2D([0], [0], marker="s", linestyle="none", markersize=9, markerfacecolor=col, markeredgecolor="none", label=lab)
               for col, lab in ((cs.TERRACOTTA, "Bulbul V4 Flash"), (cs.TEAL, "Bulbul v3"), (cs.VIOLET, "Voice clone (beta)"))]
    fig.legend(handles=handles, loc="upper left", bbox_to_anchor=(0.022, 1 - 1.13 / fig.get_figheight()), ncol=3, frameon=False, fontsize=9, labelcolor=cs.INK_2,
               handletextpad=0.3, columnspacing=1.4)
    os.makedirs(os.path.dirname(IMG), exist_ok=True)
    fig.savefig(IMG + ".png", dpi=200)
    fig.savefig(IMG + ".svg")
    plt.close(fig)


if __name__ == "__main__":
    main()
