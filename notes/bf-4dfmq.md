# E2E Test Server Configuration Stabilization

**Bead:** bf-4dfmq
**Date:** 2026-07-04
**Related:** bf-4je4n (diagnosis)

## Summary

Successfully stabilized the e2e test server configuration in playwright.config.ts by reducing the timeout from 300s to 60s and updating documentation to reflect the actual server startup sequence.

## Changes Made

### 1. Reduced Timeout (300s → 60s)
- **File:** `tests/e2e/playwright.config.ts`
- **Change:** Reduced `webServer.timeout` from `300 * 1000` to `60 * 1000`
- **Rationale:** Server now starts in ~1 second since HTTP server starts before pollers (fixed in bf-4je4n)

### 2. Updated Documentation
- **Clarified server startup sequence** to reflect that HTTP server starts BEFORE feed pollers
- **Updated timeout breakdown** to show realistic timing estimates (~1-2s total vs previous 60s+ estimates)
- **Improved readability** of startup sequence documentation

## Verification Results

### Server Startup Timing
- ✅ **Health endpoint responded in 1 second** (previous: 60s+ or timeout)
- ✅ **Port conflict detection working** (check-port.ts)
- ✅ **No startup failures**

### TEST_MODE Propagation
- ✅ **TEST_MODE=true properly propagated** to server subprocess
- ✅ **Rate limiter bypassed** (verified with 10 rapid requests)
- ✅ **"Test mode enabled" logged** in server output

### Stability Testing (3 Consecutive Runs)
- ✅ **Run 1:** 30 passed (5.8s)
- ✅ **Run 2:** 30 passed (5.8s)
- ✅ **Run 3:** 30 passed (5.9s)

## Root Cause Resolution

The original issue (diagnosed in bf-4je4n) was that the HTTP server started AFTER feed pollers completed, causing 60s+ delays. This was fixed by moving the `serve()` call before poller initialization in `packages/server/src/index.ts`.

The playwright config updates in this bead simply:
1. Reduced timeout to match actual startup time
2. Updated docs to reflect the fix
3. Verified stable operation

## Configuration Details

**Current webServer config:**
```typescript
webServer: {
  command: "npx tsx helpers/check-port.ts && cd ../.. && npx tsx packages/server/src/index.ts",
  env: {
    TEST_MODE: "true",
  },
  url: "http://localhost:3001/health",
  reuseExistingServer: !process.env.CI,
  timeout: 60 * 1000,  // Reduced from 300s
}
```

**Key features:**
- Port conflict detection before startup
- TEST_MODE propagation for rate limiter bypass
- Health endpoint polling (registered before middleware)
- Server reuse for local development, fresh server for CI
- Realistic timeout based on actual startup time

## Acceptance Criteria Met

- ✅ Server starts and responds within configured timeout on 3+ consecutive runs
- ✅ TEST_MODE confirmed active (rate limiter bypassed)
- ✅ No port conflicts during test execution

## Recommendations

The configuration is now stable and efficient. No further changes needed unless server startup time increases significantly in the future.
