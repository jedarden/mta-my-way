# TEST_MODE Environment Variable Flow

## Overview

This document traces the complete flow of the `TEST_MODE` environment variable from the Playwright configuration through server startup to its behavior modifications.

## Flow Trace

### 1. Playwright Configuration (tests/e2e/playwright.config.ts:57)

```typescript
command: "cd ../.. && TEST_MODE=true npx tsx packages/server/src/index.ts"
```

**Action**: Sets `TEST_MODE=true` as an environment variable for the server subprocess.

**Purpose**: Enables test mode for E2E tests, allowing tests to bypass rate limiting and security checks.

---

### 2. Server Entry Point (packages/server/src/index.ts:94)

```typescript
const testMode = process.env["TEST_MODE"] === "true";
```

**Action**: Reads the environment variable and converts it to a boolean.

**Line**: index.ts:94

---

### 3. Behavior Changes When TEST_MODE=true

#### A. Security Validation Skipped (index.ts:73 → security-startup.ts:44, 47-50)

```typescript
// index.ts:73
validateSecurityOrThrow();

// security-startup.ts:44
const isTest = process.env["TEST_MODE"] === "true";

// security-startup.ts:47-50
if (isTest) {
  logger.debug("Security validation skipped in test mode");
  return result;
}
```

**Files**: 
- Entry: `packages/server/src/index.ts:73`
- Implementation: `packages/server/src/security-startup.ts:44, 47-50`

**Effect**: Skips security validation checks including:
- ALLOWED_HOSTS validation (host header injection protection)
- PASSWORD_PEPPER validation
- VAPID keys validation

---

#### B. Rate Limiter Disabled (index.ts:96 → rate-limiter.ts:26-28, 69-72)

```typescript
// index.ts:96
setRateLimiterTestMode(true);

// rate-limiter.ts:26-28
export function setRateLimiterTestMode(enabled: boolean): void {
  testMode = enabled;
}

// rate-limiter.ts:69-72
export function rateLimiter(): MiddlewareHandler {
  return async (c, next) => {
    // Skip rate limiting in test mode
    if (testMode) {
      await next();
      return;
    }
    // ... normal rate limiting logic
  };
}
```

**Files**:
- Entry: `packages/server/src/index.ts:96`
- Implementation: `packages/server/src/middleware/rate-limiter.ts:26-28, 69-72`
- Applied at: `packages/server/src/app.ts:483` (`app.use("/api/*", rateLimiter())`)

**Effect**: Rate limiting middleware (60 req/min per IP) is completely bypassed for all API routes.

**Normal behavior**: Token bucket rate limiter tracks IP addresses and enforces 60 requests per minute.

**Test mode behavior**: All requests pass through immediately without tracking or limiting.

---

#### C. Delay Predictor Test Mode (index.ts:128-130 → delay-predictor.ts:796-804)

```typescript
// index.ts:128-130
if (testMode) {
  initDelayPredictorForTesting();
}

// delay-predictor.ts:796-804
export function initDelayPredictorForTesting(): void {
  config = {
    maxRecords: MAX_DELAY_RECORDS,
    minObservations: MIN_OBSERVATIONS_FOR_PREDICTION,
    persistencePath: "",
  };
  _travelTimes = {};
  stations = {};
}
```

**Files**:
- Entry: `packages/server/src/index.ts:128-130`
- Implementation: `packages/server/src/delay-predictor.ts:796-804`

**Effect**: Initializes delay predictor with empty/dummy state for testing.

**Normal behavior**: `initDelayPredictor()` is called with real travel times and station data.

**Test mode behavior**: Empty objects are used for `_travelTimes` and `stations`, and default config is set.

**Note**: After `initDelayPredictorForTesting()`, the normal `initDelayPredictor(travelTimes, stations)` is still called at line 131, which would overwrite the empty state. This suggests the test mode initialization may not be fully effective as intended.

---

#### D. Test Mode Logging (index.ts:98)

```typescript
if (testMode) {
  setRateLimiterTestMode(true);
  logger.info("Test mode enabled");
}
```

**File**: `packages/server/src/index.ts:98`

**Effect**: Logs "Test mode enabled" to the console/log output for debugging purposes.

---

## Summary of TEST_MODE Effects

| Component | Normal Behavior | TEST_MODE Behavior | File Reference |
|-----------|----------------|-------------------|----------------|
| Security validation | Validates ALLOWED_HOSTS, PASSWORD_PEPPER, VAPID keys | Skips all validation | security-startup.ts:47-50 |
| Rate limiting | 60 req/min per IP (token bucket) | Completely disabled | rate-limiter.ts:69-72 |
| Delay predictor | Initialized with real data | Empty/dummy state (then overwritten) | delay-predictor.ts:796-804 |
| Logging | Normal startup logs | Additional "Test mode enabled" log | index.ts:98 |

---

## Potential Issues

### Delay Predictor Test Mode Override May Be Ineffective

**Location**: index.ts:128-131

```typescript
if (testMode) {
  initDelayPredictorForTesting();  // Sets _travelTimes = {}, stations = {}
}
initDelayPredictor(travelTimes, stations);  // Overwrites with real data
```

**Issue**: The test mode initialization sets empty state, but the normal `initDelayPredictor()` is called immediately after, which overwrites the empty state with real data. This means the test mode initialization may not have its intended effect.

**Recommendation**: If test mode should use empty/dummy data, the normal initialization should be skipped:
```typescript
if (testMode) {
  initDelayPredictorForTesting();
} else {
  initDelayPredictor(travelTimes, stations);
}
```

---

## Environment Variable Propagation

No gaps identified in environment variable propagation:

1. Playwright spawns server subprocess with `TEST_MODE=true` in environment ✓
2. Node.js makes environment available via `process.env.TEST_MODE` ✓
3. Server reads `process.env["TEST_MODE"]` and parses as boolean ✓
4. Functions are called conditionally based on test mode ✓

---

## Related Test Files

The following test files also use or reference `TEST_MODE`:

- `packages/server/src/index.test.ts` - Tests TEST_MODE environment variable handling
- `packages/server/src/security-startup.test.ts` - Tests security validation skip in test mode
- `packages/server/src/middleware/rate-limiter.integration.test.ts` - Tests rate limiter with test mode toggling

---

## Completion Date

2026-07-03
