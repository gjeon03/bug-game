# Independent visual critique — redesign-final

Reviewer: independent (did not implement). Method: read every PNG in `visual-sweep/`, `scripts/tmp/runA/`,
`scripts/tmp/run1/`, and the baseline `07-mid-run.png`; cropped and brightened regions to resolve detail;
then read `solids.ts`, `props.ts`, `renderer.ts`, `palette.ts`, `kitchen.ts`, `ART_BIBLE.md`.
Audited against ART_BIBLE.md §"Legibility rules added by the redesign" (rules 1–7).

---

## 0. What genuinely improved

This is not a wash. Measured, against the frame the redesign was judged on:

| Metric | baseline `07-mid-run.png` | redesign frames |
| --- | --- | --- |
| Featureless area (32px blocks, σ<3, HUD excluded) | **67.3 %** | 32.6 – 66.4 %, median **52 %** |

- **The scent ribbon is a real fix.** `renderer.ts:712-748` — three-pass stroke (bloom/body/core) plus a
  travelling dash, colour-coded by state. In `b-trail-ribbon.png` it reads as one continuous object with a
  direction. The old per-node glow chain is gone. This was the single most debug-looking element and it is
  solved.
- **Roach anatomy is good.** `crop` of `b-trail-ribbon.png` at 3× shows tapered abdomen, segmented plates,
  six legs, antennae, a specular streak, and a soft contact shadow (`renderer.ts:1085-1088`). Individually
  these are convincing insects, not blobs.
- **The nest is no longer a ring.** `renderer.ts:565-576` draws a torn 16-gon void; claimable nests get
  opposing chevrons (`:590-601`) instead of another dashed circle; function reads from the contents
  (eggs / cache grid / bolthole tunnel). In `run1/final.png` the nest is the most legible object in frame.
- **Several fixtures now name themselves.** The stove is unmistakable in `e-stove.png` (four burner rings
  with grate arms, `props.ts:238-258`). The sink reads from drain + sponge + U-bend in `c-sink.png`. The
  outlet in `f-fridge.png` is instantly nameable.
- **Lighting is mostly motivated.** `kitchen.ts:280-291` anchors all six sources; the fridge seam has an
  actually-drawn emitter (`solids.ts:365-378`).
- **Scale band is populated.** `props.ts` adds ~25 prop kinds in the 30–300u band. Crumbs beside a roach in
  `e-stove.png` do the scale job the baseline never did.

Everything below is what is still wrong.

---

## 1. Findings

