# ART_BIBLE — Baseboard Empire

Target: **stylised macro-noir kitchen**. Not photoreal filth, not cartoon comedy. Cold architecture,
warm pools of light, small amber bodies moving through it.

## Shape language

| Family             | Shapes                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Human architecture | Long straight edges, hard 90° corners, huge unbroken planes. Cabinets and appliances are **walls**, not props.       |
| Colony             | Ovals, tapers, arcs. Every roach silhouette is a soft-cornered teardrop with a hard antenna crown.                   |
| Threat             | Broad soft-edged masses (shadows, spray clouds) and one hard silhouette (the foot). Threat never uses colony shapes. |
| Pheromone          | Dotted, granular, non-solid. Never a hard line — it must read as _scent_, not as a drawn path.                       |

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
