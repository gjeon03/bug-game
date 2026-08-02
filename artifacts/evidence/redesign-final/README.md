# redesign-final — evidence package

Everything here was produced from the shipped production build served at `/bug-game/`, through the
real input layer, in a real browser. Nothing was hand-written.

## How to reproduce

```bash
pnpm build
node scripts/serve-nested.mjs                    # http://127.0.0.1:4178/bug-game/
node scripts/playtest.mjs --out artifacts/evidence/redesign-final
```

## What is in here

| Path                     | What it is                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| `guided-run/`            | A complete real-browser run captured earlier in the redesign: decision transcript plus a capture at every operation and at the ending. **Superseded** — it predates the final build and the script that produced it was ad hoc, so it is kept as a record and not cited as a gate. The reproducible equivalent is the `growth` scenario in `playtest.json`. |
| `playtest.json`          | All seven scenario records from `scripts/playtest.mjs`: growth, shadow, aggressive, recovery, idle, restarts, focus. |
| `shots/`                 | Milestone captures per scenario: cold load, first move, first delivery, adaptation offer, first adaptation, household routine, cleaning sweep, compromised route, foothold fitted, extermination, outcome, plus a capture at each operation transition |
| `visual-sweep/`          | A tour of every named fixture at the real gameplay camera, modals dismissed                       |
| `critique/`              | The three independent critiques (visual, gameplay+UX, technical) and their dispositions           |
| `../redesign-baseline/`  | The before-picture, with its own `PROVENANCE.md` explaining exactly which build produced which file |

## The probe

`scripts/playtest.mjs` installs a 10 Hz in-page sampler that records, per scenario:

- **objective comprehension** — every objective string with the rule (`hud.source`) that produced it
- **decision density** — every plan-changing beat, and the longest interval without one
- **capped-resource dwell** — seconds at each cap, and separately the seconds at a cap where the
  objective did *not* come from a rule that names a spend (`cappedUnexplainedSeconds`, which must be 0)
- **worker health** — per-worker stuck duration, severe multi-body overlap measured against the drawn
  silhouette rather than the collision radius, and carry/render disagreement. Each stall carries the
  state it *began* in, every state it passed through, how it ended and which rung of the recovery
  ladder it reached; a worker that died mid-stall is counted separately so casualties in an
  aggressive run cannot inflate the figure. The samples kept are the **worst by duration**, which is
  the correction that mattered: keeping the first ten instead meant a reported 27 s worst case was
  illustrated entirely by two-second events, and the recorded state was read at the moment the stall
  *ended* — which, since every excused state ends a stall, was guaranteed to be the wrong one.
- **frame-time tails** — p50/p95/p99, worst frame, frames over 50 ms and 100 ms
- **console errors, page errors and failed requests**

## Play is guided, deliberately

The runs are played by `scripts/lib/bot.mjs`, which acts **only on what the HUD shows a player**:
`hud.source` decides what kind of thing to do, `hud.target` decides where, and the one-of-three
panels are answered by key. It never reads a private field and never writes state.

A completed run is therefore evidence about two things at once: that the game can be finished, and
that the guidance is sufficient to finish it without documentation.
