# Baseline evidence provenance

Two capture passes are stored here, and they are not interchangeable.

##  +  — pristine baseline

Captured against the shipped build at commit `3242189`, before any change. This is the honest
before-picture for the economy, the objective line and the environment:

- food reaches 199/200 at t≈75 s and stays capped for **65.3 s of a 178 s night 1**
- longest decision-free plateau **114.9 s** inside night 1
- the first objective a new player reads, at t=0.8 s, is
  `MOISTURE RUNNING OUT — run a trail to water now or the colony dies.`
- population pinned at 14/14 with brood 0 % while the only sink was time-locked
  (`Brood chamber — sealed until night 2`)

##  — full-run baseline

Captured after the worker-AI repair landed (lanes, positional separation, endpoint rings, stuck
watchdog) but **before** the operations/economy/household redesign. It exists because the first pass
mis-detected the end of a run and only measured night 1.

- cautious: **lost** (`notEstablished`) at 731 s; food capped **427 s**; longest plateau **463.9 s**
- aggressive: **lost** (`notEstablished`) at 714 s; food capped **281 s**; longest plateau **497.8 s**
- idle: collapse at 297 s

The worker repair does not touch the economy, the objective resolver or the director, so these
plateau and capped-resource numbers are valid as the pre-redesign baseline. Worker stuck/overlap
numbers from this pass are *post*-repair and must not be quoted as the worker baseline; the worker
baseline is the code analysis in `audits/04-workers.md` and the pristine screenshots above.
