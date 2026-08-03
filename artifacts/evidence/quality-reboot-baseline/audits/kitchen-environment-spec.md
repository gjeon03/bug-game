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

Anchor: **scout body = 26 world units = 35 mm.** 35 mm is a mature *Periplaneta americana*
(이질바퀴) — the large drain-and-pipe-shaft species, deliberately chosen over the 12 mm 독일바퀴 so
that domestic objects land in a readable size band instead of dwarfing the player 40:1.

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
| `WORKER_RADIUS` 8 / drawn ≈ 20 | 20 | 27 mm | Consistent nymph-to-adult *Periplaneta* range. |
| Nymph 12 | 12 | 16 mm | Correct for a 3rd–4th instar. |
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

<!-- SECTION-BREAK-1 -->
