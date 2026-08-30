# Middleware Organization Structure

## Overview

The middleware in `mta-my-way` is organized as a **flat directory structure** with centralized exports, providing clear separation of concerns and maintainability.

## Directory Structure

```
packages/server/src/middleware/
├── index.ts                                    # Central export hub (all middleware re-exported here)
├── authentication.ts                           # API keys, sessions, password management
├── authorization.ts                            # Basic RBAC and resource access control
├── rbac.ts                                    # Advanced role-based access control
├── enhanced-authorization.ts                  # Dynamic resource authorization
├── authorization-security.ts                  # Behavioral analysis & time-based access
├── rate-limiter.ts                            # General rate limiting (token bucket)
├── auth-rate-limit.ts                         # Authentication-specific rate limiting
├── csrf-protection.ts                         # CSRF token validation
├── security-headers.ts                        # CSP, HSTS, security headers
├── security-logging.ts                        # Security event logging
├── input-sanitization.ts                      # XSS and injection prevention
├── validation.ts                              # Request validation (params, query, body)
├── content-type.ts                            # Content-Type header validation
├── header-validation.ts                       # General header validation
├── cors.ts                                    # CORS configuration
├── cache.ts                                   # Cache control headers
├── path-traversal.ts                          # Directory traversal prevention
├── ssrf-protection.ts                         # Server-Side Request Forgery protection
├── open-redirect.ts                          # Open redirect protection
├── host-header-protection.ts                  # Host header validation
├── http-request-smuggling.ts                  # HTTP request smuggling detection
├── http-response-splitting.ts                 # CRLF injection prevention
├── http-method-restrictions.ts               # Dangerous HTTP method blocking
├── parameter-pollution.ts                     # HPP (HTTP Parameter Pollution) protection
├── mass-assignment.ts                         # Mass assignment attack prevention
├── json-depth-protection.ts                   # JSON DoS prevention
├── request-limits.ts                          # Request size limits
├── response-size-limits.ts                    # Response size limits
├── jwt-validation.ts                          # JWT validation and verification
├── enhanced-jwt-security.ts                   # JWT replay detection & compromise detection
├── token-encryption.ts                        # Token encryption utilities
├── session-security.ts                       # Session risk assessment & device tracking
├── session-middleware-integration.test.ts    # Session integration tests
├── concurrent-session-management.ts          # Multi-session management
├── cookie-security.ts                        # Cookie security & signing
├── password-management.ts                     # Password policy, reset, history
├── api-key-management.ts                      # API key CRUD operations
├── admin-operations.ts                        # Admin-only operations
├── dependency-security.ts                     # Dependency vulnerability scanning
├── subresource-integrity.ts                   # SRI hash generation
├── captcha.ts                                 # CAPTCHA verification
├── suspicious-activity-notifications.ts       # Security event notifications
├── audit-log.ts                               # Audit logging utilities
├── structured-audit-log.ts                    # Structured compliance audit logs
├── enhanced-authentication.ts                # Enhanced auth with additional verification
├── dynamic-rbac-cache.ts                      # RBAC cache management
├── request-id.ts                              # Request ID generation
├── roles.ts                                   # Role definitions
├── sanitization.ts                           # Input sanitization utilities
└── [54 test files alongside implementation files]
```

## Organization Pattern

### 1. **Flat Export Architecture**
- All middleware files are in a single directory (`packages/server/src/middleware/`)
- No subdirectories or nested folder structures
- **Central export hub**: `index.ts` re-exports all middleware functions
- **Import pattern**: `import { middlewareName } from "./middleware/index.js"`

### 2. **Naming Conventions**

#### File Naming (Kebab-Case)
- Pattern: `purpose-description.ts`
- Examples:
  - `authentication.ts` (core authentication)
  - `csrf-protection.ts` (specific security concern)
  - `rate-limiter.ts` (functional middleware)
  - `enhanced-authorization.ts` (enhanced version)

#### Function Naming (camelCase)
- Middleware functions: `camelCase()`  
  - Examples: `securityHeaders()`, `rateLimiter()`, `csrfProtection()`
- Utility functions: `camelCase()`
  - Examples: `getSanitizedQuery()`, `validateCsrfToken()`

#### Test Files
- Pattern: `{module}.test.ts`
- Integration tests: `{module}-integration.test.ts`
- Examples:
  - `authentication.test.ts`
  - `session-middleware-integration.test.ts`

### 3. **Functional Categorization**

#### **Authentication & Authorization**
- `authentication.ts` - API keys, sessions, passwords
- `authorization.ts` - Basic RBAC
- `rbac.ts` - Advanced role-based access control
- `enhanced-authorization.ts` - Dynamic resource authorization
- `authorization-security.ts` - Behavioral & time-based access
- `password-management.ts` - Password policies and reset
- `api-key-management.ts` - API key lifecycle

#### **Session Management**
- `session-security.ts` - Risk assessment, device tracking
- `concurrent-session-management.ts` - Multi-session handling
- `cookie-security.ts` - Cookie signing and validation

