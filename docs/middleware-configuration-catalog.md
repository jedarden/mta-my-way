# Middleware Configuration Catalog

**Last Updated:** 2026-08-30  
**Project:** mta-my-way  
**Purpose:** Complete reference for middleware architecture, configuration, and execution order

---

## Table of Contents

1. [Overview](#overview)
2. [Middleware Directory Structure](#middleware-directory-structure)
3. [Complete Middleware File Catalog](#complete-middleware-file-catalog)
4. [Middleware Registration Order](#middleware-registration-order)
5. [Execution Flow Diagram](#execution-flow-diagram)
6. [Middleware Categories](#middleware-categories)
7. [Configuration Files](#configuration-files)
8. [Testing Strategy](#testing-strategy)
9. [Quick Reference](#quick-reference)

---

## Overview

The mta-my-way middleware system consists of **47 middleware modules** providing defense-in-depth security across OWASP Top 10 risks. All middleware is:

- **Type-Safe:** Full TypeScript support with exported types
- **Well-Tested:** 54 test files covering all modules
- **Modular:** Each middleware is independently composable
- **Documented:** Inline comments explain security rationale

**Statistics:**
- Implementation Files: 47
- Test Files: 54
- Exported Functions: ~368
- Exported Types: ~106
- Exported Constants: 7

---

## Middleware Directory Structure

```
packages/server/src/
├── middleware/                    # All middleware implementations
│   ├── index.ts                  # Central export barrel (481 exports)
│   ├── admin-operations.ts
│   ├── api-key-management.ts
│   ├── audit-log.ts
│   ├── authentication.ts
│   ├── auth-rate-limit.ts
│   ├── authorization.ts
│   ├── authorization-security.ts
│   ├── cache.ts
│   ├── captcha.ts
│   ├── concurrent-session-management.ts
│   ├── content-type.ts
│   ├── cookie-security.ts
│   ├── cors.ts
│   ├── csrf-protection.ts
│   ├── dependency-security.ts
│   ├── dynamic-rbac-cache.ts
│   ├── enhanced-authentication.ts
│   ├── enhanced-authorization.ts
│   ├── enhanced-jwt-security.ts
│   ├── header-validation.ts
│   ├── host-header-protection.ts
│   ├── http-method-restrictions.ts
│   ├── http-request-smuggling.ts
│   ├── http-response-splitting.ts
│   ├── input-sanitization.ts
│   ├── json-depth-protection.ts
│   ├── jwt-validation.ts
│   ├── mass-assignment.ts
│   ├── metrics.ts
│   ├── open-redirect.ts
│   ├── parameter-pollution.ts
│   ├── password-management.ts
│   ├── path-traversal.ts
│   ├── rate-limiter.ts
│   ├── request-id.ts
│   ├── request-limits.ts
│   ├── response-size-limits.ts
│   ├── roles.ts
│   ├── rbac.ts
│   ├── sanitization.ts
│   ├── security-headers.ts
│   ├── security-logging.ts
│   ├── session-security.ts
│   ├── ssrf-protection.ts
│   ├── structured-audit-log.ts
│   ├── subresource-integrity.ts
│   ├── suspicious-activity-notifications.ts
│   ├── token-encryption.ts
│   └── validation.ts
├── app.ts                        # Middleware registration (lines 416-627)
├── config.ts                     # Environment configuration
└── index.ts                      # Server entry point
```

---

## Complete Middleware File Catalog

### Authentication & Authorization

| File | Purpose | Key Functions |
|------|---------|---------------|
| `authentication.ts` | Core authentication (API keys, sessions, passwords) | `optionalAuth`, `apiKeyAuth`, `createSession`, `invalidateSession` |
| `authorization.ts` | Basic RBAC and resource access control | `requirePermission`, `hasPermission` |
| `authorization-security.ts` | Behavioral analysis and time-based access control | `analyzeBehavior`, `detectAnomalousPattern` |
| `enhanced-authentication.ts` | Enhanced auth with additional verification | `enhancedAuth`, `verifyIdentity` |
| `enhanced-authorization.ts` | Dynamic resource authorization | `dynamicResourceCheck`, `contextAwareAuth` |
| `rbac.ts` | Advanced role-based access control | `checkRole`, `hasRole`, `requireRole` |
| `roles.ts` | Role definitions and constants | `ROLE_ADMIN`, `ROLE_USER`, etc. |
| `dynamic-rbac-cache.ts` | RBAC caching and permission optimization | `cachedPermissionCheck`, `invalidateCache` |
| `session-security.ts` | Session risk assessment and device tracking | `assessSessionRisk`, `trackDevice` |
| `concurrent-session-management.ts` | Multi-session handling and conflict resolution | `manageConcurrentSessions`, `detectConflict` |
| `api-key-management.ts` | API key CRUD operations and lifecycle | `generateApiKey`, `revokeApiKey`, `rotateApiKey` |
| `jwt-validation.ts` | JWT validation and verification | `validateJwt`, `verifyToken` |
| `enhanced-jwt-security.ts` | JWT replay detection and compromise detection | `detectReplay`, `checkCompromised` |
| `password-management.ts` | Password policy, reset, and history management | `validatePassword`, `hashPassword`, `resetPassword` |
| `token-encryption.ts` | Token encryption utilities | `encryptToken`, `decryptToken` |
| `captcha.ts` | CAPTCHA verification and integration | `verifyCaptcha`, `generateCaptcha` |

### Input Validation & Sanitization

| File | Purpose | Key Functions |
|------|---------|---------------|
| `input-sanitization.ts` | XSS and SQL injection prevention | `inputSanitization`, `sanitizeHtml` |
| `sanitization.ts` | Input sanitization utilities | `sanitizeString`, `sanitizeObject` |
| `validation.ts` | Request validation (params, query, body) | `validateBody`, `validateQuery`, `validateParams` |
| `content-type.ts` | Content-Type header validation | `validateContentType`, `requireJson`, `requireFormData` |
| `header-validation.ts` | General HTTP header validation | `headerValidation`, `strictHeaderValidation` |
| `json-depth-protection.ts` | JSON DoS prevention via depth limits | `jsonDepthProtection`, `validateJsonDepth` |
| `mass-assignment.ts` | Mass assignment attack prevention | `massAssignmentProtection`, `filterFields` |

### Security Protection

| File | Purpose | Key Functions |
|------|---------|---------------|
| `security-headers.ts` | CSP, HSTS, and security headers | `securityHeaders`, `generateCspNonce` |
| `csrf-protection.ts` | CSRF token validation and protection | `csrfProtection`, `generateCsrfToken`, `validateCsrf` |
| `ssrf-protection.ts` | Server-Side Request Forgery protection | `ssrfProtection`, `isSafeUrl` |
| `path-traversal.ts` | Directory traversal attack prevention | `pathTraversalPrevention`, `isSafePath` |
| `open-redirect.ts` | Open redirect protection and URL validation | `openRedirectProtection`, `isSafeRedirect` |
| `http-method-restrictions.ts` | Dangerous HTTP method blocking | `httpMethodRestrictions`, `isSafeMethod` |
| `http-request-smuggling.ts` | HTTP request smuggling detection | `httpRequestSmuggling`, `detectSmuggling` |
| `http-response-splitting.ts` | CRLF injection and response splitting prevention | `httpResponseSplitting`, `detectCrlfInjection` |
| `parameter-pollution.ts` | HPP (HTTP Parameter Pollution) protection | `hppProtection`, `getCleanedQuery`, `getCleanedBody` |
| `host-header-protection.ts` | Host header validation and cache poisoning prevention | `hostHeaderProtection`, `isValidHost` |
| `cookie-security.ts` | Cookie validation, signing, and security | `secureCookie`, `validateCookie` |
| `dependency-security.ts` | Dependency vulnerability scanning | `scanDependencies`, `checkVulnerabilities` |
| `subresource-integrity.ts` | SRI hash generation and validation | `generateSri`, `validateSri` |

### Rate Limiting & DoS Protection

| File | Purpose | Key Functions |
|------|---------|---------------|
| `rate-limiter.ts` | General rate limiting (token bucket algorithm) | `rateLimiter`, `checkRateLimit` |
| `request-limits.ts` | Request size limits and DoS protection | `requestSizeLimits`, `checkRequestSize` |
| `response-size-limits.ts` | Response size limits and DoS prevention | `responseSizeLimits`, `checkResponseSize` |
| `auth-rate-limit.ts` | Authentication-specific rate limiting | `authRateLimit`, `checkAuthRate` |

### Logging & Monitoring

| File | Purpose | Key Functions |
|------|---------|---------------|
| `security-logging.ts` | Security event logging | `securityLogging`, `logSecurityEvent` |
| `audit-log.ts` | Audit logging utilities and event tracking | `auditLog`, `logAuditEvent` |
| `structured-audit-log.ts` | Structured compliance audit logging | `structuredAuditLog`, `logComplianceEvent` |
| `metrics.ts` | HTTP metrics collection | `httpMetrics`, `recordMetric` |
| `suspicious-activity-notifications.ts` | Security event notifications | `notifySuspiciousActivity`, `alertSecurity` |

### Caching & Performance

| File | Purpose | Key Functions |
|------|---------|---------------|
| `cache.ts` | Cache control headers and HTTP caching strategies | `staticCache`, `apiCache`, `noCache`, `etagCache` |
| `cors.ts` | CORS configuration and headers | `cors`, `configureCors` |

### Request Processing

| File | Purpose | Key Functions |
|------|---------|---------------|
| `request-id.ts` | Request correlation ID generation | `requestId`, `generateRequestId` |

### Admin & Operations

| File | Purpose | Key Functions |
|------|---------|---------------|
| `admin-operations.ts` | Admin-only operations and system management | `requireAdmin`, `adminOperation` |

---

## Middleware Registration Order

**Location:** `packages/server/src/app.ts` (lines 416-627)

### Phase 1: Early Exit Endpoint (Pre-Middleware)

```typescript
// Line 416 - Health check (no authentication, no processing)
app.get("/health", async (c) => {
  return c.json({ status: "ok", uptime_seconds: ... });
});
```

**Purpose:** Lightweight readiness check that bypasses all middleware for fast health probes.

### Phase 2: Global Middleware (All Routes)

Applied to `*` (all routes, including non-API routes):

```typescript
// Line 430 - Request correlation ID
app.use("*", requestId);

// Line 435 - Security headers (CSP, HSTS, X-Frame-Options, etc.)
app.use("*", securityHeaders({ reportUri: "/api/security/csp-report" }));

// Line 443 - Security event logging (auth failures, rate limits, blocked attacks)
app.use("*", securityLogging());

// Line 447 - Block dangerous HTTP methods (TRACE, CONNECT)
app.use("*", httpMethodRestrictions());

// Line 451 - HTTP request smuggling detection
app.use("*", httpRequestSmuggling());

// Line 455 - CRLF injection and response splitting prevention
app.use("*", httpResponseSplitting());

// Line 465 - Host header validation (cache poisoning prevention)
app.use("*", hostHeaderProtection({
  allowedHosts: process.env["ALLOWED_HOSTS"]?.split(","),
  blockMissingHost: isProduction,
  blockIpAddresses: isProduction,
  blockPrivateNetworks: isProduction,
  blockLocalhost: isProduction
}));

// Line 475 - Distributed tracing
app.use("*", tracingMiddleware);

// Line 478 - Request size limits (DoS protection)
app.use("*", requestSizeLimits());

// Line 482 - Path traversal prevention (blocks ../../../etc/passwd)
app.use("*", pathTraversalPrevention());
```

### Phase 3: API-Specific Middleware (/api/* routes)

Applied only to `/api/*` routes:

```typescript
// Line 485 - Input sanitization (XSS, SQL injection prevention)
app.use("/api/*", inputSanitization());

// Line 490 - SSRF protection (blocks internal URL access)
app.use("/api/*", ssrfProtection());

// Line 494 - Content-Type validation
app.use("/api/*", validateContentType());

// Line 498 - JSON depth protection (prevents JSON DoS)
app.use("/api/*", jsonDepthProtection());

// Line 506 - CSP violation reporting endpoint (exempt from mass assignment)
app.post("/api/security/csp-report", async (c) => { /* ... */ });

// Line 540 - Mass assignment protection (field filtering)
app.use("/api/*", massAssignmentProtection({
  allowNested: true,
  maxDepth: 2,
  allowedSensitiveFields: ["email", "password", "newPassword", "token"]
}));

// Line 555 - Optional authentication (parses Authorization header)
app.use("/api/*", optionalAuth({ allowSessions: true }));

// Line 559 - Session security validation
app.use("/api/*", sessionSecurity());

// Line 567 - CSRF protection (state-changing operations only)
app.use("/api/*", csrfProtection({
  excludePaths: [
    "/api/health",
    "/api/metrics",
    "/api/stations",
    "/api/routes",
    "/api/static",
    "/api/arrivals",
    "/api/alerts",
    "/api/equipment",
    "/api/trip",
    "/api/positions",
    "/api/push/vapid-public-key",
    "/api/journal",
    "/api/auth/oauth",
    "/api/auth/password",
    "/api/csrf-token",
    "/api/security/csp-report"
  ]
}));

// Line 595 - HPP protection (HTTP Parameter Pollution)
app.use("/api/*", hppProtection({ strategy: "first" }));

// Line 599 - Open redirect protection
app.use("/api/*", openRedirectProtection());

// Line 604 - Mass assignment protection (duplicate - applied again)
app.use("/api/*", massAssignmentProtection({
  allowNested: true,
  maxDepth: 2,
  allowedSensitiveFields: ["email", "password", "newPassword", "token"]
}));

// Line 613 - HTTP metrics collection
app.use("/api/*", httpMetrics());

// Line 617 - Rate limiting (60 req/min per IP)
app.use("/api/*", rateLimiter());

// Line 620 - Auth routes rate limiting
app.use("/auth/*", rateLimiter());

// Line 623 - Response size limits
app.use("/api/*", responseSizeLimits());

// Line 627 - Response compression
app.use("/api/*", compressionMiddleware());
```

---

## Execution Flow Diagram

```
Incoming Request
│
├─→ [Health Check] → Immediate Response (bypasses all middleware)
│
└─→ [All Routes]
    │
    ├─→ requestId (correlation ID)
    ├─→ securityHeaders (CSP, HSTS)
    ├─→ securityLogging (event logging)
    ├─→ httpMethodRestrictions (block TRACE/CONNECT)
    ├─→ httpRequestSmuggling (detect smuggling)
    ├─→ httpResponseSplitting (CRLF injection)
    ├─→ hostHeaderProtection (validate Host header)
    ├─→ tracingMiddleware (distributed tracing)
    ├─→ requestSizeLimits (DoS protection)
    └─→ pathTraversalPrevention (block ../../../)
        │
        └─→ [API Routes Only (/api/*)]
            │
            ├─→ inputSanitization (XSS/SQL injection prevention)
            ├─→ ssrfProtection (block internal URLs)
            ├─→ validateContentType (check Content-Type)
            ├─→ jsonDepthProtection (prevent JSON DoS)
            ├─→ massAssignmentProtection (filter writable fields)
            ├─→ optionalAuth (parse Authorization header)
            ├─→ sessionSecurity (validate session)
            ├─→ csrfProtection (CSRF token validation)
            ├─→ hppProtection (parameter pollution)
            ├─→ openRedirectProtection (validate redirects)
            ├─→ httpMetrics (record metrics)
            ├─→ rateLimiter (60 req/min per IP)
            ├─→ responseSizeLimits (DoS protection)
            └─→ compressionMiddleware (gzip responses)
                │
                └─→ Route Handler
```

---

## Middleware Categories

### 1. Infrastructure & Observability (Phase 2, Lines 430-482)

**Purpose:** Establish request context, logging, and basic protection

- `requestId` - Request correlation
- `securityHeaders` - Security response headers
- `securityLogging` - Event logging
- `tracingMiddleware` - Distributed tracing

### 2. HTTP-Level Protection (Phase 2, Lines 447-482)

**Purpose:** Block protocol-level attacks

- `httpMethodRestrictions` - Dangerous methods
- `httpRequestSmuggling` - Request smuggling
- `httpResponseSplitting` - CRLF injection
- `hostHeaderProtection` - Host validation
- `requestSizeLimits` - DoS protection
- `pathTraversalPrevention` - Directory traversal

### 3. Input Validation (Phase 3, Lines 485-499)

**Purpose:** Validate and sanitize all input data

- `inputSanitization` - XSS/SQL injection
- `ssrfProtection` - SSRF blocking
- `validateContentType` - Content-Type validation
- `jsonDepthProtection` - JSON DoS prevention

### 4. Authentication & Authorization (Phase 3, Lines 555-559)

**Purpose:** Verify user identity and permissions

- `optionalAuth` - Parse auth headers
- `sessionSecurity` - Validate session

### 5. State-Changing Protection (Phase 3, Lines 567-599)

**Purpose:** Protect state-changing operations

- `csrfProtection` - CSRF tokens
- `massAssignmentProtection` - Field filtering
- `hppProtection` - Parameter pollution
- `openRedirectProtection` - Redirect validation

### 6. Rate Limiting & Metrics (Phase 3, Lines 613-617)

**Purpose:** Control request rate and collect metrics

- `httpMetrics` - Request metrics
- `rateLimiter` - Rate limiting

### 7. Response Processing (Phase 3, Lines 623-627)

**Purpose:** Process responses before sending

- `responseSizeLimits` - DoS protection
- `compressionMiddleware` - gzip compression

---

## Configuration Files

### Main Configuration

| File | Purpose | Key Settings |
|------|---------|--------------|
| `packages/server/src/config.ts` | Environment configuration | `CORE_ONLY` mode, feature flags |
| `packages/server/src/index.ts` | Server entry point | Port, host, initialization |
| `packages/server/src/app.ts` | Middleware registration | Middleware order, options |

### Middleware Options

**Host Header Protection:**
```typescript
hostHeaderProtection({
  allowedHosts: process.env["ALLOWED_HOSTS"]?.split(","),
  blockMissingHost: isProduction,
  blockIpAddresses: isProduction,
  blockPrivateNetworks: isProduction,
  blockLocalhost: isProduction
})
```

**Mass Assignment Protection:**
```typescript
massAssignmentProtection({
  allowNested: true,
  maxDepth: 2,
  allowedSensitiveFields: ["email", "password", "newPassword", "token"]
})
```

**CSRF Protection:**
```typescript
csrfProtection({
  excludePaths: [
    "/api/health",
    "/api/metrics",
    "/api/stations",
    // ... (13 excluded paths)
  ]
})
```

**HPP Protection:**
```typescript
hppProtection({ strategy: "first" })
```

---

## Testing Strategy

### Test Organization

All middleware tests are co-located with implementation:

```
middleware/
├── authentication.ts
├── authentication.test.ts       # Unit tests
├── csrf-protection.ts
├── csrf-protection.test.ts      # Unit tests
└── ...
```

### Integration Tests

| Test File | Purpose |
|-----------|---------|
| `integration/middleware-chain.test.ts` | Full middleware pipeline tests |
| `integration/middleware-execution-order.test.ts` | Middleware ordering verification |
| `integration/security-middleware.test.ts` | Security middleware verification |
| `middleware/session-middleware-integration.test.ts` | Session middleware integration |

---

## Quick Reference

### Adding New Middleware

1. **Create the middleware file:**
   ```typescript
   // packages/server/src/middleware/my-middleware.ts
   export const myMiddleware = (options?: MyOptions) => {
     return async (c: Context, next: Next) => {
       // Middleware logic
       await next();
     };
   };
   ```

2. **Export from barrel:**
   ```typescript
   // packages/server/src/middleware/index.ts
   export { myMiddleware } from "./my-middleware.js";
   ```

3. **Register in app.ts:**
   ```typescript
   // packages/server/src/app.ts
   app.use("/api/*", myMiddleware({ /* options */ }));
   ```

4. **Add tests:**
   ```typescript
   // packages/server/src/middleware/my-middleware.test.ts
   describe("myMiddleware", () => {
     it("should do X", async () => {
       // Test implementation
     });
   });
   ```

### Middleware Order Rationale

The middleware is registered in strict security order:

1. **Infrastructure First** - Request ID, security headers, logging (must run before everything)
2. **HTTP-Level Protection** - Protocol-level attacks (smuggling, CRLF, Host validation)
3. **Input Validation** - Clean input before processing (sanitization, SSRF, JSON depth)
4. **Authentication** - Verify identity (optional auth, session security)
5. **State-Changing Protection** - CSRF, mass assignment, HPP (protect state changes)
6. **Rate Limiting & Metrics** - Final gates (rate limiter, metrics)
7. **Response Processing** - Size limits, compression (before sending)

### OWASP Top 10 Coverage

| OWASP Risk | Middleware Coverage |
|------------|---------------------|
| A01:2021 - Broken Access Control | `authorization`, `rbac`, `pathTraversalPrevention`, `openRedirectProtection` |
| A02:2021 - Cryptographic Failures | `password-management`, `token-encryption`, `enhanced-jwt-security` |
| A03:2021 - Injection | `input-sanitization`, `sanitization`, `ssrf-protection` |
| A04:2021 - Insecure Design | `mass-assignment`, `security-headers` |
| A05:2021 - Security Misconfiguration | `security-headers`, `cors`, `host-header-protection` |
| A06:2021 - Vulnerable Components | `dependency-security` |
| A07:2021 - Auth Failures | `authentication`, `session-security`, `auth-rate-limit` |
| A08:2021 - Data Integrity Failures | `csrf-protection`, `subresource-integrity` |
| A09:2021 - Logging Failures | `security-logging`, `audit-log`, `structured-audit-log` |
| A10:2021 - SSRF | `ssrf-protection` |

---

## Key Middleware Functions

### optionalAuth

**File:** `packages/server/src/middleware/authentication.ts:3025-3104`

**Purpose:** Extract and attach authentication context if credentials are present, but don't require them. This enables endpoints to work for both authenticated and unauthenticated users.

**Signature:**
```typescript
export function optionalAuth(options: { allowSessions?: boolean } = {}): MiddlewareHandler
```

**Configuration:**
```typescript
app.use("/api/*", optionalAuth({ allowSessions: true }));
```

**Behavior:**
1. **Session Authentication First (if allowSessions: true):**
   - Extracts session token from cookie/header
   - Validates session against session store
   - Checks session IP binding and validity
   - Retrieves associated API key
   - Attaches `auth` context to request with session details
   - Logs successful login via session

2. **API Key Authentication Fallback:**
   - Extracts API key from Authorization header
   - Verifies API key secret
   - Attaches `auth` context to request with API key details
   - Logs successful login via API key

3. **No Authentication:**
   - Continues without auth if both methods fail
   - Request proceeds without auth context

**AuthContext Structure:**
```typescript
interface AuthContext {
  keyId: string;                    // API key identifier
  scope: ApiKeyScope;              // Permission scope
  role: string;                    // User role
  additionalPermissions: string[]; // Extra permissions
  sessionId?: string;             // Session ID (if session auth)
  rateLimitTier: string;          // Rate limiting tier
  authMethod: "session" | "api_key"; // Authentication method
  oauthProvider?: string;          // OAuth provider (if OAuth session)
  mfaVerified?: boolean;          // MFA verification status
}
```

**Use Cases:**
- Public endpoints with enhanced features for authenticated users
- Personalized content delivery
- Gradual authentication rollout
- A/B testing authentication flows

**Related Middleware:**
- `sessionSecurity` - Validates session security after optionalAuth attaches context
- `authentication.ts` - Core authentication utilities

---

### sessionSecurity

**File:** `packages/server/src/middleware/session-security.ts:833-935`

**Purpose:** Assess session risk and enforce IP binding, user agent validation, and impossible travel detection to prevent session hijacking.

**Signature:**
```typescript
export function sessionSecurity(options: SessionSecurityMiddlewareOptions = {})
```

**Configuration:**
```typescript
app.use("/api/*", sessionSecurity());  // All defaults enabled
```

**Default Options:**
```typescript
interface SessionSecurityMiddlewareOptions {
  enforceIpBinding?: boolean;     // Default: true - Validate IP hasn't changed
  checkUserAgent?: boolean;       // Default: true - Detect suspicious UA changes
  riskThreshold?: number;         // Default: 70 - Risk threshold (0-100)
  reauthOnHighRisk?: boolean;     // Default: true - Require re-auth on high risk
}
```

**Security Features:**

1. **IP Binding Enforcement:**
   - Validates IP address hasn't changed between requests
   - For IPv4: Allows /24 subnet (first 3 octets must match)
   - For IPv6: Allows /64 subnet
   - Terminates session on IP binding violation
   - Logs suspicious activity on IP changes

2. **User Agent Validation:**
   - Detects significant User-Agent changes
   - Calculates similarity score between current and stored UA
   - Allows legitimate browser updates
   - Logs but doesn't block minor UA changes

3. **Risk Assessment:**
   - Scores session risk from 0-100
   - Factors: IP changes, UA changes, impossible travel, device trust
   - Risk levels: low, medium, high, critical
   - Actions: allow, monitor, challenge, block

4. **Impossible Travel Detection:**
   - Detects unrealistic travel speeds (>900 km/h)
   - Calculates distance between session locations
   - Flags sessions with impossible travel patterns
   - Uses Haversine formula for distance calculation

5. **Device Trust Tracking:**
   - Tracks device fingerprints across sessions
   - Maintains trust levels: unknown, untrusted, trusted, highly_trusted
   - Records successful authentications per device
   - Allows trusted devices to bypass certain checks

**Risk Assessment Output:**
```typescript
interface SessionRiskAssessment {
  riskScore: number;                      // 0-100
  riskLevel: "low" | "medium" | "high" | "critical";
  riskFactors: string[];                  // Identified risk factors
  recommendedAction: "allow" | "monitor" | "challenge" | "block";
  events: SecurityEvent[];                // Contributing security events
}
```

**Actions Taken:**
- **allow** - Proceed normally
- **monitor** - Log activity but allow
- **challenge** - Require re-authentication
- **block** - Terminate session immediately

**Utility Functions:**
- `parseIpAddress()` - Parse IPv4/IPv6 addresses
- `areIpsInSameSubnet()` - Check subnet membership
- `calculateIpDistance()` - Calculate distance between IPs
- `analyzeUserAgent()` - Parse and analyze UA strings
- `calculateUserAgentSimilarity()` - Compare UA strings
- `detectImpossibleTravel()` - Detect unrealistic travel
- `calculateDistance()` - Haversine distance calculation
- `getOrCreateDeviceTrust()` - Device trust management
- `assessSessionRisk()` - Main risk assessment function

**Related Middleware:**
- `optionalAuth` - Must run before sessionSecurity to attach auth context
- `authentication.ts` - Core session management
- `concurrent-session-management.ts` - Multi-session handling

---

## Middleware Initialization Chain

### Startup Sequence

The middleware system initializes in the following order during server startup:

#### Phase 1: Server Initialization (`packages/server/src/index.ts`)
1. Load GTFS static data
2. Initialize observability (OTel tracing, Prometheus metrics)
3. Initialize logging infrastructure
4. Validate security configuration

#### Phase 2: App Creation (`packages/server/src/app.ts`)
1. Create Hono app instance
2. Register health check endpoint (pre-middleware)
3. Register global middleware (all routes)
4. Register API-specific middleware (/api/* routes)
5. Register route handlers
6. Return configured app

#### Phase 3: HTTP Server Start
1. Start HTTP server on configured port
2. Begin background pollers (GTFS data, alerts)
3. Register signal handlers (graceful shutdown)

### Deferred Initialization

Some middleware features are **lazy-loaded** on first use:
- Push notification database connection
- Trip tracking database connection  
- Session cleanup scheduler
- Password reset token cleanup
- Device fingerprint cache
- RBAC permission cache

This allows core API endpoints to function even if optional databases are unavailable.

### Middleware Dependencies

```
requestId
    ↓
securityHeaders
    ↓
securityLogging
    ↓
httpMethodRestrictions → httpRequestSmuggling → httpResponseSplitting
    ↓
hostHeaderProtection
    ↓
tracingMiddleware
    ↓
requestSizeLimits → pathTraversalPrevention
    ↓
inputSanitization → ssrfProtection → validateContentType
    ↓
jsonDepthProtection
    ↓
massAssignmentProtection
    ↓
optionalAuth ← [Must run before sessionSecurity]
    ↓
sessionSecurity ← [Depends on optionalAuth for auth context]
    ↓
csrfProtection
    ↓
hppProtection → openRedirectProtection
    ↓
massAssignmentProtection (duplicate application)
    ↓
httpMetrics
    ↓
rateLimiter
    ↓
responseSizeLimits → compressionMiddleware
```

**Key Dependency Rules:**
1. `optionalAuth` MUST run before `sessionSecurity` - sessionSecurity requires the auth context
2. `requestId` must run first for request correlation
3. Input validation must run before authentication
4. Security headers must run before response processing
5. Rate limiting runs near the end as the final gate

---

## Middleware Relationships and Interactions

### Authentication Chain

```
optionalAuth
    ├─→ Session Token Validation
    │   ├─→ extractSessionToken()
    │   ├─→ getSession()
    │   ├─→ validateSession()
    │   └─→ getApiKey()
    └─→ API Key Authentication
        ├─→ extractApiKey()
        ├─→ getApiKey()
        └─→ verifyApiKeySecret()
            ↓
        [Attaches auth context to request]
            ↓
sessionSecurity
    ├─→ IP Binding Validation
    ├─→ User Agent Analysis
    ├─→ Risk Assessment
    └─→ Device Trust Check
```

### Authorization Chain

```
[After authentication]
    ↓
requirePermission / requireRole
    ├─→ checkPermission()
    ├─→ getRolePermissions()
    └─→ hasPermission()
        ↓
requireResourceAccess
    ├─→ checkResourceAuthorization()
    ├─→ validateDataAccess()
    └─→ auditLogAccess()
        ↓
[Route Handler executes]
```

### Security Event Flow

```
[Any middleware detects security issue]
    ↓
securityLogger.logSuspiciousActivity()
    ↓
audit-log.ts
    ├─→ addAuditEvent()
    ├─→ logAuthorizationFailure()
    └─→ logSecurityEvent()
        ↓
structured-audit-log.ts
    ├─→ logAuditEventFromContext()
    ├─→ redactSensitiveData()
    └─→ generateComplianceReport()
        ↓
suspicious-activity-notifications.ts
    ├─→ notifySecurityEvent()
    ├─→ createSecurityEvent()
    └─→ getNotificationHistory()
```

### Session Management Flow

```
[User authenticates]
    ↓
authentication.ts
    ├─→ createSession()
    ├─→ registerApiKey()
    └─→ generateApiKey()
        ↓
session-security.ts
    ├─→ getOrCreateDeviceTrust()
    ├─→ recordSecurityEvent()
    └─→ assessSessionRisk()
        ↓
concurrent-session-management.ts
    ├─→ registerSession()
    ├─→ detectConflict()
    └─→ manageConcurrentSessions()
        ↓
[Session active and monitored]
```

---

## Appendix: Export Statistics

**Total Exports from `middleware/index.ts`: 481**

- **Functions:** 368 middleware and utility functions
- **Types:** 106 TypeScript type definitions
- **Constants:** 7 role and permission constants

**Major Export Groups:**
- Authentication: 70+ exports
- Validation: 45+ exports
- Security: 85+ exports
- Logging/Audit: 35+ exports
- Cache/CORS: 25+ exports

---

## Related Documentation

- [Middleware Organization](/docs/middleware-organization.md) - Module structure and dependencies
- [Middleware Export Analysis](/docs/notes/middleware-export-analysis.md) - Detailed export breakdown
- [OWASP Top 10 Coverage](/docs/owasp-coverage.md) - Security risk mapping

---

**Document Version:** 2.0.0  
**Last Reviewed:** 2026-08-30  
**Next Review:** 2026-09-30  
**Related Beads:** 
- mtamyway-6920afa1 (comprehensive catalog update)
- mtamyway-7c0d0835 (original catalog)
- mtamyway-f657f114 (session verification)
