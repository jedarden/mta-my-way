# Middleware Configuration Catalog

**Date:** 2026-08-28  
**Bead:** mtamyway-7c0d0835  
**Purpose:** Complete catalog of middleware configuration files and initialization chain

---

## Executive Summary

This document catalogs **all middleware configuration files** in the MTA My Way server codebase, including:

- Middleware definition locations
- Export structure
- Registration points in app.ts
- Middleware execution order
- Configuration options

---

## 1. Middleware Directory Structure

### Location
```
packages/server/src/middleware/
├── index.ts                                          # Central export barrel
├── authentication.ts                                 # API key & session auth
├── session-security.ts                               # Session risk assessment
├── authorization.ts                                  # Resource authorization
├── rbac.ts                                           # Role-based access control
├── csrf-protection.ts                                # CSRF token validation
├── rate-limiter.ts                                   # Rate limiting
├── auth-rate-limit.ts                                # Auth-specific rate limiting
├── security-headers.ts                               # CSP, HSTS, X-Frame-Options
├── security-logging.ts                               # Security event logging
├── audit-log.ts                                      # Audit trail
├── cookie-security.ts                                # Cookie validation & signing
├── cors.ts                                           # CORS headers
├── validation.ts                                     # Request validation
├── input-sanitization.ts                             # XSS/SQL injection prevention
├── mass-assignment.ts                                # Mass assignment protection
├── path-traversal.ts                                 # Directory traversal prevention
├── open-redirect.ts                                  # Redirect URL validation
├── parameter-pollution.ts                            # HTTP parameter pollution
├── request-limits.ts                                 # Request size limits
├── response-size-limits.ts                           # Response size limits
├── json-depth-protection.ts                          # JSON depth limits
├── http-method-restrictions.ts                      # HTTP method filtering
├── http-request-smuggling.ts                         # Request smuggling detection
├── http-response-splitting.ts                        # Response splitting detection
├── host-header-protection.ts                         # Host header validation
├── ssrf-protection.ts                                # SSRF prevention
├── content-type.ts                                   # Content-Type validation
├── header-validation.ts                             # Header validation
├── cache.ts                                          # Cache control headers
├── request-id.ts                                     # Request correlation ID
├── metrics.ts                                        # HTTP metrics collection
├── password-management.ts                            # Password policy & hashing
├── token-encryption.ts                               # Token encryption
├── jwt-validation.ts                                 # JWT validation
├── enhanced-jwt-security.ts                          # Enhanced JWT security
├── enhanced-authentication.ts                       # Enhanced auth features
├── enhanced-authorization.ts                        # Enhanced authorization
├── dependency-security.ts                           # Dependency vulnerability checking
├── subresource-integrity.ts                         # SRI hash generation
├── captcha.ts                                        # CAPTCHA integration
├── suspicious-activity-notifications.ts             # Security event notifications
├── api-key-management.ts                             # API key CRUD operations
├── admin-operations.ts                               # Admin operations
├── concurrent-session-management.ts                 # Concurrent session handling
├── dynamic-rbac-cache.ts                             # RBAC caching
├── roles.ts                                          # Role definitions
├── sanitization.ts                                    # Input sanitization
├── structured-audit-log.ts                           # Structured audit logging
└── [70+ test files]
```

---

## 2. Middleware Export Barrel (index.ts)

### Location
`packages/server/src/middleware/index.ts`

### Purpose
Central export barrel that re-exports all middleware functions and types from individual middleware modules. This is the single import point for app.ts.

### Export Categories

#### Core Middleware
```typescript
export { requestId } from "./request-id.js";
export { rateLimiter } from "./rate-limiter.js";
export { securityHeaders, generateCspNonce, getDefaultCsp, getStrictCsp } from "./security-headers.js";
export { validateBody, validateQuery, validateParams } from "./validation.js";
export { cors } from "./cors.js";
export { requestSizeLimits } from "./request-limits.js";
```

