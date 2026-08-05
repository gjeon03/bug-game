# LOCAL_REVIEW — how to run this build

**Branch** `experiment/whole-home-infestation-3d` · local only. Nothing here has been pushed,
merged, deployed, or opened as a pull request.

---

## Prerequisites

- Node 20+ (developed on 21.7.2)
- pnpm (developed on 9.15.9)
- A browser with WebGL2. Real Chrome on Apple Silicon is the reference.

## Commands

```bash
pnpm install            # clean install
pnpm review             # everything below, in one go
```

`pnpm review` runs: format check → lint → typecheck → unit tests → production build → real-browser
evidence capture. It does not contact any remote host and does not deploy.

Individually:

```bash
pnpm dev                # dev server, http://127.0.0.1:5273
pnpm build              # tsc --noEmit && vite build
pnpm preview            # serve the production build, http://127.0.0.1:4273
pnpm serve:nested       # serve the production build under /bug-game/, http://127.0.0.1:4274/bug-game/
pnpm test               # unit tests (the full-run balance tests are slow — minutes)
pnpm capture            # drive the built game in a browser and write artifacts/evidence/
```

**Play it:** `pnpm build && pnpm preview`, then open <http://127.0.0.1:4273/>.

## Controls

| Key             | Action                                                               |
| --------------- | -------------------------------------------------------------------- |
| `W` `A` `S` `D` | move the scout (camera-relative)                                     |
| `Shift`         | sprint — drains, and being loud raises how fast you are noticed      |
| left-drag       | lay a pheromone route from a claimed foothold to a discovered source |
| right-click     | erase the route nearest the cursor                                   |
| `E`             | claim a foothold · start or stop work on a sealed passage            |
| `Space`         | traverse a cable, pipe, seam or fabric climb                         |
| `1` `2` `3`     | commit an adaptation (번식 / 수집 / 은신) when a point is available  |
| wheel           | zoom, within a narrow fixed range                                    |
| `Esc`           | pause · `R` restart                                                  |

## Recommended first play path

1. Dismiss the help card. You are under the kitchen sink; the toe-kick recess runs left and right.
2. Drag from the nest to the drain trap a few centimetres away — that is a pheromone route, and
   workers start walking it immediately.
3. Drag a second route to the food-waste bin across the room. It pays more and it is much louder.
4. Watch 먹이 / 수분 / 군체 top-right. When you have four workers and the stores the objective
   names, walk to the pipe seal (the objective points at it) and hold `E`.
5. That opens the wall chase into the hallway, and the world visibly changes.

Expected run length: the automated player finishes in ~25 minutes. A human will be slower.

---

## What is verified, and what is not

**Verified in a real browser** (`artifacts/evidence/whole-home-reboot-final/`, `runtime-report.json`):

- boots to a playable 3-D apartment; 187 props, ~2 000 meshes, 26 lights
- zero console errors, zero failed requests, **zero external network requests**
- zero missing prop builders — every `kind` the world asks for has geometry
- five consecutive restarts produce byte-identical opening state
- Korean UI at 1920×1080, 1440×900, 1280×720 and DPR 2, no tofu, no clipping
- pheromone routes draw, workers deliver (27 deliveries in the first 45 s of a capture)

**Performance, measured on real hardware** (`performance.json`) — Chrome on Apple M1 via Metal,
GPU timer queries, 30 s of active play with a live colony (9 workers, 2 routes, audio running):

| metric         | measured       | budget |
| -------------- | -------------- | ------ |
| presented p50  | **16.70 ms**   | ≤ 16.7 |
| presented p95  | **17.80 ms**   | ≤ 20   |
| presented p99  | **18.50 ms**   | ≤ 33   |
| worst frame    | 18.70 ms       | < 100  |
| CPU p50 / p99  | 4.20 / 4.80 ms | —      |
| GPU p50 / p99  | 3.97 / 4.23 ms | —      |
| frames > 33 ms | **0**          | —      |
| draw calls     | 393            | —      |

Before static geometry baking and the fixed light pool this was p50 50.0 / p95 51.6 / p99 83.4 ms
with CPU 47.9 and GPU 43.9 — about 20 fps.

**Audio works.** `src/audio/bridge.ts` maps simulation cues to the procedural synthesiser, panned
from real world positions. It unlocks on your first keypress (browsers require a user gesture).

**NOT verified — do not read these as done:**

- **The run is not currently winnable end-to-end by the scripted player.** Fixing three genuinely
  broken systems (inert cover zones, five missing household routines, a victory condition that was
  strictly dominated by the gate before it) changed the balance, and the economy has not been
  re-derived on top of the corrected systems. The previous "won in 21.4 minutes" was true, and was
  true _because_ those systems were broken. See `GAUNTLET_STATE.md` §4.
- **A complete human playthrough.** Nobody has played this from beginning to end.
- **Visual finish.** An independent critic could not name the room without reading the HUD. See
  `artifacts/evidence/whole-home-reboot-final/critics/REPORTS.md` — all five critics returned FAIL,
  with 14 blocker findings between them. Several remain open.
- **`pnpm test` does not complete.** The full-run balance tests are far too slow to be a gate. Run
  `npx vitest run tests/unit/house.test.ts tests/unit/occlusion.test.ts tests/unit/profiler.test.ts`
  for the fast suite (79 tests, under a second).

## Known limitations

See `GAUNTLET_STATE.md` for the ranked list with evidence. The largest are: no audio wiring, chapter
pacing front-loaded (measured and documented, with a rejected fix recorded), and no real-hardware
performance measurement.
