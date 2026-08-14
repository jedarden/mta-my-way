# Bead bf-44o8q: Push-DB Lazy/Best-Effort Initialization

## Status: VERIFIED COMPLETE ✅

## Summary

The lazy/best-effort initialization for the push database has already been fully implemented. The bead description claimed "This has NOT been done," but verification confirms all requirements are met.

## Implementation Verified

### 1. ✅ initPushDatabase() wraps DB open in try-catch
**Location:** `packages/server/src/push/subscriptions.ts` lines 44-93

The function catches errors, sets `pushDbReady = false`, and logs a warning without throwing.

### 2. ✅ Server continues starting when DB fails
**Location:** `packages/server/src/index.ts` lines 169-226

After calling `initPushDatabase()`, the code checks `isPushDatabaseReady()` before proceeding with migrations and DB-dependent services.

### 3. ✅ DB-dependent endpoints return 503
**Location:** `packages/server/src/app.ts` lines 2027-2035, 2098-2107, 2170-2178, 2248-2256

All DB-dependent endpoints (`/api/push/subscribe`, `/api/push/unsubscribe`, `/api/push/subscription`, `/api/trips`) check `isPushDatabaseReady()` and return 503 with `degraded: true` when unavailable.

### 4. ✅ /api/health reports push DB subsystem status
**Location:** `packages/server/src/app.ts` lines 1129-1132

Health endpoint includes:
```json
"pushDb": {
  "ready": false,
  "subscriptionCount": 0
}
```

### 5. ✅ Test exists for DB failure scenario
**Location:** `packages/server/src/index.test.ts` lines 386-470

Test "should start successfully even when push database fails to initialize" verifies server starts without throwing.

### 6. ✅ No alert_history.db references to correct
Searched entire codebase - no references to `ALERT_HISTORY_PATH` or separate alert history DB found.

## Verification Tests Run

### Test 1: Direct function call
```bash
node -e "
const { initPushDatabase, isPushDatabaseReady } = require('./packages/server/dist/push/subscriptions.js');
initPushDatabase('/nonexistent/path/subscriptions.db');
console.log('isPushDatabaseReady:', isPushDatabaseReady());
"
```
**Result:** ✅ Returns `false`, logs error, does not throw

### Test 2: Unit tests
```bash
npm test -- packages/server/src/index.test.ts
```
**Result:** ✅ All 3 tests pass including DB failure test

## Conclusion

All acceptance criteria for ADR-001's "incremental first step" have been met. The implementation correctly isolates the read-only core path from persistent-volume-backed state.
