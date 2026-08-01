# Audit 04 — Worker AI, movement and worker rendering

**Scope.** `src/sim/workers.ts`, `src/sim/pheromone.ts`, `src/sim/field.ts`, `src/core/spatial.ts`,
`src/render/renderer.ts` (bodies), `src/render/atlas.ts` (roach sprite), `src/sim/types.ts`.

**Pinned to commit `3242189`.** The working tree's `src/sim/workers.ts` is being rewritten
concurrently (it already references an undefined `LANE_OFFSET` at line 201 and crashes the sim). All
line numbers below are `3242189:<file>:<line>` and all measurements were run against a
`git archive 3242189` copy, not the working tree.

**Method.** Headless repros driving the real `stepWorld` loop through `tests/unit/helpers.ts`.
Baseline scenario unless stated otherwise: seed 31337, the cautious `dishCrumbs` food line from
`strategies.test.ts`, colony forced to ~46 workers on that one line, 70 s sampled.

## Sprite geometry used throughout

Derived from `atlas.ts:256` (`lengths[1] = 20 * ATLAS_SCALE`) and the `drawRoachBody` leg trig
(`atlas.ts:107-152`), converted to world units (blit scale is `scale / ATLAS_SCALE`, `atlas.ts:970`):

| quantity | world units |
| --- | --- |
| body length `L` / half-width `hw` | 20 × `w.scale` / 4.7 |
| hind, mid, front tarsus tips | (−21.1, ±13.6), (−3.7, ±16.6), (+9.4, ±13.1) |
| **drawn footprint** | **31 long × 33 wide** |
| antenna tip (`renderer.ts:1147-1149`) | +30.2 ahead → **tail-tip to antenna-tip 51** |
| collision / separation radius | 8 (`constants.ts:63`) / 17 (`constants.ts:74`) |

At play zoom (`camera.ts:26`, ≈1.25 at 1280 px) the drawn roach is ≈39 × 41 px and the separation
radius is 21 px.

---

## W1 — Separation is a direction blend, not a force. This is the centipede. (CRITICAL)

**Symptom.** Workers on a trail run nose-to-tail with no gap, reading as one long segmented animal.

**Root cause.** `workers.ts:345-369`.

```
345  hash.query(w.x, w.y, WORKER_SEPARATION, (id) => { ... sx += dx * inv; sy += dy * inv; });
356  dirX += sx * 0.55;
359  const dl = Math.hypot(dirX, dirY);
360  const target = w.speed * speedMul;
363  if (dl > 0.001 && target > 0) { tvx = (dirX / dl) * target; ... }
```

`dirX/dirY` is **normalised** before the speed is applied. Separation therefore changes only the
*direction* of travel; it can never change *speed*. Take a follower directly behind a leader on the
trail:

- path term (`workers.ts:196-202`): unit vector to the lookahead node (1.0) plus tangent bias
  (`tn.dx * sign * 0.5`, `tn.d` is unit — `pheromone.ts:94-99`) → magnitude **1.5** forward.
- separation from the leader ahead: `dx = w.x - o.x` points backward, weight 0.55 → **0.55 backward**.
- net = 0.95 forward → normalise → **1.0 forward** → speed = `w.speed`, exactly as if alone.

The leader gets 1.5 + 0.55 = 2.05 forward → normalise → **1.0 forward**, also exactly `w.speed`.
Relative closing speed is **zero at every separation distance**, including zero distance. There is no
`d` at which the follower slows, so no equilibrium spacing exists.

Two secondary faults in the same block: the kernel accumulates **unit** vectors (`sx += dx * inv`,
line 353) so a neighbour at 16.9 units pushes exactly as hard as one at 0.1 units — no falloff, no
restoring gradient; and the term is multiplied by `speedMul` downstream, so it is weakest precisely
where crowds form (0.78 carrying, 0 harvesting).

The only thing that opens gaps is the ±11.3 % speed spread (118/148, `constants.ts:64-65`). Over one
~500-unit leg (3.85 s) that spreads a column by 30 × 3.85 = 115 units *in total*; across 20 workers
that is 5.8 units per gap — and every endpoint re-synchronises them (W5, W15).

**Measured (46 workers, one line, 70 s).**

