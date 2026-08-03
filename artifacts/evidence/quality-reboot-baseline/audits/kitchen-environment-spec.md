# KITCHEN ENVIRONMENT SPEC — Baseboard Empire

**Scope:** environment and prop design for one compact modern Korean apartment kitchen at night, at
insect scale. Feeds a 3D asset-baking pipeline that renders each prop from a fixed camera to a sprite.

**Status:** design specification. No source file is modified by this document. Every proposed change
to `src/sim/kitchen.ts`, `src/sim/territory.ts` or `src/sim/constants.ts` is marked **[DELTA]** with
the current value and the reason.

**Authority:** where this file disagrees with `ART_BIBLE.md`, this file wins for environment and
props, and the ART_BIBLE row is listed in §0.2 as a recorded deviation. `REDESIGN_CONTRACT.md` §7
(Environment plan) and `GAME_CONTRACT.md` (eight regions, four operations) are upstream and are not
contradicted.

---

## 0. The defect this spec exists to fix

### 0.1 Root cause

`ART_BIBLE.md` shape-language table, row 1:

> Human architecture — Long straight edges, hard 90° corners, huge unbroken planes. **Cabinets and
> appliances are walls, not props.**

That sentence is the direct cause of the reported symptom. It licenses a base cabinet to be drawn as
one filled rectangle. `counterLeft` is 1080 × 470 world units — at the gameplay camera (1020 wu of
horizontal view) that is **106 % of the screen width and 82 % of the screen height, in one value.**
`fridge` is 944 × 700. `island` is 1240 × 560. Three objects can fill the entire viewport with three
flat fills. That is a floor plan, not a room.

The rule is replaced with:

> **Human architecture is a stack of parallel planes at different heights, seen from above.** A base
> cabinet is not a rectangle; it is five value planes across 470 wu of depth — worktop lip, door
> face, seam grid, handle bar with its cast shadow, and the toe-kick void. An appliance is not a
> rectangle; it is a body, a door seam, a gasket, a handle, a control strip, a plinth and a warm
> under-void. If a fixture can be drawn correctly with a single `fillRect`, it is drawn wrong.

Two corollaries, both quantitative and both testable:

- **Face-event rule.** No cabinet or appliance run may present more than **700 wu** of its
  room-facing edge without a vertical event (door seam, handle, drawer gap, appliance junction,
  toe-kick gap, filler panel). `counterLeft` currently presents 1080 wu with zero events.
- **Depth rule.** Every fixture edge that faces the room must resolve into at least **four distinct
  values** within 60 wu of that edge (lip highlight → face → seam shadow → toe-kick void). One value
  across a 470 wu depth is the entire "giant blue-black rectangle" symptom.

### 0.2 Recorded deviations from `ART_BIBLE.md`

| ART_BIBLE statement | Deviation | Reason |
| --- | --- | --- |
| "Cabinets and appliances are **walls**, not props." | Replaced by the plane-stack rule above. | Confirmed defect. It produced the unbroken rectangles. |
| Scale table: "Floor tile 320 wu" | **446 wu** (600 × 600 mm porcelain), or 297 wu if a 400 mm tile is preferred. | 320 wu = 431 mm. No tile is sold at 431 mm. Korean apartment kitchens are overwhelmingly 600 × 600 폴리싱 or 400 × 400. Pick a real size; the scale gag only works if the reference object is real. |
| Scale table: "Grout line 14 wu" | **2–3 wu of true joint, rendered with a 6 wu optical recess.** | 14 wu = 19 mm. Real tile joints are 2–4 mm. Widening the joint to make it visible is a lie the player can feel. Widen the *shadow*, not the *joint*. |
| Scale table: "Cabinet toe-kick 90 deep" | **52 wu visible recess (70 mm), 409–641 wu of void behind it.** | 90 wu = 121 mm is not a toe-kick, it is a plinth gap. The real gameplay object is the *void behind the kick board*, which is 6–12× deeper and is the reason cabinetry means safety. |
| "Fridge seam — warm, large, soft falloff", static intensity 0.82 | Baseline **0.05** (a specular seam line only). The 0.82 flood is **dynamic**, fires only when the door actually opens during the `snack` routine. | A closed refrigerator emits no light. A permanent flood from a closed door is exactly the "light with no visible cause" artefact ART_BIBLE §Legibility-4 forbids, and it wastes the strongest telegraph in the game on a constant. |
| Fridge light `warmth: 0.95` | **0.35** (≈ 4500 K). | Every refrigerator sold in Korea in the last decade uses a cold-white LED interior lamp. Urgency comes from the aperture opening and from motion, not from hue. |
| "Radiator" solid | Replaced (see §2.7). | **Korean apartments are heated by 온돌 underfloor heating.** There is no radiator in a Korean apartment kitchen. This is a cultural error visible to the target audience. |

---

## 1. Scale table

### 1.1 The conversion

Anchor: **scout body = 26 world units = 35 mm.** This matches `tools/bake/lib/units.mjs`
(`MM_PER_UNIT = 35 / 26`) exactly, and that file's rationale is adopted here verbatim: the species
that actually lives in Korean apartment kitchens is *Blattella germanica* (독일바퀴) at 13–16 mm, and
the scout is a **heroic adult** scaled to 35 mm so that domestic objects land in a readable size band
instead of dwarfing the player 40 : 1. Worker (20 wu = 27 mm) and nymph (12 wu = 16 mm) sit on the
same heroic scale.

| Direction | Factor |
| --- | --- |
| mm → world units | **× 0.742857** (26 / 35) |
| world units → mm | **× 1.346154** (35 / 26) |
| 1 m | **742.86 wu** |
| 100 mm | **74.3 wu** |
| 10 mm | **7.4 wu** |
| 1 mm | **0.74 wu** |

Round to whole world units. Never round the mm.

### 1.2 What the existing world actually measures

| Constant | World units | Real | Verdict |
| --- | --- | --- | --- |
| `WORLD_W` | 3600 | **4 846 mm** | Correct. A 32-평 apartment kitchen + dining bay. |
| `WORLD_H` | 2600 | **3 500 mm** | Correct, and exactly 3.5 m. |
| Interior after walls | 3488 × 2488 | 4 696 × 3 350 mm | 15.7 m². Correct for the brief ("compact"). |
| `WALL_THICKNESS` 56 | 56 | 75 mm | Correct (100 mm block + 15 mm plaster reads as 75 mm of drawn shell). |
| `COVER_RADIUS` 120 | 120 | 162 mm | Gameplay field, not geometry. Fine — but the drawn toe-kick must not pretend to be 162 mm deep. |
| `SCOUT_LENGTH` 26 | 26 | 35 mm | Anchor. |
| `WORKER_RADIUS` 8 / drawn ≈ 20 | 20 | 27 mm | Heroic-scale worker: 0.77 × the scout, matching the real worker/adult ratio. |
| Nymph 12 | 12 | 16 mm | 0.46 × the scout. At heroic scale this is a late-instar nymph; at true 독일바퀴 scale it is a full adult, which is the correct joke. |
| `SCOUT_SPEED` 218 wu/s | — | **293 mm/s** | A walk. Real *P. americana* sprints 1 500 mm/s. |
| `SCOUT_SPRINT_SPEED` 402 wu/s | — | **541 mm/s** | Still 1/3 of real. Acceptable — playability wins — but do not describe it as "fast" in copy. |
| Camera view (zoom ≈ 1.25) | 1020 × 574 | **1 373 × 773 mm** | The player sees roughly one dinner-table's worth of floor at a time. |

### 1.3 Screen-space readability bands

At the default gameplay camera the canvas is ~1280 px over 1020 wu → **1 wu = 1.255 px.**

| World units | Screen px | Real mm | Band | Rule |
| --- | --- | --- | --- | --- |
| < 3 | < 4 | < 4 mm | Sub-pixel | Draw as a value cluster or a stipple field. Never as a stroked line. Grout joints, sesame seeds, condensation beads, hair. |
| 3 – 10 | 4 – 13 | 4 – 13 mm | Grain | One shape, no internal detail. Rice grains, crumbs, gochugaru, cable strands. |
| 10 – 30 | 13 – 38 | 13 – 40 mm | Sub-scout | Silhouette only. Kibble, bottle caps, screw heads, a single fallen match. |
| **30 – 300** | **38 – 377** | **40 – 404 mm** | **Domestic band — the load-bearing one** | Silhouette + 2–4 internal features + a contact shadow. Every prop that communicates scale lives here. |
| 300 – 700 | 377 – 879 | 404 – 942 mm | Furniture | Reads as an obstacle. Must carry a foreground occluder or a void. |
| > 700 | > 879 | > 942 mm | Architecture | Must obey the face-event and depth rules of §0.1 or it becomes a blue-black rectangle. |

**The core gag, stated as a number:** a 200 mm dinner plate is **149 wu = 187 px** — 5.7 scouts across
and 18 % of the screen width. A 6 mm grain of rice is **4.5 wu** — one sixth of a scout. Both must be
on screen at the same time, often.

### 1.4 Anchor objects (memorise these five)

| Object | Real | World units | In scouts |
| --- | --- | --- | --- |
| Grain of cooked rice | 6 × 2.5 mm | 4.5 × 2 | 0.17 |
| Stainless rice bowl (공기) | Ø 110 mm | Ø 82 | 3.1 |
| Dinner plate | Ø 200 mm | **Ø 149** | 5.7 |
| Chopsticks (젓가락) | 230 × 6 mm | 171 × 4.5 | 6.6 long, 0.17 wide |
| Floor tile (600 mm) | 600 × 600 mm | 446 × 446 | 17.1 |

A chopstick is longer than six scouts and thinner than a scout's antenna is long. If a frame contains
a chopstick and a scout and the reader cannot tell which is the animal, the bake is wrong.

---

## 2. Floor plan

Coordinates are world units, origin top-left, +Y down, matching `src/sim/kitchen.ts`. `w`/`h` are
extents, so a solid occupies `[x, x+w) × [y, y+h)`.

### 2.0 Room shell and the doorway

| id | x | y | w | h | Real | Note |
| --- | --- | --- | --- | --- | --- | --- |
| `wallTop` | 0 | 0 | 3600 | 56 | 4 846 × 75 mm | Unchanged. Fully occupied by the top run — no exposed baseboard. |
| `wallLeft` | 0 | 0 | 56 | 2600 | 75 × 3 500 mm | Unchanged. |
| `wallRight` | 3544 | 0 | 56 | 2600 | — | Unchanged. |
| `wallBottomL` | 0 | 2544 | 2820 | 56 | — | **[DELTA]** was `w: 2880`. |
| `wallBottomR` | 3470 | 2544 | 130 | 56 | — | **[DELTA]** was `x: 3320, w: 280`. |
| `jambL` | 2776 | 2504 | 44 | 96 | 59 × 129 mm | **[DELTA]** was `x: 2836`. |
| `jambR` | 3470 | 2504 | 44 | 96 | — | **[DELTA]** was `x: 3320`. |

**[DELTA] Doorway width: 440 wu → 650 wu.** 440 wu is 592 mm. No door leaf, opening or 개구부 in a
Korean apartment is 592 mm; the standard single-leaf frame is 900 mm and open kitchen 개구부 run
1 000–1 800 mm. 650 wu = 875 mm reads as a real 900 mm frame while keeping the chokepoint that the
doorway zone needs. Low priority — it changes `wallBottom*` and the jambs only, and no nest,
resource or patrol waypoint sits in the affected band (patrol paths start at `x 3400`, still inside
the widened gap).

### 2.1 Top run — the wall the player never crosses

Reading left to right along `y = 56`:

| id | x | y | w | h | Real (mm) | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| `counterLeft` | 56 | 56 | 1080 | 470 | 1 454 × 633 | Base cabinet run: 3 door bays + 1 three-drawer bank. 600 mm carcass + 30 mm worktop overhang. |
| `stove` | 1136 | 56 | 700 | 500 | 942 × 673 | Freestanding gas range + 3-burner hob. |
| `counterRight` | 1836 | 56 | 700 | 470 | 942 × 633 | Base cabinet run: 2 door bays. Rice cooker and microwave live on this worktop. |
| — gap — | 2536 | 56 | 64 | 470 | 86 × 633 | Filler panel void beside the fridge alcove. Permanently black. A crack site. |
| `fridge` | 2600 | 56 | 677 | 641 | **912 × 863** | 4-door Korean refrigerator. Real published dimensions. |
| `tallUnit` | 3277 | 56 | 267 | 700 | 359 × 942 | **[NEW]** 키큰장 — the tall slim broom/pantry column that finishes a Korean 냉장고장. Fills the width honestly. |

**[DELTA] `fridge` 944 × 700 → 677 × 641 + a 267-wide `tallUnit`.** 944 wu = 1 270 mm. No single
refrigerator is 1 270 mm wide; 912 mm is the actual width of every Korean 4-door unit. Splitting the
alcove replaces one 944-wu blank rectangle with two objects of different height, material and value —
which is the face-event rule applied at architecture scale.

### 2.2 Left run — the colony's home wall

