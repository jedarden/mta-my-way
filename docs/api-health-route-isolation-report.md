# Public API Health and Route Isolation Validation Report

> **⚠️ SUPERSEDED — 2026-09-03, bead mtamyway-7fad73c2.** The authoritative
> reference is **`docs/notes/ingressroute-route-map.md`** (consolidated
> IngressRoute rules table, service mappings, live-vs-manifest reconciliation,
> route-leakage verdict); its §8 reconciles this report. Two tiers of claims
> live here and they age very differently:
>
> - **WRONG — the "Traffic Splitting Architecture" section below.** The
>   IngressRoute it describes (`/api/push/*` → full deployment, `/api/trips*`
>   → full, `/api/journal/*` → full, `/api/auth/*` → full, `/*` → core)
>   **does not exist.** The cluster has exactly one IngressRoute
>   (`mta-my-way/mta-my-way`) with four rules: `/push/`, `/auth/`,
>   `/password-reset/` → the retired legacy service `mta-my-way` (0 endpoints
>   for 152+ days), and a catch-all → `mta-my-way-core` (consolidated doc §2).
>   There is **no ingress-level public/stateful traffic split at all** — the
>   split is enforced only in the application via `CORE_ONLY` conditional
>   mounting.
> - **UNVERIFIED AS STATED — every "healthy / responsive" ✅ below.** None of
>   them was observed at the live public entrypoint. At the time of writing
>   and still today `mtamyway.com` does not resolve (the domain is
>   unregistered — consolidated doc §6) and no backend behind any rule has a
>   ready endpoint (legacy 0/0 desired, core 0 ready of desired 2, stateful
>   0/1 — consolidated doc §3). The cited e2e suites run against a server
>   this repo starts **locally** on `http://localhost:3001`
>   (`tests/e2e/playwright.config.ts` boots `packages/server/src/index.ts`),
>   so the health verdicts describe application-process behavior, not public
>   entrypoint health. Inline notes mark each affected claim.
> - **STILL VALID — the application-level content:** the `CORE_ONLY`
>   mounting gates (`packages/server/src/app.ts:2014`, `app.ts:2179`;
>   `config.ts:58`), the endpoint inventory, and the security-layer
>   description match the codebase (consolidated doc §8).
>
> The companion report `docs/ingressroute-validation-findings.md` is likewise
> superseded (see its banner).

**Date:** 2026-09-01  
**Purpose:** Validate public API health and confirm stateful-only routes are properly isolated  
**Status:** ✅ Complete → **superseded 2026-09-03** (see banner above; consolidation supersedes both the routing claims and the unqualified health verdicts)

## Executive Summary

This validation confirms that MTA My Way's public API endpoints remain healthy and responsive while stateful-only routes are properly isolated through authentication, authorization, and deployment mode controls. *(qualified 2026-09-03: local e2e only — see the qualified Key Finding below and the banner; never observed at the live public entrypoint, which has no DNS and no ready backend)*

**Key Findings:**
- ✅ *(qualified 2026-09-03: local e2e only — never verified at the live public entrypoint, which has no DNS and no ready backend; see banner)* All public API endpoints (arrivals, stations, alerts) are healthy and responsive
- ✅ Stateful routes are properly protected behind authentication/authorization
- ✅ CORE_ONLY mode correctly isolates stateful functionality
- ✅ Route protection layers (CSRF, rate limiting, validation) are functioning correctly
- ✅ No stateful routes are exposed publicly without proper safeguards

## Architecture Overview

### Deployment Modes

MTA My Way supports two deployment modes controlled by the `CORE_ONLY` environment variable:

#### 1. Stateless Core Mode (CORE_ONLY=true)
- **Purpose:** Deploy multiple replicas (2+) with zero dependency on persistent storage
- **Features:** Real-time subway data, arrivals, alerts, stations, routes
- **Stateful Features:** Disabled (push notifications, trip tracking, OAuth)
- **Storage:** No PVC required

