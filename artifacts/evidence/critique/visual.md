# Visual critique — independent pass

Run against the captures produced by commit `115e738` by a reviewer that did not build the game, was
given `ART_BIBLE.md`, all 21 screenshots, and the rendering source, and was told to measure rather
than impress. Read-only.

**Method.** Read the art bible, viewed every capture in `artifacts/evidence/shots/`, took ~12
ImageMagick crops at 300–500 %, sampled 20×20 luminance patches with
`magick -format "%[fx:mean*255]"`, and read `src/render/renderer.ts`, `palette.ts` and `hud.ts`.

> **Headline:** the game does not currently look like the art bible. The bible promises "cold
> architecture, warm pools of light, small amber bodies moving through it" and a strict 8-step value
> hierarchy. What ships is a **single-hue blue-grey field with a 22-point luminance range and no warm
> light anywhere**, with the player character rendered indistinguishable from NPCs and the deadliest
> prop rendered as a flat gold rectangle.

## Measured

| Surface | Measured L | ART_BIBLE target |
| ------- | ---------- | ---------------- |
| Crack interior | **32.7** | `#05070b` ≈ 7 |
| Cabinet face | 37.2 | `#1c242c` ≈ 34 ✓ |
| Floor in shadow | 40.3 | `#131c24` ≈ 27 |
| Brightest floor | **54.4** | 74–110, *warm* |
| Roach body | 50.4 | 74–140 |
| Sticky trap | **160.7** | not a signal object at all |

Whole-frame hue across five gameplay captures: **H = 207–213, S = 22–31 % every time.** No warm
chroma in any gameplay screenshot.

## Findings

1. **The player scout is visually identical to every worker.** (High, 0.95) With 5–14 roaches on
   screen, every body shares size, hue, value and silhouette and no halo is visible even after a 5.5×
   exposure push. Cause identified in source: the rim is a *cold* additive glow composited onto an
   already-cold H≈210 floor, so ΔE is near zero; and the 26 u vs 20 u size difference is sub-threshold
   at 26 px on screen. Nymphs are also missing as a readable class.
2. **The sticky trap is a flat gold rectangle and the brightest object in the game.** (High, 0.99)
   A rounded rect, a two-stop gradient, one ellipse and a 2 px border, in three hex values that are
   not in the ten-hue palette, at L=160.7 against a 32–54 world. "Composition priority is inverted:
   rank-6 decoration-tier rendering on a rank-2 object, drawn at rank-1 salience."
3. **Value hierarchy collapsed.** (High, 0.9) The crack interior measures 32.7 — 7.7 *below* floor-in-
   shadow — so the deepest void in the game reads as a mid-tone patch, and the entire playfield
   occupies L 32→54. Consequence: the bible's own "roaches sit at least two steps brighter than the
   surface behind them" is violated on lit tile.
4. **There are no warm light pools; the kitchen is monochrome.** (High, 0.95) None of the five named
   emitters produce a visible warm pool in any gameplay shot. Counter-example the reviewer flagged as
   the reference: `22-brood-chamber.png`, whose warm motes around the crack are "by a wide margin the
   best-looking frame in the set. That treatment works. It just isn't anywhere else."
5. **Footfall telegraph mis-describes the lethal area, and the foot reads as a hole.** (High, 0.85)
   The telegraph is a circle; the threat silhouette is a boot at roughly 2.4:1, "so the decal shape
   and the kill shape can never agree." The sole is pure black with a uniform thin outline and
   edge-to-edge hatch lines, reading as a hole *in* the floor rather than a mass above it.
6. **Pheromone reads as a string of LED fairy lights, not scent.** (High, 0.9) Evenly spaced round
   bokeh with hard bright cores on a straight line — "the exact hard line the bible forbids" — with no
   perpendicular scatter, no granularity and no opacity ramp by strength. Related: motes landing on
   the dark grout band become almost invisible, so a route disappears where it crosses grout.
7. **Link/unlink state is not readable from across the room.** (High, 0.75)
8. **Bottom-centre stacks up to four competing message pills**, two of them saying the same thing
   about the same crumbs, against a bible specifying one line. (Medium, 0.95) Also: the off-screen
   objective chevron lands on top of the objective pill.
9. **The floor vent reads as a UI skeleton-loader.** (Medium, 0.85) Seven identical flat grey bars,
   no perspective, no lit slat edge, no void beneath.
10. **Food nodes are tan balloons wearing a debug gizmo.** (Medium, 0.9) ~10 overlapping flat
    ellipses with no rim light, ringed by a 1 px circle and an inner dashed circle that "reads as an
    editor selection marquee". Compounding: crumb tan and roach amber share a hue and sit within ~10 L,
    so four workers on a node collapse into one brown blob — "the delivery beat, the game's core
    reward, is unreadable."
11. **Carried cargo is an egg glued to the roach's face.** (Medium, 0.8)
12. **Floor texture visibly tiles** — RMSE between two 200×200 patches 400 px apart = 0.033, ~97 %
    identical — and the blotches sit above the bible's ≤6 % contrast budget. (Medium, 0.7)
13. **Suspicion panel** wraps to a right-aligned orphan word, and "Latest:" vs "Next:" — a past-event
    vs future-threat distinction — differ only in text colour. (Medium, 0.85) The tier pips *are* a
    correct non-colour channel.
14. **Stray unstyled circles and open strokes** float on the floor with no fill, shadow or material,
    reading as leftover debug gizmos. (Low, 0.7)

## What the reviewer said works

- `13-pause.png` — "genuinely well-made: hierarchy, spacing, kbd chips, focused primary button. Ship
  it as-is."
- The warm motes around the crack in `22-brood-chamber.png` — the reference treatment.
- The roach sprite itself at 400 % zoom: layered plates, tapered antennae, specular streak. "The
  problem is context, not the asset."
- The suspicion tier pips as an icon+shape+count channel.

## Evidence gaps it flagged

No victory, eradication, spray, room-light-lift, flashlight-cone or trap-struggle capture — four of
which are the bible's loudest visual moments. Two filenames also did not match their contents.

## The three it would fix first

1. **Make the scout unmistakable** — everything else in the composition priority list is downstream of
   "which one am I". Suggested cheapest real fix: replace the cold additive radial with a hard
   silhouette stroke in a hue the floor does not own.
2. **Fix the value hierarchy and put warm light back in** — one fix, not two. "A 22-point luminance
   range across the entire playfield means *nothing* has emphasis." It also noted that shipping a
   "Brighter kitchen (readability)" toggle suggests the team already knew, and that the toggle treats
   a symptom.
3. **Redraw the sticky trap** — the smallest fix on the list, and it undermines every screenshot at
   suspicion tier ≥ 3, i.e. the whole back half of the game.

Dispositions for every finding are in `dispositions.md`. Note that this pass ran against captures
taken before the balance work; the screenshots have since been regenerated, so the specific luminance
figures above describe the build as it was reviewed, not as it now stands.
