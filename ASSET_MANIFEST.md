# ASSET_MANIFEST — Baseboard Empire

Production method for every visible and audible element. Status vocabulary is the one required by the
production contract:

- **intentional final** — authored by hand as the shipping version
- **generated final** — produced by first-party procedural code, shipping as-is
- **licensed final** — third-party asset vendored under a recorded licence
- **temporary** — must be replaced before completion (target: zero rows)

All rows are first-party. Licence for every generated asset: **MIT**, © this repository — the
generator source is the asset, and it lives in `src/render/atlas.ts` (sprites, textures, glows),
`src/render/solids.ts` (cabinetry and appliances), `src/render/renderer.ts` (decals, resources,
nests, hazards, VFX) and `src/audio/audio.ts` (every sound). No binary asset file is fetched at runtime; there are no third-party assets and
therefore no third-party licence obligations.

Statuses below are filled from the final audit (`artifacts/evidence/asset-audit.json`).

---

## Sprites and world geometry

| Asset                   | Purpose                                                                                        | Production method                                                                          | Runtime cost                        | Status          | Fallback            |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------- | --------------- | ------------------- |
| Scout cockroach         | Player body, 12-frame gait × 32 rotations                                                      | Procedural Canvas2D atlas, layered chitin plates + specular streak                         | 1 atlas ≈ 1.6 MB VRAM, 1 blit/frame | generated final | none needed         |
| Worker cockroach        | Colony unit, 12-frame gait × 32 rotations                                                      | Same generator, smaller/darker/rounder parameter set                                       | shares atlas page, 1 blit each      | generated final | none needed         |
| Worker carry variant    | Cargo pose + cargo blob                                                                        | Gait atlas + per-instance cargo drawn as a lit blob (food/water tinted)                    | +1 small blit when carrying         | generated final | none needed         |
| Nymph                   | Newly hatched growth feedback                                                                  | Reduced-scale worker draw with pale palette + jitter                                       | ≤ 12 on screen                      | generated final | culled at high load |
| Antennae + legs         | Identity motion for scout & near workers                                                       | Per-frame procedural strokes (bezier antennae, tripod-gait legs)                           | LOD: full ≤ 24 nearest, else baked  | generated final | baked atlas legs    |
| Death pose              | Legs curled, body inverted                                                                     | Procedural pose blend over 0.5 s                                                           | negligible                          | generated final | none needed         |
| Home nest (crack)       | Colony hub, 4 growth states                                                                    | Procedural: dark void spline, glistening lip, brood cluster, nymph rim                     | 1 blit + ≤ 12 brood dots            | generated final | none needed         |
| Crack — Brood Chamber   | Upgrade state 1                                                                                | Nest generator + warm interior glow + pulsing egg cases                                    | 1 blit                              | generated final | none needed         |
| Crack — Food Cache      | Upgrade state 2                                                                                | Nest generator + stacked crumb silhouette + amber inner light                              | 1 blit                              | generated final | none needed         |
| Crack — Escape Tunnel   | Upgrade state 3                                                                                | Nest generator + deep tunnel gradient + directional draft motes                            | 1 blit                              | generated final | none needed         |
| Unclaimed crack         | Expansion affordance                                                                           | Nest generator, unlit, with a cold "claimable" pulse ring                                  | 1 blit                              | generated final | none needed         |
| Food crumb node         | Resource, 5 depletion states                                                                   | Procedural irregular blob cluster, warm subsurface rim, count-driven                       | ≤ 5 blits                           | generated final | none needed         |
| Water droplet node      | Resource, 5 depletion states                                                                   | Procedural meniscus: dark core, arc specular, cold rim, sine surface wobble                | ≤ 5 blits                           | generated final | none needed         |
| Ceramic floor           | Kitchen ground plane                                                                           | Baked 640² seamless tile: mottled ceramic + grout recess + specular sweep, `createPattern` | 1 pattern fill                      | generated final | flat colour         |
| Floor debris layer      | Crumbs, stains, scratches, grout wear                                                          | Baked once at world scale from the run seed, ≤ 6 % contrast                                | 1–4 blits (tiled)                   | generated final | omitted             |
| Cabinetry / appliances  | Solids: counters, sink, dishwasher, pantry, island, fridge, stove, radiator, table legs, trash | Procedural painted-MDF and brushed-steel materials with thickness edges + contact shadow   | ≤ 16 rect draws                     | generated final | flat rects          |
| Baseboard + toe-kick    | Cover geometry, insect-scale landmark                                                          | Procedural strip with deep occlusion gradient                                              | included in solids                  | generated final | none needed         |
| Human foot              | Patrol threat silhouette                                                                       | Procedural: hard sole silhouette, bright rim, soft pressure shadow                         | 1 blit + 1 shadow                   | generated final | none needed         |
| Human shadow            | Approach telegraph                                                                             | Radial-gradient ellipse, animated scale/opacity                                            | 1 draw                              | generated final | none needed         |
| Flashlight / room light | Sight threat                                                                                   | Additive wedge + global darkness lift on the lighting canvas                               | 1 composite                         | generated final | none needed         |
| Sticky trap             | Route denial hazard                                                                            | Procedural card + adhesive sheen + stretched strands on struggle                           | 1 blit + ≤ 6 strands                | generated final | none needed         |
| Bait dot                | Route denial hazard                                                                            | Procedural toxin-green gel dot with a specular bead                                        | 1 blit                              | generated final | none needed         |
| Spray cloud             | Extermination hazard                                                                           | Procedural curl-noise fog puffs, hard leading edge, translucent body                       | ≤ 60 puffs, budgeted                | generated final | reduced puff count  |

