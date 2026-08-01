# 05 — Environment & Visual Storytelling Audit

Read-only. Evidence: `artifacts/evidence/shots/*.png`, `artifacts/evidence/redesign-baseline/shots/*.png`,
`src/render/{renderer,atlas,palette,solids,camera,particles}.ts`, `src/sim/kitchen.ts`, `ART_BIBLE.md`.

## Verdict

The player's report is accurate and the cause is structural, not a tuning problem. The kitchen is
**26 axis-aligned rectangles and 15 decals spread over 9.36 million world units**, drawn with five
material bases that span 17/255 in value before a ×0.49 multiply crushes them to a 4-value spread.
Nothing in the map is a *thing* — there is no sink basin, no faucet, no burner, no oven door, no
handle, no dish, no bottle, no baseboard, no doorway. There are labelled rectangles whose labels
never render (`Solid.label` is authored at `src/sim/kitchen.ts:19-48` and read nowhere in
`src/render/`; the only `.label` use is the guide chevron, `renderer.ts:1342`).

`redesign-baseline/shots/07-mid-run.png` is the whole complaint in one frame: four blue-black
rectangles, one roach, a bare polyline, an arc. That is the game's actual gameplay camera.

The circles are not an accident either — the codebase has already diagnosed this locally, twice, and
patched symptom-by-symptom: `renderer.ts:352-354` ("it reads as a bare debug circle floating over the
tile"), `renderer.ts:422-427` ("the circle had become the game's universal verb … adding a sixth
stopped the vocabulary working"), `renderer.ts:273-274` ("a flat grey bar repeated seven times reads
as a loading placeholder"). The vocabulary is saturated; local fixes cannot recover it.

---

## 1. What is actually drawn for each named fixture

Camera: `zoom = clamp(w/1020, 1.15, 2.3)` (`camera.ts:26`) → at 1280 css the viewport is
**1020 × 574 world units = 3.2 × 1.8 floor tiles = ~39 scouts wide**. This is the frame every claim
below is judged at.

| Fixture | Authored as | Rendered as | Recognisable? |
| --- | --- | --- | --- |
| Sink / under-sink | `sinkCabinet` 500×640 `cabinet` (`kitchen.ts:25`) | dark rect, 2 vertical seams, top lip | No. No basin, faucet, drain, trap, pipe, or under-sink void |
| Dishwasher | 500×420 `steel` (`kitchen.ts:26`) | dark rect + horizontal streak noise | No — identical treatment to fridge, differs only in size |
| Stove / oven | 700×500 `steel` (`kitchen.ts:20`) | dark rect + streak noise + one highlight band (`solids.ts:89-98`) | No. No burners, grate, knobs, door, handle |
| Refrigerator | 944×700 `steel` (`kitchen.ts:22`) | same rect, bigger | No — the largest rectangle, nothing more |
| Pantry | 700×424 `cabinet` (`kitchen.ts:27`) | same as counterLeft | No |
| Island / table | `island` 1240×560 `cabinet`; table = 4 × 96u squares (`kitchen.ts:30, 35-38`) | rect; four dots | Island no. Table legs read as debris, no tabletop exists |
| Trash | `trashBin` 400×400 `plastic` (`kitchen.ts:34`) | rect, base `#212a26` vs cabinet `#1a222a` | No — see §material math below |
| Doorway | **does not exist**. `wallBottom` is unbroken across all 3600u (`kitchen.ts:16`) | — | No, yet `hallway` light (`kitchen.ts:90`) implies one |
| Baseboards | **do not exist** anywhere in `SOLIDS` or `DECALS` | — | No — and the victory card says *"Behind the baseboard, under the island, inside the pantry wall"* (`shots/25-outcome.png`) about geometry the player never saw |
| Counter surfaces | no top-surface props exist in `SOLIDS` at all | bare rect | No dish rack, kettle, board, bottle, jar, sponge, towel |

**Material math (why they collapse).** Bases at `solids.ts:56-65`: steel `#232c34`, metal `#262e35`,
plastic `#212a26`, cabinet `#1a222a`, wall `#151c23` — a 17/255 max spread. The scene is then
multiplied by `rgb(125,140,163)` (`renderer.ts:1180-1187`, `base=146`, lift 0) → ×0.49 R. Steel R=35
lands at 17; cabinet R=26 lands at 12. **A 5-value difference decides "dishwasher" vs "pantry".**
That is the measured reason for "empty interchangeable areas".

---

## 2–11. Observable defects

| # | Symptom | Evidence | Sev | Conf |
| --- | --- | --- | --- | --- |
| V1 | No fixture is identifiable without its text label; the map is 26 rectangles | `07-mid-run.png`, `10-patrol-footfall.png`; `kitchen.ts:11-50`; `solids.ts:23-171` (one code path draws all 26) | **Blocker** | High |
| V2 | ~47% of world area is bare tile carrying only a ≤6%-contrast noise layer | `SOLIDS` = 47.8% of 9.36M u²; the only opaque floor detail is 2 mats + 2 vents = 4.8%. `atlas.ts:415-467` alphas 0.03–0.14 | **Blocker** | High |
| V3 | The room's main traffic area (x 700–2600, y 800–2100) contains ~5 decals; ≈90% is bare | `DECALS` `kitchen.ts:67-83`; `05`, `06`, `10`, `07-mid-run` | **Blocker** | High |
| V4 | Zero mid-scale objects (30–300u). Everything is <10u (invisible) or >400u (architecture) | crumbs 1.6–9.6u `renderer.ts:458`; smallest solid 74u `kitchen.ts:49`; next 84u | **Blocker** | High |
| V5 | Only working scale cue is the grout grid; the toe-kick reads as a line, not a 3.5-scout void | grout 14u @320u pitch `atlas.ts:338-354`; toe-kick 34u gradient `solids.ts:124-131` | **High** | High |
| V6 | Light is five floating radial gradients, none of them on the object they are named for | `underSink` (640,1210) is 84u *outside* the sink cabinet (x 56–556); `ovenClock` (1486,640) is 84u *below* the stove (y 56–556); `fridgeSeam` (2570,720) is *left of* the fridge (x≥2600); `hallway` (3340,2560) is *inside* `wallBottom`. `kitchen.ts:86-92` | **High** | High |
| V7 | Solids neither occlude light nor cast a cast-shadow into the room; a cabinet is lit exactly as bright as the tile beside it | `renderer.ts:1201-1215` draws only additive circles into the light canvas; no shadow geometry anywhere | **High** | High |
| V8 | No foreground occluder, no parallax, no elevation, no dynamic depth sort. Nothing ever passes in front of the scout | fixed pipeline `renderer.ts:155-167`; solids are flat tops with a 4px lip `solids.ts:107-115`; a 700u fridge and an 84u chair leg have identical visual height | **High** | High |
| V9 | Floor repeat period is 640u against a 1020u viewport — the same 4-tile block is visible ~1.6× across every frame | `buildFloorTile` 2×2 block `atlas.ts:291-296`; visible as the regular grid in every shot | **High** | High |
| V10 | The baked debris layer is authored at 0.4× and stretched 2.5× — the "domestic clutter" layer is blurrier than the floor under it | `buildDebris(scale = 0.4)` `atlas.ts:416`; drawn 1:1 to world `renderer.ts:192-212` | **High** | High |
| V11 | Amber/warm carries **11 different meanings** simultaneously: scout outline, scout halo, objective ring, objective chevron, route-link ring, nest glow, nest light, upgrade ring, victory ring, crumbs, cargo | `renderer.ts:1056-1079`, `1287-1353`, `719-725`, `576-583`, `1252`, `main.ts:358/375/577`, `renderer.ts:467`, `1028` | **Blocker** | High |
| V12 | **Debug read — dashed rings.** Unclaimed nest = pulsing dashed circle r=R+20; objective = dashed circle r=46 screen px; route ends = 3 ring states separated only by radius (24/22/18) and dash pattern | `renderer.ts:562-572`, `1297-1307`, `719-744`. Visible in `03-first-route.png`, `14-peak-load.png` | **Blocker** | High |
| V13 | **Debug read — solid rings on the player.** Scout carries a traced warm ellipse outline *plus* an 80u additive halo *plus* a shadow *plus* the sprite | `renderer.ts:1056-1082`. In `03-first-route.png` and `14-peak-load.png` this reads as an editor selection highlight | **Blocker** | High |
| V14 | **Debug read — radial progress arcs in world space.** Scout `spotted` arc (r 30→52) and home `integrity` arc (r=R+16) are pie-chart gauges drawn on the floor | `renderer.ts:1101-1109`, `623-630` | High | High |
| V15 | **Debug read — expanding `ctx.arc` strokes.** `particles.ring` is a bare stroked circle; call sites reach **r=1100 centred on the camera** and r=300/260/220/210 | `particles.ts:147-159` + `198-207`; `main.ts:577`, `375`, `580`, `411`, `358`. The huge translucent circle in `22-brood-chamber.png` is `main.ts:358` (`claim`, 12→210) | **Blocker** | High |
| V16 | **Debug read — floating bar gauge.** Remaining-amount bar hovers 46u above each resource with no anchor or backing object | `renderer.ts:428-445`; visible as the orange pip strip in `10-patrol-footfall.png`, `14-peak-load.png` | High | High |
| V17 | **Debug read — untethered ellipses on bare tile.** `ring` decals at (1200,1500) and (2300,900) are stroked ellipses with no object under them. Only the (2700,2216) ring coincides with a real thing (the `petBowl` resource) | `kitchen.ts:80-82` vs `kitchen.ts:174-181`; drawn `renderer.ts:352-378`. The giant floor ellipse in `09-escalation.png` is one of these | **Blocker** | High |
| V18 | **Debug read — bare polylines.** `crack` decals are a 5-segment `lineTo` chain stroked twice, no width variation, no branching, no debris | `renderer.ts:310-324`. The hard-cornered line at bottom-right of `07-mid-run.png` reads as a nav-mesh edge | High | High |
| V19 | Pheromone motes are 16–32u additive balls — comparable in size to the 26u scout — laid at every node. ART_BIBLE demands "granular … never a hard line" | `renderer.ts:663-682`, size `(8+s*8)*(0.65..1.4)`, `globalCompositeOperation='lighter'`. In `05-workers-hauling.png` and `03-first-route.png` they are the brightest objects in frame and read as collectible pickups | **Blocker** | High |
| V20 | Procedural repetition: cabinet seams are always `round(w/420)` evenly spaced; vents always 7 slats; all 8 furniture legs are the same 84–96u square in the same material | `solids.ts:134-154`, `renderer.ts:269`, `kitchen.ts:35-45` | Med | High |
| V21 | Edge-wear nicks are 14 identical 2u-tall bars on the top edge of every solid including 74u legs | `solids.ts:157-161` | Med | High |
| V22 | No sign of *recent* human activity anywhere. Zero authored props for: dishes, cutlery, mug, pot, pan, bottle, box, bag, wrapper, paper towel, hair, shoe, pet food, cereal, spilled sugar, a dropped fork | `SOLIDS`/`DECALS` are the complete authored set — 26 + 15 items | **Blocker** | High |
| V23 | Cannot navigate by memory: every quadrant is "one big rect + bare tile". The only unique silhouettes are 2 identical vents, 2 near-identical dark mats, 2 identical cable arcs, and the radiator/pipe pair (both 144u vertical bars) | compare `07-mid-run.png` and `10-patrol-footfall.png` — different corners, same image | **Blocker** | High |
| V24 | The foot is drawn at ~390u tall against an ART_BIBLE spec of 620×260 — the single best scale gag in the game is under-delivered by ~37% | `renderer.ts:929` `scale=(FOOT_RADIUS*2.6)/img.height`, `FOOT_RADIUS=150`; `ART_BIBLE.md:26` | Med | Med |
| V25 | Walls are 56u thick — 2.2 scouts. A real wall at this camera should be an edge of the world, not a thin frame | `kitchen.ts:13-16` | Med | High |

### Semantic zones without labels (Q2)

Recognisable: **none**. Distinguishable-but-unnamed: the vent grille (a slatted rectangle), the mats
(a ribbed rectangle), the cable arc. Indistinguishable rectangles: `counterLeft`, `counterRight`,
`pantry`, `island`, `sinkCabinet` (all `cabinet`, same shader); `stove`, `fridge`, `dishwasher` (all
`steel`, same shader); `radiator`/`pipeRun` (both 144×430–560 `metal` bars); `trashBin`/`boxPantry`
(both `plastic`). That is 12 of the 14 non-wall, non-leg solids in four indistinguishable families.

### Prop density (Q4)

26 solids: 4 walls, 8 legs, 5 named appliances, 4 cabinets, 5 misc. 15 decals in 6 kinds. 8 resources,
4 nests. **53 authored objects in a 3600 × 2600 room** — one object per 176 000 u², i.e. one per
1.7 floor tiles, and the majority of those are the architecture itself.

---

## ENVIRONMENT PLAN

### Principle

Stop drawing *rooms with objects in them* and start drawing *objects at 12× magnification*. At this
camera a coffee bean is a boulder and a shoelace is a rope bridge. Every item below is chosen because
it has a **silhouette a human recognises instantly at 5% of its familiar size**.

### A. Authored geometry — new zone identity (extend `SOLIDS`, add a `SolidPart[]` per solid)

The fix for "interchangeable rectangles" is not more materials, it is **sub-geometry**: each fixture
gets 3–6 authored child parts baked into the same canvas, so its silhouette is unique before any
value difference is needed.

| Zone | Parts to author | Technique |
| --- | --- | --- |
| **Sink** | basin cut-out (recessed dark rounded rect, 340×260), faucet base + gooseneck shadow crossing onto the floor, drain ellipse, 2 supply pipes running down the cabinet face, an **under-sink void** (a 90u black band the scout can actually enter) | authored geometry in `solids.ts` bake |
| **Stove** | 4 burner rings (concentric, one with a blackened grate), a knob row (5 small cylinders casting shadow), oven door seam + handle bar with a cast shadow, a scorched grease halo on the adjacent floor | authored geometry + one floor decal |
| **Fridge** | door seam as a **real bright gap** (2u bright line, not a floating light), a kick-plate vent grille, a magnet + a curling receipt on the door face, condensation drip trail down the side onto the tile | authored geometry + prerendered decal |
| **Dishwasher** | control strip, a horizontal handle bar 60u off the face with a hard cast shadow, a puddle seeping from the bottom-left corner | authored geometry |
| **Pantry** | louvred door (real slats with depth), a gap where the door doesn't shut, a spill of grain fanning out of the gap | authored geometry + decal |
| **Island** | overhanging countertop lip (see depth stack), 2 stool feet with rubber caps, a hanging tea-towel corner entering frame from above | authored geometry + occluder layer |
| **Trash** | a pedal-bin foot pedal + hinge, a liner skirt bunched at the rim, a fly-strip of spilled coffee grounds | authored geometry |
| **Doorway** | **cut a 700u gap in `wallBottom`** at x≈3200 and author a threshold strip + a wedge of hallway floor of a different material. This is the map's single most valuable landmark and it currently does not exist | authored geometry |
| **Baseboards** | a continuous 40u skirting band along every wall and cabinet base, with a 12u gap-and-shadow at 3 authored points (the colony's actual highways) | authored geometry, baked into wall canvases |

### B. Prerendered prop atlas — the missing mid-scale (new `props.ts`, baked once at boot)

Target **60–80 placed instances from ~24 unique props**, sized 40–260u so they sit between crumb and
architecture. Bake each once into a small canvas at 2×, place by an authored `PROPS[]` table in
`kitchen.ts` (data, testable, same discipline as `DECALS`).

- **Under the counters / cover**: a fallen fork (220u), a bottle cap on its side (70u), a wine cork
  (110u), a rubber band coil (90u), a bread bag clip (46u), a paperclip (52u).
- **Food story**: a scatter of rice grains (12u each, in clusters of 8–20), a single dried pea, a
  cereal flake (60u), a coffee-bean pile, a torn sugar sachet with a spill fan, an apple core (240u)
  under the table.
- **Human recency**: a crumpled receipt (180u), a used tea bag with a stain halo, a dropped bottle
  cap, a shoe scuff arc on the tile, a wet-mop swirl that half-erases the debris layer under it, a
  chair dragged out of alignment (rotate 2 of the 4 chair legs off-grid).
- **Threat foreshadow**: an old sticky-trap card curled at the corners near the pantry, a dead fly on
  its back, a desiccated roach corpse (reuse `DEAD_FRAME`) beside the radiator.
- Every prop gets: contact shadow, one bright top edge, and **a rotation that is never 0 or 90°**.
  Axis-alignment is half of why the map reads as debug.

### C. Procedural canvas — surface storytelling (extend `atlas.ts`)

1. **Floor**: raise the tile block from 2×2 to **4×4** (repeat period 1280u > viewport 1020u) and add
   per-tile variation that is not noise: 3 chipped corners, 1 hairline crack that crosses a grout
   line, 2 tiles with a different glaze value. Kill V9.
2. **Debris layer**: author at **1.0×**, not 0.4× (`atlas.ts:416`), and replace the uniform random
   scatter with **traffic-weighted** deposition — heavy along `PATROL_PATHS`, heavy at cabinet bases,
   near-clean in the room's centre. Filth accumulating where humans walk is free storytelling and it
   also teaches the patrol routes.
3. **Grout**: darken and deepen it near cabinet bases (mopping never reaches the edge), so the
   baseboard line reads as the safest route without a single UI element.
4. **Materials**: widen the base spread from 17/255 to **≥60/255** and give each material a distinct
   *frequency*, not just a value — ceramic low-frequency mottle, steel horizontal 1u streaks, MDF
   vertical 3u brush, plastic isotropic speckle, enamel a broad specular sweep.

### D. Visual-depth stack (in draw order) — kill "flat"

Current: `floor → debris → decals → solids → resources → nests → pheromone → hazards → bodies →
particles → light multiply → overlays` (`renderer.ts:155-170`). Everything is one plane.

Proposed:

1. **Sub-floor** — grout, tile, traffic grime, wet-mop swirls. Unlit-dark.
2. **Ground contact** — decals, spills, crumb fields, prop contact shadows. *Every* item here draws
   its own shadow before its body.
3. **Cast-shadow layer (new)** — a single offscreen canvas holding hard-edged shadows projected from
   every solid and prop **away from the nearest light**, composited multiply *under* the solids.
   This is the single highest-leverage addition: it converts flat rectangles into volumes and gives
   the five floating gradients a reason to exist.
4. **Standing geometry** — solids with authored sub-parts, plus real **side faces**: extrude each
   solid 0.12 × height toward the camera bottom, so a 700u fridge is visibly taller than an 84u leg.
5. **Actor plane** — corpses, workers, scout, cargo. Sorted by `y` so a roach can pass behind a prop.
6. **Occluder plane (new)** — things *above* the floor that the scout passes under: the island
   countertop overhang (a 90u lip along the island's south edge, drawn at 0.75 alpha with a soft
   inner shadow), the hanging tea towel, a chair seat edge, the dangling power cable's slack loop.
   Being briefly hidden is the strongest possible statement of "you are 2 cm long" and the game
   currently has zero instances of it.
7. **Light multiply** — unchanged mechanism, but each light must be **anchored to authored source
   geometry** and must be occluded by layer 3's shadow map. Move `underSink` inside the cabinet void,
   `ovenClock` onto the stove face, `fridgeSeam` onto the door seam, `hallway` into the new doorway.
8. **Atmosphere (new, cheap)** — a slow drift of dust motes at 1.15× camera parallax, ~40 particles,
   `PRIO.ambient`. Gives the empty middle of the room a reason to be looked at and sells the air.
9. **Screen space** — vignette, flash, guide. Unchanged.

### E. Signal vocabulary — retire the circle

The circle currently means eleven things (V11–V17). Reassign by **shape family**, keeping ART_BIBLE's
rule that colony = ovals, architecture = hard 90°, threat = soft mass + one hard silhouette:

| Meaning | Now | Proposed |
| --- | --- | --- |
| "this is you" | warm ellipse outline + halo (`renderer.ts:1070-1079`) | drop the outline; a **downward chevron 30u above the scout** plus the existing warm ground pool. Off-body, so it never reads as a selection box |
| objective on screen | dashed ring r=46 (`renderer.ts:1297`) | the existing off-screen chevron, kept on-screen and parked at the frame edge nearest the target |
| route end, linked | warm ring r=24 (`renderer.ts:721`) | a **densification of motes** into a rosette at the anchor + the existing chime. Link state = mote density, not a stroke |
| route end, dry | dashed danger ring r=22 | motes **desaturate and fall still**; add a thin dry-stain decal |
| unclaimed nest | dashed cold ring (`renderer.ts:562-572`) | draw the crack as a *sealed* crack — paint crust, no ring |
| spotted / integrity | world-space progress arcs (`renderer.ts:1101,623`) | move to the HUD, where meters belong; keep only the screen-edge red bloom |
| resource remaining | floating bar (`renderer.ts:428`) | **the crumb pile itself shrinks** — it already does (`n = 8 + frac*22`, `renderer.ts:450`). Delete the bar |
| claim / upgrade / victory | `ctx.arc` rings to r=1100 (`main.ts:358,375,577`) | a **light event**: lift `roomLight` locally, bloom the nest, throw dust. Never a stroked circle |
| pheromone | 16–32u additive balls (`renderer.ts:670`) | 3–6u motes at 3× the count, `PRIO.decor`, alpha ≤0.35, with a faint **wet-sheen streak** on the tile beneath. Scent, not pickups |

### F. Ordering (highest visual return first)

1. Cast-shadow layer + solid side faces (D3, D4) — turns 26 rectangles into 26 volumes.
2. Retire the circle vocabulary (E) — removes the "debug graphics" read outright.
3. Prop atlas, 24 props / 60–80 placements (B) — fills the 30–300u scale gap and the empty 47%.
4. Sub-geometry for sink / stove / fridge / doorway / baseboards (A) — makes zones nameable.
5. Anchor the five lights to real sources (V6) + traffic-weighted debris (C2).
6. Occluder plane (D6) + dust parallax (D8).
7. Floor 4×4 block, wider material spread (C1, C4).
