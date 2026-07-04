# WebServer Startup & TEST_MODE Diagnostic

Diagnostic findings for E2E test webServer configuration.

## Files Examined

| File | Lines | Relevance |
|------|-------|-----------|
| `tests/e2e/playwright.config.ts` | 56–64 | webServer config |
| `packages/server/src/index.ts` | 58, 68–232 | Server entry, TEST_MODE, startup sequence |
| `packages/server/src/app.ts` | 959–1058 | `/api/health` endpoint |
| `packages/server/src/app.ts` | 2984–2995 | Root URL handler (static files) |
| `packages/server/src/security-startup.ts` | 44–49 | TEST_MODE skips security validation |
| `packages/server/src/middleware/rate-limiter.ts` | 23–28 | TEST_MODE disables rate limiting |

## Finding 1: Health-check URL is NOT configured for Playwright

**playwright.config.ts:58** sets `url: "http://localhost:3001"` — this polls the **root URL**, not `/api/health`.

The root serves static files from `packages/web/dist/` (app.ts:2984–2995). When the HTTP server starts (index.ts:194), the root responds with the SPA `index.html` immediately — even before any pollers run. This means Playwright sees the server as "ready" the moment `serve()` binds, regardless of whether subsystems (feeds, alerts, push) have initialized.

The comment on line 63 says "Use the /api/health endpoint" but no `healthCheck` path or different URL is actually wired up. Playwright's `webServer` has no separate `healthCheck` property — the `url` IS the readiness check.

**Issue:** Playwright may start tests before the server is fully ready (feeds loaded, DB migrated). The 300s timeout is a blunt workaround — Playwright doesn't actually use `/api/health` to detect readiness.

**Fix:** Change `url` to `"http://localhost:3001/api/health"` so Playwright polls the real health endpoint. This requires the health endpoint to return 200 at startup.

## Finding 2: Health endpoint returns "degraded" at startup

**app.ts:965–979** — The `/api/health` endpoint checks:
```ts
const allFeedsOk = feedStates.every(
  (f) => f.circuitOpenAt === null && f.lastSuccessAt !== null && !f.isStale
);
```

At startup, before any poller completes its first poll, ALL feeds have `lastSuccessAt === null`. So:
- `allFeedsOk` = `false`
- `status` = `"degraded"` (not `"ok"`)
- HTTP status = **200** (because `unhealthy` requires 3+ feeds failing for >5 minutes)

**Net result:** `/api/health` returns HTTP 200 with `"status": "degraded"` at startup. This is compatible with Playwright's readiness check (HTTP 200 = ready). **This is actually fine for readiness detection** — the server returns 200 as soon as the HTTP server is listening, which happens before pollers start.

**However:** if the root URL is used instead (current behavior), Playwright gets a 200 even earlier. The only risk: if `serve()` succeeds but `createApp()` hasn't finished (unlikely given the sequential flow).

## Finding 3: TEST_MODE environment variable handling

**playwright.config.ts:57** — `command: "cd ../.. && TEST_MODE=true npx tsx packages/server/src/index.ts"`

TEST_MODE is set via environment variable prefix in the shell command. This is the standard approach.

**index.ts:94–98** — TEST_MODE effects:
1. `setRateLimiterTestMode(true)` — disables rate limiting (rate-limiter.ts:26–28)
2. Logs `"Test mode enabled"`
3. `initDelayPredictorForTesting()` — uses lightweight predictor instead of full model (index.ts:128–130)

**security-startup.ts:44–49** — TEST_MODE effects:
4. Skips all security validation (ALLOWED_HOSTS, CSP, etc.)

**These are all appropriate for E2E tests.**

## Finding 4: Timeout configuration

**playwright.config.ts:60** — `timeout: 300 * 1000` (5 minutes)

This is generous but necessary because:
- GTFS data loading (~4 JSON files)
- Database migrations (subscriptions.db)
- VAPID key generation
- OpenTelemetry initialization

**Actual startup time is likely <30 seconds** on this hardware — the 5-minute timeout is excessive. It would mask real hangs (e.g., if `loadOrGenerateVapidKeys` blocks on a disk I/O issue).

**Fix:** Reduce to `30 * 1000` (30s) after wiring up `/api/health` as the readiness URL. If the health endpoint returns 200 immediately when `serve()` binds, Playwright won't need long timeouts.

## Finding 5: No retry mechanism on webServer startup

**playwright.config.ts:14** — Test-level retries (`retries: process.env.CI ? 2 : 0`) apply to individual test files, NOT to the webServer startup.

If the server fails to start within the timeout, Playwright aborts the entire test run — no retry. The `reuseExistingServer: !process.env.CI` (line 59) means in CI, it always starts fresh (no reuse).

**Issue:** A flaky startup (e.g., port in use from previous run) would fail the entire E2E suite without retry.

**Fix:** Consider `reuseExistingServer: true` in CI to recover from port conflicts, or add startup-level retries.

## Finding 6: Port configuration

**index.ts:58** — `const PORT = parseInt(process.env["PORT"] ?? "3001", 10);`

**playwright.config.ts:18,58** — `baseURL: "http://localhost:3001"` and `url: "http://localhost:3001"`

Hardcoded to 3001. No `PORT` environment variable is set in the Playwright webServer command.

**Issue:** If another process uses port 3001, the server fails to bind and tests abort.

**Fix:** Not critical for E2E (single server), but could use `PORT=3001` explicitly in the command for clarity.

## Finding 7: Startup sequence and readiness

**index.ts:192–209** — The HTTP server starts at line 194 (`serve()`), **before** pollers start at lines 203–209. The comment says "start BEFORE pollers so health endpoint responds immediately."

**Readiness timeline:**
1. GTFS data loaded (line 114–138)
2. Push DB initialized + migrations (line 150–167)
3. Security, rate limits, passwords, sessions wired (line 170–177)
4. VAPID keys + push pipeline started (line 179–182)
5. Trip tracking, context service initialized (line 185–187)
6. **HTTP server starts** ← `serve()` at line 194
7. Pollers start in background (lines 203–209)

Steps 1–5 are all synchronous (blocking `await`). The HTTP server doesn't start until all of them complete. This means by the time Playwright can connect, the server is fully initialized except for the first feed poll.

## Summary of Changes Needed

| # | Issue | File | Line(s) | Change |
|---|-------|------|---------|--------|
| 1 | Health-check URL not wired | `tests/e2e/playwright.config.ts` | 58 | Change `url` to `"http://localhost:3001/api/health"` |
| 2 | Excessive timeout | `tests/e2e/playwright.config.ts` | 60 | Reduce from `300 * 1000` to `30 * 1000` |
| 3 | Comment mismatch | `tests/e2e/playwright.config.ts` | 61–63 | Update comment to match actual behavior |
| 4 | No startup retry | `tests/e2e/playwright.config.ts` | 59 | Consider `reuseExistingServer: true` |