| # | Symptom | Evidence | Severity | Confidence |
| --- | --- | --- | --- | --- |
| 1 | **Every frame in the evidence package was rendered from a stale build that predates the art fixes.** The `waterRing` rewrite, the prop-size reductions and the territory changes exist only in the uncommitted working tree. | `git status`: `M src/render/props.ts`, `M src/sim/kitchen.ts`, `M src/sim/territory.ts`. `grep -c '150,200,235,0.30' dist/assets/index-D8LNA7xW.js` → **1** (old concentric-stroke code present); `grep -c '96,150,186\|206,238,255'` → **0** (new puddle code absent). dist built 23:37, frames captured 23:38–23:40. | **blocker** | high |
| 2 | Consequence of #1: the frames show **concentric elliptical outlines with scattered round dots** — the exact selection-marker vocabulary rule 6 exists to delete. Brightened crop of `f-fridge.png` +560+150 shows two closed smooth ellipse strokes and 6 filled circles: byte-for-byte the pre-fix `waterRing`. | old code visible in `git diff src/render/props.ts` (removed lines): `ellipse(0,0,hw*0.9,hh*0.9,0,0,TAU); stroke()` then `ellipse(0,0,hw*0.62,hh*0.6,...)`; 6 droplets via `g.arc`. Rule 6, ART_BIBLE.md:228-241. | **blocker** | high |
| 3 | They are also **oversized**: the uncommitted fix shrinks them 190×130→118×82, 200×150→132×96, 170×130→104×78. The frames show the large version — ~200u wide, i.e. ~8 scout-bodies of pure outline. | `git diff src/sim/kitchen.ts:176-177, 212, 240` | **blocker** | high |
| 4 | **Five of the eight nameable fixtures share one material value; three of them share one draw path.** `counter`, `sink`, `pantry`, `island` are all `mat:'cabinet'` → base `#1c252e` (R=28). `stove`, `fridge`, `dishwasher` are all `mat:'steel'` → `#39454f` (R=57). Rule 2's "20 → 74 spread" is true of *material families* and does nothing to separate *fixtures*. | `kitchen.ts` roles vs `solids.ts:59-68`. `solids.ts:410-412` — `case 'counter': case 'pantry': case 'island':` is a single shared block; only pantry gets a 6-line differentiator (`:443-449`). | **blocker** | high |
| 5 | **`g-island.png` is 66.4 % featureless — the baseline was 67.3 %.** The island region did not improve at all, and that number is *flattered* by the adaptation modal covering the centre. The island reads as a black slab. | measured; `g-island.png`; cause is #4 — island falls through to generic door panels. | high | high |
| 6 | **Cargo is a floating dot, and often invisible.** Food cargo is a 5×4 world-unit ellipse; moisture cargo is 4.4×4 in `rgba(150,205,235)` — cold blue, drawn on a cold blue ribbon, over a cold blue floor. In `b-trail-ribbon.png` six workers are on an active line and **not one shows visible cargo**. | `renderer.ts:1104-1122`. Scout body is 26u (ART_BIBLE:17), so cargo is ~0.2 body-lengths ≈ 6 px on screen. Contradicts ART_BIBLE:100 "a visible cargo blob rides the back". | high | high |
| 7 | **Roaches read as a chain, not as separate animals.** There is exactly one worker sprite row and 8 gait frames — no body-size, pose, colour or scale variation between individuals. In the 3× crop of `b-trail-ribbon.png` six roaches are the same sprite at different rotations, bunched nose-to-tail in overlapping pairs. In `run1/final.png` nine roaches ring the nest in identical poses and read as stamped decals. | `renderer.ts:43` `ROACH_ROWS = {scout:0, worker:1, nymph:2}`; `atlas.ts:17` `GAIT_FRAMES = 8`; `atlas.ts:252` `rows = 3`. | high | high |
| 8 | **The player marker is a traced ellipse outline** — a selection ring by any other name. Rule 6's own table says the player is "warm rim-light". | `renderer.ts:1150-1154`: `strokeStyle rgba(PAL.warm,0.85); lineWidth 2.4; ellipse(-1,0,16,8.4,0,0,TAU); stroke()`. Visible as a hard tan oval in the `f-fridge` crop. | high | high |
| 9 | **The exposure telegraph is a radial progress meter drawn in world space** — a red arc sweeping from 12 o'clock, unattached to any emitter or impact point. In the `f-fridge` crop it reads as a stray debug stroke. ART_BIBLE:143-145 specifies a *contracting ground decal*; this expands and sweeps. | `renderer.ts:1178-1186`: `arc(s.x, s.y, r, -PI/2, -PI/2 + TAU*s.spotted)` with `r = 30 + spotted*22`. | high | high |
| 10 | **The evidence package cannot answer the questions it was assembled to answer.** 3 of 9 sweep frames (`g-island`, `h-bin-door`, `i-pantry`) have the adaptation modal covering the centre of frame, hiding the fixture they are named after. Both "mid-run milestone" frames (`runA/op2.png`, `op3.png`) are **full-screen interstitial modals with the world blurred to near-black** — zero gameplay visible. `runA/op4.png` and `runA/final.png` **do not exist**. | `ls scripts/tmp/runA/` → `op2.png op3.png` only. | high | high |
| 11 | **No victory frame exists anywhere in the package**, so "does the final frame communicate *the kitchen is infested*" is unverifiable. `scripts/tmp/run1/final.png` is not an ending — it is a mid-run frame at `FOOD ⚠ CRITICAL 15/120`, colony 8/23, threat `CALLING IT IN · 82`, with the adaptation modal open. | `run1/final.png`; victory path exists in code (`renderer.ts:1258-1260` lighting lift, `overlays.ts:193` `<h2>Victory</h2>`) but is uncaptured. | high | high |
| 12 | **ART_BIBLE contradicts itself and the shipped art follows the losing side.** Shape language (ART_BIBLE:13): pheromone is "Dotted, granular, non-solid. **Never a hard line**". Rule 7 (ART_BIBLE:242-247) makes it a continuous three-pass stroke. The result in `b-trail-ribbon.png` reads as a glowing cable, not as a smell. | ART_BIBLE.md:13 vs :242-247; `renderer.ts:712-731`. | med | high |
| 13 | **Sealed nests are still a dashed ring** — the one nest state rule 6 did not convert. Visible as the dotted ellipse around the black blob in `i-pantry.png`. | `renderer.ts:545-551`: `setLineDash([4,7]); ellipse(n.x,n.y,R*0.8,R*0.6,...)`. | med | high |
| 14 | **Two of six lights have no drawn emitter, and both sit *outside* their fixture.** `dishwasherLamp` at x=560; the dishwasher spans x 56–556 → 4u onto the open floor, and `solids.ts:291` draws no lamp. `binGlow` at y=2440; `trashBin` spans y 2020–2420 → 20u below it, and a bin is not an emitter. Rule 4's own comment mocks the old build for putting a glow "84 units outside the sink cabinet". | `kitchen.ts:286, 290` vs `kitchen.ts:90-94, 137-141`; no `lamp`/`led` in `solids.ts`. | med | high |
| 15 | **Antenna identity is budgeted away exactly when the colony gets interesting.** Antennae are dropped past 30 on-screen roaches, but ART_BIBLE:104 calls antenna motion "the identity". Op-3 colony is 26 and rising. | `renderer.ts:45` `ANTENNA_BUDGET = 30`; `:1093-1096`. | med | med |
| 16 | **`f-fridge.png` contains no identifiable refrigerator.** The only nameable objects are an outlet, a cable and crumbs. Whether the camera is simply mis-framed or the fridge face is unreadable at this distance, the frame does not do the job it is filed under. | `f-fridge.png` | med | high |
| 17 | **Grout weight is inconsistent within one frame** — the vertical seam is a wide flat black bar, the horizontal is a hairline plus a separate wide band, and neither has a recess bevel or dirt. ART_BIBLE:68 specifies "sharp grout recess". | `crop-fridge-rings` region of `f-fridge.png` | low | med |
| 18 | The floor's diagonal streak texture tiles visibly across open areas — the same three-stroke smear repeats at a fixed angle in `c-sink.png`, `f-fridge.png`, `e-stove.png`. | `scuffMark` `props.ts:679-695` (5 strokes, fixed `lineCap`/width) placed at only 4 authored positions, plus the material pattern tile. | low | med |

