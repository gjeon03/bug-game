# Seed sweep — is the win a property of the game or of one seed?

Seven complete three-night runs, played headless through the real input layer with the same competent
strategy (two covered supply lines in night 1; brood chamber and food cache claimed and fed in night
2; escape tunnel plus the two far sources in night 3; supply lines maintained through the final
sweep). Produced by the probe that became `tests/unit/seeds.test.ts`, which runs four of these seeds
as a permanent regression.

| Seed | Outcome | Population | Food | Moisture | Suspicion peak | Cracks claimed | Hatched | Lost | Run length |
| ---- | ------- | ---------- | ---- | -------- | -------------- | -------------- | ------- | ---- | ---------- |
| 20260801 | **won** | 47 | 241 | 179 | 55 | 3/3 | 52 | 15 | 789 s |
| 7 | **won** | 45 | 318 | 180 | 72 | 3/3 | 59 | 24 | 789 s |
| 31337 | **won** | 47 | 317 | 179 | 60 | 3/3 | 54 | 17 | 789 s |
| 909 | **won** | 42 | 233 | 181 | 72 | 3/3 | 56 | 24 | 789 s |
| 424242 | **won** | **36** | 236 | 182 | 68 | 3/3 | 58 | 32 | 789 s |
| 5150 | **won** | 45 | 238 | 180 | 60 | 3/3 | 56 | 21 | 789 s |
| 66613 | **won** | 49 | 317 | 179 | 80 | 3/3 | 68 | 29 | 789 s |

Win thresholds are 36 roaches, 120 food, 90 moisture, all cracks claimed, survived.

**Reading.** 7/7 win, so the win condition is a property of the strategy rather than of a seed. The
margins are not comfortable: population lands between 36 and 49 against a threshold of 36 — seed
424242 finishes exactly on it — and 15 to 32 roaches die per run, most of them to the final sweep.
Suspicion peaks between 55 and 80, i.e. tier 2 ("infestation suspected") to tier 3 ("calling it in"),
never tier 4, which is what leaves the colony enough of itself to clear the population bar. A player
who routes across open floor instead reaches tier 4 and does not.

Run length is 789 s (13.1 min) in every case because the three night clocks are fixed; the variation
is entirely in what the colony managed to build inside them.
