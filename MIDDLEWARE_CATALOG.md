# Middleware Configuration Catalog

## Overview
This document catalogs all middleware configuration files in the MTA My Way codebase, including where middleware is defined, registered, and how the middleware initialization chain works.

## Main Middleware Directory
**Location**: `/packages/server/src/middleware/`

This directory contains all middleware modules. As of 2026-08-28, there are **82 middleware files** (excluding test files).

## Middleware Export Aggregator
**File**: `/packages/server/src/middleware/index.ts`

This is the central export file that re-exports all middleware functions from individual modules. It contains:
- 585 lines of exports
- Exports all middleware functions, types, and utilities
- Organized by functionality (authentication, security, validation, etc.)

## Key Middleware Definitions

### 1. optionalAuth
**File**: `/packages/server/src/middleware/authentication.ts` (line 3025)

**Function Signature**:
```typescript
export function optionalAuth(options: { allowSessions?: boolean } = {}): MiddlewareHandler
```

**Purpose**: Optional authentication middleware that attaches auth context if credentials are provided, but doesn't require them. Useful for endpoints that have enhanced features for authenticated users.

**Behavior**:
- Parses Authorization header for API key authentication
- Checks session cookies if `allowSessions: true`
- Attaches `AuthContext` to `c.set("auth")` if authenticated
- Continues to next middleware regardless of authentication status

### 2. sessionSecurity
**File**: `/packages/server/src/middleware/session-security.ts` (line 833)

**Function Signature**:
```typescript
export function sessionSecurity(options: SessionSecurityMiddlewareOptions = {})
```

**Purpose**: Enhances session validation with risk assessment and additional security checks.

**Behavior**:
- Enforces IP binding (configurable, checks /24 subnet for IPv4, /64 for IPv6)
- Validates User-Agent consistency
- Assesses session risk score
- Detects impossible travel scenarios
- Updates device trust levels

## Middleware Registration Chain

### Main Application Setup
**File**: `/packages/server/src/app.ts`

The `createApp` function (lines 393-2444) registers middleware in the following order:

#### Global Middleware (Applied to `*`)
1. **requestId** (line 430) - Request ID for correlation
2. **securityHeaders** (line 434) - CSP, X-Content-Type-Options, etc.
3. **securityLogging** (line 443) - Security event logging
4. **httpMethodRestrictions** (line 447) - Blocks dangerous methods
5. **httpRequestSmuggling** (line 451) - Request smuggling protection
6. **httpResponseSplitting** (line 455) - CRLF injection protection
7. **hostHeaderProtection** (line 463) - Host header validation
8. **tracingMiddleware** (line 475) - Distributed tracing
9. **requestSizeLimits** (line 478) - DoS protection
10. **pathTraversalPrevention** (line 482) - Directory traversal protection

#### API-Specific Middleware (Applied to `/api/*`)
11. **inputSanitization** (line 485) - XSS, SQL injection prevention
12. **ssrfProtection** (line 490) - SSRF prevention
13. **validateContentType** (line 494) - Content-Type validation
14. **jsonDepthProtection** (line 498) - JSON depth DoS protection
15. **massAssignmentProtection** (line 539) - Mass assignment prevention
16. **optionalAuth({ allowSessions: true })** (line 544) - Optional authentication
17. **sessionSecurity()** (line 548) - Session security validation
18. **csrfProtection** (line 555) - CSRF token validation
19. **hppProtection** (line 582) - HTTP parameter pollution protection
20. **openRedirectProtection** (line 586) - Open redirect prevention
21. **massAssignmentProtection** (line 591) - Additional mass assignment prevention
22. **httpMetrics** (line 594) - HTTP metrics collection
23. **rateLimiter** (line 597) - Rate limiting (60 req/min)
24. **responseSizeLimits** (line 604) - Response size limits
25. **compressionMiddleware** (line 607) - Brotli/gzip/deflate compression

## Route-Specific Middleware

### Password Reset Routes
**File**: `/packages/server/src/routes/password-reset.routes.ts`

**Function**: `buildPasswordResetRoutes()` (lines 675-707)

Applies additional middleware to password reset endpoints:
- `authRateLimit("strict")` - Strict rate limiting (5 req/min)
- `requireCaptcha` - CAPTCHA after rate limit violations
- `auditLogAccess` - Audit logging
- `requireResourceAccess` - Resource authorization

### Preferences Routes
**File**: `/packages/server/src/routes/preferences.routes.ts`

**Function**: `buildPreferencesRoutes()` (lines 55-152)

Implements session-only authentication:
- Validates `authMethod === "session"` (no API key access)
- Requires authenticated session for preference sync
- Provides session status and revocation endpoints

## Middleware Initialization Order

The middleware chain executes in the following order for a typical API request:

1. **Pre-authentication Security**
   - Request ID generation
   - Security headers injection
   - Security logging initialization
   - HTTP method validation
   - Request/response smuggling prevention
   - Host header validation
   - Tracing setup
   - Request size validation
   - Path traversal checks

2. **API-specific Security**
   - Input sanitization
   - SSRF protection
   - Content type validation
   - JSON depth validation
   - Mass assignment protection

3. **Authentication & Session**
   - **optionalAuth** - Parses credentials, sets auth context
   - **sessionSecurity** - Validates session security
   - CSRF protection

4. **Post-authentication Security**
   - HPP protection
   - Open redirect protection
   - Additional mass assignment protection
   - Metrics collection
   - Rate limiting
   - Response size limits

5. **Response Processing**
   - Compression (brotli/gzip/deflate)

## Key Design Principles

1. **Defense in Depth**: Multiple layers of security middleware
2. **Fail-Safe**: Security middleware defaults to safe behavior
3. **Optional Auth**: Anonymous access preserved for core features
4. **Session-Only Routes**: Preferences API enforces session authentication
5. **Rate Limiting**: Strict limits on sensitive operations (password reset)
6. **Audit Logging**: All privileged operations are logged
7. **CSP Reporting**: Dedicated endpoint for CSP violations (registered before mass assignment)

## Middleware Configuration Files Summary

| File | Purpose | Lines |
|------|---------|-------|
| `middleware/index.ts` | Central export aggregator | 585 |
| `middleware/authentication.ts` | API key, session, optionalAuth | 3,300+ |
| `middleware/session-security.ts` | Session security, risk assessment | 950+ |
| `middleware/authorization.ts` | RBAC, permissions | 620+ |
| `middleware/csrf-protection.ts` | CSRF token validation | 400+ |
| `middleware/rate-limiter.ts` | Rate limiting | 170+ |
| `middleware/security-headers.ts` | CSP, security headers | 550+ |
| `middleware/password-management.ts` | Password policy, hashing | 1,800+ |
| `app.ts` | Middleware registration | 3,100+ |
| `routes/password-reset.routes.ts` | Route-specific middleware | 700+ |
| `routes/preferences.routes.ts` | Preferences API middleware | 150+ |

## Acceptance Criteria Status

✅ All middleware configuration files identified
✅ File paths and structure documented  
✅ Clear understanding of where middleware is registered
✅ Middleware initialization chain mapped
✅ sessionSecurity definition located and documented
✅ optionalAuth definition located and documented
✅ Ready to verify specific middleware configurations

## Next Steps

This catalog provides the foundation for:
1. Verifying specific middleware configurations (e.g., sessionSecurity options)
2. Adding new middleware to the chain
3. Understanding middleware interaction and ordering
4. Debugging middleware-related issues
