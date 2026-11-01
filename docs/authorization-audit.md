# Authorization Audit Report

**Date:** 2026-04-09
**Application:** MTA My Way
**Audit Type:** Authorization & Access Control Analysis

---

## Executive Summary

This audit reviews the authorization and access control implementation in the MTA My Way application. The application has a **comprehensive authentication and authorization framework** with several **critical gaps** in endpoint coverage and resource ownership validation.

**Overall Assessment:** The authorization middleware is well-designed, but several endpoints lack proper access controls, and the current resource ownership validation is insufficient for production use.

---

## 1. Current Authorization Implementation

### 1.1 Authentication Mechanisms

| Mechanism | Status | Implementation |
|-----------|--------|----------------|
| API Key Authentication | ✅ Implemented | PBKDF2 hashing (600k iterations), scope-based (read/write/admin) |
| Session Management | ✅ Implemented | IP binding, device tracking, CSRF tokens, sliding expiration |
| OAuth 2.0 | ✅ Implemented | PKCE flow, Google/GitHub providers |
| TOTP MFA | ✅ Implemented | Backup codes, verification window, per-key configuration |
| Refresh Tokens | ✅ Implemented | Token rotation, family-based invalidation, encryption support |

### 1.2 Authorization Middleware

| Middleware | Purpose | Status |
|-----------|---------|--------|
| `requireResourceAccess` | Resource-based access control | ✅ Implemented |
| `requireAdmin` | Admin-only operations | ✅ Implemented |
| `requireWrite` | Write operations | ✅ Implemented |
| `requireMfa` | MFA-verified operations | ✅ Implemented |
| `requireSameOrigin` | CSRF protection for state changes | ✅ Implemented |
| `validateDataAccess` | User-scoped data isolation | ✅ Implemented |
| `auditLogAccess` | Audit logging for privileged ops | ✅ Implemented |

---

## 2. Endpoint Authorization Coverage

### 2.1 Endpoints WITH Authorization

| Endpoint | Method | Authorization | Notes |
|----------|--------|---------------|-------|
| `/api/push/subscribe` | POST | `requireResourceAccess("subscription", "create")` | ✅ Protected |
| `/api/push/unsubscribe` | DELETE | `requireResourceAccess("subscription", "delete")` | ✅ Protected |
| `/api/push/subscription` | PATCH | `requireResourceAccess("subscription", "update")` | ✅ Protected |
| `/api/trips` | POST | `requireResourceAccess("trip", "create")` | ✅ Protected |
| `/api/trips/:tripId/notes` | PATCH | `requireResourceAccess("trip", "update")` | ✅ Protected |
| `/api/trips/:tripId` | DELETE | `requireResourceAccess("trip", "delete")` | ✅ Protected |
| `/api/commute/analyze` | POST | `requireResourceAccess("commute", "create")` | ✅ Protected |
| `/api/context/detect` | POST | `requireResourceAccess("context", "create")` | ✅ Protected |
| `/api/context/override` | POST | `requireResourceAccess("context", "update")` + audit | ✅ Protected |
| `/api/context/settings` | PATCH | `requireResourceAccess("context", "update")` + audit | ✅ Protected |
| `/api/auth/mfa/setup` | POST | `requireResourceAccess("admin", "create")` | ✅ Protected |
| `/api/auth/mfa/enable` | POST | `requireResourceAccess("admin", "update")` | ✅ Protected |
| `/api/auth/mfa/disable` | POST | `requireResourceAccess("admin", "delete")` | ✅ Protected |

### 2.2 Endpoints Previously Flagged WITHOUT Authorization

The following findings from the 2026-04-09 audit are closed. Each read route
requires an authenticated read-capable credential, rejects caller-supplied
cross-user filters through `validateDataAccess`, and scopes its query to the
authenticated owner. The single-trip route additionally checks the persisted
trip owner before returning the resource.

