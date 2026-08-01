import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { state, step } from '../lib/bot.mjs';

const OUT = process.argv[2] ?? 'scripts/tmp/run1';
const FAMILY = process.argv[3] ?? 'brood';
const SEED = Number(process.argv[4] ?? 1234);
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e));
await page.goto('http://127.0.0.1:4178/bug-game/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__roach?.ready === true, null, { timeout: 20000 });
await page.keyboard.press('KeyW');
await page.evaluate((s) => window.__roach.newRun(s), SEED);
await page.evaluate(() => window.__roach.input.releaseAll());
await page.waitForTimeout(400);

const log = [];
let lastOp = 1;
const t0 = Date.now();
for (let i = 0; i < 400; i++) {
  const tag = await step(page, { family: FAMILY });
  const s = await state(page);
  log.push({
    t: +s.time.toFixed(1),
    op: s.operation,
    tag,
    src: s.hud.source,
    pop: s.colony.population,
    food: Math.round(s.colony.food),
    water: Math.round(s.colony.water),
    adapts: s.adaptations.taken.length,
    held: s.zones.filter((z) => z.hold >= 0.8).length,
  });
  if (s.operation !== lastOp) {
    console.log(`--- OPERATION ${s.operation} at ${s.time.toFixed(0)}s ---`);
    await page.screenshot({ path: `${OUT}/op${s.operation}.png` });
    lastOp = s.operation;
  }
  if (s.status !== 'playing') {
    console.log(`END ${s.status} ${s.loseCause ?? ''} at ${s.time.toFixed(0)}s`);
    break;
  }
  if (Date.now() - t0 > 22 * 60 * 1000) {
    console.log('HARNESS TIMEOUT');
    break;
  }
  console.log(
    `${s.time.toFixed(0)}s op${s.operation} ${tag} | pop ${s.colony.population}/${s.colony.capacity} f${Math.round(s.colony.food)} w${Math.round(s.colony.water)} ad${s.adapts ?? s.adaptations.taken.length} held${s.zones.filter((z) => z.hold >= 0.8).length} | ${s.hud.objective.slice(0, 70)}`,
  );
}
const s = await state(page);
await page.screenshot({ path: `${OUT}/final.png` });
writeFileSync(`${OUT}/log.json`, JSON.stringify({ final: s, log, errs }, null, 2));
console.log(
  JSON.stringify(
    {
      status: s.status,
      lose: s.loseCause,
      time: s.time,
      op: s.operation,
      pop: s.colony.population,
      adapts: s.adaptations.taken,
      held: s.zones.filter((z) => z.hold >= 0.8).map((z) => z.id),
      errs: errs.slice(0, 5),
    },
    null,
    2,
  ),
);
await b.close();