---

## 2. Direct answers

**1. Does every frame read as a lived-in kitchen?**
Identifiable from art alone: **sink** (drain + sponge + U-bend), **stove** (burners + grates — the best
fixture in the game), **bin** (wheels + liner), **doorway** (hall spill through the bottom-wall gap),
**baseboards/crack** (`baseboardGap`, genuinely good). Not identifiable: **dishwasher** (a panel with two
dots and a bar — could be any appliance), **refrigerator** (absent from its own frame, #16), **pantry**
(only a 6-line shelf tell separates it from a counter), **island** (a black slab, #5). Four of nine.

**2. Object scale — does anything say the player is ~2 cm?**
Yes, where props are present: crumbs in `e-stove.png`, the sponge in `c-sink.png`, kibble, the outlet. It
fails in open floor, where the only scale cue is grout spacing, and it fails badly around the oversized
water rings (#3), which at 200u read as architecture rather than as spilled water.

**3. Could a player navigate by memory?**
Partially. The stove, sink and doorway are landmarks. The centre of the map is not — `g-island.png` at
66.4 % featureless has nothing to steer by, which is the region the ART_BIBLE comment at `kitchen.ts:236`
("the open middle: landmarks so the plain is navigable") was explicitly meant to fix. It did not.

**4. Material separation after the darkness multiply?**
The *families* separate (R = 20/28/44/57/74, verified). The *fixtures* do not — see #4. Five fixtures at
R=28, three at R=57. All fixture identity rests on the role bake, and three roles share one bake.

**5. Lighting motivation?** Four of six sources are properly anchored; two are not (#14).

**6. Depth?** The foreground-occluder system is real and correct — `props.ts:56` `foreground: lift >= 16`
draws lifted props after entities, with height-offset contact shadows (`:39-48`). Toe-kick voids and the
plinth line are present. I could not confirm a roach visibly passing *under* a slipper in any captured
frame, because no frame contains a roach adjacent to a lifted prop. Unverified, not disproven.

**7. Empty areas?** Median 52 % featureless, range 32.6–66.4 %. Purposeful in the sink and dishwasher
frames, where negative space frames a dense fixture. Not purposeful at the island (#5).

**8. Procedural repetition?** The single worker sprite (#7) is the loudest. Then the floor streak tile
(#18), the identical `handleBar` on every cabinet door (`solids.ts:425, 428`), and the 4-arm burner grate
repeated at fixed rotation `0.4` across all burners (`props.ts:252`).

**9. Worker readability?** Separate animals individually; a chain in aggregate (#7). Cargo is not
recognizable (#6).

**10. Threat telegraph and ribbon?** Ribbon: legible, the strongest element in the game. Telegraph:
debug-looking (#9).

**11. UI hierarchy?** The HUD itself is disciplined — four fixed corners, icon+shape+fill+number, and it
does not compete with the world. The failure is the **adaptation modal**: a 700×190 px card parked across
the exact centre of the play field, over the player, in `g/h/i-pantry` and `run1/final.png`. During peak
action that is the least acceptable place to put it.

**12. Remaining placeholder/debug-looking elements?** Three, quoted in #2, #8, #9:
- `props.ts` (HEAD) `waterRing`: `g.ellipse(0,0,hw*0.9,hh*0.9,0,0,TAU); g.stroke();` ×2 concentric + 6 `g.arc` dots
- `renderer.ts:1153` `ctx.ellipse(-1, 0, 16, 8.4, 0, 0, TAU); ctx.stroke();`
- `renderer.ts:1183` `ctx.arc(s.x, s.y, r, -Math.PI / 2, -Math.PI / 2 + TAU * s.spotted);`

**13. Victory payoff?** Cannot be assessed — no victory frame was captured (#11).

---

## 3. Prioritised fixes

**P0 — the evidence is invalid until these are done**

1. **Commit `props.ts`, `kitchen.ts`, `territory.ts`, rebuild, and recapture the entire sweep.** Nothing
   below can be trusted until the frames come from the code under review. Add a capture-time assertion that
   the bundle hash matches `git rev-parse HEAD` — commit `e0ab799` claims to have closed the stale-dist
   hole; it is open again.
2. **Recapture `g/h/i` with the adaptation modal dismissed**, and capture `runA/op4` and a real
   `runA/final` at a *victory* end state, mid-world, no modal. Without these, questions 1, 3, 7 and 13 have
   no evidence.

**P1 — fixture identity**

3. **Give `island` its own case in `solids.ts:410`.** An island is not a wall-run cabinet: draw a
   counter-top overhang lip on all four sides, a visible end-panel, two stool feet, and a toe-kick recess on
   the room-facing side only. Target: `g-island.png` under 45 % featureless.
4. **Split fixture base values off material values.** Add an optional `tone` multiplier per solid so
   `sink`/`counter`/`pantry`/`island` land on distinct R values (e.g. 24/28/34/40) while still reading as
   the cabinet family. One line at `solids.ts:69`.
5. **Draw the dishwasher's status lamp and move `dishwasherLamp` inside the fixture** (x≈500). Same for
   `binGlow` — either move it to y≈2380 with a drawn lid-gap slit, or delete it.

**P2 — the colony**

6. **Cargo: 3× the size and re-colour.** Food cargo to ~14×11 units; moisture cargo must not be cold blue —
   use a bright bone/white droplet with a dark rim so it survives both the cold floor and the cold ribbon.
   Add a 1px dark outline so it separates from the carapace. `renderer.ts:1104-1122`.
7. **Break the chain.** Three cheap, independent measures: (a) per-worker `scale` jitter ±12 % seeded from
   worker id; (b) a per-worker gait phase offset so the 8 frames desynchronise; (c) a minimum separation in
   the follow behaviour so workers stop overlapping nose-to-tail. (a) and (b) are 2 lines each in
   `renderer.ts:1082-1091`.
8. **Replace the scout's traced ellipse** (`renderer.ts:1150-1154`) with an actual rim-light: sample the
   sprite alpha edge and stroke only the 180° away from the nearest light, or drop the stroke and raise the
   warm ground pool from 0.3 to ~0.45. A closed outline around the player is the one ring the player sees
   every frame.
9. **Rebuild the exposure telegraph** as rule 6/ART_BIBLE:143 specifies: a `danger`-coloured ground decal
   that *contracts* toward the scout over the warning window, not a radial progress arc.
   `renderer.ts:1178-1186`.
10. **Raise `ANTENNA_BUDGET` to ~60** or make it distance-weighted (full antennae within 400u of the
    camera centre, dropped beyond) so the identity feature survives a real colony. `renderer.ts:45`.

**P3 — polish**

11. **Move the adaptation modal off the play field** — dock it to the lower third or shrink to a
    right-hand rail. It currently covers the player.
12. **Resolve the ART_BIBLE contradiction** (#12). Recommend amending the shape-language row at
    ART_BIBLE:13 to match rule 7, and adding low-amplitude perpendicular noise to the ribbon's core pass so
    it reads as secreted rather than drawn.
13. **Convert the sealed-nest dashed ring** (`renderer.ts:545-551`) to the chevron vocabulary already used
    for claimable nests, inverted — chevrons pointing *outward*, plus the paint crust that is already there.
14. Unify grout to a single recessed profile (dark core + 1px lit lip) and vary `scuffMark` angle by
    position noise.

---

## 4. Symptom vs. guessed cause

Stated as **fact** (verified in code or bytes): #1 (grep of the shipped bundle), #2, #3 (git diff), #4
(role→mat table), #5 (measured), #6, #7, #8, #9, #10, #11, #13, #14, #15 (all read directly from the
cited lines).

Stated as **inference**: #16 — I can see no fridge in `f-fridge.png`, but I cannot tell from a single frame
whether the cause is camera framing or an unreadable fridge face. #18 — the repetition is visible; my
attribution to `scuffMark` plus the material tile is a guess. #17 — the inconsistency is visible; whether it
is authored or an artefact of two solids abutting, I did not confirm.

**Not assessed for lack of evidence:** victory payoff (#11), foreground occlusion in practice (Q6), and any
frame from operations 3–4 of a real run.
