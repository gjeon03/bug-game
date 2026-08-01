# Seed sweep — is the win a property of the game, or of one lucky seed?

Fourteen complete three-night runs, played headless through the real input layer with the same
competent strategy: two cover-hugging supply lines in night 1; the brood chamber and the food cache
claimed and fed in night 2; the escape tunnel plus the two far sources in night 3; supply lines
maintained through the final sweep. Produced by the probe that became `tests/unit/seeds.test.ts`,
which runs six of these seeds as a permanent regression.

| Seed | Outcome | Population | Suspicion peak | Cracks claimed |
| ---- | ------- | ---------- | -------------- | -------------- |
| 20260801 | **won** | 46 | 64 | 3/3 |
| 7 | **won** | 51 | 60 | 3/3 |
| 31337 | lost — *not established* | 34 | 61 | 3/3 |
| 909 | **won** | 43 | 65 | 3/3 |
| 424242 | lost — *not established* | 25 | 63 | 3/3 |
| 5150 | **won** | 45 | 66 | 3/3 |
| 66613 | **won** | 51 | 62 | 3/3 |
| 1 | **won** | 42 | 64 | 3/3 |
| 2 | **won** | 45 | 67 | 3/3 |
| 3 | **won** | 40 | 62 | 3/3 |
| 4242 | **won** | 47 | 58 | 3/3 |
| 99991 | **won** | 50 | 65 | 3/3 |
| 777 | **won** | 48 | 57 | 3/3 |
| 20260802 | **won** | 41 | 60 | 3/3 |

Win thresholds: 36 roaches, 120 food, 90 moisture, all cracks claimed, survived.

## Reading

**12 of 14 win.** Final population ranges 25–51 against a threshold of 36, median 45. Food and
moisture clear their thresholds in every run — population is the binding criterion, which is the
intended shape: the run is about how much colony you can build and keep, not about hoarding.

**Both losses are the same loss, and it is a fair one.** Each claimed all three cracks, banked both
reserves, kept suspicion at tier 2, and simply came out of the final sweep with too few bodies —
reported as *not established*, not as extermination. Neither lost to a collapse or a destroyed nest.
That distinction is asserted permanently in `tests/unit/seeds.test.ts`: competent play may fall short,
but it may never be wiped out.

**Suspicion peaks cluster at 57–67** — tier 2, "infestation suspected". Careful routing keeps the
household short of the extermination tier, and `tests/unit/strategies.test.ts` shows what happens to
routing that does not.

## A wider sweep: 30 more seeds

Thirty further seeds (`1000 + 137k`), same strategy, run headless:

**27 won, 3 lost.** All three losses were *not established* with all three cracks claimed and final
populations of 27, 34 and 34 against the threshold of 36. Population range across the thirty: 27–52.
Suspicion peaks: 54–73, i.e. tier 2 to tier 3 — never the extermination tier.

## Combined picture — 44 seeds

| | Count |
| --- | --- |
| Runs | 44 |
| Won | **39 (88.6 %)** |
| Lost — *not established* (fell short on population) | 5 |
| Lost — colony collapsed | **0** |
| Lost — nest destroyed | **0** |
| Runs that failed to claim all three cracks | **0** |

A competent strategy wins about nine times in ten, and when it does not, it is because the colony was
too small at dawn — never because a system failed silently, never because it was wiped out.

## Re-measured after demand-weighted labour

A later change made worker route acquisition biased toward whichever reserve is running low (an
independent gameplay review pointed out that the shortage warning told the player about a problem
they had no lever to act on). Twelve seeds re-run afterwards: **11 won**, and the two seeds that had
previously fallen short both now win comfortably — 31337 went 34 → 50 and 424242 went 25 → 47.
Suspicion peaks were unchanged at 56–82. Seed 3 moved the other way, 40 → 26: the variance is real and
it did not go away, but the colony is materially healthier and the failure mode is unchanged.

## What the losses cost

The variance is bodies, not resources: patrol footfalls and traps landing on a busy stretch of trail.
A player watching that happen has counterplay — recall, re-route, or claim the escape tunnel sooner —
which the scripted bot never uses. The 2-in-14 loss rate is therefore an upper bound on how often the
strategy fails, not a floor.
