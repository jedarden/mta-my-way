# Bead bf-44o8q: Push-DB Lazy/Best-Effort Startup Implementation Status

**Date:** 2026-08-03
**Status:** VERIFICATION COMPLETE - Implementation Already Exists

## Summary

This bead was created to implement ADR-001's incremental first step: make push-DB startup lazy/best-effort rather than a startup-blocking call. **Upon audit, the implementation is already complete and working as designed.**

## Current Implementation Status

### ✅ All Requirements Already Met

1. **Error Handling in `initPushDatabase()`** (packages/server/src/push/subscriptions.ts:44-93)
   - Function wrapped in try/catch block
   - Sets `pushDbReady = false` and `pushDbInitError` on failure
   - Logs error with clear message about degraded mode
   - Does NOT throw to top of index.ts

2. **Startup Continues in `index.ts`** (lines 170-227)
   - Calls `initPushDatabase()` within `if (!CORE_ONLY)` block
   - Checks `isPushDatabaseReady()` before proceeding with DB-dependent code
   - Logs warning when DB unavailable: "Push database unavailable — running in degraded mode"
   - HTTP server starts regardless of push DB status (line 234)
   - Feed pollers start after server is already listening (lines 242-249)

3. **Health Endpoint Reports Degraded Status** (packages/server/src/app.ts:990, 1075-1078)
   - Checks `isPushDatabaseReady()` 
   - Returns `pushDb: { ready: boolean, subscriptionCount: number }`
   - Overall status can be "ok" even when push DB is degraded (core feeds healthy)

4. **DB-Dependent Endpoints Return 503**
   - POST /api/push/subscribe (lines 1942-1951): Checks `isPushDatabaseReady()`, returns 503 with `{ degraded: true }`
   - DELETE /api/push/unsubscribe (lines 1990-1998): Same 503 handling
   - PATCH /api/push/subscription (lines 2037-2045): Same 503 handling  
   - POST /api/trips (lines 2088-2097): Checks `isPushDatabaseReady()`, returns 503 with `{ degraded: true }`

5. **Stateless Endpoints Continue Working**
   - /api/health, /api/arrivals/*, /api/stations, /api/routes, /api/alerts, /api/commute/analyze, static PWA assets
   - All work regardless of push DB status (verified by lack of `isPushDatabaseReady()` checks)

6. **Test Coverage Exists** (packages/server/src/index.test.ts:388-418)
   - Test: "should start in degraded mode when database fails to initialize"
   - Mocks `initPushDatabase` to throw error
   - Mocks `isPushDatabaseReady()` to return false
   - Asserts server doesn't throw and starts successfully

### ✅ Subsystems Verified Independent

**Password Reset:**
- Uses in-memory Map storage (password-reset.routes.ts:72)
- No dependency on `getPushDatabase()` or `isPushDatabaseReady()`
- Continues working in degraded mode (correct behavior)

**Session Management:**
- No dependency on push DB
- Uses separate initialization (middleware/concurrent-session-management.ts)
- Continues working in degraded mode

## Documentation Corrections Made

### Fixed `notes/bf-5jrvw.md`

Removed incorrect reference to `ALERT_HISTORY_PATH` environment variable (lines 282-283):

**Before:**
```yaml
- name: PUSH_DB_PATH
  value: "/data/subscriptions.db"
- name: ALERT_HISTORY_PATH
  value: "/data/alert_history.db"
```

**After:**
```yaml
- name: PUSH_DB_PATH
  value: "/data/subscriptions.db"
```

**Rationale:** There is only ONE SQLite database file in the implementation:
- `/data/subscriptions.db` stores: push subscriptions, trips, sessions, and all other DB-backed features
- No separate `alert_history.db` exists in the codebase
- Searched entire codebase: zero references to `ALERT_HISTORY_PATH` outside of this doc

## Verification Steps Performed

1. ✅ Read `subscriptions.ts` - confirmed try/catch in `initPushDatabase()`
2. ✅ Read `index.ts` - confirmed startup continues regardless of DB status  
3. ✅ Read `app.ts` - confirmed health endpoint reports push DB status
4. ✅ Grep-checked all DB-dependent endpoints - confirmed 503 handling
5. ✅ Verified password-reset independence - no push DB dependency
6. ✅ Verified session management independence - no push DB dependency
7. ✅ Checked test coverage - test exists for degraded mode startup
8. ✅ Fixed documentation error - removed `ALERT_HISTORY_PATH` reference

## Conclusion

**The implementation specified in ADR-001's "incremental first step" is already complete and working as designed.**

The codebase already:
- Catches DB initialization errors and logs them
- Continues startup regardless of DB availability
- Reports degraded status in health endpoint
- Returns 503 for DB-dependent endpoints
- Keeps stateless endpoints working
- Has test coverage for this scenario

The only issue found was a documentation error (reference to non-existent `alert_history.db`), which has been corrected.

## Recommendation

**CLOSE this bead as VERIFIED-COMPLETE.** No code changes are needed - the implementation already meets all acceptance criteria specified in the task description.

If further work is desired, consider:
1. Improving the degraded mode test to actually test with a real filesystem error (current test uses mocks)
2. Adding metrics/counters for how often the server starts in degraded mode
3. Adding alerting for degraded mode startups (currently only logged)

## References

- ADR-001: docs/plan/plan.md (lines 1718-1756)
- Implementation: packages/server/src/push/subscriptions.ts:44-93
- Test: packages/server/src/index.test.ts:388-418
- Documentation fix: notes/bf-5jrvw.md:282-283
