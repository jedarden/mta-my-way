/**
 * Playwright E2E test configuration for MTA My Way.
 *
 * Tests run against a locally running server on http://localhost:3001
 */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./",
  testMatch: ["**/*.e2e.ts"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "Mobile Safari",
      use: { ...devices["iPhone 12"] },
    },
  ],

  // Start the local dev server before running tests.
  // Uses tsx to transpile TypeScript on-the-fly (avoids tsc -b build failures
  // from unrelated type errors in the codebase).
  //
  // Timeout (300s) accounts for slow startup on resource-constrained CI nodes:
  // - GTFS data loading and initialization
  // - Database migrations
  // - Feed poller first poll
  // - VAPID key generation
  // - OpenTelemetry initialization
  //
  // Health-check polling & retry:
  // Playwright polls the `url` every ~500ms until it receives a 2xx response or
  // the `timeout` is reached.  If the server crashes during startup, Playwright
  // restarts the `command` and retries the health check — this is the built-in
  // retry mechanism.  We use the lightweight /health endpoint (registered before
  // all middleware in app.ts) so readiness checks respond in <1ms regardless of
  // rate-limit or CSRF state.  It returns 200 once the HTTP server is listening
  // and the database is reachable (SELECT 1), before feed pollers fire.
  //
  // reuseExistingServer: in CI every run is fresh so always start a new process;
  //   locally, reuse a running dev server to avoid startup overhead.
  webServer: {
    command: "cd ../.. && npx tsx packages/server/src/index.ts",
    env: {
      TEST_MODE: "true",
    },
    url: "http://localhost:3001/health",
    reuseExistingServer: !process.env.CI,
    timeout: 300 * 1000,
  },
});
