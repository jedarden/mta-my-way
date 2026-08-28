# Middleware Configuration Catalog

## Overview

MTA My Way uses a comprehensive middleware architecture built on Hono. All middleware is centralized in `packages/server/src/middleware/` and exported through a barrel export file (`index.ts`).

## Core Structure

```
packages/server/src/
├── middleware/
│   ├── index.ts                          # Barrel exports - all middleware
│   ├── authentication.ts                 # API key, session, OAuth, MFA
│   ├── session-security.ts              # IP binding, device trust, risk assessment
│   ├── authorization.ts                  # Resource-based access control
│   ├── rbac.ts                          # Role-based access control
│   ├── csrf-protection.ts               # CSRF token validation
│   ├── security-headers.ts              # CSP, HSTS, X-Frame-Options
│   ├── security-logging.ts              # Security event logging
│   ├── rate-limiter.ts                  # Rate limiting (60 req/min default)
│   ├── validation.ts                    # Request validation (body, query, params)
│   ├── cors.ts                          # CORS configuration
│   └── [70+ additional security middleware files]
└── app.ts                               # Main application - middleware registration
```

## Middleware Registration Chain

The middleware is registered in `app.ts` in a specific order (lines 430-607):

### Phase 1: Global Infrastructure (All Routes)
1. **requestId** (line 430) - Request correlation ID
2. **securityHeaders** (line 434) - CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy
3. **securityLogging** (line 443) - Logs auth failures, rate limit exceeded, blocked attacks
4. **httpMethodRestrictions** (line 447) - Blocks TRACE, CONNECT
5. **httpRequestSmuggling** (line 451) - Detects request smuggling attempts
6. **httpResponseSplitting** (line 455) - Detects CRLF injection
7. **hostHeaderProtection** (line 463) - Cache poisoning prevention
8. **tracingMiddleware** (line 475) - Distributed tracing
9. **requestSizeLimits** (line 478) - DoS protection
10. **pathTraversalPrevention** (line 482) - Directory traversal protection

### Phase 2: API-Specific Middleware (/api/*)
11. **inputSanitization** (line 485) - XSS, SQL injection prevention
12. **ssrfProtection** (line 490) - Server-Side Request Forgery prevention
13. **validateContentType** (line 494) - Content-Type validation
14. **jsonDepthProtection** (line 498) - Prevents DoS via deeply nested JSON
15. **massAssignmentProtection** (line 539) - OWASP A08 protection
16. **optionalAuth** (line 544) - Parses Authorization header, sets auth context
17. **sessionSecurity** (line 548) - Enhanced session validation
18. **csrfProtection** (line 556) - CSRF token validation (state-changing ops)
19. **hppProtection** (line 582) - Parameter pollution protection
20. **openRedirectProtection** (line 586) - Blocks malicious redirects
21. **httpMetrics** (line 594) - Prometheus metrics collection
22. **rateLimiter** (line 597) - 60 req/min per IP
23. **responseSizeLimits** (line 604) - DoS protection
24. **compressionMiddleware** (line 607) - Brotli/gzip/deflate

## Key Middleware Files

### 1. sessionSecurity (`middleware/session-security.ts`)

**Location:** `/home/coding/mta-my-way/packages/server/src/middleware/session-security.ts`

**Purpose:** Enhanced session security with risk assessment and advanced security checks

**Key Functions:**
- `sessionSecurity(options)` - Main middleware function (line 833)
- `assessSessionRisk()` - Risk scoring (0-100) based on IP, UA, session age (line 455)
- `parseIpAddress()` - IP parsing and classification (line 153)
- `areIpsInSameSubnet()` - Subnet matching (line 216)
- `analyzeUserAgent()` - User agent analysis (line 316)
- `calculateUserAgentSimilarity()` - UA similarity scoring (line 384)
- `detectImpossibleTravel()` - Impossible travel detection (line 738)
- `getOrCreateDeviceTrust()` - Device trust management (line 635)
- `updateDeviceTrust()` - Trust promotion (line 664)
- `calculateDistance()` - Haversine distance calculation (line 789)

**Security Features:**
- IP binding enforcement (IPv4 /24, IPv6 /64)
- User-Agent change detection
- Session risk assessment (0-100 score)
- Device trust levels (unknown, untrusted, trusted, highly_trusted)
- Impossible travel detection
- Session age and idle time checks

