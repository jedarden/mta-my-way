# Consolidated E2E Diagnostics Summary

**Bead:** bf-4w67z — Summarize diagnostic findings and list required changes
**Date:** 2026-07-04
**Parent scope:** E2E test stabilization (bf-26qtz / bf-dw6k)

---

## 1. Current State

### Timeout
- **Playwright webServer timeout:** `300 * 1000` (300 seconds / 5 minutes)
- **File:** `tests/e2e/playwright.config.ts:60`
- **Actual startup time:** Likely <30s on local hardware; CI cold start may be longer but well under 300s
- **Risk:** A 5-minute timeout masks real hangs (e.g., `serve()` blocked on port conflict)

### Port Configuration
| Context | Port | Source |
|---------|------|--------|
| Code default | 3001 | `packages/server/src/index.ts:58` |
| Docker production | 3000 | `Dockerfile:63` |
| E2E tests | 3001 | `tests/e2e/playwright.config.ts:18,58` |
| Health check (Docker) | 3000 | `Dockerfile:72` |

### Health-Check Endpoints
| Endpoint | Type | File | Status |
|----------|------|------|--------|
| `GET /api/health` | JSON (machine-readable) | `packages/server/src/app.ts:959` | Active — returns 200 (ok/degraded) or 503 |
| `GET /status` | HTML (human dashboard) | `packages/server/src/app.ts:1063` | Active — returns 200/503, cached 30s |
| `GET /api/metrics` | Prometheus text | `packages/server/src/app.ts:1169` | Active |
| `livenessProbe` / `createReadinessProbe` / `createStartupProbe` | Middleware | `packages/server/src/endpoints/health.ts:310,322,351` | **UNUSED** — defined but not wired into app.ts |

### TEST_MODE Flow
```
playwright.config.ts:57  →  command: "TEST_MODE=true npx tsx packages/server/src/index.ts"
                                ↓
index.ts:94              →  const testMode = process.env["TEST_MODE"] === "true"
                                ↓
  ├── index.ts:96        →  setRateLimiterTestMode(true)        [rate-limiter.ts:26-28]
  ├── security-startup.ts:44-50  →  skips ALLOWED_HOSTS, PEPPER, VAPID validation
  ├── index.ts:129-130   →  initDelayPredictorForTesting()      [delay-predictor.ts:796-804]
  └── index.ts:97        →  logger.info("Test mode enabled")
```

**Source beads:** bf-43faa (playwright config), bf-5asym (TEST_MODE tracing), bf-56x43 (port/health catalog), bf-4nipy (webServer startup diagnostic)

### Retry Configuration
- **Test-level retries:** `process.env.CI ? 2 : 0` (playwright.config.ts:14)
- **Startup retries:** None — if webServer fails to start within 300s, the entire run aborts
- **reuseExistingServer:** `!process.env.CI` (playwright.config.ts:59) — true locally, false in CI

---

## 2. Issues Found

### Issue 1: Health-check URL not wired in Playwright config
- **Severity:** Medium
- **Source:** bf-43faa, bf-4nipy
- **File:** `tests/e2e/playwright.config.ts:58`
- **Problem:** The comment (lines 61–64) says "Use the /api/health endpoint for health checks" but `url` is set to `http://localhost:3001` (root `/`). Playwright's `webServer.url` doubles as the readiness probe — it polls the root, which serves the SPA `index.html` from static files as soon as `serve()` binds at index.ts:194. The server is considered "ready" before subsystems have initialized.
- **Impact:** Tests may start before the server is fully ready (DB migrated, security wired, VAPID keys loaded). The 300s timeout is a blunt workaround for a problem that proper health-check wiring would solve.
- **Note:** The health endpoint returns HTTP 200 with `"status": "degraded"` at startup (feeds show "never_polled" before the first poll completes). This is compatible with Playwright's readiness check (200 = ready), so changing `url` to include `/api/health` would work correctly.

### Issue 2: Excessive webServer timeout
- **Severity:** Low
- **Source:** bf-43faa, bf-4nipy
- **File:** `tests/e2e/playwright.config.ts:60`
- **Problem:** 300 seconds is far too generous. The actual startup sequence is sequential and blocking: GTFS load → DB migrations → security wiring → VAPID keys → `serve()`. On modern hardware this completes in <30s. The 300s timeout masks real hangs.
- **Impact:** A port conflict or I/O stall would waste 5 minutes before failing.

### Issue 3: Comment/intent mismatch on health check
- **Severity:** Low (documentation)
- **Source:** bf-43faa
- **File:** `tests/e2e/playwright.config.ts:61-64`
- **Problem:** Comments claim `/api/health` is used but it isn't. Misleading for future maintainers.

