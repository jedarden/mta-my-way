# E2E Server Startup Timeout - Root Cause Analysis

**Bead:** bf-4je4n
**Date:** 2026-07-03
**Trace:** bf-1x57z (600s timeout, no stdout)

## Problem Summary

The e2e test server times out during startup because the **feed pollers fire immediately** and block the HTTP server from starting until all network calls complete.

## Root Cause

The server startup sequence in `packages/server/src/index.ts` is:

1. **Load static GTFS data** (~1-2 seconds)
2. **Run migrations** (~1 second)
3. **Start pollers** - **ALL FIRE IMMEDIATELY**:
   - `startPoller()` - fetches 8 MTA GTFS-RT feeds (line 191)
   - `startAlertsPoller()` - fetches alerts feed (line 192)
   - `startEquipmentPoller()` - fetches equipment feed (line 196)
4. **Start HTTP server** (line 202)

The critical issue: **The HTTP server doesn't start listening until after all three pollers complete their first poll.**

### Poller Implementation Details

All three pollers use the same pattern - they fire immediately on startup:

1. **Feed poller** (`packages/server/src/poller.ts`):
   ```typescript
   export function startPoller(): void {
     void runPoll();  // Fires immediately!
     pollTimer = setInterval(() => void runPoll(), POLL_INTERVAL_MS);
   }
   ```
   - Fetches 8 feeds in parallel (Promise.allSettled)
   - Each feed: 15s timeout, 4 retry attempts (500ms, 1s, 2s delays)
   - Worst case: ~60s per feed if all retries fail
   - With 8 feeds in parallel: could take 15-60s depending on network conditions

2. **Alerts poller** (`packages/server/src/alerts-poller.ts`):
   - 15s timeout
   - Fetches single MTA alerts feed
   - Could take 15s if slow/timeout

3. **Equipment poller** (`packages/server/src/equipment-poller.ts`):
   - 15s timeout
   - Fetches MTA ENE XML feed
   - Could take 15s if slow/timeout

### Why This Exceeds 120s Playwright Timeout

With all three pollers firing sequentially (not truly parallel - they're started sequentially in the code):

- **Best case:** All feeds respond quickly (~5-10s total) - server starts within 15s
- **Typical case:** Some feeds slow, one or two timeouts (~30-60s total)
- **Worst case:** Network issues, MTA feeds slow/down, retries hit max delays (>120s)

The trace bf-1x57z shows 600s total timeout, suggesting the agent/system timeout fired before playwright even gave up.

## Solutions

### Option 1: Start HTTP Server Before Pollers (Recommended)

Move the `serve()` call to BEFORE starting pollers:

```typescript
// Start HTTP server first
serve({ fetch: app.fetch, port: PORT }, (info) => {
  logger.info("Server started", {
    port: info.port,
    pid: process.pid,
    uptime: 0,
  });
});

// THEN start pollers (fire immediately but server is already listening)
initPoller(stations, routes);
startPoller();
startAlertsPoller();
```

**Pros:**
- Server accepts connections immediately
- Health endpoint returns quickly
- Simple change, no logic modification
- Playwright webServer waits for HTTP connection, not poll completion

**Cons:**
- First health check may show "no data yet" (feeds still loading)
- Need to handle this gracefully in health endpoint

### Option 2: Delay First Poll in E2E Mode

Add environment variable to skip first poll:

```typescript
const skipFirstPoll = process.env["SKIP_FIRST_POLL"] === "true";

export function startPoller(): void {
  if (skipFirstPoll) {
    pollTimer = setInterval(() => void runPoll(), POLL_INTERVAL_MS);
  } else {
    void runPoll();
    pollTimer = setInterval(() => void runPoll(), POLL_INTERVAL_MS);
  }
}
```

Then update playwright config:
```typescript
command: "cd ../.. && TEST_MODE=true SKIP_FIRST_POLL=true npx tsx packages/server/src/index.ts"
```

**Pros:**
- Server starts immediately (<5s)
- Predictable startup time
- No race conditions

**Cons:**
- Need to propagate SKIP_FIRST_POLL to all three pollers
- Health endpoint shows stale/uninitialized data for first 30-60s
- More code changes

### Option 3: Increase Playwright Timeout

Simply increase the webServer timeout:

```typescript
webServer: {
  timeout: 180 * 1000,  // 3 minutes
}
```

**Pros:**
- No code changes needed
- Works if this is just a network blip

**Cons:**
- Doesn't fix the underlying issue
- Makes tests slower (always wait 180s on actual failures)
- Not scalable if startup gets even slower

## Recommendation

**Implement Option 1** - Start the HTTP server before the pollers. This is the cleanest solution that maintains the current behavior (first poll fires immediately) while allowing the server to accept connections right away.

The health endpoint already handles "no data yet" gracefully by showing feed ages - it would just show "no data" for the first few seconds while polls complete.

## Additional Findings

- **Port 3001 conflicts:** Checked - no conflicts found, this is not the issue
- **TEST_MODE propagation:** Correctly set in playwright config, no issue
- **GTFS data load:** Fast (~1-2s), not the bottleneck
- **Migrations:** Fast (~1s), not the bottleneck
- **The bottleneck is strictly the network calls to MTA feeds**

## Test Verification

To verify the fix works:
1. Implement Option 1
2. Run `cd tests/e2e && npm run test health.e2e.ts`
3. Server should start within 5-10s (HTTP listening, not poll completion)
4. Health endpoint should return 200 within playwright timeout