| Endpoint | Method | Original risk | Current status | Closing evidence |
|----------|--------|---------------|----------------|------------------|
| `/api/trips` | GET | 🔴 HIGH | ✅ Closed | `requireResourceAccess("trip", "read")` + `validateDataAccess("trip")`; handler scopes `ownerId` |
| `/api/trips/:tripId` | GET | 🔴 HIGH | ✅ Closed | `requireResourceAccess("trip", "read")` + `validateDataAccess("trip")` + `requireOwnershipOrAdmin("trips")` |
| `/api/journal/stats` | GET | 🔴 HIGH | ✅ Closed | `requireResourceAccess("journal", "read")` + `validateDataAccess("journal")`; owner-scoped stats |
| `/api/journal/dates/:startDate/:endDate` | GET | 🔴 HIGH | ✅ Closed | `requireResourceAccess("journal", "read")` + `validateDataAccess("journal")`; owner-scoped trips |
| `/api/journal/summary` | GET | 🟡 MEDIUM | ✅ Closed | `requireResourceAccess("journal", "read")` + `validateDataAccess("journal")`; owner-scoped trips and stats |

The `/api/context` rows from the original audit are not active server routes:
the feature was removed in 2026-08 by the resolution recorded in
`mtamyway-2e3c2df3`. Other original audit observations remain listed below for
their separate follow-up work.

| Endpoint | Method | Risk level | Original observation |
|----------|--------|------------|----------------------|
| `/api/push/vapid-public-key` | GET | 🟢 LOW | Public by design - VAPID key needed for push |
| `/api/auth/session` | GET | 🟢 LOW | Returns auth status - appropriate for public access |
| `/api/auth/session/refresh` | POST | 🔴 HIGH | Requires auth but checks in handler, not middleware |
| `/api/auth/session/revoke` | POST | 🔴 HIGH | Requires auth but checks in handler, not middleware |
| `/api/auth/mfa/status` | GET | 🔴 HIGH | Requires auth but checks in handler, not middleware |
| `/api/auth/mfa/verify` | POST | 🔴 HIGH | Requires auth but checks in handler, not middleware |
| `/api/auth/oauth/providers` | GET | 🟢 LOW | Public by design - provider listing |
| `/api/auth/oauth/authorize/:providerId` | GET | 🟢 LOW | Initiates OAuth - no auth needed |
| `/api/auth/oauth/callback/:providerId` | GET | 🟢 LOW | OAuth callback - validates state |

> **Re-verification 2026-10-31 (§2.2/§3.3 unauthenticated read endpoints).**
> The five flagged trip/journal read endpoints were already authenticated and
> owner-scoped by the earlier remediation. This pass added the explicit
> `requireResourceAccess` + `validateDataAccess` guard pair to every route and
> refreshed the regression evidence. Current per-endpoint status, verified
> against the code at HEAD (bead `mtamyway-909eb98a`):
>
> | Endpoint | Rating then | Status now | Enforcement (`packages/server/src/app.ts`) |
> |---|---|---|---|
> | `GET /api/trips` | 🔴 HIGH | ✅ Closed | `requireResourceAccess("trip", "read")` + `validateDataAccess("trip")`; handler scopes `ownerId` to the caller (admin role unscoped) |
> | `GET /api/trips/:tripId` | 🔴 HIGH | ✅ Closed | `requireResourceAccess("trip", "read")` + `validateDataAccess("trip")` + `requireOwnershipOrAdmin("trips")` — 401 unauthenticated, 403 owner mismatch, 404 passthrough for nonexistent IDs |
> | `GET /api/journal/stats` | 🔴 HIGH | ✅ Closed | `requireResourceAccess("journal", "read")` + `validateDataAccess("journal")`; stats computed from the caller's `ownerId` only |
> | `GET /api/journal/dates/:startDate/:endDate` | 🔴 HIGH | ✅ Closed | `requireResourceAccess("journal", "read")` + `validateDataAccess("journal")`; handler filters results by `ownerId` |
> | `GET /api/journal/summary` | 🟡 MEDIUM | ✅ Closed | `requireResourceAccess("journal", "read")` + `validateDataAccess("journal")`; recent trips and total count scoped by `ownerId` |
>
> Anonymous callers receive **401** on all five endpoints — authentication
> runs before the existence check, so trip IDs cannot be probed
> unauthenticated — and authenticated callers reading another user's data
> receive **403** or an owner-filtered result. `requireSameOrigin()` guards
> the state-changing methods on this surface; GET is exempt by design, so
> the resource/ownership middleware (not same-origin) is the read-side
> control. The `/api/context` rows refer to endpoints removed in 2026-08
> (`4bff02a9`, client-side-only context design). Regression coverage:
> `packages/server/src/integration/read-endpoints-authz.test.ts` (real-app
> anonymous-401, caller-supplied userId rejection, owner-success, and
> cross-user cases) and
> `packages/server/src/middleware/auth-authorization.integration.test.ts`
> (middleware semantics). The four "checks in handler"
> `/api/auth/session|mfa` rows were not re-verified in this pass.

