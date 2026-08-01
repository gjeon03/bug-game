/**
 * The guided bot.
 *
 * It plays using **only the guidance the game shows the player**: `hud.source` says what kind of
 * thing to do, `hud.target` says where, and the choice panels are answered by key. It never reads a
 * private field, never writes state, and drives the same input layer a keyboard does.
 *
 * That makes it a test of the guidance as much as of the game: if a run cannot be completed by
 * following the objective line, the objective line is not good enough.
 */

/** In-page steering loop. Serialised into the browser so steering is frame-accurate. */
export const DRIVE = `(a) => new Promise((res) => {
  const api = window.__roach; const t0 = performance.now();
  let best = Infinity, lp = t0, uu = 0, ud = 'up';
  const stop = () => { for (const k of ['left','right','up','down']) api.input.release(k);
    if (!a.lay) api.input.release('lay'); if (!a.sprint) api.input.release('sprint'); };
  const tick = () => {
    const s = api.state(); const now = performance.now();
    if (s.status !== 'playing') { stop(); res({ ok:false, ended:true }); return; }
    if (!s.scout.alive) { stop(); best = Infinity; lp = now;
      if (now - t0 > a.timeout) { res({ ok:false, ended:false }); return; }
      requestAnimationFrame(tick); return; }
    const dx = a.x - s.scout.x, dy = a.y - s.scout.y, d = Math.hypot(dx, dy);
    if (d <= a.arrive) { stop(); res({ ok:true, ended:false }); return; }
    if (now - t0 > a.timeout) { stop(); res({ ok:false, ended:false }); return; }
    if (d < best - 4) { best = d; lp = now; }
    if (now - lp > 900 && now > uu) { uu = now + 620;
      ud = Math.abs(dx) > Math.abs(dy) ? (dy > 0 ? 'down' : 'up') : (dx > 0 ? 'right' : 'left'); lp = now; }
    const on = { left: dx < -10, right: dx > 10, up: dy < -10, down: dy > 10, lay: !!a.lay, sprint: !!a.sprint };
    if (now < uu) { on.left = on.right = on.up = on.down = false; on[ud] = true; }
    for (const k of ['left','right','up','down','lay','sprint']) { if (on[k]) api.input.press(k); else api.input.release(k); }
    requestAnimationFrame(tick); };
  tick(); })`;

export const state = (page) => page.evaluate(() => window.__roach.state());
export const releaseAll = (page) => page.evaluate(() => window.__roach.input.releaseAll());

export const drive = (page, x, y, o = {}) =>
  page.evaluate(
    ([src, a]) => new Function('args', `return (${src})(args)`)(a),
    [
      DRIVE,
      {
        x,
        y,
        lay: !!o.lay,
        sprint: !!o.sprint,
        timeout: o.timeout ?? 26_000,
        arrive: o.arrive ?? 40,
      },
    ],
  );

export const tap = async (page, key, ms = 120) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
};

export const interact = async (page) => {
  await page.evaluate(() => window.__roach.input.press('interact'));
  await page.waitForTimeout(130);
  await page.evaluate(() => window.__roach.input.release('interact'));
  await page.waitForTimeout(150);
};

/** Walks out to a point and lays a trail on the way back to the nearest claimed crack. */
export async function supplyLine(page, x, y, opts = {}) {
  const out = await drive(page, x, y, { timeout: 34_000, sprint: opts.sprint });
  if (out.ended) return out;
  await releaseAll(page);
  await page.waitForTimeout(120);
  const s = await state(page);
  // Home the line on the nearest claimed crack, which is what a player would do once they own more
  // than one — it is also what makes satellites worth claiming.
  let home = { x: 168, y: 2042 };
  let bestD = Infinity;
  for (const n of s.nests) {
    if (!n.claimed) continue;
    const pos = NEST_POS[n.id];
    if (!pos) continue;
    const d = (pos.x - x) ** 2 + (pos.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      home = pos;
    }
  }
  const back = await drive(page, home.x, home.y, {
    lay: true,
    timeout: 34_000,
    sprint: opts.sprint,
  });
  await releaseAll(page);
  return back;
}

export const NEST_POS = {
  home: { x: 168, y: 2042 },
  crackSink: { x: 604, y: 1568 },
  crackIsland: { x: 1362, y: 1796 },
  crackPantry: { x: 836, y: 2494 },
  crackStove: { x: 1980, y: 640 },
  crackBin: { x: 3428, y: 2088 },
};

/** Family preference orders for the two adaptation strategies under test. */
export const FAMILY_KEYS = { brood: 'Digit1', forage: 'Digit2', shadow: 'Digit3' };

/**
 * Plays one step of whatever the HUD is currently asking for.
 *
 * Returns a short tag describing what it did, so a transcript of a run reads as a list of the
 * decisions the guidance actually produced.
 */
