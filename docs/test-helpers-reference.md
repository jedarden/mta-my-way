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

**Returns:** `Station` object with:
- `id: string` - Station ID (default: `"725"`)
- `name: string` - Station name (default: `"Times Square-42 St"`)
- `lat: number` - Latitude (default: `40.7589`)
- `lon: number` - Longitude (default: `-73.9851`)
- `lines: string[]` - Subway lines (default: `["1", "2", "3", "7", "N", "Q", "R", "W"]`)
- `northStopId: string` - Northbound stop ID (default: `"725N"`)
- `southStopId: string` - Southbound stop ID (default: `"725S"`)
- `transfers: TransferConnection[]` - Transfer stations (default: `[]`)
- `ada: boolean` - ADA accessibility (default: `true`)
- `borough: Borough` - Borough (default: `"manhattan"`)

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

**Edge Cases:**
- Default station is Times Square - override for location-specific tests
- `lines` array affects line validation logic - ensure valid line IDs
- ADA compliance tests should mock both `ada: true` and `ada: false` stations
- Transfers structure affects route calculation tests - use realistic transfer data
- Borough values must be valid [`Borough`](../packages/shared/src/types/stations.ts#L7) union members

---

#### `createMockRoute`

Creates a mock subway route object with default values.

**Type Signature:**
```typescript
function createMockRoute(overrides?: Partial<Route>): Route
```

**Parameters:**
- `overrides` (optional): Partial object to override default values

**Returns:** `Route` object with:
- `id: string` - Route ID (default: `"1"`)
- `shortName: string` - Short route name (default: `"1"`)
- `longName: string` - Full route name (default: `"Broadway-7th Ave Local"`)
- `color: string` - Route color hex (default: `"#EE352E"`)
- `textColor: string` - Text color hex (default: `"#FFFFFF"`)
- `feedId: string` - GTFS feed ID (default: `"gtfs"`)
- `division: string` - Division (default: `"A"`)
- `stops: string[]` - Stop IDs (default: `["101", "102", "103"]`)
- `isExpress: boolean` - Express route flag (default: `false`)

**Usage Example:**
```typescript
import { createMockRoute } from "@mta-my-way/shared/testing";

const defaultRoute = createMockRoute();
const expressRoute = createMockRoute({
  id: "2",
  shortName: "2",
  longName: "7th Ave Express",
  isExpress: true,
  color: "#EE352E"
});

const localRoute = createMockRoute({
  stops: ["101", "102", "103", "104", "105"]
});
```

**Edge Cases:**
- Color hex values must include `#` prefix - matching CSS color format
- Express vs local affects skip-stop logic - test both behaviors
- Stop IDs must correspond to valid stations - coordinate with `createMockStation`
- `feedId` affects data source selection - use consistent feed ID across tests

---

#### `createMockArrival`

Creates a mock train arrival object with default values.

**Type Signature:**
```typescript
function createMockArrival(overrides?: Partial<Arrival>): Arrival
```

**Parameters:**
- `overrides` (optional): Partial object to override default values

**Returns:** `Arrival` object with:
- `line: string` - Subway line (default: `"1"`)
- `direction: "N" | "S"` - Direction (default: `"N"`)
- `arrivalTime: number` - Arrival timestamp (default: 2 minutes from now)
- `minutesAway: number` - Minutes until arrival (default: `2`)
- `isAssigned: boolean` - Assignment status (default: `true`)
- `isRerouted: boolean` - Reroute flag (default: `false`)
- `tripId: string` - Trip ID (default: `"trip_123"`)
- `destination: string` - Destination station (default: `"Van Cortlandt Park"`)
- `confidence: "high" | "medium" | "low"` - Arrival confidence (default: `"high"`)
- `feedName: string` - Feed source (default: `"gtfs"`)
- `feedAge: number` - Feed age in seconds (default: `8`)

**Usage Example:**
```typescript
import { createMockArrival } from "@mta-my-way/shared/testing";

const defaultArrival = createMockArrival();
const southboundArrival = createMockArrival({
  line: "2",
  direction: "S",
  minutesAway: 5,
  destination: "New Lots Avenue"
});

const delayedArrival = createMockArrival({
  minutesAway: 15,
  confidence: "low",
  feedAge: 45 // Stale data
});

const reroutedArrival = createMockArrival({
  isRerouted: true,
  line: "1",
  destination: "14 St (via 2)"
});
```

**Edge Cases:**
- `arrivalTime` defaults to 2 minutes from now - use fixed timestamp for predictable tests
- `confidence` affects display priority - test low confidence handling
- `feedAge` indicates data freshness - test stale data rejection logic
- `isRerouted` flag affects route display - test reroute notifications
- Direction is literal `"N"` or `"S"` - TypeScript validates but runtime doesn't check

---

#### `createMockAlert`

Creates a mock service alert object with default values.

**Type Signature:**
```typescript
function createMockAlert(overrides?: Partial<Alert>): Alert
```

**Parameters:**
- `overrides` (optional): Partial object to override default values

**Returns:** `Alert` object with:
- `id: string` - Alert ID (default: `"alert_123"`)
- `severity: "info" | "warning" | "severe"` - Alert severity (default: `"warning"`)
- `headline: string` - Alert headline (default: `"Delays on 1 train"`)
- `description: string` - Full description (default: `"1 trains running with delays..."`)
- `affectedLines: string[]` - Affected subway lines (default: `["1"]`)
- `activePeriod: {start: number, end: number}` - Active time window (default: starts 1 hour ago, ends in 2 hours)
- `cause: string` - Alert cause (default: `"SIGNAL_PROBLEM"`)
- `effect: string` - Service effect (default: `"DELAY"`)

**Usage Example:**
```typescript
import { createMockAlert } from "@mta-my-way/shared/testing";

const defaultAlert = createMockAlert();
const severeAlert = createMockAlert({
  id: "alert_severe_1",
  severity: "severe",
  headline: "Suspension of 1 Train Service",
  description: "No 1 train service due to major incident",
  affectedLines: ["1"],
  cause: "MAJOR_INCIDENT",
  effect: "SUSPENDED"
});

const multiLineAlert = createMockAlert({
  severity: "warning",
  affectedLines: ["1", "2", "3"],
  headline: "Delays on Broadway Lines",
  activePeriod: {
    start: Date.now() - 3600000,
    end: Date.now() + 7200000
  }
});

const expiredAlert = createMockAlert({
  activePeriod: {
    start: Date.now() - 7200000,
    end: Date.now() - 3600000 // Ended 1 hour ago
  }
});
```

**Edge Cases:**
- Severity affects display priority - test all three levels
- `activePeriod` uses timestamps - test expired, active, and future alerts
- Multi-line alerts affect filtering - test line-specific vs multi-line scenarios
- `cause` and `effect` are free-form strings - use standard GTFS values for consistency
- Alert filtering tests should use active period boundaries

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
