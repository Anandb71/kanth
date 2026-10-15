"""Parse the live 400-error speaker lists (from p02_speaker_roster_raw.py) into
research/speakers-v4-flash.json, and diff them against the documented lists in
research/docs (snapshots of docs.sarvam.ai pages fetched 2026-10-15 IST).

Gender is INFERRED from the given name only (Indian/English first-name
convention); it is not an API field. p02c_gender_f0.py adds a median-F0 acoustic hint for the Tamil and ambiguous-name personas.
"""
import collections
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
RESEARCH = os.path.dirname(HERE)


def lp(p):
    p = os.path.abspath(p)
    return "\\\\?\\" + p if os.name == "nt" and not p.startswith("\\\\?\\") else p


def read(p):
    with open(lp(p), encoding="utf-8") as f:
        return f.read()


def roster(model_file):
    d = json.loads(read(os.path.join(HERE, "out", model_file)))
    msg = d["error"]["message"]
    return [s.strip() for s in msg.split(" are: ", 1)[1].split(",")], d["error"].get("request_id")


# Name -> inferred gender (F/M). Based on common usage of the given name in India.
GENDER = {
    "aarti": "F", "aayan": "M", "aditi": "F", "aditya": "M", "advait": "M", "amelia": "F", "amit": "M",
    "anand": "M", "aparna": "F", "aravind": "M", "arnab": "M", "aryaman": "M", "ashok": "M", "ashutosh": "M",
    "ashwin": "M", "bhavik": "M", "bimal": "M", "chaitra": "F", "chandrika": "F", "chetan": "M", "chhavi": "F",
    "chirag": "M", "dev": "M", "deven": "M", "girish": "M", "gokul": "M", "harpreet": "M", "ishita": "F",
    "jaspal": "M", "kabir": "M", "kalpit": "M", "kangkana": "F", "kavitha": "F", "kavya": "F", "kunal": "M",
    "mahesh": "M", "manan": "M", "mani": "M", "mohit": "M", "mouchumi": "F", "mrunal": "F", "mukul": "M",
    "nachiket": "M", "neha": "F", "nilesh": "M", "nupur": "F", "ojas": "M", "payal": "F", "pooja": "F",
    "priya": "F", "rahul": "M", "ratan": "M", "rehan": "M", "ritu": "F", "rohan": "M", "roopa": "F",
    "rupali": "F", "rustom": "M", "sanchita": "F", "sarang": "M", "sarika": "F", "shabana": "F", "shalini": "F",
    "shilpa": "F", "shreya": "F", "shruti": "F", "shubh": "M", "simran": "F", "soham": "M", "sophia": "F",
    "suchitra": "F", "suhani": "F", "suman": "F", "sumit": "M", "sunny": "M", "tanya": "F", "tarun": "M",
    "vaibhav": "M", "vandana": "F", "varun": "M", "vetri": "M", "vijay": "M", "vipul": "M", "zarina": "F",
    "bappa": "M",
}
LANG = {"hi": "hi-IN", "en": "en-IN", "enhi": "en-IN+hi-IN (code-mixed)", "mr": "mr-IN", "kn": "kn-IN",
        "pa": "pa-IN", "ta": "ta-IN", "te": "te-IN", "gu": "gu-IN", "bn": "bn-IN", "as": "as-IN (NOT an accepted TTS language_code)"}

v4, v4_req = roster("roster_bulbul_v4-flash.json")
v3, v3_req = roster("roster_bulbul_v3.json")

groups = collections.OrderedDict()
for s in v4:
    name, tag, style = s.split("_", 2)
    groups.setdefault(tag, []).append({"speaker": s, "name": name, "style": style, "gender_inferred": GENDER.get(name, "?")})

doc_page = re.findall(r"\| `([a-z_]+)`", read(os.path.join(RESEARCH, "docs", "g_text-to-speech_voices.md")))
ws_enum = re.findall(r"^        - ([a-z]+_[a-z]+_[a-z_]+)\s*$", read(os.path.join(RESEARCH, "docs", "r_text-to-speech_stream.md")), re.M)

result = {
    "source": "Live API: POST https://api.sarvam.ai/text-to-speech with an invalid speaker returns HTTP 400 listing every valid speaker for the model.",
    "fetched_at_ist": "2026-10-15",
    "request_ids": {"bulbul:v4-flash": v4_req, "bulbul:v3": v3_req},
    "gender_note": "gender_inferred is guessed from the first name only (F/M/?); it is NOT returned by the API and was not verified by listening.",
    "bulbul:v4-flash": {
        "total": len(v4),
        "unique_voice_names": len({s.split('_')[0] for s in v4}),
        "count_by_language_tag": {k: len(v) for k, v in groups.items()},
        "language_tag_meaning": LANG,
        "by_language": groups,
    },
    "bulbul:v3": {"total": len(v3), "speakers": v3,
                  "speakers_with_gender_inferred": {s: GENDER.get(s, "?") for s in v3}},
    "doc_diffs": {
        "voices_page_count": len(doc_page),
        "live_not_in_voices_page": sorted(set(v4) - set(doc_page)),
        "voices_page_not_live": sorted(set(doc_page) - set(v4)),
        "ws_asyncapi_enum_count": len(ws_enum),
        "live_not_in_ws_enum": sorted(set(v4) - set(ws_enum)),
        "ws_enum_not_live": sorted(set(ws_enum) - set(v4)),
    },
}
# gender summary for ta/hi/en/enhi
summary = {}
for tag in ["ta", "hi", "en", "enhi"]:
    g = collections.defaultdict(list)
    for e in groups.get(tag, []):
        g[e["gender_inferred"]].append(e["speaker"])
    summary[tag] = {k: v for k, v in g.items()}
result["gender_summary_inferred"] = summary
try:
    result["acoustic_f0_check"] = {
        "method": "p02c_gender_f0.py: one synthesized line per persona, median F0 by autocorrelation; <160 Hz => M hint. Heuristic.",
        "results": json.loads(read(os.path.join(HERE, "out", "p02c_gender_f0.json")))}
except FileNotFoundError:
    pass
result["tamil_female_persona_exists"] = False
result["tamil_note"] = ("All 4 live ta personas (gokul_ta_narration, vijay_ta_narration, aravind_ta_ads, aravind_ta_suspense) are male by name "
                        "and by measured F0 (126-140 Hz). For a female Tamil voice use a female persona of another language with "
                        "language_code=ta-IN (verified: aparna_hi_customer and simran_en_customer speak Tamil intelligibly; Saaras transcribed both "
                        "outputs exactly).")

with open(lp(os.path.join(RESEARCH, "speakers-v4-flash.json")), "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print("v4 total", len(v4), {k: len(v) for k, v in groups.items()})
print("v3 total", len(v3))
print(json.dumps(result["doc_diffs"], indent=1))
for tag in ["ta", "as", "bn"]:
    print(tag, [e["speaker"] for e in groups.get(tag, [])])
for tag, g in summary.items():
    print(tag, {k: len(v) for k, v in g.items()})
print("unknown-gender names:", sorted({s.split('_')[0] for s in v4 if GENDER.get(s.split('_')[0], '?') == '?'}))