---

## 3. Critical Security Gaps

### 3.1 Resource Ownership Validation (CRITICAL)

**Current Implementation:**
```typescript
// authorization.ts - extractTripOwner()
function extractTripOwner(tripId: string): ResourceOwner {
  // Trip IDs are UUIDs - ownership is validated via database lookup
  // In a real system, trips would have a userId field
  return { ownerId: tripId, isPublic: false };
}
```

**Issues:**
1. ⚠️ **No actual ownership validation** - trips don't have a `userId` field
2. ⚠️ **Comments indicate "In a real system"** - this is placeholder code
3. ⚠️ **Anyone with `write` scope can access any trip** if they know the trip ID
4. ⚠️ **Subscription ownership is endpoint-based only** - no database-level validation

**Recommendation:** Implement proper user-scoped resource ownership with database lookups.

> **Re-verified 2026-10-24:** resolved — ownership validation is
> database-backed and wired on every resource-identifier route. Per-finding
> status, verified against the code at HEAD (bead `mtamyway-ba6fceb5`):
>
> | Audit finding | Status | Enforcement (`packages/server/src/`) |
> |---|---|---|
> | Trips have no `userId` field | ✅ Closed | `trips.owner_id TEXT NOT NULL` + `idx_trips_owner_id` (`trip-tracking.ts`); `getTripById` returns `ownerId` |
> | `extractTripOwner` is placeholder code | ✅ Closed | the function no longer exists anywhere in `src/` |
> | Any `write`-scope key can access any trip by ID | ✅ Closed | `requireOwnershipOrAdmin("trips", { getOwnerId: <DB lookup> })` on `GET`/`PATCH …/notes`/`DELETE /api/trips/:tripId` — 401 unauthenticated, 403 owner mismatch, 404 passthrough for nonexistent IDs; handlers additionally re-scope the store write by `owner_id` as defense-in-depth (`updateTripNotes`/`deleteTrip`) |
> | Subscription ownership is endpoint-based only | ✅ Closed | `push_subscriptions.owner_id TEXT NOT NULL` + index (`push/subscriptions.ts`); the middleware resolves the owner from the database (`getSubscriptionOwner(endpoint)`); `removeSubscription`, `updateSubscriptionFavorites`, `updateSubscriptionQuietHours` and `updateSubscriptionMorningScores` all scope their SQL by `owner_id` |
>
> The `/api/context/settings` surface was removed 2026-08 (`4bff02a9`);
> its successor `PUT /api/preferences` derives the owner server-side from
> the validated session (`getSessionUserId` requires
> `authMethod === "session"`), so no client-supplied resource identifier
> exists to validate. Journal reads are covered by the §2.2 note above.
> Non-security quirk observed during re-verification: on the two push routes
> with `adminBypass: true` the handler still scopes its store call by the
> admin's own `keyId`, so an admin's cross-user unsubscribe/PATCH is a silent
> no-op that reports `success: true` (the trip handlers pass `undefined` for
> admins instead). That is a consistency gap in the admin branch, not a
> per-user ownership failure — non-admin cross-user access 403s at the
> middleware. Regression coverage pinning this to the real app:
> `packages/server/src/integration/resource-ownership.test.ts` (cross-user
> 403, owner-success, and unauthenticated 401 on every resource-identifier
> write route).

### 3.2 Inconsistent Authorization Patterns

**Pattern A: Middleware-based (Recommended)**
```typescript
app.post("/api/push/subscribe",
  requireResourceAccess("subscription", "create"),
  async (c) => { ... }
);
```

