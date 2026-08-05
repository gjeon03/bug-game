# GAUNTLET_STATE

Live production state. Updated before the end of every turn. If this file disagrees with a summary
written in chat, this file is correct.

**Branch** `experiment/isometric-threejs-rebuild` · **origin/main..HEAD** `0 12` — twelve local
commits, **zero pushes**. Run `git log --oneline -1` for the exact HEAD; this file deliberately does
not carry a hash it would have to amend a commit to keep accurate.

---

## Current phase

**Phase 6–8 of the implementation sequence** — the three.js proof scene exists, has been critiqued
by two independent fresh-context agents, and is being corrected against their verified findings.
Map expansion is gated on those corrections, per the brief's "do not expand the whole map until
independent reviewers confirm".

**Active owner** — main integration owner (me), sequential, for every coupled system: camera +
occlusion, lighting + materials, scout movement + animation, renderer + profiling. Parallel agents
are read-only research and criticism only.

---

## Running background work

| Task ID | What | Status |
| --- | --- | --- |
| `wr664wcb3` | Workflow `kitchen-zone-research`: 8 parallel zone researchers → traversal graph → integrated layout spec | **running** |

Completed and already consumed:

| Task | Result consumed |
| --- | --- |
| Repository reuse audit | 59 % of TypeScript survives; sim is renderer-agnostic (0 DOM hits in 8,071 lines); three 3D blockers identified |
| Test suite audit | 170/179 cases survive a renderer change; `i18n.test.ts:5` imports `render/props.ts` and would take 23 locale invariants down with it |
| Asset pipeline research | Blender obtainable but unnecessary for a hexapod; KTX2 unavailable via Homebrew; Kenney 3D rejected on texel density |
| Visual critic #1 (proof-10) | 7 gates: 2 PASS / 1 MARGINAL / 4 FAIL. Ranked five gaps. |
| Visual critic #2 (proof-12 verification) | Caught a **false verification** of mine — see below |

---

## Verified defects, ranked by player impact

Ranked by how much each costs the player, not by how easy it is to fix.

| # | Defect | Status | Evidence |
| --- | --- | --- | --- |
| 1 | **The frame shows a fragment of a kitchen, not a kitchen.** Drain, jar, towel and 97 % of the detergent bottle are outside the crop; seven of eight zones do not exist. | **OPEN** — blocked on `wr664wcb3` | Critic #2 Part D3 |
| 2 | The cabinet face was a flat dark region, 14.7 % of frame at 1.15 levels internal variance | **CLOSED**, controlled comparison | patch sd 0.00429 → 0.01483 (3.5×); high-pass 0.00060 → 0.00287 (4.8×); dominant colour 17.5 % → 15.3 %; unique colours 18 594 → 19 118; GPU cost +0.02 ms |
| 3 | Worktop carried no material information | **CLOSED**, measured | patch sd 0.00215 → 0.02152; high-pass sd 0.00062 → 0.00526; dominant colour 53.1 % → 17.5 % |
| 4 | Roaches read as spiders/ticks | **CLOSED** | Critic #2: "definitively not as spiders or ticks any more" |
| 5 | Seam and stripes z-fighting into dashed lines (**a defect I introduced**) | **CLOSED** | Markings moved into vertex colours; no coplanar geometry exists |
| 6 | Pronotum was a separate box overhanging the shell by 0.71 mm/side — "the waist relocated to the shoulder" | **CLOSED** | Same fix |
| 7 | Legs not actually on the thorax (**my claim was false**: measured 24/35/47 % back) | **CLOSED** | Now 19/29/39 % |
| 8 | Legs ended in blunt flat-cut cylinders in mid-air | **CLOSED** | Tarsus segment added |
| 9 | Player marker colour-confusable with food at 6.0 % RGB distance | **CLOSED** | Marker moved toward amber, ~19 % distance |
| 10 | Debug overlay burned into evidence frames | **CLOSED** | F3 toggle, default hidden; numbers exposed as data via `window.__proof` |
| 11 | Pheromone ribbon ended in a blunt guillotine cut | **CLOSED** | Width tapers to zero at both ends |
| 12 | Player-facing English `2 tiles` shipped to production | **CLOSED** | Routed through `t('hud.guide')`; source-literal scan added |
| 13 | Prop interpenetration and props standing inside the sink aperture | **CLOSED in source**, not yet shown in evidence | Clearance measured at 198.1 mm vs 148.5 mm required |
| 14 | Cabinet too dark to show its own texture (mean 0.098) | **CLOSED, criterion partially met** | Motivated floor bounce: mean 0.0981 → **0.1426** (+45 %), high-pass 0.00287 → **0.00394** (+37 %). My own pass mark was mean > 0.15; it landed at 0.1426 and I stopped rather than chase the number — see hypotheses. |
| 15 | Head still not distinct from thorax | **OPEN**, low impact | Critic #2 Part 1c |
| 16 | Crumbs are hard-faceted polygon shards | **OPEN**, low impact | Critic #1 §1.9 — inherited bake-library geometry |

---

## Root-cause hypotheses in play

