/**
 * Playwright E2E test configuration for MTA My Way.
 *
 * Tests run against a locally running server on http://localhost:3001
 */

import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const isCI = process.env["CI"] === "1" || process.env["CI"] === "true";
const baseURL = process.env["PLAYWRIGHT_BASE_URL"] || "http://localhost:3001";
const completedOnboardingStorageState = {
  origins: [
    {
      origin: new URL(baseURL).origin,
      localStorage: [
        {
          name: "mta-favorites",
          value: JSON.stringify({
            state: { favorites: [], commutes: [], tapHistory: [], onboardingComplete: true },
            version: 1,
          }),
        },
      ],
    },
  ],
};

/**
 * Playwright's own browser download cannot launch on this NixOS host — the
 * bundled headless shell is linked against `libglib-2.0.so.0`, which is not on
 * its library path (`error while loading shared libraries`). The nix-store
 * Chromium works. CHROME_PATH is the same escape hatch `lighthouserc.json`
 * uses (see docs/notes/lighthouse-acceptance-baseline.md), so one variable
 * unlocks both harnesses; unset, Playwright resolves its own build as usual.
 */
function resolveChromiumExecutable(): string | undefined {
  const candidate = process.env["CHROME_PATH"];
  return candidate && existsSync(candidate) ? candidate : undefined;
}

export default defineConfig({
  testDir: "./",
  // Keep generated clean-room fixtures and Playwright output out of test
  // discovery. Playwright does not honor .gitignore when matching files.
  testMatch: ["*.e2e.ts"],
  testIgnore: ["**/.tmp-*/**", "**/test-results/**", "**/playwright-report/**"],
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  timeout: isCI ? 60_000 : 30_000,
  expect: { timeout: isCI ? 10_000 : 5_000 },
  reporter: "line",
  use: {
    baseURL,
    storageState: completedOnboardingStorageState,
    actionTimeout: isCI ? 20_000 : 10_000,
    navigationTimeout: isCI ? 30_000 : 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  // CI installs Chromium only. Keep the cross-browser matrix available for
  // local runs without making a clean CI checkout depend on extra browsers.
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: { executablePath: resolveChromiumExecutable() },
      },
    },
    ...(!isCI
      ? [
          { name: "firefox", use: { ...devices["Desktop Firefox"] } },
          { name: "webkit", use: { ...devices["Desktop Safari"] } },
          { name: "Mobile Chrome", use: { ...devices["Pixel 5"] } },
          { name: "Mobile Safari", use: { ...devices["iPhone 12"] } },
        ]
      : []),
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
  // retry mechanism.  We poll /healthz: registered before all middleware in
  // app.ts, so readiness checks respond in <1ms regardless of rate-limit or
  // CSRF state.  It returns 200 once the HTTP server is listening and the
  // server is ready to accept requests, before feed pollers fire. The separate
  // /health path belongs to the client-routed Health screen.
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
    url: "http://localhost:3001/healthz",
    reuseExistingServer: !isCI,
    timeout: 60 * 1000,
  },
});