#### Security Middleware
```typescript
export { inputSanitization, getSanitizedQuery } from "./input-sanitization.js";
export { pathTraversalPrevention, isSafePath } from "./path-traversal.js";
export { hppProtection, getCleanedQuery, getCleanedBody, getCleanedForm } from "./parameter-pollution.js";
export { validateContentType, requireJson, requireFormData } from "./content-type.js";
export { headerValidation, strictHeaderValidation } from "./header-validation.js";
export { massAssignmentProtection, validateMassAssignment, filterAllowedFields } from "./mass-assignment.js";
export { openRedirectProtection, validateRedirectUrl, createSafeRedirect } from "./open-redirect.js";
export { ssrfProtection, validateUrl, safeFetch, createMtaFeedAllowList, validateMtaFeedUrl } from "./ssrf-protection.js";
export { hostHeaderProtection, validateHostHeader, getValidatedHost } from "./host-header-protection.js";
```

#### Authentication & Authorization
```typescript
export { 
  apiKeyAuth, signedRequestAuth, optionalAuth, requireScope, getAuthContext,
  isAuthenticated, registerApiKey, createSession, invalidateSession,
  generateApiKey, hashApiKey, validatePassword, hashPassword, verifyPasswordHash
} from "./authentication.js";

export {
  requireResourceAccess, requireAdmin, requireWrite, enforceRateLimitTier,
  requireSameOrigin, validateDataAccess, checkAuthorization, requireMfa, auditLogAccess
} from "./authorization.js";

export {
  requirePermission, requireAnyPermission, requireAllPermissions, requireRole,
  requireRoleLevel, requireOwnershipOrAdmin, conditionalByRole, hasPermission,
  hasAnyPermission, hasAllPermissions, parsePermission, buildPermission
} from "./rbac.js";
```

#### Session Security
```typescript
export {
  sessionSecurity, assessSessionRisk, recordSecurityEvent, clearSecurityEvents,
  getOrCreateDeviceTrust, updateDeviceTrust, isDeviceTrusted, getDeviceTrustLevel,
  setDeviceTrustLevel, removeDeviceTrust, parseIpAddress, areIpsInSameSubnet,
  calculateIpDistance, getIpClass, analyzeUserAgent, calculateUserAgentSimilarity,
  isLegitimateUserAgentChange, detectImpossibleTravel, calculateDistance
} from "./session-security.js";
```

#### CSRF & Cookies
```typescript
export {
  csrfProtection, validateCsrf, generateCsrfToken, generateSessionCsrfToken,
  validateCsrfToken, markCsrfTokenUsed, revokeCsrfToken, getCsrfToken
} from "./csrf-protection.js";

export {
  configureCookieSigning, signCookie, verifySignedCookie, buildCookieString,
  setSecureCookie, getSignedCookie, deleteCookie, csrfCookie, generateCookieCsrfToken,
  getCookieCsrfToken, setSessionCookie, getSessionCookie, clearSessionCookie,
  setRefreshTokenCookie, getRefreshTokenCookie, clearRefreshTokenCookie,
  validateCookieSecurity, cookieSecurityValidator, cookieSessionAuth
} from "./cookie-security.js";
```

#### Rate Limiting
```typescript
export {
  authRateLimit, resetRateLimit, getRateLimitStatus, banIp, unbanIp,
  addTrustedIp, removeTrustedIp, cleanupRateLimits, getRateLimitStats
} from "./auth-rate-limit.js";
```

#### Advanced Security
```typescript
export {
  validateJwt, verifyJwt, createJwt, decodeJwt, validateJwtStructure,
  checkTokenReplay, cleanupReplayStore
} from "./jwt-validation.js";

export {
  configureEncryption, encryptToken, decryptToken, encryptObject, decryptObject,
  encryptTokens, decryptTokens, hashToken, verifyTokenHash, reencryptToken,
  reencryptTokens, rotateEncryptionKey, generateMasterKey, generateTokenFingerprint
} from "./token-encryption.js";

export {
  generateDeviceFingerprint, recordTokenUsage, getTokenUsage, detectTokenCompromise,
  revokeToken, isTokenRevoked, unrevokeToken, flagSuspectedCompromise, unflagSuspectedCompromise
} from "./enhanced-jwt-security.js";
```

