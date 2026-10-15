"""Summarise the v2 conversation benchmark from its raw files (no API calls).

Inputs (bench/results/v2/): <set>-raw-judge.json, <set>-raw-steerjudge.json, <set>-raw-keywords.json,
<set>-raw-translit.json for set in {original, heldout}. Writes bench/results/conversations-v2.json and .md.

A hit counts only when both judge runs pick the same draft. Steering is tried on every miss, with keywords
derived by a fixed rule from the intended reply alone (see bench/conversations.ts). Motor actions: a
direct hit costs 1 selection; a steering hit costs the keyword characters + 1 (steer) + 1 (select); a miss
after steering costs the full typing (Roman keystrokes + 1) plus the keyword characters + 1 already spent.
Single-switch scanning is modeled as 2 presses per character, as in v1.

Usage: python bench/conversations_v2_summary.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
V2 = os.path.join(HERE, "results", "v2")
LANGS = {"ta-IN": "Tamil", "hi-IN": "Hindi", "en-IN": "English"}


def load(name):
    with open(os.path.normpath(os.path.join(V2, name)), encoding="utf-8") as f:
        return json.load(f)


def agreed(turn):
    runs = [r.get("parsed") for r in turn.get("runs", [])]
    if len(runs) < 2 or any(r is None for r in runs):
        return None
    a, b = runs[0].get("match"), runs[1].get("match")
    return a if a is not None and a == b else None


def summarise(set_name):
    judge = {t["id"]: t for t in load(f"{set_name}-raw-judge.json")["turns"]}
    steer = {t["id"]: t for t in load(f"{set_name}-raw-steerjudge.json")["turns"]}
    kw = {r["id"]: (r.get("keywords") or "").strip() for r in load(f"{set_name}-raw-keywords.json")["rows"]}
    # The original set's intended replies are unchanged since v1, so its romanisation is reused from v1.
    tpath = f"{set_name}-raw-translit.json" if os.path.exists(os.path.join(V2, f"{set_name}-raw-translit.json")) else os.path.join("..", "v1", "conversations-raw-translit.json")
    roman = {r["id"]: r.get("roman") for r in load(tpath)["rows"]}
    rows = []
    for tid, t in judge.items():
        lang = t["lang"]
        typed = roman.get(tid) if lang != "en-IN" else t["intended"]
        keys = len(typed or t["intended"]) + 1
        hit = agreed(t)
        k = kw.get(tid, "")
        steer_hit = None
        if hit is None and k and tid in steer:
            steer_hit = agreed(steer[tid])
        if hit is not None:
            touch, scan, outcome = 1, 1, "draft"
        elif steer_hit is not None:
            touch, scan, outcome = len(k) + 2, 2 * len(k) + 2, "steer"
        else:
            extra = len(k) + 1 if k else 0
            touch, scan, outcome = keys + extra, 2 * (keys - 1) + 1 + (2 * len(k) + 1 if k else 0), "typed"
        rows.append({"id": tid, "lang": lang, "intended": t["intended"], "keywords": k or None, "draft_hit": hit, "steer_hit": steer_hit,
                     "outcome": outcome, "plain_touch": keys, "plain_scan": 2 * (keys - 1) + 1, "kanth_touch": touch, "kanth_scan": scan})
    return rows


def stats(rows):
    n = len(rows)
    d = sum(r["outcome"] == "draft" for r in rows)
    st = sum(r["outcome"] == "steer" for r in rows)
    kw_missing = sum(r["draft_hit"] is None and not r["keywords"] for r in rows)
    pt = sum(r["plain_touch"] for r in rows) / n
    kt = sum(r["kanth_touch"] for r in rows) / n
    ps = sum(r["plain_scan"] for r in rows) / n
    ks = sum(r["kanth_scan"] for r in rows) / n
    return {"n": n, "draft_hits": d, "steer_hits": st, "said_without_typing": d + st, "misses_without_keywords": kw_missing,
            "draft_hit_rate": d / n, "with_steering_rate": (d + st) / n,
            "touch_plain": pt, "touch_kanth": kt, "touch_reduction": 1 - kt / pt,
            "scan_plain": ps, "scan_kanth": ks, "scan_reduction": 1 - ks / ps}


out = {}
md = ["# Conversation benchmark v2: summary", "",
      "Computed by `python bench/conversations_v2_summary.py` from the raw v2 files in `bench/results/v2/` (no new API calls).",
      "Prompt version: commit ffb1b9c (recorded in every raw file). Judge: sarvam-105b, two runs, a hit only when both agree.",
      "Scripted sets written by the team, not real users. The held-out set was written before any model output for it and never edited, so it is the unbiased number. The original set motivated the prompt fix, so its v2 figure is optimistic.", ""]
for set_name in ["heldout", "original"]:
    rows = summarise(set_name)
    by_lang = {LANGS[l]: stats([r for r in rows if r["lang"] == l]) for l in LANGS if any(r["lang"] == l for r in rows)}
    out[set_name] = {"overall": stats(rows), "by_language": by_lang, "rows": rows}
    o = out[set_name]["overall"]
    md += [f"## {'Held-out set (24 new turns)' if set_name == 'heldout' else 'Original set (36 turns, after the fix)'}", "",
           "| | n | A draft said it | Said after steering | Said without typing | Motor actions, touch (plain → Kanth) | Switch presses (plain → Kanth) |",
           "|---|---|---|---|---|---|---|",
           f"| All | {o['n']} | {o['draft_hits']} ({o['draft_hit_rate']:.0%}) | {o['steer_hits']} | {o['said_without_typing']} ({o['with_steering_rate']:.0%}) | {o['touch_plain']:.1f} → {o['touch_kanth']:.1f} ({o['touch_reduction']:.0%} fewer) | {o['scan_plain']:.1f} → {o['scan_kanth']:.1f} ({o['scan_reduction']:.0%} fewer) |"]
    for lname, s in by_lang.items():
        md.append(f"| {lname} | {s['n']} | {s['draft_hits']} ({s['draft_hit_rate']:.0%}) | {s['steer_hits']} | {s['said_without_typing']} ({s['with_steering_rate']:.0%}) | {s['touch_plain']:.1f} → {s['touch_kanth']:.1f} ({s['touch_reduction']:.0%}) | {s['scan_plain']:.1f} → {s['scan_kanth']:.1f} ({s['scan_reduction']:.0%}) |")
    md += ["", f"Misses where the keyword rule returned no words (steering not tried): {o['misses_without_keywords']}.", ""]

with open(os.path.join(HERE, "results", "conversations-v2.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
with open(os.path.join(HERE, "results", "conversations-v2.md"), "w", encoding="utf-8") as f:
    f.write("\n".join(md) + "\n")
print("\n".join(md))