## VFX

| Asset                   | Purpose                          | Production method                                     | Runtime cost            | Status          |
| ----------------------- | -------------------------------- | ----------------------------------------------------- | ----------------------- | --------------- |
| Pheromone motes         | The differentiator's readability | Pooled particles, cold→warm ramp by node strength     | ≤ 320 of the 900 budget | generated final |
| Route link pulse        | Nest↔resource link confirmation  | Expanding ring at both route ends                     | 2 rings                 | generated final |
| Trail-acquired ring     | Worker lock-on causality beat    | One cold ring per acquisition, rate-limited           | ≤ 8/s                   | generated final |
| Pickup / delivery burst | Economy confirmation             | Radial motes + a rising value tick                    | ≤ 24 particles          | generated final |
| Nest upgrade bloom      | Expansion payoff                 | Warm expanding shell + nymph spawn burst              | ≤ 60 particles          | generated final |
| Suspicion spike         | Evidence feedback                | Screen-edge tick + world-space marker at the cause    | ≤ 12 particles          | generated final |
| Footfall telegraph      | Fair warning                     | **Contracting** danger decal + dust ripple            | 1 decal + 20 particles  | generated final |
| Trap spring             | Hazard confirmation              | Adhesive strand snap + debris                         | ≤ 16 particles          | generated final |
| Spray danger            | Area denial                      | Toxin puffs + screen-edge tint                        | budgeted                | generated final |
| Scout hurt / death      | Player feedback                  | Chromatic pinch, radial dust, body flip               | ≤ 30 particles          | generated final |
| Victory                 | Win payoff                       | Room light rise, mass nymph swarm, warm bloom         | ≤ 240 particles         | generated final |
| Eradication             | Loss payoff                      | Desaturate, ash fall, hard cut to silence             | ≤ 120 particles         | generated final |
| Screen shake / vignette | Threat pressure                  | Camera offset + radial darkening, both settings-gated | 1 composite             | generated final |

## Audio (100 % WebAudio synthesis — no sample files)

