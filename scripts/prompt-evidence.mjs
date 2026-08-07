/**
 * Can a player find out which key lays a route?
 *
 * Three things had to be true and none of them were: the pheromone keys appear on a contextual
 * prompt, the control list can be recalled after it is dismissed, and nothing on screen is English.
 * The first two were verified absent by reading the code; this verifies them present by playing.
 *
 *   node scripts/prompt-evidence.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4278/bug-game/';
const OUT = resolve('artifacts/evidence/completion/prompts');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForFunction(() => window.__game !== undefined, { timeout: 60000 });
await page.waitForTimeout(2000);

/** Everything the player can currently read, as rendered — not as catalogued. */
const onScreen = () =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('#hud, #hud *, #curtain, #curtain *'))
      .filter((n) => n.offsetParent !== null)
      .map((n) => (n.childElementCount === 0 ? (n.textContent ?? '').trim() : ''))
      .filter(Boolean),
  );

const report = {};
const step = async (name, data) => {
  report[name] = data;
  console.log(name, JSON.stringify(data));
};

// 1 — the help card at boot, then dismissed by a keypress the way a real player dismisses it.
await page.screenshot({ path: resolve(OUT, '1-help-card.png') });
await step('help', { lines: await onScreen() });

await page.keyboard.press('Space');
await page.waitForTimeout(400);
// Read from the DOM, not from a debug global — whether the card is GONE is a fact about the screen.
const curtainVisible = () =>
  page.evaluate(() => {
    const node = document.getElementById('curtain');
    return node !== null && node.offsetParent !== null;
  });
await step('afterDismiss', { curtainVisible: await curtainVisible() });

// 2 — Esc must bring the controls back. This is the recovery path that did not exist.
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.screenshot({ path: resolve(OUT, '2-pause-controls.png') });
const paused = await onScreen();
await step('pause', { lines: paused, mentionsF: paused.some((l) => l.includes('F')) });

await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// 3 — the scout starts on its refuge, so the route prompt should already be offered.
const promptAt = async () =>
  page.evaluate(() => {
    const node = document.querySelector('#prompt');
    return node && node.offsetParent !== null ? (node.textContent ?? '').trim() : null;
  });
await step('promptOnNest', { text: await promptAt() });
await page.screenshot({ path: resolve(OUT, '3-route-prompt.png') });

// 4 — press it, and check the game agrees a trail started.
await page.keyboard.press('KeyF');
await page.waitForTimeout(300);
await step('afterF', {
  trail: await page.evaluate(() => window.__game.run.trail !== null),
  prompt: await promptAt(),
});

// 5 — walk, then confirm the prompt is telling the player what to do next.
await page.keyboard.down('KeyS');
await page.waitForTimeout(1500);
await page.keyboard.up('KeyS');
await page.screenshot({ path: resolve(OUT, '4-walking-route.png') });
await step('walking', {
  points: await page.evaluate(() => window.__game.run.trail?.points.length ?? 0),
  prompt: await promptAt(),
});

const latin = (await onScreen()).join(' ').match(/[A-Za-z]{4,}/g) ?? [];
await step('korean', { latinWords: [...new Set(latin)], consoleErrors: errors.length });

writeFileSync(resolve(OUT, 'prompts.json'), JSON.stringify({ report, errors }, null, 2));
await browser.close();

const ok =
  report.pause.mentionsF &&
  report.promptOnNest.text !== null &&
  report.afterF.trail &&
  report.walking.points > 1 &&
  latin.length === 0 &&
  errors.length === 0;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