| id | x | y | w | h | Real (mm) | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| — open wall — | 56 | 526 | — | 374 | — | 503 mm of exposed wall + baseboard between the counter's end and the sink. The only exposed baseboard on the upper half of the map. |
| `sinkCabinet` | 56 | 900 | 500 | 640 | 673 × 862 | Sink base unit. Holds one 800 × 450 mm bowl. Doors open into the room. |
| `dishwasher` | 56 | 1540 | 500 | 420 | 673 × 565 | Built-in 식기세척기, compact 560 mm class. |
| `plumbingChase` | 56 | 1960 | 500 | 160 | 673 × 215 | **[NEW — replaces empty gap]** The service recess where the 배수 입상관 and the 다용도실 feed penetrate the slab. Permanently unlit, permanently damp. **This is where the home crack already is** (`home` nest at 168, 2042) and it has never been drawn. |
| `pantry` | 56 | 2120 | 700 | 424 | 942 × 571 | Tall pantry column projecting 942 mm into the room, closing the bottom-left corner. Its projection is what makes the home-crack pocket sheltered. |

The `plumbingChase` is the single highest-value addition in this document: the colony's home is
currently an unmarked point on a blank strip of floor between two rectangles.

### 2.3 Island

| id | x | y | w | h | Real (mm) |
| --- | --- | --- | --- | --- | --- |
| `island` | 1240 | 1180 | 1240 | 560 | 1 670 × 754 |

A 아일랜드 식탁: worktop overhanging 250 mm on the `y+` (room) side for stools, closed cabinetry on
the `y−` side. Perimeter = 3 600 wu of toe-kick, the longest single cover run in the kitchen.

### 2.4 Table and chair — the missing tops

`tableLegA..D` at (2700,1300) (3160,1300) (2700,1760) (3160,1760), 96 wu each. Leg spread
556 × 556 wu = **748 × 748 mm**.
`chairLegA..D` at (1520,2136) (1808,2136) (1520,2404) (1808,2404), 84 wu each. Leg spread
372 × 372 wu = **501 × 501 mm**.

**[NEW] Two foreground-occluder props, no collision:**

| Prop | x | y | w | h | lift | Real |
| --- | --- | --- | --- | --- | --- | --- |
| `tableTop` | 2978 | 1578 | 704 | 704 | 546 | 948 × 948 mm top at 735 mm height |
| `chairSeat` | 1706 | 2312 | 334 | 334 | 327 | 450 × 450 mm seat at 440 mm height |

Without these, eight posts stand in the middle of the room supporting nothing. This is the cheapest
available fix for both "large empty regions" and "no depth": two sprites that the colony visibly
walks *under*, casting two large soft shadows over 1 100 000 wu² of otherwise featureless floor.

Fiction: the chair is a fourth dining chair dragged away from the table toward the pantry and left
there. The floor under it has not been swept.

### 2.5 Bin corner and doorway — zone separation fix

**Defect:** `ZONES.trash` (2680–3544 × 1900–2544) and `ZONES.doorway` (2900–3544 × 2200–2600)
overlap by 644 × 344 = **221 536 wu², which is 40 % of the doorway zone.** One cluster of workers
standing in that rectangle raises hold in two of the three zones required to win.

**[DELTA] Three moves fix the overlap and give both zones their own resource:**

| Item | Was | Becomes | Reason |
| --- | --- | --- | --- |
| `ZONES.trash` | 2680, 1900, 864 × 644 | **2680, 1780, 864 × 400** | Ends at y 2180, clear of the doorway zone. |
| `trashBin` solid | 2980, 2020, 400 × 400 | **3060, 1820, 400 × 360** (split into three bodies — §3.7) | Bins go against the wall where a household actually puts them. |
| `trashSpill` resource | 2884, 2472 | **3040, 2050** | Now inside the trash zone; re-skinned as 음식물 쓰레기통 seepage. |
| `petBowl` resource | 2700, 2216 | **2960, 2300** | Now inside the doorway zone; the dog's bowl by the door. |

### 2.6 Right wall

| id | x | y | w | h | Real (mm) | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| `pipeShaft` | 3400 | 300 | 144 | 430 | 194 × 579 | Boxed 파이프 샤프트 with the yellow 가스 배관 running down its face. Kept from `pipeRun`. |
| `utilityDoor` | 3400 | 940 | 144 | 560 | 194 × 754 | **[DELTA — replaces `radiator`]** Recessed 다용도실 (utility balcony) door frame. Motivates the window light. A 4 wu light seam under the leaf. |

**Why the radiator goes:** Korean apartments use 온돌 underfloor heating. A wall radiator in a
Korean apartment kitchen is a visible cultural error to the target audience and it emits nothing the
lighting plan needs. The utility-room door does three jobs the radiator did none of: it motivates the
cold window shaft (§5), it explains the drain and gas penetrations on that wall, and its threshold is
a 6 wu climbable ridge for the scout.

### 2.7 The eight semantic zones

Rects as authored in `src/sim/territory.ts`, with the two deltas from §2.5.

| # | Zone | Rect (x, y, w, h) | Nav function | Concealment | Resource | Threat interaction | Routine |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Sink run** | 56, 820, 720 × 780 | The wet corridor. Only north–south route on the left wall; the sink cabinet's projecting doors force a 220 wu pinch at x 556. | **High.** Target ≥ 72 % of zone floor within 120 wu of an edge. Under-sink plumbing void (409 × 500 wu) is total cover. | `sinkDrip` water 640 @ (664, 1312) — the tutorial water line. | Cleaning cloth erases scent here first; the sink is patrol waypoint 4–5 on three of five routes. Wettest floor = worst sprint traction fiction. | **Washing up.** Moisture bloom + a cloth that wipes pheromone. |
| 2 | **Dishwasher** | 56, 1600, 720 × 480 | The short hop between the sink and home. The safest 480 wu in the kitchen. | **Very high.** Dishwasher plinth void 446 × 446 wu, plus the `crackSink` foothold at (604, 1568). | `dishCrumbs` food 680 @ (712, 1704) — the tutorial food line. | Lowest patrol density. The zone the player is *taught* safety in, so later betrayals land. | Dishes are stacked here waiting; the routine moves them. |
| 3 | **Pantry** | 56, 2080, 900 × 464 | The bottom-left corner. Dead end — one way in, along the wall. | **Highest.** The pantry column's 942 mm projection makes a 3-sided pocket. Home crack + `crackPantry`. | `pantryGrain` food 1 200 @ (912, 2312). | A dead end is a trap when a spray comes down the baseboard: `homeSweep` and `baseboardSweep` both terminate here. The colony's safest ground is also its most cornerable. | Nothing routine happens here at night — which is exactly why it is home. |
| 4 | **Stove** | 1040, 56, 900 × 720 | Top-centre. Crossing it means 720 wu of open floor under the hood. | **Medium.** Range plinth void 371 × 557 wu is warm and greasy; `crackStove` at (1980, 640) is the warmest crack in the kitchen. | `stoveGrease` food 820 @ (1608, 716). | Patrol waypoints on `stoveCheck`, `sinkRinse`, `fullSweep`. The range hood is a foreground occluder — the colony is briefly invisible under it, and so is the threat. | Cooking happened three hours ago; the grease is still tacky and the hob is still 8 °C above ambient. |
| 5 | **Refrigerator** | 2400, 56, 1144 × 900 | Top-right. The widest single fixture face in the game. | **Medium-low** on the floor, **total** in the compressor void behind and under the body (641 × 677 wu at 74 wu clearance) — the warmest, most food-rich real estate in a real kitchen. | `fridgeCondensation` water 1 250 @ (2556, 872). | The `snack` routine floods this zone with 4 500 K light for its duration. The most useful and most dangerous place in the kitchen — and now it is dangerous *episodically* rather than constantly. | **Midnight snack.** Door opens, light floods, crumbs appear. |
| 6 | **Island** | 1180, 1120, 1400 × 800 | The centre. Every cross-kitchen route either hugs the island or crosses open floor. | **Medium.** 3 600 wu of toe-kick perimeter, but the 250 mm overhang side has no kick recess — a 754 wu stretch of the south face is *not* cover, and the player must learn that. | `islandDrop` food 1 150 @ (1872, 1948). | Every one of the five patrol paths crosses the island's perimeter. `islandSweep` is aimed at it. The single highest-traffic, highest-heat surface. | Food was plated here. Delivery containers are still on it. |
| 7 | **Bin corner** | 2680, 1780, 864 × 400 **[DELTA]** | Right wall, above the doorway. A 400 wu shelf between the table and the door. | **Medium.** Under-bin voids (three of them, 40–74 wu clearance) plus `crackBin` at (3428, 2088). | `trashSpill` food 1 900 @ (3040, 2050) **[DELTA]** — re-skinned as 음식물 쓰레기통 seepage. | The richest food in the kitchen on ground that is lit by the hall spill and crossed by every patrol on its way in and out. | **Bin run.** Bags are lifted and carried out; the seepage ring is left behind. |
| 8 | **Hall doorway** | 2900, 2200, 644 × 400 | The threshold. Every human enters and leaves here; every patrol path begins and ends at (3400, 2520). | **Lowest.** The 6 wu threshold ridge is the only relief. The hall spill lights it permanently. | `petBowl` water 1 700 @ (2960, 2300) **[DELTA]**. | Zero warning distance. A patrol is already inside the zone when it becomes visible. Holding this zone is the hardest single thing in the game and it should be. | Recycling bags are staged here for tomorrow morning; slippers are kicked off here. |

### 2.8 Baseboard and wall-crack network

The game is named after this. It has never been drawn.

**Geometry.** A continuous 52 wu (70 mm) recess at the base of every wall face and every cabinet run,
with a 9 wu (12 mm) proud 걸레받이 board along the wall runs. Behind the kick board is the **void**:
409–641 wu deep, unlit, and the only true `#05070b` in the kitchen.

| Run | Extent (wu) | Real |
| --- | --- | --- |
| `counterLeft` front, y 526 | x 56 → 1136 = 1 080 | 1 454 mm |
| `stove` plinth, y 556 | x 1136 → 1836 = 700 | 942 mm |
| `counterRight` front, y 526 | x 1836 → 2536 = 700 | 942 mm |
| `fridge` + `tallUnit` front | x 2600 → 3544 = 944 | 1 271 mm |
| `sinkCabinet` front, x 556 | y 900 → 1540 = 640 | 862 mm |
| `dishwasher` front, x 556 | y 1540 → 1960 = 420 | 565 mm |
| `pantry` front + return | 700 + 424 = 1 124 | 1 513 mm |
| `island` perimeter | 2 × (1240 + 560) = 3 600 | 4 846 mm |
| Left wall exposed | 374 + 160 = 534 | 719 mm |
| Right wall exposed | 184 + 1 044 = 1 228 | 1 653 mm |
| Bottom wall exposed | 2 064 + 74 = 2 138 | 2 878 mm |
| **Total continuous edge** | **≈ 13 108 wu** | **17.6 m** |

**504 scout-lengths of wall-hugging route.** State that number in the tutorial copy if it helps; the
point is that the baseboard network is a real graph, not a decorative trim.

**Six crack sites, each at a named physical failure.** A crack that is not caused by something is a
sprite; a crack caused by something is a place.

| Nest | Position | Physical cause | Drawn size |
| --- | --- | --- | --- |
| `home` | 168, 2042 | Slab penetration where the 배수 입상관 passes through; the mortar collar has cracked and shrunk away from the 60 mm pipe. | 45 wu collar gap opening into a 180 × 45 wu fissure. |
| `crackSink` | 604, 1568 | Silicone bead failure at the sink cabinet's right end panel / wall junction. Permanently damp. | 92 × 46 wu slot. |
| `crackIsland` | 1362, 1796 | Island kick-board fastener pulled out; the board sits 8 mm (6 wu) proud. | 92 × 46 wu slot, with the board edge visible as a 6 wu lip. |
| `crackPantry` | 836, 2494 | Bottom-wall 걸레받이 lifted off the tile by slab movement; a 4 mm (3 wu) tapering gap running 92 wu. | 92 × 46 wu, tapering. |
| `crackStove` | 1980, 640 | Filler-panel gap beside the range. Grease has wicked into it for years. The warmest crack: +6 °C. | 92 × 46 wu, with a grease halo out to 140 wu. |
| `crackBin` | 3428, 2088 | Right-wall drain penetration for the 다용도실. Cold, wet, and it smells like the bin. | 92 × 46 wu around a 40 wu pipe collar. |

**Anti-empty-region consequence.** The `plumbingChase` (§2.2), the `tableTop`/`chairSeat` occluders
(§2.4) and the six authored crack causes together add roughly **1.9 M wu² of newly non-blank floor**
to a map whose measured problem was "the main traffic area is ~90 % bare" (`REDESIGN_CONTRACT` P7).

---

## 3. Prop families

### 3.0 Reading the tables

**Material codes.** Defined once here; the bake pipeline reads the code, not the adjective.