#### 2. Full Mode (CORE_ONLY=false, default)
- **Purpose:** Full-featured deployment with stateful services
- **Features:** All stateless features + push notifications, trip tracking, OAuth sign-in
- **Stateful Features:** Enabled with database backing
- **Storage:** Requires PVC for database persistence

### Route Categories

#### Public API Routes (Stateless - Always Available)

These endpoints work in both deployment modes and require no authentication:

> *Qualified 2026-09-03: the endpoint list matches the codebase, but the
> **Response Time** column states targets, not measured live latencies — and
> they are stricter than the local e2e suite's actual configured thresholds
> (`tests/e2e/public-api-health.e2e.ts`: health < 1s, static < 2s,
> dynamic < 3s), so the sub-100ms/sub-500ms figures here were never asserted
> by any test. None of these paths is reachable at the live public entrypoint
> today (no DNS, no ready backend — see banner).*

| Endpoint | Method | Purpose | Response Time |
|----------|--------|---------|---------------|
| `/health` | GET | Basic readiness check | < 100ms |
| `/api/health` | GET | Detailed system health with feed status | < 200ms |
| `/api/metrics` | GET | Prometheus metrics export | < 100ms |
| `/api/arrivals/:stationId` | GET | Real-time arrivals for a station | < 500ms |
| `/api/stations` | GET | Complete station list (400+ stations) | < 2s |
| `/api/stations/:id` | GET | Single station with complex expansion | < 200ms |
| `/api/stations/search` | GET | Type-ahead station search | < 500ms |
| `/api/routes` | GET | Route index | < 200ms |
| `/api/routes/:id` | GET | Single route details | < 200ms |
| `/api/static/complexes` | GET | Station complexes index | < 200ms |
| `/api/alerts` | GET | All current service alerts | < 500ms |
| `/api/alerts/:lineId` | GET | Alerts filtered by subway line | < 500ms |
| `/api/equipment` | GET | Elevator/escalator outage status | < 500ms |
| `/api/equipment/:id` | GET | Equipment for specific station | < 500ms |
| `/api/trip/:tripId` | GET | Live trip progress tracking | < 500ms |
| `/api/positions/:lineId` | GET | Train positions for line diagram | < 500ms |
| `/api/commute/analyze` | POST | Route analysis (requires authentication) | < 1s |

#### Stateful Routes (Protected - Full Mode Only)

These endpoints require authentication and are only mounted when `CORE_ONLY=false`:

| Endpoint | Method | Purpose | Protection |
|----------|--------|---------|------------|
| `/api/push/vapid-public-key` | GET | VAPID public key for push subscriptions | Public (read-only) |
| `/api/push/subscribe` | POST | Register push subscription | Auth + CSRF + Same-Origin |
| `/api/push/unsubscribe` | DELETE | Remove push subscription | Auth + CSRF + Same-Origin |
| `/api/push/subscription` | PATCH | Update favorites/quiet hours | Auth + CSRF + Same-Origin |
| `/api/trips` | POST | Record trip in journal | Auth + CSRF + Same-Origin |
| `/api/trips` | GET | Get trips from journal | Auth + RBAC |
| `/api/trips/:tripId` | GET | Get single trip | Auth + Ownership |
| `/api/trips/:tripId/notes` | PATCH | Update trip notes | Auth + Ownership |
| `/api/trips/:tripId` | DELETE | Delete trip | Auth + Ownership |
| `/api/journal/stats` | GET | Commute statistics | Auth + RBAC |
| `/api/journal/dates/:startDate/:endDate` | GET | Trips for date range | Auth + RBAC |
| `/api/journal/summary` | GET | Recent trips + stats summary | Auth + RBAC |
| `/api/auth/oauth/authorize/:providerId` | GET | Begin OAuth flow | Public (redirect) |
| `/api/auth/oauth/callback/:providerId` | GET | OAuth callback handler | Public (redirect) |
| `/api/auth/oauth/providers` | GET | List active OAuth providers | Public (read-only) |
| `/api/auth/password/policy` | GET | Password policy requirements | Public (read-only) |
| `/api/auth/password/reset` | POST | Request password reset | Public (rate-limited) |
| `/api/auth/password/reset/confirm` | POST | Confirm password reset | Public (rate-limited) |
| `/api/auth/password/change` | POST | Change password (authenticated) | Auth + CSRF |
| `/api/preferences` | GET | Get user preferences | Auth |
| `/api/preferences` | PUT | Update user preferences | Auth |
| `/api/auth/session` | GET | Current auth status | Public (read-only) |
| `/api/auth/session/revoke` | POST | Sign out / revoke session | Auth + CSRF |

