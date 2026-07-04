# Diagnostic Summary — Bead bf-4w67z

**Task**: Summarize diagnostic findings and list required changes  
**Date**: 2026-07-04  
**Parent Bead**: bf-4w67z  

## Overview

This summary consolidates findings from three diagnostic child beads:
- **bf-43faa**: Playwright webServer settings (playwright config)
- **bf-5asym**: TEST_MODE environment variable tracing (TEST_MODE tracing)
- **bf-56x43**: Port configuration and health-check endpoints (port/health catalog)

## Current State

### Timeout Configuration
- **Playwright webServer timeout**: `300 * 1000` (300 seconds / 5 minutes)
- **Location**: `tests/e2e/playwright.config.ts:60`
- **Purpose**: Accounts for GTFS data loading, migrations, feed poller, VAPID key generation, and OpenTelemetry initialization

### Port Configuration
| Context | Port | Source |
|---------|------|--------|
| Code default | 3001 | `packages/server/src/index.ts:58` |
| Docker production | 3000 | `Dockerfile:63` |
| E2E tests | 3001 | `tests/e2e/playwright.config.ts:58` (implicit from baseURL) |
| Health check | 3000 | `Dockerfile:72` |

### Health-Check Endpoints
- **Primary**: `GET /api/health` (JSON) - `packages/server/src/app.ts:959`
- **Dashboard**: `GET /status` (HTML) - `packages/server/src/app.ts:1063`
- **Metrics**: `GET /api/metrics` (Prometheus) - `packages/server/src/app.ts:1169`
- **Unused middleware**: `packages/server/src/endpoints/health.ts` (defined but not imported)

### TEST_MODE Flow
1. **Set**: `tests/e2e/playwright.config.ts:57` - `TEST_MODE=true` in server command
2. **Read**: `packages/server/src/index.ts:94` - `process.env["TEST_MODE"] === "true"`
3. **Effects**:
   - Security validation skipped (`security-startup.ts:47-50`)
   - Rate limiter disabled (`rate-limiter.ts:69-72`)
   - Delay predictor test mode initialization (`index.ts:128-131`)

### Retry Configuration
- **Test-level retries**: `retries: process.env.CI ? 2 : 0` (playwright.config.ts:14)
- **webServer-level**: No retry settings at webServer level

## Issues Found

### Issue 1: Delay Predictor Test Mode Ineffective
**Source**: bf-5asym (TEST_MODE tracing)  
**Severity**: High  
**Location**: `packages/server/src/index.ts:128-131`

```typescript
if (testMode) {
  initDelayPredictorForTesting();  // Sets _travelTimes = {}, stations = {}
}
initDelayPredictor(travelTimes, stations);  // Overwrites with real data
```

**Problem**: The test mode initialization sets empty state, but the normal `initDelayPredictor()` is called immediately after, which overwrites the empty state with real data. This means the test mode initialization does not have its intended effect.

**Impact**: Tests may use real data instead of empty/dummy data, potentially making tests less deterministic or slower than intended.

---

### Issue 2: Port Mismatch Between Code and Docker
**Source**: bf-56x43 (port/health catalog)  
**Severity**: Medium  
**Locations**: 
- Code: `packages/server/src/index.ts:58`
- Docker: `Dockerfile:63`

**Problem**: The code defaults to port 3001, but Docker production overrides this to 3000. This creates inconsistency that could cause confusion or issues in local development vs. production.

**Impact**: Developers running locally without Docker will use port 3001, while production uses 3000. Documentation should clearly reflect this difference.

---

### Issue 3: Unused Health Check Middleware
**Source**: bf-56x43 (port/health catalog)  
**Severity**: Low  
**Location**: `packages/server/src/endpoints/health.ts`

**Problem**: A complete health check middleware module exists with `livenessProbe`, `createReadinessProbe`, `createStartupProbe`, and `createHealthCheck` functions, but it is not imported or used in the application. The health endpoint at `/api/health` is implemented directly in `app.ts` instead.

**Impact**: 
- Code duplication and maintenance burden
- Unused code increases codebase surface
- Confusion about which health check implementation is canonical

---

### Issue 4: No Retry Logic at webServer Level
**Source**: bf-43faa (playwright config)  
**Severity**: Low  
**Location**: `tests/e2e/playwright.config.ts:56-64`

**Problem**: Retry settings are configured at the test level (2 retries in CI, 0 locally), but there is no retry configuration at the webServer level. If the webServer health check fails, Playwright does not retry starting the server.

**Impact**: If the server fails to start or becomes unhealthy during test initialization, tests will fail immediately without retrying server startup.