**Options:**
```typescript
interface SessionSecurityMiddlewareOptions {
  enforceIpBinding?: boolean;        // Default: true
  checkUserAgent?: boolean;          // Default: true
  riskThreshold?: number;             // 0-100
  reauthOnHighRisk?: boolean;        // Default: true
}
```

**Risk Levels:**
- 0-19: low (allow)
- 20-49: medium (monitor)
- 50-79: high (challenge/re-auth)
- 80-100: critical (block)

### 2. optionalAuth (`middleware/authentication.ts`)

**Location:** `/home/coding/mta-my-way/packages/server/src/middleware/authentication.ts`

**Purpose:** Optional authentication that attaches auth context if credentials provided, but doesn't require them

**Key Functions:**
- `optionalAuth(options)` - Main middleware function (line 3025)
- `apiKeyAuth()` - Required API key authentication (line 2244)
- `signedRequestAuth()` - HMAC signature verification (line 2547)
- `getAuthContext()` - Retrieve auth context (line 3109)
- `isAuthenticated()` - Check authentication status (line 3116)
- `requireScope()` - Require specific permission scope (line 3123)

**Options:**
```typescript
{
  allowSessions?: boolean;  // Default: true
}
```

**Authentication Flow:**
1. First tries session authentication (if `allowSessions: true`)
2. Falls back to API key authentication
3. Attaches `AuthContext` to Hono context if successful
4. Always calls `next()` - never blocks requests

**AuthContext Structure:**
```typescript
interface AuthContext {
  keyId: string;
  scope: ApiKeyScope;          // "read" | "write" | "admin"
  role?: UserRole;             // "admin" | "user" | "guest"
  additionalPermissions?: Permission[];
  sessionId?: string;
  rateLimitTier: number;
  authMethod: "session" | "api_key";
  oauthProvider?: string;
  mfaVerified?: boolean;
}
```

### 3. Middleware Index Barrel (`middleware/index.ts`)

**Location:** `/home/coding/mta-my-way/packages/server/src/middleware/index.ts`

**Purpose:** Central export point for all middleware (586 lines)

**Key Export Categories:**

#### Core Infrastructure
- `requestId` - Request correlation IDs
- `rateLimiter` - Rate limiting
- `securityHeaders` - Security headers

#### Validation
- `validateBody`, `validateQuery`, `validateParams` - Request validation
- `validateContentType` - Content-Type validation

#### Authentication & Session
- `optionalAuth` - Optional authentication
- `apiKeyAuth` - Required API key auth
- `sessionSecurity` - Enhanced session validation
- `csrfProtection` - CSRF protection
- `createSession` - Session creation
- `invalidateSession` - Session invalidation

#### Authorization
- `requirePermission` - RBAC permission check
- `requireResourceAccess` - Resource-based access control
- `requireSameOrigin` - Same-origin enforcement
- `auditLogAccess` - Audit logging

#### Security Protections
- `inputSanitization` - Input sanitization
- `pathTraversalPrevention` - Path traversal prevention
- `ssrfProtection` - SSRF prevention
- `hostHeaderProtection` - Host header validation
- `httpMethodRestrictions` - HTTP method filtering
- `httpRequestSmuggling` - Request smuggling detection
- `httpResponseSplitting` - Response splitting detection
- `hppProtection` - Parameter pollution protection
- `openRedirectProtection` - Open redirect protection
- `massAssignmentProtection` - Mass assignment prevention
- `jsonDepthProtection` - JSON depth limiting
- `responseSizeLimits` - Response size limiting

#### CORS & Caching
- `cors` - CORS configuration
- `staticCache`, `apiCache`, `noCache` - Cache control

#### Utility
- `getClientIp` - Client IP extraction
- `getUserAgent` - User agent extraction
- `generateApiKey`, `hashApiKey` - API key management

## Middleware Usage in app.ts

### Registration Pattern
```typescript
// Global middleware (all routes)
app.use("*", requestId);
app.use("*", securityHeaders({ reportUri: "/api/security/csp-report" }));

// API-specific middleware
app.use("/api/*", inputSanitization());
app.use("/api/*", optionalAuth({ allowSessions: true }));
app.use("/api/*", sessionSecurity());

// Route-specific middleware
app.post("/api/commute/analyze",
  requireResourceAccess("commute", "create"),
  requirePermission("commutes:create" as Permission),
  auditLogAccess("commute", "create"),
  async (c) => { /* handler */ }
);
```