| metric | value |
| --- | --- |
| median longitudinal gap along the trail tangent | **5.1** units (p05 = 0.36) |
| predicted from speed spread alone | 5.8 units — matches |
| median nearest-neighbour distance | **16.0** units (p05 = 4.1, p01 = 1.9) |
| neighbour closer than one body length (20) | **79.2 %** |
| neighbour inside the drawn legspan (36) | **98.7 %** |
| neighbour closer than 2 × `WORKER_RADIUS` (16) | **50.1 %** |
| median lateral offset from the trail | 18.3 (ribbon ≈ 37 wide) |

A 20-unit body with a 5-unit gap is 75 % overlap. That is literally a centipede: a continuous band of
identical overlapping segments along a 1-D curve.

**Repro.** `scratchpad/conga.repro.ts` (seed 31337; lay the cautious `dishCrumbs` line, `spawnWorker`
×40 at home, `idle` 20 s, sample 70 s).

**Fix.** Make separation a velocity-space term, not a heading term. Compute the steering direction
from the path only, convert to `tvx/tvy` at `w.speed * speedMul`, **then** add a separation velocity
on top and clamp the magnitude:

```
tvx = (pathX / pathLen) * target;  tvy = ...;
tvx += sepX * SEP_GAIN; tvy += sepY * SEP_GAIN;   // after the normalise, not before
```

with an inverse-distance kernel (`sx += dx * inv * inv * WORKER_SEPARATION`) so the push actually
rises as bodies close, and `SEP_GAIN` sized so a neighbour at 8 units cancels ~60 % of forward speed.
Raise `WORKER_SEPARATION` to ≥ 34 (W2). Add an explicit longitudinal term: a worker whose nearest
same-route neighbour is *ahead within 30 units along the tangent* should scale `speedMul` down —
that is the car-following rule this system needs and does not have.

---

## W2 — The separation radius is half the drawn creature (CRITICAL)

**Symptom.** Even where spacing "works", legs and antennae are drawn through neighbouring bodies.

**Root cause.** `WORKER_SEPARATION = 17` (`constants.ts:74`) versus a drawn footprint of 31 × 33 and
a tail-to-antenna reach of 51. Separation, if it worked at all, would still hold workers at 17 units
— inside each other's legspan by 16 units and inside each other's antennae by 34. `WORKER_RADIUS = 8`
likewise describes a circle less than half the body length. `NODE_SPACING = 26` is not a constraint
here: workers steer at a point `WORKER_LOOKAHEAD = 4` nodes ≈ 104 units downtrail (`workers.ts:193`),
not at individual nodes, so no other geometric term keeps bodies apart.

**Fix.** `WORKER_SEPARATION = 34` (one legspan) and raise `WORKER_RADIUS` to ~10. If 34 costs too
much throughput on a narrow line, keep 34 laterally with a separate ~26 longitudinal follow distance
— but pick the numbers from the sprite footprint, not from feel.

---

## W3 — There is essentially no per-worker visual variation (CRITICAL)

**Symptom.** Every roach in the column is identical, which is what turns overlap into "one animal".

**Root causes.**

1. **The nymph ramp destroys size variation.** `world.ts:231` gives each worker
   `scale = rng.range(0.9, 1.08)`. `workers.ts:83-86` then overwrites it every frame while
   `nymphTime > 0`: `w.scale = 0.55 + 0.45 * (1 - w.nymphTime / NYMPH_TIME)`, which terminates at
   exactly **1.0**. Every worker after the starting six is hatched as a nymph
   (`colony.ts:103`, `colony.ts:301` pass `asNymph = true`), so every hatched worker ends at scale
   1.000–1.001. Measured in real play (seed 31337, two routes, 150 s): 8 of 14 workers at scale
   **1.001**, the other six being the original starting population. In a 46-worker late colony
   virtually the whole workforce is one size.
2. **`variant` is never read by the renderer.** `grep variant src/render/` → no hits. It is used only
   for the trapped wobble (`workers.ts:92`), panic jitter (`workers.ts:293`) and the acquire stagger
   (`workers.ts:458`).
3. **One row, one palette, eight frames.** `atlas.ts:255-265` bakes exactly three rows
   (scout/worker/nymph) × 9 columns. All workers share `WORKER_PAL` (`palette.ts:41-50`). The entire
   colony is drawn from **eight** distinct images.
4. **Gait phase is the only differentiator**, and it is quantised to 8 states
   (`renderer.ts:1005`, `Math.floor(w.gait) % GAIT_FRAMES`).

