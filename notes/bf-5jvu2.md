# Verification of Health Endpoint Test Expectations

Bead: bf-5jvu2

## Summary

Verified all 4 remaining test expectations in `tests/e2e/health.e2e.ts` against the actual `/api/health` endpoint response in `packages/server/src/app.ts`. All test assertions are **correctly mapped** to the implementation.

---

## Test 2: "includes per-feed status for all 8 subway feeds" (lines 22-38)

### Test Assertions
- `body.feeds` is an `Array`
- `body.feeds.length >= 8`
- Feed IDs include: `gtfs`, `gtfs-ace`, `gtfs-bdfm`, `gtfs-g`, `gtfs-jz`, `gtfs-l`, `gtfs-nqrw`, `gtfs-si`

### Implementation (app.ts:1047-1069)
```typescript
feeds: feedStates.map((f) => ({
  id: f.id,
  name: f.name,
  // ... other fields
}))
```

### Source (packages/shared/src/constants/feeds.ts:45-94)
The `SUBWAY_FEEDS` constant defines exactly 8 feeds with the expected IDs:
- `gtfs` — A Division (1,2,3,4,5,6,7,S,GS)
- `gtfs-ace` — A/C/E Lines
- `gtfs-bdfm` — B/D/F/M Lines
- `gtfs-g` — G Line
- `gtfs-jz` — J/Z Lines
- `gtfs-l` — L Line
- `gtfs-nqrw` — N/Q/R/W Lines
- `gtfs-si` — Staten Island Railway

### Verdict: ✅ PASS
All assertions correctly map to the implementation.

---

## Test 3: "includes alerts status" (lines 40-48)

### Test Assertions
- `body.alerts` exists
- `body.alerts.count` exists
- `body.alerts.circuitOpen` exists
- `typeof body.alerts.circuitOpen === "boolean"`

### Implementation (app.ts:1070-1076)
```typescript
alerts: {
  count: alertsStatus.alertCount,
  lastSuccessAt: alertsStatus.lastSuccessAt,
  matchRate: alertsStatus.matchRate,
  consecutiveFailures: alertsStatus.consecutiveFailures,
  circuitOpen: alertsStatus.circuitOpen,  // boolean
  unmatchedCount: alertsStatus.unmatchedCount,
}
```

### Source
The `getAlertsStatus()` function returns an object with `circuitOpen` as a boolean field.

### Verdict: ✅ PASS
All assertions correctly map to the implementation.

---

## Test 4: "includes memory usage metrics" (lines 50-59)

### Test Assertions
- `body.memory` exists
- `body.memory.rssBytes > 0`
- `body.memory.heapUsedBytes > 0`

### Implementation (app.ts:1083-1087)
```typescript
memory: {
  rssBytes: memUsage.rss,
  heapUsedBytes: memUsage.heapUsed,
  heapTotalBytes: memUsage.heapTotal,
  externalBytes: memUsage.external,
}
```

### Source (line 1016)
```typescript
const memUsage = process.memoryUsage();
```

### Verdict: ✅ PASS
All assertions correctly map to the implementation. The `> 0` checks are appropriate since a running Node.js process will always have positive RSS and heap values.

---

## Test 5: "includes delay detector status" (lines 61-69)

### Test Assertions
- `body.delayDetector` exists
- `body.delayDetector.trackedTrips` exists
- `body.delayDetector.activeAlerts` exists
- `body.delayDetector.thresholdMultiplier` exists

### Implementation (app.ts:1078)
```typescript
delayDetector: getDelayDetectorStatus(),
```

### Source (packages/server/src/delay-detector.ts:705-717)
```typescript
export function getDelayDetectorStatus(): {
  trackedTrips: number;
  activeAlerts: number;
  thresholdMultiplier: number;
  minTrainsForLineAlert: number;
} {
  return {
    trackedTrips: trackedTrips.size,
    activeAlerts: activePredictedAlerts.size,
    thresholdMultiplier: config?.thresholdMultiplier ?? DEFAULT_THRESHOLD_MULTIPLIER,
    minTrainsForLineAlert: config?.minTrainsForLineAlert ?? DEFAULT_MIN_TRAINS_FOR_LINE_ALERT,
  };
}
```

### Verdict: ✅ PASS
All assertions correctly map to the implementation. The function returns an object with exactly the fields tested: `trackedTrips`, `activeAlerts`, and `thresholdMultiplier` (plus an additional `minTrainsForLineAlert` field not tested).

---

## Documentation Verification

The `/api/health` endpoint in app.ts (lines 907-1093) includes comprehensive JSDoc comments that document the response structure. The documented fields match the test expectations:

**Feeds array (lines 924-943):**
- Documented as `Array<FeedState>` with fields including `id` and `name`

**Alerts object (lines 944-950):**
- Documented with fields including `count` and `circuitOpen` (boolean)

**Memory object (lines 978-982):**
- Documented with fields including `rssBytes` and `heapUsedBytes`

**Delay detector object (lines 952-956):**
- Documented with fields including `trackedTrips`, `activeAlerts`, and `thresholdMultiplier`

---

## Conclusion

**No mismatches found.** All 4 test expectations (2-5) are correctly mapped to the `/api/health` endpoint implementation in `app.ts`. The tests validate:
1. Presence of exactly 8 subway feeds with correct IDs
2. Alerts subsystem status including circuit breaker state
3. Process memory usage metrics
4. Delay detector tracking and alert status

The implementation is well-documented and the tests accurately reflect the documented response structure.