### Issue 4: No startup retry / port-in-use handling
- **Severity:** Medium
- **Source:** bf-43faa, bf-4nipy, bf-56x43
- **File:** `tests/e2e/playwright.config.ts:59` and `packages/server/src/index.ts:194`
- **Problem:** In CI (`reuseExistingServer: false`), Playwright always tries to start a fresh server. If a stale process holds port 3001, `serve()` throws EADDRINUSE and the test run hangs for the full 300s timeout. No EADDRINUSE handling in the server startup code.
- **Impact:** Flaky CI failures from port conflicts.

### Issue 5: Delay predictor test-mode override is overwritten
- **Severity:** Medium
- **Source:** bf-5asym
- **File:** `packages/server/src/index.ts:128-131`
- **Problem:** `initDelayPredictorForTesting()` sets `_travelTimes = {}` and `stations = {}`, but `initDelayPredictor(travelTimes, stations)` is called immediately after on line 131, overwriting the test-mode empty state with real data.
- **Impact:** The delay predictor test-mode initialization has no effect. Tests that rely on the predictor being in a clean/dummy state may get unexpected results.
- **Code:**
  ```ts
  // index.ts:128-131
  if (testMode) {
    initDelayPredictorForTesting();  // Sets empty state
  }
  initDelayPredictor(travelTimes, stations);  // OVERWRITES with real data!
  ```

### Issue 6: Unused health check middleware
- **Severity:** Low (dead code)
- **Source:** bf-56x43
- **File:** `packages/server/src/endpoints/health.ts`
- **Problem:** Defines `livenessProbe`, `createReadinessProbe`, `createStartupProbe`, and `createHealthCheck` but none are imported or used in `app.ts`. These could provide proper `/healthz`/`/ready` endpoints for container orchestration.
- **Impact:** No `/healthz` or `/ready` endpoints exist (confirmed by bf-56x43). Docker uses `curl -f http://localhost:3000/api/health` which works, but the unused middleware suggests this was once the intended approach.

### Issue 7: TEST_MODE doesn't skip network-dependent pollers
- **Severity:** Low (noted for awareness)
- **Source:** bf-4nipy
- **File:** `packages/server/src/index.ts:203-209`
- **Problem:** TEST_MODE disables rate limiting and uses test delay predictor data, but feed pollers, alerts poller, and equipment poller still make real HTTP requests to MTA servers. In offline or sandboxed CI environments, these will fail (though the server still starts and serves health checks since pollers run async after `serve()`).
- **Impact:** Network errors in poller logs during test runs; no functional test impact since pollers are async.

---

## 3. Proposed Changes

| # | Change | File(s) | Line(s) | Priority |
|---|--------|---------|---------|----------|
| 1 | Change `url` to `"http://localhost:3001/api/health"` for proper readiness probing | `tests/e2e/playwright.config.ts` | 58 | High |
| 2 | Reduce timeout from `300 * 1000` to `60 * 1000` (60s) | `tests/e2e/playwright.config.ts` | 60 | Medium |
| 3 | Update health-check comment to match actual wiring | `tests/e2e/playwright.config.ts` | 61–64 | Low |
| 4 | Wrap `initDelayPredictor` in `else` branch so test-mode initialization isn't overwritten | `packages/server/src/index.ts` | 128–131 | High |
| 5 | Add EADDRINUSE handling around `serve()` with clear error message and exit code 1 | `packages/server/src/index.ts` | 194 | Medium |
| 6 | Set `reuseExistingServer: true` in CI to recover from port conflicts | `tests/e2e/playwright.config.ts` | 59 | Medium |
| 7 | Consider adding `SKIP_POLLERS` env var for TEST_MODE (optional, low priority) | `packages/server/src/index.ts` | 203–209 | Low |
| 8 | Remove or wire unused health middleware in `endpoints/health.ts` | `packages/server/src/endpoints/health.ts` | 310–351 | Low (cleanup) |

---

## 4. Source Bead Index

| Bead | Title | Key Contribution |
|------|-------|-----------------|
| bf-43faa | Read and document playwright.config.ts webServer settings | Timeout (300s), port (3001), no health-check URL, reuseExistingServer, retry config |
| bf-5asym | Trace TEST_MODE environment variable through server startup | Full TEST_MODE flow, delay predictor override bug, security/rate-limiter skip behavior |
| bf-56x43 | Catalog port configuration and health-check endpoints | Port map (3001 code / 3000 Docker), all health endpoints, unused health middleware, CSRF exclusions |
| bf-4nipy | Diagnose webServer startup and TEST_MODE handling | Comment/intent mismatch, startup sequence timeline, network pollers in test mode, EADDRINUSE |
