# Conversation benchmark v2: summary

Computed by `python bench/conversations_v2_summary.py` from the raw v2 files in `bench/results/v2/` (no new API calls).
Prompt version: commit ffb1b9c (recorded in every raw file). Judge: sarvam-105b, two runs, a hit only when both agree.
Scripted sets written by the team, not real users. The held-out set was written before any model output for it and never edited, so it is the unbiased number. The original set motivated the prompt fix, so its v2 figure is optimistic.

## Held-out set (24 new turns)

| | n | A draft said it | Said after steering | Said without typing | Motor actions, touch (plain → Kanth) | Switch presses (plain → Kanth) |
|---|---|---|---|---|---|---|
| All | 24 | 3 (12%) | 3 | 6 (25%) | 38.0 → 37.8 (1% fewer) | 75.0 → 73.9 (2% fewer) |
| Tamil | 8 | 0 (0%) | 1 | 1 (12%) | 37.6 → 42.6 (-13%) | 74.2 → 83.4 (-12%) |
| Hindi | 8 | 2 (25%) | 1 | 3 (38%) | 32.9 → 30.1 (8%) | 64.8 → 58.5 (10%) |
| English | 8 | 1 (12%) | 1 | 2 (25%) | 43.5 → 40.6 (7%) | 86.0 → 79.8 (7%) |

Misses where the keyword rule returned no words (steering not tried): 4.

## Original set (36 turns, after the fix)

| | n | A draft said it | Said after steering | Said without typing | Motor actions, touch (plain → Kanth) | Switch presses (plain → Kanth) |
|---|---|---|---|---|---|---|
| All | 36 | 3 (8%) | 9 | 12 (33%) | 37.4 → 34.6 (7% fewer) | 73.7 → 67.5 (8% fewer) |
| Tamil | 12 | 0 (0%) | 3 | 3 (25%) | 35.9 → 38.1 (-6%) | 70.8 → 74.2 (-5%) |
| Hindi | 12 | 1 (8%) | 4 | 5 (42%) | 38.0 → 32.7 (14%) | 75.0 → 63.5 (15%) |
| English | 12 | 2 (17%) | 2 | 4 (33%) | 38.2 → 33.2 (13%) | 75.3 → 64.8 (14%) |

Misses where the keyword rule returned no words (steering not tried): 4.

