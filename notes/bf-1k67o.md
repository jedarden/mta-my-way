# Health Endpoint E2E Test Expectations

## Test: "returns system health status"

**Endpoint:** `GET /api/health`

**Expected Status Code:**
- Either `200` (healthy) or `503` (degraded)
- Server returns 503 when 3+ feeds are failing for >5 minutes

**Expected Response Fields:**
1. `status` (string)
   - Must match regex: `^(ok|degraded)$`
   - Valid values: "ok" or "degraded"

2. `timestamp` (any)
   - Must be present (property exists)

3. `uptime_seconds` (number)
   - Must be >= 0
   - Can be 0 on fresh server startup (<1 second old)

---

## Test: "rejects unexpected query parameters"

**Endpoint:** `GET /api/health?extra=param`

**Expected Status Code:**
- `400` (Bad Request)

**Expected Response Fields:**
1. `error` (any)
   - Must be present (property exists)

---

## Test Behavior Summary

The health endpoint:
- Accepts NO query parameters (extra params → 400 error)
- Returns 200 when healthy, 503 when degraded (3+ feeds failing >5min)
- Includes system status, timestamp, and uptime metrics in all successful responses
