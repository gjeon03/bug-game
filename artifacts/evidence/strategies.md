# Three strategies, same seed, same map

The playtest scenarios from `TEST_PLAN.md`, played headless end to end on seed 31337 and asserted
permanently by `tests/unit/strategies.test.ts`.

| Strategy | Routing | Outcome | Population | Suspicion tier reached | Trail evidence (`droppings`) |
| -------- | ------- | ------- | ---------- | ---------------------- | ---------------------------- |
| **Cautious** | Every line hugs cabinetry; the scout waits in cover | **won** | 50 | 2 — *infestation suspected* | 43 |
| **Aggressive** | Shortest possible lines straight across the open middle, sprinting between them | **lost** | — | 4 — *extermination* | 330 |
| **Deliberately poor** | Long loops across bare tile and through the under-sink light, sprinting | **lost — colony collapsed at t = 232 s** | 0 | 4 — *extermination* | 138 |

## Reading

This is the design thesis as an executable claim, and the numbers are unambiguous: the *only*
difference between these runs is where the player walked, and trail evidence spans **43 → 330**, an
eightfold difference produced entirely by route geometry.

The aggressive run is the interesting one. It grows *faster* than the cautious run — it reaches the
food and moisture thresholds comfortably — and it still loses, because eight times the evidence takes
the household to the extermination tier, where spray is aimed into the cracks and shelter no longer
saves the colony. "More traffic produces faster growth; faster growth leaves more evidence" is not a
slogan in this build, it is the measured behaviour.

The deliberately poor run does not even survive night 2. Routing through the brightest light in the
kitchen and sprinting on open floor collapses the colony in under four minutes.
