# Middleware Configuration Documentation

**Last Updated:** 2026-08-30  
**Purpose:** Reference documentation for middleware configuration and execution order in mta-my-way

## Overview

The mta-my-way application uses a defense-in-depth security architecture with multiple middleware layers executing in a carefully designed order. This document captures the current middleware configuration, execution order, and key implementation details.

## Middleware Execution Order

### Global Middleware (Applied to All Routes)

**File:** `packages/server/src/app.ts` (lines 430-490)

```typescript
// 1. Request ID (first, for correlation)
app.use("*", requestId);

// 2. Security headers (early, for all responses)
app.use("*", securityHeaders({ reportUri: "/api/security/csp-report" }));

// 3. Security logging (for all requests)
app.use("*", securityLogging());

// 4. HTTP method restrictions
app.use("*", httpMethodRestrictions());

// 5. Request smuggling protection
app.use("*", httpRequestSmuggling());

// 6. Response splitting protection
app.use("*", httpResponseSplitting());

// 7. Host header protection
app.use("*", hostHeaderProtection({ allowedHosts, blockMissingHost: isProduction }));

// 8. Distributed tracing
app.use("*", tracingMiddleware);

// 9. Request size limits
app.use("*", requestSizeLimits());

// 10. Path traversal prevention
app.use("*", pathTraversalPrevention());
```

### API-Specific Middleware (Applied to `/api/*` Routes)

**File:** `packages/server/src/app.ts` (lines 485-627)

```typescript
// Input validation and protection
app.use("/api/*", inputSanitization());
app.use("/api/*", ssrfProtection());
app.use("/api/*", validateContentType());
app.use("/api/*", jsonDepthProtection());

// Authentication and session security
app.use("/api/*", optionalAuth({ allowSessions: true }));
app.use("/api/*", sessionSecurity());

// Post-authentication protections
app.use("/api/*", csrfProtection({ excludePaths: [...] }));
app.use("/api/*", hppProtection({ strategy: "first" }));
app.use("/api/*", openRedirectProtection());
```

## SessionSecurity Middleware Configuration

**File:** `packages/server/src/middleware/session-security.ts`

### Configuration Options

```typescript
export interface SessionSecurityMiddlewareOptions {
  /** Whether to enforce IP binding */
  enforceIpBinding?: boolean;
  /** Whether to check user agent changes */
  checkUserAgent?: boolean;
  /** Risk threshold for blocking (0-100) */
  riskThreshold?: number;
  /** Whether to require re-authentication on high risk */
  reauthOnHighRisk?: boolean;
}

// Default middleware export with configurable options
export function sessionSecurity(options: SessionSecurityMiddlewareOptions = {}) {
  const { 
    enforceIpBinding = true, 
    checkUserAgent = true, 
    riskThreshold = 75,
    reauthOnHighRisk = true 
  } = options;
  // ... implementation
}
```

### Key Features

1. **IP Address Binding Enforcement**
   - IPv4: /24 subnet (255.255.255.0)
   - IPv6: /64 subnet
   - Configurable via `enforceIpBinding` option

2. **User-Agent Change Detection**
   - Similarity scoring algorithm
   - Detects browser/device changes
   - Configurable via `checkUserAgent` option

3. **Session Risk Assessment**
   - 0-100 scale scoring
   - Multiple risk factors combined
   - Configurable threshold via `riskThreshold`

4. **Device Trust Management**
   - Tracks known/trusted devices
   - Persists trust across sessions

5. **Impossible Travel Detection**
   - Geographic analysis
   - Velocity-based anomaly detection

6. **Risk-Based Session Blocking**
   - Automatic blocking on high risk
   - Requires re-authentication
   - Configurable via `reauthOnHighRisk`

### Default Configuration

```typescript
{
  enforceIpBinding: true,
  checkUserAgent: true,
  riskThreshold: 75,
  reauthOnHighRisk: true
}
```

## OptionalAuth Middleware with allowSessions=true

**File:** `packages/server/src/middleware/authentication.ts` (lines 3020-3104)

### Configuration

```typescript
export function optionalAuth(options: { allowSessions?: boolean } = {}): MiddlewareHandler {
  return async (c, next) => {
    const { allowSessions = true } = options;
    
    // Try session authentication first if allowSessions is enabled
    if (allowSessions) {
      const sessionToken = extractSessionToken(c);
      if (sessionToken) {
        const session = getSession(sessionToken);
        if (session && validateSession(session, clientIp, c)) {
          const apiKey = getApiKey(session.keyId);
          if (apiKey && apiKey.active) {
            // Set auth context for authenticated sessions
            const authContext: AuthContext = {
              keyId: apiKey.keyId,
              scope: apiKey.scope,
              role: apiKey.role,
              // ... other properties
              authMethod: "session",
            };
            c.set("auth", authContext);
            return next();
          }
        }
      }
    }
    
    // Try API key authentication as fallback
    const apiKeyData = extractApiKey(c);
    // ... API key validation logic
    return next();
  };
}
```