**Fix.** Stop overwriting `scale` — ramp a separate `w.growth` and blit at `scale * growth`. Bake 3–4
worker palette variants into extra atlas rows (shell hue ±8°, lightness ±12 %) and select by
`w.variant`; that is ~3 more rows of a 9 × 3 atlas and costs nothing at runtime. Vary gait *rate* per
worker (`w.gaitRate = rng.range(0.85, 1.15)`) so neighbours do not step in lockstep.

---

## W4 — Harvesting disables separation completely (HIGH)

**Symptom.** At a crumb pile roaches sit inside one another; the pile looks like a rendering error.

**Root cause.** `workers.ts:234-235` sets `speedMul = 0` for `harvest`. At `workers.ts:360-363`,
`target = w.speed * 0 = 0`, and the guard `if (dl > 0.001 && target > 0)` leaves `tvx = tvy = 0`. The
separation vector computed at lines 345-357 is discarded entirely and `w.vx/w.vy` decay to zero
(line 367). Harvesters are not merely non-repelling, they are immovable — and nothing in the game
does worker-vs-worker collision (`collideCircle` is called only against `SOLIDS`, `workers.ts:373`,
`scout.ts:116`).

**Measured** (46 workers, 50 s, 14 713 harvester pairs): minimum pair distance **0.098 world units**
— two bodies at the same pixel; 9.8 % of pairs closer than 6 units, **43.9 % closer than 16**.
**Repro:** `stuck.repro.ts`, test `harvest state: separation is disabled…`.

**Fix.** Apply separation as a positional relaxation independent of `speedMul` (direct
`w.x += sepX * dt * k`, resolved through `collideCircle`), or give harvesters `speedMul = 0.05` so
the path stays live. Better: assign each harvest slot a fixed offset around the node
(`angle = slot / HARVEST_SLOTS * TAU`, radius 22) so four harvesters read as four roaches around a
crumb rather than a blob.

---

## W5 — The resource queue is dead code; waiting workers orbit the endpoint (HIGH)

**Symptom.** Workers pile at the crumb pile, jitter, and flip 180° repeatedly.

**Root cause.** `workers.ts:212-229`.

```
212   if (res.busy < HARVEST_SLOTS) { w.state = 'harvest'; ... }
216   else {
219     speedMul = 0.12;      // "wait your turn"
220   }
...
229   speedMul = w.carrying ? 0.78 : 1;   // ← unconditionally overwrites line 219
```

Line 229 runs after the whole `if` block and clobbers the brake. **The queue described in the comment
at lines 217-218 never happens.** A worker that finds the node full keeps steering at full speed at
`nodes[endIdx]` (target is clamped to the last node, lines 193-196), overshoots it, is re-attracted
backwards (`dirX = (tn.x - w.x)/d`), overshoots again — an orbit at ~130 u/s inside a 30-unit radius.
Because `if (sp > 4) w.angle = atan2(w.vy, w.vx)` (line 385) and 130 ≫ 4, facing tracks that
reversal exactly.

**Measured** (outbound workers within 60 units of a full node, 50 s): mean speed **73.9 u/s** against
the 14–18 the branch intends; **0.90 facing reversals > 90° per second** at that one endpoint; up to
**18 workers within 70 units**. **Repro:** `stuck.repro.ts`, test `endpoint churn…`.

**Fix.** Move the arrival/queue decision after the speed assignment, or set a `queued` flag and apply
`speedMul = 0.12` at line 229. Then give the queue a shape — a waiting worker should target a ring
position around `nodes[endIdx]`, not the node itself. `res.busy` should also be drawn: it has **zero**
renderer references, so `HARVEST_SLOTS` is invisible to the player.

---

## W6 — `HARVEST_SLOTS` is not enforced (HIGH)

**Symptom.** More than four roaches harvest simultaneously; the "this source cannot feed the colony"
pressure the constant exists to create is ~2× weaker than designed.

**Root cause.** `busy` is recomputed **once, before** the worker loop (`workers.ts:70-76`) and is
never incremented when a worker enters `harvest` at `workers.ts:213`. Every worker arriving in the
same step reads the same stale `busy`. With `busy = 3`, three arrivals in one step all pass
`busy < 4` and all enter.

**Measured.** `busy` reached **8** with `HARVEST_SLOTS = 4`; over cap on **567 frames** of a 70 s run.

**Repro.** `scratchpad/conga.repro.ts`, field `busyMax`.