**Defect 2 — CONFIRMED and closed.** The prediction was that albedo + normal would move the
cabinet's high-pass by roughly the order the worktop moved (×8.5). Measured **×4.8** — same order, so
the hypothesis holds. The gap between 4.8 and 8.5 is explained by the alternative hypothesis being
partly true as well: the cabinet face genuinely receives very little direct light, which is why its
mean luminance FELL rather than rose when detail was added. That is tracked as defect 14 rather than
quietly declared solved.

**Defect 14 — CONFIRMED, criterion partially met, and one honest miss recorded.**

The first attempt produced a cabinet patch identical to **seven significant figures** while 4.5 % of
the frame changed elsewhere. That is not "a small effect", it is "no effect", and it was a direction
sign error: `multiplyScalar(-600)` put the light above and behind, lighting the worktop instead. A
surface is lit when the vector to the light has a positive dot with its normal; the cabinet front
faces +Z, so the light must sit at positive Z and negative Y. Same class of bug as the roach legs
and antennae, found the same way — by evaluating the vector rather than trusting the number.

Intensity was then swept rather than eyeballed:

| intensity | patch mean | patch high-pass |
| --- | --- | --- |
| 0.5 | 0.1146 | 0.00326 |
| 1.0 | 0.1304 | 0.00365 |
| 1.4 (shipped) | **0.1426** | **0.00394** |
| 1.6 | 0.1485 | 0.00410 |

High-pass **rises** monotonically with intensity across the whole range, so there is no wash-out knee
here — the constraint is aesthetic, not technical. **My stated pass mark was mean > 0.15 and the
shipped value is 0.1426, so the criterion was missed.** I stopped at 1.4 because 1.6 is 68 % of the
key light's intensity, which is not a bounce any more, and flooding a night kitchen to hit a number I
invented would be the wrong trade. Recorded as a miss rather than moved.

---

## Next controlled comparison

**Done this turn — results above.** Next comparison belongs to the kitchen build: capture the first
BUILD ORDER increment from `wr664wcb3` against `proof-19` as the before, at identical camera and
placement, and check that adding six zones does not push GPU p99 past the budget.

Method, anchored to the material rather than to a screen rectangle:

```
magick <frame> -crop 200x150+320+800 +repage \
  \( +clone -blur 0x12 \) -compose difference -composite \
  -format "%[fx:standard_deviation]" info:
```

Cabinet patch now: high-pass **0.00394**, mean **0.1426** (proof-19).

The lesson that produced this method: I previously reported a 15× improvement measured on a fixed
screen rectangle across a deliberate camera move. The rectangle no longer contained countertop, so
the variance came from a geometry edge. **Never measure a fixed screen rect across a camera change.**

---

## Latest evidence and tests

| What | Path / value |
| --- | --- |
| Proof scene iterations | `artifacts/evidence/isometric-reboot-proof/proof-01 … proof-19` |
| Old-build baseline | `artifacts/evidence/isometric-reboot-baseline/01-old-canvas-initial-real-chrome.jpg` |
| Occlusion cases | `proof-13-occluded.png`, `proof-13-restored.png`, `proof-13-multi-occluder.png` |
| Unit tests | **180 passing** (15 files) — includes 10 occlusion cases and 6 perf-verdict cases |
| Lint / typecheck | clean |
| Real-GPU profile (idle, M1, 1920×1080) | proof-19: presented p50 16.70 / p99 18.30; **CPU p99 ~3.8; GPU p99 10.56**; draw 615, geom 71, tex 13 |
| Perf verdict | 11/11 lines PASS, GPU timing available with 300 samples |

**The measurement that matters most right now:** GPU p99 is 10.56 ms of a 16.7 ms budget with only
the sink fragment built. Remaining headroom for seven more zones is ~5.6 ms, not ~13 ms.

---

## Unresolved completion gates

| Gate group | State |
| --- | --- |
| New identity — zones recognizable without labels, kitchen looks occupied | **FAIL** — one zone exists |
| Camera and visibility | **PASS in unit tests**, 10 cases; multi-blocker unverified in-scene (layout produces max 1) |
| Gameplay — first action, first delivery, routes, growth, adaptations, threats | **NOT STARTED** — no loop wired |
| Cockroaches — reads as cockroach, cargo readable, no stale state | **PARTIAL** — silhouette closed, cargo untested, restart untested |
| Korean — all text from catalog, font verified at four resolutions | **PARTIAL** — proof scene copy still hardcoded |
| Assets — every element classified, no temporary | **FAIL** — 7 temporary rows in `ASSET_MANIFEST.md` |
| Technical — install, typecheck, lint, unit, build, nested path, E2E, console, restart | **PARTIAL** — first five pass; nested-path and E2E not run against the 3D build |
| Performance | **PASS for the fragment**, with the headroom caveat above |
| Repository safety | **PASS** — 10 commits, 0 pushes, 0 merges, 0 PRs, 0 deployments |

---

## Exact next executable action

Consume the `kitchen-zone-research` workflow (`wr664wcb3`) the moment it lands and build the first
increment of its BUILD ORDER — chosen so a critic can look at it immediately rather than only at the
end. That closes defect 1, the highest-impact open item.

Defect 14 is closed, so there is no standalone visual action queued. If `wr664wcb3` has not landed
by the start of the next turn, the next action is defect 16 (crumbs render as hard-faceted polygon
shards) — a bake-library geometry fix that does not touch the layout the workflow is specifying.
