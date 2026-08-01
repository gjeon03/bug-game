import { chromium } from '@playwright/test';
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
await page.waitForTimeout(800);
const s0 = await page.evaluate(() => window.__roach.state());
console.log('BOOT objective:', JSON.stringify(s0.hud.objective));
console.log('BOOT operation:', s0.hud.operation, '| source:', s0.hud.source);
console.log('BOOT checklist:', JSON.stringify(s0.hud.checklist));
console.log(
  'BOOT food/water:',
  s0.colony.food.toFixed(0) + '/' + s0.colony.foodCap,
  s0.colony.water.toFixed(0) + '/' + s0.colony.waterCap,
  'pop',
  s0.colony.population + '/' + s0.colony.capacity,
);
await page.screenshot({
  path: '/private/tmp/claude-501/-Users-jeongyeong-yeon-Documents-LOCAL-bug-game/4d470ed7-d200-410f-8106-392e84c32ebb/scratchpad/smoke-boot.png',
});
// play 40 s of nothing to see it doesn't crash
await page.waitForTimeout(20000);
const s1 = await page.evaluate(() => window.__roach.state());
console.log(
  'T20 objective:',
  JSON.stringify(s1.hud.objective),
  '| blocker:',
  JSON.stringify(s1.hud.blocker),
);
console.log('T20 status:', s1.status, 'op', s1.operation);
console.log('ERRORS:', errs.slice(0, 8));
await b.close();
