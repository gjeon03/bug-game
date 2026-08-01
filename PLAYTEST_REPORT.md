# PLAYTEST_REPORT — Baseboard Empire

Every number in this document either appears in a file the test suite produced, or is asserted by a
test that fails if it stops being true. Nothing here is typed by hand from memory.

**Where the numbers live.** Measured run figures — pacing, frame times, deployment, restart integrity
— are regenerated into `artifacts/evidence/summary.md` by `node scripts/report.mjs`, which reads the
JSON the tests wrote and prints "not present" rather than inventing a value when a record is missing.
Read that file for the current pass; this document explains what the scenarios were and what they
showed.

| Evidence                                                   | File                               |
| ---------------------------------------------------------- | ---------------------------------- |
| Generated run figures, frame times, bundle, deployment     | `artifacts/evidence/summary.md`    |
| Forty-four-seed sweep of a complete competent run          | `artifacts/evidence/seed-sweep.md` |
| Cautious vs aggressive vs deliberately poor routing        | `artifacts/evidence/strategies.md` |
| Independent critiques and what was done about each finding | `artifacts/evidence/critique/`     |
| Captured gameplay states                                   | `artifacts/evidence/shots/`        |

## Scenarios and what they showed

| Scenario                                                   | Where it runs                              | Result                                                                                                                                                                                   |
| ---------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cautious, cover-hugging routes                             | `strategies.test.ts`, `fullrun.spec.ts` 09 | **Wins.** Suspicion peaks at tier 2 ("infestation suspected"); trail evidence 43.                                                                                                        |
| Aggressive, shortest lines across open floor               | `strategies.test.ts`                       | **Loses.** Grows _faster_ — clears food and moisture comfortably — and still loses, because trail evidence of 330 carries the household to tier 4, where spray is aimed into the cracks. |
| Deliberately poor, through the under-sink light, sprinting | `strategies.test.ts`                       | **Colony collapses at t = 232 s**, inside night 2.                                                                                                                                       |
| Trap avoidance / route denial                              | `threats.spec.ts` 06                       | Traps deploy against the ground the player's own traffic crossed; workers steer around armed hazards.                                                                                    |
| Scout lost and recovered                                   | `threats.spec.ts` 08, `sim.test.ts`        | The colony promotes a replacement; play continues.                                                                                                                                       |
| Deliberate eradication                                     | `fullrun.spec.ts` 10                       | Ends `lost` with a named cause and the single largest contributing evidence source.                                                                                                      |
| Successful complete run                                    | `fullrun.spec.ts` 09, `balance.test.ts`    | Ends `won` with all five criteria met.                                                                                                                                                   |
| Five consecutive restarts, no reload                       | `restart.spec.ts` 11                       | No entity, particle, voice or suspicion leakage.                                                                                                                                         |
| Forty-four seeds, same competent strategy                  | `seed-sweep.md`, `seeds.test.ts`           | 39 win (88.6 %). All five losses fall short on population alone after claiming everything — zero collapses, zero destroyed nests.                                                        |

## The claim the design rests on, measured

Three runs, one seed, one map, differing only in **where the player walked**:

|                        | trail evidence | tier reached | outcome              |
| ---------------------- | -------------- | ------------ | -------------------- |
| cover-hugging          | 43             | 2            | won                  |
| across the open middle | 330            | 4            | lost                 |
| through the light      | 138            | 4            | collapsed in night 2 |

An eightfold spread in evidence produced entirely by route geometry. `strategies.test.ts` fails if
that stops being true.

## Difficulty shape

Population is the binding win criterion: food and moisture clear their thresholds in every competent
run, while final population ranges 25–52 against a threshold of 36 across 44 seeds, of which 39 win.
A competent run therefore usually wins and sometimes falls just short — and when it falls short, it is because bodies
were lost to patrols and traps, not because a system failed silently.

## Observations, and the changes they caused

These are the defects real play exposed. Findings raised by the independent critique passes and their
dispositions are recorded separately in `artifacts/evidence/critique/dispositions.md`.

1. **A tier crossing spawned a hundred patrols.** `world.events` is drained once per rendered _frame_
   but the simulation runs up to five _steps_ per frame, so an escalation request read back out of it
   was re-processed every step. One threshold crossing produced 107 patrols and 28 spray clouds.
   Gameplay hand-offs now use dedicated one-shot slots on the world.
2. **Resource nodes stripped bare in ~60 s of a 178 s night, permanently.** Node sizes raised, drained
   sources partly recover each night, and a route whose source runs dry is now explicitly _dry_ rather
   than silently unlinked.