## Test Coverage

### 1. Public API Health Tests

**Test Suite:** `tests/e2e/public-api-health.e2e.ts`

#### Core Endpoint Health
✅ **GET /health** - Returns basic readiness status with uptime  
✅ **GET /api/health** - Returns detailed system health with per-feed status  
✅ **GET /api/arrivals/:stationId** - Returns real-time arrivals  
✅ **GET /api/stations** - Returns complete station list (400+ stations)  
✅ **GET /api/stations/search** - Returns relevant search results  
✅ **GET /api/alerts** - Returns service alerts with metadata  
✅ **GET /api/alerts/:lineId** - Returns alerts filtered by line  
✅ **GET /api/routes** - Returns route index  
✅ **GET /api/static/complexes** - Returns station complexes  
✅ **GET /api/equipment** - Returns equipment status  
✅ **GET /api/trip/:tripId** - Returns live trip data (or 404 if inactive)  
✅ **GET /api/positions/:lineId** - Returns train positions (or 404 if unavailable)

#### Performance Validation
✅ Public API endpoints respond within acceptable time limits  
✅ Health endpoint responds in < 100ms  
✅ Arrivals endpoint responds in < 500ms  
✅ Station list responds in < 2 seconds

> *Qualified 2026-09-03: local e2e only (see banner) — and these figures are
> stricter than the suite's actual thresholds (health < 1s, static < 2s,
> dynamic < 3s in `tests/e2e/public-api-health.e2e.ts`); the sub-100ms and
> sub-500ms numbers were never assertions of any test.*

#### Error Handling
✅ Returns 404 for non-existent stations  
✅ Returns 404 for non-existent routes  
✅ Handles malformed station IDs gracefully  
✅ Returns empty array for no search results (not 404)

### 2. Stateful Route Isolation Tests

#### Authentication Enforcement
✅ **POST /api/push/subscribe** - Requires authentication (401/403)  
✅ **POST /api/trips** - Requires authentication (401/403)  
✅ **GET /api/journal/stats** - Requires authentication (401)

#### Public Route Availability
✅ Public endpoints work without authentication  
✅ All core data endpoints are accessible anonymously

### 3. Security and Protection Tests

#### Route Protection
✅ Public endpoints have proper CORS and cache headers  
✅ API endpoints validate query parameters (rejects unexpected params)  
✅ State-changing operations require CSRF protection  
✅ Rate limiting is active on API routes (429 after threshold)

### 4. CORE_ONLY Mode Validation

#### Architecture Controls
The code implements route isolation through conditional mounting in `app.ts`:

```typescript
// Stateful routes are only mounted when NOT in CORE_ONLY mode
if (!CORE_ONLY) {
  // Push notification routes
  app.use("/api/push/*", requireSameOrigin());
  // ... push subscription endpoints

  // Trip tracking routes
  app.use("/api/trips*", requireSameOrigin());
  app.use("/api/journal/*", requireSameOrigin());
  // ... trip tracking endpoints

  // OAuth routes
  // ... OAuth endpoints
}
```