**Fix.** `res.busy++` on the same line that sets `w.state = 'harvest'`. One line.

---

## W7 — Panic never times out (HIGH)

**Symptom.** Roaches that panicked minutes ago are still scurrying, holding cargo, never delivering.

**Root cause.** `workers.ts:257-315`. Line 258 decrements `w.panicTime`, but line 280 —
executed on every frame that any claimed nest is within reach — re-floors it:

```
280   w.panicTime = Math.max(w.panicTime, 0.35);
...
311   if (w.panicTime <= 0) { w.state = w.carrying ? 'inbound' : 'idle'; }
```

`panicTime` can therefore never reach 0 while a refuge is in range, and the reach is large
(680 units, 1100 with the escape upgrade, `workers.ts:269`) in a 3600 × 2600 world with the home nest
always claimed. The **only** exit is physically arriving within 46 units (line 281). A worker whose
straight-line path to the refuge is blocked by cabinetry panics forever — there is no pathfinding,
only seek-plus-slide.

**Measured.** Six workers put in panic with a refuge in range but unable to make progress: **6 still
in `panic` after 20 s** (`WORKER_PANIC_TIME` is 1.8), minimum `panicTime` observed among panicking
workers **exactly 0.35**, never lower. **Repro:** `states.repro.ts`, test `panicTime floor…`.

**Fix.** Floor the *refuge-seeking* behaviour, not the timer — a separate `w.fleeing` flag, or cap
total panic with a hard `w.panicElapsed > 6 → go idle`. Line 282-283 also teleports the worker up to
26 units on arrival (`w.x = refuge.x + rng.signed() * 26`), a visible pop; lerp it instead.

---

## W8 — A carrier with no route has no watchdog and gets stuck against furniture (HIGH)

**Symptom.** Roaches wedged against a cabinet, holding food, forever.

**Root cause.** `workers.ts:145-157`. When the route is gone (evicted by `MAX_ROUTES`,
`pheromone.ts:49-58`; decayed to nothing, `pheromone.ts:247-252`; or unlinked,
`pheromone.ts:301-304` → `releaseWorkers`), a carrying worker is set to `inbound` with `routeId = -1`
and walks straight at `findNest(world, w.targetNest) ?? home`. That branch **never touches
`w.lostTime`** — verified: `lostTime` stayed at its pre-existing value for the whole 60 s of the trace
in `states.repro.ts`. There is no timeout, no re-acquire attempt, no re-path. The only progress
mechanism is `collideCircle` (`field.ts:53`), which zeroes the into-normal velocity component; the
desired direction is recomputed from scratch next frame and still points into the wall, so the worker
grinds along the face indefinitely.

**Measured.** 68 obstacle-free grid positions across the kitchen, one carrier each, no route, 90 s to
reach home: **14 failed (20.6 %)**. Two were effectively motionless (travelled 200 and 430 units in
90 s). Twelve converged on the *same* final distance of 988 units from home while travelling up to
2320 units — they all jam on one obstacle and circle it. **Repro:** `stuck.repro.ts`, test
`stranded carriers…`.

**Fix.** Give the no-route path the watchdog the lost-on-route path has (`workers.ts:170-175`,
`lostTime > 2.4`): accumulate `lostTime` whenever distance-to-nest fails to decrease, and on timeout
drop the cargo or force `state = 'idle'` so `tryAcquireRoute` / `redistribute` can take over. Longer
term this wants a coarse navmesh or wall-following; the watchdog alone converts a permanent stall
into a visible give-up.

---

## W9 — The walk cycle is 15× too slow: roaches skate (HIGH)

**Symptom.** Legs move, but the roach glides; motion looks detached from the body.

**Root cause.** `workers.ts:386`: `w.gait += (sp / 26) * dt + dt * 0.4`, with 8 frames per full
tripod cycle (`GAIT_FRAMES = 8`, `renderer.ts:1005`).

| speed | gait units/s | strides/s | body lengths/s | **body lengths per stride** |
| --- | --- | --- | --- | --- |
| 118 | 4.94 | 0.617 | 5.90 | **9.6** |
| 130 | 5.40 | 0.675 | 6.50 | **9.6** |
| 148 | 6.09 | 0.762 | 7.40 | **9.7** |
| 36 (idle wander) | 1.78 | 0.223 | 1.80 | **8.1** |

