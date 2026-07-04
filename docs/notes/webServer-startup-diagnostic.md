# WebServer Startup & TEST_MODE Diagnostic

> Bead: bf-4nipy — purely diagnostic, no code changes.

## 1. Current Playwright webServer Configuration

**File:** `tests/e2e/playwright.config.ts` (lines 56–64)

```ts
webServer: {
  command: "cd ../.. && TEST_MODE=true npx tsx packages/server/src/index.ts",
  url: "http://localhost:3001",
  reuseExistingServer: !process.env.CI,
  timeout: 300 * 1000,
  // Use the /api/health endpoint for health checks
  // This endpoint returns 200 when the server is fully initialized
  // and all subsystems (feeds, alerts, push) are ready
},
```

### 1a. Timeout: **300 seconds (300,000 ms)**

The comment (lines 50–55) says this accounts for GTFS data loading, database migrations, feed poller first poll, VAPID key generation, and OpenTelemetry initialization. This is very generous — most of these steps complete in <10s locally, but in CI the full cold start may legitimately take longer.

### 1b. Health-check URL: **MISSING**

**This is a bug.** The comment on lines 61–64 says "Use the /api/health endpoint for health checks" but there is **no `healthCheckPath` property** in the webServer config. Playwright's `webServer.url` field is used for both the `baseURL` AND as the default health-check target — but it only checks for a TCP connection / HTTP 2xx response on that URL. Without an explicit `healthCheckPath`, Playwright probes `http://localhost:3001` (the root `/`), which serves the React PWA SPA (static files). That means Playwright considers the server "ready" as soon as the HTTP server starts listening — **before** GTFS data is loaded, **before** pollers fire, and **before** the health endpoint would report "ok".

The `url` field should either:
- Stay as `http://localhost:3001` (root) with the understanding that it's a basic TCP/listen check only, OR
- Be changed to `http://localhost:3001/api/health` to use the actual health endpoint as the readiness signal

There is a comment explicitly stating the intent to use `/api/health` but it was never wired up via the `healthCheckPath` property. Wait — Playwright's `webServer` config doesn't have a `healthCheckPath` property. It only has `url` which serves as both the baseURL template and the readiness probe. So the fix is to set `url` to `http://localhost:3001/api/health` and add a separate `baseURL` in the `use` block (which already exists as `http://localhost:3001`).

### 1c. TEST_MODE environment variable

Passed inline in the `command` string:
```
TEST_MODE=true npx tsx packages/server/src/index.ts
```

This correctly sets the env var for the server subprocess. The server reads it at `packages/server/src/index.ts:94`:
```ts
const testMode = process.env["TEST_MODE"] === "true";
```

**Effects of TEST_MODE=true:**
1. `setRateLimiterTestMode(true)` — disables all rate limiting (`packages/server/src/middleware/rate-limiter.ts:23-28`)
2. `initDelayPredictorForTesting()` — uses test data instead of real historical patterns (`packages/server/src/index.ts:128-130`)

**Note:** TEST_MODE does NOT skip any startup steps. The server still loads GTFS data, runs migrations, starts pollers, initializes OpenTelemetry, generates VAPID keys, etc. In TEST_MODE, the pollers still make real HTTP requests to MTA feeds. This means the server won't be "ready" until all that completes.

### 1d. Port configuration

The server reads `PORT` from the environment with a default of 3001:
```ts
const PORT = parseInt(process.env["PORT"] ?? "3001", 10);  // index.ts:58
```

The Playwright `command` does **not** set a `PORT` env var, so the server defaults to 3001. The `url` field matches at `http://localhost:3001`. This is correct but there's a **port conflict risk**: if a previous server instance is still running on 3001 (e.g., from a dev session), the new server will fail to bind and Playwright will hang until the 300s timeout.

`reuseExistingServer: !process.env.CI` partially mitigates this in local dev (it reuses the existing server) but in CI it always tries to start a fresh one. If a CI pod still has a stale process on 3001, tests will fail.

### 1e. Retry mechanisms

**Playwright level:**
- `retries: process.env.CI ? 2 : 0` (line 14) — retries failed **tests** 2 times in CI
- `workers: process.env.CI ? 1 : undefined` (line 15) — single worker in CI
- No `webServer.retry` or similar — Playwright will try once to start the server, wait up to `timeout`, then fail the entire test run if the URL doesn't respond

**Server level:** No retry mechanism in the server startup code. If `serve()` fails (e.g., port in use), the process exits.

## 2. Server Startup Sequence

**File:** `packages/server/src/index.ts` — `main()` function

