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
  // Server startup sequence (packages/server/src/index.ts):
  //   1. Load GTFS static data (~1-2s)
  //   2. Run migrations (~1s)
  //   3. Initialize subsystems (VAPID, OpenTelemetry, etc.)
  //   4. Start HTTP server (<1s) — health endpoint becomes available
  //   5. Start feed pollers in background (fire immediately but async)
  //
  // Port conflict detection:
  // Before starting the server, we check if port 3001 is already in use.
  // This prevents confusing "port already in use" errors during test runs.
  // The check script exits with code 1 if the port is busy, providing clear
  // guidance on how to resolve the conflict.
  //
  // Timeout (60s) accounts for typical server startup time:
  // - GTFS data loading and initialization (~1-2s)
  // - Database migrations (~1s)
  // - VAPID key generation (~1s)
  // - OpenTelemetry initialization (~1s)
  // - HTTP server start (<1s)
  //
  // The HTTP server starts BEFORE feed pollers fire, so the health endpoint
  // responds immediately once the database is reachable. Pollers run in the
  // background after the server is listening.
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
  // reuseExistingServer:
  //   - CI (process.env.CI=true): Always start a fresh server for clean state
  //   - Local development (CI unset/false): Reuse existing dev server to avoid
  //     startup overhead. If no server is running, Playwright starts one.
  //   - To force a fresh server locally: CI=true npx playwright test
  //   - To reuse in CI: Not recommended (tests may share state), but possible
  //     by removing the CI env var in the workflow template.
  webServer: {
    command: "npx tsx helpers/check-port.ts && cd ../.. && npx tsx packages/server/src/index.ts",
    env: {
      TEST_MODE: "true",
    },
    url: "http://localhost:3001/health",
    reuseExistingServer: !process.env.CI,
    timeout: 60 * 1000,
  },
});