| Asset              | Purpose              | Synthesis method                                                            | Voices | Status          |
| ------------------ | -------------------- | --------------------------------------------------------------------------- | ------ | --------------- |
| Skitter tick       | Movement tactility   | 6 ms noise burst → bandpass 1.8–4.5 kHz, randomised pitch/pan, rate-limited | ≤ 6    | generated final |
| Sprint whoosh      | Burst feedback       | Noise → sweeping bandpass, short tail                                       | 1      | generated final |
| Pheromone lay tick | Route creation       | 900 Hz triangle blip, 18 ms, cooldown-gated                                 | 1      | generated final |
| Route link chime   | Nest↔resource link   | Two-note cold sine dyad with a soft attack                                  | 2      | generated final |
| Pickup             | Resource acquired    | Short click + pitched-up sine                                               | 2      | generated final |
| Delivery           | Economy confirmation | Warm triangle arpeggio, pitch rises with reserve fill                       | 2      | generated final |
| Colony chitter bed | Population feedback  | Rate-modulated noise grains; density tracks live population                 | 2      | generated final |
| Brood hatch        | Growth payoff        | Wet click + rising sine                                                     | 2      | generated final |
| Nest upgrade       | Expansion payoff     | Low warm swell + a bright bell partial                                      | 3      | generated final |
| Fridge hum         | Ambience anchor      | Two detuned saws → lowpass 180 Hz + slow LFO                                | 2      | generated final |
| Pipe resonance     | Ambience             | Bandpassed noise through a long comb delay, random triggers                 | 1      | generated final |
| Distant human      | Threat foreshadowing | Filtered impulse + room tail, panned to the approach side                   | 1      | generated final |
| Footstep thud      | Lethal warning       | 55 Hz sine drop + noise transient + dish rattle partials                    | 3      | generated final |
| Room-light click   | Sight threat         | Dry relay click + a mains-hum onset                                         | 2      | generated final |
| Trap snap          | Hazard               | Dry adhesive crack: shaped noise, very short decay                          | 1      | generated final |
| Spray hiss         | Extermination        | White noise → highpass with a long tail, looped while active                | 1      | generated final |
| Scout death        | Failure feedback     | Crunch transient + pitch-collapsing tone                                    | 2      | generated final |
| Victory bed        | Win payoff           | Chitter bed swells; warm sustained chord underneath                         | 4      | generated final |
| Eradication        | Loss payoff          | Hard duck of every bus to a single ringing 2 kHz tone in 40 ms              | 1      | generated final |
| UI tick / confirm  | Menu feedback        | Short filtered square blips                                                 | 1      | generated final |

## UI

| Asset          | Purpose                                                                         | Production method                                                                                                                                                                                                                                                      | Status            |
| -------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| HUD icons      | Food, water, population, brood, pheromone, stamina, suspicion, phase, objective | Hand-authored inline SVG paths (no icon font, no sprite fetch)                                                                                                                                                                                                         | intentional final |
| Meters         | Vitals + suspicion                                                              | CSS-authored with icon + shape + fill + numeral; tier ticks change outline shape                                                                                                                                                                                       | intentional final |
| Typography     | All UI text                                                                     | System font stack (`ui-sans-serif`/`-apple-system`/`Segoe UI`/`Inter`…) with a monospaced numeric stack for meters. **Deliberate:** avoids a webfont fetch (static-only + cold-load budget) and avoids a font licence obligation. Sizes/weights/tracking are authored. | intentional final |
| Panels / cards | Menus, interlude, end screens                                                   | Hand-authored CSS: glass-dark panels, authored spacing scale, focus rings                                                                                                                                                                                              | intentional final |
| Cursor         | Pointer affordance                                                              | CSS crosshair variants per state                                                                                                                                                                                                                                       | intentional final |
| Favicon        | Browser tab                                                                     | Inline SVG data-URI roach silhouette authored from the same shape language                                                                                                                                                                                             | intentional final |

## Explicitly not shipped

- No webfonts, no icon fonts, no CDN references, no external images, no audio samples.
- No debug rectangles, default particles, unstyled text or capsule stand-ins in any shipping path.
  The developer overlay is behind a flag that is off in production builds and is not part of play.

## Audit

`pnpm test:e2e` runs `tests/e2e/asset-audit.spec.ts`, which walks every rendered element class and
every triggered sound and writes `artifacts/evidence/asset-audit.json`. Temporary-count must be 0.
