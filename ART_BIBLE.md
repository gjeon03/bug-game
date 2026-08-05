# ART_BIBLE — Baseboard Empire

> **Rescinded 2026-08-04 — the rule that caused the defect.**
>
> This document previously said: _"Cabinets and appliances are **walls**, not props."_ That rule is
> withdrawn. It is the direct, documented cause of the user's second-loudest complaint — "large
> blue-black rectangular surfaces dominate the screen" — because it instructed the renderer to fill
> a 1080×470-unit counter with one flat value, which at play zoom is wider than the screen.
>
> The replacement rule: **no fixture face may run more than 700 world units without a vertical
> event, and every room-facing edge must resolve into at least four values within 60 units.**
>
> Recording this rather than quietly editing it, because the failure mode is instructive: the art
> was not drifting from its direction, it was faithfully executing direction that was wrong.

Target: **stylised macro-noir kitchen**. Not photoreal filth, not cartoon comedy. Cold architecture,
warm pools of light, small amber bodies moving through it.

## Shape language

| Family             | Shapes                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Human architecture | Long straight edges and hard 90° corners, but **never an unbroken plane**. Every fixture resolves into layered planes — worktop, lip, shadow reveal, door, handle, toe-kick void. See §Rescinded. |
| Colony             | Ovals, tapers, arcs. Every roach silhouette is a soft-cornered teardrop with a hard antenna crown.                                                                                                |
| Threat             | Broad soft-edged masses (shadows, spray clouds) and one hard silhouette (the foot). Threat never uses colony shapes.                                                                              |
| Pheromone          | Dotted, granular, non-solid. Never a hard line — it must read as _scent_, not as a drawn path.                                                                                                    |

## Scale relationships

The scale gag is the whole art direction. Anchor: **scout body = 26 world units.**

| Object           | World units | In scouts |
| ---------------- | ----------- | --------- |
| Floor tile       | 320         | ~12       |
| Grout line       | 14          | 0.5       |
| Crumb            | 10–26       | 0.4–1     |
| Water droplet    | 30–70       | 1–3       |
| Cabinet toe-kick | 90 deep     | 3.5       |
| Human foot       | 620 × 260   | 24        |
| Camera viewport  | 1200 × 675  | 46 × 26   |

Nothing in the kitchen is ever drawn at "prop" scale. If it fits comfortably on screen next to the
scout, it is debris.

## Value hierarchy

Darkest → lightest, and this order is never violated:

1. Under-cabinet voids / cracks — near black `#05070b`
2. Room shadow — `#0a1016`
3. Floor in shadow — `#131c24`
4. Cabinet faces — `#1c242c`
5. Floor in ambient — `#2a3742`
6. Lit floor (warm pool) — `#5c4a33` → `#8a6b42`
7. Roach carapace — `#7a4a1f` → `#c07a34` specular
8. Hazard signal + UI critical — `#ff6b4a`, `#e8f0ff`

Roaches always sit **at least two steps brighter than the surface behind them** when in shadow and
are rimmed dark when in light, so the silhouette survives both.

## Palette (restrained, 10 hues)

```
ink        #05070b   deep void, crack interiors
slate      #131c24   floor shadow
steel      #26323c   cabinetry, appliance body
chalk      #3d4c58   grout, worn edges
amber      #c07a34   roach carapace highlight
umber      #6b3f18   roach body
warm       #ffbb66   fridge / oven / hallway light
cold       #7fa9c8   moonlight, water, screen chrome
danger     #ff6b4a   footfall telegraph, trap, damage
toxin      #b9f27c   spray, bait — the ONLY saturated green in the game
```

Pheromone uses `cold` → `warm` interpolation by strength; nothing else in the world uses that ramp,
so a trail is never confused with lighting.

## Material families

- **Ceramic** — large tiles, low-frequency mottling, a broad soft specular sweep, sharp grout recess.
- **Painted MDF** — cabinet fronts: flat value, subtle vertical brush noise, a bright 2px top edge and
  a deep 6px bottom shadow to read as thickness.
- **Brushed steel** — appliances: horizontal streak noise, anisotropic highlight band.
- **Organic** — crumbs, grease, brood: irregular blobs with a warm subsurface rim.
- **Fluid** — water: dark core, bright arc highlight, cold rim; always animates a slow surface wobble.
- **Chitin** — roaches: layered plates, a hard specular streak along the pronotum, matte abdomen.

## Lighting logic

Night kitchen. Base ambient is a cold multiply of `#131c24` at ~0.82 darkness. Light is **additive
holes** punched into that darkness:

- Fridge seam — warm, large, soft falloff. The most useful and most dangerous place in the kitchen.
- Oven clock — small, tight, warm.
- Under-sink LED — small, cold-warm, the tutorial safe-light.
- Hallway spill — very large, low intensity, from the bottom-right doorway.
- **Room light** — during a patrol, the whole darkness layer lifts to ~0.25 over 0.6 s. This is the
  single loudest visual event in the game and it always means _a human is looking_.