### Usage in Application

**File:** `packages/server/src/app.ts` (line 555)

```typescript
app.use("/api/*", optionalAuth({ allowSessions: true }));
```

### Authentication Flow

1. **Session Token Extraction**
   - Extracts session token from request
   - Token format: Bearer token or cookie

2. **Session Validation**
   - Checks session exists and is active
   - Validates against client IP (if IP binding enabled)
   - Checks session expiration

3. **API Key Lookup**
   - Retrieves API key from session's keyId
   - Validates API key is active

4. **Auth Context Construction**
   - Builds auth context with:
     - `keyId`: API key identifier
     - `scope`: API key permissions scope
     - `role`: User role
     - `authMethod`: Set to "session"
     - Additional properties as needed

5. **Fallback to API Key Auth**
   - If session auth fails, attempts API key auth
   - Supports direct API key authentication

### Configuration Options

- **`allowSessions`** (default: `true`): Enables session-based authentication
  - When `true`: Tries session auth first, then API key auth
  - When `false`: Only API key authentication

## Critical Execution Order Details

### Why Order Matters

1. **Request ID First**
   - Must be first for request correlation
   - All subsequent logs reference this ID

2. **Security Headers Early**
   - Applied to all responses, including errors
   - CSP, HSTS, X-Frame-Options, etc.

3. **Authentication Before Session Security**
   - `optionalAuth` runs **before** `sessionSecurity`
   - Intentional: sessionSecurity needs auth context
   - Allows session risk assessment based on authenticated user

4. **CSRF After Authentication**
   - CSRF protection runs after auth to avoid blocking legitimate auth flows
   - Authenticated requests have CSRF tokens validated

5. **Defense in Depth**
   - Multiple security layers
   - Each layer independent but complementary
   - Failure in one layer doesn't compromise all security

## Middleware Registration Points

### Primary Registration

**File:** `packages/server/src/app.ts`

1. **Global middleware registration** (lines 430-490)
   - Applied to all routes using `app.use("*", middleware)`

2. **API-specific middleware** (lines 485-627)
   - Applied to `/api/*` routes using `app.use("/api/*", middleware)`

3. **Route-specific middleware**
   - Applied to individual routes
   - Overrides or adds to global/API middleware

### Export/Import Structure

**Central Index:** `packages/server/src/middleware/index.ts`

All middleware is exported from a centralized index file:

```typescript
import {
  optionalAuth,
  sessionSecurity,
  cors,
  csrfProtection,
  // ... other middleware
} from "./middleware/index.js";
```

This provides:
- Single source of truth for middleware exports
- Consistent import paths
- Easier maintenance and refactoring

## Configuration Best Practices

### Adding New Middleware

1. **Determine scope**
   - Global (`*`), API-specific (`/api/*`), or route-specific

2. **Consider execution order**
   - Security early
   - Authentication before authorization
   - Logging first for correlation

3. **Export from middleware/index.ts**
   - Maintain centralized exports
   - Follow existing patterns

4. **Document configuration options**
   - Add TypeScript interfaces for options
   - Document default values
   - Update this file

### Modifying Existing Middleware

1. **Check execution order dependencies**
   - Does other middleware depend on this?
   - Does this depend on other middleware?

2. **Update configuration interfaces**
   - Add new options to interfaces
   - Provide sensible defaults

3. **Update documentation**
   - Record changes in this file
   - Note breaking changes

## Related Documentation

- `packages/server/src/middleware/` - Individual middleware implementations
- `packages/server/src/app.ts` - Middleware registration and order
- Bead: `mtamyway-f657f114` - Parent tracking bead for session/auth work
- Bead: `mtamyway-e00e2710` - This documentation bead

## Future Considerations

### Potential Improvements

1. **Middleware Configuration File**
   - Consider externalizing middleware config to JSON/YAML
   - Would allow runtime configuration without code changes

2. **Middleware Grouping**
   - Could group related middleware (e.g., all auth middleware)
   - Would simplify app.ts registration

3. **Conditional Middleware**
   - Environment-specific middleware (dev vs prod)
   - Feature-flagged middleware

4. **Performance Monitoring**
   - Add timing middleware for performance tracking
   - Monitor middleware execution time

### Security Considerations

1. **Regular Security Audits**
   - Review middleware for CVEs
   - Update dependencies regularly

2. **Configuration Validation**
   - Validate middleware options at startup
   - Fail fast on misconfiguration

3. **Rate Limiting Enhancement**
   - Consider more sophisticated rate limiting
   - Per-user, per-route, and global limits

---

**Document maintained as part of bead mtamyway-e00e2710**
