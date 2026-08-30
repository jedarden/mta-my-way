# Test Helpers Reference Guide

**Package:** `@mta-my-way/shared/testing` and `@mta-my-way/server/src/integration`  
**Last Updated:** 2026-08-30

Complete reference documentation for all testing helper functions with detailed parameters, return types, usage examples, and edge cases.

---

## Table of Contents

1. [Core Test Helpers](#core-test-helpers)
   - [Mock Data Generators](#mock-data-generators)
   - [Test Fixtures](#test-fixtures)
   - [Assertion Helpers](#assertion-helpers)
   - [Mock Helpers](#mock-helpers)
   - [Test Setup Helpers](#test-setup-helpers)
   - [Time Utilities](#time-utilities)
   - [Performance Testing Utilities](#performance-testing-utilities)
   - [HTTP Testing Utilities](#http-testing-utilities)
   - [Async Testing Utilities](#async-testing-utilities)
2. [Security Testing Helpers](#security-testing-helpers)
   - [Mock Authentication](#mock-authentication)
   - [CSRF Protection](#csrf-protection)
   - [Rate Limiting](#rate-limiting)
   - [Input Validation](#input-validation)
   - [Security Context Mocking](#security-context-mocking)
   - [Security Event Mocking](#security-event-mocking)
   - [Password Testing Utilities](#password-testing-utilities)
   - [RBAC Testing Utilities](#rbac-testing-utilities)
   - [Audit Log Testing](#audit-log-testing)
   - [Mock Security Middleware](#mock-security-middleware)
   - [Test Assertions](#test-assertions)
3. [Integration Test Helpers](#integration-test-helpers)
   - [Database Setup](#database-setup)
   - [Data Factory Functions](#data-factory-functions)
   - [Authentication Helpers](#authentication-helpers)
   - [Test Cleanup](#test-cleanup)
   - [CSRF Request Helpers](#csrf-request-helpers)
4. [⚠️ Edge Cases and Gotchas](#edge-cases-and-gotchas)
   - [Override Merging Behavior](#override-merging-behavior)
   - [Timestamp Handling](#timestamp-handling)
   - [Unexpected Behaviors](#unexpected-behaviors)
   - [Troubleshooting Guide](#troubleshooting-guide)

---

## Security Testing Helpers

**Source:** `packages/shared/src/testing/security-helpers.ts`

### Mock Authentication

#### `createMockApiKey`

Creates a mock API key for testing authentication and authorization.

**Type Signature:**
```typescript
function createMockApiKey(overrides?: Partial<MockApiKey>): MockApiKey
```

**Parameters:**
- `overrides` (optional): Partial object to override default values

**Returns:** `MockApiKey` object with:
- `keyId: string` - Unique key identifier (default: `"key_test_123"`)
- `keyHash: string` - Hashed key value (auto-generated)
- `keySalt: string` - Salt used for hashing (auto-generated)
- `scope: string` - Permission scope (default: `"read:arrivals read:alerts"`)
- `role: string` - User role (default: `"user"`)
- `rateLimitTier: number` - Rate limit tier (default: `1`)
- `active: boolean` - Whether key is active (default: `true`)
- `createdAt: number` - Creation timestamp (default: 24 hours ago)
- `expiresAt: number` - Expiration timestamp (default: 1 year from now)
- `failedAttempts: number` - Failed authentication attempts (default: `0`)

**Usage Example:**
```typescript
import { createMockApiKey } from "@mta-my-way/shared/testing";

const defaultKey = createMockApiKey();
const adminKey = createMockApiKey({
  keyId: "admin_key",
  role: "admin",
  scope: "read:* write:*"
});

const expiredKey = createMockApiKey({
  active: false,
  expiresAt: Date.now() - 3600000 // expired 1 hour ago
});
```

**Edge Cases:**
- Always generates random `keyHash` and `keySalt` values - don't rely on them being stable across calls
- The `scope` field is a space-separated string, not an array - match your implementation's format
- Timestamps use millisecond precision - ensure consistent timezone handling (UTC recommended)

---

#### `createMockAuthToken`

Creates a mock authentication token (JWT or session token).

**Type Signature:**
```typescript
function createMockAuthToken(overrides?: Partial<MockAuthToken>): MockAuthToken
```

**Parameters:**
- `overrides` (optional): Partial object to override default values

**Returns:** `MockAuthToken` object with:
- `token: string` - Bearer token value (auto-generated with `Bearer ` prefix)
- `expiresAt: number` - Expiration timestamp (default: 1 hour from now)
- `scopes: string[]` - Array of permission scopes (default: `["read:arrivals", "read:alerts"]`)
- `userId: string` - User identifier (default: `"user_123"`)

**Usage Example:**
```typescript
import { createMockAuthToken } from "@mta-my-way/shared/testing";

const userToken = createMockAuthToken();
const adminToken = createMockAuthToken({
  userId: "admin_001",
  scopes: ["read:*", "write:*", "delete:*"],
  expiresAt: Date.now() + 7200000 // 2 hours
});

const expiredToken = createMockAuthToken({
  expiresAt: Date.now() - 1000 // expired
});

// Use in Authorization header
const headers = new Headers({
  "Authorization": userToken.token
});
```

**Edge Cases:**
- Token is prefixed with `"Bearer "` - don't add it again when setting headers
- `scopes` is an array, unlike `createMockApiKey` where `scope` is a space-separated string
- Expiration testing: use negative offsets for expired tokens, large offsets for non-expiring tokens

---

#### `createMockSession`

Creates a mock user session for session-based authentication testing.

**Type Signature:**
```typescript
function createMockSession(overrides?: Partial<MockSession>): MockSession
```

**Parameters:**
- `overrides` (optional): Partial object to override default values

**Returns:** `MockSession` object with:
- `sessionId: string` - Unique session identifier (auto-generated, 16 chars)
- `userId: string` - User identifier (default: `"user_123"`)
- `createdAt: number` - Session creation timestamp (default: current time)
- `lastActivityAt: number` - Last activity timestamp (default: current time)
- `expiresAt: number` - Session expiration timestamp (default: 1 hour from now)
- `ip: string` - Client IP address (default: `"127.0.0.1"`)
- `userAgent: string` - Client user agent (default: `"test-agent"`)

**Usage Example:**
```typescript
import { createMockSession } from "@mta-my-way/shared/testing";

const freshSession = createMockSession();
const staleSession = createMockSession({
  lastActivityAt: Date.now() - 7200000, // 2 hours ago
  expiresAt: Date.now() - 3600000 // expired 1 hour ago
});

const mobileSession = createMockSession({
  ip: "192.168.1.100",
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)"
});

// Test session validation
const isExpired = Date.now() > session.expiresAt;
const isStale = Date.now() - session.lastActivityAt > 1800000; // 30 min
```

**Edge Cases:**
- Session IDs are randomly generated - don't assume predictability for tests that require stable IDs
- For session timeout testing, ensure you're comparing against the correct field (`expiresAt` vs `lastActivityAt`)
- Some implementations use rolling expiration (activity refreshes expiry) - mock accordingly with consistent `createdAt`/`lastActivityAt`

---

### CSRF Protection

#### `generateRandomToken`

Generates a random alphanumeric token for testing (CSRF tokens, session IDs, etc.).

**Type Signature:**
```typescript
function generateRandomToken(length?: number): string
```

**Parameters:**
- `length` (optional): Token length in characters (default: `32`)

**Returns:** `string` - Random alphanumeric token

**Usage Example:**
```typescript
import { generateRandomToken } from "@mta-my-way/shared/testing";

const csrfToken = generateRandomToken(32);
const sessionId = generateRandomToken(16);
const shortToken = generateRandomToken(8);

// All tokens only contain [A-Za-z0-9]
const isAlphanumeric = /^[A-Za-z0-9]+$/.test(csrfToken); // true
```

**Edge Cases:**
- Only uses alphanumeric characters (no special characters) - may not match production if production uses crypto-random or base64 encoding
- Not cryptographically secure - suitable only for tests, never for real token generation
- Collisions possible but unlikely for length ≥ 16 - use longer tokens for tests requiring uniqueness guarantees

---

#### `createMockCsrfToken`

Creates a mock CSRF token with expiration time.

**Type Signature:**
```typescript
function createMockCsrfToken(): { token: string; expiresAt: number }
```

**Parameters:** None

**Returns:** Object with:
- `token: string` - Random 32-character CSRF token
- `expiresAt: number` - Expiration timestamp (default: 1 hour from now)

**Usage Example:**
```typescript
import { createMockCsrfToken } from "@mta-my-way/shared/testing";

const csrf = createMockCsrfToken();

// Store in session
session.csrfToken = csrf.token;
session.csrfExpiresAt = csrf.expiresAt;

// Test token validation
const isValid = csrf.token === submittedToken && Date.now() < csrf.expiresAt;

// Test expired token
const expiredCsrf = createMockCsrfToken();
expiredCsrf.expiresAt = Date.now() - 1000;
```

**Edge Cases:**
- Always generates a fresh token - call once per test to simulate token rotation
- Expiration is fixed at 1 hour - use overrides if testing custom TTLs
- Some implementations use signed tokens (HMAC) - this mock only provides the raw value

---

#### `createCsrfHeaders`

Creates HTTP headers with CSRF token for testing protected requests.

**Type Signature:**
```typescript
function createCsrfHeaders(token: string): Headers
```

**Parameters:**
- `token: string` - CSRF token to include in headers

**Returns:** `Headers` object with:
- `"x-csrf-token"` - The CSRF token
- `"content-type"` - Set to `"application/json"`

**Usage Example:**
```typescript
import { createCsrfHeaders, createMockCsrfToken } from "@mta-my-way/shared/testing";

const csrf = createMockCsrfToken();
const headers = createCsrfHeaders(csrf.token);

// Use in fetch request
await fetch("/api/trips", {
  method: "POST",
  headers: createCsrfHeaders(csrf.token),
  body: JSON.stringify({ originId: "101", destinationId: "725" })
});

// Merge with other headers
const authHeaders = new Headers({
  "Authorization": "Bearer key_123:abc"
});
for (const [key, value] of createCsrfHeaders(csrf.token).entries()) {
  authHeaders.set(key, value);
}
```

**Edge Cases:**
- Always sets `content-type` to `"application/json"` - override for other content types
- Uses lowercase `"x-csrf-token"` - ensure your middleware is case-insensitive
- For custom header names, construct headers manually instead of using this helper

---

### Rate Limiting

#### `createMockRateLimitState`

Creates a mock rate limit state for testing rate limiting middleware.

**Type Signature:**
```typescript
function createMockRateLimitState(overrides?: Partial<RateLimitState>): RateLimitState
```

**Parameters:**
- `overrides` (optional): Partial object to override default values

**Returns:** `RateLimitState` object with:
- `identifier: string` - Rate limit identifier (IP, API key, etc.) (default: `"127.0.0.1"`)
- `remaining: number` - Remaining requests in window (default: `60`)
- `resetAt: number` - Window reset timestamp (default: 60 seconds from now)
- `limit: number` - Maximum requests per window (default: `60`)
- `windowMs: number` - Window duration in milliseconds (default: `60000`)

**Usage Example:**
```typescript
import { createMockRateLimitState } from "@mta-my-way/shared/testing";

const defaultState = createMockRateLimitState();
const exhaustedState = createMockRateLimitState({
  remaining: 0,
  resetAt: Date.now() + 30000 // resets in 30 seconds
});

const customWindow = createMockRateLimitState({
  identifier: "api_key_abc",
  limit: 1000,
  windowMs: 3600000, // 1 hour
  remaining: 995
});

// Test rate limit response
const headers = new Headers({
  "X-RateLimit-Limit": state.limit.toString(),
  "X-RateLimit-Remaining": state.remaining.toString(),
  "X-RateLimit-Reset": new Date(state.resetAt).toISOString()
});
```

**Edge Cases:**
- `resetAt` is a timestamp, not a duration - calculate correctly when testing future/ expired windows
- `remaining` can go negative if your implementation allows burst - mock accordingly
- `identifier` format should match your implementation (IP, API key hash, user ID, etc.)

---

#### `createMockRateLimitBan`

Creates a mock rate limit ban record for testing ban enforcement.

**Type Signature:**
```typescript
function createMockRateLimitBan(overrides?: Partial<RateLimitBan>): RateLimitBan
```

**Parameters:**
- `overrides` (optional): Partial object to override default values

**Returns:** `RateLimitBan` object with:
- `identifier: string` - Banned identifier (default: `"127.0.0.1"`)
- `bannedUntil: number` - Ban expiration timestamp (default: 1 hour from now)
- `violationCount: number` - Number of violations (default: `5`)
- `reason: string` - Ban reason (default: `"Rate limit exceeded"`)

**Usage Example:**
```typescript
import { createMockRateLimitBan } from "@mta-my-way/shared/testing";

const activeBan = createMockRateLimitBan();
const expiredBan = createMockRateLimitBan({
  bannedUntil: Date.now() - 1000
});

const severeBan = createMockRateLimitBan({
  identifier: "api_key_xyz",
  violationCount: 50,
  bannedUntil: Date.now() + 86400000, // 24 hours
  reason: "Severe abuse - 50x rate limit exceeded"
});

// Test ban check
const isBanned = Date.now() < ban.bannedUntil;
if (isBanned) {
  throw new Error(`Rate limit banned until ${new Date(ban.bannedUntil).toISOString()}`);
}
```

**Edge Cases:**
- `bannedUntil` uses timestamps - use negative offsets for expired bans
- Some implementations use exponential backoff for ban duration - mock accordingly with increasing durations
- `violationCount` may trigger different ban tiers - test each threshold

---

### Input Validation

#### `MALICIOUS_INPUTS`

Constant containing malicious input patterns for testing validation logic.

**Type:** `const` object with categorized arrays of malicious patterns

**Categories:**

```typescript
const MALICIOUS_INPUTS = {
  sqlInjection: [
    "'; DROP TABLE users; --",
    "1' OR '1'='1",
    "admin'--",
    "admin'/*",
    "1' UNION SELECT * FROM users--"
  ],
  
  xss: [
    "<script>alert('XSS')</script>",
    "<img src=x onerror=alert('XSS')>",
    "<svg onload=alert('XSS')>",
    "javascript:alert('XSS')",
    "<iframe src='javascript:alert(XSS)'>"
  ],
  
  pathTraversal: [
    "../../../etc/passwd",
    "..\\..\\..\\windows\\system32",
    "/etc/passwd",
    "C:\\Windows\\System32\\config\\sam"
  ],
  
  commandInjection: [
    "; ls -la",
    "| cat /etc/passwd",
    "& whoami",
    "`id`",
    "$(whoami)"
  ],
  
  ldapInjection: [
    "*)(uid=*",
    "*)(&",
    "*(|(mail=*"
  ],
  
  nosqlInjection: [
    '{"$ne": null}',
    '{"$gt": ""}',
    '{"$regex": ".*"}'
  ],
  
  headerInjection: [
    "value\r\nX-Injected: true",
    "value\nX-Injected: true",
    "value\rX-Injected: true"
  ]
} as const;
```

**Usage Example:**
```typescript
import { MALICIOUS_INPUTS } from "@mta-my-way/shared/testing";

// Test SQL injection protection
for (const input of MALICIOUS_INPUTS.sqlInjection) {
  const result = sanitizeInput(input);
  expect(containsMaliciousPatterns(result)).toBe(false);
}

// Test XSS filter
for (const input of MALICIOUS_INPUTS.xss) {
  const sanitized = sanitizeInput(input);
  expect(sanitized).not.toContain("<script>");
  expect(sanitized).not.toContain("javascript:");
}

// Combine categories for comprehensive testing
const allMalicious = [
  ...MALICIOUS_INPUTS.sqlInjection,
  ...MALICIOUS_INPUTS.xss,
  ...MALICIOUS_INPUTS.pathTraversal
];
```

**Edge Cases:**
- These are known patterns - don't assume they cover all attack vectors
- Some patterns may be contextually valid (e.g., `C:\Windows` in a Windows path field) - validation should be context-aware
- Encoded variants (URL encoding, double encoding) not included - test those separately

---

#### `containsMaliciousPatterns`

Tests if input contains dangerous patterns using regex matching.

**Type Signature:**
```typescript
function containsMaliciousPatterns(input: string): boolean
```

**Parameters:**
- `input: string` - Input to test

**Returns:** `boolean` - `true` if malicious patterns detected, `false` otherwise

**Patterns Detected:**
- SQL injection: quotes, comments, SQL keywords (`UNION`, `SELECT`, `DROP`, etc.)
- XSS: script tags, iframes, `javascript:`, event handlers (`onerror`, `onload`, etc.)
- Path traversal: `../`, `..\`, encoded variants, system paths
- Command injection: separators (`;`, `|`, `&`), command substitution (`` ` ``, `$()`)
- Header injection: CRLF sequences (`\r\n`, `\n`, `\r`)
- NoSQL injection: MongoDB operators (`$ne`, `$gt`, `$regex`, `$where`)

**Usage Example:**
```typescript
import { containsMaliciousPatterns } from "@mta-my-way/shared/testing";

expect(containsMaliciousPatterns("'; DROP TABLE users; --")).toBe(true);
expect(containsMaliciousPatterns("<script>alert('XSS')</script>")).toBe(true);
expect(containsMaliciousPatterns("../../../etc/passwd")).toBe(true);
expect(containsMaliciousPatterns("normal input")).toBe(false);

// Use in validation logic
if (containsMaliciousPatterns(userInput)) {
  throw new Error("Malicious input detected");
}

// Test edge cases
expect(containsMaliciousPatterns("")).toBe(false); // empty string
expect(containsMaliciousPatterns("select * from users")).toBe(false); // lowercase without quotes
```

**Edge Cases:**
- Case-insensitive for SQL keywords (`SELECT`, `select`, `Select` all match)
- May have false positives on legitimate input containing matched patterns (e.g., "select * from users" as documentation text)
- Regex patterns are greedy - may match partial sequences (test boundary cases)
- Does not detect encoded variants (URL encoding, unicode escapes) - decode before checking

---

#### `sanitizeInput`

Sanitizes input by removing or escaping dangerous content.

**Type Signature:**
```typescript
function sanitizeInput(input: string): string
```

**Parameters:**
- `input: string` - Input to sanitize

**Returns:** `string` - Sanitized input with dangerous content removed

**Sanitization Steps:**
1. Removes `<script>` tags (with content)
2. Removes all HTML tags
3. Removes quotes (`'`, `"`, `;`)
4. Removes SQL keywords (`DROP`, `SELECT`, etc.)
5. Removes SQL comments (`--`, `/*`, `*/`)
6. Removes command injection characters (`;`, `&`, `|`, `` ` ``, `$`, `(`, `)`)
7. Removes path traversal sequences (`../`, `..\`)
8. Removes CRLF sequences (`\r`, `\n`)
9. Collapses whitespace
10. Trims result

**Usage Example:**
```typescript
import { sanitizeInput, isSanitized } from "@mta-my-way/shared/testing";

const malicious = "'; DROP TABLE users; --";
const clean = sanitizeInput(malicious);
expect(clean).toBe("DROP TABLE users");
expect(isSanitized(clean)).toBe(true);

const xss = "<script>alert('XSS')</script>";
const sanitized = sanitizeInput(xss);
expect(sanitized).not.toContain("<script>");
expect(sanitized).not.toContain("alert");

// Test in input validation
const userInput = req.body.name;
const safe = sanitizeInput(userInput);
db.prepare("INSERT INTO users (name) VALUES (?)").run(safe);

// Compare against actual implementation
const implementationResult = yourSanitizeFunction(malicious);
const testResult = sanitizeInput(malicious);
// They should be functionally equivalent (not necessarily identical)
```

**Edge Cases:**
- Output is not guaranteed to be safe for all contexts - HTML context needs entity encoding, SQL needs parameterized queries
- Some SQL keywords removed may be in legitimate text ("select option", "drop down menu") - consider context
- Multiple whitespace collapsed to single space - may change meaning in some edge cases
- Empty string after sanitization returns empty string - distinguish from "no sanitization needed"

---

### Security Context Mocking

#### `createMockSecurityContext`

Creates a mock security context for testing authentication/authorization logic.

**Type Signature:**
```typescript
function createMockSecurityContext(overrides?: Partial<SecurityContext>): SecurityContext
```

**Parameters:**
- `overrides` (optional): Partial object to override default values

**Returns:** `SecurityContext` object with:
- `isAuthenticated: boolean` - Authentication status (default: `false`)
- `userId: string | null` - User ID (default: `null`)
- `apiKey: MockApiKey | null` - API key object (default: `null`)
- `scopes: string[]` - Array of granted scopes (default: `[]`)
- `ip: string` - Client IP address (default: `"127.0.0.1"`)
- `userAgent: string` - Client user agent (default: `"test-agent"`)
- `sessionId: string | null` - Session ID (default: `null`)
- `csrfToken: string | null` - CSRF token (default: `null`)

**Usage Example:**
```typescript
import { createMockSecurityContext, createMockApiKey } from "@mta-my-way/shared/testing";

const anonymousContext = createMockSecurityContext();
expect(anonymousContext.isAuthenticated).toBe(false);

const userContext = createMockSecurityContext({
  isAuthenticated: true,
  userId: "user_123",
  apiKey: createMockApiKey(),
  scopes: ["read:arrivals", "write:favorites"]
});

// Test authorization
const canReadArrivals = userContext.scopes.includes("read:arrivals");
const canDeleteUsers = userContext.scopes.includes("delete:users");

// Use in middleware testing
function checkPermission(context: SecurityContext, requiredScope: string) {
  if (!context.isAuthenticated) {
    throw new Error("Unauthorized");
  }
  if (!context.scopes.includes(requiredScope)) {
    throw new Error("Forbidden");
  }
}
```

**Edge Cases:**
- `null` vs empty array for `scopes` - test both cases in your authorization logic
- `userId` and `sessionId` may be present even when `isAuthenticated` is `false` - always check the flag first
- Some implementations use role-based rather than scope-based permissions - adapt the mock accordingly

---

#### `createAuthenticatedContext`

Creates a pre-configured authenticated security context with sensible defaults.

**Type Signature:**
```typescript
function createAuthenticatedContext(overrides?: Partial<SecurityContext>): SecurityContext
```

**Parameters:**
- `overrides` (optional): Partial object to override default values

**Returns:** `SecurityContext` object with:
- `isAuthenticated: true` - Always authenticated
- `userId: "user_123"` - Default user ID (overridable)
- `apiKey: MockApiKey` - Default API key (auto-generated)
- `scopes: string[]` - Default scopes: `["read:arrivals", "read:alerts", "write:favorites"]`
- `sessionId: string` - Random session ID (auto-generated)
- `csrfToken: string` - Random CSRF token (auto-generated)
- All other fields inherited from `createMockSecurityContext`

**Usage Example:**
```typescript
import { createAuthenticatedContext } from "@mta-my-way/shared/testing";

const user = createAuthenticatedContext();
expect(user.isAuthenticated).toBe(true);
expect(user.scopes).toContain("read:arrivals");

const admin = createAuthenticatedContext({
  userId: "admin_001",
  scopes: ["read:*", "write:*", "delete:*"]
});

const readonly = createAuthenticatedContext({
  userId: "readonly_user",
  scopes: ["read:arrivals", "read:alerts"]
});

// Test protected endpoint
function handleGetArrivals(context: SecurityContext) {
  if (!context.isAuthenticated) {
    return { status: 401, body: "Unauthorized" };
  }
  if (!context.scopes.includes("read:arrivals")) {
    return { status: 403, body: "Forbidden" };
  }
  return { status: 200, body: arrivalsData };
}
```

**Edge Cases:**
- Always generates fresh `sessionId` and `csrfToken` - call once per test for consistency
- `scopes` includes `write:favorites` by default - remember this when testing read-only operations
- If your implementation doesn't use API keys with sessions, set `apiKey` to `null` in overrides

---

### Security Event Mocking

#### `createMockSecurityEvent`

Creates a mock security event for testing event logging and monitoring.

**Type Signature:**
```typescript
function createMockSecurityEvent(overrides?: Partial<SecurityEvent>): SecurityEvent
```

**Parameters:**
- `overrides` (optional): Partial object to override default values

**Returns:** `SecurityEvent` object with:
- `eventId: string` - Unique event identifier (auto-generated)
- `type: string` - Event type (default: `"auth_failure"`)
- `severity: string` - Event severity (default: `"warning"`)
- `timestamp: number` - Event timestamp (default: current time)
- `details: object` - Event details (default: `{ ip: "127.0.0.1", userAgent: "test-agent", attemptCount: 3 }`)

**Usage Example:**
```typescript
import { createMockSecurityEvent, SECURITY_EVENT_TYPES } from "@mta-my-way/shared/testing";

const loginFailure = createMockSecurityEvent({
  type: "login_failure",
  severity: "warning",
  details: { ip: "192.168.1.100", username: "admin", attemptCount: 5 }
});

const maliciousInput = createMockSecurityEvent({
  type: "malicious_input_detected",
  severity: "critical",
  details: { 
    ip: "10.0.0.50", 
    input: "'; DROP TABLE users; --",
    pattern: "sql_injection"
  }
});

const sessionExpired = createMockSecurityEvent({
  type: "session_expired",
  severity: "info",
  details: { sessionId: "abc123", lastActivity: Date.now() - 7200000 }
});

// Log event
securityLogger.log(event);
```

**Edge Cases:**
- `details` structure is flexible - ensure your implementation handles unknown properties
- Severity levels should match your monitoring system's expected values (`info`, `warning`, `error`, `critical`)
- Timestamp uses milliseconds - some systems use seconds, adjust accordingly

---

#### `SECURITY_EVENT_TYPES`

Constant containing all valid security event type categories.

**Type:** `const` object with categorized arrays of event types

**Categories:**

```typescript
const SECURITY_EVENT_TYPES = {
  authentication: [
    "login_success",
    "login_failure",
    "logout",
    "session_expired"
  ],
  authorization: [
    "access_denied",
    "insufficient_permissions",
    "resource_not_found"
  ],
  rateLimit: [
    "rate_limit_exceeded",
    "rate_limit_ban",
    "rate_limit_reset"
  ],
  data: [
    "sensitive_data_access",
    "data_export",
    "data_deletion"
  ],
  session: [
    "session_created",
    "session_destroyed",
    "session_hijack_attempt"
  ],
  csrf: [
    "csrf_token_missing",
    "csrf_token_invalid",
    "csrf_token_expired"
  ],
  input: [
    "invalid_input",
    "malicious_input_detected",
    "sanitization_failed"
  ]
} as const;
```

**Usage Example:**
```typescript
import { SECURITY_EVENT_TYPES, createMockSecurityEvent } from "@mta-my-way/shared/testing";

// Test all authentication events
for (const type of SECURITY_EVENT_TYPES.authentication) {
  const event = createMockSecurityEvent({ type });
  expect(event.type).toBe(type);
}

// Validate event type
function isValidEventType(type: string): boolean {
  return Object.values(SECURITY_EVENT_TYPES).flat().includes(type);
}

expect(isValidEventType("login_success")).toBe(true);
expect(isValidEventType("unknown_event")).toBe(false);

// Filter events by category
const authEvents = allEvents.filter(e => 
  SECURITY_EVENT_TYPES.authentication.includes(e.type)
);
```

**Edge Cases:**
- These are the canonical event types - ensure your implementation uses these exact strings
- Category names (`authentication`, `authorization`) are for organization - not used programmatically
- Adding new event types requires updating this constant - maintain consistency

---

### Password Testing Utilities

#### `PASSWORD_STRENGTH`

Constant containing example passwords at each strength level for testing password validation.

**Type:** `const` object with strength level examples

**Levels:**

```typescript
const PASSWORD_STRENGTH = {
  weak: {
    password: "123456",
    score: 0,
    feedback: "Very weak password"
  },
  fair: {
    password: "password123",
    score: 1,
    feedback: "Weak password"
  },
  good: {
    password: "SecurePass456!",
    score: 2,
    feedback: "Good password"
  },
  strong: {
    password: "V3ry$tr0ng!P@ssw0rd#2024",
    score: 3,
    feedback: "Strong password"
  }
} as const;
```

**Usage Example:**
```typescript
import { PASSWORD_STRENGTH } from "@mta-my-way/shared/testing";

// Test password validation
for (const [level, data] of Object.entries(PASSWORD_STRENGTH)) {
  const result = validatePassword(data.password);
  expect(result.score).toBe(data.score);
  expect(result.feedback).toContain(data.feedback.split(" ")[0]);
}

// Test minimum strength requirement
function meetsMinimumRequirement(password: string): boolean {
  const result = validatePassword(password);
  return result.score >= PASSWORD_STRENGTH.good.score;
}

expect(meetsMinimumRequirement(PASSWORD_STRENGTH.weak.password)).toBe(false);
expect(meetsMinimumRequirement(PASSWORD_STRENGTH.strong.password)).toBe(true);
```

**Edge Cases:**
- These are examples - not exhaustive for all validation rules (length, character classes, entropy)
- Score values (0-3) should match your implementation's scoring system
- Feedback strings are for display - test semantic meaning, not exact matches

---

#### `createMockPasswordHash`

Creates a mock bcrypt-style password hash for testing authentication.

**Type Signature:**
```typescript
function createMockPasswordHash(overrides?: Partial<PasswordHash>): PasswordHash
```

**Parameters:**
- `overrides` (optional): Partial object to override default values

**Returns:** `PasswordHash` object with:
- `hash: string` - Bcrypt hash with prefix (default: `"$2b$10$..."`, 60 chars total)
- `salt: string` - Salt with prefix (default: `"$2b$10$..."`, 29 chars total)
- `iterations: number` - Cost factor (default: `10`)

**Usage Example:**
```typescript
import { createMockPasswordHash } from "@mta-my-way/shared/testing";

const defaultHash = createMockPasswordHash();

const customHash = createMockPasswordHash({
  hash: "$2b$12$abcdefghijklmnopqrstuv",
  salt: "$2b$12$abcdefghijklmnopqrstuv",
  iterations: 12
});

// Test password verification
const isValid = await bcrypt.compare(password, hash.hash);
expect(isValid).toBe(true);

// Test hash format
expect(hash.hash).toMatch(/^\$2[aby]\$\d+\$.{53}$/);
```

**Edge Cases:**
- Hash format mimics bcrypt (`$2b$10$...`) but is not cryptographically valid - only for testing hash storage/retrieval logic
- For actual authentication tests, use real bcrypt hashes: `await bcrypt.hash("password", 10)`
- Salt format must match hash prefix (same algorithm and cost factor)

---

#### `createMockPasswordResetToken`

Creates a mock password reset token for testing password reset flows.

**Type Signature:**
```typescript
function createMockPasswordResetToken(overrides?: Partial<PasswordResetToken>): PasswordResetToken
```

**Parameters:**
- `overrides` (optional): Partial object to override default values

**Returns:** `PasswordResetToken` object with:
- `tokenId: string` - Token identifier (auto-generated)
- `keyId: string` - Associated API key ID (default: `"key_test_123"`)
- `tokenHash: string` - Hashed token value (auto-generated)
- `createdAt: number` - Creation timestamp (default: current time)
- `expiresAt: number` - Expiration timestamp (default: 1 hour from now)
- `used: boolean` - Whether token has been used (default: `false`)
- `clientIp: string` - Client IP address (default: `"127.0.0.1"`)
- `userAgent: string` - Client user agent (default: `"test-agent"`)

**Usage Example:**
```typescript
import { createMockPasswordResetToken } from "@mta-my-way/shared/testing";

const freshToken = createMockPasswordResetToken();
const usedToken = createMockPasswordResetToken({ used: true });
const expiredToken = createMockPasswordResetToken({
  expiresAt: Date.now() - 1000
});

// Test token validation
function validateResetToken(token: PasswordResetToken): boolean {
  if (token.used) {
    throw new Error("Token already used");
  }
  if (Date.now() > token.expiresAt) {
    throw new Error("Token expired");
  }
  return true;
}

// Test token usage
async function resetPassword(tokenId: string, newPassword: string) {
  const token = await getToken(tokenId);
  if (!validateResetToken(token)) {
    return { success: false, error: "Invalid token" };
  }
  
  await updateUserPassword(token.keyId, newPassword);
  await markTokenUsed(tokenId);
  
  return { success: true };
}
```

**Edge Cases:**
- Tokens are single-use by design - always set `used: true` after successful password reset
- Expiration is typically 1 hour - adjust if testing custom TTLs
- `clientIp` and `userAgent` should match the reset request for security validation

---

### RBAC Testing Utilities

#### `ROLES`

Constant containing role definitions with permissions for testing role-based access control.

**Type:** `const` object with role configurations

**Roles:**

```typescript
const ROLES = {
  admin: {
    name: "admin",
    permissions: ["*"] // All permissions
  },
  user: {
    name: "user",
    permissions: [
      "read:arrivals",
      "read:alerts",
      "read:stations",
      "write:favorites",
      "write:commutes",
      "write:journal"
    ]
  },
  readonly: {
    name: "readonly",
    permissions: [
      "read:arrivals",
      "read:alerts",
      "read:stations"
    ]
  },
  service: {
    name: "service",
    permissions: [
      "read:*",
      "write:push"
    ]
  }
} as const;
```

**Usage Example:**
```typescript
import { ROLES } from "@mta-my-way/shared/testing";

// Test admin permissions
const adminPerms = ROLES.admin.permissions;
expect(adminPerms).toContain("*");

// Test role assignment
function assignRole(userId: string, role: keyof typeof ROLES) {
  const roleConfig = ROLES[role];
  db.prepare("INSERT INTO user_roles (user_id, role, permissions) VALUES (?, ?, ?)")
    .run(userId, roleConfig.name, JSON.stringify(roleConfig.permissions));
}

// Test permission inheritance
const userPerms = ROLES.user.permissions;
expect(userPerms).toContain("read:arrivals");
expect(userPerms).not.toContain("delete:users");
```

**Edge Cases:**
- Wildcard `*` means all permissions - ensure your implementation handles this correctly
- Service role has `read:*` (read everything) but not `write:*` - test scoped write permissions
- Add new roles to this constant to maintain consistency across tests

---

#### `hasPermission`

Checks if a role has a specific permission, supporting wildcards and prefix matching.

**Type Signature:**
```typescript
function hasPermission(role: keyof typeof ROLES, permission: string): boolean
```

**Parameters:**
- `role: keyof typeof ROLES` - Role name (`"admin"`, `"user"`, `"readonly"`, `"service"`)
- `permission: string` - Permission to check (e.g., `"read:arrivals"`, `"write:*"`)

**Returns:** `boolean` - `true` if role has permission, `false` otherwise

**Wildcard Support:**
- `*` matches all permissions (admin role)
- `read:*` matches all read permissions (e.g., `read:arrivals`, `read:alerts`)

**Usage Example:**
```typescript
import { hasPermission, ROLES } from "@mta-my-way/shared/testing";

// Exact match
expect(hasPermission("user", "read:arrivals")).toBe(true);
expect(hasPermission("user", "delete:users")).toBe(false);

// Wildcard match
expect(hasPermission("admin", "any:permission")).toBe(true); // admin has "*"
expect(hasPermission("service", "read:arrivals")).toBe(true); // service has "read:*"

// Prefix match
expect(hasPermission("service", "read:unknown")).toBe(true); // matches "read:*"
expect(hasPermission("service", "write:arrivals")).toBe(false); // no "write:*"

// Use in authorization middleware
function checkPermission(role: string, requiredPermission: string) {
  if (!hasPermission(role as keyof typeof ROLES, requiredPermission)) {
    throw new Error(`Forbidden: ${role} does not have ${requiredPermission}`);
  }
}
```

**Edge Cases:**
- Role parameter must be a key from `ROLES` - TypeScript enforces this, runtime will throw if invalid
- Prefix matching only works for `*` at the end (e.g., `read:*`) - not wildcards in the middle
- Comparison is case-sensitive - ensure permission strings match exactly

---

### Audit Log Testing

#### `createMockAuditLogEntry`

Creates a mock audit log entry for testing audit logging functionality.

**Type Signature:**
```typescript
function createMockAuditLogEntry(overrides?: Partial<AuditLogEntry>): AuditLogEntry
```

**Parameters:**
- `overrides` (optional): Partial object to override default values

**Returns:** `AuditLogEntry` object with:
- `id: string` - Log entry ID (auto-generated)
- `timestamp: number` - Event timestamp (default: current time)
- `userId: string` - User who performed the action (default: `"user_123"`)
- `action: string` - Action performed (default: `"api_key_created"`)
- `resourceType: string` - Type of resource (default: `"api_key"`)
- `resourceId: string` - ID of affected resource (default: `"key_test_123"`)
- `ip: string` - Client IP address (default: `"127.0.0.1"`)
- `userAgent: string` - Client user agent (default: `"test-agent"`)
- `success: boolean` - Whether action succeeded (default: `true`)
- `details: object` - Additional event details (default: `{}`)

**Usage Example:**
```typescript
import { createMockAuditLogEntry, AUDIT_ACTIONS } from "@mta-my-way/shared/testing";

const apiKeyCreated = createMockAuditLogEntry({
  action: "api_key_created",
  userId: "admin_001",
  resourceId: "key_abc123",
  details: { scope: "write", role: "user" }
});

const loginFailed = createMockAuditLogEntry({
  action: "failed_login",
  userId: "user_123",
  success: false,
  details: { reason: "invalid_password", attemptCount: 3 }
});

const dataExported = createMockAuditLogEntry({
  action: "data_exported",
  userId: "user_456",
  resourceType: "trip_records",
  resourceId: "export_001",
  details: { recordCount: 150, format: "csv" }
});

// Log audit entry
auditLogger.log(entry);
```

**Edge Cases:**
- `details` structure is flexible - ensure your implementation can serialize arbitrary objects
- For failed actions, set `success: false` and include failure reason in `details`
- Timestamps use milliseconds - adjust if your audit log uses seconds

---

#### `AUDIT_ACTIONS`

Constant containing valid audit action types for testing and validation.

**Type:** `const` object with categorized arrays of action types

**Categories:**

```typescript
const AUDIT_ACTIONS = {
  authentication: [
    "login",
    "logout",
    "failed_login",
    "password_changed",
    "password_reset"
  ],
  api_keys: [
    "api_key_created",
    "api_key_updated",
    "api_key_deleted",
    "api_key_rotated"
  ],
  data: [
    "data_exported",
    "data_deleted",
    "data_updated"
  ],
  admin: [
    "user_created",
    "user_updated",
    "user_deleted",
    "role_changed"
  ],
  sessions: [
    "session_created",
    "session_destroyed",
    "session_revoked"
  ]
} as const;
```

**Usage Example:**
```typescript
import { AUDIT_ACTIONS } from "@mta-my-way/shared/testing";

// Test all action types
for (const action of AUDIT_ACTIONS.authentication) {
  const entry = createMockAuditLogEntry({ action });
  expect(entry.action).toBe(action);
}

// Validate action type
function isValidAuditAction(action: string): boolean {
  return Object.values(AUDIT_ACTIONS).flat().includes(action);
}

expect(isValidAuditAction("login")).toBe(true);
expect(isValidAuditAction("unknown_action")).toBe(false);

// Filter logs by category
const authLogs = auditLogs.filter(log => 
  AUDIT_ACTIONS.authentication.includes(log.action)
);
```

**Edge Cases:**
- These are the canonical action types - ensure your implementation uses these exact strings
- Category names are for organization - not used programmatically
- Adding new actions requires updating this constant - maintain consistency

---

### Mock Security Middleware

#### `createMockSecurityMiddleware`

Creates a mock security middleware with context, authentication, authorization, and CSRF methods.

**Type Signature:**
```typescript
function createMockSecurityMiddleware(): {
  context: SecurityMiddlewareContext;
  authenticate: ReturnType<typeof vi.fn>;
  authorize: ReturnType<typeof vi.fn>;
  setCsrfToken: ReturnType<typeof vi.fn>;
  checkRateLimit: ReturnType<typeof vi.fn>;
}
```

**Parameters:** None

**Returns:** Object with:
- `context: object` - Middleware context containing:
  - `request: object` - Request with `ip`, `headers`, `method`, `url`
  - `session: object | null` - Session data
  - `user: object | null` - Authenticated user
  - `security: object` - Security state (`isAuthenticated`, `csrfToken`, `rateLimit`)
- `authenticate: vi.fn` - Mock function to authenticate a user (sets `isAuthenticated: true`)
- `authorize: vi.fn` - Mock function to authorize a permission (throws if not authenticated)
- `setCsrfToken: vi.fn` - Mock function to set CSRF token
- `checkRateLimit: vi.fn` - Mock function to check rate limit (decrements remaining)

**Usage Example:**
```typescript
import { createMockSecurityMiddleware } from "@mta-my-way/shared/testing";

const middleware = createMockSecurityMiddleware();

// Test authentication
middleware.authenticate("user_123");
expect(middleware.context.security.isAuthenticated).toBe(true);
expect(middleware.context.user).toEqual({ id: "user_123" });

// Test authorization
middleware.authenticate("user_123");
const result = middleware.authorize("read:arrivals");
expect(result).toBe(true);

// Test unauthorized access
expect(() => {
  middleware.authorize("admin:action");
}).toThrow("Unauthorized");

// Test CSRF
middleware.setCsrfToken("csrf_token_123");
expect(middleware.context.security.csrfToken).toBe("csrf_token_123");

// Test rate limiting
expect(middleware.checkRateLimit()).toBe(true);
expect(middleware.context.security.rateLimit.remaining).toBe(59);
```

**Edge Cases:**
- All methods are Vitest mocks - use `.mock.calls` to inspect call history
- `authorize` throws before checking permissions if not authenticated - test both failure modes
- `checkRateLimit` returns `false` when remaining reaches 0 - test ban enforcement
- Context is mutable - each test should get a fresh middleware instance

---

### Test Assertions

#### `isSanitized`

Checks if input has been properly sanitized by detecting dangerous patterns.

**Type Signature:**
```typescript
function isSanitized(sanitized: string): boolean
```

**Parameters:**
- `sanitized: string` - Sanitized input to check

**Returns:** `boolean` - `true` if safe (no dangerous patterns), `false` if unsafe

**Dangerous Patterns Checked:**
- `<script>` tags
- Any HTML tags (`<`, `>`)
- `javascript:` protocol
- Event handlers (`onerror=`, `onload=`, `onclick=`)
- Path traversal (`../`)
- SQL characters (`;`)

**Usage Example:**
```typescript
import { isSanitized, sanitizeInput } from "@mta-my-way/shared/testing";

const malicious = "'; DROP TABLE users; --";
const clean = sanitizeInput(malicious);

expect(isSanitized(clean)).toBe(true);
expect(isSanitized(malicious)).toBe(false);

// Test edge cases
expect(isSanitized("")).toBe(true); // empty string is safe
expect(isSanitized("normal text")).toBe(true);
expect(isSanitized("<a>link</a>")).toBe(false); // HTML tags
expect(isSanitized("javascript:alert(1)")).toBe(false); // JS protocol

// Use in assertions
function assertInputSanitized(input: string) {
  if (!isSanitized(input)) {
    throw new Error("Input is not properly sanitized");
  }
}
```

**Edge Cases:**
- This is a basic safety check - not a guarantee for all contexts (HTML, SQL, CLI have different requirements)
- Empty string returns `true` - distinguish from "not sanitized"
- Does not check for encoded variants (`&lt;script&gt;`) - decode before checking

---

#### `hasSecurityHeaders`

Checks if HTTP headers include all required security headers.

**Type Signature:**
```typescript
function hasSecurityHeaders(headers: Headers): boolean
```

**Parameters:**
- `headers: Headers` - HTTP headers to check

**Returns:** `boolean` - `true` if all required headers present, `false` otherwise

**Required Security Headers:**
- `x-content-type-options: nosniff` - Must be exactly `"nosniff"`
- `x-frame-options` - Must be present (any value)
- `x-xss-protection` - Must be present (any value)
- `strict-transport-security` - Must include `max-age=` (any value)

**Usage Example:**
```typescript
import { hasSecurityHeaders } from "@mta-my-way/shared/testing";

const secureHeaders = new Headers({
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "x-xss-protection": "1; mode=block",
  "strict-transport-security": "max-age=31536000; includeSubDomains"
});

expect(hasSecurityHeaders(secureHeaders)).toBe(true);

const insecureHeaders = new Headers({
  "content-type": "application/json"
});

expect(hasSecurityHeaders(insecureHeaders)).toBe(false);

// Test in middleware
function addSecurityHeaders(headers: Headers) {
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("x-xss-protection", "1; mode=block");
  headers.set("strict-transport-security", "max-age=31536000");
  
  if (!hasSecurityHeaders(headers)) {
    throw new Error("Missing security headers");
  }
}
```

**Edge Cases:**
- Header names are case-insensitive in HTTP but this check uses lowercase - ensure consistency
- `strict-transport-security` only checks for `max-age=` substring - doesn't validate the value
- Missing any single header causes `false` return - all headers are required

---

## Core Test Helpers

**Source:** `packages/shared/src/testing/test-helpers.ts`

### Mock Data Generators

#### `createMockStation`

Creates a mock subway station object with default values.

**Type Signature:**
```typescript
function createMockStation(overrides: Partial<Station> = {}): Station
```

**Parameters:**
- `overrides: Partial<Station>` - Partial object to override default values (default: `{}`)

**Type Definitions:**
All types are defined in [`packages/shared/src/types/stations.ts`](../packages/shared/src/types/stations.ts):

- [`Station`](../packages/shared/src/types/stations.ts#L29) - Main station interface (lines 29-52)
  - `id: string` - Parent station ID (e.g., `"725"`)
  - `name: string` - Station display name (e.g., `"Times Sq-42 St"`)
  - `lat: number` - Latitude
  - `lon: number` - Longitude
  - `lines: string[]` - All lines serving this station
  - `northStopId: string` - Northbound platform stop ID (e.g., `"725N"`)
  - `southStopId: string` - Southbound platform stop ID (e.g., `"725S"`)
  - `transfers: TransferConnection[]` - Available transfers from this station
  - `complex?: string` - Station complex ID for multi-entrance stations
  - `ada: boolean` - Whether the station is ADA accessible
  - `borough: Borough` - NYC borough

- [`Borough`](../packages/shared/src/types/stations.ts#L7) - NYC borough type (line 7)
  - Type: `"manhattan" | "brooklyn" | "queens" | "bronx" | "statenisland"`

- [`TransferConnection`](../packages/shared/src/types/stations.ts#L15) - Transfer connection interface (lines 15-24)
  - `toStationId: string` - Target station ID
  - `toLines: string[]` - Lines available at the transfer station
  - `walkingSeconds: number` - Estimated walking time in seconds
  - `accessible: boolean` - Whether the transfer path is ADA accessible

**Import Path:**
```typescript
// Import the helper function
import { createMockStation } from "@mta-my-way/shared/testing";

// Import types for type checking
import type { Station, Borough, TransferConnection } from "@mta-my-way/shared/types/stations";
```

**Important: No Separate "MockStation" Type**

There is **no separate `MockStation` type** in this codebase. The `createMockStation` function returns a regular `Station` object - the same type used throughout the application for real station data. The "mock" aspect is simply that the function provides convenient default values (Times Square-42 St) that can be selectively overridden.

This design means:
- **Type compatibility:** Mock stations are 100% compatible with real station data structures
- **No conversion needed:** Mock stations can be used anywhere real stations are expected
- **Type safety:** TypeScript ensures mock stations have the exact same shape as real stations
- **Test realism:** Mock stations match production data structures exactly

**Return Type Structure**

The function returns a complete `Station` object with all required properties:

```typescript
interface Station {
  id: string;                  // Station ID (default: "725")
  name: string;                // Station name (default: "Times Square-42 St")
  lat: number;                // Latitude (default: 40.7589)
  lon: number;                // Longitude (default: -73.9851)
  lines: string[];            // Subway lines (default: ["1", "2", "3", "7", "N", "Q", "R", "W"])
  northStopId: string;        // Northbound stop ID (default: "725N")
  southStopId: string;        // Southbound stop ID (default: "725S")
  transfers: TransferConnection[];  // Transfer stations (default: [])
  complex?: string;           // Optional: Station complex ID for multi-entrance stations
  ada: boolean;               // ADA accessibility (default: true)
  borough: Borough;           // Borough (default: "manhattan")
}
```

**Default Return Values**

When called with no parameters, `createMockStation()` returns:

| Property | Type | Default Value |
|----------|------|---------------|
| `id` | `string` | `"725"` |
| `name` | `string` | `"Times Square-42 St"` |
| `lat` | `number` | `40.7589` |
| `lon` | `number` | `-73.9851` |
| `lines` | `string[]` | `["1", "2", "3", "7", "N", "Q", "R", "W"]` |
| `northStopId` | `string` | `"725N"` |
| `southStopId` | `string` | `"725S"` |
| `transfers` | `TransferConnection[]` | `[]` |
| `ada` | `boolean` | `true` |
| `borough` | `Borough` | `"manhattan"` |
| `complex` | `string \| undefined` | `undefined` (not set by default) |

**Relationship to Real Station Data**

Mock stations created with `createMockStation` are structurally identical to stations loaded from the GTFS static data feed. They can be used interchangeably in tests, components, and utility functions.

**Usage Example:**
```typescript
import { createMockStation } from "@mta-my-way/shared/testing";
import type { Station, Borough, TransferConnection } from "@mta-my-way/shared/types/stations";

const defaultStation = createMockStation();
const customStation = createMockStation({
  id: "101",
  name: "South Ferry",
  lat: 40.702,
  lon: -74.013,
  lines: ["1"],
  ada: true,
  borough: "manhattan" as Borough
});

const complexStation = createMockStation({
  transfers: [
    { toStationId: "726", toLines: ["A", "C", "E"], walkingSeconds: 120, accessible: true }
  ]
});
```

### How `Partial<T>` Works

The `Partial<T>` utility type is a built-in TypeScript feature that makes all properties of a type optional. When you pass `overrides: Partial<Station>`, you only need to specify the properties you want to change - everything else uses the default Times Square values.

**TypeScript's `Partial<T>` behavior:**
```typescript
// Partial<Station> is equivalent to:
{
  id?: string;
  name?: string;
  lat?: number;
  lon?: number;
  lines?: string[];
  northStopId?: string;
  southStopId?: string;
  transfers?: TransferConnection[];
  complex?: string;
  ada?: boolean;
  borough?: Borough;
}
```

**How merging works:**
```typescript
// Step 1: Start with defaults
const defaults = {
  id: "725",
  name: "Times Square-42 St",
  lat: 40.7589,
  lon: -73.9851,
  lines: ["1", "2", "3", "7", "N", "Q", "R", "W"],
  northStopId: "725N",
  southStopId: "725S",
  transfers: [],
  ada: true,
  borough: "manhattan"
};

// Step 2: Apply overrides using spread operator
const result = { ...defaults, ...overrides };

// Example: createMockStation({ id: "101", name: "South Ferry" })
// Result: All defaults except id="101" and name="South Ferry"
```

**Key benefits:**
- **Type safety:** TypeScript validates that your overrides are valid `Station` properties
- **No required fields:** Pass an empty object `{}` to get all defaults
- **Selective overrides:** Only specify what you need, inherit everything else
- **Predictable defaults:** Always start from a known good state (Times Square)

### Common Override Patterns

#### Pattern 1: Minimal Override (Single Field)

Override only the identifier, all other fields use Times Square defaults:

```typescript
const station = createMockStation({ id: "999" });
// Result: id="999", all other fields are Times Square defaults
// Useful: When you only need a unique ID for deduplication/lookup tests
```

#### Pattern 2: ADA Compliance Testing

Test accessibility filtering and ADA-specific features:

```typescript
const adaStation = createMockStation({ ada: true });
const nonAdaStation = createMockStation({ ada: false });

// Test ADA filtering
const allStations = [adaStation, nonAdaStation];
const adaOnly = allStations.filter(s => s.ada);
expect(adaOnly).toHaveLength(1);
expect(adaOnly).not.toContain(nonAdaStation);
```

#### Pattern 3: Line-Specific Stations

Create stations serving specific subway lines:

```typescript
const onlyTrain1 = createMockStation({
  id: "101",
  name: "South Ferry",
  lines: ["1"],
  northStopId: "101N",
  southStopId: "101S"
});

const trainExpressStop = createMockStation({
  id: "725",
  name: "Times Square-42 St",
  lines: ["1", "2", "3"],  // 1 is local, 2/3 are express
  transfers: []
});

// Test line filtering logic
const oneTrainStations = allStations.filter(s => s.lines.includes("1"));
expect(oneTrainStations).toContain(onlyTrain1);
```

#### Pattern 4: Borough-Specific Stations

Create stations in each NYC borough for location-based testing:

```typescript
// Manhattan station (default)
const manhattanStation = createMockStation({
  id: "725",
  borough: "manhattan"
});

// Brooklyn station
const brooklynStation = createMockStation({
  id: "234",
  name: "High St",
  lat: 40.7022,
  lon: -73.9894,
  lines: ["A", "C"],
  borough: "brooklyn"
});

// Queens station
const queensStation = createMockStation({
  id: "501",
  name: "Jamaica Center-Parsons/Archer",
  lines: ["E", "J", "Z"],
  borough: "queens",
  ada: true
});

// Bronx station
const bronxStation = createMockStation({
  id: "601",
  name: "161 St-Yankee Stadium",
  lines: ["4", "B", "D"],
  borough: "bronx",
  ada: true
});

// Test borough filtering
const brooklynStations = allStations.filter(s => s.borough === "brooklyn");
expect(brooklynStations).toHaveLength(1);
```

#### Pattern 5: Transfer Hubs

Create complex stations with multiple transfer connections:

```typescript
const pennStation = createMockStation({
  id: "726",
  name: "34 St-Penn Station",
  lines: ["1", "2", "3"],
  transfers: [
    {
      toStationId: "727",
      toLines: ["A", "C", "E"],
      walkingSeconds: 180,
      accessible: true
    },
    {
      toStationId: "728",
      toLines: ["N", "Q", "R", "W"],
      walkingSeconds: 240,
      accessible: false
    }
  ],
  ada: true,
  borough: "manhattan"
});

// Test transfer logic
const accessibleTransfers = pennStation.transfers.filter(t => t.accessible);
expect(accessibleTransfers).toHaveLength(1);
```

#### Pattern 6: Express vs Local Stops

Distinguish between express and local service patterns:

```typescript
const localStop = createMockStation({
  id: "101",
  name: "South Ferry",
  lines: ["1"],  // Local only
  transfers: []
});

const expressStop = createMockStation({
  id: "725",
  name: "Times Square-42 St",
  lines: ["1", "2", "3"],  // Local + express
  transfers: []
});

const expressOnly = createMockStation({
  id: "726",
  name: "34 St-Penn Station",
  lines: ["2", "3"],  // Express only (no 1)
  transfers: []
});
```

#### Pattern 7: Multi-Entrance Complex Stations

Create stations with complex IDs for multi-entrance stations:

```typescript
const courtSq = createMockStation({
  id: "631",
  name: "Court Sq",
  complex: "D14",  // Complex ID linking multiple entrances
  lines: ["G", "E", "M", "7"],
  borough: "queens",
  ada: true
});

// Test complex station grouping
const complexStations = allStations.filter(s => s.complex === "D14");
expect(complexStations).toContain(courtSq);
```

#### Pattern 8: Stop ID Consistency

Ensure stop IDs follow naming conventions:

```typescript
const consistentStation = createMockStation({
  id: "999",
  name: "Custom Station",
  // Stop IDs typically follow pattern: {stationId}{N/S}
  northStopId: "999N",
  southStopId: "999S"
});

// Test stop ID validation
const validStopPattern = /^\d+[NS]$/;
expect(validStopPattern.test(consistentStation.northStopId)).toBe(true);
expect(validStopPattern.test(consistentStation.southStopId)).toBe(true);
```

### Station-Specific Parameters

#### Required Parameters (Always Present)

All station objects include these parameters, even when overridden:

| Parameter | Type | Default Value | Description |
|-----------|------|---------------|-------------|
| `id` | `string` | `"725"` | Unique station identifier (GTFS station ID) |
| `name` | `string` | `"Times Square-42 St"` | Human-readable station name |
| `lat` | `number` | `40.7589` | Latitude coordinate (decimal degrees) |
| `lon` | `number` | `-73.9851` | Longitude coordinate (decimal degrees) |
| `lines` | `string[]` | `["1", "2", "3", "7", "N", "Q", "R", "W"]` | All subway lines serving this station |
| `northStopId` | `string` | `"725N"` | Northbound platform stop ID (GTFS) |
| `southStopId` | `string` | `"725S"` | Southbound platform stop ID (GTFS) |
| `transfers` | `TransferConnection[]` | `[]` | Available transfer connections |
| `ada` | `boolean` | `true` | ADA accessibility flag |
| `borough` | `Borough` | `"manhattan"` | NYC borough location |

#### Optional Parameters

These parameters may not be present in all station objects:

| Parameter | Type | Description |
|-----------|------|-------------|
| `complex` | `string` (optional) | Station complex ID for multi-entrance stations (e.g., `"D14"`) |

#### Geographic Parameters

Location-specific parameters for geographic testing:

```typescript
// Manhattan (default)
createMockStation({ borough: "manhattan", lat: 40.7589, lon: -73.9851 });

// Brooklyn
createMockStation({ borough: "brooklyn", lat: 40.7022, lon: -73.9894 });

// Queens
createMockStation({ borough: "queens", lat: 40.7064, lon: -73.7877 });

// Bronx
createMockStation({ borough: "bronx", lat: 40.8278, lon: -73.9280 });

// Staten Island
createMockStation({ borough: "statenisland", lat: 40.5795, lon: -74.1502 });
```

#### Line Service Parameters

Line-specific parameters for route testing:

```typescript
// IRT Broadway-7th Ave (1, 2, 3)
createMockStation({ lines: ["1", "2", "3"] });

// IRT Lexington Ave (4, 5, 6)
createMockStation({ lines: ["4", "5", "6"] });

// IND 8th Ave (A, C, E)
createMockStation({ lines: ["A", "C", "E"] });

// BMT Broadway (N, Q, R, W)
createMockStation({ lines: ["N", "Q", "R", "W"] });

// Flushing Line (7)
createMockStation({ lines: ["7"] });
```

#### Accessibility Parameters

ADA compliance parameters for accessibility testing:

```typescript
// ADA accessible (default)
const adaStation = createMockStation({ ada: true });

// Non-ADA accessible
const nonAdaStation = createMockStation({ ada: false });

// Test accessibility filtering
const adaStations = allStations.filter(s => s.ada);
expect(adaStations).not.toContain(nonAdaStation);
```

### Real-World Test Scenarios from the Codebase

These examples show how `createMockStation` is actually used in production tests across the MTA My Way codebase.

#### Scenario 1: Smoke Testing Mock Data Generation

**Source:** [`packages/shared/src/testing/smoke.test.ts`](../packages/shared/src/testing/smoke.test.ts)

```typescript
import { createMockStation } from "@mta-my-way/shared/testing";

describe("Test Infrastructure Smoke Test", () => {
  it("can create mock station data", () => {
    const station = createMockStation({
      id: "725",
      name: "Times Square-42 St",
    });

    expect(station.id).toBe("725");
    expect(station.name).toBe("Times Square-42 St");
    expect(station.lines).toContain("1");
    expect(station.ada).toBe(true);
  });
});
```

**Use Case:** Verify that mock data generation works correctly for testing infrastructure reliability.

#### Scenario 2: Assertion Helper Testing

**Source:** [`packages/shared/src/testing/smoke.test.ts`](../packages/shared/src/testing/smoke.test.ts)

```typescript
import { createMockStation, assertHasProperties } from "@mta-my-way/shared/testing";

it("assertHasProperties validates object structure", () => {
  const station = createMockStation();
  assertHasProperties(station, ["id", "name", "lat", "lon", "lines"]);
});
```

**Use Case:** Test custom assertion helpers with realistic mock data structures.

#### Scenario 3: Mock Database Setup with Multiple Stations

**Source:** [`packages/shared/src/testing/smoke.test.ts`](../packages/shared/src/testing/smoke.test.ts)

```typescript
import { createMockStation, createMockDatabase } from "@mta-my-way/shared/testing";

it("can create and use mock database", () => {
  const db = createMockDatabase();

  // Populate database with multiple mock stations
  db._setData("stations", [
    createMockStation({ id: "725" }),
    createMockStation({ id: "726" })
  ]);

  const stations = db._getData("stations");
  expect(stations).toHaveLength(2);
});
```

**Use Case:** Set up mock database state for integration tests without a real database.

#### Scenario 4: Empty Override Testing (Edge Case)

**Source:** [`packages/shared/src/testing/smoke.test.ts`](../packages/shared/src/testing/smoke.test.ts)

```typescript
describe("Test Infrastructure - Edge Cases", () => {
  it("handles empty overrides in mock generators", () => {
    const station = createMockStation(); // No overrides
    expect(station).toBeDefined();
    expect(station.id).toBe("725"); // Default value
  });
});
```

**Use Case:** Verify that default values work correctly when no overrides are provided.

#### Scenario 5: Partial Override Testing

**Source:** [`packages/shared/src/testing/smoke.test.ts`](../packages/shared/src/testing/smoke.test.ts)

```typescript
describe("Test Infrastructure - Edge Cases", () => {
  it("handles partial overrides in mock generators", () => {
    const arrival = createMockArrival({
      line: "2", // Override line
      // direction should use default: "N"
    });

    expect(arrival.line).toBe("2");
    expect(arrival.direction).toBe("N"); // Default preserved
  });
});
```

**Use Case:** Verify that partial overrides correctly preserve default values for unspecified fields.

### Common Testing Patterns

#### Pattern: Test Fixture Creation with Related Stations

Create sets of related stations for testing route calculations and transfer logic:

```typescript
import { createMockStation } from "@mta-my-way/shared/testing";

// Create a realistic route segment
const timesSquare = createMockStation({
  id: "725",
  name: "Times Square-42 St"
});

const pennStation = createMockStation({
  id: "726",
  name: "34 St-Penn Station",
  transfers: [
    {
      toStationId: "727",
      toLines: ["A", "C", "E"],
      walkingSeconds: 180,
      accessible: true
    }
  ]
});

const heraldSquare = createMockStation({
  id: "727",
  name: "34 St-Herald Sq",
  lines: ["N", "Q", "R", "W"]
});

// Test route calculation
const route = calculateRoute(timesSquare, heraldSquare);
expect(route.stations).toHaveLength(2);
```

#### Pattern: Type-Safe Station Creation

When working with TypeScript, ensure type safety by importing and using the correct types:

```typescript
import { createMockStation } from "@mta-my-way/shared/testing";
import type { Station, Borough, TransferConnection } from "@mta-my-way/shared/types/stations";

// Type-safe mock station
const station: Station = createMockStation({
  id: "999",
  borough: "brooklyn" as Borough
});

// Type-safe transfer connection
const transfer: TransferConnection = {
  toStationId: "726",
  toLines: ["A", "C"],
  walkingSeconds: 120,
  accessible: true
};

const stationWithTransfer: Station = createMockStation({
  transfers: [transfer]
});
```

#### Pattern: Batch Station Creation for Bulk Operations

Create multiple stations efficiently for bulk operations testing:

```typescript
import { createMockStation } from "@mta-my-way/shared/testing";

// Create stations in bulk
const stations = [
  createMockStation({ id: "725", name: "Times Square-42 St" }),
  createMockStation({ id: "726", name: "34 St-Penn Station" }),
  createMockStation({ id: "727", name: "34 St-Herald Sq" }),
  createMockStation({ id: "728", name: "23 St" }),
  createMockStation({ id: "729", name: "14 St-Union Sq" })
];

// Test bulk operations
const filtered = stations.filter(s => s.lines.includes("1"));
expect(filtered).toHaveLength(5);
```

#### Pattern: Conditional Station Creation Based on Test Parameters

Create stations conditionally based on test parameters or environment:

```typescript
import { createMockStation } from "@mta-my-way/shared/testing";

function createTestStation(borough: Borough, adaAccessible: boolean): Station {
  return createMockStation({
    id: "test-001",
    name: "Test Station",
    borough,
    ada: adaAccessible
  });
}

// Test different borough configurations
const manhattanAda = createTestStation("manhattan", true);
const brooklynNonAda = createTestStation("brooklyn", false);

expect(manhattanAda.ada).toBe(true);
expect(brooklynNonAda.borough).toBe("brooklyn");
```

### Edge Cases and Gotchas

#### Override Merging Behavior

**CRITICAL: Shallow Merge, Not Deep Merge**

The `createMockStation` function uses JavaScript's spread operator (`...overrides`) which performs a **shallow merge**. This has important implications for how overrides are applied:

```typescript
import { createMockStation } from "@mta-my-way/shared/testing";

// ❌ INCORRECT: This does NOT merge the lines array
const station = createMockStation({
  lines: ["7"]  // Replaces entire array, not adds to it
});
// Result: lines = ["7"], NOT ["1", "2", "3", "7", "N", "Q", "R", "W", "7"]

// ✅ CORRECT: Explicitly specify all lines you want
const station = createMockStation({
  lines: ["1", "2", "3", "7", "N", "Q", "R", "W"]  // Complete array
});

// ✅ CORRECT: Add to defaults manually if needed
const defaultStation = createMockStation();
const stationWithExtraLine = {
  ...defaultStation,
  lines: [...defaultStation.lines, "7"]
};
```

**What Gets Replaced vs. Preserved:**

| Field Type | Behavior | Example |
|------------|----------|----------|
| **Primitives** (`id`, `name`, `lat`, `lon`, `ada`, `borough`) | Replaced | `{ id: "101" }` → new id only |
| **Arrays** (`lines`, `transfers`) | **Replaced entirely** | `{ lines: ["7"] }` → only line 7, not merged |
| **Optional fields** (`complex`) | Added if provided | `{ complex: "D14" }` → now has complex ID |

**Array Override Gotcha:**

```typescript
// ❌ EXPECTATION: Add "7" to existing lines
const station = createMockStation({
  lines: ["7"]
});
expect(station.lines).toEqual(["1", "2", "3", "7", "N", "Q", "R", "W", "7"]); // FAILS!

// ✅ REALITY: Lines array is completely replaced
expect(station.lines).toEqual(["7"]); // PASSES
```

---

#### Stop ID Consistency Issues

**The `id` Field Does Not Auto-Update `northStopId` and `southStopId`**

When you override the station `id`, the stop IDs remain at their defaults ("725N" and "725S") unless explicitly overridden:

```typescript
// ❌ INCONSISTENT: id is "101" but stop IDs reference "725"
const inconsistentStation = createMockStation({
  id: "101"
});
console.log(inconsistentStation.id);         // "101"
console.log(inconsistentStation.northStopId); // "725N" ← Still references old ID!
console.log(inconsistentStation.southStopId); // "725S" ← Still references old ID!

// ✅ CONSISTENT: Update all related IDs together
const consistentStation = createMockStation({
  id: "999",
  northStopId: "999N",
  southStopId: "999S"
});
```

**Stop ID Pattern Convention:**

MTA stop IDs typically follow the pattern: `{stationId}{N/S}`

```typescript
// Helper function to maintain consistency
function createConsistentStation(stationId: string) {
  return createMockStation({
    id: stationId,
    northStopId: `${stationId}N`,
    southStopId: `${stationId}S`
  });
}

const timesSquare = createConsistentStation("725");
const southFerry = createConsistentStation("101");
```

---

#### Borough Type Assertion Gotcha

The default station uses `borough: "manhattan" as const` which provides a literal type. When overriding, ensure your borough value is a valid `Borough` union member:

```typescript
import type { Borough } from "@mta-my-way/shared/types/stations";

// ✅ CORRECT: Use type assertion for custom boroughs
const brooklynStation = createMockStation({
  borough: "brooklyn" as Borough
});

// ✅ CORRECT: All valid borough values
const boroughs: Borough[] = ["manhattan", "brooklyn", "queens", "bronx", "statenisland"];
boroughs.forEach(borough => {
  const station = createMockStation({ borough });
});

// ❌ INCORRECT: Typo in borough name (TypeScript won't catch without explicit type)
const typoStation = createMockStation({
  borough: "manhatan" // Runtime error if validated against Borough type
});
```

**Valid Borough Values:**
- `"manhattan"`
- `"brooklyn"`
- `"queens"`
- `"bronx"`
- `"statenisland"`

---

#### Complex ID Field Behavior

The `complex` field is **optional** in the `Station` type and **not set by default**. It will be `undefined` unless explicitly provided:

```typescript
// Default: complex is undefined
const defaultStation = createMockStation();
console.log(defaultStation.complex); // undefined

// Set complex ID explicitly
const complexStation = createMockStation({
  complex: "D14"  // Court Sq-23 St-45 St
});

// Test complex grouping
const stations = [
  createMockStation({ id: "631", complex: "D14" }),
  createMockStation({ id: "632", complex: "D14" }),
  createMockStation({ id: "633", complex: "D14" })
];

const complexD14 = stations.filter(s => s.complex === "D14");
expect(complexD14).toHaveLength(3);
```

**Testing Complex ID Logic:**

```typescript
// Multi-entrance stations should share complex IDs
const courtSqEntrances = [
  createMockStation({ id: "631", name: "Court Sq", complex: "D14" }),
  createMockStation({ id: "632", name: "Court Sq-23 St", complex: "D14" }),
  createMockStation({ id: "633", name: "45 St-Court Sq", complex: "D14" })
];

// Group by complex ID
function groupByComplex(stations: Station[]): Record<string, Station[]> {
  const groups: Record<string, Station[]> = {};
  
  for (const station of stations) {
    const complex = station.complex || station.id; // Use id if no complex
    if (!groups[complex]) {
      groups[complex] = [];
    }
    groups[complex].push(station);
  }
  
  return groups;
}

const groups = groupByComplex(courtSqEntrances);
expect(groups["D14"]).toHaveLength(3);
```

---

#### Transfers Array Replacement

Like the `lines` array, `transfers` is **replaced entirely**, not merged:

```typescript
// ❌ INCORRECT: Does NOT merge transfers
const station = createMockStation({
  transfers: [
    { toStationId: "727", toLines: ["A", "C", "E"], walkingSeconds: 180, accessible: true }
  ]
});
// Result: Only one transfer (the one you specified)

// ✅ CORRECT: Specify all transfers explicitly
const hubStation = createMockStation({
  transfers: [
    { toStationId: "727", toLines: ["A", "C", "E"], walkingSeconds: 180, accessible: true },
    { toStationId: "728", toLines: ["N", "Q", "R", "W"], walkingSeconds: 240, accessible: false }
  ]
});
```

**Adding to Default Transfers:**

```typescript
// If you need to add to the default (empty) transfers array:
const defaultStation = createMockStation();
const stationWithTransfers = {
  ...defaultStation,
  transfers: [
    ...defaultStation.transfers,
    { toStationId: "727", toLines: ["A", "C", "E"], walkingSeconds: 180, accessible: true }
  ]
};
```

---

#### No Built-in Validation

`createMockStation` **does not validate** inputs. It will create stations with invalid coordinates, non-existent line IDs, or malformed stop IDs:

```typescript
// ❌ These will create objects without error (but are invalid!)
const invalidStation = createMockStation({
  id: "INVALID-ID-123",
  lat: 999.999,  // Invalid latitude (outside -90 to 90)
  lon: -999.999, // Invalid longitude (outside -180 to 180)
  lines: ["INVALID-LINE"],  // Non-existent MTA line
  northStopId: "not-a-number",  // Doesn't follow pattern
  borough: "new-jersey"  // Not a valid NYC borough
});

// ✅ You must add your own validation if needed
function validateStation(station: Station): boolean {
  // Validate coordinates
  if (station.lat < -90 || station.lat > 90) return false;
  if (station.lon < -180 || station.lon > 180) return false;
  
  // Validate stop ID pattern
  if (!/^\d+$/.test(station.id)) return false;
  if (!/^\d+N$/.test(station.northStopId)) return false;
  if (!/^\d+S$/.test(station.southStopId)) return false;
  
  // Validate borough
  const validBoroughs: Borough[] = ["manhattan", "brooklyn", "queens", "bronx", "statenisland"];
  if (!validBoroughs.includes(station.borough)) return false;
  
  return true;
}

const validStation = createMockStation({ id: "101" });
expect(validateStation(validStation)).toBe(true);
```

---

#### Geographic Coordinate Precision

Default coordinates use **4 decimal place precision** (approximately 11-meter accuracy):

```typescript
const station = createMockStation();
console.log(station.lat); // 40.7589 (4 decimal places)
console.log(station.lon); // -73.9851 (4 decimal places)

// For high-precision tests, override with more decimals
const highPrecisionStation = createMockStation({
  lat: 40.758896,  // 6 decimal places (~0.1 meter accuracy)
  lon: -73.985130
});

// Coordinate boundaries for NYC
// Latitude: 40.477399 (southern tip) to 40.917739 (northern tip)
// Longitude: -74.259098 (western edge) to -73.700272 (eastern edge)
```

**Testing Geographic Logic:**

```typescript
// Test distance calculations
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}

const timesSquare = createMockStation({ lat: 40.7589, lon: -73.9851 });
const pennStation = createMockStation({ lat: 40.7505, lon: -73.9898 });
const distance = calculateDistance(
  timesSquare.lat, timesSquare.lon,
  pennStation.lat, pennStation.lon
);
// Distance ≈ 980 meters
expect(distance).toBeGreaterThan(900);
expect(distance).toBeLessThan(1100);
```

---

#### Line ID Validation

The function doesn't validate line IDs against real MTA lines. Ensure your tests use valid line identifiers:

```typescript
// Valid MTA line identifiers
const validLines = [
  "1", "2", "3", "4", "5", "6", "7",       // IRT
  "A", "B", "C", "D", "E", "F", "G", "M",  // BMT/IND
  "N", "Q", "R", "W",                       // BMT Broadway
  "J", "Z",                                 // BMT Nassau
  "L",                                      // BMT Canarsie
  "S", "FS", "GS", "H"                      // Shuttles
];

// ✅ Use valid line IDs
const station = createMockStation({
  lines: ["A", "C", "E"]  // Valid IND 8th Ave lines
});

// ❌ Avoid invalid line IDs (unless testing error handling)
const invalidLineStation = createMockStation({
  lines: ["X", "Y", "Z"]  // These don't exist in MTA system
});
```

---

#### Static vs. Dynamic Test Data

**Best Practice:** Create station constants at the top of your test file for reuse:

```typescript
// ✅ GOOD: Define test fixtures once
const TIMES_SQUARE = createMockStation({ id: "725", name: "Times Square-42 St" });
const PENN_STATION = createMockStation({ id: "726", name: "34 St-Penn Station" });
const SOUTH_FERRY = createMockStation({ id: "101", name: "South Ferry", lines: ["1"] });

describe("Station filtering", () => {
  it("filters by borough", () => {
    const brooklyn = createMockStation({ id: "234", borough: "brooklyn" });
    const queens = createMockStation({ id: "501", borough: "queens" });
    
    const result = filterByBorough([TIMES_SQUARE, brooklyn, queens], "brooklyn");
    expect(result).toEqual([brooklyn]);
  });
  
  it("filters by line", () => {
    const result = filterByLine([TIMES_SQUARE, PENN_STATION, SOUTH_FERRY], "1");
    expect(result).toContain(SOUTH_FERRY);
  });
});

// ❌ AVOID: Recreating same mock data in every test
describe("Station filtering (bad practice)", () => {
  it("filters by borough", () => {
    const timesSquare = createMockStation({ id: "725" });
    const brooklyn = createMockStation({ id: "234", borough: "brooklyn" });
    const queens = createMockStation({ id: "501", borough: "queens" });
    // ...重复代码
  });
});
```

---

#### Differences from Real Station Data

Mock stations created with `createMockStation` are **structurally compatible** with real GTFS station data but have important differences:

| Aspect | Mock Station | Real GTFS Station |
|--------|--------------|-------------------|
| **Data Source** | Hardcoded defaults | Loaded from GTFS feed |
| **Consistency** | May have inconsistencies (e.g., ID mismatch) | Validated against GTFS schema |
| **Completeness** | Only required fields | May include additional GTFS fields |
| **Validation** | None (any values allowed) | Feed-specific validation rules |

**Testing Against Real Data:**

```typescript
import { loadStationsFromGtfs } from "./gtfs-loader";
import { createMockStation } from "@mta-my-way/shared/testing";

describe("Station structure compatibility", () => {
  it("mock stations match real station structure", async () => {
    const realStations = await loadStationsFromGtfs();
    const mockStation = createMockStation();
    
    // Mock should have same keys as real stations
    const mockKeys = Object.keys(mockStation).sort();
    const realKeys = Object.keys(realStations[0]).sort();
    
    expect(mockKeys).toEqual(realKeys);
  });
  
  it("mock stations work with real station functions", () => {
    const mockStation = createMockStation();
    const formatStationName = (s: Station) => `${s.name} (${s.lines.join(", ")})`;
    
    expect(formatStationName(mockStation)).toBe(
      "Times Square-42 St (1, 2, 3, 7, N, Q, R, W)"
    );
  });
});
```

---

#### Common Pitfalls Summary

1. **Stop ID Inconsistency**: Overriding `id` doesn't update `northStopId`/`southStopId`
2. **Array Replacement**: Overriding `lines` or `transfers` replaces the entire array
3. **Missing Complex ID**: `complex` is undefined unless explicitly set
4. **No Validation**: Invalid coordinates, line IDs, or boroughs are not caught
5. **Type Assertion**: Borough override needs `as Borough` for type safety
6. **Shallow Merge**: Nested objects/arrays are replaced, not merged
7. **Precision**: Default coordinates have 4-decimal precision (~11m accuracy)

---

#### Quick Reference: Safe Override Patterns

```typescript
// ✅ SAFE: Override primitive values only
const station1 = createMockStation({
  id: "101",
  name: "South Ferry",
  ada: true,
  borough: "manhattan" as Borough
});

// ✅ SAFE: Override arrays with complete values
const station2 = createMockStation({
  id: "999",
  lines: ["1", "2", "3"],  // Complete array
  transfers: [
    { toStationId: "726", toLines: ["A", "C"], walkingSeconds: 120, accessible: true }
  ]
});

// ✅ SAFE: Maintain stop ID consistency
const station3 = createMockStation({
  id: "999",
  northStopId: "999N",  // Must match id
  southStopId: "999S"   // Must match id
});

// ❌ UNSAFE: Expecting array merging
const station4 = createMockStation({
  lines: ["7"]  // Replaces all lines, doesn't add "7"
});

// ❌ UNSAFE: Inconsistent stop IDs
const station5 = createMockStation({
  id: "101"  // Stop IDs still "725N"/"725S"
});
```

---

#### `createMockRoute`

Creates a mock subway route object with realistic MTA route defaults.

**Type Signature:**
```typescript
function createMockRoute(overrides?: Partial<Route>): Route
```

**Parameters:**
- `overrides` (optional): `Partial<Route>` - Partial object to merge with default route data using spread syntax

**Returns:** `Route` object with all required fields:

| Field | Type | Default Value | Description |
|-------|------|---------------|-------------|
| `id` | `string` | `"1"` | Unique route identifier |
| `shortName` | `string` | `"1"` | Display name for UI (matches ID for MTA) |
| `longName` | `string` | `"Broadway-7th Ave Local"` | Full route name from GTFS |
| `color` | `string` | `"#EE352E"` | Route color hex (MTA official palette) |
| `textColor` | `string` | `"#FFFFFF"` | Text color for contrast |
| `feedId` | `string` | `"gtfs"` | GTFS-RT feed source (`"gtfs"` or `"gtfs-ace"`) |
| `division` | `"A" \| "B"` | `"A"` | MTA division (A = numbered, B = lettered) |
| `stops` | `string[]` | `["101", "102", "103"]` | Ordered stop IDs for this route |
| `isExpress` | `boolean` | `false` | Express service flag |

---

**Type Definitions:**
```typescript
// Import from @mta-my-way/shared/types/stations
import type { Route, RouteIndex, Division } from "@mta-my-way/shared/types/stations";

interface Route {
  id: string;
  shortName: string;
  longName: string;
  color: string;
  textColor: string;
  feedId: string;
  division: Division;
  stops: string[];
  isExpress: boolean;
}

type Division = "A" | "B";  // A = numbered lines, B = lettered lines
```

---

### Usage Examples

#### Basic Route Creation

```typescript
import { createMockRoute } from "@mta-my-way/shared/testing";

// Default route (1 train - Broadway-7th Ave Local)
const route1 = createMockRoute();
console.log(route1.longName); // "Broadway-7th Ave Local"
console.log(route1.isExpress); // false
```

#### Express Route

```typescript
const express2 = createMockRoute({
  id: "2",
  shortName: "2",
  longName: "7th Ave Express",
  isExpress: true,
  color: "#EE352E"
});

// Test express skip-stop behavior
expect(express2.isExpress).toBe(true);
```

#### Lettered Route (Division B)

```typescript
const trainA = createMockRoute({
  id: "A",
  shortName: "A",
  longName: "8th Ave Express",
  division: "B",              // Lettered train
  feedId: "gtfs-ace",         // Different feed source
  color: "#0039A6",
  isExpress: true
});

// Test division-based feed selection
expect(trainA.feedId).toBe("gtfs-ace");
expect(trainA.division).toBe("B");
```

#### Route with Custom Stops

```typescript
const route6 = createMockRoute({
  id: "6",
  shortName: "6",
  longName: "Lexington Ave Local",
  stops: ["625", "626", "627", "628", "629"],
  color: "#00933C"
});

// Test stop sequence
expect(route6.stops).toHaveLength(5);
```

#### Shuttle Route (S Train)

```typescript
const shuttle42 = createMockRoute({
  id: "GS",
  shortName: "GS",
  longName: "42 St Shuttle",
  color: "#6CBE45",
  textColor: "#000000",  // Light background → dark text
  stops: ["725", "728"],
  isExpress: false,
  feedId: "gtfs"
});

// Test shuttle-specific patterns
expect(shuttle42.stops).toHaveLength(2);
expect(shuttle62.textColor).toBe("#000000");
```

---

### Common Override Patterns

#### Pattern 1: Minimal Override (Identifier Only)

```typescript
// Override only the route ID
const route = createMockRoute({ id: "A" });
// All other fields use 1 train defaults
```

#### Pattern 2: Express vs Local Testing

```typescript
const expressRoute = createMockRoute({ isExpress: true });
const localRoute = createMockRoute({ isExpress: false });

// Test skip-stop logic differs
const skipCount = calculateSkipStops(expressRoute, localRoute);
```

#### Pattern 3: Division-Specific Routes

```typescript
const divisionA = createMockRoute({
  division: "A",
  feedId: "gtfs"
});

const divisionB = createMockRoute({
  division: "B",
  feedId: "gtfs-ace"
});
```

#### Pattern 4: Route Color Consistency

```typescript
const redRoute = createMockRoute({
  id: "1",
  shortName: "1",
  color: "#EE352E",
  textColor: "#FFFFFF"
});

// Test color rendering
expect(routeColorContrast(redRoute.color, redRoute.textColor)).toBeGreaterThan(4.5);
```

#### Pattern 5: Custom Stop Sequence

```typescript
const longRoute = createMockRoute({
  id: "7",
  shortName: "7",
  stops: ["725", "728", "729", "730", "731", "732"]
});

// Test route length and travel time calculation
const estimatedTime = calculateTravelTime(longRoute.stops);
```

---

### Route-Station Relationships

Coordinate route stops with mock stations for realistic test data:

```typescript
import { createMockRoute, createMockStation } from "@mta-my-way/shared/testing";

// Create matching stations
const timesSquare = createMockStation({ id: "725" });
const pennStation = createMockStation({ id: "726" });
const heraldSquare = createMockStation({ id: "727" });

// Create route using those stop IDs
const route1 = createMockRoute({
  id: "1",
  shortName: "1",
  stops: ["725", "726", "727"]
});

// Test route-station relationship
expect(route1.stops).toContain(timesSquare.id);
expect(route1.stops).toContain(pennStation.id);
expect(route1.stops).toContain(heraldSquare.id);
```

---

### Multi-Route Testing Setup

Create multiple related routes for integration tests:

```typescript
const routes: RouteIndex = {
  "1": createMockRoute({
    id: "1",
    shortName: "1",
    longName: "Broadway-7th Ave Local",
    color: "#EE352E",
    stops: ["725", "726", "727"]
  }),
  "2": createMockRoute({
    id: "2",
    shortName: "2",
    longName: "7th Ave Express",
    color: "#EE352E",
    isExpress: true,
    stops: ["725", "728", "730"]
  }),
  "3": createMockRoute({
    id: "3",
    shortName: "3",
    longName: "7th Ave Express",
    color: "#EE352E",
    isExpress: true,
    stops: ["725", "728", "731"]
  })
};

// Test shared corridor routing
const sharedStops = findSharedStops(routes["1"].stops, routes["2"].stops);
expect(sharedStops).toContain("725"); // Times Square shared by all
```

---

### Edge Cases and Gotchas

#### 1. Override Merging (Shallow, Not Deep)

```typescript
// ⚠️ BAD: This REPLACES all stops, doesn't merge
const route = createMockRoute({ stops: ["104"] });
// route.stops is ["104"], not ["101", "102", "103", "104"]

// ✅ GOOD: Explicitly include all stops
const route = createMockRoute({
  stops: ["101", "102", "103", "104"]
});
```

**Why:** The function uses spread syntax (`...overrides`), which performs shallow merge. Arrays are replaced entirely, not merged element-by-element.

#### 2. Route-Stop Consistency

```typescript
// ⚠️ POTENTIAL BUG: Stop IDs don't match real stations
const badRoute = createMockRoute({
  stops: ["999", "998", "997"]  // These don't exist
});

// ✅ GOOD: Coordinate with createMockStation
const station1 = createMockStation({ id: "101" });
const station2 = createMockStation({ id: "102" });
const goodRoute = createMockRoute({
  stops: ["101", "102"]  // Valid station IDs
});
```

**Why:** Routes reference stop IDs that must correspond to actual stations. Mismatched IDs cause lookup failures in route calculation logic.

#### 3. Color Hex Format

```typescript
// ⚠️ BAD: Missing # prefix
const badRoute = createMockRoute({ color: "EE352E" });

// ✅ GOOD: Proper hex format
const goodRoute = createMockRoute({ color: "#EE352E" });

// ✅ ALSO GOOD: 3-digit shorthand
const shortRoute = createMockRoute({ color: "#E35" });
```

**Why:** CSS color format requires `#` prefix. Missing it breaks rendering in UI components and fails validation.

#### 4. Division and FeedId Mismatch

```typescript
// ⚠️ BAD: Division A but using gtfs-ace feed
const badRoute = createMockRoute({
  division: "A",
  feedId: "gtfs-ace"  // Wrong feed for division A
});

// ✅ GOOD: Division matches feed
const goodRoute = createMockRoute({
  division: "A",
  feedId: "gtfs"  // Correct feed for numbered trains
});

const letteredRoute = createMockRoute({
  division: "B",
  feedId: "gtfs-ace"  // Correct feed for lettered trains
});
```

**Why:** MTA splits GTFS-RT feeds by division. Division A (numbered trains) use `gtfs`, Division B (lettered trains) use `gtfs-ace`. Mismatch causes empty arrival data.

#### 5. Express Flag Semantics

```typescript
// Express route should skip stations compared to local
const expressRoute = createMockRoute({
  id: "2",
  isExpress: true,
  stops: ["725", "728", "730"]  // Fewer stops
});

const localRoute = createMockRoute({
  id: "1",
  isExpress: false,
  stops: ["725", "726", "727", "728", "729", "730"]  // All stops
});

// Test express skips intermediate stations
expect(localRoute.stops.length).toBeGreaterThan(expressRoute.stops.length);
```

**Why:** The `isExpress` flag affects skip-stop calculation logic. Express routes should have fewer stops than local routes on the same corridor.

#### 6. Timestamp Handling (Not Applicable)

Unlike `createMockArrival`, routes have no timestamp fields. If you need time-based route testing (e.g., schedule variations), create separate test fixtures:

```typescript
// Routes are static - use separate pattern for time-based testing
const morningRoute = createMockRoute({ id: "1" });
const eveningRoute = createMockRoute({ id: "1" });

// Different schedules would be handled by a separate Schedule entity
```

---

### Real-World Testing Patterns

#### Test Route Color Contrast

```typescript
describe("Route color accessibility", () => {
  it("ensures contrast ratio for dark route colors", () => {
    const darkRoute = createMockRoute({
      id: "A",
      color: "#0039A6",
      textColor: "#FFFFFF"
    });

    const contrast = calculateContrastRatio(darkRoute.color, darkRoute.textColor);
    expect(contrast).toBeGreaterThanOrEqual(4.5); // WCAG AA standard
  });

  it("ensures contrast ratio for light route colors", () => {
    const lightRoute = createMockRoute({
      id: "GS",
      color: "#6CBE45",
      textColor: "#000000"
    });

    const contrast = calculateContrastRatio(lightRoute.color, lightRoute.textColor);
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });
});
```

#### Test Route Lookup by Division

```typescript
describe("Division-based feed selection", () => {
  it("selects gtfs feed for Division A", () => {
    const route = createMockRoute({
      division: "A"
    });

    const feed = selectFeedByDivision(route.division);
    expect(feed).toBe("gtfs");
  });

  it("selects gtfs-ace feed for Division B", () => {
    const route = createMockRoute({
      id: "A",
      division: "B",
      feedId: "gtfs-ace"
    });

    const feed = selectFeedByDivision(route.division);
    expect(feed).toBe("gtfs-ace");
  });
});
```

#### Test Shared Corridor Routing

```typescript
describe("Shared corridor routing", () => {
  it("finds shared stops between express and local", () => {
    const local = createMockRoute({
      id: "1",
      stops: ["725", "726", "727", "728", "729"]
    });

    const express = createMockRoute({
      id: "2",
      isExpress: true,
      stops: ["725", "728"]
    });

    const shared = findSharedStops(local.stops, express.stops);
    expect(shared).toEqual(["725", "728"]);
  });
});
```

---

**See Also:**
- {@link createMockStation} - For creating matching station objects
- {@link createMockArrival} - For testing arrival data on routes
- {@link createTestFixture} - For complete test fixtures with routes and stations

---

#### `createMockArrival`

Creates a mock train arrival object with realistic MTA arrival defaults for testing real-time subway data.

**Type Signature:**
```typescript
function createMockArrival(overrides?: Partial<ArrivalTime>): ArrivalTime
```

**Parameters:**
- `overrides` (optional): `Partial<ArrivalTime>` - Partial object to merge with default arrival data using spread syntax

**Type Definitions:**
All types are defined in [`packages/shared/src/types/arrivals.ts`](../../packages/shared/src/types/arrivals.ts):

- [`ArrivalTime`](../../packages/shared/src/types/arrivals.ts#L14) - Main arrival interface (lines 14-49)
  - `line: string` - Route ID (e.g., `"1"`, `"A"`, `"F"`)
  - `direction: Direction` - Northbound or Southbound (lines 5-6)
  - `arrivalTime: number` - POSIX timestamp of predicted arrival
  - `minutesAway: number` - Computed convenience field: minutes until arrival
  - `isAssigned: boolean` - Whether a train is physically assigned to this trip
  - `isRerouted: boolean` - Whether actual track differs from scheduled track
  - `tripId: string` - GTFS trip ID for tracking across refreshes
  - `destination: string` - Terminal station name (headsign)
  - `confidence: ConfidenceLevel` - Confidence based on division + assignment (lines 8-9)
  - `feedName: string` - Which GTFS-RT feed this arrival came from
  - `feedAge: number` - Seconds since this feed was last successfully polled

- [`Direction`](../../packages/shared/src/types/arrivals.ts#L6) - Direction type (line 6)
  - Type: `"N" | "S"` (Northbound | Southbound)

- [`ConfidenceLevel`](../../packages/shared/src/types/arrivals.ts#L9) - Confidence level type (line 9)
  - Type: `"high" | "medium" | "low"`
  - Logic: `high` = A Division + assigned, `medium` = A Division + unassigned or B Division + assigned, `low` = B Division + unassigned

**Import Path:**
```typescript
// Import the helper function
import { createMockArrival } from "@mta-my-way/shared/testing";

// Import types for type checking
import type { ArrivalTime, Direction, ConfidenceLevel } from "@mta-my-way/shared/types/arrivals";
```

**Important: No Separate "MockArrival" Type**

There is **no separate `MockArrival` type** in this codebase. The `createMockArrival` function returns a regular `ArrivalTime` object - the same type used throughout the application for real arrival data. The "mock" aspect is simply that the function provides convenient default values that can be selectively overridden.

**Return Type Structure**

The function returns a complete `ArrivalTime` object with all required properties:

```typescript
interface ArrivalTime {
  line: string;                  // Route ID (default: "1")
  direction: Direction;          // "N" or "S" (default: "N")
  arrivalTime: number;           // POSIX timestamp (default: now + 2 minutes)
  minutesAway: number;           // Minutes until arrival (default: 2)
  isAssigned: boolean;           // Assignment status (default: true)
  isRerouted: boolean;           // Reroute flag (default: false)
  tripId: string;                // GTFS trip ID (default: "trip_123")
  destination: string;           // Terminal station (default: "Van Cortlandt Park")
  confidence: ConfidenceLevel;   // Confidence level (default: "high")
  feedName: string;              // Feed source (default: "gtfs")
  feedAge: number;               // Feed age in seconds (default: 8)
}
```

**Default Return Values**

When called with no parameters, `createMockArrival()` returns:

| Property | Type | Default Value | Description |
|----------|------|---------------|-------------|
| `line` | `string` | `"1"` | IRT Broadway-7th Ave Local |
| `direction` | `Direction` | `"N"` | Northbound |
| `arrivalTime` | `number` | `Date.now() + 120000` | 2 minutes from current time |
| `minutesAway` | `number` | `2` | Minutes until arrival |
| `isAssigned` | `boolean` | `true` | Train is physically assigned |
| `isRerouted` | `boolean` | `false` | Not rerouted |
| `tripId` | `string` | `"trip_123"` | GTFS trip identifier |
| `destination` | `string` | `"Van Cortlandt Park"` | Bronx terminal for 1 train |
| `confidence` | `ConfidenceLevel` | `"high"` | A Division + assigned |
| `feedName` | `string` | `"gtfs"` | IRT Division feed |
| `feedAge` | `number` | `8` | 8 seconds since last poll |

---

### Usage Examples

#### Basic Arrival Creation

```typescript
import { createMockArrival } from "@mta-my-way/shared/testing";

// Default arrival (1 train, northbound, arriving in 2 minutes)
const arrival = createMockArrival();
console.log(arrival.line); // "1"
console.log(arrival.direction); // "N"
console.log(arrival.minutesAway); // 2
console.log(arrival.destination); // "Van Cortlandt Park"
```

#### Southbound Arrival

```typescript
const southboundArrival = createMockArrival({
  line: "2",
  direction: "S",
  minutesAway: 5,
  destination: "New Lots Avenue"
});

// Test southbound display
expect(southboundArrival.direction).toBe("S");
expect(southboundArrival.minutesAway).toBe(5);
```

#### Delayed Arrival with Low Confidence

```typescript
const delayedArrival = createMockArrival({
  minutesAway: 15,
  confidence: "low",
  feedAge: 45 // Stale data
});

// Test delay handling
expect(delayedArrival.minutesAway).toBeGreaterThan(10);
expect(delayedArrival.confidence).toBe("low");
expect(delayedArrival.feedAge).toBeGreaterThan(30);
```

#### Rerouted Arrival

```typescript
const reroutedArrival = createMockArrival({
  isRerouted: true,
  line: "1",
  destination: "14 St (via 2)",
  tripId: "trip_reroute_456"
});

// Test reroute notification
expect(reroutedArrival.isRerouted).toBe(true);
expect(reroutedArrival.destination).toContain("via");
```

#### Unassigned Trip (B Division)

```typescript
const unassignedArrival = createMockArrival({
  line: "A",              // B Division
  direction: "N",
  isAssigned: false,      // Unassigned
  destination: "Inwood - 207 St",
  feedName: "gtfs-ace",   // B Division feed
  confidence: "low",      // B Division + unassigned = low
  feedAge: 12
});

// Test confidence calculation
expect(unassignedArrival.confidence).toBe("low");
expect(unassignedArrival.isAssigned).toBe(false);
```

---

### Common Override Patterns

#### Pattern 1: Time-Based Testing

```typescript
// Immediate arrival
const arrivingNow = createMockArrival({
  arrivalTime: Date.now() + 30000,    // 30 seconds
  minutesAway: 0
});

// Short-term arrivals
const oneMinute = createMockArrival({
  arrivalTime: Date.now() + 60000,
  minutesAway: 1
});

const threeMinutes = createMockArrival({
  arrivalTime: Date.now() + 180000,
  minutesAway: 3
});

// Long-term arrival
const tenMinutes = createMockArrival({
  arrivalTime: Date.now() + 600000,
  minutesAway: 10,
  confidence: "medium"  // Far arrivals are less reliable
});

// Test sorting by arrival time
const arrivals = [arrivingNow, threeMinutes, oneMinute];
arrivals.sort((a, b) => a.arrivalTime - b.arrivalTime);
expect(arrivals[0].minutesAway).toBe(0);
expect(arrivals[2].minutesAway).toBe(3);
```

#### Pattern 2: Line-Specific Arrivals

```typescript
// IRT Division (A Division) - numbered trains
const train1 = createMockArrival({
  line: "1",
  direction: "N",
  destination: "Van Cortlandt Park",
  feedName: "gtfs",
  isAssigned: true,
  confidence: "high"
});

const train4 = createMockArrival({
  line: "4",
  direction: "N",
  destination: "Woodlawn",
  feedName: "gtfs",
  isAssigned: true,
  confidence: "high"
});

// BMT/IND Division (B Division) - lettered trains
const trainA = createMockArrival({
  line: "A",
  direction: "N",
  destination: "Inwood - 207 St",
  feedName: "gtfs-ace",
  isAssigned: true,
  confidence: "medium"  // B Division + assigned = medium
});

const trainF = createMockArrival({
  line: "F",
  direction: "S",
  destination: "Coney Island - Stillwell Av",
  feedName: "gtfs-bdfm",
  isAssigned: false,
  confidence: "low"  // B Division + unassigned = low
});
```

#### Pattern 3: Confidence Level Scenarios

```typescript
// High confidence (A Division + assigned)
const highConfidence = createMockArrival({
  line: "1",
  isAssigned: true,
  confidence: "high",
  feedAge: 5  // Fresh data
});

// Medium confidence (A Division + unassigned OR B Division + assigned)
const mediumConfidenceA = createMockArrival({
  line: "1",
  isAssigned: false,  // Unassigned A Division
  confidence: "medium"
});

const mediumConfidenceB = createMockArrival({
  line: "A",          // B Division
  isAssigned: true,   // Assigned B Division
  feedName: "gtfs-ace",
  confidence: "medium"
});

// Low confidence (B Division + unassigned)
const lowConfidence = createMockArrival({
  line: "F",
  isAssigned: false,
  feedName: "gtfs-bdfm",
  confidence: "low",
  feedAge: 20  // Stale data
});

// Test confidence-based filtering
const reliableArrivals = [highConfidence, mediumConfidenceA, lowConfidence]
  .filter(a => a.confidence === "high");
expect(reliableArrivals).toHaveLength(1);
```

#### Pattern 4: Feed Age Testing

```typescript
// Fresh data
const freshArrival = createMockArrival({
  feedAge: 3,  // 3 seconds old
  confidence: "high"
});

// Moderate staleness
const moderateArrival = createMockArrival({
  feedAge: 15,  // 15 seconds old
  confidence: "medium"
});

// Stale data
const staleArrival = createMockArrival({
  feedAge: 45,  // 45 seconds old
  confidence: "low"
});

// Very stale data
const veryStaleArrival = createMockArrival({
  feedAge: 90,  // 90 seconds old
  confidence: "low"
});

// Test staleness filtering
const MAX_FEED_AGE = 30;
const freshArrivals = [freshArrival, moderateArrival, staleArrival]
  .filter(a => a.feedAge <= MAX_FEED_AGE);
expect(freshArrivals).toHaveLength(2);
```

#### Pattern 5: Direction-Specific Testing

```typescript
// Northbound arrivals
const northbound1 = createMockArrival({
  line: "1",
  direction: "N",
  destination: "Van Cortlandt Park"
});

const northbound2 = createMockArrival({
  line: "2",
  direction: "N",
  destination: "Wakefield - 241 St"
});

// Southbound arrivals
const southbound1 = createMockArrival({
  line: "1",
  direction: "S",
  destination: "South Ferry"
});

const southbound2 = createMockArrival({
  line: "2",
  direction: "S",
  destination: "New Lots Avenue"
});

// Test direction filtering
const allArrivals = [northbound1, southbound1, northbound2, southbound2];
const northboundOnly = allArrivals.filter(a => a.direction === "N");
const southboundOnly = allArrivals.filter(a => a.direction === "S");

expect(northboundOnly).toHaveLength(2);
expect(southboundOnly).toHaveLength(2);
```

#### Pattern 6: Multiple Arrivals for Same Station

```typescript
// Create realistic arrival list for Times Square northbound
const timesSquareNorth = [
  createMockArrival({
    line: "1",
    direction: "N",
    minutesAway: 2,
    destination: "Van Cortlandt Park",
    tripId: "trip_001"
  }),
  createMockArrival({
    line: "2",
    direction: "N",
    minutesAway: 5,
    destination: "Wakefield - 241 St",
    tripId: "trip_002"
  }),
  createMockArrival({
    line: "3",
    direction: "N",
    minutesAway: 8,
    destination: "Harlem - 148 St",
    tripId: "trip_003"
  })
];

// Sort by arrival time
timesSquareNorth.sort((a, b) => a.minutesAway - b.minutesAway);

// Test arrival sequence
expect(timesSquareNorth[0].line).toBe("1");
expect(timesSquareNorth[0].minutesAway).toBe(2);
expect(timesSquareNorth[2].line).toBe("3");
expect(timesSquareNorth[2].minutesAway).toBe(8);
```

#### Pattern 7: Destination-Specific Testing

```typescript
// Bronx terminals
const bronxTerminal1 = createMockArrival({
  line: "1",
  direction: "N",
  destination: "Van Cortlandt Park"
});

const bronxTerminal4 = createMockArrival({
  line: "4",
  direction: "N",
  destination: "Woodlawn"
});

// Brooklyn terminals
const brooklynTerminal2 = createMockArrival({
  line: "2",
  direction: "S",
  destination: "New Lots Avenue"
});

const brooklynTerminal5 = createMockArrival({
  line: "5",
  direction: "S",
  destination: "Flatbush Av - Brooklyn College"
});

// Queens terminals
const queensTerminal7 = createMockArrival({
  line: "7",
  direction: "S",
  destination: "Flushing - Main St"
});

// Test destination filtering
const bronxArrivals = [bronxTerminal1, bronxTerminal4];
expect(bronxArrivals.every(a => 
  a.destination.includes("Park") || a.destination === "Woodlawn"
)).toBe(true);
```

---

### Time-Based Scenarios

#### Fixed Timestamp Testing

```typescript
import { createMockArrival } from "@mta-my-way/shared/testing";

// Use fixed timestamp for predictable tests
const fixedTime = 1704067200000; // 2024-01-01 00:00:00 UTC

const arrival1 = createMockArrival({
  arrivalTime: fixedTime + 60000,   // 1 minute after
  minutesAway: 1
});

const arrival2 = createMockArrival({
  arrivalTime: fixedTime + 300000,  // 5 minutes after
  minutesAway: 5
});

const arrival3 = createMockArrival({
  arrivalTime: fixedTime + 900000,  // 15 minutes after
  minutesAway: 15
});

// Test sorting is deterministic
const sorted = [arrival3, arrival1, arrival2].sort((a, b) => 
  a.arrivalTime - b.arrivalTime
);
expect(sorted[0].minutesAway).toBe(1);
expect(sorted[1].minutesAway).toBe(5);
expect(sorted[2].minutesAway).toBe(15);
```

#### Arrival Countdown Testing

```typescript
// Test countdown display logic
const createCountdown = (arrival: ArrivalTime) => {
  const now = Date.now();
  const msUntil = arrival.arrivalTime - now;
  const minutes = Math.floor(msUntil / 60000);
  const seconds = Math.floor((msUntil % 60000) / 1000);
  
  if (minutes === 0) return `${seconds}s`;
  if (minutes < 1) return "< 1 min";
  return `${minutes} min`;
};

const imminentArrival = createMockArrival({
  arrivalTime: Date.now() + 30000,  // 30 seconds
  minutesAway: 0
});

const shortArrival = createMockArrival({
  arrivalTime: Date.now() + 90000,  // 90 seconds
  minutesAway: 1
});

const regularArrival = createMockArrival({
  arrivalTime: Date.now() + 300000,  // 5 minutes
  minutesAway: 5
});

expect(createCountdown(imminentArrival)).toBe("30s");
expect(createCountdown(shortArrival)).toBe("< 1 min");
expect(createCountdown(regularArrival)).toBe("5 min");
```

#### Rush Hour Patterns

```typescript
// Simulate rush hour arrival density
const rushHourNorth = [
  createMockArrival({ line: "1", minutesAway: 2, tripId: "rush_001" }),
  createMockArrival({ line: "2", minutesAway: 3, tripId: "rush_002" }),
  createMockArrival({ line: "3", minutesAway: 4, tripId: "rush_003" }),
  createMockArrival({ line: "1", minutesAway: 6, tripId: "rush_004" }),
  createMockArrival({ line: "2", minutesAway: 8, tripId: "rush_005" }),
  createMockArrival({ line: "3", minutesAway: 10, tripId: "rush_006" })
];

// Test arrival frequency
const next5Minutes = rushHourNorth.filter(a => a.minutesAway <= 5);
expect(next5Minutes).toHaveLength(3); // 3 arrivals in 5 minutes (high frequency)

const next10Minutes = rushHourNorth.filter(a => a.minutesAway <= 10);
expect(next10Minutes).toHaveLength(6); // 6 arrivals in 10 minutes
```

---

### Real-World Testing Scenarios

#### Scenario 1: Station Arrival Display

```typescript
// Create realistic arrival board for Times Square
const timesSquareArrivals = {
  northbound: [
    createMockArrival({ 
      line: "1", direction: "N", minutesAway: 2, 
      destination: "Van Cortlandt Park", confidence: "high" 
    }),
    createMockArrival({ 
      line: "2", direction: "N", minutesAway: 5, 
      destination: "Wakefield - 241 St", confidence: "high" 
    }),
    createMockArrival({ 
      line: "3", direction: "N", minutesAway: 8, 
      destination: "Harlem - 148 St", confidence: "high" 
    })
  ],
  southbound: [
    createMockArrival({ 
      line: "1", direction: "S", minutesAway: 3, 
      destination: "South Ferry", confidence: "high" 
    }),
    createMockArrival({ 
      line: "2", direction: "S", minutesAway: 7, 
      destination: "New Lots Avenue", confidence: "medium" 
    })
  ]
};

// Test arrival display sorting
timesSquareArrivals.northbound.sort((a, b) => a.minutesAway - b.minutesAway);
expect(timesSquareArrivals.northbound[0].line).toBe("1");
expect(timesSquareArrivals.northbound[0].minutesAway).toBe(2);
```

#### Scenario 2: Service Disruption Testing

```typescript
// Simulate service disruption with reroutes
const disruptionScenarios = [
  createMockArrival({
    line: "1",
    isRerouted: true,
    destination: "14 St (via 2)",
    tripId: "reroute_001",
    confidence: "low"
  }),
  createMockArrival({
    line: "1",
    isRerouted: false,
    destination: "South Ferry",
    tripId: "normal_001",
    confidence: "high",
    minutesAway: 12
  })
];

// Test reroute detection
const reroutedArrivals = disruptionScenarios.filter(a => a.isRerouted);
expect(reroutedArrivals).toHaveLength(1);
expect(reroutedArrivals[0].destination).toContain("via");
```

#### Scenario 3: Low Confidence Filtering

```typescript
// Test hiding low-confidence arrivals from user-facing display
const allArrivals = [
  createMockArrival({ line: "1", confidence: "high", minutesAway: 2 }),
  createMockArrival({ line: "2", confidence: "high", minutesAway: 5 }),
  createMockArrival({ line: "A", confidence: "low", minutesAway: 8 }),  // Hidden
  createMockArrival({ line: "3", confidence: "medium", minutesAway: 10 }),
  createMockArrival({ line: "F", confidence: "low", minutesAway: 12 })   // Hidden
];

// User-facing display: show only high + medium confidence
const displayArrivals = allArrivals.filter(a => 
  a.confidence === "high" || a.confidence === "medium"
);

expect(displayArrivals).toHaveLength(3);
expect(displayArrivals.every(a => a.confidence !== "low")).toBe(true);

// Admin/debug display: show all
const debugArrivals = allArrivals;
expect(debugArrivals).toHaveLength(5);
```

#### Scenario 4: Trip ID Persistence Testing

```typescript
// Test tracking same train across refreshes
const tripId = "MTA_ABC_123456";

// Initial arrival
const initialArrival = createMockArrival({
  tripId,
  line: "1",
  direction: "N",
  minutesAway: 10,
  arrivalTime: Date.now() + 600000
});

// Updated arrival (2 minutes later)
const updatedArrival = createMockArrival({
  tripId,  // Same trip ID
  line: "1",
  direction: "N",
  minutesAway: 8,
  arrivalTime: Date.now() + 480000
});

// Test trip ID matching
expect(initialArrival.tripId).toBe(updatedArrival.tripId);
expect(initialArrival.line).toBe(updatedArrival.line);

// Test arrival time progression
expect(updatedArrival.minutesAway).toBeLessThan(initialArrival.minutesAway);
expect(updatedArrival.arrivalTime).toBeLessThan(initialArrival.arrivalTime);
```

---

### Edge Cases and Gotchas

#### Arrival Time vs Minutes Away Consistency

**CRITICAL: These Two Fields Must Stay in Sync**

The `arrivalTime` (absolute POSIX timestamp) and `minutesAway` (relative countdown) represent the same moment in time. When overriding one, you **must** override the other to maintain consistency:

```typescript
import { createMockArrival } from "@mta-my-way/shared/testing";

// ❌ INCORRECT: Inconsistent time values
const inconsistentArrival = createMockArrival({
  arrivalTime: Date.now() + 600000,  // 10 minutes from now
  minutesAway: 2                      // But says 2 minutes away!
});
// BUG: UI shows "2 min" but train actually arrives in 10 minutes

// ✅ CORRECT: Keep arrivalTime and minutesAway synchronized
const consistentArrival = createMockArrival({
  arrivalTime: Date.now() + 600000,  // 10 minutes from now
  minutesAway: 10                     // Matches arrivalTime
});

// ✅ CORRECT: Helper function to ensure consistency
function createArrivalInMinutes(minutes: number, overrides = {}) {
  return createMockArrival({
    arrivalTime: Date.now() + (minutes * 60000),
    minutesAway: minutes,
    ...overrides
  });
}

const fiveMinuteArrival = createArrivalInMinutes(5, { line: "2" });
expect(fiveMinuteArrival.minutesAway).toBe(5);
expect(fiveMinuteArrival.arrivalTime).toBeCloseTo(Date.now() + 300000, -3);
```

**Testing Time Calculations:**

```typescript
// Verify the relationship between fields
const arrival = createMockArrival({
  arrivalTime: Date.now() + 300000  // 5 minutes
});

const now = Date.now();
const actualMinutesUntil = Math.round((arrival.arrivalTime - now) / 60000);

// This should pass if fields are consistent
expect(actualMinutesUntil).toBe(arrival.minutesAway);
```

---

#### Timestamp Precision and Time Zones

**All Timestamps Are POSIX Milliseconds (UTC)**

The `arrivalTime` field uses POSIX timestamps in milliseconds since Unix epoch (January 1, 1970, UTC). This is timezone-agnostic by design:

```typescript
// POSIX timestamp is always UTC
const utcArrival = createMockArrival({
  arrivalTime: 1704067200000  // 2024-01-01 00:00:00 UTC
});

// Same timestamp, different timezone display
const toLocalDate = (timestamp: number) => new Date(timestamp).toLocaleString();
console.log(toLocalDate(utcArrival.arrivalTime));
// In New York (EST): "12/31/2023, 7:00:00 PM"
// In London (GMT): "1/1/2024, 12:00:00 AM"
// But the underlying timestamp is the same

// ✅ CORRECT: Always work with UTC timestamps internally
const isPastDue = Date.now() > arrival.arrivalTime;

// ❌ AVOID: Timezone-dependent comparisons (fragile)
const localDate = new Date(arrival.arrivalTime);
const hours = localDate.getHours();  // Depends on server timezone
```

**Timestamp Precision:**

```typescript
// POSIX timestamps have millisecond precision
const highPrecision = createMockArrival({
  arrivalTime: 1704067200123  // Includes milliseconds
});

const now = Date.now();
const msRemaining = highPrecision.arrivalTime - now;

// Test sub-minute precision
if (msRemaining < 60000 && msRemaining > 0) {
  const seconds = Math.floor(msRemaining / 1000);
  console.log(`Arriving in ${seconds} seconds`);
}
```

---

#### Confidence Level Calculation

**Confidence Is Determined by Division + Assignment Status**

The confidence level is not arbitrary - it follows specific rules based on the MTA's division structure and trip assignment:

```typescript
// Division A (IRT - numbered trains: 1-6, 7, 42 St Shuttle)
// Division B (BMT/IND - lettered trains: A-Z, except S shuttles)

// High confidence: A Division + assigned
const highConfidence = createMockArrival({
  line: "1",        // A Division
  isAssigned: true,
  confidence: "high",
  feedName: "gtfs"   // A Division feed
});

// Medium confidence: Two paths to medium
// Path 1: A Division + unassigned
const mediumA = createMockArrival({
  line: "1",
  isAssigned: false,  // Unassigned A Division
  confidence: "medium",
  feedName: "gtfs"
});

// Path 2: B Division + assigned
const mediumB = createMockArrival({
  line: "A",         // B Division
  isAssigned: true,  // Assigned B Division
  confidence: "medium",
  feedName: "gtfs-ace"  // B Division feed
});

// Low confidence: B Division + unassigned
const lowConfidence = createMockArrival({
  line: "F",         // B Division
  isAssigned: false, // Unassigned B Division
  confidence: "low",
  feedName: "gtfs-bdfm"
});
```

**Testing Confidence Logic:**

```typescript
// Helper function to calculate expected confidence
function calculateConfidence(line: string, isAssigned: boolean): ConfidenceLevel {
  const isADivision = /^[1-6]|7|GS$/.test(line);
  
  if (isADivision && isAssigned) return "high";
  if (isADivision && !isAssigned) return "medium";
  if (!isADivision && isAssigned) return "medium";
  return "low";  // B Division + unassigned
}

// Test confidence calculation
const testArrival = createMockArrival({
  line: "A",
  isAssigned: false
});

const expectedConfidence = calculateConfidence("A", false);
expect(testArrival.confidence).toBe(expectedConfidence); // "low"
```

---

#### Feed Name and Division Mapping

**Feed Name Must Match the Line's Division**

The `feedName` field indicates which GTFS-RT feed provided the arrival. Different feeds serve different divisions:

```typescript
// A Division feeds (numbered trains)
const irtTrains = ["1", "2", "3", "4", "5", "6", "7", "GS"];

// B Division feeds (lettered trains)
const bmtIndTrains = {
  "gtfs-ace": ["A", "C", "E"],
  "gtfs-bdfm": ["B", "D", "F", "M"],
  "gtfs-nqrw": ["N", "Q", "R", "W"],
  "gtfs-jz": ["J", "Z"],
  "gtfs-l": ["L"],
  "gtfs-sir": ["SIR"]  // Staten Island Railway
};

// ✅ CORRECT: Feed name matches line division
const correctFeed = createMockArrival({
  line: "A",
  feedName: "gtfs-ace"  // Correct feed for A train
});

// ❌ INCORRECT: Feed name doesn't match line
const wrongFeed = createMockArrival({
  line: "1",
  feedName: "gtfs-ace"  // Wrong! 1 train is in "gtfs" feed
});
```

**Testing Feed Validation:**

```typescript
// Validate feed name matches line
function validateFeedForLine(line: string, feedName: string): boolean {
  const validFeeds: Record<string, string[]> = {
    "gtfs": ["1", "2", "3", "4", "5", "6", "7", "GS"],
    "gtfs-ace": ["A", "C", "E"],
    "gtfs-bdfm": ["B", "D", "F", "M"],
    "gtfs-nqrw": ["N", "Q", "R", "W"],
    "gtfs-jz": ["J", "Z"],
    "gtfs-l": ["L"]
  };
  
  return Object.values(validFeeds).some(lines => 
    lines.includes(line) && validFeeds[feedName]?.includes(line)
  );
}

const arrival = createMockArrival({ line: "A", feedName: "gtfs-ace" });
expect(validateFeedForLine(arrival.line, arrival.feedName)).toBe(true);
```

---

#### Direction Type Literal Gotcha

**Direction Must Be Exactly `"N"` or `"S"` (Not `"north"` or `"south"`)**

```typescript
import type { Direction } from "@mta-my-way/shared/types/arrivals";

// ✅ CORRECT: Use exact literals
const northbound = createMockArrival({
  direction: "N"  // TypeScript validates this
});

const southbound = createMockArrival({
  direction: "S"  // TypeScript validates this
});

// ❌ INCORRECT: These fail TypeScript validation
// const invalid1 = createMockArrival({ direction: "north" });
// const invalid2 = createMockArrival({ direction: "North" });
// const invalid3 = createMockArrival({ direction: "SOUTH" });

// ✅ CORRECT: Type-safe direction helper
function createDirectionalArrival(direction: Direction) {
  return createMockArrival({ direction });
}

const nb = createDirectionalArrival("N");
const sb = createDirectionalArrival("S");
```

---

#### Trip ID Uniqueness

**Trip IDs Must Be Unique Per Arrival (Even for Same Physical Train)**

```typescript
// ❌ INCORRECT: Reusing trip ID for different arrivals
const arrival1 = createMockArrival({
  tripId: "MTA_123",
  line: "1",
  minutesAway: 2
});

const arrival2 = createMockArrival({
  tripId: "MTA_123",  // Same trip ID!
  line: "2",
  minutesAway: 5
});
// BUG: System thinks these are the same train

// ✅ CORRECT: Unique trip IDs per arrival
const unique1 = createMockArrival({
  tripId: "MTA_001",
  line: "1",
  minutesAway: 2
});

const unique2 = createMockArrival({
  tripId: "MTA_002",
  line: "2",
  minutesAway: 5
});

// ✅ CORRECT: Helper function to generate unique IDs
let tripCounter = 0;
function createUniqueTrip() {
  return `MTA_${Date.now()}_${tripCounter++}`;
}

const auto1 = createMockArrival({ tripId: createUniqueTrip() });
const auto2 = createMockArrival({ tripId: createUniqueTrip() });
expect(auto1.tripId).not.toBe(auto2.tripId);
```

---

#### Feed Age Calculation Gotcha

**Feed Age Is in Seconds, Not Milliseconds**

```typescript
// ❌ INCORRECT: Treating feedAge as milliseconds
const wrong = createMockArrival({
  feedAge: 5000  // This is 5000 seconds, not 5000ms!
});
// BUG: 5000 seconds = 83 minutes, not 5 seconds

// ✅ CORRECT: Feed age is in seconds
const correct = createMockArrival({
  feedAge: 5  // 5 seconds (fresh)
});

// ✅ CORRECT: Convert milliseconds to seconds
const msToSeconds = (ms: number) => Math.floor(ms / 1000);
const staleArrival = createMockArrival({
  feedAge: msToSeconds(45000)  // 45 seconds = stale
});

// Test staleness threshold
const MAX_STALE_SECONDS = 30;
const isFresh = correct.feedAge <= MAX_STALE_SECONDS;
const isStale = staleArrival.feedAge > MAX_STALE_SECONDS;

expect(isFresh).toBe(true);
expect(isStale).toBe(true);
```

---

#### No Built-in Validation

**`createMockArrival` Does Not Validate Inputs**

The function accepts any values without validation. It will create arrivals with impossible combinations:

```typescript
// ❌ These create objects without error (but are invalid!)
const impossibleArrival = createMockArrival({
  line: "INVALID-LINE",      // Non-existent MTA line
  direction: "X",            // Invalid direction (TypeScript won't catch without type)
  arrivalTime: -1000000,     // Negative timestamp (before Unix epoch!)
  minutesAway: -5,           // Negative minutes (arrived in the past)
  isAssigned: false,         // Unassigned
  confidence: "high",        // But confidence should be low for unassigned A Division!
  feedName: "wrong-feed",    // Invalid feed name
  feedAge: -10               // Negative feed age (impossible!)
});

// ✅ You must add your own validation if needed
function validateArrival(arrival: ArrivalTime): boolean {
  // Validate line format
  if (!/^[1-6]|[A-Z]|[GS]$/.test(arrival.line)) return false;
  
  // Validate direction
  if (!["N", "S"].includes(arrival.direction)) return false;
  
  // Validate timestamp
  if (arrival.arrivalTime < 0) return false;
  
  // Validate minutesAway
  if (arrival.minutesAway < 0) return false;
  
  // Validate feedAge
  if (arrival.feedAge < 0) return false;
  
  // Validate confidence matches assignment logic
  const isADivision = /^[1-6]|7|GS$/.test(arrival.line);
  if (isADivision && arrival.isAssigned && arrival.confidence !== "high") return false;
  
  return true;
}

const validArrival = createMockArrival({ line: "1" });
expect(validateArrival(validArrival)).toBe(true);
```

---

### Common Pitfalls Summary

1. **Time Inconsistency**: Overriding `arrivalTime` without updating `minutesAway` (or vice versa)
2. **Timezone Confusion**: Assuming timestamps are in local time (they're always UTC)
3. **Confidence Mismatch**: `confidence` field not matching division + assignment logic
4. **Feed Name Mismatch**: `feedName` not matching the line's division feed
5. **Direction Typos**: Using `"north"` instead of `"N"` (TypeScript catches this with types)
6. **Non-Unique Trip IDs**: Reusing `tripId` for different arrivals
7. **Feed Age Units**: Treating `feedAge` as milliseconds (it's seconds!)
8. **No Validation**: Impossible values accepted without error
9. **Missing Express Flag**: Current implementation doesn't include `isExpress` field (use overrides if needed)
10. **Shallow Merge**: Like other mock generators, arrays aren't merged (though arrivals have no array fields)

---

### Quick Reference: Safe Override Patterns

```typescript
// ✅ SAFE: Override primitive values with consistent time
const arrival1 = createMockArrival({
  line: "2",
  direction: "S",
  arrivalTime: Date.now() + 300000,  // 5 minutes
  minutesAway: 5                       // Must match!
});

// ✅ SAFE: Use helper for time-based arrivals
const arrival2 = (() => {
  const minutes = 10;
  return createMockArrival({
    line: "A",
    direction: "N",
    arrivalTime: Date.now() + (minutes * 60000),
    minutesAway: minutes,
    feedName: "gtfs-ace",
    confidence: "medium"
  });
})();

// ✅ SAFE: Maintain confidence logic
const arrival3 = createMockArrival({
  line: "F",         // B Division
  isAssigned: false, // Unassigned
  feedName: "gtfs-bdfm",
  confidence: "low"   // B Division + unassigned = low
});

// ❌ UNSAFE: Inconsistent time values
const arrival4 = createMockArrival({
  arrivalTime: Date.now() + 600000,  // 10 min
  minutesAway: 2                       // But says 2 min!
});

// ❌ UNSAFE: Confidence doesn't match logic
const arrival5 = createMockArrival({
  line: "1",         // A Division
  isAssigned: true,  // Assigned
  confidence: "low"  // WRONG! Should be "high"
});
```

---

#### `createMockAlert`

Creates a mock service alert object with default values for testing alert display, filtering, and notification logic.

**Type Signature:**
```typescript
function createMockAlert(overrides?: Partial<StationAlert>): StationAlert
```

**Parameters:**
- `overrides: Partial<StationAlert>` - Partial object to override default values (default: `{}`)

**Type Definitions:**
All types are defined in [`packages/shared/src/types/alerts.ts`](../packages/shared/src/types/alerts.ts):

- [`StationAlert`](../packages/shared/src/types/alerts.ts#L15) - Main alert interface (lines 15-47)
  - `id: string` - Unique alert identifier
  - `severity: AlertSeverity` - Severity classification (default: `"warning"`)
  - `source: AlertSource` - Alert source (optional in mock)
  - `headline: string` - Simplified, plain-language headline
  - `description: string` - Full description text
  - `affectedLines: string[]` - Lines affected by this alert
  - `activePeriod: {start: number, end?: number}` - When the alert is active
  - `cause: string` - Cause of the disruption (from GTFS-RT)
  - `effect: string` - Service effect type (from GTFS-RT)
  - `isRaw?: boolean` - Whether this is a raw, unsimplified alert
  - `shuttleInfo?: ShuttleBusInfo` - Shuttle bus information for suspended service

- [`AlertSeverity`](../packages/shared/src/types/alerts.ts#L7) - Alert severity type (line 7)
  - Type: `"info" | "warning" | "severe"`

- [`AlertSource`](../packages/shared/src/types/alerts.ts#L10) - Alert source type (line 10)
  - Type: `"official" | "predicted"`

- [`ShuttleBusInfo`](../packages/shared/src/types/alerts.ts#L53) - Shuttle bus information (lines 53-66)
  - `lineId: string` - Line ID with suspended service
  - `fromStopId: string` - Where suspension begins
  - `toStopId: string` - Where suspension ends
  - `stops: ShuttleStop[]` - Shuttle bus stop locations
  - `frequencyMinutes: string` - Approximate frequency (e.g., `"8-12"`)
  - `lastVerified: string` - Last verification date (ISO format)

**Import Path:**
```typescript
// Import the helper function
import { createMockAlert } from "@mta-my-way/shared/testing";

// Import types for type checking
import type { StationAlert, AlertSeverity, AlertSource, ShuttleBusInfo } from "@mta-my-way/shared/types/alerts";
```

**Important: No Separate "MockAlert" Type**

There is **no separate `MockAlert` type** in this codebase. The `createMockAlert` function returns a regular `StationAlert` object - the same type used throughout the application for real alert data. The "mock" aspect is simply that the function provides convenient default values (a warning-level delay on the 1 train) that can be selectively overridden.

This design means:
- **Type compatibility:** Mock alerts are 100% compatible with real alert data structures
- **No conversion needed:** Mock alerts can be used anywhere real alerts are expected
- **Type safety:** TypeScript ensures mock alerts have the exact same shape as real alerts
- **Test realism:** Mock alerts match production data structures exactly

**Return Type Structure**

The function returns a complete `StationAlert` object with all required properties:

```typescript
interface StationAlert {
  id: string;                  // Alert ID (default: "alert_123")
  severity: AlertSeverity;     // Severity level (default: "warning")
  source?: AlertSource;        // Source (optional, not set by default)
  headline: string;           // Headline (default: "Delays on 1 train")
  description: string;        // Full description (default: "1 trains running with delays due to signal problems")
  affectedLines: string[];    // Affected lines (default: ["1"])
  activePeriod: {              // Active time window
    start: number;            // Start timestamp (default: 1 hour ago)
    end?: number;              // End timestamp (default: 2 hours from now)
  };
  cause: string;               // GTFS-RT cause (default: "SIGNAL_PROBLEM")
  effect: string;             // GTFS-RT effect (default: "DELAY")
  isRaw?: boolean;            // Raw alert flag (optional, not set by default)
  shuttleInfo?: ShuttleBusInfo; // Shuttle info (optional, not set by default)
}
```

**Default Return Values**

When called with no parameters, `createMockAlert()` returns:

| Property | Type | Default Value |
|----------|------|---------------|
| `id` | `string` | `"alert_123"` |
| `severity` | `AlertSeverity` | `"warning"` |
| `source` | `AlertSource \| undefined` | `undefined` (not set by default) |
| `headline` | `string` | `"Delays on 1 train"` |
| `description` | `string` | `"1 trains running with delays due to signal problems"` |
| `affectedLines` | `string[]` | `["1"]` |
| `activePeriod.start` | `number` | `Date.now() - 3600000` (1 hour ago) |
| `activePeriod.end` | `number \| undefined` | `Date.now() + 7200000` (2 hours from now) |
| `cause` | `string` | `"SIGNAL_PROBLEM"` |
| `effect` | `string` | `"DELAY"` |
| `isRaw` | `boolean \| undefined` | `undefined` (not set by default) |
| `shuttleInfo` | `ShuttleBusInfo \| undefined` | `undefined` (not set by default) |

**Relationship to Real Alert Data**

Mock alerts created with `createMockAlert` are structurally identical to alerts loaded from the GTFS-Realtime feed or generated by the delay detection system. They can be used interchangeably in tests, components, and utility functions.

**Usage Examples**

#### Example: Basic alert creation (uses all defaults)
```typescript
import { createMockAlert } from "@mta-my-way/shared/testing";

const alert = createMockAlert();
// Returns warning-level 1 train delay with all default values
console.log(alert.severity); // "warning"
console.log(alert.affectedLines); // ["1"]
console.log(alert.headline); // "Delays on 1 train"
```

#### Example: Severe alert with service suspension
```typescript
const suspensionAlert = createMockAlert({
  id: "alert_suspension_1",
  severity: "severe",
  headline: "Suspension of 1 Train Service",
  description: "No 1 train service due to major incident - expect extensive delays",
  affectedLines: ["1"],
  cause: "MAJOR_INCIDENT",
  effect: "NO_SERVICE"
});

// Test suspension handling
const isSuspended = suspensionAlert.effect === "NO_SERVICE";
expect(isSuspended).toBe(true);
```

#### Example: Multi-line alert
```typescript
const broadwayDelays = createMockAlert({
  id: "alert_broadway",
  severity: "warning",
  affectedLines: ["1", "2", "3"],
  headline: "Delays on Broadway Lines",
  description: "Broadway-7th Ave lines running with delays due to signal problems at Times Square",
  cause: "SIGNAL_PROBLEM",
  effect: "DELAY"
});

// Test multi-line filtering
const affectsLine1 = broadwayDelays.affectedLines.includes("1");
expect(affectsLine1).toBe(true);
```

#### Example: Info-level advisory
```typescript
const advisoryAlert = createMockAlert({
  id: "alert_advisory",
  severity: "info",
  headline: " Planned Work - 1 Train",
  description: "1 trains run local in both directions due to track maintenance",
  affectedLines: ["1"],
  cause: "CONSTRUCTION",
  effect: "DETOUR"
});

// Test advisory display (info-level may not show warning banner)
const needsWarning = advisoryAlert.severity !== "info";
expect(needsWarning).toBe(false);
```

#### Example: Expired alert
```typescript
const expiredAlert = createMockAlert({
  id: "alert_expired",
  activePeriod: {
    start: Date.now() - 7200000, // 2 hours ago
    end: Date.now() - 3600000   // Ended 1 hour ago
  }
});

// Test expired alert filtering
const now = Date.now();
const isActive = now >= expiredAlert.activePeriod.start && 
                (!expiredAlert.activePeriod.end || now <= expiredAlert.activePeriod.end);
expect(isActive).toBe(false);
```

#### Example: Future alert
```typescript
const futureAlert = createMockAlert({
  id: "alert_future",
  severity: "warning",
  headline: "Upcoming Planned Work",
  activePeriod: {
    start: Date.now() + 3600000, // Starts in 1 hour
    end: Date.now() + 10800000    // Ends in 3 hours
  }
});

// Test future alert handling
const isFuture = Date.now() < futureAlert.activePeriod.start;
expect(isFuture).toBe(true);
```

#### Example: Alert with source (predicted vs official)
```typescript
const officialAlert = createMockAlert({
  id: "alert_official",
  source: "official",
  severity: "warning",
  headline: "Delays on 1 train",
  cause: "SIGNAL_PROBLEM",
  effect: "DELAY"
});

const predictedAlert = createMockAlert({
  id: "alert_predicted",
  source: "predicted",
  severity: "warning",
  headline: "Predicted Delays on 1 train",
  description: "Delays predicted based on historical patterns",
  cause: "UNKNOWN",
  effect: "DELAY"
});

// Test source-based filtering
const showOfficial = officialAlert.source === "official";
expect(showOfficial).toBe(true);
```

#### Example: Raw alert (unsimplified MTA text)
```typescript
const rawAlert = createMockAlert({
  id: "alert_raw",
  isRaw: true,
  severity: "warning",
  headline: "1 TRAINS RUNNING WITH DELAYS",
  description: "DUE TO SIGNAL PROBLEMS AT TIMES SQUARE-42ND ST, 1 TRAINS ARE RUNNING WITH DELAYS IN BOTH DIRECTIONS",
  affectedLines: ["1"],
  cause: "SIGNAL_PROBLEM",
  effect: "DELAY"
});

// Test raw alert styling
const showDashedBorder = rawAlert.isRaw === true;
expect(showDashedBorder).toBe(true);
```

#### Example: Alert with shuttle bus information
```typescript
const shuttleAlert = createMockAlert({
  id: "alert_shuttle",
  severity: "severe",
  headline: "1 Train Suspended - Shuttle Bus Service",
  description: "No 1 train service between South Ferry and Times Square - shuttle buses provided",
  affectedLines: ["1"],
  cause: "TRACK_MAINTENANCE",
  effect: "SUSPENDED",
  shuttleInfo: {
    lineId: "1",
    fromStopId: "101",
    toStopId: "725",
    stops: [
      { nearStationId: "101", description: "South Ferry" },
      { nearStationId: "103", description: "Rector St" },
      { nearStationId: "725", description: "Times Square-42 St", lat: 40.7589, lon: -73.9851 }
    ],
    frequencyMinutes: "8-12",
    lastVerified: "2024-08-30"
  }
});

// Test shuttle bus display
const hasShuttle = shuttleAlert.shuttleInfo !== undefined;
expect(hasShuttle).toBe(true);
```

### Common Testing Patterns

#### Pattern 1: Severity Level Testing

Test how alerts display and behave at different severity levels:

```typescript
const infoAlert = createMockAlert({ severity: "info" });
const warningAlert = createMockAlert({ severity: "warning" });
const severeAlert = createMockAlert({ severity: "severe" });

// Test severity-based filtering
const alertsRequiringNotification = [warningAlert, severeAlert];
const alertsToShow = [infoAlert, warningAlert, severeAlert];

// Test color coding
const getColorForSeverity = (severity: AlertSeverity) => {
  switch (severity) {
    case "severe": return "red";
    case "warning": return "yellow";
    case "info": return "blue";
  }
};

expect(getColorForSeverity(severeAlert.severity)).toBe("red");
expect(getColorForSeverity(warningAlert.severity)).toBe("yellow");
expect(getColorForSeverity(infoAlert.severity)).toBe("blue");
```

#### Pattern 2: Active Period Filtering

Test filtering alerts based on their active time window:

```typescript
const pastAlert = createMockAlert({
  activePeriod: {
    start: Date.now() - 7200000,
    end: Date.now() - 3600000
  }
});

const activeAlert = createMockAlert({
  activePeriod: {
    start: Date.now() - 3600000,
    end: Date.now() + 7200000
  }
});

const futureAlert = createMockAlert({
  activePeriod: {
    start: Date.now() + 3600000,
    end: Date.now() + 10800000
  }
});

// Test active period filtering
const isActiveNow = (alert: StationAlert) => {
  const now = Date.now();
  return now >= alert.activePeriod.start && 
         (!alert.activePeriod.end || now <= alert.activePeriod.end);
};

expect(isActiveNow(pastAlert)).toBe(false);
expect(isActiveNow(activeAlert)).toBe(true);
expect(isActiveNow(futureAlert)).toBe(false);
```

#### Pattern 3: Line-Specific Alert Testing

Test filtering alerts for specific subway lines:

```typescript
const line1Alert = createMockAlert({
  affectedLines: ["1"],
  headline: "Delays on 1 train"
});

const line123Alert = createMockAlert({
  affectedLines: ["1", "2", "3"],
  headline: "Broadway line delays"
});

const lineAAlert = createMockAlert({
  affectedLines: ["A"],
  headline: "8th Ave delays"
});

// Test line-based filtering
const getAlertsForLine = (alerts: StationAlert[], line: string) => {
  return alerts.filter(alert => alert.affectedLines.includes(line));
};

const line1Alerts = getAlertsForLine([line1Alert, line123Alert, lineAAlert], "1");
expect(line1Alerts).toHaveLength(2); // line1Alert and line123Alert
expect(line1Alerts).toContain(line1Alert);
expect(line1Alerts).toContain(line123Alert);
```

#### Pattern 4: Effect-Based Behavior

Test different service effect types:

```typescript
const delayAlert = createMockAlert({
  effect: "DELAY",
  headline: "Delays on 1 train"
});

const suspensionAlert = createMockAlert({
  effect: "NO_SERVICE",
  severity: "severe",
  headline: "1 Train Suspended"
});

const detourAlert = createMockAlert({
  effect: "DETOUR",
  headline: "1 Train Rerouted"
});

// Test effect-based handling
const isServiceDisruption = (alert: StationAlert) => {
  return ["NO_SERVICE", "SUSPENDED", "DELAY"].includes(alert.effect);
};

expect(isServiceDisruption(delayAlert)).toBe(true);
expect(isServiceDisruption(suspensionAlert)).toBe(true);
expect(isServiceDisruption(detourAlert)).toBe(false);
```

#### Pattern 5: Multi-Line Corridor Testing

Test alerts affecting multiple lines in a shared corridor:

```typescript
const broadwayCorridorAlert = createMockAlert({
  id: "alert_broadway_corridor",
  severity: "warning",
  affectedLines: ["1", "2", "3"],
  headline: "Signal Problems - Broadway Corridor",
  description: "Broadway-7th Ave lines experiencing delays due to signal problems at Times Square",
  cause: "SIGNAL_PROBLEM",
  effect: "DELAY",
  activePeriod: {
    start: Date.now() - 1800000,
    end: Date.now() + 5400000
  }
});

// Test corridor-wide impact
const affectedStations = [
  "725", // Times Square
  "726", // Penn Station
  "727"  // Herald Square
];

// All affected lines share these stations
const linesThroughTimesSquare = broadwayCorridorAlert.affectedLines.filter(line => 
  linesThroughTimesSquare.includes(line)
);

expect(linesThroughTimesSquare).toHaveLength(3);
```

#### Pattern 6: Alert Priority Testing

Test alert sorting and priority based on severity and recency:

```typescript
const lowPriority = createMockAlert({
  id: "alert_001",
  severity: "info",
  activePeriod: { start: Date.now() - 7200000, end: Date.now() + 3600000 }
});

const mediumPriority = createMockAlert({
  id: "alert_002",
  severity: "warning",
  activePeriod: { start: Date.now() - 1800000, end: Date.now() + 7200000 }
});

const highPriority = createMockAlert({
  id: "alert_003",
  severity: "severe",
  activePeriod: { start: Date.now() - 600000, end: Date.now() + 3600000 }
});

// Test priority sorting
const getAlertPriority = (alert: StationAlert) => {
  const severityScore = { info: 1, warning: 2, severe: 3 };
  return severityScore[alert.severity];
};

const alerts = [lowPriority, mediumPriority, highPriority];
alerts.sort((a, b) => getAlertPriority(b) - getAlertPriority(a));

expect(alerts[0]).toBe(highPriority);
expect(alerts[1]).toBe(mediumPriority);
expect(alerts[2]).toBe(lowPriority);
```

### Edge Cases and Gotchas

#### Gotcha 1: Override Merging for Nested Objects

The `overrides` parameter uses shallow merging, not deep merging. When overriding `activePeriod`, you must provide the complete object:

```typescript
// BAD: This tries to merge but fails
const alert = createMockAlert({
  activePeriod: { end: Date.now() + 14400000 } // Missing 'start'
  // activePeriod.start is undefined, not the default!
});

// GOOD: Provide the complete object
const alert = createMockAlert({
  activePeriod: {
    start: Date.now() - 3600000,    // Must include start
    end: Date.now() + 14400000      // Override end
  }
});
```

#### Gotcha 2: Timestamp Precision and Timezones

Alert timestamps use POSIX milliseconds (Unix timestamp × 1000). Ensure consistent timezone handling:

```typescript
// GOOD: Use Date.now() for consistent UTC timestamps
const alert = createMockAlert({
  activePeriod: {
    start: Date.now() - 3600000,  // 1 hour ago in UTC
    end: Date.now() + 7200000      // 2 hours from now in UTC
  }
});

// BAD: Don't mix timezone-specific dates
const alert = createMockAlert({
  activePeriod: {
    start: new Date("2024-08-30T10:00:00-04:00").getTime(),  // Eastern time
    end: new Date("2024-08-30T12:00:00-04:00").getTime()     // May not work in other timezones
  }
});

// GOOD: If you need specific times, use UTC ISO strings
const specificStart = new Date("2024-08-30T14:00:00Z").getTime();  // UTC
const alert = createMockAlert({
  activePeriod: { start: specificStart, end: specificStart + 7200000 }
});
```

#### Gotcha 3: Active Period Boundaries

Alerts can be active at `start` but not at `end` (the end is exclusive):

```typescript
const alert = createMockAlert({
  activePeriod: {
    start: 1693400000000,
    end: 1693403600000  // 1 hour later
  }
});

// At exactly start time, alert is active
const atStart = alert.activePeriod.start === 1693400000000;  
const isActiveAtStart = Date.now() === alert.activePeriod.start;  // true

// At exactly end time, alert is NOT active
const atEnd = Date.now() === alert.activePeriod.end;  
const isActiveAtEnd = false;  // end is exclusive

// Correct active check
const now = Date.now();
const isActive = now >= alert.activePeriod.start && 
                (!alert.activePeriod.end || now < alert.activePeriod.end);
```

#### Gotcha 4: Optional `end` in `activePeriod`

The `end` property is optional and represents an open-ended alert if not set:

```typescript
// Alert with no end time (open-ended)
const openEndedAlert = createMockAlert({
  activePeriod: {
    start: Date.now() - 3600000,
    end: undefined  // or just don't set 'end'
  }
});

// Always check for undefined end
const isActiveNow = (alert: StationAlert) => {
  const now = Date.now();
  if (!alert.activePeriod.end) {
    // No end time - active if started
    return now >= alert.activePeriod.start;
  }
  // Has end time - check both boundaries
  return now >= alert.activePeriod.start && now < alert.activePeriod.end;
};
```

#### Gotcha 5: Severity Display Priority

Severity affects UI display order and visual prominence. Test all three levels:

```typescript
const infoAlert = createMockAlert({ severity: "info" });
const warningAlert = createMockAlert({ severity: "warning" });
const severeAlert = createMockAlert({ severity: "severe" });

// Test severity-based display order
const sortBySeverity = (alerts: StationAlert[]) => {
  const severityOrder = { severe: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
};

const [first, second, third] = sortBySeverity([infoAlert, warningAlert, severeAlert]);
expect(first.severity).toBe("severe");
expect(second.severity).toBe("warning");
expect(third.severity).toBe("info");
```

#### Gotcha 6: `affectedLines` Array Replacement

When overriding `affectedLines`, you provide the complete array (not merged with defaults):

```typescript
// BAD: This adds to the default ["1"]
const alert = createMockAlert({
  affectedLines: ["2", "3"]  // Replaces ["1"], doesn't merge
});
// alert.affectedLines is ["2", "3"], NOT ["1", "2", "3"]

// GOOD: Explicitly provide all affected lines
const alert = createMockAlert({
  affectedLines: ["1", "2", "3", "A", "C", "E"]  // All lines you want
});

// GOOD: For multi-line alerts, use array spread
const baseLines = ["1", "2", "3"];
const alert = createMockAlert({
  affectedLines: [...baseLines, "A", "C"]  // Combine lines
});
```

#### Gotcha 7: `cause` and `effect` Are Free-Form Strings

The `cause` and `effect` fields come from GTFS-RT but are stored as strings, not enums. Use standard GTFS values for consistency:

```typescript
// Standard GTFS-RT cause codes (examples)
const CAUSES = [
  "UNKNOWN_CAUSE",
  "OTHER_CAUSE",
  "TECHNICAL_PROBLEM",
  "STRIKE",
  "DEMONSTRATION",
  "ACCIDENT",
  "HOLIDAY",
  "WEATHER",
  "MAINTENANCE",
  "CONSTRUCTION",
  "POLICE_ACTIVITY",
  "MEDICAL_EMERGENCY"
];

// Standard GTFS-RT effect codes (examples)
const EFFECTS = [
  "NO_SERVICE",
  "REDUCED_SERVICE",
  "SIGNIFICANT_DELAYS",
  "DETOUR",
  "ADDITIONAL_SERVICE",
  "MODIFIED_SERVICE",
  "OTHER_EFFECT",
  "UNKNOWN_EFFECT"
];

// GOOD: Use standard codes
const alert = createMockAlert({
  cause: "SIGNAL_PROBLEM",  // Standard cause
  effect: "DELAY"           // Standard effect
});

// AVOID: Custom codes unless documenting them clearly
const alert = createMockAlert({
  cause: "SIGNAL_PROBLEM",  // OK
  effect: "REALLY_BAD_DELAY"  // Non-standard - avoid
});
```

#### Gotcha 8: `source` and `isRaw` Are Not Set by Default

The mock does not include `source` or `isRaw` fields unless you explicitly provide them:

```typescript
const defaultAlert = createMockAlert();
console.log(defaultAlert.source);    // undefined
console.log(defaultAlert.isRaw);     // undefined

// GOOD: Explicitly set if needed
const officialAlert = createMockAlert({
  source: "official"
});

const rawAlert = createMockAlert({
  isRaw: true,
  source: "official"
});

// Test for undefined when filtering
const officialAlerts = alerts.filter(alert => alert.source === "official");
const rawAlerts = alerts.filter(alert => alert.isRaw === true);

// GOOD: Use optional chaining
const isOfficial = alert.source === "official";      // false if undefined
const isRaw = alert.isRaw === true;                   // false if undefined
```

#### Gotcha 9: `shuttleInfo` Requires Complete Object Structure

When adding shuttle bus information, provide the complete `ShuttleBusInfo` structure:

```typescript
// BAD: Partial shuttle info
const alert = createMockAlert({
  shuttleInfo: {
    lineId: "1",
    fromStopId: "101",
    toStopId: "725"
    // Missing: stops, frequencyMinutes, lastVerified
  }
});

// GOOD: Complete shuttle info structure
const alert = createMockAlert({
  shuttleInfo: {
    lineId: "1",
    fromStopId: "101",
    toStopId: "725",
    stops: [
      { nearStationId: "101", description: "South Ferry" },
      { nearStationId: "725", description: "Times Square", lat: 40.7589, lon: -73.9851 }
    ],
    frequencyMinutes: "8-12",
    lastVerified: new Date().toISOString().split("T")[0]  // Today's date
  }
});
```

#### Gotcha 10: Alert ID Uniqueness

Alert IDs should be unique for proper tracking and deduplication:

```typescript
// GOOD: Use unique IDs for each alert
const alert1 = createMockAlert({ id: "alert_delay_1" });
const alert2 = createMockAlert({ id: "alert_suspension_2" });
const alert3 = createMockAlert({ id: "alert_work_3" });

// GOOD: Generate IDs programmatically for tests
let alertCounter = 0;
const createUniqueAlert = () => {
  alertCounter++;
  return createMockAlert({
    id: `alert_test_${alertCounter}_${Date.now()}`
  });
};

// Test deduplication
const alertMap = new Map(alerts.map(a => [a.id, a]));
expect(alertMap.size).toBe(alerts.length);  // All IDs unique
```

### See Also

- {@link createMockStation} - For testing alert-to-station relationships
- {@link createMockRoute} - For testing line-specific alert filtering
- {@link createMockArrival} - For testing alert impact on arrival predictions

---

#### `createMockFavorite`

Creates a mock favorite station object with default values.

**Type Signature:**
```typescript
function createMockFavorite(overrides?: Partial<Favorite>): Favorite
```

**Parameters:**
- `overrides` (optional): Partial object to override default values

**Returns:** `Favorite` object with:
- `id: string` - Favorite ID (default: `"fav_123"`)
- `stationId: string` - Station ID (default: `"725"`)
- `stationName: string` - Station name (default: `"Times Square-42 St"`)
- `lines: string[]` - Lines to track (default: `["1", "2", "3"]`)
- `direction: "N" | "S" | "both"` - Direction (default: `"both"`)
- `sortOrder: number` - Display order (default: `0`)
- `label: string` - User label (default: `"Work"`)

**Usage Example:**
```typescript
import { createMockFavorite } from "@mta-my-way/shared/testing";

const defaultFavorite = createMockFavorite();
const homeFavorite = createMockFavorite({
  id: "fav_home",
  stationId: "101",
  stationName: "South Ferry",
  lines: ["1"],
  direction: "both",
  label: "Home"
});

const northboundOnly = createMockFavorite({
  stationId: "725",
  stationName: "Times Square",
  lines: ["1", "2", "3"],
  direction: "N",
  label: "Morning Commute"
});

const sortedFavorites = [
  createMockFavorite({ id: "fav_1", sortOrder: 0 }),
  createMockFavorite({ id: "fav_2", sortOrder: 1 }),
  createMockFavorite({ id: "fav_3", sortOrder: 2 })
];
```

**Edge Cases:**
- `direction` is union type - TypeScript validates but runtime doesn't check
- `sortOrder` affects display sequence - test sorting logic with different values
- `lines` array filters arrivals - test single-line vs multi-line favorites
- Empty `lines` array should be handled - test no-lines scenario
- `label` is user-defined - test special characters and long labels

---

#### `createMockCommute`

Creates a mock commute object with origin, destination, and preferences.

**Type Signature:**
```typescript
function createMockCommute(overrides?: Partial<Commute>): Commute
```

**Parameters:**
- `overrides` (optional): Partial object to override default values

**Returns:** `Commute` object with:
- `id: string` - Commute ID (default: `"commute_123"`)
- `name: string` - Commute name (default: `"Work"`)
- `origin: Station` - Origin station (default: Times Square)
- `destination: Station` - Destination station (default: Penn Station)
- `preferredLines: string[]` - Preferred lines (default: `["1", "2", "3"]`)
- `enableTransferSuggestions: boolean` - Transfer suggestions enabled (default: `true`)

**Usage Example:**
```typescript
import { createMockCommute, createMockStation } from "@mta-my-way/shared/testing";

const defaultCommute = createMockCommute();
const customCommute = createMockCommute({
  id: "commute_home",
  name: "Home",
  origin: createMockStation({ id: "725", name: "Times Square" }),
  destination: createMockStation({ id: "101", name: "South Ferry" }),
  preferredLines: ["1"],
  enableTransferSuggestions: true
});

const noTransfers = createMockCommute({
  enableTransferSuggestions: false
});

// Test transfer suggestion logic
const commuteWithTransfers = createMockCommute({
  origin: createMockStation({
    id: "725",
    transfers: [
      { toStationId: "726", toLines: ["A", "C", "E"], walkingSeconds: 120 }
    ]
  })
});
```

**Edge Cases:**
- `origin` and `destination` are full station objects - use `createMockStation` for consistency
- `preferredLines` affects route ranking - test with empty array and multiple lines
- `enableTransferSuggestions` affects transfer display - test both true/false
- Transfer suggestions depend on station `transfers` data - include transfer data for realistic tests
- Origin and destination should be different - test same-station edge case

---

#### `createMockTripRecord`

Creates a mock historical trip record with timing information.

**Type Signature:**
```typescript
function createMockTripRecord(overrides?: Partial<TripRecord>): TripRecord
```

**Parameters:**
- `overrides` (optional): Partial object to override default values

**Returns:** `TripRecord` object with:
- `id: string` - Trip ID (default: `"trip_123"`)
- `date: string` - Trip date ISO string (default: today)
- `origin: Station` - Origin station (default: Times Square)
- `destination: Station` - Destination station (default: Penn Station)
- `line: string` - Subway line (default: `"1"`)
- `departureTime: number` - Departure timestamp (default: 1 hour ago)
- `arrivalTime: number` - Arrival timestamp (default: 30 minutes ago)
- `actualDurationMinutes: number` - Actual duration (default: `30`)
- `source: "manual" | "inferred" | "tracked"` - Data source (default: `"tracked"`)

**Usage Example:**
```typescript
import { createMockTripRecord, createMockStation } from "@mta-my-way/shared/testing";

const defaultTrip = createMockTripRecord();
const delayedTrip = createMockTripRecord({
  actualDurationMinutes: 75, // 45 minute delay
  departureTime: new Date("2024-01-15T08:30:00").getTime(),
  arrivalTime: new Date("2024-01-15T09:45:00").getTime()
});

const manualTrip = createMockTripRecord({
  source: "manual",
  line: "2",
  origin: createMockStation({ id: "101", name: "South Ferry" }),
  destination: createMockStation({ id: "725", name: "Times Square" })
});

// Test date filtering
const yesterdayTrip = createMockTripRecord({
  date: new Date(Date.now() - 86400000).toISOString().split("T")[0]
});
```

**Edge Cases:**
- `date` is ISO date string (no time) - use `.split("T")[0]` format
- `departureTime` < `arrivalTime` is expected - test invalid ordering
- `source` affects data reliability scoring - test each source type
- `actualDurationMinutes` should be positive - test zero/negative edge cases
- Timestamps use millisecond precision - ensure consistent timezone handling

---

#### `createMockPushSubscription`

Creates a mock web push subscription object for testing push notifications.

**Type Signature:**
```typescript
function createMockPushSubscription(overrides?: Partial<PushSubscription>): PushSubscription
```

**Parameters:**
- `overrides` (optional): Partial object to override default values

**Returns:** `PushSubscription` object with:
- `endpoint: string` - Push endpoint URL (default: FCM test endpoint)
- `keys: {p256dh: string, auth: string}` - VAPID keys (default: test values)
- `expirationTime: number | null` - Subscription expiration (default: `null`)

**Usage Example:**
```typescript
import { createMockPushSubscription } from "@mta-my-way/shared/testing";

const defaultSub = createMockPushSubscription();
const customSub = createMockPushSubscription({
  endpoint: "https://fcm.googleapis.com/fcm/send/custom_endpoint",
  keys: {
    p256dh: "custom_p256dh_key",
    auth: "custom_auth_key"
  }
});

const expiredSub = createMockPushSubscription({
  expirationTime: Date.now() - 3600000 // Expired 1 hour ago
});

const futureExpiring = createMockPushSubscription({
  expirationTime: Date.now() + 86400000 // Expires in 24 hours
});
```

**Edge Cases:**
- `expirationTime` can be `null` (no expiration) - test both null and timestamp
- Endpoint URL must be valid - test invalid URL handling
- VAPID keys are base64-encoded - use realistic encoding for validation tests
- Expired subscriptions should be cleaned up - test expiration logic
- Endpoint format depends on push service - FCM vs VAPID vs Web Push

---

### Test Fixtures

#### `createTestFixture`

Creates a complete test fixture set with related stations, routes, arrivals, alerts, favorites, and commutes.

**Type Signature:**
```typescript
function createTestFixture(): TestFixture
```

**Parameters:** None

**Returns:** `TestFixture` object with:
- `stations: {timesSquare, pennStation}` - Station objects
- `routes: {"1": route}` - Route objects keyed by line
- `arrivals: {timesSquareNorth, timesSquareSouth}` - Arrival arrays by location/direction
- `alerts: Alert[]` - Array of alerts
- `favorites: Favorite[]` - Array of favorites
- `commutes: Commute[]` - Array of commutes

**Usage Example:**
```typescript
import { createTestFixture } from "@mta-my-way/shared/testing";

const fixture = createTestFixture();

// Access related data
const timesSquare = fixture.stations.timesSquare;
const route1 = fixture.routes["1"];
const northboundArrivals = fixture.arrivals.timesSquareNorth;
const alerts = fixture.alerts;
const workCommute = fixture.commutes[0];

// Test with realistic relationships
expect(northboundArrivals[0].line).toBe("1");
expect(alerts[0].affectedLines).toContain("1");
expect(workCommute.origin.id).toBe(timesSquare.id);

// Use in component tests
const { stations, arrivals, alerts } = fixture;
render(<StationBoard station={stations.timesSquare} arrivals={arrivals.timesSquareNorth} alerts={alerts} />);
```

**Edge Cases:**
- All fixture data is internally consistent - arrivals reference fixture routes, alerts reference fixture lines
- Fixture is immutable by design - create new fixture for each test variation
- Relationships are hardcoded - ensure they match your test scenarios
- Fixture includes both directions - test northbound/southbound separately
- Single route (line 1) - override for multi-route tests

---

### Assertion Helpers

#### `assertHasProperties`

Asserts that an object has all required properties.

**Type Signature:**
```typescript
function assertHasProperties(obj: unknown, requiredProps: string[]): void
```

**Parameters:**
- `obj: unknown` - Object to test
- `requiredProps: string[]` - Array of required property names

**Returns:** `void` - Throws if assertion fails

**Usage Example:**
```typescript
import { assertHasProperties, createMockStation } from "@mta-my-way/shared/testing";

const station = createMockStation();
assertHasProperties(station, ["id", "name", "lat", "lon", "lines"]);
// Passes - station has all properties

assertHasProperties(station, ["id", "name", "invalidProp"]);
// Throws - station doesn't have "invalidProp"

// Test API responses
const response = await fetch("/api/stations/725");
const data = await response.json();
assertHasProperties(data, ["id", "name", "lines"]);

// Test nested objects don't count
assertHasProperties(station, ["origin.id"]);
// Throws - nested properties not supported
```

**Edge Cases:**
- Throws on `null` or `undefined` - check existence first
- Only checks top-level properties - nested properties not supported
- Empty `requiredProps` array always passes
- Property names are case-sensitive - check exact casing
- Works with any object type - useful for API response validation

---

#### `assertIsRecent`

Asserts that a timestamp is recent (within specified milliseconds).

**Type Signature:**
```typescript
function assertIsRecent(timestamp: number, maxAgeMs?: number): void
```

**Parameters:**
- `timestamp: number` - Timestamp to test (milliseconds)
- `maxAgeMs` (optional): Maximum allowed age in milliseconds (default: `60000` = 1 minute)

**Returns:** `void` - Throws if assertion fails

**Usage Example:**
```typescript
import { assertIsRecent } from "@mta-my-way/shared/testing";

assertIsRecent(Date.now()); // Passes - 0ms old
assertIsRecent(Date.now() - 30000); // Passes - 30 seconds old
assertIsRecent(Date.now() - 30000, 60000); // Passes - within 60 second window

assertIsRecent(Date.now() - 120000); // Throws - 2 minutes old (> 1 minute default)
assertIsRecent(Date.now() - 120000, 180000); // Passes - within 3 minute custom window

// Test API response freshness
const response = await fetch("/api/arrivals?stationId=725");
const data = await response.json();
assertIsRecent(data.timestamp, 30000); // Data must be < 30 seconds old

// Test future timestamps
assertIsRecent(Date.now() + 5000); // Throws - future timestamps not "recent"
```

**Edge Cases:**
- Future timestamps always throw - "recent" means past only
- Default max age is 60 seconds - customize per use case
- Uses millisecond precision - ensure timestamps are in milliseconds
- Useful for data freshness checks - combine with cache invalidation tests
- Age calculation: `Date.now() - timestamp` - must be non-negative

---

#### `assertApiResponse`

Asserts that an API response has correct status and data shape.

**Type Signature:**
```typescript
function assertApiResponse(
  response: unknown,
  expectedStatus: number,
  expectedDataShape?: Record<string, unknown>
): void
```

**Parameters:**
- `response: unknown` - Response object to test
- `expectedStatus: number` - Expected HTTP status code
- `expectedDataShape` (optional): Expected data structure (partial match)

**Returns:** `void` - Throws if assertion fails

**Usage Example:**
```typescript
import { assertApiResponse } from "@mta-my-way/shared/testing";

const response = await fetch("/api/stations/725");
const data = await response.json();

assertApiResponse(
  { status: response.status, data },
  200,
  { id: "725", name: expect.any(String) }
);

// Test error response
const errorResponse = await fetch("/api/stations/invalid");
assertApiResponse(
  { status: errorResponse.status, data: await errorResponse.json() },
  404,
  { error: expect.any(String) }
);

// Without data shape check
assertApiResponse({ status: 200, data: {} }, 200); // Only checks status

// Test nested structure
assertApiResponse(
  { status: 200, data: { station: { id: "725", name: "Times Square" } } },
  200,
  { station: { id: "725" } } // Partial match on nested object
);
```

**Edge Cases:**
- `expectedDataShape` uses Jest's `toMatchObject` - partial match, not exact
- `undefined` data shape skips data check - only validates status
- Response object must have `status` and `data` properties
- Works with any response structure - adapt to your API format
- Useful for contract testing - verify API response shape matches expectations

---

#### `assertIsSorted`

Asserts that an array is sorted by a specific key in ascending or descending order.

**Type Signature:**
```typescript
function assertIsSorted<T>(array: T[], key: keyof T, order?: "asc" | "desc"): void
```

**Parameters:**
- `array: T[]` - Array to test
- `key: keyof T` - Property key to sort by
- `order` (optional): Sort order (default: `"asc"`)

**Returns:** `void` - Throws if assertion fails

**Usage Example:**
```typescript
import { assertIsSorted } from "@mta-my-way/shared/testing";

const arrivals = [
  { minutesAway: 2, line: "1" },
  { minutesAway: 5, line: "1" },
  { minutesAway: 8, line: "1" }
];

assertIsSorted(arrivals, "minutesAway"); // Passes - ascending
assertIsSorted(arrivals, "minutesAway", "asc"); // Same as default

const reverseArrivals = [...arrivals].reverse();
assertIsSorted(reverseArrivals, "minutesAway", "desc"); // Passes - descending

assertIsSorted(arrivals, "line"); // Throws - not sorted by line

// Test timestamps
const trips = [
  { departureTime: Date.now() - 7200000 },
  { departureTime: Date.now() - 3600000 },
  { departureTime: Date.now() }
];
assertIsSorted(trips, "departureTime"); // Passes - oldest to newest

// Test string sorting
const stations = [
  { name: "A" },
  { name: "B" },
  { name: "C" }
];
assertIsSorted(stations, "name"); // Passes - alphabetical
```

**Edge Cases:**
- Empty array always passes - nothing to sort
- Single-element array always passes - trivially sorted
- Uses `<=` comparison - allows equal values (stable sort)
- Order parameter defaults to `"asc"` - specify `"desc"` for reverse
- Key must exist on all array elements - throws if property missing
- Works with numbers, strings, dates - comparable types only

---

### Mock Helpers

#### `createMockLogger`

Creates a mock logger with Vitest spy functions for all log levels.

**Type Signature:**
```typescript
function createMockLogger(): {
  debug: ReturnType<typeof vi.fn>,
  info: ReturnType<typeof vi.fn>,
  warn: ReturnType<typeof vi.fn>,
  error: ReturnType<typeof vi.fn>,
  child: ReturnType<typeof vi.fn>
}
```

**Parameters:** None

**Returns:** Mock logger object with:
- `debug: vi.fn` - Debug level spy
- `info: vi.fn` - Info level spy
- `warn: vi.fn` - Warning level spy
- `error: vi.fn` - Error level spy
- `child: vi.fn` - Child logger creator (returns new mock logger)

**Usage Example:**
```typescript
import { createMockLogger } from "@mta-my-way/shared/testing";

const logger = createMockLogger();

logger.info("Station loaded", { stationId: "725" });
logger.warn("Stale feed data", { age: 120 });
logger.error("API request failed", { error: "timeout" });

// Assert log calls
expect(logger.info).toHaveBeenCalledWith("Station loaded", { stationId: "725" });
expect(logger.info).toHaveBeenCalledTimes(1);
expect(logger.error).toHaveBeenCalled();

// Test child logger
const childLogger = logger.child({ requestId: "req_123" });
childLogger.debug("Processing request");
expect(logger.child).toHaveBeenCalledWith({ requestId: "req_123" });

// Check all calls
expect(logger.debug.mock.calls.length).toBeGreaterThan(0);
```

**Edge Cases:**
- All methods are Vitest spies - use `.mock.calls` to inspect history
- `child()` returns a new logger instance - not the same object
- No actual output - spies don't log to console
- Reset between tests with `mockClear()` or `mockReset()`
- Useful for testing log behavior without side effects

---

#### `createMockDatabase`

Creates a mock database connection with prepared statement support.

**Type Signature:**
```typescript
function createMockDatabase(): {
  prepare: ReturnType<typeof vi.fn>,
  exec: ReturnType<typeof vi.fn>,
  transaction: ReturnType<typeof vi.fn>,
  pragma: ReturnType<typeof vi.fn>,
  close: ReturnType<typeof vi.fn>,
  _setData: (table: string, data: unknown[]) => void,
  _getData: (table: string) => unknown[]
}
```

**Parameters:** None

**Returns:** Mock database object with:
- `prepare: vi.fn` - Returns object with `all`, `get`, `run` methods
- `exec: vi.fn` - Execute SQL statement spy
- `transaction: vi.fn` - Transaction executor (runs function immediately)
- `pragma: vi.fn` - Pragma statement spy (returns empty array)
- `close: vi.fn` - Database close spy
- `_setData: (table, data) => void` - Helper to set mock data
- `_getData: (table) => unknown[]` - Helper to get mock data

**Usage Example:**
```typescript
import { createMockDatabase } from "@mta-my-way/shared/testing";

const db = createMockDatabase();

// Set up mock data
db._setData("stations", [
  { id: "725", name: "Times Square" },
  { id: "101", name: "South Ferry" }
]);

// Use in code under test
const stmt = db.prepare("SELECT * FROM stations WHERE id = ?");
const station = stmt.get("725");

// Mock prepared statement behavior
db.prepare.mockReturnValue({
  all: vi.fn(() => db._getData("stations")),
  get: vi.fn((id) => db._getData("stations").find(s => s.id === id)),
  run: vi.fn(() => ({ lastInsertRowid: 1, changes: 1 }))
});

// Test query
const allStations = db.prepare("SELECT * FROM stations").all();
expect(allStations).toHaveLength(2);

// Test transactions
db.transaction(() => {
  db.exec("INSERT INTO stations VALUES (...)");
});
expect(db.exec).toHaveBeenCalled();

// Test cleanup
db.close();
expect(db.close).toHaveBeenCalled();
```

**Edge Cases:**
- `prepare` returns new mock object each time - configure return value before use
- `transaction` runs function synchronously - not a real transaction
- `_setData`/`_getData` are test helpers - not available in production
- No actual SQL execution - all methods are spies
- Useful for testing database logic without SQLite dependency
- Remember to configure `prepare` return value for realistic behavior

---

#### `createMockResponse`

Creates a mock HTTP response object with status, JSON methods, and headers.

**Type Signature:**
```typescript
function createMockResponse(data: unknown, status?: number): {
  ok: boolean,
  status: number,
  json: () => Promise<unknown>,
  text: () => Promise<string>,
  headers: Headers
}
```

**Parameters:**
- `data: unknown` - Response body data
- `status` (optional): HTTP status code (default: `200`)

**Returns:** Mock response object with:
- `ok: boolean` - Success flag (`true` if status 200-299)
- `status: number` - HTTP status code
- `json: () => Promise` - Async function returning data
- `text: () => Promise<string>` - Async function returning JSON string
- `headers: Headers` - Headers object with `content-type: application/json`

**Usage Example:**
```typescript
import { createMockResponse } from "@mta-my-way/shared/testing";

const successResponse = createMockResponse({ id: "725", name: "Times Square" }, 200);
expect(successResponse.ok).toBe(true);
expect(successResponse.status).toBe(200);
const data = await successResponse.json();
expect(data).toEqual({ id: "725", name: "Times Square" });

const errorResponse = createMockResponse({ error: "Not found" }, 404);
expect(errorResponse.ok).toBe(false);
expect(errorResponse.status).toBe(404);

const text = await errorResponse.text();
expect(JSON.parse(text)).toEqual({ error: "Not found" });

// Use with mock fetch
vi.mock("global", () => ({
  fetch: vi.fn(() => createMockResponse({ result: "success" }))
}));

const result = await fetch("/api/test");
expect(result.ok).toBe(true);
```

**Edge Cases:**
- `json()` returns the original data object - same reference, not cloned
- `text()` always returns `JSON.stringify(data)` - even for non-objects
- `ok` is calculated from status - not a settable property
- Headers always include `content-type: application/json` - override for other content types
- Status codes outside 200-299 make `ok: false` - test error handling
- Useful for mocking `fetch` without network calls

---

#### `createMockFetch`

Creates a mock fetch function that returns predefined responses based on URL matching.

**Type Signature:**
```typescript
function createMockFetch(
  responses: Array<{ url: string, response: ReturnType<typeof createMockResponse> }>
): ReturnType<typeof vi.fn>
```

**Parameters:**
- `responses: Array<{url, response}>` - Array of URL-response mappings

**Returns:** Vitest spy function that:
- Takes `url: string` parameter
- Returns matching response or 404 if no match
- Tracks all calls in `.mock.calls`

**Usage Example:**
```typescript
import { createMockFetch, createMockResponse } from "@mta-my-way/shared/testing";

const mockFetch = createMockFetch([
  {
    url: "/api/stations/725",
    response: createMockResponse({ id: "725", name: "Times Square" })
  },
  {
    url: "/api/arrivals",
    response: createMockResponse([{ line: "1", minutesAway: 2 }])
  }
]);

// Use in test
const stationResponse = await mockFetch("/api/stations/725");
const station = await stationResponse.json();
expect(station).toEqual({ id: "725", name: "Times Square" });

const arrivalsResponse = await mockFetch("/api/arrivals");
const arrivals = await arrivalsResponse.json();
expect(arrivals).toHaveLength(1);

// Unmatched URL returns 404
const notFound = await mockFetch("/api/unknown");
expect(notFound.status).toBe(404);

// Check call history
expect(mockFetch).toHaveBeenCalledWith("/api/stations/725");
expect(mockFetch).toHaveBeenCalledTimes(3);
```

**Edge Cases:**
- URL matching includes substring checks - `/api/stations` matches both `/api/stations/725` and `/api/stations/101`
- First matching response wins - order matters in responses array
- Unmatched URLs return 404 - test missing endpoint handling
- Responses are reused - same response object for each matching URL
- Partial URL matching - can match on path prefix or exact URL
- Useful for testing API clients without network calls

---

### Test Setup Helpers

#### `setupTestEnvironment`

Sets up common test environment mocks (console, performance API, requestIdleCallback).

**Type Signature:**
```typescript
function setupTestEnvironment(): void
```

**Parameters:** None

**Returns:** `void`

**Side Effects:**
- Spies on `console.debug` and `console.log` (suppresses output)
- Stubs `performance` global with `now`, `mark`, `measure`, `getEntriesByName`
- Stubs `requestIdleCallback` and `cancelIdleCallback` if not available

**Usage Example:**
```typescript
import { setupTestEnvironment, cleanupTestEnvironment } from "@mta-my-way/shared/testing";

beforeEach(() => {
  setupTestEnvironment();
});

afterEach(() => {
  cleanupTestEnvironment();
});

test("performance.now() works", () => {
  const start = performance.now();
  // ... test code ...
  const duration = performance.now() - start;
  expect(duration).toBeGreaterThanOrEqual(0);
});

test("console is silenced", () => {
  console.debug("This won't print");
  console.log("This won't print either");
  expect(console.debug).toHaveBeenCalled();
});

test("requestIdleCallback works", () => {
  requestIdleCallback(() => {
    // Callback executed immediately
  });
});
```

**Edge Cases:**
- Must call `cleanupTestEnvironment()` after tests - prevents test pollution
- `performance.now()` returns `Date.now()` value - not high-resolution
- Console methods are spies, not removed - can check if called
- `requestIdleCallback` runs immediately (via `setTimeout`) - not actually idle
- Global mocks affect entire test suite - clean up after each test
- Some environments already have `requestIdleCallback` - stub only if missing

---

#### `cleanupTestEnvironment`

Restores all mocked globals and clears spies set up by `setupTestEnvironment`.

**Type Signature:**
```typescript
function cleanupTestEnvironment(): void
```

**Parameters:** None

**Returns:** `void`

**Side Effects:**
- Restores all Vitest mocks via `vi.restoreAllMocks()`
- Unstubs all globals via `vi.unstubAllGlobals()`

**Usage Example:**
```typescript
import { setupTestEnvironment, cleanupTestEnvironment } from "@mta-my-way/shared/testing";

beforeEach(() => {
  setupTestEnvironment();
});

afterEach(() => {
  cleanupTestEnvironment();
});

test("test with mocked environment", () => {
  // Test code using mocked globals
});

test("real environment after cleanup", () => {
  // After cleanup, globals are restored
  expect(performance.now()).not.toBe(Date.now());
});
```

**Edge Cases:**
- Always call in `afterEach` - prevents cross-test pollution
- Safe to call multiple times - second call is no-op
- Restores all mocks, not just test environment - avoid if other mocks active
- Does NOT clear `beforeEach`/`afterEach` hooks - only restores globals
- Call even if test fails - use `afterEach` not `afterAll`

---

#### `createTestContext`

Creates a complete test context with logger, database, fetch, fixture, and cleanup function.

**Type Signature:**
```typescript
function createTestContext(): {
  mockLogger: ReturnType<typeof createMockLogger>,
  mockDb: ReturnType<typeof createMockDatabase>,
  mockFetch: ReturnType<typeof createMockFetch>,
  fixture: ReturnType<typeof createTestFixture>,
  cleanup: () => void
}
```

**Parameters:** None

**Returns:** Test context object with:
- `mockLogger: MockLogger` - Mock logger from `createMockLogger`
- `mockDb: MockDatabase` - Mock database from `createMockDatabase`
- `mockFetch: MockFetch` - Mock fetch from `createMockFetch([])`
- `fixture: TestFixture` - Test fixture from `createTestFixture`
- `cleanup: () => void` - Cleanup function from `cleanupTestEnvironment`

**Usage Example:**
```typescript
import { createTestContext } from "@mta-my-way/shared/testing";

let ctx: ReturnType<typeof createTestContext>;

beforeEach(() => {
  ctx = createTestContext();
});

afterEach(() => {
  ctx.cleanup();
});

test("test with full context", async () => {
  const { mockLogger, mockDb, mockFetch, fixture } = ctx;

  // Set up database data
  mockDb._setData("stations", [fixture.stations.timesSquare]);

  // Use in code under test
  const logger = mockLogger;
  const db = mockDb;
  const fetch = mockFetch;

  logger.info("Loading station");
  const station = db.prepare("SELECT * FROM stations").get();

  expect(logger.info).toHaveBeenCalled();
  expect(station).toEqual(fixture.stations.timesSquare);
});
```

**Edge Cases:**
- Automatically calls `setupTestEnvironment()` - no need to call separately
- `cleanup()` must be called in `afterEach` - prevents test pollution
- `mockFetch` starts with empty responses - add responses before use
- All mocks are fresh - create new context for each test
- `fixture` is immutable - don't modify, create new fixture if needed
- One-stop shop for test setup - reduces boilerplate in test files

---

### Time Utilities

#### `mockCurrentTime`

Mocks `Date.now()` and `Date.parse()` to return consistent timestamps.

**Type Signature:**
```typescript
function mockCurrentTime(timestamp: number): void
```

**Parameters:**
- `timestamp: number` - Fixed timestamp to return (milliseconds)

**Returns:** `void`

**Side Effects:**
- Spies on `Date.now` to return `timestamp`
- Spies on `Date.parse` to return `timestamp` (simplified mock)

**Usage Example:**
```typescript
import { mockCurrentTime } from "@mta-my-way/shared/testing";

beforeEach(() => {
  const fixedTime = new Date("2024-01-15T08:30:00").getTime();
  mockCurrentTime(fixedTime);
});

test("time-dependent logic", () => {
  const now = Date.now();
  expect(now).toBe(new Date("2024-01-15T08:30:00").getTime());

  // Test expiration logic
  const token = { expiresAt: now + 3600000 };
  const isExpired = Date.now() > token.expiresAt;
  expect(isExpired).toBe(false);
});

test("Date parsing", () => {
  const parsed = Date.parse("2024-01-15");
  expect(parsed).toBe(new Date("2024-01-15T08:30:00").getTime());
});
```

**Edge Cases:**
- Affects all date operations in test - use in isolated tests
- `Date.parse` mock is simplified - doesn't actually parse dates
- Must restore after test - use `vi.restoreAllMocks()` or `cleanupTestEnvironment()`
- Timestamps in milliseconds - ensure correct units
- Useful for testing expiration, time windows, scheduled events
- Does NOT mock `new Date()` constructor - only `Date.now()` and `Date.parse()`

---

#### `createMockDateString`

Creates a mock ISO date string from a Date object.

**Type Signature:**
```typescript
function createMockDateString(date?: Date): string
```

**Parameters:**
- `date` (optional): Date object (default: `new Date()`)

**Returns:** `string` - ISO 8601 date string

**Usage Example:**
```typescript
import { createMockDateString } from "@mta-my-way/shared/testing";

const today = createMockDateString(); // Current date in ISO format
const specificDate = createMockDateString(new Date("2024-01-15"));

// Use in test data
const trip = {
  date: createMockDateString(new Date("2024-01-15")),
  origin: "Times Square",
  destination: "Penn Station"
};

// Test date parsing
const parsed = new Date(specificDate);
expect(parsed.getFullYear()).toBe(2024);
expect(parsed.getMonth()).toBe(0); // January
expect(parsed.getDate()).toBe(15);
```

**Edge Cases:**
- Returns full ISO string with time - `YYYY-MM-DDTHH:mm:ss.sssZ`
- Default is current time - use fixed date for predictable tests
- Timezone is always UTC - `Date.parse()` handles conversion
- Useful for database records, API responses, test data
- Combines well with `mockCurrentTime` for consistent time testing

---

### Performance Testing Utilities

#### `measureExecutionTime`

Measures execution time of a synchronous or async function.

**Type Signature:**
```typescript
async function measureExecutionTime<T>(
  fn: () => T | Promise<T>
): Promise<{ result: T, durationMs: number }>
```

**Parameters:**
- `fn: () => T | Promise<T>` - Function to measure (sync or async)

**Returns:** `Promise<{result: T, durationMs: number}>` - Function result and duration in milliseconds

**Usage Example:**
```typescript
import { measureExecutionTime } from "@mta-my-way/shared/testing";

// Measure sync function
const { result: sum, durationMs: sumTime } = await measureExecutionTime(() => {
  return [1, 2, 3, 4, 5].reduce((a, b) => a + b, 0);
});
expect(sum).toBe(15);
expect(sumTime).toBeGreaterThanOrEqual(0);

// Measure async function
const { result: data, durationMs: fetchTime } = await measureExecutionTime(async () => {
  return await fetch("/api/stations").then(r => r.json());
});
expect(fetchTime).toBeLessThan(1000); // Should complete in < 1 second

// Test performance requirements
const { durationMs: queryTime } = await measureExecutionTime(() => {
  return db.prepare("SELECT * FROM stations WHERE id = ?").get("725");
});
expect(queryTime).toBeLessThan(10); // Query should be fast
```

**Edge Cases:**
- Uses `performance.now()` for timing - requires test environment setup
- Returns actual function result - can chain with assertions
- Duration includes async wait time - measures wall-clock time
- Sub-millisecond precision possible - check for very small durations
- Useful for performance regression tests - track execution time over time
- Exception in function propagates - duration still measured before throw

---

#### `assertCompletesWithin`

Asserts that a function completes within a specified time limit.

**Type Signature:**
```typescript
async function assertCompletesWithin<T>(
  fn: () => T | Promise<T>,
  maxMs: number
): Promise<T>
```

**Parameters:**
- `fn: () => T | Promise<T>` - Function to test (sync or async)
- `maxMs: number` - Maximum allowed duration in milliseconds

**Returns:** `Promise<T>` - Function result (throws if exceeds time limit)

**Usage Example:**
```typescript
import { assertCompletesWithin } from "@mta-my-way/shared/testing";

// Test fast operation
const result = await assertCompletesWithin(() => {
  return [1, 2, 3].reduce((a, b) => a + b, 0);
}, 10);
expect(result).toBe(6);

// Test async operation
const data = await assertCompletesWithin(async () => {
  return await fetch("/api/stations/725").then(r => r.json());
}, 1000);

// Test performance requirement
await assertCompletesWithin(() => {
  const db = createTripTrackingDatabase();
  db.prepare("INSERT INTO trips (...) VALUES (...)").run(...);
}, 50); // Should complete in < 50ms

// Test timeout violation
await expect(
  assertCompletesWithin(() => new Promise(resolve => setTimeout(resolve, 100)), 50)
).rejects.toThrow();
```

**Edge Cases:**
- Throws on timeout - assertion fails if duration > `maxMs`
- Returns function result on success - can chain with assertions
- Uses wall-clock time - affected by system load
- Small `maxMs` values may be flaky - allow margin for CI environments
- Useful for SLA compliance testing - verify performance requirements
- Function still completes after timeout - doesn't cancel execution

---

### HTTP Testing Utilities

#### `createMockHeaders`

Creates mock HTTP headers with default values.

**Type Signature:**
```typescript
function createMockHeaders(overrides?: Record<string, string>): Headers
```

**Parameters:**
- `overrides` (optional): Object with header key-value pairs to override defaults

**Returns:** `Headers` object with:
- `content-type: application/json` (default)
- `user-agent: test-agent` (default)
- Any overrides provided

**Usage Example:**
```typescript
import { createMockHeaders } from "@mta-my-way/shared/testing";

const defaultHeaders = createMockHeaders();
expect(defaultHeaders.get("content-type")).toBe("application/json");
expect(defaultHeaders.get("user-agent")).toBe("test-agent");

const customHeaders = createMockHeaders({
  "authorization": "Bearer key_123:abc",
  "x-csrf-token": "csrf_token_123",
  "accept": "application/json"
});

expect(customHeaders.get("authorization")).toBe("Bearer key_123:abc");
expect(customHeaders.get("content-type")).toBe("application/json"); // Still has default

// Use in request mock
const request = {
  method: "POST",
  headers: createMockHeaders({ "x-csrf-token": "token_123" })
};
```

**Edge Cases:**
- Header names are case-insensitive - `Content-Type` = `content-type`
- Override completely replaces header - doesn't merge with default
- Defaults always present unless overridden - `content-type` and `user-agent`
- Returns real `Headers` object - supports all Headers methods
- Useful for request/response mocking - consistent header structure

---

#### `createMockRequest`

Creates a mock HTTP request object with method, URL, headers, and body.

**Type Signature:**
```typescript
function createMockRequest(overrides?: {
  method?: string,
  url?: string,
  headers?: Headers,
  body?: unknown
}): {
  method: string,
  url: string,
  headers: Headers,
  body: unknown,
  json: () => Promise<unknown>,
  text: () => Promise<string>
}
```

**Parameters:**
- `overrides` (optional): Object with request properties to override defaults

**Returns:** Mock request object with:
- `method: string` - HTTP method (default: `"GET"`)
- `url: string` - Request URL (default: `"http://localhost:3001/api/test"`)
- `headers: Headers` - Request headers (default: from `createMockHeaders()`)
- `body: unknown` - Request body (default: `null`)
- `json: () => Promise<unknown>` - Async function returning body
- `text: () => Promise<string>` - Async function returning JSON string

**Usage Example:**
```typescript
import { createMockRequest } from "@mta-my-way/shared/testing";

const defaultRequest = createMockRequest();
expect(defaultRequest.method).toBe("GET");
expect(defaultRequest.url).toBe("http://localhost:3001/api/test");

const postRequest = createMockRequest({
  method: "POST",
  url: "/api/trips",
  headers: new Headers({ "content-type": "application/json" }),
  body: { originId: "101", destinationId: "725" }
});

expect(postRequest.method).toBe("POST");
const body = await postRequest.json();
expect(body).toEqual({ originId: "101", destinationId: "725" });

// Use in middleware testing
const authRequest = createMockRequest({
  method: "GET",
  url: "/api/arrivals?stationId=725",
  headers: new Headers({ "authorization": "Bearer key_123:abc" })
});

// Test request processing
function processRequest(req) {
  expect(req.method).toBe("POST");
  expect(req.url).toContain("/api/trips");
  expect(req.headers.get("content-type")).toBe("application/json");
}
processRequest(postRequest);
```

**Edge Cases:**
- `json()` returns the body object directly - no parsing
- `text()` always returns `JSON.stringify(body)` - even for non-objects
- `body` can be any type - object, string, number, null
- Headers can be overridden - pass custom `Headers` object
- Useful for middleware testing - test request parsing and validation
- URL can be relative or absolute - depends on your implementation

---

### Async Testing Utilities

#### `waitFor`

Waits for a condition to become true, polling at intervals.

**Type Signature:**
```typescript
async function waitFor(
  condition: () => boolean,
  timeout?: number,
  interval?: number
): Promise<void>
```

**Parameters:**
- `condition: () => boolean` - Function that returns `true` when condition met
- `timeout` (optional): Maximum wait time in milliseconds (default: `5000`)
- `interval` (optional): Polling interval in milliseconds (default: `50`)

**Returns:** `Promise<void>` - Resolves when condition is `true`, throws on timeout

**Usage Example:**
```typescript
import { waitFor } from "@mta-my-way/shared/testing";

let ready = false;
setTimeout(() => { ready = true; }, 200);

await waitFor(() => ready, 1000, 50);
// Resolves after ~200ms

// Test async state changes
let count = 0;
const incrementer = setInterval(() => count++, 100);

await waitFor(() => count >= 3, 1000);
clearInterval(incrementer);
expect(count).toBeGreaterThanOrEqual(3);

// Test timeout
await expect(
  waitFor(() => false, 500)
).rejects.toThrow("Condition not met within 500ms");

// Test DOM updates
document.body.innerHTML = "<div>Loading...</div>";
setTimeout(() => {
  document.body.innerHTML = "<div>Ready</div>";
}, 300);

await waitFor(() => document.body.innerHTML.includes("Ready"));
expect(document.body.innerHTML).toContain("Ready");
```

**Edge Cases:**
- Throws on timeout - includes timeout duration in error message
- Condition function called repeatedly - keep it fast (no side effects)
- Default timeout is 5 seconds - customize for slower operations
- Default interval is 50ms - balance between responsiveness and CPU usage
- Useful for async state changes, DOM updates, event handling
- Returns immediately if condition already true - no waiting

---

#### `flushPromises`

Flushes all pending promises by waiting for one microtask cycle.

**Type Signature:**
```typescript
async function flushPromises(): Promise<void>
```

**Parameters:** None

**Returns:** `Promise<void>` - Resolves after one `setTimeout(..., 0)` cycle

**Usage Example:**
```typescript
import { flushPromises } from "@mta-my-way/shared/testing";

let resolved = false;
Promise.resolve().then(() => {
  resolved = true;
});

// Promise not resolved yet
expect(resolved).toBe(false);

await flushPromises();

// Now resolved
expect(resolved).toBe(true);

// Test async state updates
let state = { count: 0 };
Promise.resolve().then(() => {
  state.count++;
}).then(() => {
  state.count++;
});

await flushPromises();
expect(state.count).toBe(2);

// Use in component tests
render(<MyComponent />);
await flushPromises();
expect(screen.getByText("Loaded")).toBeInTheDocument();
```

**Edge Cases:**
- Only flushes one microtask cycle - chain promises may need multiple calls
- Uses `setTimeout(..., 0)` - not truly immediate
- Useful for testing async operations without explicit await
- Combine with `waitFor` for complex async scenarios
- Multiple calls safe - idempotent operation
- Does NOT flush queued timers - only promises

---

#### `waitForAll`

Waits for multiple async operations to complete in parallel.

**Type Signature:**
```typescript
async function waitForAll<T>(
  operations: Array<() => Promise<T>>
): Promise<T[]>
```

**Parameters:**
- `operations: Array<() => Promise<T>>` - Array of async functions to execute

**Returns:** `Promise<T[]>` - Array of results from all operations (in order)

**Usage Example:**
```typescript
import { waitForAll } from "@mta-my-way/shared/testing";

const results = await waitForAll([
  async () => {
    const response = await fetch("/api/stations/725");
    return response.json();
  },
  async () => {
    const response = await fetch("/api/arrivals?stationId=725");
    return response.json();
  },
  async () => {
    return new Promise(resolve => setTimeout(() => resolve("done"), 100));
  }
]);

expect(results).toHaveLength(3);
expect(results[0]).toHaveProperty("id", "725");
expect(results[1]).toBeInstanceOf(Array);
expect(results[2]).toBe("done");

// Test concurrent operations
const fetchStations = async () => fetch("/api/stations").then(r => r.json());
const fetchArrivals = async () => fetch("/api/arrivals").then(r => r.json());

const [stations, arrivals] = await waitForAll([fetchStations, fetchArrivals]);
expect(stations).toBeDefined();
expect(arrivals).toBeDefined();

// Test error handling - one failure rejects all
await expect(
  waitForAll([
    async () => fetch("/api/valid").then(r => r.json()),
    async () => fetch("/api/invalid").then(r => r.json()) // 404
  ])
).rejects.toThrow();
```

**Edge Cases:**
- Executes operations in parallel - faster than sequential awaits
- Results returned in input order - not completion order
- One failure rejects entire promise - all or nothing
- Empty array returns empty array - no operations
- Useful for batching independent requests - reduce total latency
- All operations run concurrently - don't use for dependent operations

---

## Integration Test Helpers

**Source:** `packages/server/src/integration/test-helpers.ts`

### Database Setup

#### `createTripTrackingDatabase`

Creates an in-memory SQLite database with trip tracking schema.

**Type Signature:**
```typescript
function createTripTrackingDatabase(): Database.Database
```

**Parameters:** None

**Returns:** `Database.Database` - Better-sqlite3 database instance with:
- `trips` table with indexes on `date`, `origin_station_id`, `destination_station_id`, `line`, `departure_time`, `owner_id`
- `commute_stats` table for storing computed commute statistics

**Schema:**

```sql
CREATE TABLE trips (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  origin_station_id TEXT NOT NULL,
  origin_station_name TEXT NOT NULL,
  destination_station_id TEXT NOT NULL,
  destination_station_name TEXT NOT NULL,
  line TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'N',
  departure_time INTEGER NOT NULL,
  arrival_time INTEGER NOT NULL,
  actual_duration_minutes INTEGER NOT NULL,
  scheduled_duration_minutes INTEGER,
  source TEXT NOT NULL DEFAULT 'manual',
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  owner_id TEXT NOT NULL DEFAULT 'anonymous'
);
```

**Usage Example:**
```typescript
import { createTripTrackingDatabase, closeDatabase } from "@mta-my-way/server/integration/test-helpers";

const db = createTripTrackingDatabase();

// Insert test trip
db.prepare(`
  INSERT INTO trips (
    id, date, origin_station_id, origin_station_name,
    destination_station_id, destination_station_name, line,
    departure_time, arrival_time, actual_duration_minutes,
    created_at, updated_at, owner_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  "trip_123", "2024-01-15", "101", "South Ferry",
  "725", "Times Sq-42 St", "1",
  Date.now() - 3600000, Date.now() - 1800000, 60,
  Date.now(), Date.now(), "user_123"
);

// Query trips
const trips = db.prepare("SELECT * FROM trips WHERE owner_id = ?").all("user_123");

// Clean up
closeDatabase(db);
```

**Edge Cases:**
- Database is in-memory - lost when test process ends, use for isolated test data
- Always call `closeDatabase(db)` after test to prevent resource leaks
- `owner_id` defaults to `'anonymous'` - set explicitly for authorization tests
- WAL mode enabled for better concurrent read performance

---

#### `createPushDatabase`

Creates an in-memory SQLite database with push subscriptions schema.

**Type Signature:**
```typescript
function createPushDatabase(): Database.Database
```

**Parameters:** None

**Returns:** `Database.Database` - Better-sqlite3 database instance with:
- `push_subscriptions` table with indexes on `updated_at`, `owner_id`

**Schema:**

```sql
CREATE TABLE push_subscriptions (
  endpoint_hash TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  favorites TEXT NOT NULL DEFAULT '[]',
  quiet_hours TEXT NOT NULL DEFAULT '{"enabled":false,"startHour":22,"endHour":7}',
  morning_scores TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  owner_id TEXT NOT NULL DEFAULT 'anonymous'
);
```

**Usage Example:**
```typescript
import { createPushDatabase, closeDatabase, createTestSubscription } from "@mta-my-way/server/integration/test-helpers";
import crypto from "crypto";

const db = createPushDatabase();
const sub = createTestSubscription();

// Hash endpoint for primary key
const encoder = new TextEncoder();
const data = encoder.encode(sub.subscription.endpoint);
const hashBuffer = await crypto.subtle.digest("SHA-256", data);
const hashArray = Array.from(new Uint8Array(hashBuffer));
const endpointHash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

// Insert subscription
db.prepare(`
  INSERT INTO push_subscriptions (
    endpoint_hash, endpoint, p256dh, auth, favorites,
    quiet_hours, morning_scores, owner_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  endpointHash,
  sub.subscription.endpoint,
  sub.subscription.keys.p256dh,
  sub.subscription.keys.auth,
  JSON.stringify(sub.favorites),
  JSON.stringify(sub.quietHours),
  JSON.stringify(sub.morningScores),
  "user_123"
);

// Query subscription
const subscription = db.prepare("SELECT * FROM push_subscriptions WHERE owner_id = ?").get("user_123");

// Clean up
closeDatabase(db);
```

**Edge Cases:**
- `favorites`, `quiet_hours`, `morning_scores` stored as JSON strings - parse after retrieval
- `endpoint_hash` is SHA-256 hash of `endpoint` - always hash before insert/query
- Timestamps use SQLite's `datetime('now')` which returns UTC strings - parse with `new Date()`
- Always close database to prevent "too many open files" error in test suites

---

#### `createIntegrationTestDatabase`

Creates a combined in-memory database with all schemas (trips, commute_stats, push_subscriptions).

**Type Signature:**
```typescript
function createIntegrationTestDatabase(): Database.Database
```

**Parameters:** None

**Returns:** `Database.Database` - Better-sqlite3 database instance with all tables from `createTripTrackingDatabase` and `createPushDatabase`

**Usage Example:**
```typescript
import { createIntegrationTestDatabase, closeDatabase } from "@mta-my-way/server/integration/test-helpers";

const db = createIntegrationTestDatabase();

// Now you have all tables available
db.prepare("INSERT INTO trips (...) VALUES (...)").run(...);
db.prepare("INSERT INTO push_subscriptions (...) VALUES (...)").run(...);

// Query across tables
const results = db.prepare(`
  SELECT 
    t.*,
    p.favorites
  FROM trips t
  LEFT JOIN push_subscriptions p ON p.owner_id = t.owner_id
  WHERE t.owner_id = ?
`).all("user_123");

// Clean up
closeDatabase(db);
```

**Edge Cases:**
- Use this for tests that need multiple domains (e.g., trip tracking + push notifications)
- More convenient than managing multiple database instances
- Same memory isolation and cleanup requirements as individual database helpers

---

#### `closeDatabase`

Closes a database connection to prevent resource leaks.

**Type Signature:**
```typescript
function closeDatabase(db: Database.Database): void
```

**Parameters:**
- `db: Database.Database` - Database instance to close

**Returns:** `void`

**Usage Example:**
```typescript
import { createTripTrackingDatabase, closeDatabase } from "@mta-my-way/server/integration/test-helpers";

// In test setup
let db: Database.Database;
beforeEach(() => {
  db = createTripTrackingDatabase();
});

// In test teardown
afterEach(() => {
  closeDatabase(db);
});

// Or with try-finally for manual cleanup
const db = createTripTrackingDatabase();
try {
  // ... test code ...
} finally {
  closeDatabase(db);
}
```

**Edge Cases:**
- Always call in `afterEach` or `finally` block to ensure cleanup even on test failure
- Closing an already-closed database is safe (better-sqlite3 handles this)
- Not closing databases can cause "too many open files" errors in large test suites

---

### Data Factory Functions

#### `createTestTrip`

Creates a test trip record with default values for easy test data setup.

**Type Signature:**
```typescript
function createTestTrip(overrides?: Partial<TestTripOverrides>): TestTrip
```

**Parameters:**
- `overrides` (optional): Partial object to override default values

**Override Properties:**
- `id?: string` - Trip ID (default: random UUID)
- `date?: string` - Trip date in ISO format (default: today)
- `originId?: string` - Origin station ID (default: `"101"`)
- `originName?: string` - Origin station name (default: `"South Ferry"`)
- `destinationId?: string` - Destination station ID (default: `"725"`)
- `destinationName?: string` - Destination station name (default: `"Times Sq-42 St"`)
- `line?: string` - Subway line (default: `"1"`)
- `departureTime?: number` - Departure timestamp (default: 1 hour ago)
- `arrivalTime?: number` - Arrival timestamp (default: now)
- `actualDurationMinutes?: number` - Actual trip duration (default: `60`)
- `scheduledDurationMinutes?: number` - Scheduled duration (default: `55`)
- `source?: "manual" | "inferred" | "tracked"` - Trip source (default: `"manual"`)
- `notes?: string` - Trip notes (default: `undefined`)

**Returns:** `TestTrip` object with nested `origin` and `destination` objects

**Usage Example:**
```typescript
import { createTestTrip, createTripTrackingDatabase } from "@mta-my-way/server/integration/test-helpers";

const db = createTripTrackingDatabase();
const trip = createTestTrip({
  originId: "101",
  originName: "South Ferry",
  destinationId: "725",
  destinationName: "Times Sq-42 St",
  line: "1",
  actualDurationMinutes: 45
});

// Insert into database
db.prepare(`
  INSERT INTO trips (
    id, date, origin_station_id, origin_station_name,
    destination_station_id, destination_station_name, line,
    departure_time, arrival_time, actual_duration_minutes,
    scheduled_duration_minutes, source, created_at, updated_at, owner_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  trip.id,
  trip.date,
  trip.origin.stationId,
  trip.origin.stationName,
  trip.destination.stationId,
  trip.destination.stationName,
  trip.line,
  trip.departureTime,
  trip.arrivalTime,
  trip.actualDurationMinutes,
  trip.scheduledDurationMinutes,
  trip.source,
  Date.now(),
  Date.now(),
  "user_123"
);

// Create specific test scenarios
const delayedTrip = createTestTrip({
  actualDurationMinutes: 90,
  scheduledDurationMinutes: 45, // 45 min delay
  notes: "Signal problems at 14th St"
});

const rushHourTrip = createTestTrip({
  departureTime: new Date("2024-01-15T08:30:00").getTime(),
  line: "1",
  notes: "Morning rush hour"
});
```

**Edge Cases:**
- Returns nested structure (`origin.stationId`, `destination.stationName`) - flatten for database insert
- `id` is random UUID - override with fixed value for predictable test data
- Timestamps default to "1 hour ago to now" - override for specific time scenarios
- `source` is union type - TypeScript validates but runtime doesn't check

---

#### `createTestSubscription`

Creates a test push subscription with default values for easy test data setup.

**Type Signature:**
```typescript
function createTestSubscription(overrides?: Partial<TestSubscriptionOverrides>): TestSubscription
```

**Parameters:**
- `overrides` (optional): Partial object to override default values

**Override Properties:**
- `endpoint?: string` - Push endpoint URL (default: FCM test endpoint)
- `p256dh?: string` - VAPID p256dh key (default: `"test-p256dh-key"`)
- `auth?: string` - VAPID auth key (default: `"test-auth-key"`)
- `favorites?: Array<{...}>` - Favorite stations (default: one favorite)
- `quietHours?: {enabled, startHour, endHour}` - Quiet hours config (default: disabled)
- `morningScores?: Record<string, {...}>` - Morning scores by line (default: empty)

**Returns:** `TestSubscription` object with nested `subscription.keys` object

**Usage Example:**
```typescript
import { createTestSubscription, createPushDatabase } from "@mta-my-way/server/integration/test-helpers";

const db = createPushDatabase();
const sub = createTestSubscription({
  favorites: [
    { id: "fav-1", stationId: "101", lines: ["1"], direction: "both" },
    { id: "fav-2", stationId: "725", lines: ["1", "2", "3"], direction: "north" }
  ],
  quietHours: { enabled: true, startHour: 22, endHour: 7 }
});

// Hash endpoint
const endpointHash = await hashEndpoint(sub.subscription.endpoint);

// Insert into database
db.prepare(`
  INSERT INTO push_subscriptions (
    endpoint_hash, endpoint, p256dh, auth, favorites,
    quiet_hours, morning_scores, owner_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  endpointHash,
  sub.subscription.endpoint,
  sub.subscription.keys.p256dh,
  sub.subscription.keys.auth,
  JSON.stringify(sub.favorites),
  JSON.stringify(sub.quietHours),
  JSON.stringify(sub.morningScores),
  "user_123"
);

// Create specific test scenarios
const noFavorites = createTestSubscription({
  favorites: []
});

const customScores = createTestSubscription({
  morningScores: {
    "1": { line: "1", scores: [8, 7, 9, 6, 8] },
    "2": { line: "2", scores: [7, 8, 6, 7, 8] }
  }
});
```

**Edge Cases:**
- Returns nested structure (`subscription.keys.p256dh`) - flatten for database insert
- Endpoint hashing required before database insert - helper not provided, implement SHA-256
- `favorites` and `morningScores` stored as JSON - remember to `JSON.stringify()` for insert
- `morningScores` structure is `{ [lineId]: { line, scores: number[] } }` - follow this shape

---

### Authentication Helpers

#### `createTestApiKey`

Creates a test API key with specified scope and role for authenticated API testing.

**Type Signature:**
```typescript
async function createTestApiKey(
  scope?: "read" | "write" | "admin",
  role?: "guest" | "user" | "admin"
): Promise<TestAuthCredentials>
```

**Parameters:**
- `scope` (optional): Permission scope (default: `"write"`)
- `role` (optional): User role (default: `"user"`)

**Returns:** `Promise<TestAuthCredentials>` object with:
- `keyId: string` - API key ID
- `apiKey: string` - Unhashed API key (for test Authorization headers)
- `authorizationHeader: string` - Pre-formatted `"Bearer {keyId}:{apiKey}"` string

**Usage Example:**
```typescript
import { createTestApiKey, createTestAdminCredentials, createTestUserCredentials, createTestReadCredentials } from "@mta-my-way/server/integration/test-helpers";

// Create custom key
const credentials = await createTestApiKey("write", "user");
const response = await fetch("/api/trips", {
  method: "POST",
  headers: {
    "Authorization": credentials.authorizationHeader,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ originId: "101", destinationId: "725" })
});

// Use convenience helpers
const adminCreds = await createTestAdminCredentials(); // scope=admin, role=admin
const userCreds = await createTestUserCredentials();  // scope=write, role=user
const readCreds = await createTestReadCredentials();  // scope=read, role=user

// Test authorization
const adminResponse = await fetch("/api/admin/users", {
  headers: { "Authorization": adminCreds.authorizationHeader }
});
expect(adminResponse.status).toBe(200);

const readResponse = await fetch("/api/admin/users", {
  headers: { "Authorization": readCreds.authorizationHeader }
});
expect(readResponse.status).toBe(403); // Forbidden
```

**Edge Cases:**
- Registers key in global API key store - call `cleanupAllState()` in `afterEach` to prevent test pollution
- `apiKey` is returned unhashed - this is the ONLY place unhashed keys are exposed (by design for tests)
- `authorizationHeader` is pre-formatted - don't add `"Bearer "` prefix again
- Scope affects middleware permission checks - test with appropriate scope for each endpoint
- Role affects RBAC - test authorization boundaries with different roles

---

#### `createTestAdminCredentials`

Convenience helper to create admin credentials with full permissions.

**Type Signature:**
```typescript
async function createTestAdminCredentials(): Promise<TestAuthCredentials>
```

**Parameters:** None

**Returns:** `Promise<TestAuthCredentials>` - Same shape as `createTestApiKey`, with `scope="admin"`, `role="admin"`

**Usage Example:**
```typescript
import { createTestAdminCredentials } from "@mta-my-way/server/integration/test-helpers";

const admin = await createTestAdminCredentials();

// Test admin-only endpoint
const response = await fetch("/api/admin/users", {
  headers: { "Authorization": admin.authorizationHeader }
});
expect(response.status).toBe(200);

// Test admin can bypass rate limits
for (let i = 0; i < 100; i++) {
  const r = await fetch("/api/data", {
    headers: { "Authorization": admin.authorizationHeader }
  });
  expect(r.status).toBe(200); // Admin not rate limited
}
```

**Edge Cases:**
- Admin scope grants all permissions - don't use for testing authorization denial
- Still subject to CSRF requirements - include CSRF token for state-changing requests
- Register globally - remember `cleanupAllState()` in test teardown

---

#### `createTestUserCredentials`

Convenience helper to create regular user credentials with write access.

**Type Signature:**
```typescript
async function createTestUserCredentials(): Promise<TestAuthCredentials>
```

**Parameters:** None

**Returns:** `Promise<TestAuthCredentials>` - Same shape as `createTestApiKey`, with `scope="write"`, `role="user"`

**Usage Example:**
```typescript
import { createTestUserCredentials } from "@mta-my-way/server/integration/test-helpers";

const user = await createTestUserCredentials();

// Test user can create trips
const createResponse = await fetch("/api/trips", {
  method: "POST",
  headers: { 
    "Authorization": user.authorizationHeader,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ originId: "101", destinationId: "725" })
});
expect(createResponse.status).toBe(201);

// Test user cannot access admin endpoints
const adminResponse = await fetch("/api/admin/users", {
  headers: { "Authorization": user.authorizationHeader }
});
expect(adminResponse.status).toBe(403);
```

**Edge Cases:**
- Write scope includes creating favorites, commutes, trips - test each capability
- Cannot delete or modify other users' data - test authorization boundaries
- Rate limited at user tier - test rate limit enforcement

---

#### `createTestReadCredentials`

Convenience helper to create read-only user credentials.

**Type Signature:**
```typescript
async function createTestReadCredentials(): Promise<TestAuthCredentials>
```

**Parameters:** None

**Returns:** `Promise<TestAuthCredentials>` - Same shape as `createTestApiKey`, with `scope="read"`, `role="user"`

**Usage Example:**
```typescript
import { createTestReadCredentials } from "@mta-my-way/server/integration/test-helpers";

const reader = await createTestReadCredentials();

// Test read access
const getResponse = await fetch("/api/arrivals?stationId=101", {
  headers: { "Authorization": reader.authorizationHeader }
});
expect(getResponse.status).toBe(200);

// Test write denied
const createResponse = await fetch("/api/trips", {
  method: "POST",
  headers: { 
    "Authorization": reader.authorizationHeader,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ originId: "101", destinationId: "725" })
});
expect(createResponse.status).toBe(403);
```

**Edge Cases:**
- Read scope only allows GET requests - test all write operations return 403
- Useful for testing authorization boundaries without authentication failures
- Still requires valid key - test expired/revoked key handling separately

---

### Test Cleanup

#### `clearCommuteStatsCache`

Clears all commute statistics from the database for test isolation.

**Type Signature:**
```typescript
function clearCommuteStatsCache(db: Database.Database): void
```

**Parameters:**
- `db: Database.Database` - Database instance to clear

**Returns:** `void`

**Usage Example:**
```typescript
import { createTripTrackingDatabase, clearCommuteStatsCache } from "@mta-my-way/server/integration/test-helpers";

const db = createTripTrackingDatabase();

// Seed some commute stats
db.prepare("INSERT INTO commute_stats (...) VALUES (...)").run(...);

// Test with stats
const statsBefore = db.prepare("SELECT * FROM commute_stats").all();
expect(statsBefore.length).toBeGreaterThan(0);

// Clear for next test
clearCommuteStatsCache(db);

const statsAfter = db.prepare("SELECT * FROM commute_stats").all();
expect(statsAfter.length).toBe(0);
```

**Edge Cases:**
- Only clears `commute_stats` table - trips and subscriptions remain
- Use in `beforeEach` for tests that require empty commute stats
- Irreversible - don't use unless you intend to delete all stats

---

#### `clearAllTrips`

Clears all trip records from the database for test isolation.

**Type Signature:**
```typescript
function clearAllTrips(db: Database.Database): void
```

**Parameters:**
- `db: Database.Database` - Database instance to clear

**Returns:** `void`

**Usage Example:**
```typescript
import { createTripTrackingDatabase, clearAllTrips } from "@mta-my-way/server/integration/test-helpers";

const db = createTripTrackingDatabase();

// Insert test trips
db.prepare("INSERT INTO trips (...) VALUES (...)").run(...);

// Test with trips
const tripsBefore = db.prepare("SELECT * FROM trips").all();
expect(tripsBefore.length).toBeGreaterThan(0);

// Clear for next test
clearAllTrips(db);

const tripsAfter = db.prepare("SELECT * FROM trips").all();
expect(tripsAfter.length).toBe(0);
```

**Edge Cases:**
- Only clears `trips` table - commute_stats and subscriptions remain
- Use in `beforeEach` for tests that require empty trips table
- Irreversible - don't use unless you intend to delete all trips

---

#### `cleanupAllState`

Comprehensive cleanup of ALL shared mutable state across the server package for complete test isolation.

**Type Signature:**
```typescript
async function cleanupAllState(): Promise<void>
```

**Parameters:** None

**Returns:** `Promise<void>` - Resolves when all cleanup complete

**Modules Reset:**
- `cache.ts` - All cache state
- `alerts-poller.ts` - Alerts cache
- `authentication.ts` - Authentication state
- `api-key-management.ts` - All registered API keys
- `rate-limiter.ts` - Rate limit state
- `auth-rate-limit.ts` - Auth-specific rate limits
- `authorization-security.ts` - Access patterns
- `audit-log.ts` - Audit log entries
- `token-encryption.ts` - Encryption state
- `trip-tracking.ts` - Trip tracking cache
- `shuttle-matcher.ts` - Shuttle cache
- `delay-detector.ts` - Delay detector state
- `transformer.ts` - Transformer state
- `delay-predictor.ts` - Delay predictor state
- `password-management.ts` - Password history state
- `dynamic-rbac-cache.ts` - RBAC cache and overrides
- `password-reset.routes.ts` - Password reset users
- `captcha.ts` - CAPTCHA tracking
- `csrf-protection.ts` - CSRF token store
- `suspicious-activity-notifications.ts` - Notification storage
- `oauth/index.ts` - OAuth state

**Usage Example:**
```typescript
import { cleanupAllState, createTestApiKey } from "@mta-my-way/server/integration/test-helpers";

// In test file setup
beforeEach(async () => {
  await cleanupAllState();
});

// Test file 1
test("creates API key", async () => {
  const creds = await createTestApiKey();
  expect(creds.keyId).toBeDefined();
});

// Test file 2
test("API key count is fresh", async () => {
  // This test would fail without cleanupAllState() because
  // the key from test file 1 would still be registered
  const creds = await createTestApiKey();
  const allKeys = getAllRegisteredApiKeys();
  expect(allKeys.length).toBe(1); // Only this key exists
});
```

**Edge Cases:**
- **Critical for test isolation** - module-level singletons persist across tests
- Each reset is guarded - missing modules or functions are skipped silently
- Logs errors to console but continues - check test output for cleanup failures
- Call in `beforeEach()` of every integration test file
- Some mocked modules may not have reset functions - these are skipped
- Does NOT reset database state - use `clearAllTrips()`/`clearCommuteStatsCache()` for DB cleanup
- Slow operation (~100ms for all modules) - acceptable for integration tests, not unit tests

---

### CSRF Request Helpers

#### `getCsrfToken`

Fetches a CSRF token from the test application for use in state-changing requests.

**Type Signature:**
```typescript
async function getCsrfToken(app: { request(path: string, init?: RequestInit): Promise<Response> }): Promise<string>
```

**Parameters:**
- `app: object` - Test application instance with a `request()` method (e.g., Hono app, Express app, etc.)

**Returns:** `Promise<string>` - CSRF token

**Usage Example:**
```typescript
import { getCsrfToken } from "@mta-my-way/server/integration/test-helpers";
import { app } from "./app.js";

const token = await getCsrfToken(app);
expect(token).toHaveLength(32); // Default token length

// Use token in request
const response = await app.request("/api/trips", {
  method: "POST",
  headers: {
    "X-CSRF-Token": token,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ originId: "101", destinationId: "725" })
});
```

**Edge Cases:**
- Throws if `/api/csrf-token` returns non-200 status - check CSRF middleware is installed
- Token format depends on CSRF implementation - default is 32-char alphanumeric
- Tokens are single-use in some implementations - fetch fresh token per request
- Tokens expire - test expired token handling with time mocking

---

#### `requestWithCsrf`

Makes a state-changing request with automatic CSRF token inclusion.

**Type Signature:**
```typescript
async function requestWithCsrf(
  app: { request(path: string, init?: RequestInit): Promise<Response> },
  path: string,
  options?: RequestInit
): Promise<Response>
```

**Parameters:**
- `app: object` - Test application instance
- `path: string` - Request path
- `options: RequestInit` (optional) - Additional request options (method, headers, body, etc.)

**Returns:** `Promise<Response>` - Response from the application

**Usage Example:**
```typescript
import { requestWithCsrf } from "@mta-my-way/server/integration/test-helpers";
import { app } from "./app.js";

const response = await requestWithCsrf(app, "/api/trips", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ originId: "101", destinationId: "725" })
});

expect(response.status).toBe(201);

// Test CSRF rejection
const badResponse = await app.request("/api/trips", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ originId: "101", destinationId: "725" })
  // Missing X-CSRF-Token
});
expect(badResponse.status).toBe(403); // CSRF violation
```

**Edge Cases:**
- Fetches fresh CSRF token for each request - adds one HTTP roundtrip
- Merges provided headers with CSRF header - your headers take precedence if conflicting
- Does NOT include authentication - use `requestWithAuthAndCsrf` for authenticated requests
- GET requests don't need CSRF - use direct `app.request()` for safe methods

---

#### `requestWithAuthAndCsrf`

Makes an authenticated state-changing request with automatic CSRF token inclusion.

**Type Signature:**
```typescript
async function requestWithAuthAndCsrf(
  app: { request(path: string, init?: RequestInit): Promise<Response> },
  path: string,
  authHeaders: { Authorization: string },
  options?: RequestInit
): Promise<Response>
```

**Parameters:**
- `app: object` - Test application instance
- `path: string` - Request path
- `authHeaders: { Authorization: string }` - Headers with `Authorization` key
- `options: RequestInit` (optional) - Additional request options

**Returns:** `Promise<Response>` - Response from the application

**Usage Example:**
```typescript
import { requestWithAuthAndCsrf, createTestUserCredentials } from "@mta-my-way/server/integration/test-helpers";
import { app } from "./app.js";

const creds = await createTestUserCredentials();

const response = await requestWithAuthAndCsrf(
  app,
  "/api/trips",
  { Authorization: creds.authorizationHeader },
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ originId: "101", destinationId: "725" })
  }
);

expect(response.status).toBe(201);

// Test both auth and CSRF required
const noAuthResponse = await app.request("/api/trips", {
  method: "POST",
  headers: { 
    "X-CSRF-Token": await getCsrfToken(app),
    "Content-Type": "application/json" 
  },
  body: JSON.stringify({ originId: "101", destinationId: "725" })
});
expect(noAuthResponse.status).toBe(401); // Unauthorized

const noCsrfResponse = await app.request("/api/trips", {
  method: "POST",
  headers: { 
    "Authorization": creds.authorizationHeader,
    "Content-Type": "application/json" 
  },
  body: JSON.stringify({ originId: "101", destinationId: "725" })
});
expect(noCsrfResponse.status).toBe(403); // CSRF violation
```

**Edge Cases:**
- Fetches fresh CSRF token for each request - adds one HTTP roundtrip
- Merges auth headers, CSRF header, and provided headers - precedence: your headers > CSRF > auth
- Both auth and CSRF must be valid - test 401 (no auth) and 403 (no CSRF) separately
- `Authorization` header format must be `"Bearer {keyId}:{apiKey}"` - use `createTestApiKey` helper

---

## ⚠️ Edge Cases and Gotchas

**CRITICAL:** This section documents common pitfalls, unexpected behaviors, and troubleshooting tips for all test helpers. Understanding these edge cases will prevent flaky tests and reduce debugging time.

---

### Override Merging Behavior

**❗ CRITICAL: Shallow Merge, Not Deep Merge**

All `createMock*` functions use JavaScript's spread operator (`...overrides`) which performs a **shallow merge**. This has profound implications for how overrides are applied.

#### What Shallow Merge Means

```typescript
// ❌ INCORRECT: This does NOT merge the lines array
const station = createMockStation({
  lines: ["7"]  // Replaces entire array, not adds to it
});
// Result: lines = ["7"], NOT ["1", "2", "3", "7", "N", "Q", "R", "W", "7"]

// ✅ CORRECT: Explicitly specify all lines you want
const station = createMockStation({
  lines: ["1", "2", "3", "7", "N", "Q", "R", "W"]  // Complete array
});
```

#### Field Override Behavior Table

| Field Type | Behavior | Example |
|------------|----------|----------|
| **Primitives** (`id`, `name`, `lat`, `lon`, `ada`, `borough`) | Replaced | `{ id: "101" }` → new id only |
| **Arrays** (`lines`, `transfers`) | **Replaced entirely** | `{ lines: ["7"] }` → only line 7, not merged |
| **Objects** (`origin`, `destination` in `createMockCommute`) | **Replaced entirely** | `{ origin: newStation }` → replaces whole object |
| **Optional fields** (`complex`) | Added if provided | `{ complex: "D14" }` → now has complex ID |

#### Array Override Gotcha

```typescript
// ❌ EXPECTATION: Add "7" to existing lines
const station = createMockStation({
  lines: ["7"]
});
expect(station.lines).toEqual(["1", "2", "3", "7", "N", "Q", "R", "W", "7"]); // FAILS!

// ✅ REALITY: Lines array is completely replaced
expect(station.lines).toEqual(["7"]); // PASSES
```

#### Merging Arrays Correctly

```typescript
// Pattern 1: Manually merge arrays
const defaultStation = createMockStation();
const stationWithExtraLine = {
  ...defaultStation,
  lines: [...defaultStation.lines, "7"]
};

// Pattern 2: Specify complete array
const station = createMockStation({
  lines: ["1", "2", "3", "7", "N", "Q", "R", "W"]
});
```

#### Object Override Gotcha

```typescript
// ❌ INCORRECT: Partial object override replaces entire object
const commute = createMockCommute({
  origin: { id: "101" }  // Replaces entire origin, loses other fields
});
// Result: origin = { id: "101" } - missing name, lat, lon, lines, etc!

// ✅ CORRECT: Use createMockStation for nested objects
const commute = createMockCommute({
  origin: createMockStation({ id: "101", name: "South Ferry" })
});
```

---

### Timestamp Handling

**⚠️ CRITICAL: All Timestamps Use Millisecond Precision**

Every timestamp field across all test helpers uses **milliseconds since epoch** (Unix timestamp × 1000), not seconds.

#### Common Timestamp Mistakes

```typescript
// ❌ WRONG: Using seconds (typical Unix timestamp)
const trip = createMockTripRecord({
  departureTime: Math.floor(Date.now() / 1000),  // WRONG! Seconds, not ms
  arrivalTime: Math.floor(Date.now() / 1000)
});
// Result: Timestamps appear 1000x too old in queries

// ✅ CORRECT: Use milliseconds
const trip = createMockTripRecord({
  departureTime: Date.now() - 3600000,  // 1 hour ago in milliseconds
  arrivalTime: Date.now() - 1800000     // 30 min ago in milliseconds
});
```

#### Timezone Gotchas

```typescript
// ❌ GOTCHA: Date strings lose timezone context
const trip = createMockTripRecord({
  date: "2024-01-15",  // UTC midnight or local midnight?
  // SQLite stores this as-is, comparisons become tricky
});

// ✅ BETTER: Use timestamps for precision, convert to date string later
const timestamp = Date.now();
const trip = createMockTripRecord({
  departureTime: timestamp,
  arrivalTime: timestamp + 1800000
});
const date = new Date(timestamp).toISOString().split("T")[0];  // Local date
```

#### Time Mocking Side Effects

```typescript
beforeEach(() => {
  mockCurrentTime(new Date("2024-01-15T08:30:00").getTime());
});

test("uses mocked time", () => {
  const now = Date.now();
  expect(now).toBe(new Date("2024-01-15T08:30:00").getTime()); // ✅
  
  // ❌ GOTCHA: new Date() constructor is NOT mocked
  const date = new Date();
  expect(date.getTime()).not.toBe(now); // Actual current time
  
  // ✅ CORRECT: Use Date.now() or Date.parse() (both mocked)
  const parsed = Date.parse("2024-01-15");
  expect(parsed).toBe(now); // ✅
});
```

#### Timestamp Comparison Gotchas

```typescript
// ❌ GOTCHA: Comparing timestamps with different precision
const arrival = createMockArrival({
  arrivalTime: Date.now() + 120000,  // 2 minutes from now (ms)
  minutesAway: 2  // Calculated value, may be rounded
});

// Test may fail due to timing differences between creation and assertion
expect(arrival.minutesAway).toBe(2); // Flaky!

// ✅ BETTER: Use fixed timestamps
const fixedTime = Date.now();
const arrival = createMockArrival({
  arrivalTime: fixedTime + 120000,
  minutesAway: 2
});

// Mock time so Date.now() returns fixedTime
mockCurrentTime(fixedTime);
expect(arrival.minutesAway).toBe(2); // Stable
```

#### Expiration Time Calculations

```typescript
// ❌ GOTCHA: Off-by-one errors in expiration
const apiKey = createMockApiKey({
  expiresAt: Date.now() + 3600000  // 1 hour from now
});

// Test immediately - should be valid
expect(Date.now() < apiKey.expiresAt).toBe(true); // ✅

// But test 1ms later becomes flaky
const later = Date.now() + 1;
expect(later < apiKey.expiresAt).toBe(true); // Flaky near boundary!

// ✅ BETTER: Use explicit time windows for testing
const now = Date.now();
const apiKey = createMockApiKey({
  expiresAt: now + 3600000
});
const isExpired = (timestamp: number) => timestamp >= apiKey.expiresAt;

expect(isExpired(now)).toBe(false);        // Valid now
expect(isExpired(now + 3600000)).toBe(true); // Expired after 1 hour
```

#### Date String Format Gotchas

```typescript
// ❌ GOTCHA: Inconsistent date string formats
const trip1 = createMockTripRecord({
  date: "2024-01-15"  // ISO date (YYYY-MM-DD)
});

const trip2 = createMockTripRecord({
  date: new Date().toISOString().split("T")[0]  // Also ISO date
});

// ❌ GOTCHA: This creates different formats
const trip3 = createMockTripRecord({
  date: new Date().toLocaleDateString()  // "1/15/2024" - NOT ISO!
});

// ✅ CORRECT: Always use ISO format for consistency
const toIsoDate = (timestamp: number) => 
  new Date(timestamp).toISOString().split("T")[0];

const trip4 = createMockTripRecord({
  date: toIsoDate(Date.now())  // Consistent ISO format
});
```

---

### Unexpected Behaviors

#### 1. Stop ID Inconsistency

**❗ The `id` Field Does NOT Auto-Update `northStopId` and `southStopId`**

```typescript
// ❌ INCONSISTENT: id is "101" but stop IDs reference "725"
const inconsistentStation = createMockStation({
  id: "101"
});
console.log(inconsistentStation.id);         // "101"
console.log(inconsistentStation.northStopId); // "725N" ← Still references old ID!
console.log(inconsistentStation.southStopId); // "725S" ← Still references old ID!

// ✅ CONSISTENT: Update all related IDs together
const consistentStation = createMockStation({
  id: "999",
  northStopId: "999N",
  southStopId: "999S"
});

// ✅ HELPER: Create consistent stations
function createConsistentStation(stationId: string) {
  return createMockStation({
    id: stationId,
    northStopId: `${stationId}N`,
    southStopId: `${stationId}S`
  });
}
```

#### 2. Complex ID Field is Optional

**The `complex` field is `undefined` unless explicitly set**

```typescript
// Default: complex is undefined
const defaultStation = createMockStation();
console.log(defaultStation.complex); // undefined

// ❌ GOTCHA: Checking undefined vs falsy
if (!station.complex) {
  // This runs for both undefined AND "0" or empty string
}

// ✅ CORRECT: Explicit check
if (station.complex === undefined) {
  // Only runs when truly undefined
}

// ✅ CORRECT: Null coalescing for fallback
const complexId = station.complex ?? station.id;
```

#### 3. Borough Type Assertion Required

**Borough overrides need type assertion for type safety**

```typescript
// ❌ WRONG: TypeScript error without type assertion
const brooklynStation = createMockStation({
  borough: "brooklyn"  // Type error!
});

// ✅ CORRECT: Use type assertion
const brooklynStation = createMockStation({
  borough: "brooklyn" as Borough
});

// ✅ ALSO CORRECT: Import and cast
import type { Borough } from "@mta-my-way/shared/types/stations";
const station = createMockStation({
  borough: "queens" as Borough
});
```

#### 4. Transfers Array Replacement

**Like `lines`, `transfers` is replaced entirely, not merged**

```typescript
// ❌ EXPECTATION: Add transfer to defaults
const station = createMockStation({
  transfers: [
    { toStationId: "727", toLines: ["A", "C", "E"], walkingSeconds: 180, accessible: true }
  ]
});
// Result: Only one transfer (the one you specified), defaults lost

// ✅ CORRECT: Specify all transfers explicitly
const hubStation = createMockStation({
  transfers: [
    { toStationId: "727", toLines: ["A", "C", "E"], walkingSeconds: 180, accessible: true },
    { toStationId: "728", toLines: ["N", "Q", "R", "W"], walkingSeconds: 240, accessible: false }
  ]
});
```

#### 5. No Built-in Validation

**Test helpers do NOT validate inputs - they create objects with any values**

```typescript
// ❌ These will create objects without error (but are invalid!)
const invalidStation = createMockStation({
  id: "INVALID-ID-123",
  lat: 999.999,  // Invalid latitude (outside -90 to 90)
  lon: -999.999, // Invalid longitude (outside -180 to 180)
  lines: ["INVALID-LINE"],  // Non-existent MTA line
  northStopId: "not-a-number",  // Doesn't follow pattern
  borough: "new-jersey"  // Not a valid NYC borough
});

// ✅ You must add your own validation if needed
function validateStation(station: Station): boolean {
  if (station.lat < -90 || station.lat > 90) return false;
  if (station.lon < -180 || station.lon > 180) return false;
  if (!/^\d+$/.test(station.id)) return false;
  if (!/^\d+N$/.test(station.northStopId)) return false;
  if (!/^\d+S$/.test(station.southStopId)) return false;
  const validBoroughs: Borough[] = ["manhattan", "brooklyn", "queens", "bronx", "statenisland"];
  if (!validBoroughs.includes(station.borough)) return false;
  return true;
}
```

#### 6. Direction Union Type Gotcha

**Direction is literal `"N"` or `"S"` - TypeScript validates but runtime doesn't**

```typescript
// ❌ GOTCHA: Runtime doesn't catch invalid directions
const arrival = createMockArrival({
  direction: "north"  // TypeScript error, but if bypassed...
});

// ✅ CORRECT: Use exact literals
const arrival = createMockArrival({
  direction: "N"  // Correct
});

// ✅ HELPER: Type-safe direction
function createNorthboundArrival() {
  return createMockArrival({ direction: "N" });
}
```

#### 7. Mock Database Transaction Not Real

**`createMockDatabase().transaction` runs function synchronously, not as a real transaction**

```typescript
const db = createMockDatabase();

// ❌ GOTCHA: This runs immediately, not transactionally
db.transaction(() => {
  db.exec("INSERT INTO stations VALUES (...)");
  // If this throws, previous insert is NOT rolled back
  db.exec("INSERT INTO stations VALUES (...)");
});

// ✅ For transaction testing, use real database
const realDb = createTripTrackingDatabase();
realDb.transaction(() => {
  realDb.exec("INSERT INTO stations VALUES (...)");
  // This IS transactional - rollback on error
  realDb.exec("INSERT INTO stations VALUES (...)");
});
```

#### 8. Cleanup Side Effects

**`cleanupAllState()` is slow (~100ms) and doesn't reset database**

```typescript
// ❌ WRONG: Expecting fast cleanup
beforeEach(async () => {
  await cleanupAllState(); // Takes ~100ms
  // Creates slow test suite
});

// ✅ CORRECT: Use only for tests that need it
beforeEach(async () => {
  if (testNeedsCleanState) {
    await cleanupAllState();
  }
});

// ❌ GOTCHA: cleanupAllState() doesn't clear database
beforeEach(async () => {
  await cleanupAllState();
  const db = createTripTrackingDatabase();
  db.prepare("INSERT INTO trips (...) VALUES (...)").run(...);
});

afterEach(() => {
  // Database still has data! cleanupAllState doesn't touch it
  // Must use clearAllTrips() or closeDatabase()
});
```

#### 9. Mock Fetch URL Matching

**`createMockFetch` uses substring matching, not exact URL matching**

```typescript
const mockFetch = createMockFetch([
  {
    url: "/api/stations",
    response: createMockResponse({ id: "725" })
  }
]);

// ❌ GOTCHA: Substring matches multiple URLs
await mockFetch("/api/stations/725");  // Matches! (substring)
await mockFetch("/api/stations/101");  // Also matches!

// ✅ CORRECT: Use specific URLs
const mockFetch = createMockFetch([
  { url: "/api/stations/725", response: createMockResponse({ id: "725" }) },
  { url: "/api/stations/101", response: createMockResponse({ id: "101" }) }
]);
```

#### 10. Performance.now() Mock Resolution

**Test environment's `performance.now()` returns `Date.now()`, not high-resolution time**

```typescript
beforeEach(() => {
  setupTestEnvironment();
});

test("performance timing", () => {
  // ❌ GOTCHA: Not actually high-resolution
  const start = performance.now();
  const end = performance.now();
  expect(end - start).toBe(0); // Often 0, not microsecond precision
  
  // ✅ CORRECT: Use for relative timing only
  const start = performance.now();
  // ... do work ...
  const duration = performance.now() - start;
  expect(duration).toBeGreaterThan(0); // Rough measurement OK
});
```

---

### Troubleshooting Guide

#### Problem: Tests Pass Individually But Fail in Suite

**Symptoms:**
- Test passes when run alone
- Test fails when run with other tests
- Error messages about duplicate IDs, missing data, or unexpected state

**Root Cause:** Module-level state pollution between tests

**Solution:**
```typescript
// ✅ ALWAYS call cleanupAllState in beforeEach for integration tests
beforeEach(async () => {
  await cleanupAllState();
});

// ✅ Use fresh mock instances per test
test("test 1", () => {
  const logger = createMockLogger(); // Fresh instance
  // ...
});

test("test 2", () => {
  const logger = createMockLogger(); // New fresh instance
  // ...
});
```

#### Problem: "Too Many Open Files" Error

**Symptoms:**
- Tests fail after running for a while
- Error: `Error: SQLITE_CANTOPEN: too many open files`
- Happens after 50-100 tests

**Root Cause:** Database connections not being closed

**Solution:**
```typescript
// ❌ WRONG: Forgetting to close database
let db: Database.Database;
beforeEach(() => {
  db = createTripTrackingDatabase();
});
// No afterEach - connection leaks!

// ✅ CORRECT: Always close in afterEach
let db: Database.Database;
beforeEach(() => {
  db = createTripTrackingDatabase();
});

afterEach(() => {
  closeDatabase(db);  // CRITICAL!
});

// ✅ ALSO CORRECT: Use try-finally for manual cleanup
const db = createTripTrackingDatabase();
try {
  // ... test code ...
} finally {
  closeDatabase(db);  // Always runs, even if test fails
}
```

#### Problem: Assertions Pass But Values Are Wrong

**Symptoms:**
- Test assertions pass
- But logged/printed values don't match expectations
-特别是在处理时间戳时

**Root Cause:** Type coercion or silent failures in assertions

**Solution:**
```typescript
// ❌ GOTCHA: Loose equality passes
expect("123").toBe(123); // Fails (strict)
expect(["7"]).toEqual(["1", "2", "3", "7", "N", "Q", "R", "W"]); // Fails (not merged)

// ✅ CORRECT: Use strict assertions
expect(station.lines).toBe(["7"]); // Strict equality
expect(arrival.minutesAway).toBe(2); // Exact match

// ✅ ALSO CORRECT: Check specific properties
expect(station.lines).toHaveLength(1);
expect(station.lines[0]).toBe("7");
```

#### Problem: Time-Dependent Tests Are Flaky

**Symptoms:**
- Tests pass sometimes, fail other times
- Failures happen near minute/hour boundaries
- Errors about "stale data" or "expired tokens"

**Root Cause:** Using real time in tests, race conditions

**Solution:**
```typescript
// ❌ WRONG: Using real time
test("arrival time", () => {
  const arrival = createMockArrival({
    arrivalTime: Date.now() + 120000, // Changes every run
    minutesAway: 2
  });
  expect(arrival.minutesAway).toBe(2); // Flaky!
});

// ✅ CORRECT: Mock time
test("arrival time", () => {
  const fixedTime = new Date("2024-01-15T08:30:00").getTime();
  mockCurrentTime(fixedTime);
  
  const arrival = createMockArrival({
    arrivalTime: fixedTime + 120000,
    minutesAway: 2
  });
  expect(arrival.minutesAway).toBe(2); // Stable!
});
```

#### Problem: Arrays Not Merging As Expected

**Symptoms:**
- Expected arrays to combine (default + override)
- Got only override values
- Particularly common with `lines` and `transfers`

**Root Cause:** Shallow merge behavior (see "Override Merging Behavior" above)

**Solution:**
```typescript
// ❌ EXPECTATION: Arrays merge
const station = createMockStation({
  lines: ["7"]
});
// Expected: ["1", "2", "3", "7", "N", "Q", "R", "W", "7"]
// Got: ["7"]

// ✅ SOLUTION: Manually merge
const defaultStation = createMockStation();
const customStation = {
  ...defaultStation,
  lines: [...defaultStation.lines, "7"]
};
```

#### Problem: Stop ID Validation Fails

**Symptoms:**
- Tests expect stop IDs to match station ID
- But stop IDs reference different station
- Common in custom station mocks

**Root Cause:** Overriding `id` doesn't update stop IDs

**Solution:**
```typescript
// ❌ WRONG: Inconsistent IDs
const station = createMockStation({
  id: "101"
  // northStopId still "725N", southStopId still "725S"
});

// ✅ CORRECT: Update all IDs together
const station = createMockStation({
  id: "101",
  northStopId: "101N",
  southStopId: "101S"
});

// ✅ HELPER: Function to maintain consistency
function createStationWithId(id: string) {
  return createMockStation({
    id,
    northStopId: `${id}N`,
    southStopId: `${id}S`
  });
}
```

#### Problem: Authorization Tests Pass When They Should Fail

**Symptoms:**
- Test expects 403 Forbidden
- But gets 200 OK
- Authorization bypassed

**Root Cause:** Forgot to call `cleanupAllState()` or using admin credentials

**Solution:**
```typescript
// ❌ WRONG: State from previous test
test("user cannot delete trips", async () => {
  // No cleanup - previous test's admin key still registered!
  const creds = await createTestUserCredentials();
  const response = await fetch("/api/trips/123", {
    method: "DELETE",
    headers: { "Authorization": creds.authorizationHeader }
  });
  expect(response.status).toBe(403); // FAILS! Admin key from previous test
});

// ✅ CORRECT: Clean up first
beforeEach(async () => {
  await cleanupAllState();  // Reset all API keys
});

test("user cannot delete trips", async () => {
  const creds = await createTestUserCredentials();
  const response = await fetch("/api/trips/123", {
    method: "DELETE",
    headers: { "Authorization": creds.authorizationHeader }
  });
  expect(response.status).toBe(403); // PASSES!
});
```

#### Problem: CSRF Tests Fail with 403

**Symptoms:**
- POST/PUT/DELETE requests return 403 Forbidden
- CSRF token included in request
- Tests failing unexpectedly

**Root Cause:** Token expired, wrong format, or not fetched fresh

**Solution:**
```typescript
// ❌ WRONG: Reusing CSRF token
let csrfToken: string;
beforeAll(async () => {
  csrfToken = await getCsrfToken(app);  // Fetched once
});

test("create trip", async () => {
  const response = await requestWithCsrf(app, "/api/trips", {
    method: "POST",
    body: JSON.stringify({ originId: "101", destinationId: "725" })
  });
  // Token expired - fails!
});

// ✅ CORRECT: Fetch fresh token per request
test("create trip", async () => {
  // requestWithCsrf fetches fresh token automatically
  const response = await requestWithCsrf(app, "/api/trips", {
    method: "POST",
    body: JSON.stringify({ originId: "101", destinationId: "725" })
  });
  expect(response.status).toBe(201); // PASSES!
});
```

#### Problem: Database Queries Return No Results

**Symptoms:**
- Inserted data into mock database
- Queries return empty array
- No error messages

**Root Cause:** Forgetting to configure mock database or using wrong table name

**Solution:**
```typescript
// ❌ WRONG: Not configuring prepared statement
const db = createMockDatabase();
db._setData("stations", [
  { id: "725", name: "Times Square" }
]);

const stmt = db.prepare("SELECT * FROM stations WHERE id = ?");
const station = stmt.get("725");
// Returns undefined! Mock not configured

// ✅ CORRECT: Configure mock behavior
db.prepare.mockReturnValue({
  all: vi.fn(() => db._getData("stations")),
  get: vi.fn((id) => db._getData("stations").find(s => s.id === id)),
  run: vi.fn(() => ({ lastInsertRowid: 1, changes: 1 }))
});

const station = db.prepare("SELECT * FROM stations WHERE id = ?").get("725");
// Returns { id: "725", name: "Times Square" } ✅
```

#### Problem: Async Tests Timeout or Hang

**Symptoms:**
- Tests hang indefinitely
- Timeout after 5-10 seconds
- No error messages

**Root Cause:** Forgetting to await promises or not flushing async operations

**Solution:**
```typescript
// ❌ WRONG: Not awaiting async operation
test("async operation", () => {
  fetch("/api/stations").then(r => r.json()).then(data => {
    expect(data).toBeDefined(); // Never runs!
  });
  // Test ends before promise resolves
});

// ✅ CORRECT: Return the promise
test("async operation", () => {
  return fetch("/api/stations")
    .then(r => r.json())
    .then(data => {
      expect(data).toBeDefined();
    });
});

// ✅ ALSO CORRECT: Use async/await
test("async operation", async () => {
  const response = await fetch("/api/stations");
  const data = await response.json();
  expect(data).toBeDefined();
});

// ✅ FOR DOM UPDATES: Flush promises
test("component update", async () => {
  render(<MyComponent />);
  await flushPromises(); // Wait for all async operations
  expect(screen.getByText("Loaded")).toBeInTheDocument();
});
```

---

### Quick Reference: Common Gotchas Summary

| Issue | Symptom | Solution |
|-------|---------|----------|
| **Array replacement** | Arrays don't merge | Manually merge or specify complete array |
| **Stop ID inconsistency** | `northStopId`/`southStopId` don't match `id` | Update all IDs together |
| **Missing complex ID** | `complex` is `undefined` | Set explicitly if needed |
| **Type assertion needed** | TypeScript error on borough | Use `as Borough` |
| **No validation** | Invalid values accepted | Add your own validation |
| **State pollution** | Flaky tests in suite | Call `cleanupAllState()` in `beforeEach` |
| **Database leaks** | "Too many open files" | Always `closeDatabase()` in `afterEach` |
| **Time flakiness** | Time-dependent tests fail | Mock time with `mockCurrentTime()` |
| **URL substring match** | Wrong URL matched in mock fetch | Use specific URLs |
| **CSRF token reuse** | 403 on POST requests | Fetch fresh token per request |
| **Transaction not real** | Rollback doesn't work | Use real database for transactions |
| **Async hanging** | Tests timeout | Return promise or use async/await |

---

## Best Practices

### Test Isolation

1. **Always call `cleanupAllState()` in `beforeEach`** - Module-level state persists across tests
2. **Close database connections in `afterEach`** - Prevents "too many open files" errors
3. **Use fresh mocks per test** - Don't share mock instances between tests

### Security Testing

1. **Test both success and failure paths** - Verify authorization works for both allowed and denied operations
2. **Test edge cases** - Expired tokens, malformed input, boundary conditions
3. **Use realistic malicious inputs** - `MALICIOUS_INPUTS` constant provides known patterns
4. **Test sanitization, don't rely on it** - Sanitization is defense-in-depth, use parameterized queries

### Integration Testing

1. **Test the full stack** - From HTTP request to database persistence
2. **Use real databases** - In-memory SQLite is fast and reliable
3. **Test authentication flows** - Login, token refresh, logout
4. **Test CSRF protection** - Verify token is required and validated

### Common Pitfalls

1. **Forgetting cleanup** - Module state causes flaky tests
2. **Not closing databases** - Resource leaks in test suites
3. **Mocking too aggressively** - Integration tests should use real implementations
4. **Testing implementation details** - Test behavior, not internals
5. **Ignoring edge cases** - Empty strings, null values, boundary conditions

---

## Contributing

When adding new test helpers:

1. Add detailed JSDoc comments with parameter types and return types
2. Provide usage examples showing common patterns
3. Document edge cases and gotchas
4. Update both this reference and the inventory (`test-helpers-inventory.md`)
5. Follow naming conventions (`createMock*`, `assert*`, `clear*`, `reset*`)

---

**Document Version:** 1.0.0  
**Last Updated:** 2026-08-30  
**Maintained By:** MTA My Way Testing Team