**Pattern B: Handler-based (Not Recommended)**
```typescript
app.get("/api/auth/session", (c) => {
  const auth = getAuthContext(c);
  if (!auth) {
    return c.json({ authenticated: false });
  }
  // ...
});
```

**Issue:** Some endpoints check auth inside the handler instead of using middleware, making security analysis difficult and increasing the risk of missing checks.

### 3.3 Missing Authorization on Read Operations

Many read operations that expose user data have **no authentication requirement**:

- `/api/trips` - Returns ALL trips
- `/api/journal/stats` - Returns user commute statistics
- `/api/journal/dates/:startDate/:endDate` - Returns trip history
- `/api/journal/summary` - Returns recent trips + stats

**Risk:** Data exposure, privacy violations, potential scraping of user travel patterns.

> **Re-verified 2026-10-24:** resolved — every listed endpoint now requires
> authentication and owner-scoped reads; see the §2.2 re-verification note
> above for the per-endpoint status.

---

## 4. Authentication Storage Issues

### 4.1 In-Memory Storage (Production Risk)

**Current:** API keys, sessions, OAuth states, TOTP configs all stored in memory.

```typescript
const apiKeys = new Map<string, ApiKey>();
const sessions = new Map<string, AuthSession>();
const oauthStates = new Map<string, OAuthState>();
const totpConfigs = new Map<string, TotpConfig>();
```

**Issues:**
1. ❌ All credentials lost on server restart
2. ❌ Cannot scale horizontally (multiple servers)
3. ❌ No persistence of OAuth sessions
4. ❌ Audit logs limited to 10,000 entries, in-memory only

**Recommendation:** Migrate to database-backed storage (Redis for sessions, PostgreSQL for persistent data).

---

## 5. Positive Security Implementations

### 5.1 Strong Cryptography
- ✅ PBKDF2 with 600,000 iterations (OWASP 2024 recommendation)
- ✅ Cryptographically secure random generation
- ✅ SHA-256 for token hashing
- ✅ HMAC for request signatures

### 5.2 Session Security
- ✅ Session fixation prevention (regeneration after auth)
- ✅ IP binding option
- ✅ Device fingerprinting
- ✅ Idle timeout (30 minutes)
- ✅ Absolute expiration (24 hours)
- ✅ Session hijacking detection

### 5.3 OAuth 2.0 Security
- ✅ PKCE flow (prevents authorization code interception)
- ✅ State parameter (CSRF protection)
- ✅ Nonce for ID token validation
- ✅ Short-lived state expiration (10 minutes)

### 5.4 MFA Implementation
- ✅ TOTP with backup codes
- ✅ Time window validation (±30 seconds)
- ✅ Single-use backup codes
- ✅ Per-key configuration

---

## 6. Recommendations

### Priority 1: Critical (Implement Immediately)

1. **Add authentication to read operations** exposing user data:
   ```typescript
   // Before:
   app.get("/api/trips", (c) => { ... });

   // After:
   app.get("/api/trips", apiKeyAuth({ requiredScope: "read" }), (c) => {
     const auth = getAuthContext(c);
     // Only return trips for this user
   });
   ```

2. **Implement proper resource ownership validation**:
   - Add `userId` field to trips table
   - Add `userId` field to subscriptions
   - Validate ownership in `requireResourceAccess` using database lookups
   - Use `customCheck` function for database-backed ownership validation

3. **Standardize authorization pattern** - Move handler-based auth checks to middleware:
   ```typescript
   // Before:
   app.get("/api/auth/session", (c) => {
     const auth = getAuthContext(c);
     if (!auth) return c.json({ authenticated: false });
   });

   // After:
   app.get("/api/auth/session", optionalAuth(), (c) => {
     const auth = getAuthContext(c);
     return c.json({ authenticated: !!auth, ... });
   });
   ```

### Priority 2: High (Implement Soon)

1. **Add database-backed storage** for:
   - API keys (persistent credentials)
   - Sessions (Redis or database)
   - Audit logs (persistent storage)
   - TOTP configs