- Flashlight cone — a moving hard-ish wedge; exposure inside is near maximal.

Light drives gameplay directly: exposure sampling reads the same field the renderer composites, so
what you see is literally what the humans can see.

## Cockroach silhouettes

Three readable classes, distinguished by **shape and motion**, not colour alone:

- **Scout (player)** — largest, 26u, elongated, brighter amber, permanent soft cold rim-light halo so
  it is never lost in a crowd, longest antennae with the widest search sweep, and a faint pheromone
  glow at the abdomen while secreting.
- **Worker** — 20u, rounder, darker umber, shorter antennae, tighter leg cycle. When carrying, a
  visible cargo blob rides the back and the gait slows and widens.
- **Nymph** (newly hatched, brief) — 12u, pale, jittery, clusters near the nest. Pure colony-growth
  feedback.

Antenna motion is the identity: two tapered curves, sweeping with a phase offset, reacting to walls
and to nearby danger (they snap toward a threat before the body turns).

## Human-threat representation

The human is **never** drawn as a body. The vocabulary is:

- **Shadow** — a huge soft dark ellipse that grows and sharpens as the foot descends.
- **Foot** — a hard silhouette with a bright rim, only fully visible in the last 0.25 s.
- **Light** — the room-light lift and the flashlight wedge.
- **Tools** — a spray nozzle edge entering frame, a sticky-trap card, a bait dot.
- **Screen-space** — camera shake, a low-frequency dust jolt, and a brief desaturation on impact.

Scale is the whole horror: nothing about the human fits on screen.

## Animation language

Everything is procedural (see `DECISIONS.md`), so motion is _derived_ from state and cannot desync:

| State         | Motion                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------- |
| Idle          | Antennae sweep 0.8 Hz, body micro-bob, occasional 1-frame twitch.                                 |
| Skitter       | 8-leg-phase tripod gait scaled by speed; body yaws ±4° per step; dust ticks.                      |
| Turn          | Body rotates toward heading at 14 rad/s — always ahead of the velocity, so input reads instantly. |
| Sprint        | Gait 2.1×, body flattens 8 %, motion-streak behind, antennae swept back.                          |
| Carry         | Gait 0.75×, body pitched up, cargo bobs counter-phase.                                            |
| Panic         | Random 60–140° heading jitter at 4 Hz, gait 1.6×, antennae flat.                                  |
| Trap struggle | Position locked, body rotates ±30° at 6 Hz, legs at 3×, adhesive strands stretch.                 |
| Death         | Legs curl inward over 0.5 s, body flips 180° on its back, settles, darkens.                       |
| Nest activity | Crack breathes; brood blobs pulse; traffic makes the lip glisten.                                 |
| Colony growth | Nest silhouette gains a rim of nymphs and a warm inner glow per population step.                  |

## Pheromone and danger VFX

- **Pheromone**: granular motes along the route, drifting perpendicular with a slow sine, opacity =
  node strength. Freshly laid nodes flare once. Route ends pulse a ring when _linked_ (nest ↔
  resource) — link state must be readable from across the room.
- **Trail acquired**: a worker flashes a single cold ring the instant it locks on — this is the
  causality beat and it is never suppressed.
- **Danger**: telegraph is a ground decal that _contracts_ (never expands) toward the impact point, so
  the eye is pulled to where it must not be. Contraction time = the actual warning time. Colour
  `danger`, plus a rising sub-bass and a dust ripple.
- **Spray**: `toxin` fog with animated curl noise, hard leading edge, translucent body so roaches
  inside remain visible — the player must always be able to see who is dying.

## UI hierarchy