A real roach covers well under one body length per stride. At 9.6 the tarsi slide ~19 units per step.
Separately, the frame index changes only 5.4 times/second, so at 60 fps each of the eight leg poses
is held for ~11 frames and then snaps — sliding plus snapping is exactly the "malformed / broken"
read.

**Fix.** `w.gait += (sp / 2.2) * dt` gives ~2.4 strides/s at 130 u/s (≈2.7 body lengths per stride),
which is still generous and removes the skate. Then either raise `GAIT_FRAMES` to 12–16 or
interpolate: blit two adjacent frames with a cross-fade, or drive the legs procedurally like the
antennae already are. Trapped workers use `w.gait += dt * 14` (`workers.ts:91`) — **2.6× faster than
a running worker** while standing still, which reads as a stuck animation rather than a struggle;
give trapped workers a distinct sprite frame instead.

---

## W10 — Draw order interleaves shadows, bodies, antennae and cargo (MEDIUM)

**Symptom.** Dark blobs painted across roach backs; antennae flick on and off; cargo half-occluded.

**Root cause.** `renderer.ts:999-1048`. Per worker, in one iteration: contact shadow
(lines 1008-1012) → body (1014) → antennae (1016-1019) → cargo (1021-1047). Because the shadow is a
22 × 12 unit ellipse at 35 % black and the measured median neighbour distance is 16 units, **worker
A's shadow is painted over worker B's already-drawn body** whenever A follows B in pool order. The
same applies to antennae: a dark `rgba(30,20,10,0.9)` hairline reaching 30 units forward
(`renderer.ts:1147-1149`) is drawn straight through the body ahead — and is over some neighbours,
under others, depending on array index.

Draw order itself is *stable* (pool index, `world.ts:209-211` reuses the first dead slot), so this is
not frame-to-frame z-fighting — but there is **no y-sort**, so occlusion is unrelated to screen depth,
and a newly hatched roach that lands in a low pool slot renders under every older roach.

`ANTENNA_BUDGET = 30` (`renderer.ts:44`) with `WORKER_CAP = 90` and a typical 46-worker colony means
roughly half the visible roaches have antennae. The budget is consumed in pool order *after* viewport
culling (`renderer.ts:1002` `continue`s before `antennaLeft--`), so the set changes as workers cross
the camera bounds: **antennae visibly pop on and off** as the camera moves.

**Fix.** Three passes: all shadows → all bodies (y-sorted) → all antennae and cargo. Sorting 46
workers per frame is nothing. Allocate the antenna budget by distance to the camera centre so the
set is spatially stable, or drop the budget entirely — it is 2 draw calls per worker.

---

## W11 — Cargo is an unattached ellipse in unscaled units (MEDIUM)

**Symptom.** "Carrying indicators look like rendering errors."

**Root cause.** `renderer.ts:1021-1047`. The carried resource is a flat filled ellipse with a
highlight ellipse — no outline, no shadow, no contact with the body:

```
1024   const cx = w.x - Math.cos(w.angle) * 11;
1030   ctx.ellipse(cx, cy + bob, 5, 4, w.angle, 0, TAU);       // food, rx/ry hardcoded
1039   ctx.ellipse(cx, cy + bob, 4.4, 4, 0, 0, TAU);           // water, rotation 0 not w.angle
```

Three concrete defects: (a) the offset `11` and the radii `5, 4` / `4.4, 4` are **not multiplied by
`w.scale`**, so on a 0.9-scale worker (body half-length 9.9) the blob sits past the abdomen tip and
detaches; (b) the water blob uses rotation `0` while food uses `w.angle` — inconsistent; (c) at
10 × 8 units with a 2.6-unit specular dot it reads as a floating bead, not as something gripped.
The 20-unit body's wing case ends at `-0.55L = -11`, so the blob is centred exactly on the abdomen
tip — the worst possible place for "is it attached?".

**Fix.** Scale the offset and radii by `w.scale`; draw the cargo *behind* the body in the same pass so
the abdomen overlaps its front edge; add a 1-unit dark rim (`PAL.ink`) so it separates from the
shell; use `w.angle` for both kinds. Consider an over-the-back silhouette notch instead of a bead.

---

## W12 — Corpses and nymphs render wrong (MEDIUM)

