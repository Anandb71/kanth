import sys, json
d = json.load(sys.stdin)
for name, v in d.items():
    if 'session_begin' not in v:
        print(name, json.dumps(v, ensure_ascii=False)[:600]); continue
    sb = (v.get('session_begin') or {}).get('config', {})
    print(name, '| model=', sb.get('model'), 'stream=', sb.get('stream_type'), 'sil=', sb.get('silence_duration_ms'),
          '| conn_ms=', v.get('connect_ms'), 'first_partial_ms_from_connect=', (v.get('first_partial') or {}).get('_t_since_start_ms'),
          'n_partials=', v.get('n_partials'), '| vad_end_after_audio_end=', (v.get('vad_speech_end') or {}).get('_t_since_audio_end_ms'),
          '| FINAL_after_audio_end=', v.get('final_latency_after_audio_end_ms'),
          '| finals=', [(f.get('text'), f.get('language'), f.get('language_confidence'), f.get('_t_since_audio_end_ms')) for f in v.get('finals', [])],
          '| errors=', v.get('errors'), '| session_end=', {k: (v.get('session_end') or {}).get(k) for k in ('audio_duration_s', 'total_utterances')})
