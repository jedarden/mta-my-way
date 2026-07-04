# Bead bf-3mnj0: Fix reset in alerts-poller module

## Task
Add missing pollTimer state reset to the alerts-poller reset function referenced by cleanupAllState().

## Status: Already Completed

The work described in this bead was already completed in commit `35092c6` (2026-07-04 02:05:16 EDT), which was committed **1 minute before** this bead was created.

### Evidence:
- **Bead created**: 2026-07-04T06:06:39 UTC
- **Fix committed**: 2026-07-04 02:05:16 EDT (06:05:16 UTC)
- **Commit message**: "alerts-poller: clear pollTimer in resetAlertsCacheForTesting"

### Current Implementation
The `resetAlertsCacheForTesting()` function in `/home/coding/mta-my-way/packages/server/src/alerts-poller.ts` (lines 439-453) already includes the pollTimer reset:

```typescript
export function resetAlertsCacheForTesting(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;  // ← This is the fix that was requested
  }
  cache.alerts = [];
  cache.lastFetchAt = null;
  cache.lastSuccessAt = null;
  cache.matchRate = 0;
  cache.consecutiveFailures = 0;
  cache.circuitOpen = false;
  cache.circuitOpenAt = null;
  previousAlertIds.clear();
  changeListeners.length = 0;
}
```

The pollTimer state reset is properly implemented and is called by `cleanupAllState()` in the test helpers (line 464 of test-helpers.ts).

## Conclusion
No code changes needed. The fix is already in place.