#### **Security Protection**
- `csrf-protection.ts` - CSRF tokens
- `security-headers.ts` - CSP, HSTS, security headers
- `input-sanitization.ts` - XSS prevention
- `path-traversal.ts` - Directory traversal blocking
- `ssrf-protection.ts` - Server-Side Request Forgery
- `open-redirect.ts` - Redirect URL validation
- `host-header-protection.ts` - Host header validation
- `http-request-smuggling.ts` - Request smuggling detection
- `http-response-splitting.ts` - CRLF injection prevention
- `http-method-restrictions.ts` - Dangerous method blocking
- `parameter-pollution.ts` - HPP protection
- `mass-assignment.ts` - Overwrite prevention
- `json-depth-protection.ts` - JSON DoS prevention

#### **Rate Limiting**
- `rate-limiter.ts` - General rate limiting (60 req/min)
- `auth-rate-limit.ts` - Auth-specific rate limiting

#### **Validation**
- `validation.ts` - Request validation (params, query, body)
- `content-type.ts` - Content-Type validation
- `header-validation.ts` - Header validation

#### **Token & JWT Security**
- `jwt-validation.ts` - JWT validation
- `enhanced-jwt-security.ts` - Replay detection
- `token-encryption.ts` - Token encryption utilities

#### **Caching**
- `cache.ts` - Cache control headers

#### **Logging & Audit**
- `security-logging.ts` - Security event logging
- `audit-log.ts` - Audit logging
- `structured-audit-log.ts` - Compliance audit logs
- `suspicious-activity-notifications.ts` - Security notifications

#### **Additional Security**
- `dependency-security.ts` - Dependency vulnerability scanning
- `subresource-integrity.ts` - SRI hashes
- `captcha.ts` - CAPTCHA verification

#### **Infrastructure**
- `request-id.ts` - Request correlation IDs
- `cors.ts` - CORS configuration
- `request-limits.ts` - Request size limits
- `response-size-limits.ts` - Response size limits
- `admin-operations.ts` - Admin operations
- `roles.ts` - Role definitions
- `sanitization.ts` - Sanitization utilities

## Middleware Application Pattern (from `app.ts`)

The middleware is applied in a **specific order** to ensure proper security layering:

### 1. **Global Infrastructure** (applies to all routes)
```typescript
app.use("*", requestId);                    // Request correlation
app.use("*", securityHeaders());            // CSP, HSTS
app.use("*", securityLogging());            // Security event logging
app.use("*", httpMethodRestrictions());     // Block dangerous methods
app.use("*", httpRequestSmuggling());       // Smuggling detection
app.use("*", httpResponseSplitting());      // CRLF injection prevention
app.use("*", hostHeaderProtection());       // Host validation
app.use("*", tracingMiddleware);            // Distributed tracing
app.use("*", requestSizeLimits());          // DoS protection
app.use("*", pathTraversalPrevention());     // Directory traversal
```

### 2. **API-Specific Middleware** (`/api/*` routes)
```typescript
app.use("/api/*", inputSanitization());          // XSS prevention
app.use("/api/*", ssrfProtection());             // SSRF blocking
app.use("/api/*", validateContentType());        // Content-Type validation
app.use("/api/*", jsonDepthProtection());        // JSON DoS prevention
app.use("/api/*", optionalAuth({ allowSessions: true })); // Auth parsing
app.use("/api/*", sessionSecurity());            // Session validation
app.use("/api/*", csrfProtection());             // CSRF tokens
app.use("/api/*", hppProtection());              // Parameter pollution
app.use("/api/*", openRedirectProtection());     // Redirect validation
app.use("/api/*", massAssignmentProtection());   // Field filtering
app.use("/api/*", httpMetrics());                // HTTP metrics
app.use("/api/*", rateLimiter());                // Rate limiting
app.use("/api/*", responseSizeLimits());         // Response limits
app.use("/api/*", compressionMiddleware());      // Response compression
```

### 3. **Route-Specific Authorization**
```typescript
app.post("/api/commute/analyze",
  requireResourceAccess("commute", "create"),
  requirePermission("commutes:create"),
  auditLogAccess("commute", "create"),
  handler
);
```

## Import Patterns

### **Recommended Pattern** (from central export hub)
```typescript
import {
  securityHeaders,
  csrfProtection,
  rateLimiter,
  optionalAuth,
  requirePermission
} from "./middleware/index.js";
```

### **Direct Imports** (for specific files)
```typescript
import { authentication } from "./middleware/authentication.js";
import { rbac } from "./middleware/rbac.js";
```

## File Organization Characteristics

### **Flat Structure Benefits**
- ✅ Simple navigation (all files in one place)
- ✅ Easy to discover all available middleware
- ✅ Clear naming conventions prevent collisions
- ✅ Centralized exports simplify imports

### **Categorization by File Purpose**
Each file groups related functionality:
- **Single concern**: `request-id.ts` (only request IDs)
- **Security suite**: `authentication.ts` (multiple auth functions)
- **Enhanced variants**: `enhanced-authorization.ts` (extends `authorization.ts`)

### **Testing Strategy**
- Test files alongside implementation (co-located)
- Integration tests in separate `integration/` directory
- Naming convention: `{module}.test.ts`

## Summary

The middleware organization follows a **flat, purpose-driven architecture**:

1. **Structure**: Single directory with ~67 implementation files
2. **Naming**: Kebab-case files, camelCase exports
3. **Exports**: Centralized through `index.ts`
4. **Categories**: Organized by security concern and functionality
5. **Application**: Layered middleware stack with clear precedence
6. **Maintenance**: Co-located tests with implementation

This organization prioritizes **discoverability** and **clear separation of concerns** over hierarchical nesting, making it easy to find, understand, and extend middleware functionality.
