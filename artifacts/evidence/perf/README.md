# Performance evidence

Two files, two environments, and the difference between them is the point.

| File | Environment |
| ---- | ----------- |
| `perf-headed.json` | A real browser window on the reference machine — a genuine compositor at the display's refresh rate. |
| `perf.json` | The headless Chromium the rest of the suite and CI run in. |

## What is measured

- **`p50`/`p95`/`p99`/`worst`** — the *presented frame interval*, the delta between consecutive
  `requestAnimationFrame` timestamps. This is what a player perceives as smoothness.
- **`cpuP50`/`cpuP95`/`cpuP99`/`cpuWorst`** — time spent inside the game's own frame callback:
  simulation plus render. This is the part the game controls.

An earlier version of this file reported the CPU number under the `p50` label and compared it to a
frame-time budget. An independent verification pass caught it by arithmetic — a window of 1553 frames
spanning 38.8 s cannot have a mean frame time of 0.9 ms — and the telemetry was corrected. The two
quantities are now recorded separately and gated separately.

## Headed result (the honest player-facing number)

| Window | Frames | p50 | p95 | p99 | worst | > 50 ms | > 100 ms | CPU p99 | Peak roaches | Peak hazards | Draw calls |
| ------ | ------ | --- | --- | --- | ----- | ------- | -------- | ------- | ------------ | ------------ | ---------- |
| active-play | 4564 | **8.3** | **9.9** | **10.2** | 10.4 | 0 % | 0 | 0.5 | 11 | 0 | 307 |
| peak-load | 5010 | **8.3** | **9.8** | **10.2** | 10.4 | 0 % | 0 | 0.6 | 32 | 10 | 464 |

Every budget met with a wide margin. The display presents at ~120 Hz and the game keeps up at both
loads, with its own work costing **0.6 ms** per frame at peak — 7 % of a 8.3 ms frame. There is not a
single frame over 50 ms in either window, and the worst frame in ten thousand is 10.4 ms.

Note that `p50` is identical in both windows: tripling the colony, adding ten hazards and 50 % more
draw calls does not move the frame interval at all, because the bottleneck is the display, not the
game.

## Headless result (the CI environment)

Headless Chromium presents at a fixed ~25 ms cadence regardless of page content: `p50 25.0`,
`cpuP95 1.3–1.7 ms`. The interval figure is a property of the harness — the identical build measures
8.3 ms in a real window — so `perf.spec.ts` enforces the absolute interval budget only when the host's
own **idle baseline** clears 60 Hz, and always enforces:

- frame-callback CPU p99 ≤ 8 ms,
- loaded p50 ≤ 1.3× the same host's idle p50,
- zero frames over 100 ms, fewer than 1 % over 50 ms.

That is a stricter test of the *game* than the raw number was, because it is immune to the host's
cadence.
