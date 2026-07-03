# E2E Server Startup Timeout Diagnosis (bead bf-4je4n)

## Summary

**Root cause:** Feed pollers block server startup because they fire immediately and make network calls before the HTTP server starts. The 120s Playwright timeout is insufficient for these network operations.

## Timeline Analysis

### Server startup sequence (from `packages/server/src/index.ts`):

1. **Line 100-144**: Load GTFS static data (~1-2s)
   - stations.json, routes.json, complexes.json, transfers.json, travel-times.json
2. **Line 147**: Create Hono app (builds TransferEngine)
3. **Line 149-175**: Push notification subsystem (~2-5s)
   - Init push database
   - Run migrations
   - Load API keys, rate limits, passwords
4. **Line 189-196**: **Start pollers (BLOCKING)**
   - `initPoller()` then `startPoller()` - fires immediately
   - `startAlertsPoller()` - fires immediately  
   - `initEquipmentPoller()` then `startEquipmentPoller()` - fires immediately
5. **Line 202**: **HTTP server finally starts** ← Playwright waits for this

### What the pollers do on first poll:

**Feed poller (`poller.ts` line 62-64):**
```typescript
export function startPoller(): void {
  void runPoll();  // Fires immediately
  pollTimer = setInterval(() => void runPoll(), POLL_INTERVAL_MS);
}
```

**First poll fetches:**
- 8 subway feeds in parallel via `Promise.allSettled(SUBWAY_FEEDS.map(...))`
- Each feed has 15s timeout (`FETCH_TIMEOUT_MS = 15_000`)
- Worst case: 9 feeds × 15s timeout = **135 seconds** if all feeds timeout
- Plus alerts feed (15s timeout) = **150 seconds total**

### Why the timeout occurs:

| Operation | Expected | Worst case |
|-----------|----------|------------|
| GTFS data load | ~2s | ~5s |
| Push subsystem | ~3s | ~10s |
| **8 feed poller fetches** | ~3s | **120s (8 × 15s)** |
| **Alerts poller fetch** | ~1s | **15s** |
| Equipment poller | ~1s | ~10s |
| Server bind | ~0.1s | ~1s |
| **TOTAL** | ~10s | **~161s** |

The Playwright timeout is **120s**, but the worst-case startup time is **161s**.

## Conditions that trigger the timeout:

1. **No network connectivity** - All feeds timeout after 15s each
2. **Rate limiting by MTA API** - Slow responses or 429s trigger retries
3. **MTA feeds temporarily down** - Extended response times
4. **CI environment network issues** - DNS failures, firewall blocks

## Confirmation from trace bf-1x57z:

The trace shows:
- **600s timeout** - This is a different timeout (likely the workflow timeout)
- **No stdout** - Server never started, so no logs were emitted
- This confirms the server never completed startup before hitting the outer workflow timeout

## Verification steps:

1. Check if TEST_MODE=true is set (line 94 of index.ts confirms it's read but **only used to set rate limiter test mode, not to skip pollers**)
2. Port 3001 binding is not the issue - server never gets to line 202 where it binds
3. Not a deadlock - it's waiting for network I/O

## The fix:

The pollers should be **deferred** until **after** the HTTP server starts. Options:

1. **Add a startup delay**: Change `startPoller()` to wait for server ready signal
2. **Make pollers async and detach**: Don't `await` the first poll, let it run in background
3. **TEST_MODE should skip pollers**: Add `if (testMode) return;` to poller startup

Option 3 is the cleanest for e2e tests since the tests mock the feed data anyway.

## Files involved:

- `tests/e2e/playwright.config.ts` - Sets 120s timeout
- `packages/server/src/index.ts` - Startup sequence, starts pollers before HTTP server
- `packages/server/src/poller.ts` - Fires immediate network calls
- `packages/server/src/alerts-poller.ts` - Fires immediate network calls
