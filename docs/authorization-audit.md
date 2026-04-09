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

### 2.2 Endpoints WITHOUT Authorization (CRITICAL GAPS)

| Endpoint | Method | Risk Level | Issue |
|----------|--------|-----------|-------|
| `/api/trips` | GET | 🔴 HIGH | No authentication required - anyone can view all trips |
| `/api/trips/:tripId` | GET | 🔴 HIGH | No authentication required - anyone can view specific trip |
| `/api/journal/stats` | GET | 🔴 HIGH | No authentication required - exposes user statistics |
| `/api/journal/dates/:startDate/:endDate` | GET | 🔴 HIGH | No authentication required - exposes trip history by date |
| `/api/journal/summary` | GET | 🟡 MEDIUM | No authentication required - exposes recent trips and stats |
| `/api/context` | GET | 🟡 MEDIUM | No authentication required - exposes context settings |
| `/api/context/clear` | POST | 🟡 MEDIUM | No authorization - state modification without auth |
| `/api/push/vapid-public-key` | GET | 🟢 LOW | Public by design - VAPID key needed for push |
| `/api/auth/session` | GET | 🟢 LOW | Returns auth status - appropriate for public access |
| `/api/auth/session/refresh` | POST | 🔴 HIGH | Requires auth but checks in handler, not middleware |
| `/api/auth/session/revoke` | POST | 🔴 HIGH | Requires auth but checks in handler, not middleware |
| `/api/auth/mfa/status` | GET | 🔴 HIGH | Requires auth but checks in handler, not middleware |
| `/api/auth/mfa/verify` | POST | 🔴 HIGH | Requires auth but checks in handler, not middleware |
| `/api/auth/oauth/providers` | GET | 🟢 LOW | Public by design - provider listing |
| `/api/auth/oauth/authorize/:providerId` | GET | 🟢 LOW | Initiates OAuth - no auth needed |
| `/api/auth/oauth/callback/:providerId` | GET | 🟢 LOW | OAuth callback - validates state |

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
