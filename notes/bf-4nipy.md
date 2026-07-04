---
name: webserver-startup-diagnostic
description: Diagnostic findings for Playwright webServer config, TEST_MODE handling, and health check readiness
metadata:
  type: project
---

# WebServer Startup & TEST_MODE Diagnostic

## 1. Current Timeout Setting

**File:** `tests/e2e/playwright.config.ts:60`
```typescript
timeout: 300 * 1000, // 300 seconds (5 minutes)
```

**Assessment:** 300s is generous. The comment documents the rationale: GTFS data loading, DB migrations, feed poller first poll, VAPID key generation, and OpenTelemetry initialization. However, there is NO `reuseExistingServer` optimization for CI runs — it's only enabled when NOT in CI:

```typescript
reuseExistingServer: !process.env.CI, // line 59
```

This means in CI, a fresh server starts for every Playwright run, incurring the full startup cost every time.

## 2. Health-Check URL

**ISSUE: The `webServer` block has NO `url` property for health checking.**

The `url` field is set to `http://localhost:3001` (line 58), but there is NO dedicated health-check URL. Playwright uses the `url` field for its built-in readiness check — it polls the root URL (`http://localhost:3001`) until it gets a response.

**Problem:** The server at `/` serves the React PWA static files from `packages/web/dist/`. If the web frontend hasn't been built (which it hasn't in the E2E test setup — there's no `npm run build` in the e2e package.json), the root URL will return a 404 or an error page, causing Playwright to wait until the full 300s timeout.

The `/api/health` endpoint exists (defined in `packages/server/src/app.ts:959`) and is referenced in a comment at line 62-64 of playwright.config.ts, but it is NOT wired into the Playwright `webServer.url` configuration. The comment says:
```
// Use the /api/health endpoint for health checks
// This endpoint returns 200 when the server is fully initialized
// and all subsystems (feeds, alerts, push) are ready
```

But `url` is still set to `http://localhost:3001`, NOT `http://localhost:3001/api/health`.

**Key endpoints available:**
| Endpoint | Path | File:Line | Returns 200 when... |
|----------|------|-----------|---------------------|
| Health API | `/api/health` | `app.ts:959` | Server is up (but may return 503 if ≥3 feeds failing) |
| Liveness | `livenessProbe` | `health.ts:310` | Always 200 if middleware is registered |
| Readiness | `createReadinessProbe` | `health.ts:322` | 200 if DB is connected |
| Startup | `createStartupProbe` | `health.ts:351` | 200 if startup complete |

**NOTE:** The `livenessProbe`, `readinessProbe`, and `startupProbe` are defined in `health.ts` but are **NOT registered as routes in `app.ts`**. They exist only as exported middleware factories but are never mounted on the Hono app. Only `/api/health` is wired up.

**The `/api/health` endpoint also has a potential issue:** It returns 503 when 3+ feeds are failing (line 976-979 of app.ts). During E2E tests, feeds haven't been polled yet, so `lastSuccessAt` will be null for all feeds — they'll show as "never_polled" (not "failing" since `consecutiveFailures` would be 0). So `/api/health` should return 200 at startup, making it safe to use.

## 3. TEST_MODE Handling

**Environment variable is passed via command prefix:**
```typescript
// playwright.config.ts:57
command: "cd ../.. && TEST_MODE=true npx tsx packages/server/src/index.ts",
```

TEST_MODE is set as an environment variable prefixing the tsx command. This works correctly — `TEST_MODE=true npx tsx ...` sets the env var for the subprocess.

**Effects of TEST_MODE=true in the server:**

| Location | File:Line | Effect |
|----------|-----------|--------|
| Rate limiter bypass | `rate-limiter.ts:69` | All rate limiting skipped (`testMode` flag checked) |
| Security validation skip | `security-startup.ts:47` | Entire security validation skipped |
| Delay predictor test mode | `index.ts:128-129` | `initDelayPredictorForTesting()` called instead of normal init |

**Potential issue:** TEST_MODE only disables rate limiting and security validation. It does NOT:
- Skip feed polling (pollers still start and try to reach MTA servers)
- Skip equipment polling
- Skip GTFS refresh scheduler
- Skip push pipeline initialization
- Reduce the startup timeout for any subsystem

## 4. Current Port Configuration

| Context | Port | File:Line |
|---------|------|-----------|
| Server (default) | 3001 | `packages/server/src/index.ts:58` — `const PORT = parseInt(process.env["PORT"] ?? "3001", 10)` |
| Web dev server | 3000 | `packages/web/vite.config.ts:423` |
| Playwright baseURL | 3001 | `tests/e2e/playwright.config.ts:18` |
| .env.example | 3001 | `.env.example:8` |

Port is configurable via `PORT` env var but defaults to 3001. The playwright command does NOT set `PORT`, so it uses the default 3001.

## 5. Existing Retry Mechanisms

**Playwright config retries:**
```typescript
// playwright.config.ts:14
retries: process.env.CI ? 2 : 0,
```
- 2 retries in CI, 0 locally
- Applies to test-level retries, NOT webServer startup retries

**Playwright webServer retries:**
- Playwright has a BUILT-IN retry mechanism for the `webServer.url` check — it polls the URL every ~1 second until the timeout (300s). This is the implicit retry.
- There is NO explicit `retries` field in the `webServer` block.

**Playwright worker configuration:**
```typescript
workers: process.env.CI ? 1 : undefined,
```
- Single worker in CI to avoid port conflicts
- Unlimited workers locally (could cause issues if multiple workers try to start servers)

## Summary of Issues for Parent Bead

### Critical
1. **`webServer.url` points to root `/`, not `/api/health`** — `playwright.config.ts:58`
   - Root serves static React PWA which may not exist in test environment
   - Should be `http://localhost:3001/api/health`
   - `/api/health` returns 200 at startup (feeds show "never_polled", not "failing")

### Moderate
2. **No dedicated startup/liveness endpoint** — `health.ts` defines `livenessProbe`, `createReadinessProbe`, and `createStartupProbe` but they're never mounted as routes in `app.ts`
   - Would provide a simpler, guaranteed-200 endpoint for Playwright to poll
   - `/api/health` depends on feed state (though safe in practice)

3. **`reuseExistingServer` disabled in CI** — `playwright.config.ts:59`
   - Forces fresh server start every CI run
   - Could enable in CI if port conflict handling is addressed

### Low
4. **TEST_MODE does not skip pollers** — `index.ts:203-209`
   - Feed/equipment pollers still start and attempt network requests in tests
   - Could add TEST_MODE checks to skip polling for faster startup

5. **No `webServer.retries` field** — while Playwright has built-in polling, an explicit retries count would make the config more self-documenting

### Files and Lines Requiring Modification

| File | Lines | Change |
|------|-------|--------|
| `tests/e2e/playwright.config.ts` | 58 | Change `url` from `http://localhost:3001` to `http://localhost:3001/api/health` |
| `tests/e2e/playwright.config.ts` | 57-64 | Optionally add `reuseExistingServer: true` for CI (with port conflict handling) |
| `packages/server/src/app.ts` | ~370-380 | Optionally register `livenessProbe` at `/api/healthz` for a simpler readiness endpoint |
| `packages/server/src/index.ts` | 203-209 | Optionally add TEST_MODE guards around poller starts |