| Code | Material | Albedo | Spec / roughness | Behaviour that matters |
| --- | --- | --- | --- | --- |
| `M-STL` | Brushed stainless | 0.55 | 0.62 / 0.28, anisotropic 0.8 along brush | Widest value range in the kitchen: blows to `#e8f0ff` under direct light, drops to `#26323c` in shadow. Use it to break dark regions. Brush direction is always along the object's long axis. |
| `M-STLM` | Mirror stainless (밥공기, pot lids, kettle) | 0.62 | 0.90 / 0.06 | Reflects. Bake a fixed environment: ceiling plane + one warm blob at 30° + one cold blob at 200°. |
| `M-CER` | Glazed ceramic | 0.78 | 0.35 / 0.35 | Broad soft specular sweep across the whole form. 1.5 wu of edge translucency at rims. |
| `M-PLA` | Matte plastic | 0.42 | 0.18 / 0.60 | Inert. Value comes from form only. |
| `M-PLT` | Translucent plastic (봉투, PET, delivery lids) | 0.38 | 0.22 / 0.45, transmission **0.45** | **The only material that emits when back-lit.** A bin bag between the hall spill and the camera glows. Use it deliberately. |
| `M-WOD` | Wood / melamine | 0.50 | 0.12 / 0.70 | Grain at 8 wu pitch, always along the long axis. |
| `M-GLS` | Glass | 0.10 | 0.90 / 0.04, transmission 0.85, IOR 1.5 | Throws a caustic bead onto the floor: 0.35 × the bottle's footprint, offset away from the light. Soju green tints its caustic. |
| `M-FAB` | Fabric | 0.35 | 0.02 / 0.95 | A value sink. 2 wu of fibre fuzz on the silhouette. Absorbs light — fabric props are hiding places. |
| `M-CRD` | Corrugated cardboard | 0.44 | 0.06 / 0.85 | Where grease has soaked in, transmission rises to 0.30 and the patch back-lights. Flute pitch 5 mm = 3.7 wu, visible only on cut edges. |
| `M-RUB` | Rubber / PVC | 0.24 | 0.28 broad / 0.50 | Darkest common material. Overuse creates false voids. |
| `M-ORG` | Organic (crumbs, kibble, grease, food) | 0.50 | 0.20 / 0.65, subsurface 0.35 warm | Warm rim under any light. This is what makes food *read* as food. |
| `M-FLU` | Fluid | — | — | Dark core, one bright arc highlight tracking the strongest source, cold rim, 0.6 Hz surface wobble. |

**Sim column.** `solid` = collides. `pass` = no collision, walked over. `climb` = a lip or ramp,
traversable at 0.6× speed, blocks line of sight below its height. `void` = shelter volume, counts as
cover, spray-resistant. `occl` = drawn *after* entities as a foreground occluder.

**Occ column.** Whether the prop occludes light in the lighting pass (casts into the room).

**Bake camera (all props) — reconciled with the shipping pipeline.** `tools/bake/` already exists and
already implements most of this contract. Its constants are authoritative and are restated here so
this spec and that code cannot drift:

| Constant | `tools/bake/lib/units.mjs` | This spec |
| --- | --- | --- |
| `MM_PER_UNIT` | `35 / 26` | **Agrees.** §1.1. |
| `CAMERA_TILT_DEG` | **26°** off nadir, orthographic | **Adopt 26°.** A prop of height *h* reveals `tan 26° = 0.488 × h` wu of front face — so the 171 wu detergent bottle shows 83 wu of side. Generous, but `tools/bake/props/sink.mjs` has already been tuned against it (the drain throat was cut from 52 mm to 30 mm because at 26° the far well wall was invisible). Do not change the tilt without re-tuning every inset. |
| `SSAA` | **4** (16 samples/output px) | **Agrees.** This is the whole reason to bake offline. |
| `BAKE_PPU` | **2.0** | **Recommend 2.5.** The file's justification assumes "~1200 wu across 1920 px = 1.6 px/unit", but `Camera.resize` is `zoom = clamp(w / 1020, 1.15, 2.3)` — it shows **1 020 wu**, and the clamp ceiling of **2.3 px/wu** is reached on any viewport ≥ 2 346 device px (a 1 440 CSS-px canvas at `devicePixelRatio` 2). **At `BAKE_PPU = 2.0` the shipping sprite is undersampled by 15 % at max zoom.** 2.5 restores headroom. |

Lighting for the bake is **static sources only** — `tools/bake/lib/rig.mjs` already gets this right
and its comment states the reason ("baking [the torch] would nail a moving light to every object in
the room"). Its three-light rig maps onto §5 as: key = `underCabinetLED` (cool white `0xdce8f5`,
above-left-behind), warm fill = `fridgeSeam`/`hallSpill` (`0xffcf9a`, from the right), hemisphere =
room bounce. Keep that mapping; §5.1 adds the sources it does not yet carry.

Padding: 3 world units (`opts.pad`), already implemented. Contact shadow baked into the same sprite:
an elliptical multiply, opacity `0.55 × (1 − lift/400)` clamped to [0.10, 0.55], blur radius
`4 + lift × 0.25` wu.

---

### 3.1 Sink run

The stainless sink is the loudest identity object in a Korean kitchen. Give it the value range.

| Prop | Real (mm) | World units (w × h, lift) | Mat | Light | Occ | Sim | Fiction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sinkBowl` | 780 × 440 × 210 deep | 579 × 327, recess −156 | `M-STL` | Brush runs along +X. Anisotropic band across the bowl floor; the four corner radii catch the under-cabinet LED and are the brightest 20 wu in the kitchen. | Y | `void` (from above: a basin the scout can fall into and must climb out of) | The one object nobody mistakes. |
| `basketStrainer` | Ø 145 flange, Ø 105 basket, 60 deep | Ø 108 / Ø 78, recess −45 | `M-STL` | Flange is a polished torus: one continuous specular ring. The basket cage is 24 vertical slots, 3 mm (2.2 wu) each — **below the sub-pixel band, so bake them as a value gradient, not as 24 strokes.** | Y | `void` — the drain is a passage into the wall network | The Korean 배수구 거름망. Round, seated, with a lifting tab. **Not** a cross-hatched circle. |
| `strainerTab` | 40 × 12 × 3 | 30 × 9, lift 2 | `M-STL` | One bright edge. | N | `climb` | The finger tab. 30 wu — one scout length. This single detail is what says "strainer" and not "grate". |
| `faucet` (pull-out 수전) | base Ø 45, reach 220, height 380 | base Ø 33, arm 163 × 16, lift 282 | `M-STLM` | Mirror tube: reflects the whole room compressed into a 16 wu band. Under the LED it is a hard white line. | Y | `occl` + `solid` at the base | The scout runs under the spout. |
| `dryingRack` (식기건조대) | 450 × 300 × 380 | 334 × 223, lift 282 | `M-STL` | 14 wire rungs at Ø 4 mm (3 wu). Below sub-pixel — bake as a striped value field with 3 hero rungs picked out at full contrast. | Y | `occl` | Wet dishes still in it: someone washed up and did not put away. |
| `platesInRack` ×4 | Ø 200 × 22 each, on edge | 149 × 16 each, lift 130–282 | `M-CER` | Edge-on: a bright 16 wu crescent per plate, dark between. Four crescents in a row is the most legible "clean dishes" silhouette available. | Y | `occl` | — |
| `riceBowl` (스텐 공기) ×2 | Ø 110 × 65 | Ø 82, lift 48 | `M-STLM` | Mirror hemisphere. Bake one warm blob + one cold blob + the ceiling. A 82 wu chrome dome is a light source by proxy. | Y | `climb` | Stainless rice bowls are Korean-specific and unmistakable. |
| `sponge` (수세미) | 95 × 70 × 35 | 71 × 52, lift 26 | `M-FAB` | Open-cell: 0 specular, 3 wu fuzz, and a **damp gradient** — the bottom 12 wu is 22 % darker and slightly cold. | N | `climb`, `void` under the lip | Still wet. Somebody used it tonight. |
| `detergentBottle` (주방세제 500 ml) | Ø 75 × 230 | Ø 56 footprint, silhouette 56 × 171, lift 171 | `M-PLT` | **Back-lit by the under-cabinet LED it glows through**, a 56 × 120 wu soft green-blue lozenge. The strongest single use of `M-PLT` in the kitchen. | Y | `occl` + `solid` | The one bottle every kitchen has. Label = abstract colour bands + a pump collar. **No logo, no wordmark.** |
| `dishTowel` (행주) | 400 × 300, draped over the sink edge | 297 × 223, lift 0–89 (drapes) | `M-FAB` | Value sink. Two fold shadows at 0.35 opacity. Damp half is 18 % darker. | Y | `void` (roaches go *under* it) | Draped, not folded. Folded reads as tidy; draped reads as three hours ago. |
| `rubberGlove` (고무장갑) | 320 × 130 | 238 × 97, lift 30 | `M-RUB` | Broad soft specular over a saturated hue. **The only large saturated non-toxin colour permitted in the kitchen** — pink/red. Deploy once, here, as the eye-catch of the sink zone. | Y | `occl` | Turned inside out and left on the edge. Instantly, specifically Korean. |
| `wasteTrap` (배수 트랩) | body Ø 90, pipe Ø 40, run 240 | body Ø 67, pipe 30, run 178 | `M-PLA` (white PVC) | Inside the cabinet void: near-black with one 4 wu edge highlight from the LED spill. | Y | `solid` + `void` beneath | Replaces the oversized `pipeElbow` (132 × 210 wu = a 178 mm waste pipe; nothing is). |
| `corrugatedHose` | Ø 50, 600 long | Ø 37 × 446 | `M-PLA` | 24 ribs at 25 mm (18.6 wu) pitch — **in-band, draw them.** A ribbed hose is a ladder the scout climbs. | Y | `climb` | Dishwasher drain, zip-tied badly. |
| `floorDrip` ×3 | Ø 60–160 puddles | Ø 45–119 | `M-FLU` | Dark core, one arc highlight, cold rim, 0.6 Hz wobble. | N | `pass` (slows to 0.85×) | The trap weeps. This is `sinkDrip`, and now it has a cause. |
| `waterPurifier` (직수형 정수기) | 180 × 400 × 380 | 134 × 297, lift 282 | `M-PLA` + `M-GLS` panel | Standby: a 30 × 11 wu cyan 7-segment at 7 500 K, intensity 0.14, radius 120 wu. Cold-white rim on the gloss front. | Y | `occl` + `solid` | Near-universal in Korean apartments. A motivated light source that costs one small sprite. |
| `outlet` + `multiTap` (멀티탭) | outlet 120 × 70; strip 250 × 45 | 89 × 52; 186 × 33, lift 22 | `M-PLA` | Three 5 mm (3.7 wu) red switch LEDs, 2 000 K, radius 60 wu, intensity 0.12 each. | N | `climb` | Every Korean kitchen has one too many. |

**Zone light budget:** under-cabinet LED (static), water purifier display (static), multi-tap LEDs
(static). No dynamic source. The sink is the *readable* zone — that is why it is the tutorial.

---

### 3.2 Dishwasher

| Prop | Real (mm) | World units | Mat | Light | Occ | Sim | Fiction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `dwControlStrip` | 560 × 45 | 416 × 33 | `M-STL` | Six 4 mm indicator dots; one amber "rinse aid" pinprick is lit. Intensity 0.08, radius 45 wu. | N | — | The only face event on a 565 mm door. Required by §0.1. |
| `dwHandle` | 540 × 32, standing 40 proud | 401 × 24, lift 30 | `M-STL` | A hard specular line the full width. Casts a 22 wu shadow bar down the door. | Y | `climb` | The depth rule made visible in one sprite. |
| `dwPlinth` void | 560 × 600 × 100 clear | 416 × 446, clearance 74 | — | Pure `#05070b`, 12 wu penumbra at the mouth. | — | `void` | The safest 185 000 wu² in the kitchen. |
| `plateStack` ×5 | Ø 200 × 22 each, stacked | 149 × 16, total lift 80 | `M-CER` | **Not concentric circles.** From 15° off nadir a stack of five plates is: one elliptical top face + four 3.5 wu rim crescents down the −Y side + one contact shadow. The rims are the read. | Y | `climb` (the stack is a 3-step staircase) | The current build draws a plate as two concentric rings. That is a target reticle. |
| `sideDish` (반찬 접시) ×3 | 120 × 90 × 25 | 89 × 67, lift 19 | `M-CER` | Soft sweep; a food residue crescent at 0.3 opacity on the inner face. | N | `climb` | Nobody washes 반찬 dishes immediately. |
| `soupBowl` (국그릇) | Ø 145 × 60 | Ø 108, lift 45 | `M-CER` | 8 wu of rim translucency where light rakes it. | Y | `climb`, `void` if inverted | — |
| `mug` | Ø 85 × 95, handle +40 | Ø 63, handle 30 × 15, lift 71 | `M-CER` | The handle is the silhouette. Handle-out, always. | Y | `climb` | — |
| `chopsticks` (젓가락) ×2 | 230 × 6 | 171 × 4.5 | `M-STLM` | A 171 wu mirror line with one moving highlight. Two crossed chopsticks are the single best scale gag in the kitchen. | N | `climb` (a 4.5 wu ridge) | Metal, flat-sectioned, Korean. |
| `spoon` (숟가락) | 205 × 42 | 152 × 31 | `M-STLM` | The bowl of the spoon is a 31 wu concave mirror: it collects the LED into a single hot point. | N | `climb` | — |
| `cutleryHolder` (수저통) | Ø 110 × 150 | Ø 82, lift 111 | `M-STL` | Perforated: 5 mm holes at 12 mm pitch = 3.7 wu at 9 wu. Bake as a stipple. | Y | `occl` + `solid` | — |
| `crumbField` | 2–8 mm particles, ~200 of them | 1.5–6 wu each, cluster 150 × 118 | `M-ORG` | Warm subsurface rim on every particle ≥ 3 wu; below that, value only. | N | `pass` | `dishCrumbs`. Bread, rice, sesame — three sizes, not one. |
| `greaseFilm` | — | 230 × 96 field | `M-ORG` | No geometry. A specular-only overlay: raises roughness-inverse by 0.25, so grease reads *only* where a light rakes it. Invisible in shadow, obvious under the torch. | N | `pass` (0.9× speed) | This is how grease behaves and it is a free threat telegraph. |
| `baseboardGap` | 125 × 62 | 92 × 46 | — | Void. | — | `void` | `crackSink`. |

