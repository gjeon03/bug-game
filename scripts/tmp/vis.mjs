import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'scripts/tmp/vis';
mkdirSync(OUT, { recursive: true });

const DRIVE = `(a) => new Promise((res) => {
  const api = window.__roach; const t0 = performance.now(); let best = Infinity, lp = t0, uu = 0, ud = 'up';
  const stop = () => { for (const k of ['left','right','up','down']) api.input.release(k); if (!a.lay) api.input.release('lay'); };
  const tick = () => { const s = api.state(); const now = performance.now();
    if (!s.scout.alive || s.status !== 'playing') { stop(); if (now-t0>a.timeout) { res(false); return; } requestAnimationFrame(tick); return; }
    const dx = a.x - s.scout.x, dy = a.y - s.scout.y, d = Math.hypot(dx,dy);
    if (d <= 44) { stop(); res(true); return; }
    if (now - t0 > a.timeout) { stop(); res(false); return; }
    if (d < best - 4) { best = d; lp = now; }
    if (now - lp > 900 && now > uu) { uu = now + 650; ud = Math.abs(dx)>Math.abs(dy) ? (dy>0?'down':'up') : (dx>0?'right':'left'); lp = now; }
    const on = { left: dx<-10, right: dx>10, up: dy<-10, down: dy>10, lay: !!a.lay };
    if (now < uu) { on.left=on.right=on.up=on.down=false; on[ud]=true; }
    for (const k of ['left','right','up','down','lay']) { if (on[k]) api.input.press(k); else api.input.release(k); }
    requestAnimationFrame(tick); };
  tick(); })`;

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e));
await page.goto('http://127.0.0.1:4178/bug-game/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__roach?.ready === true, null, { timeout: 20000 });
await page.keyboard.press('KeyW');
await page.evaluate(() => window.__roach.newRun(1234));
await page.evaluate(() => window.__roach.input.releaseAll());
await page.waitForTimeout(400);

const drive = (x, y, lay = false, timeout = 40000) =>
  page.evaluate(
    ([src, a]) => new Function('args', `return (${src})(args)`)(a),
    [DRIVE, { x, y, lay, timeout }],
  );
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` });
const rel = () => page.evaluate(() => window.__roach.input.releaseAll());

// 1. Food line to the dishwasher crumbs, laid on the way home.
await drive(712, 1704);
await shot('a-dishwasher');
await drive(168, 2042, true);
await rel();
await page.waitForTimeout(2500);
await shot('b-trail-ribbon');

// 2. Moisture line to the sink.
await drive(664, 1312);
await shot('c-sink');
await drive(168, 2042, true);
await rel();
await page.waitForTimeout(6000);
await shot('d-two-lines');

// 3. Tour the fixtures.
for (const [name, x, y] of [
  ['e-stove', 1608, 800],
  ['f-fridge', 2600, 1000],
  ['g-island', 1872, 1948],
  ['h-bin-door', 2950, 2300],
  ['i-pantry', 912, 2312],
]) {
  await drive(x, y, false, 45000);
  await rel();
  await page.waitForTimeout(700);
  await shot(name);
}

const s = await page.evaluate(() => window.__roach.state());
console.log(
  JSON.stringify(
    {
      op: s.operation,
      objective: s.hud.objective,
      source: s.hud.source,
      blocker: s.hud.blocker,
      food: `${s.colony.food.toFixed(0)}/${s.colony.foodCap}`,
      water: `${s.colony.water.toFixed(0)}/${s.colony.waterCap}`,
      pop: `${s.colony.population}/${s.colony.capacity}`,
      routes: s.routes.length,
      deliveries: s.stats.deliveries,
      forecast: s.hud.forecast,
      heat: s.heat,
    },
    null,
    2,
  ),
);
console.log('ERRORS', errs.slice(0, 6));
await b.close();
