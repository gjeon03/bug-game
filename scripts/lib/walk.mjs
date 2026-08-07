/**
 * Drive the scout with the keyboard, from a browser-automation script.
 *
 * ## Why this file exists
 *
 * `capture.mjs` and `perf.mjs` both laid pheromone routes with `page.mouse.down/move/up`. Route
 * drawing by pointer was deleted from the game twenty-two commits before an independent technical
 * verifier found it — `src/game/input.ts` says in as many words that there is no pointer path, and
 * the only `pointerdown` listener left in `src/` unlocks the audio context.
 *
 * So both harnesses were miming at a mechanic that no longer existed, and both reported success:
 * the captured `runtime-report.json` recorded `routes: 0, deliveries: 0` at t=40 with a population
 * still at its starting 2, and `02-kitchen-start.png` and `05-colony-working.png` had identical
 * HUDs. Every visual and performance claim on this branch rested on forty seconds of an empty room.
 *
 * The fix is not to poke the simulation directly — that would be the same lie with better numbers.
 * It is to press the keys a player presses. `keysFor` converts a world-space direction into the
 * WASD the camera basis makes it mean, which is the entire translation a human does in their head.
 */

/**
 * The camera's fixed basis, restated in plain numbers.
 *
 * Kept here rather than imported because these scripts run under Node against a built bundle and
 * have no access to the module graph. Yaw is 225°, so forward is (cos, sin) and right is
 * (-sin, cos) — the Y-up right-handed cross product, which is the convention `src/view/camera.ts`
 * settled on after shipping its negation and having a player report the controls as reversed.
 */
const YAW = (225 * Math.PI) / 180;
const FORWARD = { x: Math.cos(YAW), z: Math.sin(YAW) };
const RIGHT = { x: -Math.sin(YAW), z: Math.cos(YAW) };

/** Below this fraction of the step, a key is not worth holding — it just fights the other axis. */
const AXIS_DEADZONE = 0.35;

/** Read the scout's live position and surface. */
export async function scoutAt(page) {
  return page.evaluate(() => {
    const s = window.__game.run.scout;
    return { x: s.x, z: s.z, y: s.y, surface: s.surface, state: s.state, speed: s.speed };
  });
}

/** Which WASD keys mean "go this way", given the fixed camera. */
export function keysFor(dx, dz) {
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return [];
  const ux = dx / length;
  const uz = dz / length;

  const forward = ux * FORWARD.x + uz * FORWARD.z;
  const strafe = ux * RIGHT.x + uz * RIGHT.z;

  const keys = [];
  if (forward > AXIS_DEADZONE) keys.push('KeyW');
  else if (forward < -AXIS_DEADZONE) keys.push('KeyS');
  if (strafe > AXIS_DEADZONE) keys.push('KeyD');
  else if (strafe < -AXIS_DEADZONE) keys.push('KeyA');
  return keys;
}

/** Release everything. Safe to call when nothing is held. */
async function release(page, held) {
  for (const key of held) await page.keyboard.up(key);
  held.clear();
}

/**
 * Walk to a world point, re-aiming as we go.
 *
 * Returns how close we got, in world units. Never throws on failure — a harness that dies because
 * the scout got stuck behind a chair leg tells you less than one that reports the distance.
 *
 * `onTick` is called with the live scout each poll, so a caller can watch for a climb becoming
 * available or a threat landing without running a second loop.
 */
export async function walkTo(page, target, options = {}) {
  const { tolerance = 90, timeoutMs = 25_000, pollMs = 120, sprint = false, onTick } = options;
  const held = new Set();
  const started = Date.now();
  let closest = Infinity;

  if (sprint) await page.keyboard.down('Shift');

  try {
    while (Date.now() - started < timeoutMs) {
      const scout = await scoutAt(page);
      if (onTick) await onTick(scout);

      const dx = target.x - scout.x;
      const dz = target.z - scout.z;
      const distance = Math.hypot(dx, dz);
      closest = Math.min(closest, distance);
      if (distance <= tolerance) break;

      const want = new Set(keysFor(dx, dz));
      for (const key of held) if (!want.has(key)) await page.keyboard.up(key);
      for (const key of want) if (!held.has(key)) await page.keyboard.down(key);
      held.clear();
      for (const key of want) held.add(key);

      await page.waitForTimeout(pollMs);
    }
  } finally {
    await release(page, held);
    if (sprint) await page.keyboard.up('Shift');
  }

  return closest;
}

/**
 * Lay one pheromone route the way a player does: stand on the refuge, F, walk, F.
 *
 * Returns a result object rather than a boolean so a caller can report WHY it failed — "never
 * reached the nest" and "sealed nowhere near the source" are different defects and the difference
 * is the whole value of running this in a browser.
 */
export async function layRoute(page, { nest, source }) {
  const before = await page.evaluate(() => window.__game.run.routes.length);

  const toNest = await walkTo(page, nest, { tolerance: 70 });
  if (!(await page.evaluate(() => window.__game.run.trail !== null))) {
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(200);
  }
  if (!(await page.evaluate(() => window.__game.run.trail !== null))) {
    return { ok: false, why: 'F did not start a trail', toNest, routes: before };
  }

  const toSource = await walkTo(page, source, { tolerance: 80 });
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(300);

  const after = await page.evaluate(() => window.__game.run.routes.length);
  return {
    ok: after > before,
    why: after > before ? 'laid' : 'seal refused — not close enough to the source',
    toNest,
    toSource,
    routes: after,
  };
}

/** The nest and the nearest found source on the same surface, in world units. */
export async function nearestSupplyPair(page) {
  return page.evaluate(() => {
    const run = window.__game.run;
    const nest = run.house.footholds.get('kitchen.undersink');
    if (!nest) return null;

    let best = null;
    let bestD = Infinity;
    for (const [id, state] of run.resources) {
      if (!state.found || state.remaining <= 0) continue;
      const site = run.house.resources.get(id);
      if (!site || site.surface !== nest.surface) continue;
      const d = Math.hypot(site.at.x - nest.at.x, site.at.z - nest.at.z);
      if (d < bestD) {
        bestD = d;
        best = { id, x: site.at.x, z: site.at.z };
      }
    }
    if (!best) return null;
    return { nest: { x: nest.at.x, z: nest.at.z }, source: best };
  });
}