#### Logging & Monitoring
```typescript
export {
  securityLogger, securityLogging
} from "./security-logging.js";

export {
  addAuditEvent, getClientIp, getUserAgent, extractAuthContext, queryAuditLog,
  getAuditLogStats, getAuditLogForResource, getAuditLogForUser, getFailedAuthzAttempts,
  getRecentSecurityEvents, logAuthorizationSuccess, logAuthorizationFailure,
  logApiKeyCreated, logApiKeyRevoked, logAdminOperation, logDataAccess, logSecurityEvent
} from "./audit-log.js";

export {
  logAuditEvent, logAuditEventFromContext, redactSensitiveData, queryAuditLogs,
  getAuditEvent, getRelatedEvents, getChildEvents, generateComplianceReport
} from "./structured-audit-log.js";

export {
  notifySecurityEvent, createSecurityEvent, setNotificationPreferences,
  getNotificationPreferences, registerNotificationTemplate, getNotificationHistory
} from "./suspicious-activity-notifications.js";
```

---

## 3. Middleware Registration Chain

### Location
`packages/server/src/app.ts`

### Registration Order (Lines 400-598)

The middleware is registered in **strict security order**:

```typescript
// 1. BEFORE ALL MIDDLEWARE (lines 415-426)
app.get("/health", ...)  // Lightweight readiness check

// 2. GLOBAL MIDDLEWARE (applies to all routes)
app.use("*", requestId);                              // Line 430
app.use("*", securityHeaders({ ... }));               // Line 434
app.use("*", securityLogging());                      // Line 443
app.use("*", httpMethodRestrictions());               // Line 447
app.use("*", httpRequestSmuggling());                 // Line 451
app.use("*", httpResponseSplitting());                // Line 455
app.use("*", hostHeaderProtection({ ... }));          // Line 463
app.use("*", tracingMiddleware);                      // Line 475
app.use("*", requestSizeLimits());                    // Line 478
app.use("*", pathTraversalPrevention());              // Line 482

// 3. API-SPECIFIC MIDDLEWARE (applies to /api/* routes)
app.use("/api/*", inputSanitization());               // Line 485
app.use("/api/*", ssrfProtection());                   // Line 490
app.use("/api/*", validateContentType());             // Line 494
app.use("/api/*", jsonDepthProtection());             // Line 498

// 4. SPECIAL ENDPOINTS (before mass assignment)
app.post("/api/security/csp-report", async (c) => { ... });  // Line 505

// 5. STATE-CHANGING MIDDLEWARE
app.use("/api/*", massAssignmentProtection());        // Line 539
app.use("/api/*", optionalAuth({ allowSessions: true }));  // Line 544
app.use("/api/*", sessionSecurity());                 // Line 548
app.use("/api/*", csrfProtection({ excludePaths: [...] }));  // Line 555
app.use("/api/*", hppProtection({ strategy: "first" }));  // Line 582
app.use("/api/*", openRedirectProtection());         // Line 586
app.use("/api/*", massAssignmentProtection());        // Line 591
app.use("/api/*", httpMetrics());                     // Line 594
app.use("/api/*", rateLimiter());                      // Line 597
```

### Execution Order Rationale

1. **Early exit endpoint** (`/health`) - Registered before all middleware for fast readiness checks
2. **Request ID** - Must run first for correlation across all logs
3. **Security headers** - Applied to all responses early
4. **Security logging** - Records all requests for audit trail
5. **HTTP-level protections** - Method restrictions, smuggling, splitting
6. **Host validation** - Prevents cache poisoning attacks
7. **Observability** - Distributed tracing
8. **Size limits** - DoS protection
9. **Path traversal** - File system protection
10. **Input sanitization** - XSS/SQL injection prevention
11. **SSRF protection** - Prevents server-side request forgery
12. **Content type validation** - Ensures correct request formats
13. **JSON depth protection** - Prevents DoS via nested JSON
14. **CSP reporting** - Must be before mass assignment (accepts nested objects)
15. **Mass assignment** - Prevents overposting attacks
16. **Optional authentication** - Attaches auth context if present
17. **Session security** - Validates authenticated sessions
18. **CSRF protection** - Prevents cross-site request forgery
19. **HPP protection** - Prevents parameter pollution
20. **Open redirect protection** - Prevents redirect abuse
21. **Mass assignment (duplicate)** - Applied again for safety
22. **HTTP metrics** - Prometheus metrics collection
23. **Rate limiting** - Final gate before request processing

---

## 4. Key Middleware Definitions

### 4.1 optionalAuth

**File:** `packages/server/src/middleware/authentication.ts:3025-3104`

**Purpose:** Extract and attach authentication context if credentials are present, but don't require them.