### Middleware Ordering Dependencies

**Critical Ordering:**
1. `requestId` MUST run before `securityLogging` (needs correlation ID)
2. `optionalAuth` MUST run before `sessionSecurity` (sets auth context)
3. `sessionSecurity` MUST run before `csrfProtection` (validates session first)
4. `/api/security/csp-report` MUST be registered before `massAssignmentProtection` (accepts nested objects)
5. Validation middleware (`validateBody`, `validateQuery`, `validateParams`) must be called explicitly in route handlers

## Complete Middleware File List

### Authentication & Authorization (8 files)
- `authentication.ts` - API keys, sessions, OAuth, MFA
- `authorization.ts` - Resource-based access control
- `rbac.ts` - Role-based access control
- `enhanced-authorization.ts` - Enhanced authorization
- `enhanced-authentication.ts` - Enhanced authentication
- `authorization-security.ts` - Time/location-based access
- `api-key-management.ts` - API key CRUD operations
- `admin-operations.ts` - Admin-specific operations

### Session Management (3 files)
- `session-security.ts` - IP binding, device trust, risk assessment
- `concurrent-session-management.ts` - Multi-session handling
- `cookie-security.ts` - Secure cookie handling

### Security Protections (15 files)
- `csrf-protection.ts` - CSRF token validation
- `security-headers.ts` - CSP, HSTS, security headers
- `security-logging.ts` - Security event logging
- `rate-limiter.ts` - Rate limiting
- `auth-rate-limit.ts` - Auth-specific rate limiting
- `input-sanitization.ts` - XSS, SQL injection prevention
- `mass-assignment.ts` - Mass assignment protection
- `ssrf-protection.ts` - SSRF prevention
- `open-redirect.ts` - Open redirect protection
- `path-traversal.ts` - Path traversal prevention
- `json-depth-protection.ts` - JSON depth limiting
- `host-header-protection.ts` - Host header validation
- `http-method-restrictions.ts` - HTTP method filtering
- `http-request-smuggling.ts` - Request smuggling detection
- `http-response-splitting.ts` - Response splitting detection

### HTTP Security (5 files)
- `cors.ts` - CORS configuration
- `header-validation.ts` - Header validation
- `parameter-pollution.ts` - HPP protection
- `content-type.ts` - Content-Type validation
- `request-limits.ts` - Request size limits

### Cryptography (3 files)
- `token-encryption.ts` - Token encryption/decryption
- `enhanced-jwt-security.ts` - JWT validation with compromise detection
- `jwt-validation.ts` - JWT validation
- `subresource-integrity.ts` - SRI hash generation

### Validation (3 files)
- `validation.ts` - Request validation (body, query, params)
- `sanitization.ts` - Input sanitization
- `captcha.ts` - CAPTCHA verification

### Audit & Logging (3 files)
- `audit-log.ts` - Audit logging
- `structured-audit-log.ts` - Structured audit events
- `suspicious-activity-notifications.ts` - Security event notifications

### Utility & Infrastructure (8 files)
- `request-id.ts` - Request correlation IDs
- `cache.ts` - Cache control headers
- `response-size-limits.ts` - Response size limiting
- `metrics.ts` - Prometheus metrics
- `roles.ts` - Role definitions
- `dependency-security.ts` - Dependency vulnerability scanning
- `password-management.ts` - Password policies & hashing
- `dynamic-rbac-cache.ts` - RBAC caching

### Documentation
- `SESSION_MIDDLEWARE_VERIFICATION.md` - Session middleware verification report

## Summary

**Total Middleware Files:** 70+ TypeScript files

**Registration Point:** `packages/server/src/app.ts` (lines 430-607)

**Export Point:** `packages/server/src/middleware/index.ts` (586 lines)

**Key Middleware:**
- `sessionSecurity` - Enhanced session validation with risk assessment
- `optionalAuth` - Optional authentication for enhanced features
- 70+ additional security middleware covering OWASP Top 10 and more

**Middleware Chain:**
1. Global infrastructure (all routes)
2. API-specific protections (/api/*)
3. Route-specific authorization (individual endpoints)

The middleware architecture provides defense-in-depth security with comprehensive logging, audit trails, and risk assessment capabilities.