Composition priority (enforced by draw order and by the HUD's fixed regions):

1. player scout → 2. immediate danger → 3. active route → 4. workers + cargo → 5. nest objective →
2. decoration.

- HUD is a DOM overlay, `pointer-events: none` except for real buttons, so it never eats gameplay input.
- Top-left: colony vitals (food, water, pop/cap, brood). Top-right: **suspicion** with tier ticks, the
  last cause, and the next response preview. Bottom-left: scout status (stamina, pheromone reserve).
  Bottom-centre: current objective, one line. Bottom-right: phase + clock.
- Every meter uses **icon + shape + fill + number**. Nothing is encoded by colour alone; the suspicion
  tier additionally changes the meter's outline shape and adds tick marks.
- Danger uses motion (pulse) as its primary channel, colour second, sound third.

## Avoiding visual clutter

Hard rules, enforced in code:

- Floor detail (crumbs, stains, scratches) is baked once into a static layer at ≤ 6 % contrast so it
  can never compete with a hazard decal.
- Particle budget 900; the emitter priority list drops decoration (dust, ambience) before it drops
  signal (danger, delivery, acquisition).
- Pheromone motes fade to 35 % opacity when a danger telegraph overlaps them.
- No more than one full-screen effect at a time; the newest wins and the previous is cut to 0 in 80 ms.
- Screen shake is capped at 9 px and is halved (or zeroed) by the Reduced Shake setting.
- When ≥ 45 roaches are on screen, worker rim-lights are dropped but the scout's is never dropped.

## Audio identity

Mix priority: **player action > immediate lethal danger > nearby human > colony/objective > ambience.**

- Skitter: 6 ms filtered noise ticks, randomised pitch/pan, rate-limited per source, hard voice cap.
- Antenna/pheromone: a dry high tick on lay, a soft cold chime on route link.
- Colony: layered muted chitter that thickens with population — the growth reward is audible.
- Ambience: fridge hum (two detuned saws + lowpass), pipe resonance, room tone.
- Human: distant floor creak → footstep thud with sub-bass and a dish rattle → the room-light click.
- Trap: a dry adhesive snap. Spray: a bright hiss with a long tail. Victory: the colony chitter
  swelling into a warm swarm bed. Eradication: everything cut to a single ringing tone in 40 ms.

---

## Legibility rules added by the redesign

These were written after a measured visual audit found the kitchen unreadable at the gameplay camera.
They are rules, not preferences: a frame that breaks one of them is a defect.

### 1. A fixture must be identifiable by its own drawing

No floating label may be load-bearing. Every solid carries a `role`, and the bake draws what that role
_is_: a basin, tap and drain for the sink; four burners, oven glass and knobs for the stove; a door
seam, handle, condenser grille and magnets for the fridge; door panels, cup handles and a plinth for
cabinetry. If the player cannot name a fixture from a screenshot, the fixture is wrong.

### 2. Material values must survive the darkness multiply

The scene is multiplied by roughly 0.49 in the lighting composite. Material bases previously spanned
17/255, so five values of grey separated a dishwasher from a pantry. The families are now spread
across 20 → 74 in the red channel, which survives the multiply with a visible step between every pair.

### 3. The 30–300 unit band must be populated

Everything used to be either under 10 units (invisible) or over 400 (architecture), so nothing told
the player how big a cockroach is. Domestic props fill the band and every one earns its place by doing
at least one job: a landmark for navigation, a scale reference, a resource marker, a motivated light,
or evidence that somebody lives here.

### 4. Light must sit on the thing that emits it

Every source is anchored to its fixture — the oven clock on the stove, the seam light on the fridge
door, the hall spill through the doorway gap that now actually exists in the bottom wall. Light with
no visible cause reads as a rendering artefact.

### 5. Depth comes from occlusion, not from gradients

Props with height are drawn _after_ the roaches, so the colony visibly passes underneath a slipper, a
broom head, a detergent bottle. Combined with per-object contact shadows and the toe-kick voids, that
is the whole depth stack — and it is the only one a top-down view gets honestly.

### 6. One shape, one meaning

The circle had become the game's universal marker: unclaimed nests, objectives, route ends, the
scout's own highlight and every pickup were all rings differing only in radius and dash pattern, which
is why players read them as debug output. The vocabulary is now:

| Meaning            | Form                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------- |
| The colony's scent | A continuous tapered **ribbon** with directional flow inside it                              |
| A live route end   | A filled **scent-drop**, pointing into the route                                             |
| An unfinished end  | The same drop, hollow                                                                        |
| A dry end          | The same drop, struck through                                                                |
| The player         | Warm rim-light — and warm is now reserved for the player and for what the player must act on |

### 7. The scent trail is a thing, not a series of markers

It was drawn as one additive glow blob per node with per-node jitter and per-node size variation — an
evenly spaced chain of glowing circles, which is precisely what a debug visualiser looks like. It is
now a single three-pass stroke per route (bloom, body, core) with a travelling dash for flow, and its
colour carries its state so the player never has to count anything.

### Deviation on record: the scent ribbon is a stroke, not a dot field

The shape-language section above says the pheromone must be "dotted, granular, non-solid — never a
hard line". That rule produced the shipped defect: an evenly spaced chain of glowing circles that
every player and every critic read as a debug visualiser.

The ribbon replaces it and keeps what the rule was protecting. It is soft-edged rather than hard —
three passes (a wide bloom, a body, a bright core) over one quadratic path — it carries its state in
colour rather than in shape, and a travelling dash gives it direction. It is a secretion with a
gradient, not a drawn line, and it is the one element the independent visual critic named as
unambiguously solved.

Where this file and this note disagree, this note is what ships.

## Production pipeline (supersedes any procedural-drawing guidance above)

Art is **baked offline**, never drawn with runtime primitives. `tools/bake/` models each prop as
real 3D geometry at true millimetre dimensions, renders it in headless Chromium through **one
shared camera and light rig**, and packs the results into a single sprite sheet at `src/art/`.

- **One rig, no exceptions.** Every sprite passes through `tools/bake/lib/rig.mjs`, so no two props
  can disagree about where the light comes from or how steeply they are viewed. Style consistency
  is an invariant, not a review step.
- **Camera tilt 26° off vertical.** Enough to reveal a front face and give objects elevation; the
  simulation stays strictly 2D. Sprites are placed by their baked ground anchor.
- **Model in millimetres.** A dinner plate is 200 mm, therefore 149 world units, therefore nearly
  six scouts across. Eyeballing sizes in world units is how the scale gag dies.
- **Environment map is mandatory for metal.** A PBR metal with no environment reflects nothing and
  renders black. This is why the sink deck and drain were black in the first three bakes.
- **Contact shadows are baked in.** Every prop carries its own shadow, which is what gives it weight.

### Measured negative results — do not repeat

| Attempt                                  | Outcome                                                                                                                                                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Procedural texture maps on flat surfaces | Invisible at `roughnessMap` only; invisible as albedo because `ExtrudeGeometry` emits world-unit UVs, not 0..1; visible as a repeating **grid** once the repeat was corrected — a banned artefact — and grew the sheet 321 kB → 1155 kB. Removed. |
| Full-height cabinet geometry             | At 26° a 760 mm carcass projects to a 662-unit flat slab: a larger version of the rectangle it was meant to replace. Replaced with a ~210 mm edge profile.                                                                                        |
| WebGL + normal-mapped dynamic lighting   | Lost the renderer bake-off. Identical object recognition, and its one unique capability read _worse_ than a composited light cone. See `DECISIONS.md`.                                                                                            |

---

# Amendment — the 3D reboot (2026-08-05)

The art direction above is **kept**: stylized physical believability, the material vocabulary, real
millimetres, mandatory environment map for metal, contact shadows, and every banned artefact. What
changes is that none of it is flattened any more.

## Rescinded

- **"Sprites are placed by their baked ground anchor."** There is no sprite and no anchor. Props are
  meshes standing on a floor; depth sorting is the depth buffer's job.
- **"The simulation stays strictly 2D."** Presentation is genuinely 3D and the world has real height.
  The simulation is still authored on the XZ plane, but `lift` as a 2.5D pseudo-height is gone.
- **"Contact shadows are baked in."** They are cast, per frame, by a real light. That is why a faded
  occluder must also stop casting — a see-through object with a solid shadow reads as a bug.
- **"Full-height cabinet geometry" negative result.** That failure was a projection artefact of a 26°
  near-top-down camera; a 46°-pitched perspective camera shows a carcass as a carcass. A full-height
  cabinet is now correct and required.

## New rules earned by measurement in the reboot

**Readability dimensions are not anatomical dimensions.** A real cockroach femur on a 35 mm body is
under a millimetre across, which at the gameplay camera is **0.7 px** — every leg and both antennae
were antialiased out of existence and the animal rendered as a bare brown oval. Limb thickness is
therefore chosen so the thinnest limb survives at roughly three pixels at the framing the game is
actually played at. Body proportions stay honest; only the sticks are exaggerated. **If the camera
framing changes, re-derive these — do not tweak them by eye.**

**Silhouette is set by sweep, not by part count.** Six legs arranged radially around a compact body is
a *spider*. A cockroach's legs rake backward — front pair reaching past the head, hind pair trailing
behind the abdomen — and the body is long rather than round. This is the difference between passing
and failing the "reads as a cockroach" gate.

**A recess must be a hole, not a decal.** The drain is recognizable because the surrounding surface
falls away into it. Any fixture that is an inset in real life must be an inset in geometry.

**Verify rotations against the rest vector, never by eye.** Three separate limb defects in this
rebuild — legs folded under the body, antennae buried beneath the abdomen, a pronotum that was a dome
instead of a shield — were all sign errors, found by evaluating `Rx(θ)·(0,−1,0)` and comparing it
with the intended direction. Guessing at the number took several attempts each time; solving for it
took one.

**Metalness is a lighting decision, not a material label.** `metalness > 0.9` has almost no diffuse
response, so such a surface is lit only by what it reflects. Inside a sink bowl, what it reflects is
the environment map's lower hemisphere, which in a night kitchen is nearly black. Physically correct,
and it rendered the bowl as a void. Interior surfaces that must stay readable take a lower metalness.

## Untiled detail replaces tiled detail

The negative result above still stands: a tiled canvas texture's own seams line up and produce the
banned grid. The escape is to **not tile** — one texture stretched across a whole slab with `repeat`
left at 1 has no period for a grid to form on. Roughness-only, carrying no colour, so it reads as
where the cloth has and has not been.