---

### 3.3 Pantry

| Prop | Real (mm) | World units | Mat | Light | Occ | Sim | Fiction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `riceContainer` (쌀통 20 kg) | 300 × 400 × 500 | 223 × 297, lift 371 | `M-PLA` + `M-PLT` window | The measuring window back-lights: a 60 × 90 wu warm panel showing the grain line. **The most efficient "there is food here" sprite in the game.** | Y | `occl` + `solid` | No Korean kitchen lacks one. |
| `ramyeonPack` (라면 5개입) | 270 × 190 × 110 | 201 × 141, lift 82 | `M-PLT` | Crinkled foil-laminate: 12–20 specular facets at random angles, each 4–12 wu. Reads as *packaging* from the facet noise alone. | Y | `occl` | Abstract colour blocks only. No wordmark. |
| `foodContainer` (밀폐용기 1 L) ×4 | 180 × 130 × 65 | 134 × 97, lift 48 each; stack of 3 = 145 | `M-PLT` | Clear body + opaque lid. Back-lit, the contents cast a coloured shadow *through* the box. Stack three: three glow levels. | Y | `climb` / `occl` | The four-latch Korean container. Draw the four latch tabs (22 × 15 wu each) — they are the recognisable part. |
| `gochujangTub` (고추장) | Ø 95 × 120 | Ø 71, lift 89 | `M-PLA` | Opaque red body, a 4 wu tamper ring. | Y | `climb` | — |
| `sesameOil` (참기름) | Ø 55 × 190 | Ø 41, lift 141 | `M-GLS` amber | Amber glass: throws a **warm caustic bead**, Ø 26 wu, offset 34 wu from the light. The only amber caustic in the kitchen. | Y | `occl` | — |
| `seaweedPack` (김) | 200 × 130 × 30 | 149 × 97, lift 22 | `M-PLT` | Metallised: a single broad anisotropic sheen across the whole face. | N | `climb` | — |
| `snackBag` (과자봉지) | 300 × 200, half-crushed | 223 × 149, lift 60 | `M-PLT` | Facet noise + one torn edge, 40 wu long, with 3 wu serrations. Torn = opened = food is reachable. | Y | `void` beneath the fold | Where `pantryGrain` comes from. |
| `glassJar` | Ø 90 × 150 | Ø 67, lift 111 | `M-GLS` | Cold caustic bead Ø 30 wu. | Y | `occl` | — |
| `grainSpill` | ~400 rice grains, 6 × 2.5 mm each | 4.5 × 2 wu each over 168 × 128 | `M-ORG` | Each grain is 4.5 wu = 6 px: a two-value lozenge with a warm rim. **Draw individual grains.** A stipple field reads as noise; 400 discrete lozenges read as rice. | N | `pass` | `pantryGrain`. The scale gag at its purest: a rice grain is 1/6 of a scout. |
| `dustBunny` (먼지 뭉치) ×3 | 20–60 | 15–45 | `M-FAB` | Fibre fuzz silhouette, 2 wu, backlit rim only. Value 0.12 above the floor. | N | `pass` | Corner dust. Nobody vacuums behind the 쌀통. |
| `hairStrand` ×4 | 200 × 0.08 | 149 × <1 (draw at 1 px min) | `M-FAB` | One dark curve with a single 20 wu specular segment. | N | `pass` | 149 wu long and thinner than an antenna. Free scale reference. |
| `floorAccessPanel` (온돌 점검구) | 300 × 300 | 223 × 223, recess 3 | `M-PLA` | A 4 wu frame line + a 22 × 15 wu lift slot. | N | `climb` (3 wu lip), `void` at the slot | **Korean-specific and load-bearing:** the underfloor-heating inspection hatch. A real mid-scale floor feature, a navigation landmark on bare tile, and a plausible crack. |

---

### 3.4 Stove

| Prop | Real (mm) | World units | Mat | Light | Occ | Sim | Fiction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `hobPlate` | 750 × 450 cut-out | 557 × 334, recess −6 | `M-STL` | Brushed, +X. The recess edge is a 6 wu dark line all round: the face event that separates hob from worktop. | Y | `solid` | — |
| `panSupport` (삼발이) ×3 | Ø 220 cast iron | Ø 163 | `M-RUB`-value cast iron (albedo 0.13) | Near-black four-arm star. Only the top 2 wu of each arm catches light. **The darkest object above floor level** — and therefore a hard silhouette. | Y | `climb` (arms are 22 wu wide bridges) | The current `burner` prop at 168 wu is *this*, not a burner. |
| `burnerCap` ×3 | Ø 120 / 100 / 80 | Ø 89 / 74 / 59 | `M-RUB` cast iron | Concentric flame-port ring: 36 ports at Ø 2.5 mm — sub-pixel, bake as a dotted value ring. | Y | `climb` | Three *different* sizes. Three identical circles is the procedural-noise smell. |
| `hobKnobs` ×3 | Ø 45 × 25 | Ø 33, lift 19 | `M-PLA` | One 12 wu white index line each, at three different angles. | N | `climb` | Different angles = somebody turned them. |
| `rangeHood` (후드) | 900 × 500, at 1 500 height | 668 × 371, lift **1 114** | `M-STL` | **Foreground occluder.** Casts a 668 × 371 wu soft shadow (blur 60 wu) onto the hob and floor. Its grease filter mesh is 12 mm pitch = 9 wu; bake the mesh only in the 40 wu the light rakes. | Y | `occl` | The largest occluder in the kitchen. Roaches and threats both vanish under it. |
| `fryingPan` (프라이팬) | Ø 280, handle 200 | Ø 208, handle 149 × 26, lift 45 | `M-STL` + `M-RUB` handle | Non-stick interior: a broad low-contrast sweep, no hard highlight. The rim is the only hard specular. | Y | `occl` + `climb` (rim is a 8 wu wall) | Still on the hob. Not washed. |
| `stockPot` (냄비) | Ø 220, handles to 320 | Ø 163, span 238, lift 111 | `M-STLM` | Mirror cylinder + a mirror lid dome. Under the oven clock it is a secondary light source. | Y | `occl` + `solid` | — |
| `ladle` (국자) | 350 × 90 | 260 × 67, lift 30 | `M-STLM` | The bowl is a 67 wu concave mirror. Highlight moves with the torch — a passive threat telegraph. | N | `climb` | Left in the pot. |
| `riceCooker` (전기밥솥) | 280 × 380 × 250 | 208 × 282, lift 186 | `M-PLA` gloss + `M-STL` band | **Motivated light.** Keep-warm display: 40 × 15 mm = 30 × 11 wu, 7 500 K cyan, intensity 0.18, radius 120 wu. Gloss shell throws one long vertical highlight. | Y | `occl` + `solid` | The single most identifying object in a Korean kitchen. It has been on keep-warm since dinner. |
| `cookerCondensate` | Ø 180 ring | Ø 134 | `M-FLU` | Thin film: no core, just a cold rim and a broad low-contrast sheen. | N | `pass` | The steam vent has been dripping onto the worktop for four hours. Free moisture source, free habitation cue. |
| `microwave` (전자레인지) | 480 × 380 × 280 | 356 × 282, lift 208 | `M-STL` + `M-GLS` door | Door mesh: 1 mm perforations at 2 mm pitch — sub-pixel; bake as a flat 0.15-value screen. Clock: 60 × 20 mm = 45 × 15 wu, cold white (warmth 0.15), intensity 0.35, radius **240 wu**. | Y | `occl` + `solid` | **[DELTA]** the `ovenClock` light currently has `radius: 430`, i.e. a 579 mm pool from a 60 mm emitter. Physically impossible and it flattens the stove zone. |
| `gasPipe` (가스 배관) | Ø 20, wall run 1 200 | Ø 15 × 891 | `M-PLA` yellow | Matte safety-yellow. The **only** yellow in the game. One 891 wu line down the wall is an unmistakable Korean signature at zero cost. | Y | `climb` (a 15 wu rail along the wall) | — |
| `greaseFan` | droplets 1–4 mm over a 400 radius arc | 0.74–3 wu over a 297 wu fan | `M-ORG` | Specular-only, as §3.2. The fan points *away* from the hob at 140°: splatter has a direction, and direction is what makes it read as an event rather than a texture. | N | `pass` | `stoveGrease`. Still tacky. |
| `gochugaruDust` | 1 mm flakes | 0.74 wu, ~120 flakes over 200 wu | `M-ORG` | Sub-pixel: a warm-red value field at 4 % contrast, no discrete shapes. | N | `pass` | 고춧가루 on the worktop. Two pixels of colour that place the kitchen in Korea. |
| `applianceCable` ×2 | Ø 8, 1 800 long | Ø 6 × 1 337 | `M-RUB` | One broad soft specular running the length, breaking at every bend. Where it lies on tile it casts a 3 wu contact line; where it lifts over the toe-kick it casts nothing. | N | `climb` (a 6 wu ridge) | Rice cooker and microwave both plugged into one multi-tap. |

---

### 3.5 Refrigerator

| Prop | Real (mm) | World units | Mat | Light | Occ | Sim | Fiction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `fridgeBody` | 912 × 863 × 1 850 | 677 × 641 | `M-STL` | Brushed **vertically** — 90° to every other stainless surface, which is how you tell a fridge from a dishwasher with the lights off. | Y | `solid` | — |
| `doorSeam` | 4 wide, 863 long (centre split) | 3 × 641 | — | **Baseline: a specular line only, intensity 0.05.** It catches the hall spill and nothing else. See §5 for the dynamic flood. | — | `void` (2.2 wu — nothing fits; it is a *tease*) | A closed fridge is dark. |
| `doorGasket` (도어 패킹) | 20 wide, magnetic | 15 × 641 per leaf | `M-RUB` | Matte black channel with a 3 wu soft highlight on the outer lip. Where the gasket has perished (30 wu section, lower left) it stands 4 wu proud and the seam glows through it even when closed. | Y | `void` at the perished section | The perished gasket is why the fridge zone is a resource at all. |
| `fridgeHandle` ×2 | 900 × 35, 60 proud | 668 × 26, lift 45 | `M-STLM` | Two 668 wu mirror bars. They cast two hard 33 wu shadow bars down the door face. **This is the fridge's face-event rule satisfied in one prop.** | Y | `occl` | — |
| `magnets` ×4 | 90 × 50 / Ø 40 | 67 × 37 / Ø 30, lift 3 | `M-PLA` | Flat. Value only. | N | `climb` | Abstract shapes and colour blocks. **No brand marks.** |
| `deliveryFlyer` (배달 전단지) | 210 × 297 | 156 × 221, lift 2 | `M-CRD` paper | Matte, one soft crease shadow. **The tear-off phone-number comb along the bottom edge — 8 tabs, 18 × 30 mm = 13 × 22 wu each, two already torn off.** | N | `climb` | The comb of tear tabs is instantly, specifically Korean and contains zero readable text. |
| `schoolNotice` | 210 × 297 | 156 × 221 | `M-CRD` paper | Type rendered as abstract grey rules at 3 wu pitch. | N | `climb` | Someone's child lives here. |
| `condenserGrille` (하부 그릴) | 800 × 100, slots at 12 pitch | 594 × 74, slot pitch 9 | `M-PLA` | Slots are 9 wu — in-band, draw them. Behind them: a warm 2 200 K haze at intensity 0.10, radius 200 wu. **Warm air is visible as a slight value lift and a dust drift.** | Y | `void` (the slots are 9 wu; a nymph fits, a scout does not) | The only place in the kitchen that is warmer than the room. |
| `lintMat` | 300 × 120 dust drift | 223 × 89 | `M-FAB` | 3 % contrast fibre field, denser toward the grille. | N | `pass` | Four years of lint blown out by the condenser fan. |
| `compressorVoid` | 912 × 863 × 100 clear | 677 × 641, clearance 74 | — | Pure `#05070b`, 16 wu penumbra. +6 °C. | — | `void` | The warmest, darkest, safest 434 000 wu² in the kitchen. Everything the colony wants. |
| `condensationField` | 1–4 mm beads coalescing to 20 mm runs | 0.74–3 wu beads, 15 wu runs | `M-FLU` | Beads below 3 wu are a value field; runs above 10 wu get a core + rim. Density falls off from the door seam over 220 wu. | N | `pass` | `fridgeCondensation`. |
| `drainTrayPuddle` | Ø 200 | Ø 149 | `M-FLU` | Full fluid treatment: core, arc, cold rim, wobble. | N | `pass` (0.85× speed) | The defrost tray overflows. |
| `fridgeCable` + `outlet` | Ø 8 × 1 800; outlet 120 × 70 | 6 × 1 337; 89 × 52 | `M-RUB`/`M-PLA` | Outlet has one 3.7 wu green pilot LED, 2 700 K, intensity 0.10, radius 60 wu. | N | `climb` | Slack coiled behind the fridge, as it always is. |
| `kimchiFridge` (김치냉장고, in `tallUnit` bay) | 595 × 720 × 1 855 | 442 × 535 | `M-STL` | Its own display: 30 × 11 wu, 7 500 K, intensity 0.15, radius 150 wu. | Y | `solid` | If one object had to carry "Korean apartment", it is this one. |

---

### 3.6 Island / prep surface — the "three hours ago" zone

This is where the evidence chain is densest. See §4.2.

