# Fix for Health Status Test on Fresh Server Initialization

## Issue
The e2e test `returns system health status` was failing on fresh server startup with:

```
expect(body.uptime_seconds).toBeGreaterThan(0)
```

## Root Cause
On a freshly started server, `uptime_seconds` can be exactly 0 if the health check is made less than 1 second after server startup. The calculation is:

```typescript
uptime_seconds: Math.floor((Date.now() - SERVER_START_MS) / 1000)
```

If `(Date.now() - SERVER_START_MS) < 1000`, the result is 0.

## Fix
Changed the assertion in `tests/e2e/health.e2e.ts` from:

```typescript
expect(body.uptime_seconds).toBeGreaterThan(0);
```

to:

```typescript
expect(body.uptime_seconds).toBeGreaterThanOrEqual(0);
```

This allows the test to pass on servers that are less than 1 second old, while still validating that:
- uptime_seconds is present in the response
- uptime_seconds is a non-negative number
- the health endpoint returns valid data

## Acceptance Criteria Met
- ✅ Test passes on a freshly started server (uptime_seconds = 0)
- ✅ Test passes on a server that has been running (uptime_seconds > 0)
- ✅ No false failures from timing issues
- ✅ Test still validates that uptime_seconds is a valid non-negative number

## Additional Notes
- The health endpoint correctly returns status "degraded" on fresh startup (feeds in never_polled state)
- The test already handles both "ok" and "degraded" statuses via the regex match
- The http status code already accepts both 200 and 503
