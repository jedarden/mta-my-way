# /api/health Endpoint - Actual Behavior Documentation

**Extracted from:** `packages/server/src/app.ts` lines 874-1090  
**Date:** 2026-08-20  
**Bead:** mtamyway-120d93d1

## Overview
`GET /api/health` returns per-feed health status and circuit-breaker state as JSON.

## HTTP Status Codes

### 200 OK
Returned when fewer than **UNHEALTHY_FEED_THRESHOLD (3)** feeds are failing.
A "failing feed" is defined as:
- `consecutiveFailures > 0`
- Had at least one prior success (`lastSuccessAt !== null`)
- Last success was more than 5 minutes ago (`now - lastSuccessAt > 300_000`)

**Important:** The overall status can be "degraded" while still returning 200. For example, one stale feed but fewer than 3 failing feeds = 200 OK with status "degraded".

### 503 Service Unavailable
Returned when **3 or more feeds** meet the failing criteria above.

**Note:** 503 always implies "degraded" status, but "degraded" does not always imply 503.

### 400 Bad Request
Returned when **any** query parameters are present (see Query Validation below).

## Query Validation

**Schema:** `emptyQuerySchema` = `z.object({}).strict()`

This is a **strict empty object schema** - it accepts **zero** query parameters.

**Behavior with unexpected query parameters:**
- Any query parameter at all causes validation to fail
- Returns HTTP 400 with response body:
  ```json
  {
    "error": "validation failed",
    "details": ["Unexpected key", ...]
  }
  ```

**Examples:**
- `GET /api/health` → ✅ 200 (or 503 if unhealthy)
- `GET /api/health?debug=true` → ❌ 400 validation failed
- `GET /api/health?foo=bar` → ❌ 400 validation failed

## Response Structure

### Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | `"ok" \| "degraded"` | Overall health status (see Status Logic below) |
| `timestamp` | string (ISO 8601) | Request time: `new Date().toISOString()` |
| `uptime_seconds` | number | Seconds since `SERVER_START_MS` (module load time) |
| `deploymentMode` | `"core-only" \| "full"` | `"core-only"` when `CORE_ONLY=true`, else `"full"` |
| `feeds` | Array\<FeedState\> | One entry per GTFS-realtime feed |
| `alerts` | object | Alerts polling subsystem status |
| `delayDetector` | object | Delay detector subsystem status |
| `delayPredictor` | object | Delay predictor subsystem status |
| `equipment` | object | Elevator/escalator outage status |
| `pushDb` | object | Push notification database status |
| `statefulSubsystem` | object | Stateful subsystem overall status |
| `cacheHitRate` | number (0-1) | Cache hit rate (0 when no cache requests) |
| `memory` | object | Node.js process memory snapshot |
| `failingFeedsCount` | number | Count of feeds meeting failing criteria |

### Status Logic

**Overall status** = `"ok"` when ALL of these conditions are met:
- All feeds have `circuitOpenAt === null`
- All feeds have `lastSuccessAt !== null`
- No feeds are stale (`!f.isStale`)
- Alerts have `circuitOpen === false`
- Alerts have `lastSuccessAt !== null`

Otherwise status = `"degraded"`.

**Note:** This is core-only logic - stateful subsystem degradation is acceptable for "ok" status.

### FeedState Object

Each element in the `feeds` array:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Feed identifier (e.g., "1", "26", "31", "36") |
| `name` | string | Human-readable feed name |
| `status` | `"circuit_open" \| "never_polled" \| "stale" \| "ok"` | Feed health status |
| `lastSuccessAt` | string \| null | ISO 8601 of last successful poll, or null |
| `lastPollAt` | string \| null | ISO 8601 of last poll attempt, or null |
| `consecutiveFailures` | number | Count of consecutive failed polls |
| `entityCount` | number | Number of entities in the feed |
| `lastError` | string \| null | Truncated error message (max 100 chars, newlines stripped) |
| `tripReplacementPeriod` | string \| null | Feed's trip replacement period |
| `avgLatencyMs` | number | Average of `latencyHistory` entries |
| `errorCount24h` | number | Count of errors within last 24 hours |
| `parseErrors` | feed-specific | Parse error details for the feed |

**Feed status logic:**
- `"circuit_open"` when `circuitOpenAt !== null`
- `"never_polled"` when `lastSuccessAt === null`
- `"stale"` when `isStale === true`
- `"ok"` otherwise

### alerts Object

| Field | Type | Description |
|-------|------|-------------|
| `count` | number | Number of alerts tracked |
| `lastSuccessAt` | number \| null | Epoch-ms of last successful alert fetch |
| `matchRate` | number (0-1) | Fraction of alerts that matched trips |
| `consecutiveFailures` | number | Consecutive alert fetch failures |
| `circuitOpen` | boolean | Whether alerts circuit breaker is open |
| `unmatchedCount` | number | Alerts that did not match any known trip |

### delayDetector Object

| Field | Type | Description |
|-------|------|-------------|
| `trackedTrips` | number | Count of trips currently being tracked |
| `activeAlerts` | number | Count of active predicted delay alerts |
| `thresholdMultiplier` | number | Delay threshold configuration multiplier |
| `minTrainsForLineAlert` | number | Minimum trains needed for line-level alert |

