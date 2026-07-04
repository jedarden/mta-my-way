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
  // Increased timeout to 300s to account for:
  // - GTFS data loading and initialization
  // - Database migrations
  // - Feed poller first poll
  // - VAPID key generation
  // - OpenTelemetry initialization
  webServer: {
    command: "cd ../.. && TEST_MODE=true npx tsx packages/server/src/index.ts",
    url: "http://localhost:3001/health",
    reuseExistingServer: !process.env.CI,
    timeout: 300 * 1000,
    // Use the lightweight /health endpoint for readiness checks.
    // Returns 200 as soon as the HTTP server is listening and the database
    // is reachable (before feed pollers fire their first request).
  },
});