| Prop | Real (mm) | World units | Mat | Light | Occ | Sim | Fiction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `cuttingBoard` (도마) | 380 × 280 × 18 | 282 × 208, lift 13 | `M-WOD` | End-grain: 8 wu pitch. Knife scores as 1–2 wu dark lines, ~30 of them, all at 3 clustered angles (nobody cuts randomly). | Y | `climb` (a 13 wu ramp — the scout can get on top) | Not put away. |
| `kitchenKnife` (식칼) | 330 × 45 | 245 × 33, lift 4 | `M-STLM` + `M-WOD` | A 245 wu mirror wedge. The spine catches one continuous highlight; the edge catches a second, brighter, 1 wu line. | N | `climb` | On the board. Blade toward the room. |
| `springOnionRoot` (대파 뿌리) | 60 × 40 root ball, 120 white stem | 45 × 30 + 89 | `M-ORG` | Root fibres at 1 wu, translucent; the stem has a cold-white subsurface. | N | `pass` | Trimmed off and not swept up. |
| `chickenBox` (치킨 박스) | 300 × 250 × 90 | 223 × 186, lift 67 | `M-CRD` | **Grease-soaked base: transmission rises to 0.30 in a 120 × 90 wu irregular patch, which back-lights from the under-cabinet spill.** A cardboard box that glows at its bottom edge is the most specific "delivery food, hours old" cue available. | Y | `occl` + `void` (the box is a room) | — |
| `jjajangBowl` (짜장면 배달 그릇) | Ø 200 × 70 | Ø 149, lift 52 | `M-PLA` black | Gloss black: one hard elliptical highlight, nothing else. Residue ring inside, 8 wu, `M-ORG`. | Y | `climb`, `void` inverted | Black plastic delivery bowl with a clip-on lid. Unmistakable. |
| `bansanTub` (단무지 용기) | Ø 100 × 45 | Ø 74, lift 33 | `M-PLT` | Back-lit yellow. A 74 wu warm disc. | N | `climb` | — |
| `woodChopstickSleeve` | 240 × 20 | 178 × 15 | `M-CRD` paper | Flat, one crease. | N | `pass` | Torn open. |
| `deliveryBag` (비닐봉지) | 350 × 250 crumpled | 260 × 186, lift 45 | `M-PLT` | **The best light-interaction prop in the kitchen.** Transmission 0.45 over a crumpled surface = 8–14 discrete glowing facets, each 15–40 wu, at random orientations. Under the hall spill it is a lantern. | Y | `void` (a large, soft, safe volume) | — |
| `sojuBottle` (소주병) | Ø 66 × 216 | Ø 49, lift 160 | `M-GLS` green | Green caustic bead, Ø 23 wu, offset 30 wu. The bottle's own body is 80 % transmissive: the scout is visible *through* it, distorted. | Y | `occl` + `solid` | Empty. On its side would be better. The most Korean legal-to-draw object in existence. |
| `beerCan` | Ø 66 × 122 | Ø 49, lift 91 | `M-STLM` | Mirror cylinder, one vertical highlight, a 6 wu dark ring at the neck. Crushed variant: 49 × 45 wu. | Y | `climb` | — |
| `glassRing` | Ø 80 water ring | Ø 59 | `M-FLU` | Annulus only, 4 wu wide: a ring of fluid, not a disc. | N | `pass` | A cold glass stood here. |
| `crumbField` | rice 6 mm, bread 2–8 mm, sesame 3 mm | 4.5 / 1.5–6 / 2.2 wu, cluster 180 × 130 | `M-ORG` | Three particle sizes with three different silhouettes. **Never one size.** | N | `pass` | `islandDrop`. |
| `greaseSmear` | — | 210 × 150 field | `M-ORG` | Specular-only, as §3.2. | N | `pass` | — |
| `islandOverhang` | 250 deep, at 900 height | 186 deep × 1 240, lift 669 | — | **Foreground occluder** along the island's south face. Casts a 186 wu hard-edged shadow band. | Y | `occl` | This is the 754 wu stretch of island that is *not* cover, made visible. |

---

### 3.7 Bin corner — waste and recycling

Three silhouettes, not one square. The current `trashBin` is a 538 × 538 mm cube.

| Prop | Real (mm) | World units | Mat | Light | Occ | Sim | Fiction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `binFoodWaste` (음식물 쓰레기통) | Ø 200 × 300, pedal | Ø 149, lift 223 | `M-PLA` | Gloss cylinder: one vertical highlight. **A 6 wu lid gap all round that leaks nothing but is drawn dark** — a black annulus at the top of a bright cylinder. | Y | `solid` + `void` under the pedal arm | The Korean object. Small, round, lidded, pedal-operated, and the reason the bin corner is worth 1 900 food. |
| `foodWasteBag` (음식물 종량제 봉투) | 3 L, ~250 × 200 bulge | 186 × 149 | `M-PLT` | Designated-bag yellow, translucent, back-lit by the hall spill into a soft 186 wu glow. Contents read as dark lumps through it. | Y | `void` | Every Korean household buys these by law. Abstract markings only. |
| `binGeneral` (일반 쓰레기통) | 300 × 250 × 480, pedal | 223 × 186, lift 356 | `M-PLA` | Matte. Lid seam 4 wu, pedal arm 89 × 15 wu at 30 wu lift with a void under it. | Y | `solid` | — |
| `binLidGap` | 300 × 8 | 223 × 6 | — | Void with a 4 wu penumbra. | — | `void` | The lid does not close because the bag is too full. |
| `generalWasteBag` (종량제 봉투 20 L) | 400 × 300 × 500 | 297 × 223 | `M-PLT` | Translucent white-blue, back-lit, 6–10 facets. | Y | `void` | — |
| `seepageRing` | Ø 260 | Ø 193 | `M-ORG` + `M-FLU` | A fluid ring with an organic warm-brown core and a bright cold outer meniscus. Two materials in one decal — this is `trashSpill`, and it must look *bad*, not just brown. | N | `pass` (0.8× speed) | The food-waste bin leaks. |
| `fruitFlies` ×6–14 | 2 mm bodies | 1.5 wu | `M-ORG` | Dynamic particles. Below the drawable band individually — render as 1 px dark motes with a 3 wu blur, orbiting the seepage ring at 40–90 wu radius, 1.4 Hz. | N | — | Motion where nothing else moves. The bin corner is the only *alive* part of the kitchen before the colony arrives. |
| `recycleMeshBag` (분리수거 망) | 400 × 400 × 600 | 297 × 297, lift 446 | `M-FAB` mesh | Open mesh at 15 mm = 11 wu pitch — in-band, draw it. Contents visible through it: 6 discrete silhouettes. | Y | `occl` + `void` | — |
| `petBottle` ×4 (PET) | Ø 65 × 210; crushed 65 × 100 | Ø 48 × 156; 48 × 74 | `M-GLS`-lite (transmission 0.6) | Crushed bottles are a field of small caustics: 4 beads, Ø 18 wu. | Y | `climb` | Two crushed, two not. Somebody was in a hurry. |
| `aluCan` ×3, crushed | 66 × 60 | 49 × 45 | `M-STLM` | Crushed mirror: 5–9 facet highlights, chaotic. | N | `climb` | — |
| `milkCarton` (우유팩), rinsed flat | 190 × 70 | 141 × 52 | `M-CRD` waxed | Waxed surface: spec 0.30 broad, unlike all other cardboard. Rinsed = wet = one cold sheen. | N | `pass` | Korean recycling requires rinsing. It has been rinsed. |
| `eggTray` (계란판, 10-cell) | 300 × 100 | 223 × 74 | `M-CRD` moulded pulp | **Ten 30 mm hemispherical cups = ten 22 wu domes in a 2 × 5 grid.** A repeating dome array at 22 wu pitch is a unique silhouette nothing else in the kitchen produces. | Y | `climb`, `void` inverted | The best-value recycling sprite: maximally recognisable, minimally detailed. |
| `flatCardboard` ×2 | 400 × 300 | 297 × 223, lift 6 | `M-CRD` | Flute edge visible on the 6 wu cut edge only. | Y | `climb` (a 6 wu ramp), `void` beneath | Broken down, stacked. |
| `baseboardGap` | 125 × 62 | 92 × 46, around a Ø 40 collar | — | Void. | — | `void` | `crackBin`. |

---

### 3.8 Hall doorway

