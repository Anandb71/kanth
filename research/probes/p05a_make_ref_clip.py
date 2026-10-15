"""Generate a 10-15 s single-speaker Tamil reference clip with Bulbul itself (vijay_ta_narration)
and save it as probes/ref_clip.wav (24 kHz mono 16-bit WAV)."""
import base64
import json
import os

from common import HERE, body_text, out, post_json, wav_info

TEXT = ("வணக்கம், என் பெயர் கார்த்திக். நான் சென்னையில் வசிக்கிறேன். காலையில் ஒரு கப் காபி குடிச்சிட்டு, "
        "பக்கத்துல இருக்கிற பூங்காவுல கொஞ்ச நேரம் நடக்கிறது எனக்கு ரொம்ப பிடிக்கும். "
        "அப்புறம் குடும்பத்தோட சேர்ந்து உட்கார்ந்து நிதானமா சாப்பிடுவோம்.")

r = post_json("/text-to-speech", {"text": TEXT, "language_code": "ta-IN", "model": "bulbul:v4-flash", "speaker": "vijay_ta_narration",
                                  "speech_sample_rate": 24000, "output_audio_codec": "wav", "pace": 1.0})
out("status", r.status, "ms", round(r.t_done * 1000), "chars", len(TEXT))
if r.status != 200:
    out(body_text(r))
    raise SystemExit(1)
j = json.loads(r.body)
wav = base64.b64decode("".join(j["audios"]))
info = wav_info(wav)
out("wav", info)
with open(os.path.join(HERE, "ref_clip.wav"), "wb") as f:
    f.write(wav)
with open(os.path.join(HERE, "ref_clip.txt"), "w", encoding="utf-8") as f:
    f.write(TEXT + "\n")
out("saved ref_clip.wav", len(wav), "bytes; request_id", j.get("request_id"))