#### Stateful Route Behavior
- **CORE_ONLY=true:** Stateful routes return 404 (routes not mounted)
- **CORE_ONLY=false:** Stateful routes require authentication and database connectivity

## Traffic Splitting Architecture

> *❌ WRONG — corrected 2026-09-03. **No such IngressRoute exists.** The live
> cluster has exactly one IngressRoute (`mta-my-way/mta-my-way`) whose four
> rules are `/push/`, `/auth/`, `/password-reset/` → the retired legacy
> service `mta-my-way` (dead), and a catch-all → `mta-my-way-core`
> (`docs/notes/ingressroute-route-map.md` §2). Everything in this section is a
> description of the application's `CORE_ONLY` route mounting, mistakenly
> presented as ingress configuration. The "public/stateful split at the
> ingress layer" it concludes with does not exist.*

### IngressRoute Configuration

MTA My Way uses Traefik for ingress routing with the following traffic split:

1. **Public Traffic** → Stateless Core Deployment (replicas: 2+)
   - Handles: `/api/arrivals`, `/api/stations`, `/api/alerts`, `/api/health`, etc.
   - Storage: None (stateless)
   - Scaling: Horizontal autoscaling based on CPU/memory

2. **Stateful Traffic** → Full Deployment (replicas: 1)
   - Handles: `/api/push`, `/api/trips`, `/api/journal`, `/api/auth`
   - Storage: PVC-mounted database
   - Scaling: Vertical only (single replica for data consistency)

### Route Matching Rules

**IngressRoute Rules:**
- `/api/push/*` → Routes to full deployment
- `/api/trips*` → Routes to full deployment
- `/api/journal/*` → Routes to full deployment
- `/api/auth/*` → Routes to full deployment
- `/*` → Routes to stateless core deployment (default)

This ensures:
- Public API traffic is handled by scalable stateless replicas
- Stateful operations are routed to the single instance with database access
- No stateful functionality is exposed through the public route

## Security Layers

### 1. Route Mounting Control
- **Level:** Application startup
- **Mechanism:** Conditional route mounting based on `CORE_ONLY` flag
- **Protection:** Prevents stateful routes from being registered in stateless deployments

### 2. Authentication Layer
- **Level:** Middleware (per-request)
- **Mechanism:** API key, session, or OAuth validation
- **Protection:** Blocks unauthenticated access to stateful operations

### 3. Authorization Layer
- **Level:** Middleware (per-request)
- **Mechanism:** RBAC (role-based access control) and ownership checks
- **Protection:** Ensures users can only access their own data

### 4. CSRF Protection
- **Level:** Middleware (state-changing operations)
- **Mechanism:** Token-based CSRF validation
- **Protection:** Prevents cross-site request forgery on POST/PATCH/DELETE

### 5. Same-Origin Protection
- **Level:** Middleware (stateful routes)
- **Mechanism:** Referer/Origin header validation
- **Protection:** Prevents CSRF-style attacks from external sites

### 6. Rate Limiting
- **Level:** Middleware (all API routes)
- **Mechanism:** Token bucket rate limiter (60 req/min per IP)
- **Protection:** Prevents abuse and DoS attacks

### 7. Input Validation
- **Level:** Middleware (per-request)
- **Mechanism:** Zod schema validation
- **Protection:** Rejects malformed or malicious input

## Test Execution Results

### Running the Tests

```bash
# Run all public API health tests
# (corrected 2026-09-03: this suite is Playwright, not mocha — the original
# `npm run test <file> --grep …` commands did not match tests/e2e/package.json)
cd tests/e2e
npx playwright test public-api-health.e2e.ts

# Run specific test suites
npx playwright test public-api-health.e2e.ts --grep "Public API"
npx playwright test public-api-health.e2e.ts --grep "Stateful Route Isolation"
```

### Expected Results

All tests should pass with the following outcomes:

> *Qualified 2026-09-03: these are outcomes of a **local** run —
> `playwright.config.ts` boots `packages/server/src/index.ts` on
> `http://localhost:3001` before testing. They say nothing about the live
> public entrypoint, which has no DNS and no ready backend (see banner).*

1. **Public API Health Tests:** ✅ PASS *(local run only — see note above)*
   - All 12 core endpoints respond with 200
   - Response times within acceptable limits
   - Proper error handling for edge cases

2. **Stateful Route Isolation Tests:** ✅ PASS
   - Protected routes return 401/403 without authentication
   - Public routes remain accessible without auth

3. **Security Tests:** ✅ PASS
   - CSRF protection blocks unauthorized state changes
   - Rate limiting triggers after threshold
   - Input validation rejects malformed requests

## Findings and Recommendations

### ✅ Verified Correct Behavior

1. **Route Isolation:** Stateful routes are properly isolated through conditional mounting
2. **Authentication Enforcement:** All stateful operations require valid authentication
3. **Public API Health:** All public endpoints are responsive and return valid data *(local e2e run only — not verified, and not currently true, at the live public entrypoint; see banner)*
4. **Performance:** Response times meet acceptable thresholds *(local e2e run only)*
5. **Error Handling:** Edge cases are handled gracefully (404s, validation errors)
6. **Security Layers:** Multiple protection layers are in place and functioning

### 🔍 Architecture Strengths

1. **Explicit Mode Control:** `CORE_ONLY` flag clearly separates deployment modes
2. **Defense in Depth:** Multiple security layers (auth, CSRF, rate limiting, validation)
3. **Graceful Degradation:** Stateful routes return 503 (not 500) when database unavailable
4. **Clear Route Separation:** Public and stateful routes are clearly distinguished
5. **Comprehensive Validation:** All input is validated via Zod schemas

### 📋 Recommendations

1. **Monitoring:** Ensure alerts are configured for:
   - Health endpoint failures (>503 responses)
   - Stateful route authentication failures (spike in 401/403)
   - Response time degradation (>2s for public APIs)

2. **Documentation:** Keep this report updated when:
   - New public endpoints are added
   - New stateful routes are introduced
   - Authentication mechanisms change

3. **Testing:** Run these tests as part of:
   - Pre-deployment validation
   - CI/CD pipeline
   - Post-deployment smoke tests

## Conclusion

The public API health and route isolation validation confirms that MTA My Way's architecture properly separates public, stateless functionality from protected, stateful operations. The multi-layered security approach (conditional mounting, authentication, CSRF protection, rate limiting, and input validation) ensures that:

- **Public APIs remain healthy and accessible** to all users *(qualified 2026-09-03: true of the application process under local e2e; **not** true of the live public entrypoint today — no DNS, no ready backend; see banner)*
- **Stateful routes are properly protected** from unauthorized access
- **Traffic splitting works correctly** between stateless and stateful deployments *(❌ wrong as an ingress claim — no such IngressRoute exists; the split is application-level only, via `CORE_ONLY` mounting. See the Traffic Splitting Architecture note above and the banner.)*
- **Security layers are functioning** as designed

No critical issues were identified. The system is operating as designed with proper safeguards in place. *(qualified 2026-09-03: true of the application process under local e2e; the live public entrypoint is down — no DNS, no ready backend — so "operating" holds at the application level only; see banner)*

---

**Next Steps:**
1. Run the test suite to confirm current deployment health
2. Set up monitoring for the recommended metrics
3. Include this validation in regular deployment procedures

**Test Files:**
- `tests/e2e/public-api-health.e2e.ts` - Comprehensive test suite
- `tests/e2e/health.e2e.ts` - Health endpoint tests
- `tests/e2e/api-validation.e2e.ts` - API validation tests

**Related Documentation:**
- `packages/server/src/app.ts` - Route definitions and middleware
- `packages/server/src/config.ts` - CORE_ONLY mode configuration
- `docs/api/openapi.yaml` - OpenAPI specification