**Signature:**
```typescript
export function optionalAuth(options: { allowSessions?: boolean } = {}): MiddlewareHandler
```

**Configuration:**
```typescript
app.use("/api/*", optionalAuth({ allowSessions: true }));
```

**Behavior:**
1. Extracts session token from cookie/header
2. Validates session against session store
3. Retrieves associated API key
4. Attaches `auth` context to request
5. Falls back to API key authentication
6. Continues without auth if both fail

---

### 4.2 sessionSecurity

**File:** `packages/server/src/middleware/session-security.ts:833-935`

**Purpose:** Assess session risk and enforce IP binding, user agent validation, and impossible travel detection.

**Signature:**
```typescript
export function sessionSecurity(options: SessionSecurityMiddlewareOptions = {})
```

**Configuration:**
```typescript
app.use("/api/*", sessionSecurity());  // All defaults enabled
```

**Default Options:**
- `enforceIpBinding: true` - Validate IP hasn't changed
- `checkUserAgent: true` - Detect suspicious UA changes
- `reauthOnHighRisk: true` - Require re-auth on high risk scores

**Security Features:**
- IP subnet validation (IPv4 /24, IPv6 /64)
- User agent similarity scoring
- Risk assessment (0-100 scale)
- Device trust tracking
- Impossible travel detection (>900 km/h)

---

### 4.3 securityHeaders

**File:** `packages/server/src/middleware/security-headers.ts`

**Purpose:** Apply security headers to all responses (CSP, HSTS, X-Frame-Options, etc.)

**Signature:**
```typescript
export function securityHeaders(options?: { reportUri?: string }): MiddlewareHandler
```

**Configuration:**
```typescript
app.use("*", securityHeaders({ reportUri: "/api/security/csp-report" }));
```

**Headers Applied:**
- `Content-Security-Policy` - CSP with nonce support
- `X-Content-Type-Options: nosniff` - Prevent MIME sniffing
- `X-Frame-Options: DENY` - Prevent clickjacking
- `Referrer-Policy: strict-origin-when-cross-origin` - Control referrer leakage
- `Permissions-Policy` - Restrict browser features

---

### 4.4 csrfProtection

**File:** `packages/server/src/middleware/csrf-protection.ts`

**Purpose:** Validate CSRF tokens for state-changing operations.

**Signature:**
```typescript
export function csrfProtection(options?: { excludePaths?: string[] }): MiddlewareHandler
```

**Configuration:**
```typescript
app.use("/api/*", csrfProtection({
  excludePaths: [
    "/api/health",
    "/api/metrics",
    "/api/stations",
    // ... other read-only endpoints
  ]
}));
```

**Excluded Paths:**
- Health and metrics endpoints
- Read-only data endpoints (stations, routes, arrivals, alerts)
- CSRF token endpoint
- CSP violation reporting

---

### 4.5 rateLimiter

**File:** `packages/server/src/middleware/rate-limiter.ts`

**Purpose:** Rate limit requests using token bucket algorithm (60 req/min per IP).

**Signature:**
```typescript
export function rateLimiter(): MiddlewareHandler
```

**Configuration:**
```typescript
app.use("/api/*", rateLimiter());
```

**Behavior:**
- Token bucket algorithm
- 60 requests per minute per IP
- Sliding window
- Returns 429 Too Many Requests on exceeded

---

## 5. Route-Specific Middleware

### Authentication Gates
```typescript
// Applied per-route in app.ts
app.get("/api/commute/analyze", requirePermission("commute:analyze"));
app.post("/api/push/subscribe", requirePermission("push:subscribe"));
app.delete("/api/push/unsubscribe", requirePermission("push:unsubscribe"));
```

### RBAC Authorization
```typescript
import { requirePermission, requireRole, requireAdmin } from "./middleware/rbac.js";

// Route-specific authorization
app.use("/api/admin/*", requireAdmin());
app.use("/api/settings/*", requirePermission("settings:write"));
```

---

## 6. Middleware Testing

### Integration Test Files

1. **`middleware-chain.test.ts`** - Full middleware pipeline tests
2. **`session-middleware-integration.test.ts`** - Session middleware integration
3. **`security-middleware.test.ts`** - Security middleware verification
4. **`rate-limiter.integration.test.ts`** - Rate limiting integration
5. **`rate-limiter-csrf-ordering.integration.test.ts`** - Middleware ordering tests
6. **`rate-limiter-counter-headers.integration.test.ts`** - Rate limit header tests