- **Every corpse is drawn as an adult worker.** `renderer.ts:956`:
  `this.blitRoach(1, DEAD_FRAME, c.x, c.y, c.angle, c.scale)` — row is hardcoded `1`. A nymph killed
  at `nymphTime = 3` has `scale = 0.775` (`workers.ts:85`), so it renders as a shrunken *brown adult*
  where a pale nymph died. `Corpse` (`types.ts:146-156`) carries no type field to fix this with.
- **The 41st corpse deletes the oldest instantly.** `workers.ts:52`:
  `if (world.corpses.length > 40) world.corpses.shift()`. Normal removal is at `age > 95`
  (`threats.ts:368`) after a 22 s fade (`renderer.ts:955`), so the capped one vanishes mid-frame at
  92 % opacity. During a spray or a sweep this is a visible pop.
- **Nymph → adult is a one-frame pop.** At the instant `nymphTime` crosses zero the sprite switches
  row 2 → row 1 (`renderer.ts:1003-1004`): pale `NYMPH_PAL` at `L = 13` becomes dark `WORKER_PAL` at
  `L = 20` — a **+54 % size jump and a full palette change in one frame**.

**Fix.** Add `type: 'worker' | 'nymph'` to `Corpse` and pass it to `blitRoach`. Replace the `shift()`
with "kill the oldest by forcing `age = 95`" so it fades. Cross-fade the nymph/adult rows over the
last 0.5 s of `NYMPH_TIME`, or use the growth scale (W3) to make the transition continuous.

---

## W13 — Six sim states, one and a half visual states (MEDIUM)

`WorkerState` (`types.ts:12-13`) has seven values. The renderer branches on state exactly **twice**
(`grep "w\.state" src/render/renderer.ts`):

| state | visual distinction | watchdog |
| --- | --- | --- |
| `idle` | none | yes — `lostTime > 5` → `redistribute` (`workers.ts:133-137`) |
| `outbound` | none | partial — only when off-trail (`workers.ts:162-175`); **none** while on-trail |
| `harvest` | none (body freezes, gait still runs at 0.4/s) | `timer` only |
| `inbound` | cargo bead (W11) | **none** in the no-route branch (W8) |
| `panic` | antenna sweep ×2.4 — **only if inside `ANTENNA_BUDGET`** (`renderer.ts:1018`) | **none** (W7) |
| `trapped` | adhesive strands drawn in `drawHazards` (`renderer.ts:823-839`) — i.e. **under** the bodies, since `drawHazards` runs at `renderer.ts:162` before `drawBodies` at 164 | `timer` → death |
| `dying` | — | **unreachable**: `grep "'dying'" src/` matches only the type declaration. Nothing sets it, and the `switch` at `workers.ts:105` has no case, so it would fall to `default: break` with `dirX = dirY = 0` → the worker freezes alive forever, still counted in `population`. A latent trap. |

So a panicking roach past the 30-antenna budget is pixel-identical to a hauling one, and a trapped
roach is a normally-walking roach with strands *behind* it.

**Fix.** Give panic a real read (body tilt, faster gait, a short dust puff), draw trap strands after
bodies, and either implement `dying` or delete it from the union.

---

## W14 — Legs clip into cabinetry by 9–13 units (MEDIUM)

`collideCircle(w.x, w.y, WORKER_RADIUS)` (`workers.ts:373`) keeps the *centre* 8 units from a solid
edge, but the hind tarsus reaches 21.1 units behind the centre and the mid tarsus 16.6 units
laterally. A worker with its back to a cabinet therefore has its hind legs **13 units inside** the
cabinet; one running parallel to a wall clips **8.6 units**. At play zoom that is 11–16 px of roach
inside the furniture, and cover-hugging is the behaviour the whole exposure design encourages
(`field.ts:180-188`), so it happens constantly.

**No true penetration of the body centre was observed** — `isInsideSolid(w.x, w.y)` was false on
100 % of samples across both runs (46 workers × 70 s and 9 workers × 90 s). Ordering is correct:
separation edits the heading (line 356) → integrate (371-372) → `collideCircle` resolves (373-382),
so separation can never push a worker through a wall.

**Fix.** Either raise `WORKER_RADIUS` toward 12 (accepting the throughput cost on narrow gaps) or
shorten the drawn hind leg. Raising the radius also helps W1/W2.

---

## W15 — Departures happen in synchronised bursts of 7–12 (MEDIUM)

**Symptom.** The column forms fully-packed at the nest door, instantly.