---

### Issue 5: Long Server Startup Timeout
**Source**: bf-43faa (playwright config)  
**Severity**: Low  
**Location**: `tests/e2e/playwright.config.ts:60`

**Problem**: The webServer timeout is set to 300 seconds (5 minutes). While this accounts for GTFS data loading, migrations, feed poller, VAPID key generation, and OpenTelemetry initialization, it is quite long for test feedback loops.

**Impact**: Slows down test feedback loops. If the server is truly hung, tests will wait 5 minutes before failing.

---

## Required Changes

### Change 1: Fix Delay Predictor Test Mode Logic
**File**: `packages/server/src/index.ts`  
**Lines**: 128-131

**Current Code**:
```typescript
if (testMode) {
  initDelayPredictorForTesting();
}
initDelayPredictor(travelTimes, stations);
```

**Proposed Change**:
```typescript
if (testMode) {
  initDelayPredictorForTesting();
} else {
  initDelayPredictor(travelTimes, stations);
}
```

**Rationale**: Ensures test mode uses empty/dummy data and production mode uses real data, without overwriting the test mode initialization.

---

### Change 2: Document Port Difference or Standardize
**File**: `.env.example`  
**Lines**: 8

**Current Documentation**:
```
PORT=3001  # Port number for the HTTP server (default: 3001)
```

**Proposed Documentation**:
```
PORT=3001  # Port number for the HTTP server (default: 3001; Docker uses 3000)
```

**Alternative**: Standardize on a single port by changing either the code default or Docker PORT environment variable.

**Rationale**: Makes the port difference explicit to developers, reducing confusion.

---

### Change 3: Remove or Integrate Unused Health Middleware
**File**: `packages/server/src/endpoints/health.ts`  
**Action**: Either:
1. Delete the unused middleware file, OR
2. Refactor `/api/health` in `app.ts` to use the middleware from `health.ts`

**Rationale**: Eliminates code duplication and clarifies the canonical health check implementation.

---

### Change 4: Add webServer Retry Logic
**File**: `tests/e2e/playwright.config.ts`  
**Lines**: 56-64

**Current Configuration**:
```typescript
webServer: {
  command: "cd ../.. && TEST_MODE=true npx tsx packages/server/src/index.ts",
  url: "http://localhost:3001",
  reuseExistingServer: !process.env.CI,
  timeout: 300 * 1000,
  stdout: "pipe",
  stderr: "pipe",
  healthCheck: {
    url: "http://localhost:3001/api/health",
    retries: 2, // Existing retry on health check URL
  },
},
```

**Note**: The `healthCheck retries: 2` already exists (documented in child bead). This issue may be resolved by documentation, or additional webServer-level retry configuration may be needed.

**Rationale**: Ensures server startup can recover from transient failures.

---

### Change 5: Consider Reducing Server Startup Timeout
**File**: `tests/e2e/playwright.config.ts`  
**Line**: 60

**Current Value**: `300 * 1000` (300 seconds)

**Proposed Value**: Evaluate whether a shorter timeout (e.g., 180 seconds) is sufficient after optimizing startup.

**Rationale**: Improves test feedback loops. Should be evaluated after understanding what contributes to the 5-minute startup time.

---

## Summary of Issues

| Issue | Source Bead | Severity | File | Lines |
|-------|-------------|----------|------|-------|
| Delay predictor test mode ineffective | bf-5asym | High | packages/server/src/index.ts | 128-131 |
| Port mismatch code vs Docker | bf-56x43 | Medium | packages/server/src/index.ts, Dockerfile | 58, 63 |
| Unused health middleware | bf-56x43 | Low | packages/server/src/endpoints/health.ts | All |
| No webServer retry logic | bf-43faa | Low | tests/e2e/playwright.config.ts | 56-64 |
| Long server startup timeout | bf-43faa | Low | tests/e2e/playwright.config.ts | 60 |

## Next Steps

1. **High priority**: Fix delay predictor test mode logic (Change 1)
2. **Medium priority**: Document port difference (Change 2)
3. **Low priority**: Address unused health middleware (Change 3)
4. **Investigation needed**: Evaluate server startup time to determine if timeout can be reduced (Change 5)

## Child Bead References

- **bf-43faa**: Playwright webServer settings — `/home/coding/mta-my-way/notes/bf-43faa.md`
- **bf-5asym**: TEST_MODE environment variable flow — `/home/coding/mta-my-way/notes/bf-5asym.md`
- **bf-56x43**: Port configuration and health-check endpoints — `/home/coding/mta-my-way/notes/bf-56x43.md`