2. **Add user-scoped query filtering**:
   ```typescript
   app.get("/api/trips", apiKeyAuth(), (c) => {
     const auth = getAuthContext(c);
     const query = validateQuery(c, tripQuerySchema);
     // Force userId to match authenticated user
     const userQuery = { ...query, userId: auth.keyId };
     const trips = getTrips(userQuery);
   });
   ```

3. **Add authorization tests** for:
   - All public endpoints (verify no data leak)
   - Resource ownership validation
   - Cross-user data access prevention

### Priority 3: Medium (Future Improvements)

1. **Add role-based access control (RBAC)**:
   - Define roles beyond scopes (admin, user, guest)
   - Map roles to permissions
   - Support role inheritance

2. **Add attribute-based access control (ABAC)**:
   - Policy-based authorization
   - Dynamic permissions based on context
   - Time-based access rules

3. **Add rate limiting per user**:
   - Track usage per API key
   - Different limits for different tiers
   - Burst allowance

---

## 7. Testing Recommendations

### 7.1 Authorization Test Coverage Needed

| Scenario | Test Needed |
|----------|-------------|
| Unauthenticated access to protected endpoints | ✅ Covered |
| Insufficient scope for operations | ✅ Covered |
| Cross-user data access attempts | ❌ Missing |
| Resource ownership validation | ❌ Missing |
| Public endpoint data exposure | ❌ Missing |
| Session hijacking attempts | ✅ Covered |
| OAuth flow security | ✅ Covered |

### 7.2 Integration Test Gaps

1. **End-to-end user journey tests**:
   - User registers → creates trip → views only their trips
   - User A cannot access User B's subscriptions
   - Admin can view all data (if required)

2. **Negative tests**:
   - Attempting to access another user's trips
   - Attempting to modify another user's subscriptions
   - Attempting to access admin endpoints without admin scope

---

## 8. Compliance Considerations

### 8.1 Data Privacy (GDPR/CCPA)

| Requirement | Status | Notes |
|-------------|--------|-------|
| User data access control | ⚠️ Partial | Trips readable without auth |
| Right to deletion | ❌ Missing | No user data deletion endpoint |
| Data export | ❌ Missing | No GDPR data export endpoint |
| Consent management | ❌ Missing | No consent tracking |
| Data retention policy | ❌ Missing | No automatic data cleanup |

### 8.2 Security Logging

| Requirement | Status | Notes |
|-------------|--------|-------|
| Authentication failures | ✅ Logged | Security logger |
| Authorization failures | ✅ Logged | Security logger |
| Privileged operations | ✅ Logged | Audit log middleware |
| Data access | ⚠️ Partial | Some endpoints lack logging |

---

## 9. Conclusion

The MTA My Way application has a **strong foundation** for authorization with:
- Well-designed middleware architecture
- Multiple authentication mechanisms
- Comprehensive security features (MFA, OAuth, session security)

However, there are **critical gaps** that must be addressed:
1. **Resource ownership validation is not implemented** (placeholder code only)
2. **Read operations exposing user data lack authentication**
3. **Inconsistent authorization patterns** across endpoints
4. **In-memory storage** not suitable for production

**Recommended Action Plan:**
1. Immediately add authentication to read operations exposing user data
2. Implement database-backed resource ownership validation
3. Standardize authorization middleware usage
4. Migrate to persistent storage for credentials and sessions
5. Add comprehensive authorization tests

---

## Appendix A: Authorization Middleware Quick Reference

```typescript
// Require specific resource access
requireResourceAccess(resourceType, action, options?)

// Require admin scope
requireAdmin()

// Require write scope
requireWrite()

// Require MFA verification
requireMfa()

// Enforce rate limit tier
enforceRateLimitTier(maxTier)

// Require same-origin for state changes
requireSameOrigin()

// Validate user-scoped data access
validateDataAccess(resourceType)

// Audit log access
auditLogAccess(resourceType, action)

// Optional authentication (attaches if present)
optionalAuth()

// Check authorization without throwing
checkAuthorization(context, resourceType, action)
```

---

**Report Generated:** 2026-04-09
**Next Review Date:** After implementing Priority 1 recommendations