**Root cause.** `workers.ts:458`: `if ((world.tick + w.variant * 7) % 18 !== 0) return w.routeId >= 0;`
with `variant = rng.int(0, 3)` (`world.ts:230`). Only **four** phase groups exist —
`variant * 7 mod 18 ∈ {0, 7, 14, 3}` — so a quarter of the colony evaluates route acquisition on the
same tick, from within 22 units of the same nest (`world.ts:214-215`), scoring the same routes with
near-identical `d2`.

**Measured** (34 workers, one route, 60 s): only **4** acquisition events, of sizes
**12, 10, 9, 7** — mean 9.5 workers departing on a single tick; 100 % of events had ≥ 3.

**Repro.** `scratchpad/states.repro.ts`, test `route acquisition burst…`.

**Fix.** Use a per-worker random phase (`w.acquirePhase = rng.int(0, 18)`) rather than deriving it
from a 4-value field, and add a per-nest departure cooldown (~0.25 s) so a burst becomes a stream.
Combined with W1's follow-distance rule this is what converts the column into traffic.

---

## Answers to the seven questions, indexed

1. **Why a single-file conga line?** → **W1** (separation is normalised away; zero closing-speed
   correction at any distance; measured median longitudinal gap 5.1 units on a 20-unit body) plus
   **W2** (17-unit radius vs 33-unit legspan) and **W3** (identical sprites). Separation force is not
   merely weaker than path attraction — along the direction of travel it is *exactly zero*.
2. **Queueing / reservation?** → **None. W5** (the 0.12 brake is dead code, overwritten at line 229;
   waiting workers orbit at 73.9 u/s) and **W6** (`busy` never incremented on entry; measured 8/4).
   The 5th..Nth workers do not queue — they circle the endpoint at full speed, up to 18 within 70
   units, and `busy` is never rendered at all.
3. **Stuck states / watchdogs.** → **W13** table. No watchdog: on-trail `outbound`/`inbound`,
   no-route `inbound` (**W8**, 20.6 % never delivered in 90 s), `panic` (**W7**, permanent), `dying`
   (unreachable, would freeze forever). A worker whose route is deleted mid-transit goes through
   `releaseWorkers` (`pheromone.ts:62-71`) → keeps cargo, `state = 'inbound'`, `routeId = -1` → the
   unwatched straight-line walk of W8.
4. **Rendering / cargo / draw order / facing.** → **W11** (cargo is an unscaled floating ellipse,
   code quoted), **W10** (shadow-over-neighbour, antenna budget churn; order is stable but unsorted).
   Facing comes from velocity with a threshold of 4 against speeds of 118–148
   (`workers.ts:384-385`), so it does not flicker at low speed — it flips at *full* speed at the
   resource endpoint, measured **0.90 reversals > 90° per second** at one node (**W5**).
5. **Do workers penetrate solids?** → The centre never does (0 % of samples); separation is applied
   before collision, which is the correct order. But the drawn legs do, by 9–13 units (**W14**).
6. **Are corpses / nymphs / panicking / trapped distinguishable?** → Corpses yes (pose + fade) but
   always drawn as adults (**W12**); nymphs yes until a one-frame pop (**W12**); panicking only via
   antenna amplitude and only for the first 30 bodies (**W13**); trapped only via strands drawn
   underneath everything (**W13**).
7. **Enough per-worker variation?** → **No — W3.** Eight distinct images for the whole colony, one
   palette, and `scale` forced to 1.000 for every hatched worker by the nymph ramp.

## Suggested order of repair

`W6` and `W5` are one-line and three-line fixes with immediate visible payoff. `W1` + `W2` are the
structural fix and must land together (raising the radius without fixing the normalisation does
nothing). `W3` and `W9` are what make the fixed spacing legible. `W7` and `W8` remove the two
permanent stalls. `W10`–`W14` are polish once the movement is right.

## Repro artefacts

Throwaway, in
`/private/tmp/claude-501/-Users-jeongyeong-yeon-Documents-LOCAL-bug-game/4d470ed7-d200-410f-8106-392e84c32ebb/scratchpad/`:
`base/` (pinned `git archive 3242189` checkout), `conga.repro.ts`, `stuck.repro.ts`,
`states.repro.ts`, `workers.repro.ts`, `base/vitest.repro.config.ts`.
Run: `cd <scratchpad>/base && npx vitest run --config <scratchpad>/base/vitest.repro.config.ts`.