---

## 7. Configuration Reference

### Global Middleware Options

| Middleware | Options | Default Values |
|------------|---------|----------------|
| `securityHeaders` | `{ reportUri?: string }` | `reportUri: "/api/security/csp-report"` |
| `hostHeaderProtection` | `{ allowedHosts?: string[], blockMissingHost?: boolean }` | Block in production |
| `csrfProtection` | `{ excludePaths?: string[] }` | See app.ts line 558 |
| `hppProtection` | `{ strategy: "first" \| "last" }` | `"first"` |
| `optionalAuth` | `{ allowSessions?: boolean }` | `true` |
| `sessionSecurity` | `{ enforceIpBinding?: boolean, checkUserAgent?: boolean, reauthOnHighRisk?: boolean }` | All `true` |

---

## 8. Middleware Initialization Chain

### Startup Sequence

1. **Server initialization** (`index.ts`)
   - Load GTFS static data
   - Initialize observability (OTel, tracing, metrics)
   - Validate security configuration

2. **App creation** (`createApp()` in `app.ts`)
   - Create Hono app instance
   - Register middleware in security order
   - Build route handlers
   - Return configured app

3. **HTTP server start**
   - Start HTTP server
   - Begin background pollers
   - Server is ready

### Deferred Initialization

Some middleware features are **lazy-loaded** on first use:
- Push notification database
- Trip tracking database
- Session cleanup scheduler
- Password reset service

These are initialized only when first accessed to allow core API endpoints to work even if the database is unavailable.

---

## 9. Security Middleware Categories

### OWASP Coverage

| OWASP Category | Middleware | Status |
|----------------|-----------|--------|
| A01: Broken Access Control | `authorization.ts`, `rbac.ts` | ✅ |
| A02: Cryptographic Failures | `token-encryption.ts`, `password-management.ts` | ✅ |
| A03: Injection | `input-sanitization.ts`, `path-traversal.ts` | ✅ |
| A04: Insecure Design | `session-security.ts`, `concurrent-session-management.ts` | ✅ |
| A05: Security Misconfiguration | `security-headers.ts`, `dependency-security.ts` | ✅ |
| A06: Vulnerable Components | `dependency-security.ts` | ✅ |
| A07: Auth Failures | `authentication.ts`, `enhanced-authentication.ts` | ✅ |
| A08: Data Integrity | `mass-assignment.ts`, `hpp-protection.ts` | ✅ |
| A09: Logging | `security-logging.ts`, `audit-log.ts` | ✅ |
| A10: SSRF | `ssrf-protection.ts` | ✅ |

---

## 10. File Path Reference

### Quick Lookup Table

| Middleware | Definition File | Export in index.ts | Registered in app.ts |
|------------|----------------|-------------------|----------------------|
| `optionalAuth` | `authentication.ts:3025` | Line 39 | Line 544 |
| `sessionSecurity` | `session-security.ts:833` | Line 206 | Line 548 |
| `securityHeaders` | `security-headers.ts` | Line 4 | Line 434 |
| `csrfProtection` | `csrf-protection.ts` | Line 93 | Line 555 |
| `rateLimiter` | `rate-limiter.ts` | Line 2 | Line 597 |
| `requestId` | `request-id.ts` | Line 1 | Line 430 |
| `securityLogging` | `security-logging.ts` | Line 184 | Line 443 |

---

## 11. Conclusion

This catalog documents **all middleware configuration files** in the MTA My Way server codebase. The middleware system is:

- ✅ **Centralized** - All exports go through `middleware/index.ts`
- ✅ **Well-ordered** - Registered in security-priority order
- ✅ **Comprehensive** - Covers OWASP Top 10 security risks
- ✅ **Tested** - Integration tests verify middleware chain
- ✅ **Documented** - Configuration options and behavior specified

**Next Steps:**
- Reference this catalog when adding new middleware
- Maintain the security order when registering middleware
- Add integration tests for new middleware
- Update this catalog when middleware changes

---

**Document Version:** 1.0  
**Last Updated:** 2026-08-28  
**Related Beads:** mtamyway-7c0d0835 (catalog), mtamyway-f657f114 (session verification)