| Prop | Real (mm) | World units | Mat | Light | Occ | Sim | Fiction |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `threshold` (문턱) | 900 × 30 × 8 | 669 × 22, height 6 | `M-WOD` | One bright top edge (the hall spill rakes it at 4°), one deep 8 wu shadow on the kitchen side. | Y | `climb` (6 wu — the scout's first obstacle) | — |
| `slipper` (주방 슬리퍼) ×2 | 270 × 100 × 60 | 201 × 74, lift 45 | `M-RUB` + `M-FAB` lining | Rubber sole (dark, broad spec) + fabric lining (value sink). The **void under the arch** is 201 × 40 wu and 30 wu high: a perfect scout-sized shelter with a soft, readable mouth. | Y | `occl` + `void` | Kicked off, not aligned. One is upside down. |
| `sock` | 240 × 90 crumpled | 178 × 67, lift 26 | `M-FAB` | Pure value sink, 2 wu fuzz. | Y | `void` | — |
| `broom` (빗자루) | head 250 × 80; handle Ø 22 × 1 200 | head 186 × 59 lift 45; handle 16 × 891 lift 45→660 | `M-FAB` + `M-WOD` | The head's bristles are 0.5 mm — sub-pixel; bake as a directional value gradient with 6 hero bristle clumps. The handle is a 891 wu diagonal: **the longest single line in the kitchen** and a superb compositional device across empty floor. | Y | `occl` | Leaning in the corner. A visible countermeasure the household already owns. |
| `dustpan` (쓰레받기) | 260 × 240 | 193 × 178, lift 30 | `M-PLA` | The lip is a 4 wu bright line; the pan interior is a shallow void. | Y | `void` | — |
| `floorCloth` (걸레) | 400 × 300 damp | 297 × 223, lift 8 | `M-FAB` | **Damp fabric: the darkest, coldest large surface in the kitchen.** Value 0.06 above `ink`, cold-shifted 8 %. It is also a moisture source and the physical object the cleaning sweep uses. | Y | `void` | Wrung out and left flat. Threat and resource in one prop. |
| `petBowl` (스텐 물그릇) | Ø 190 × 55 | Ø 141, lift 41 | `M-STLM` + `M-FLU` | Mirror bowl holding fluid: the water surface is a 108 wu disc with a full fluid treatment, and the stainless rim throws a caustic ring onto it. Two materials, one 141 wu sprite. | Y | `climb` (rim is a 8 wu wall), `void` inverted | `petBowl`. |
| `petMat` | 560 × 400 | 416 × 297 | `M-RUB` | Matte, one broad sheen, embossed pattern at 20 wu pitch. | N | `pass` | — |
| `kibble` ×~40 | Ø 10 each | Ø 7.4 each, over 150 × 110 | `M-ORG` | Each is a 7.4 wu warm lozenge with a subsurface rim. In-band; draw them individually. | N | `climb` | Scattered outside the bowl. A dog eats messily. |
| `doorLeaf` (when open) | 900 × 40 × 2 000 | 669 × 30, lift 1 486 | `M-WOD` | Foreground occluder. Swings during routines — the only *moving* occluder in the game. | Y | `occl` | — |
| `hallSpillTrapezoid` | — | 669 wide at the gap → 1 240 wide at 1 150 deep | — | See §5.8. | — | — | — |

---

### 3.9 Cross-zone grime layer

These are fields, not objects. They have no discrete size; they have a density function and a
material response. They are what makes a kitchen *occupied* rather than *furnished*.

| Field | Where | Density function | Material response |
| --- | --- | --- | --- |
| **Grease** | Radius 700 wu from the hob centre; a directional fan at 140°; a thin film on every horizontal surface within 400 wu of the island's food props. | `d = clamp(1 − r/700, 0, 1)^1.6` | Specular-only overlay. **Invisible under ambient, obvious under a raking light.** Zero cost in shadow, maximum payoff under the torch. |
| **Condensation** | Fridge door seam (falloff 220 wu), cold-water pipe under the sink (falloff 140 wu), the 다용도실 door threshold on a cold night (falloff 90 wu). | `d = e^(−r/λ)`, λ per source above | Beads < 3 wu: value field. Runs > 10 wu: core + cold rim. Coalescence is time-driven — a bead that has been drawn for > 40 s merges with its neighbour and runs 15 wu downhill. |
| **Dust** | Every void mouth; behind every appliance; the 40 wu strip against every baseboard; densest where no human foot has been in a month. | `d = 0.8` in voids, `0.45` in the baseboard strip, `0.05` on patrol paths | 3 % contrast, back-lit rim only. **Dust is a negative map of where humans walk** — and therefore a free, always-correct map of where it is safe to walk. State this to the player once and never again. |
| **Crumbs** | Under the table (radius 500 wu), around the chair, along the island's south face, in the 20 wu gutter at the base of every toe-kick. | `d ∝ 1/(1+r/300)` from each eating surface | Three particle sizes minimum: rice 4.5 wu, bread 1.5–6 wu, sesame 2.2 wu. |
| **Scuff / wear** | Along the two highest-traffic human lines: doorway → fridge, doorway → sink. | A 300 wu band centred on the path | Grout wear: the joint is 30 % lighter and 1 wu shallower inside the band. The floor remembers the routines before the game shows them. |
| **Water film** | Sink zone floor within 300 wu of the trap; a 6-drip trail from the sink to the table (drips at 45, 60, 52, 71, 48, 55 wu). | discrete | Full `M-FLU`. The 6-drip trail is the cheapest possible narrative: somebody carried a full glass across the kitchen. |

---

## 4. Clutter and composition rules

### 4.1 The timeline the props encode

Every prop position answers to one timeline. Nothing is placed because the area looked bare.

| Time | Event | Props it produces | Freshness now (02:00) |
| --- | --- | --- | --- |
| 22:40 | Rice cooked, switched to keep-warm | `riceCooker` display lit, `cookerCondensate` ring at maximum | Still warm (+12 °C). Ring still wet. |
| 23:05 | 야식 delivered | `deliveryBag`, `chickenBox`, `jjajangBowl`, `bansanTub`, `woodChopstickSleeve` on the island | Cardboard grease patch fully wicked; bag still holding its crumple. |
| 23:10–23:50 | Eaten at the table | Crumb field under `tableTop` (r 500 wu), `sojuBottle`, `beerCan`, `glassRing` | Crumbs dry, high contrast. |
| 23:55 | Plates carried to the sink | The **6-drip trail** from sink to table | Drips have shrunk to 45–71 wu meniscus rings, not puddles. |
| 00:05 | Half-hearted wash-up | `sponge` wet, `rubberGlove` inside out, `dryingRack` loaded, `floorCloth` used and left flat, `plateStack` unwashed by the dishwasher | Sponge still damp at its base. Rack tray still holding standing water. |
| 00:20 | Food waste scraped into the 음식물 쓰레기통 | `seepageRing`, `fruitFlies` | 100 minutes old — the ring has stopped spreading and grown a dry crust at its rim. |
| 00:30 | Recycling half-sorted, staged for tomorrow's 분리수거 | `recycleMeshBag`, `petBottle` ×4 (two crushed, two not), `aluCan`, `eggTray`, `flatCardboard`, staged by the door | Two uncrushed bottles = somebody gave up half way. |
| 00:40 | Lights off. The sink strip left on. | `underCabinetLED` on; everything else dark | — |
| **02:00** | **Now** | — | — |

**Freshness gradient rules, quantitative:**

- **Standing water exists only where it cannot evaporate** — sink bowl, drying-rack tray, pet bowl,
  trap drip. On open tile at 3 hours, water is a **4 wu meniscus annulus**, never a filled disc. The
  current build draws filled `waterRing` ellipses up to 118 × 82 wu on bare floor; at 3 hours that is
  a lie the player's eye catches without knowing why.
- **Grease is tacky within 700 wu of the hob** (full specular response) and dulled to `0.4 ×` beyond.
- **The warmth field is real and drives three things:** dust drift, condensation absence, and colony
  preference. Sources: `riceCooker` +12 °C (falloff 180 wu), `hob` +8 °C (falloff 400 wu),
  `condenserGrille` +6 °C (falloff 300 wu), `crackStove` +6 °C, `dishwasher` +2 °C.
- **Crumb contrast falls with age.** Island crumbs (3 h, dry) at full contrast; bin seepage (wet) at
  0.6 contrast with a specular sheen.

### 4.2 Cluster grammar

Props arrive in **clusters**, never scattered. A scattered field of axis-aligned rectangles *is* a
floor plan; overlapping silhouettes with contact shadows are a photograph. This is the single rule
that most directly fixes the reported symptom.

Every cluster is exactly four tiers:

| Tier | Count | Size | Placement rule |
| --- | --- | --- | --- |
| **Hero** | 1 | ≥ 150 wu | Anchors the cluster. Carries the zone's recognition cue (§7). |
| **Support** | 2–4 | 60–150 wu | **≥ 60 % of supports must overlap the hero silhouette by 10–35 % of the support's own area.** Overlap is non-negotiable; it is what breaks the floor-plan read. |
| **Halo** | 5–20 | 8–40 wu | Density `∝ 1/r` from the hero centre, out to `2.5 ×` the hero radius. |
| **Field** | 1 | — | One grime field (§3.9) anchored to the hero and inheriting its age from §4.1. |

**9–26 elements per cluster. 3–7 clusters per zone. 34 clusters across the kitchen.**

### 4.3 Anti-emptiness rules

Walkable floor after solids (≈ 47.8 % coverage) is **≈ 4.89 M wu²** = 30.5 cells of 400 × 400 wu.
400 wu = 538 mm ≈ one human stride, and the gameplay viewport (1020 × 574 wu) contains **3.67 cells**.

> **R1 — Cell rule.** Every 400 × 400 wu cell of walkable floor carries **≥ 1 element ≥ 30 wu** and
> **≥ 3 elements ≥ 8 wu.** Consequence: every frame, always, shows ≥ 3 mid-scale landmarks and ≥ 11
> grain-scale elements. Minimum floor-element count for the map: **31 mid-scale + 92 grain-scale.**
> Current authored count on walkable floor (`PROPS` + `DECALS`, excluding those sitting on worktops):
> **≈ 20 mid-scale.** Shortfall ≈ 11.

> **R2 — Occluder reach.** **No walkable point may be more than 560 wu from the nearest foreground
> occluder.** 560 wu ≈ the viewport half-diagonal minus margin, so this guarantees at least one
> foreground occluder in every frame. That is the only honest source of depth a top-down view has.

> **R3 — Void adjacency.** No walkable point may be more than 700 wu from a `void`. This is what
> makes the map *playable* as a stealth space rather than merely dressed.

**Occluder inventory (18, satisfying R2):**

| Zone | Occluders |
| --- | --- |
| Sink | `faucet` (163 × 16, lift 282), `dryingRack` (334 × 223, lift 282), `detergentBottle` (lift 171), `waterPurifier` (lift 282) |
| Dishwasher | `dwHandle` (401 × 24, lift 30) |
| Pantry | `riceContainer` (223 × 297, lift 371) |
| Stove | `rangeHood` (**668 × 371, lift 1 114** — the largest), `riceCooker`, `microwave` |
| Fridge | `fridgeHandle` ×2 (668 × 26, lift 45) |
| Island | `islandOverhang` (186 × 1 240, lift 669), `chickenBox`, `deliveryBag`, `sojuBottle` |
| Bin | `recycleMeshBag` (297 × 297, lift 446) |
| Doorway | `broom` (handle 16 × 891), `slipper` ×2, `doorLeaf` (669 × 30, lift 1 486 — the only *moving* occluder) |
| **Centre plain** | `tableTop` (704 × 704, lift 546), `chairSeat` (334 × 334, lift 327) |

**[NEW] Two additions to close the R2 gap at x 900–1200, y 900–1900** (the one region with no
occluder within 560 wu):

| Prop | Position | Real (mm) | World units | Mat | Notes |
| --- | --- | --- | --- | --- | --- |
| `stepStool` (주방 발판) | 1030, 1420 | 400 × 300 × 450 | 297 × 223, lift 334 | `M-PLA` | For reaching the 상부장. Present in most Korean kitchens. Folding, so a 6 wu hinge line is the face event. |
| `kimchiTubStack` ×2 | 880, 1948 **[DELTA]** re-skins `boxPantry` (currently 268 × 132) | 400 × 300 × 320 each | 297 × 223, lift **476** stacked | `M-PLT` | Two stacked 김치통. `M-PLT` back-lit: the stack glows faintly red-orange from within. 361 × 178 mm was a nondescript box; 김치통 is a place. |

### 4.4 Anti-noise rules

The other failure mode is procedural repetition, which reads as tiling.

> **N1 — Instance cap.** No prop *kind* may appear more than **3 times within a 900 wu radius**.

> **N2 — Variation floor.** No two instances of a kind may share **both** rotation (within ±0.15 rad)
> **and** scale (within ±8 %). Each instance must vary **≥ 3 of**: rotation, scale, silhouette vertex
> jitter (≥ 6 % of radius), value (±6 %), sub-detail count (±25 %), material sub-variant. The `Prop.v`
> seed already exists for exactly this and is the hook.

> **N3 — Rotation discipline.** **≤ 30 % of props may sit within 4° of axis-aligned.** Human
> architecture is orthogonal; human *leavings* are not.
> **Current: 27 of 52 authored props have `rot: 0` exactly — 52 %.** That alone makes the room read
> as a diagram. Two `rot: 1.57` values are also repeated verbatim.

> **N4 — No colinearity.** Three or more instances of any kind may not have centres within 6 wu of a
> shared axis. Three things in a line is a grid, and a grid is UI.

> **N5 — Size ladder.** Any repeated kind appearing ≥ 3 times must use ≥ 3 distinct sizes spanning
> ≥ 1.6× (e.g. `burnerCap` Ø 89 / 74 / 59). Three identical circles is the procedural-noise smell that
> produced the "concentric circles" complaint.

### 4.5 Cabinet depth — the fix, stated as planes

A base cabinet, seen from above, from the room edge inward. Values are the **red channel before**
the ×0.49 darkness multiply, with the post-multiply value in brackets.

| # | Plane | Depth (wu) | Real (mm) | R value | Why |
| --- | --- | --- | --- | --- | --- |
| 1 | Worktop overhang lip | 22 | 30 | **96** [47] | Catches the LED and the ceiling ambient. Brightest architectural plane in the kitchen. |
| 2 | Worktop front-edge shadow | 4 | 5 | **14** [7] | The hard line that separates lip from face. |
| 3 | Door face | ~370 | 500 | **46** [23] × `tone` | The plane the current build draws *alone*. |
| 4 | Door seam grid | 3 every 334 | 4 every 450 | **16** [8] + a 1 wu leading-edge highlight at **74** [36] | Face-event rule. A 450 mm bay is the real Korean 하부장 module. |
| 5 | Handle bar (cup or bar) | 128 long, 26 proud | 172 long, 35 proud | **88** [43], casting a 20 wu shadow at **12** [6] | The single highest-contrast event on a cabinet face. |
| 6 | Toe-kick recess | 52 | 70 | **8** [4] + 12 wu penumbra | Real toe-kick depth. |
| 7 | Void behind the kick board | 409–641 | 550–863 | **5** [2.5] — pure `ink` | The only true black in the kitchen. |
| 8 | Floor contact shadow | 16 | 22 | blends 8 → floor | — |

**Eight planes, six distinct values, steps of ≥ 1.5× at every boundary, all surviving the multiply.**
The current build renders one value across 470 wu. That single line item is the "giant blue-black
rectangle" defect in its entirety.

### 4.6 Under-appliance voids

| Void | Footprint (wu) | Clearance (wu) | Area (wu²) | Temp | Value |
| --- | --- | --- | --- | --- | --- |
| Fridge compressor bay | 677 × 641 | 74 | 434 000 | **+6 °C** | The best real estate in the kitchen. |
| Sink cabinet plumbing | 409 × 500 | full height | 204 500 | −1 °C, damp | Water + total cover. |
| Range plinth | 557 × 371 | 74 | 206 600 | **+8 °C** | Warmest. Greasiest. |
| Island toe-kick, 4 sides | 3 600 perimeter × 52 | 74 | 187 200 | ambient | Longest cover run. |
| Dishwasher plinth | 416 × 446 | 74 | 185 500 | +2 °C | The tutorial's safe ground. |
| Pantry toe-kick | 1 124 × 52 | 74 | 58 448 | ambient | — |
| `counterLeft` toe-kick | 1 080 × 52 | 74 | 56 160 | ambient | — |
| `counterRight` toe-kick | 700 × 52 | 74 | 36 400 | ambient | — |
| `plumbingChase` | 500 × 160 | full height | 80 000 | damp | Home. |
| Bin under-pedal voids ×3 | — | 30–74 | ≈ 90 000 | — | — |
| `tallUnit` / kimchi plinth | 267 × 52 | 74 | 13 884 | +3 °C | — |
| Slipper arches ×2 | 201 × 40 each | 30 | 16 080 | — | Scout-sized, and readable as such. |
| **Total** | | | **≈ 1.57 M wu²** | | |

**1.57 M wu² of shelter against 4.89 M wu² of walkable floor = 32 % of the kitchen is void, all of it
at the edges.** That number is what makes "cabinetry is safety" true instead of asserted, and it is
what the player learns in the first 30 seconds without a tooltip.

Rendering: every void is pure `#05070b` with a penumbra at its mouth of `12 + clearance × 0.06` wu.
Because voids are the **only** true black in the kitchen, the eye reads them as depth automatically.
Nothing else in the palette may reach `ink`.

---

## 5. Lighting plan

Base ambient: a cold multiply of `#131c24` at 0.82 darkness (unchanged). Light is additive holes
punched into it. Every source below is motivated by a drawn object.

`warmth` is the existing `LightSource.warmth` field (0 = cold, 1 = warm). Mapping used throughout:
`warmth ≈ clamp((5200 − K) / 3400, 0, 1)` — so 2 000 K → 0.94, 2 900 K → 0.68, 4 000 K → 0.35,
5 700 K → 0.10, 6 800 K → 0.06, 7 500 K → 0.03.

### 5.1 Static sources — bakeable

These never move and their occluders never move. **All nine bake into one lightmap.**

| id | Position | Shape | K / warmth | Intensity | Falloff | Reveals | Conceals |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `underCabinetLED` **[DELTA]** | Line, x 56→556 at y 500 | 500 wu line source → 500 × 186 wu counter pool + 186 wu floor spill | 4 000 K / **0.45** | **0.55** | Half at 300 wu, zero at 620 wu | Sink counter, drying rack, the back-lit detergent bottle, the whole sink zone's readability | By contrast adaptation, the 374 wu of exposed wall north of the sink goes *harder* to read — which is precisely why the safe wall route is there |
| `microwaveClock` **[DELTA]** | 1 950, 290 (on `counterRight`) | Point, from a 45 × 15 wu 7-segment | 4 800 K / 0.15 | **0.35** | Quadratic, **radius 240** | The counter's leading edge and the crack at (1980, 640) | — |
| `hoodStandby` **[NEW]** | 1 486, 540 (hood control panel) | Point | 3 800 K / 0.30 | 0.16 | radius 180 | The stove zone's near floor; anchors the stove when the hood lamp is off | — |
| `riceCookerDisplay` **[NEW]** | 2 260, 300 | Point, from a 30 × 11 wu display | 7 500 K / **0.03** | 0.18 | radius 120 | The rice cooker's own silhouette, from underneath — a cold uplight on a warm object | — |
| `waterPurifierDisplay` **[NEW]** | 900, 290 | Point | 7 500 K / 0.03 | 0.14 | radius 120 | Breaks the 1 080 wu `counterLeft` run at its midpoint | — |
| `multiTapLEDs` **[DELTA]** | 2 860, 806 (×3 at 22 wu pitch) | 3 pinpoints, 3.7 wu each | 2 000 K / **0.94** | 0.12 each | radius **60** each | Three red pinpricks behind the fridge — the smallest readable light in the game and a scale anchor | — |
| `kimchiFridgeDisplay` **[NEW]** | 3 410, 400 | Point | 7 500 K / 0.03 | 0.15 | radius 150 | Distinguishes the kimchi fridge from the main fridge with the lights off | — |
| `condenserGlow` **[DELTA]** | 3 100, 790 | Slot array behind a 594 × 74 wu grille | 2 200 K / 0.88 | **0.10** | radius 200 | Warm air as a slight value lift + a visible dust drift. Not a lamp — a temperature made visible | — |
| `windowMoon` + `streetLampBounce` **[NEW]** | Utility-door glass panel, 297 × 669 wu at x 3 400–3 544, y 940–1 500 | **Projected quad**, sheared −520 wu in X and +180 wu in Y → floor quad ≈ x 2 880–3 177, y 1 120–1 789 | Moon 6 800 K / 0.06; bounce 2 200 K / 0.88 | Moon **0.22**, bounce **0.14** | **Hard edges, 8 wu penumbra** (moon) and 60 wu penumbra (bounce), offset 180 wu | A hard-edged bright rectangle in the middle-right of the floor | — |

**The single most important renderer note in this document:** the current lighting model is entirely
radial (`LightSource` is `{x, y, radius}`). **A window that makes a circle on the floor reads as a
lamp.** Moonlight through a rectangular pane makes a sheared rectangle with a nearly hard edge. Add a
quad-projection light type. It costs one extra shape and it converts a soft gradient into a
*geometric no-go zone the player can stand exactly at the edge of*, which is far better gameplay than
a radial falloff can ever be.

**Also static, and also bakeable — the negative pass:** every void mask (§4.6), every prop contact
shadow, and every solid's cast shadow from the nine sources above.

### 5.2 Dynamic sources — runtime overlay

| id | Trigger | Shape | K / warmth | Intensity | Occlusion needed? | Telegraph value |
| --- | --- | --- | --- | --- | --- | --- |
| `hallSpill` **[DELTA]** | Always on; intensity varies | **Trapezoid** from the 650 wu doorway, 26° half-angle, 1 240 wu wide at 1 150 wu depth | 2 900 K / **0.82** | Baseline **0.22**; routine anticipation **0.62** (1.4 s ramp); patrol **0.85** | **No** — shape is static, bake it as a mask and multiply by one scalar | Intensity rise *is* the anticipation phase of every routine. The cheapest, earliest warning in the game. |
| `fridgeSeam` **[DELTA]** | `snack` routine only | Aperture rectangle 677 × 641 wu growing 0 → full over 0.9 s as the door swings; throws a **hard-edged wedge** | 4 500 K / **0.35** | Closed **0.05** (specular seam line only); open peak **0.85** | **Yes** — island and table must cast | The strongest single event in the fridge zone, now episodic instead of constant |
| `roomLight` (주방등) | Patrol | Global darkness lift 0.82 → 0.25 over 0.6 s | 5 700 K / **0.10** | — | No (global scalar) | **[NEW] 90 ms LED driver blink:** one frame at 0.55 of the lift, 40 ms of nothing, then the 0.6 s ramp. Free, unmissable, and exactly how a Korean LED 주방등 actually behaves. |
| `phoneTorch` **[DELTA — was "flashlight"]** | Patrol, `looking` | Cone, half-angle **21°**, hotspot half-angle 7°, range **1 400 wu**. Held at ~1 000 mm and angled down 35° → floor pool is an **ellipse 620 wu long × 380 wu wide** at 900 wu range | 6 500 K / **0.08** | Hotspot 1.0, cone edge 0.25 | **Yes** | See 5.3 |
| `hoodLamp` | Cooking-adjacent routine only; **off at scene start** | Rectangle 668 × 371 wu directly under the hood | 3 000 K / 0.65 | 0.50 | No | — |
| `sprayCloud` self-illumination | Extermination | Follows the cloud | — / — | 0.15 | No | Existing. |

A phone flashlight, not a torch: it is what a Korean adult actually reaches for at 02:00, it
justifies the cold 6 500 K, and it justifies the erratic sweep of a hand rather than the steady arc
of a held lamp.

### 5.3 The torch telegraph, as a number

At a patrol walk speed of ≈ 700 wu/s and a sweep of 0.9 rad/s, the cone's **leading penumbra edge
crosses a given floor point 0.55 s before the hotspot does.**

**That 0.55 s is the entire warning window, and it exists only if the penumbra is drawn.** A
hard-edged cone gives zero warning. Penumbra: 4° of angular softness, which at 900 wu range is a
63 wu transition band. Do not optimise it away.

### 5.4 Static / dynamic split — the renderer decision

| | Count | Per-frame cost |
| --- | --- | --- |
| **STATIC — baked once at load** | 9 emissive + all void masks + all contact shadows + all solid casts | **One 450 × 325 px lightmap (world ÷ 8, ≈ 0.59 MB RGBA), one upscaled blit.** Never recomputed. |
| **DYNAMIC — needs per-frame occlusion** | **2**: `fridgeSeam` flood, `phoneTorch` cone | 2 shadow-casting lights |
| **DYNAMIC — scalar or static mask only** | **3**: `hallSpill` (baked mask × 1 uniform), `roomLight` (global scalar), `sprayCloud` (follows an existing entity) | ≈ free |

**Net: 14 sources, 2 of which do real per-frame work.** Nine sources move from per-frame to
zero-cost. This sits comfortably inside the p50 ≤ 16.7 ms budget in `GAME_CONTRACT.md`.

**Second-order benefit, and the reason to do it this way:** `ART_BIBLE` promises that "exposure
sampling reads the same field the renderer composites". With this split, exposure becomes
`bakedLightmap.sample(x, y) + Σ(5 analytic dynamic terms)`. No per-frame full-field recompute, and
"what you see is literally what the humans can see" stays true by construction rather than by
discipline.

### 5.5 What each zone is lit by

| Zone | Static | Dynamic | Consequence |
| --- | --- | --- | --- |
| Sink | `underCabinetLED` (0.55) | — | The brightest, most legible zone. The tutorial. |
| Dishwasher | LED spill only (≈ 0.10) | — | Darkest zone in the kitchen. Safe by construction. |
| Pantry | none | — | Effectively unlit. Home. |
| Stove | `microwaveClock`, `hoodStandby`, `riceCookerDisplay` (three small sources, ≈ 0.25 combined) | `hoodLamp` | Dim, multi-source, complex shadows under the hood. |
| Refrigerator | `condenserGlow`, `multiTapLEDs`, `kimchiFridgeDisplay` (≈ 0.20) | **`fridgeSeam` 0.05 → 0.85** | Dark by default, catastrophic during a snack. |
| Island | `windowMoon` quad clips its east end | `hallSpill` reaches its south face at 0.22–0.85 | The hard moon edge cuts the island's east approach. Learnable geometry. |
| Bin corner | `windowMoon` bounce | `hallSpill` at high angle | Lit whenever anyone is in the hall. Richest food, worst ground. |
| Doorway | — | `hallSpill` at source, 0.22–0.85 | Never dark. Holding it is the hardest thing in the game. |

---

## 6. Infestation transformation

The player must be able to put the opening frame and the victory frame side by side and read what
they did. That requires a **shared vocabulary of transformation marks**, each with a real size, so
the change is legible at gameplay camera and not merely "darker".

### 6.1 Transformation vocabulary

| Mark | Real (mm) | World units | Material / light | Where it appears |
| --- | --- | --- | --- | --- |
| **Occupied crack lip** | mouth widens 125 × 62 → 172 × 84 | 92 × 46 → **128 × 62** | The lip gains a 4 wu specular meniscus of tracked grease and frass — a *glistening* edge. The stone does not move; the debris around it does. | Every claimed nest |
| **Traffic polish** | 35 wide fan, 300 long | **26 × 220 wu fan** from each mouth | Value +8 %, specular +0.15. Dust removed. | Every claimed nest, every travelled baseboard |
| **Frass (바퀴 배설물)** | 1–3 mm specks | **0.74–2.2 wu** | Stipple, density `∝ 1/r` to 220 wu from each mouth; plus a continuous **8 wu smear band** along every travelled baseboard | Everywhere the colony works. The real-world diagnostic mark. |
| **Nest material** | 80–190 mm mass | **60–140 wu** | Chewed paper, cardboard fibre, shed cuticle. `M-FAB` response: value sink, 2 wu fuzz, warm subsurface. | Packed into void mouths |
| **Egg case (난협 / ootheca)** | **8 × 5 mm** | **6 × 3.7 wu** | Glossy (spec 0.40) dark red-brown bead with a visible longitudinal keel. Cemented in clusters of 6–20 under a lip, always within 90 wu of a mouth. A cluster of 15 = a readable 60 wu patch. | Nurseries |
| **Cached food** | 135–240 mm mound | **100–180 wu** | `M-ORG` mound with individual 4.5 wu rice grains still readable at its rim. | Caches |
| **Moisture claim** | — | 200 wu radius | Grout within 200 wu of a damp claimed crack darkens 22 % and holds a 2 wu bright meniscus in the joint. | Sink, chase, bin |
| **Darkened safe passage** | 35 wide | **26 wu polished band** | The route loses its dust and gains value +8 %, spec +0.15. §3.9 makes dust a negative map of human traffic; this makes it a positive map of colony traffic. **The floor remembers the colony exactly the way it remembered the humans.** | Every sustained route |
| **Gnawed packaging** | 16–40 mm bite arc | **12–30 wu ragged arc** | 3–9 wu fibre tags, plus a 40 wu spill fan below the bite. | `snackBag`, `ramyeonPack`, `chickenBox`, `seaweedPack`, both bin bags |
| **Wipe scar** (human) | 80 mm band | **60 wu** | A cleaned band, *brighter and cleaner* than the floor around it. Evidence that the household erased something. | Wherever a cleaning sweep ran |

### 6.2 Human countermeasures — victory must show them

Victory means the household knows. Countermeasures are the receipt.

| Countermeasure | Real (mm) | World units | Look |
| --- | --- | --- | --- |
| Sticky trap card (끈끈이) | 150 × 100 | **111 × 74** | `M-CRD` with a 0.55 adhesive sheen. Occupied cards carry 1–3 corpses and 20 wu stretched strands. |
| Bait gel dot (독먹이) | Ø 8 | **Ø 6** | `toxin` green glossy bead. Deployed in **lines of 5–9** along a baseboard — the line is the read, not the dot. |
| Bait station disc (베이트 스테이션) | Ø 35 | **Ø 26 — exactly one scout** | Flat plastic disc with a 6 wu entry notch. Placed at 3 corners. Its being scout-sized is the joke and the threat. |
| Boric-acid / DE line | 8 wide × 300–540 long | **6 × 220–400 wu** | Chalk-white band along the baseboard. The only pure white in the kitchen. |
| **Sealed crack** | 125 × 62 | **92 × 46 filled** | Fresh white silicone: bright, glossy, obviously new, and *wrong* against a four-year-old kitchen. The most legible possible statement of "they found it". |
| Clamped bin lid | clip 40 | **30 wu clip** | The `binLidGap` 6 wu annulus closes. A resource visibly taken away. |
| Insecticide can | Ø 65 × 200 | **Ø 48, lift 149** | Generic pressurised can standing on the counter. **No brand mark.** A prop that is a threat. |

### 6.3 Per-zone before → after

| Zone | Opening frame | Victory frame |
| --- | --- | --- |
| **Sink run** | Wet sponge, glove inside out, loaded drying rack, 3 floor drips, one clean silicone bead at the cabinet/wall junction. No frass. Full dust in the toe-kick gutter. | `crackSink` open at 128 × 62 with a glistening lip; a 220 wu polish fan into the plumbing void; grout darkened 22 % within 200 wu; a 26 wu polished passage running the full 640 wu of the sink toe-kick; frass stipple to 220 wu. **Countermeasure:** a 111 × 74 sticky card on the polished passage, and a 220 wu boric line under the cabinet. |
| **Dishwasher** | Unwashed plate stack, crumb field, grease film, 446 × 416 wu plinth void full of dust. | The plinth void mouth packed with a 140 wu nest-material mass; 15 ootheca (a 60 wu glossy bead patch) cemented under the plinth lip; the crumb field reduced by 70 % with a 26 wu drag track leading into the void; 8 wu frass smear the full 420 wu of the run. **Countermeasure:** a bait line of 7 gel dots along the plinth. |
| **Pantry** | 쌀통 with a full grain line; snack bag torn open by a human (clean tear); untouched containers; heavy corner dust; `home` crack an unremarkable dark collar gap. | `home` crack at 128 × 62 with a 220 wu polish fan; the 쌀통's back-lit window shows the grain line **dropped 30 %**; the snack bag now shows a **24 wu gnawed arc** with fibre tags and a 40 wu spill fan; a 180 wu cached-food mound at the chase mouth; dust *gone* from the entire 1 124 wu pantry toe-kick, replaced by polish. **Countermeasure:** two bait-station discs and the sealed 92 × 46 silicone patch at `crackPantry` — which the player routed around. |
| **Stove** | Grease fan tacky, 고춧가루 dust, pan and pot unwashed, `crackStove` a plain filler gap with a grease halo. | `crackStove` at 128 × 62, its grease halo now a 140 wu **polished** halo; frass in the grease (dark specks in a specular field — the highest-contrast frass in the kitchen); a 26 wu passage the full 700 wu of the range plinth; the grease resource visibly worked down to a 0.4-contrast residue. **Countermeasure:** the insecticide can standing on `counterRight`, and a wipe scar where a cloth took out a trail. |
| **Refrigerator** | Full magnets, intact flyer with 8 tear tabs, condensation field at the seam, dust-free door face, lint mat under the grille, perished gasket section 30 wu. | The perished gasket section gnawed to **60 wu**; a 220 wu polish fan out of the compressor void; the lint mat displaced into a 100 wu nest-material mass; condensation *reduced* within 220 wu (the colony drank it); frass across the 594 wu grille face — highly visible against light plastic. **Countermeasure:** a sticky card directly on the compressor void mouth and a boric line the full width of the fridge. |
| **Island** | Delivery cluster fresh: intact chicken box with a grease patch, jjajang bowl with a residue ring, empty soju bottle, dry crumb field, 3 h-old grease smear. | Chicken box carrying a **30 wu gnawed arc** at its grease-soaked corner, spill fan below; the crumb field at 20 %; a 26 wu polished passage the full 3 600 wu island perimeter — **the single most visible transformation in the kitchen, and the one that reads from any camera position**; `crackIsland` at 128 × 62 with the kick board now 12 wu proud. **Countermeasure:** three sticky cards on the perimeter and a wipe scar across the south face. |
| **Bin corner** | Seepage ring 100 min old with a dry crust; 6–14 fruit flies; lid gap 6 wu; bags intact; recycling half-sorted. | Both bags **gnawed** (24 and 30 wu arcs) with spill fans; the seepage ring worked to a 0.4-contrast stain; frass density at its maximum here; `crackBin` at 128 × 62 with a moisture claim darkening the grout 200 wu around it; fruit flies **replaced** by colony traffic — the zone's motion is now the player's. **Countermeasure:** the bin lid clamped (30 wu clip, 6 wu gap closed — a resource taken away), and 9 bait dots along the right-wall baseboard. |
| **Hall doorway** | Slippers kicked off, threshold clean, recycling staged, pet bowl full, kibble scattered, hall spill at 0.22. | Kibble reduced by 60 % with drag tracks toward the wall; pet-bowl water level visibly down; a 26 wu polished passage over the 669 wu threshold ridge — **the colony has crossed out of the kitchen, which is the run's real ending**; frass on the threshold's raking-lit top edge, maximally visible. **Countermeasure:** the densest concentration in the kitchen — a boric line the full threshold, two sticky cards, and a bait-station disc — because this is where the household stands. |

### 6.4 The comparison shot

Ship one 1 020 × 574 wu frame per zone at t = 0 and one at victory, from the same camera position, in
the end card. The eight pairs must satisfy: **for every pair, a viewer who has not played can name at
least three specific things that changed.** If a pair fails that, the zone's transformation is
under-specified and this section is wrong about it.

---

## 7. Recognition test

**Protocol.** Take one screenshot per zone at the gameplay camera (1 020 × 574 wu), centred on the
zone, with **all HUD, all labels and all name banners removed**. Show each to a person who has never
played. They must name the fixture in **≤ 3 seconds**. Pass mark: **8 / 8**. Any zone that fails is a
defect, per `REDESIGN_CONTRACT.md` §9 ("recognisable from world art alone").

Minimum cue size for a 3-second read at this camera: **≥ 60 wu (≈ 75 px).** Every cue below clears it
by a wide margin.

| # | Zone | The single silhouette cue | Size | Why it cannot be confused |
| --- | --- | --- | --- | --- |
| 1 | **Sink run** | A **579 × 327 wu recessed stainless basin** containing a **Ø 108 wu round basket strainer with a 30 wu lifting tab**, crossed by the faucet's 163 wu mirror arm. | 579 wu (57 % of screen width) | Nothing else in the kitchen is a large recessed stainless rectangle. The round strainer with a tab is Korean-specific and is *not* a cross-hatched circle. |
| 2 | **Dishwasher** | A single **401 × 24 wu horizontal handle bar standing 30 wu proud**, with its hard 22 wu shadow bar, over a 416 × 446 wu void mouth. | 401 wu | Fridge handles are **vertical** (two 668 wu bars). Orientation alone disambiguates the two flush stainless faces. |
| 3 | **Pantry** | The 쌀통's **back-lit measuring window: a 60 × 90 wu warm glowing panel at 371 wu lift**, with the grain line visible inside it. | 90 wu tall, but it *emits* | The only object in the kitchen that glows from inside at floor-adjacent height. Emission beats size for a 3-second read. |
| 4 | **Stove** | **Three near-black cast-iron pan supports, Ø 163 / 163 / 122 wu, in a row on a recessed 557 × 334 wu plate**, under a 668 × 371 wu hood shadow. | 557 wu | Three dark four-arm stars in a row. The darkest objects above floor level in the whole kitchen, and the only recessed plate. |
| 5 | **Refrigerator** | **Two vertical 668 × 26 wu mirror bars** casting two hard 33 wu shadow bars, above a **594 × 74 wu slotted grille**. | 668 wu | Vertical brush direction + vertical handles + a slotted plinth grille. The kimchi fridge is deliberately similar and resolves by its smaller 442 wu body and its own display. |
| 6 | **Island** | The **186 × 1 240 wu overhang shadow band with no toe-kick beneath it**, carrying the delivery cluster on top. | 1 240 wu | The only 1 240 wu perfectly straight hard shadow edge in the kitchen, and the only cabinet face with an overhang instead of a recess. |
| 7 | **Bin corner** | The **음식물 쓰레기통: a Ø 149 wu gloss cylinder with a black 6 wu lid annulus**, beside a 223 × 186 wu pedal bin and a 297 wu mesh bag. | 149 wu, three silhouettes in a 400 wu band | Nothing else is a small round lidded cylinder. Three *different* silhouettes in one band is unmistakable as "waste", where one 538 mm cube was unmistakable as "box". |
| 8 | **Hall doorway** | The **669 × 22 wu threshold ridge**, one edge raking-lit at 4° and the other holding an 8 wu shadow, with the **hall light trapezoid spreading from it** and two 201 wu slippers on it. | 669 wu | The only place a hard-edged light trapezoid meets the floor, and the only 6 wu climbable ridge crossing the full width of an opening. |

**Secondary cue rule.** Every zone must also carry a *second*, smaller cue that survives when the
hero cue is occluded by the camera edge or by a foreground occluder: sink → the pink `rubberGlove`
(238 wu, the only large saturated non-toxin colour in the game); dishwasher → the corrugated hose's
18.6 wu rib ladder; pantry → the 김치통 stack's back-lit red glow; stove → the 891 wu yellow gas
pipe; fridge → the three red multi-tap LEDs; island → the soju bottle's green caustic bead; bin →
the 223 × 74 wu egg tray's ten-dome array; doorway → the broom's 891 wu diagonal handle.

---

## 8. Change summary, by priority

### P0 — fixes the reported symptom directly

| # | Change | Files |
| --- | --- | --- |
| 1 | Replace the "cabinets and appliances are walls" rule with the plane-stack rule; implement the **8-plane / 6-value cabinet cross-section** (§4.5). | `ART_BIBLE.md`, `src/render/solids.ts` |
| 2 | **Face-event rule**: no fixture face may run > 700 wu without a vertical event. `counterLeft` currently runs 1 080 wu with none. | `src/render/solids.ts` |
| 3 | Redraw `plate` as a **stack read from 26° off nadir** (elliptical top face + rim crescents + contact shadow), not two concentric circles. Correct its size to Ø 149 wu. **Already underway** — `tools/bake/props/sink.mjs` builds a 200 mm plate and has emitted `public/art/plate-single-n.png` / `plate-stack-n.png`. | `tools/bake/props/sink.mjs`, `src/render/props.ts` |
| 4 | Redraw `drainGrate` as a **Korean basket strainer** (Ø 108 flange, Ø 78 basket, 30 wu lifting tab, slot cage as a value gradient), not a cross-hatched circle. **Already underway** — `sink.mjs` builds a 145 mm inset strainer with a real perforated well and has emitted `public/art/sink-drain-n.png`. Remaining gap: the **30 wu lifting tab**, which is what separates "strainer" from "grate". | `tools/bake/props/sink.mjs`, `src/render/props.ts` |
| 5 | Add the **void pass**: 1.57 M wu² of pure-`ink` under-appliance and toe-kick voids with computed penumbrae (§4.6). Nothing else may reach `ink`. | `src/render/solids.ts` |
| 6 | Add `tableTop` and `chairSeat` foreground occluders. Eight posts currently support nothing. | `src/sim/kitchen.ts`, `src/render/props.ts` |

### P1 — makes the room an occupied Korean home

| # | Change |
| --- | --- |
| 7 | Add the `plumbingChase` solid (§2.2). The colony's home is currently an unmarked point on blank floor. |
| 8 | Replace `radiator` with `utilityDoor` (§2.6). **Korean apartments use 온돌 underfloor heating; there is no radiator.** |
| 9 | Split `fridge` 944 → `fridge` 677 (the real 912 mm) + `tallUnit` 267, and add the `kimchiFridge`. |
| 10 | Add the Korean identity props: 전기밥솥, 정수기, 쌀통, 김치통 stack, 밀폐용기, 스텐 공기, 젓가락/숟가락, 고무장갑, 음식물 쓰레기통, 종량제 봉투, 계란판, 배달 용기, 소주병, 가스 배관, 온돌 점검구. |
| 11 | Correct every prop to a real dimension (§3). Notable: plates are under-scaled by 25 %; `pipeElbow` at 132 × 210 wu implies a 178 mm waste pipe; floor `waterRing`s are drawn as filled 3-hour-old puddles that would have evaporated. |
| 12 | Enforce N1–N5 (§4.4). **52 % of authored props are exactly axis-aligned; the ceiling is 30 %.** |
| 13 | Add 11 mid-scale floor elements to satisfy R1, and `stepStool` + `kimchiTubStack` to satisfy R2. |

### P2 — lighting and sim

| # | Change | Files |
| --- | --- | --- |
| 14 | Add a **quad-projection light type**. A window that makes a circle reads as a lamp; `hallSpill` and `windowMoon` both need it. | `src/sim/types.ts`, `src/render/renderer.ts` |
| 15 | Make `fridgeSeam` **dynamic** (0.05 closed → 0.85 during `snack`). A closed fridge emits nothing, and the constant flood wastes the strongest telegraph in the game. | `src/sim/kitchen.ts`, `src/sim/routines.ts` |
| 16 | Bake the **9 static sources + all negative light into one 450 × 325 lightmap**; leave 2 occluding dynamics + 3 scalar dynamics. Exposure sampling then reads the baked texture plus 5 analytic terms. | `src/render/renderer.ts`, `src/sim/exposure.ts` |
| 17 | Retune source radii to their emitters: `ovenClock` 430 → 240, `outletLed` 190 → 60. Move `dishwasherLamp` to the sink as `underCabinetLED`. | `src/sim/kitchen.ts` |
| 18 | Add the **90 ms room-light driver blink** and keep the torch cone's **4° penumbra** — that penumbra is the entire 0.55 s warning window. | `src/sim/threats.ts`, `src/render/renderer.ts` |
| 19 | Fix the **`trash` / `doorway` zone overlap** (221 536 wu², 40 % of the doorway zone) and move `trashSpill` and `petBowl` so both zones own a resource (§2.5). | `src/sim/territory.ts`, `src/sim/kitchen.ts` |
| 20 | Widen the doorway 440 → 650 wu. 592 mm is not a real opening. | `src/sim/kitchen.ts` |
| 21 | Raise `BAKE_PPU` 2.0 → **2.5**. `Camera.resize` clamps zoom at **2.3 px/wu**, reached on any viewport ≥ 2 346 device px, so every baked sprite is currently undersampled by 15 % at max zoom. The constant's own comment assumes 1.6 px/unit, which the camera code contradicts. | `tools/bake/lib/units.mjs` |
| 22 | Add the strainer's **30 wu lifting tab** to `sink.mjs`. The well and flange already read; the tab is what makes it a 거름망 rather than a floor grate. | `tools/bake/props/sink.mjs` |