3. **Workers hatched in the brood chamber could never reach routes anchored at the home crack** — a
   flat 420-unit acquisition filter against a 1219-unit gap stranded the entire workforce. Roaches now
   belong to the nest they hatched in, own-nest routes are always acceptable, and an idle worker with
   nothing in range redistributes.
4. **Route exposure had no mechanical consequence.** Every continuous evidence term was capped below
   the decay rate, so a deliberately awful route ended a night with _lower_ suspicion than a careful
   one. Evidence is now graded by how far above a baseline a roach or trail node sits.
5. **A moisture shortage killed a 35-roach colony with no warning.** Below 12 % of capacity the
   objective line, the meter and the objective bearing all point at the failing reserve.
6. **Population 0 with the scout alive was a playable, unrecoverable, undeclared state.** Now a
   colony that cannot hatch a replacement ends the run.
7. **Breeding could not be throttled and ate the win condition** — the colony spent every surplus down
   to a flat floor while the win demanded far more banked. Brood now pauses to bank.
8. **Extermination had no counterplay.** Claimed cracks are now shelter, and the home crack repairs
   between passes — but a spray sent by the extermination tier is aimed _into_ the cracks, so reaching
   that tier still costs the run.
9. **A surviving colony of 38 was told it had been "exterminated".** Falling short now reports itself
   as _not established_, with its own end card.
10. **Wall-hugging was mechanically worthless** (squared cover falloff), **open floor carried almost no
    evidence in the dark**, and **the colony ate itself before the first delivery**. All three
    corrected; the first is measured at 0.066 vs 0.129 mean route exposure for the same destination.
11. **The scout was visually indistinguishable from a worker** — a cold rim light on a cold floor. It
    now carries a warm ground pool and a traced outline in a hue the floor palette does not own.
12. **The kitchen was a single blue hue with a 22-point luminance range** because the ambient multiply
    was so high that additive warm light clipped to white. Ambient lowered; warm pools survive.
13. **Escaping a wall could push an entity into flush cabinetry.** Collision now picks the shallowest
    exit that does not land inside another solid.
14. **A hidden tab kept playing.** The run auto-pauses while `document.hidden`.
15. **A repair to route re-laying merged distinct supply lines.** Letting a lay that starts on a trail
    end _extend_ that trail was right — the route cap meant "five key presses" rather than "five supply
    lines" without it — but keying on distance alone was not. Lines out of the same crack must start
    within `LINK_RADIUS` to link at all, so distance cannot tell them apart. Adoption now also requires
    the lay to be heading within 60 degrees of the trail's terminal tangent. Found by an independent
    critic reading the change, before it ever hurt a run.
16. **A failing reserve conscripted the whole colony.** Biasing labour toward the reserve that is
    running out makes the shortage warning actionable — but only when the reserve can recover. With
    water reachable only down the long, lit fridge line, every worker pinned itself on the most exposed
    route in the game for a whole night, and food drained behind it. Labour is now capped at 75 % on any
    one reserve: a colony that starves slowly is recoverable, one that force-feeds its entire workforce
    into a patrol is not.
17. **Worker route choice ignored exposure entirely** while exposure was the game's central currency.
    It now counts, so laying a safe line and a risky line to the same source is a decision the colony
    respects. The weight came from measurement: strong aversion made workers crowd one line and cost the
    careful strategy its win.
18. **The end card could contradict itself.** Only a successful run was ever scored against the win
    conditions, so a colony that collapsed in night 2 with a full larder was shown a default verdict
    beside live numbers: "120 food banked" with a red cross next to 199. Every ending now scores itself
    and freezes the numbers behind that score — which also makes the loss card say something useful,
    since a failed population line beside a passed food line tells the player they died of thirst.
19. **A bare `playwright test` validated a stale `dist/`.** The rebuild lived in an npm script rather
    than in the Playwright server command, so a run invoked directly reported green against the binary
    from before the fix under test. Found by checking a regenerated capture rather than the test result.

## Known issues

Recorded rather than hidden. None block play; all are reproducible.

1. **Scout replacement bypasses the loss statistics.** Promoting a worker to scout costs a body, and
   the population reflects that, but the death is not counted in `workersLost`.
2. **Residual downtime late in night 1.** Partly mitigated by making locked cracks worth scouting
   early; a player who sets up supply quickly can still be idle for a stretch before night 2 opens.
3. **The floor tile repeats every 640 world units.** Wider than the viewport at play zoom, but a very
   wide window can show it.
4. **Overlapping workers have no depth cue against each other.** Six roaches on a nest read as one
   tangle of legs rather than six countable animals — no rim or contact shadow between bodies. Raised
   by the visual critic, who first attributed it to a value-contrast inversion and then retracted that
   on re-measurement.