export async function step(page, opts = {}) {
  const s = await state(page);
  if (s.status !== 'playing') return `end:${s.status}`;

  // 1. A pending one-of-three choice. Answered by key, exactly as a player would.
  if (s.adaptations.offer.length > 0) {
    const want = opts.family ?? 'brood';
    let slot = s.adaptations.offer.findIndex((id) => id.startsWith(want));
    if (slot < 0) slot = 0;
    await tap(page, `Digit${slot + 1}`);
    await page.waitForTimeout(250);
    return `adapt:${s.adaptations.offer[slot]}`;
  }
  if (s.pendingFit) {
    // Prefer whatever the colony is short of: capacity first, then storage.
    const key =
      s.colony.population >= s.colony.capacity - 2
        ? 'Digit1'
        : s.colony.food >= s.colony.foodCap - 6
          ? 'Digit2'
          : 'Digit1';
    await tap(page, key);
    await page.waitForTimeout(250);
    return `fit:${s.pendingFit}`;
  }

  const src = s.hud.source;
  const target = s.hud.target;

  // 2. Anything that wants the scout to stand somewhere and press E.
  if (
    src.startsWith('gate:foothold') ||
    src.startsWith('gate:functions') ||
    src.startsWith('capped:claim') ||
    src.startsWith('capped:fit') ||
    src.startsWith('capped:repair')
  ) {
    if (!target) return 'wait:noTarget';
    const r = await drive(page, target.x, target.y, { timeout: 34_000, sprint: opts.sprint });
    if (r.ended) return 'end';
    await interact(page);
    return `interact:${target.label}`;
  }

  // A line that already exists must not be laid again: every fresh lay starts a *new* route, and at
  // six concurrent routes the oldest is evicted — so a bot that re-laid on every tick would keep
  // deleting the colony's own working supply lines. A player would simply not do this.
  const servedAlready = (t) => {
    if (!t) return false;
    let id = null;
    let best = 120 * 120;
    for (const [k, pos] of Object.entries(RES_POS)) {
      const d = (pos.x - t.x) ** 2 + (pos.y - t.y) ** 2;
      if (d < best) {
        best = d;
        id = k;
      }
    }
    if (!id) return false;
    return s.routes.some((r) => r.linked && r.resourceId === id);
  };

  // 3. Anything that wants a supply line.
  if (
    src.startsWith('gate:foodLine') ||
    src.startsWith('gate:waterLine') ||
    src === 'shortage' ||
    src === 'adaptation:saving' ||
    src.startsWith('routine:') ||
    src.startsWith('capped:territory') ||
    src.startsWith('gate:zones')
  ) {
    if (!target) return 'wait:noTarget';
    if (servedAlready(target)) {
      // Already connected: patrol the line instead of re-laying it, which is what keeps the scout
      // near its own network and is also how a player waits productively.
      await drive(page, target.x, target.y, { timeout: 20_000 });
      await page.waitForTimeout(2500);
      return `patrol:${target.label ?? src}`;
    }
    const r = await supplyLine(page, target.x, target.y, opts);
    if (r.ended) return 'end';
    await page.waitForTimeout(opts.dwell ?? 1200);
    return `line:${target.label ?? src}`;
  }

  // 4. Growth gates: keep the network fed by re-routing to the richest reachable source.
  if (src.startsWith('gate:pop') || src.startsWith('capped:')) {
    const res = s.resources
      .filter((r) => !r.depleted && r.unlockOp <= s.operation)
      .sort((a, b) => b.amount - a.amount)[0];
    if (res) {
      const pos = RES_POS[res.id];
      if (pos && !s.routes.some((r2) => r2.linked && r2.resourceId === res.id)) {
        const r = await supplyLine(page, pos.x, pos.y, opts);
        if (r.ended) return 'end';
        await page.waitForTimeout(1500);
        return `line:${res.id}`;
      }
    }
    await page.waitForTimeout(2000);
    return 'wait:grow';
  }

  // 5a. A threat sitting on a supply line: re-lay it. The advice literally says "steer the trail
  //     around it", and a player who kept hauling instead of hiding is the correct behaviour here.
  if (src === 'threat') {
    const res = s.resources
      .filter((r) => !r.depleted && r.unlockOp <= s.operation)
      .sort((a, b) => b.amount - a.amount)[0];
    const pos = res ? RES_POS[res.id] : null;
    if (pos) {
      const r = await supplyLine(page, pos.x, pos.y, opts);
      if (r.ended) return 'end';
      return `reroute:${res.id}`;
    }
  }

  // 5b. The final response: get home and hold.
  if (src.startsWith('gate:survive')) {
    const r = await drive(page, 168, 2042, { timeout: 30_000 });
    if (r.ended) return 'end';
    await page.waitForTimeout(2500);
    return 'shelter';
  }

  await page.waitForTimeout(1500);
  return `idle:${src}`;
}

export const RES_POS = {
  dishCrumbs: { x: 712, y: 1704 },
  sinkDrip: { x: 664, y: 1312 },
  stoveGrease: { x: 1608, y: 716 },
  islandDrop: { x: 1872, y: 1948 },
  fridgeCondensation: { x: 2556, y: 872 },
  pantryGrain: { x: 912, y: 2312 },
  trashSpill: { x: 2884, y: 2472 },
  petBowl: { x: 2700, y: 2216 },
};