### delayPredictor Object

| Field | Type | Description |
|-------|------|-------------|
| `totalRecords` | number | Count of delay records stored |
| `aggregatedPatterns` | number | Count of aggregated statistical patterns |
| `minObservations` | number | Minimum observations for prediction |
| `currentWeather` | string | Current weather (e.g., "clear") |

### equipment Object

| Field | Type | Description |
|-------|------|-------------|
| `lastFetchAt` | string \| null | ISO 8601 of last fetch attempt |
| `lastSuccessAt` | string \| null | ISO 8601 of last successful fetch |
| `outageCount` | number | Number of stations with tracked outages |
| `consecutiveFailures` | number | Consecutive equipment fetch failures |
| `circuitOpen` | boolean | Whether equipment circuit breaker is open |

### pushDb Object

| Field | Type | Description |
|-------|------|-------------|
| `ready` | boolean | Whether push database is ready (`isPushDatabaseReady()`) |
| `subscriptionCount` | number | Count of active push subscriptions |

### statefulSubsystem Object

Returns result from `getStatefulStatus()` (exact structure not specified in JSDoc).

### memory Object

Returns `process.memoryUsage()` snapshot:

| Field | Type | Description |
|-------|------|-------------|
| `rssBytes` | number | Resident set size in bytes |
| `heapUsedBytes` | number | Active heap usage in bytes |
| `heapTotalBytes` | number | Total heap allocated in bytes |
| `externalBytes` | number | External (C++/Buffer) memory in bytes |

### cacheHitRate Calculation

```javascript
let cacheHitsValue = 0;
let cacheMissesValue = 0;
const cacheHitsMap = allMetrics.get("cache_hits_total");
const cacheMissesMap = allMetrics.get("cache_misses_total");

// Sum all label combinations
for (const labeled of cacheHitsMap?.values() ?? []) {
  if (labeled.metric.type === "counter") {
    cacheHitsValue += labeled.metric.value;
  }
}
// Same for cacheMissesMap...

const totalCacheRequests = cacheHitsValue + cacheMissesValue;
const cacheHitRate = totalCacheRequests > 0
  ? Math.round((cacheHitsValue / totalCacheRequests) * 100) / 100
  : 0;
```

Returns **0** when there have been no cache requests.

## Example Response (Partial)

```json
{
  "status": "ok",
  "timestamp": "2026-08-20T12:34:56.789Z",
  "uptime_seconds": 86400,
  "deploymentMode": "full",
  "feeds": [
    {
      "id": "1",
      "name": "1 Train",
      "status": "ok",
      "lastSuccessAt": "2026-08-20T12:34:50.000Z",
      "lastPollAt": "2026-08-20T12:34:55.000Z",
      "consecutiveFailures": 0,
      "entityCount": 1234,
      "lastError": null,
      "tripReplacementPeriod": "2023-06-03",
      "avgLatencyMs": 250,
      "errorCount24h": 2,
      "parseErrors": null
    }
    // ... more feeds
  ],
  "alerts": {
    "count": 42,
    "lastSuccessAt": 1724162090000,
    "matchRate": 0.85,
    "consecutiveFailures": 0,
    "circuitOpen": false,
    "unmatchedCount": 5
  },
  "delayDetector": { /* ... */ },
  "delayPredictor": { /* ... */ },
  "equipment": { /* ... */ },
  "pushDb": {
    "ready": true,
    "subscriptionCount": 150
  },
  "statefulSubsystem": { /* ... */ },
  "cacheHitRate": 0.92,
  "memory": {
    "rssBytes": 134217728,
    "heapUsedBytes": 67108864,
    "heapTotalBytes": 104857600,
    "externalBytes": 2097152
  },
  "failingFeedsCount": 0
}
```

## Key Implementation Details

1. **Failing feed threshold** (`UNHEALTHY_FEED_THRESHOLD`): 3 feeds
2. **Failing feed definition**: `consecutiveFailures > 0 && lastSuccessAt !== null && (now - lastSuccessAt) > 300_000`
3. **Error truncation**: `lastErrorMessage.slice(0, 100).replace(/[\r\n]/g, " ")`
4. **Cache hit rate rounding**: `Math.round((hits / total) * 100) / 100`
5. **Metrics source**: `metrics.getAll()` from Prometheus-style metrics registry
6. **Latency calculation**: `avgLatency(f.latencyHistory)` helper function
7. **Error counting**: `errorCount24h(f.errorTimestamps)` helper function

## Dependencies

The endpoint relies on these subsystems and their status functions:
- `getFeedStates()` - feed states from cache
- `getAlertsStatus()` - alerts polling status
- `isPushDatabaseReady()` - push DB readiness
- `getDelayDetectorStatus()` - delay detector status
- `getDelayPredictorStatus()` - delay predictor status  
- `getEquipmentStatus()` - equipment outage status
- `getSubscriptionCount()` - push subscription count
- `getStatefulStatus()` - stateful subsystem overall status
- `metrics.getAll()` - Prometheus metrics registry