```
1. initObservability()           — OTel tracing/metrics setup
2. validateSecurityOrThrow()    — Fail-fast on security config issues
3. configureEmailProvider()     — Email config (console/sendgrid/ses/smtp)
4. TEST_MODE check              — setRateLimiterTestMode, initDelayPredictorForTesting
5. Load GTFS static data        — 4 JSON files in parallel (stations, routes, complexes, transfers)
6. loadTravelTimes()            — Travel times JSON
7. initDelayDetector()           — Delay detector setup
8. initDelayPredictor()          — Historical pattern analysis
9. createApp()                  — Build Hono app with all routes
10. Push DB init + migrations   — SQLite push subscriptions DB
11. Security persistence         — API keys, rate limits, passwords from DB
12. startSessionCleanup()       — Background session expiry
13. VAPID keys + push pipeline  — Push notification setup
14. initTripTracking()          — Trip journal
15. initContextService()         — Context-aware switching
16. startGtfsRefreshScheduler() — Weekly GTFS refresh
17. serve()                     — HTTP server starts listening ← health endpoint available
18. initPoller() + startPoller() — GTFS-RT feed polling (fires immediately)
19. startAlertsPoller()         — Service alerts polling
20. startEquipmentPoller()      — Elevator/escalator outage polling
```

**Key insight:** Steps 1–16 all happen **before** the HTTP server starts (step 17). The `/api/health` endpoint is available immediately once `serve()` is called, but the feed/alerts data won't be populated until steps 18–20 complete (which happen asynchronously after `serve()`). This means:
- The health endpoint returns `status: "degraded"` immediately (feeds are "never_polled")
- It transitions to "ok" once the first poll succeeds

## 3. Health Endpoint Behavior

**File:** `packages/server/src/app.ts` (lines 959–1058)

The `/api/health` endpoint:
- Returns **200** with `status: "ok"` when all feeds are healthy and alerts are OK
- Returns **200** with `status: "degraded"` when some feeds are stale but <3 are failing
- Returns **503** when ≥3 feeds have been failing for >5 minutes
- Returns 200 with "degraded" on fresh startup (feeds show "never_polled")

The E2E test at `tests/e2e/health.e2e.ts` correctly accepts both 200 and 503:
```ts
expect([200, 503]).toContain(response.status());
expect(body.status).toMatch(/^(ok|degraded)$/);
```

## 4. Issues Identified for Parent Bead

### Issue A: No explicit health-check URL (webServer.url only checks root /)

**File:** `tests/e2e/playwright.config.ts:58`
**Problem:** The comment says to use `/api/health` but the `url` is `http://localhost:3001` (root). Playwright probes the root URL which returns the SPA shell as soon as `serve()` is called, bypassing the actual health check intent.
**Fix:** Change `url` to `http://localhost:3001/api/health`. The `baseURL` in `use` already handles test request routing at `http://localhost:3001`.

### Issue B: No PORT isolation for CI

**File:** `tests/e2e/playwright.config.ts:57` and `packages/server/src/index.ts:58`
**Problem:** The server defaults to port 3001 and Playwright doesn't set a unique port. If a stale process is on 3001 (especially in CI), the server fails to bind and tests hang for 300s.
**Fix:** Add `PORT=3001` (or a random port) to the webServer command, and update the `url` accordingly.

### Issue C: TEST_MODE doesn't skip real network calls

**File:** `packages/server/src/index.ts:94-98, 128-130, 203-209`
**Problem:** TEST_MODE only disables rate limiting and uses test data for the delay predictor. The feed pollers, alerts poller, and equipment poller still make real HTTP requests to MTA servers. In CI or offline environments, these will fail (though the server still starts and serves health checks).
**Fix:** Consider having TEST_MODE skip poller startup, or add a separate `SKIP_POLLERS=true` env var.

### Issue D: No graceful handling of port-in-use

**File:** `packages/server/src/index.ts:194`
**Problem:** `serve()` will throw if port is in use, crashing the process. No EADDRINUSE handling.
**Fix:** Add error handling around `serve()` that logs a clear message and exits with code 1.

## 5. Files Requiring Modification

| File | Lines | Change |
|------|-------|--------|
| `tests/e2e/playwright.config.ts` | 58 | Change `url` to include `/api/health` for proper readiness probing |
| `tests/e2e/playwright.config.ts` | 57 | Optionally add `PORT` to the command for CI isolation |
| `packages/server/src/index.ts` | 94-98 | Consider expanding TEST_MODE to skip pollers |
| `packages/server/src/index.ts` | 194 | Add port-in-use error handling around `serve()` |
