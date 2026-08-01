import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the **production build served from a nested path**, never against the dev server.
 * That means every gameplay test doubles as a GitHub Pages subpath test: if an asset URL were
 * absolute, every spec would fail rather than one.
 */
const PORT = 4178;
const PREFIX = '/bug-game/';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'artifacts/evidence/e2e-results.json' }]],
  outputDir: 'test-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${PORT}${PREFIX}`,
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
    video: 'off',
    launchOptions: {
      args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
    },
  },
  webServer: {
    command: `node scripts/serve-nested.mjs ${PORT} ${PREFIX} dist`,
    url: `http://127.0.0.1:${PORT}${PREFIX}`,
    // Never reuse a server that might be pointing at a stale or foreign dist/ — the specs exist to
    // validate *this* build. `pnpm test:e2e` rebuilds before invoking Playwright.
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
