/**
 * Security testing utilities for MTA My Way.
 *
 * Provides helpers for testing security-related functionality:
 * - Mock security contexts
 * - Authentication helpers
 * - CSRF token generation
 * - Rate limiting test helpers
 * - Input validation helpers
 */

import { vi } from "vitest";

// ============================================================================
// Mock Authentication
// ============================================================================

/**
 * Create a mock API key.
 */
export function createMockApiKey(overrides = {}) {
  return {
    keyId: "key_test_123",
    keyHash: "hash_" + Math.random().toString(36).substring(7),
    keySalt: "salt_" + Math.random().toString(36).substring(7),
    scope: "read:arrivals read:alerts",
    role: "user",
    rateLimitTier: 1,
    active: true,
    createdAt: Date.now() - 86400000,
    expiresAt: Date.now() + 31536000000, // 1 year from now
    failedAttempts: 0,
    ...overrides,
  };
}

/**
 * Create a mock authentication token.
 */
export function createMockAuthToken(overrides = {}) {
  return {
    token: "Bearer " + generateRandomToken(32),
    expiresAt: Date.now() + 3600000,
    scopes: ["read:arrivals", "read:alerts"],
    userId: "user_123",
    ...overrides,
  };
}

/**
 * Create a mock session.
 */
export function createMockSession(overrides = {}) {
  return {
    sessionId: generateRandomToken(16),
    userId: "user_123",
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    expiresAt: Date.now() + 3600000,
    ip: "127.0.0.1",
    userAgent: "test-agent",
    ...overrides,
  };
}

// ============================================================================
// CSRF Protection
// ============================================================================

/**
 * Generate a random token for testing.
 */
export function generateRandomToken(length = 32): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Create a mock CSRF token.
 */
export function createMockCsrfToken() {
  return {
    token: generateRandomToken(32),
    expiresAt: Date.now() + 3600000,
  };
}

/**
 * Create CSRF headers for testing.
 */
export function createCsrfHeaders(token: string) {
  return new Headers({
    "x-csrf-token": token,
    "content-type": "application/json",
  });
}

// ============================================================================
// Rate Limiting
// ============================================================================

/**
 * Create a mock rate limit state.
 */
export function createMockRateLimitState(overrides = {}) {
  return {
    identifier: "127.0.0.1",
    remaining: 60,
    resetAt: Date.now() + 60000,
    limit: 60,
    windowMs: 60000,
    ...overrides,
  };
}

/**
 * Create a mock rate limit ban.
 */
export function createMockRateLimitBan(overrides = {}) {
  return {
    identifier: "127.0.0.1",
    bannedUntil: Date.now() + 3600000,
    violationCount: 5,
    reason: "Rate limit exceeded",
    ...overrides,
  };
}

// ============================================================================
// Input Validation
// ============================================================================

/**
 * Malicious input patterns for testing validation.
 */
export const MALICIOUS_INPUTS = {
  // SQL Injection patterns
  sqlInjection: [
    "'; DROP TABLE users; --",
    "1' OR '1'='1",
    "admin'--",
    "admin'/*",
    "1' UNION SELECT * FROM users--",
  ],

  // XSS patterns
  xss: [
    "<script>alert('XSS')</script>",
    "<img src=x onerror=alert('XSS')>",
    "<svg onload=alert('XSS')>",
    "javascript:alert('XSS')",
    "<iframe src='javascript:alert(XSS)'>",
  ],

  // Path traversal patterns
  pathTraversal: [
    "../../../etc/passwd",
    "..\\..\\..\\windows\\system32",
    "/etc/passwd",
    "C:\\Windows\\System32\\config\\sam",
  ],

  // Command injection patterns
  commandInjection: ["; ls -la", "| cat /etc/passwd", "& whoami", "`id`", "$(whoami)"],

  // LDAP injection patterns
  ldapInjection: ["*)(uid=*", "*)(&", "*(|(mail=*"],

  // NoSQL injection patterns
  nosqlInjection: ['{"$ne": null}', '{"$gt": ""}', '{"$regex": ".*"}'],

  // Header injection patterns
  headerInjection: [
    "value\r\nX-Injected: true",
    "value\nX-Injected: true",
    "value\rX-Injected: true",
  ],
} as const;

/**
 * Test if input contains malicious patterns.
 */
export function containsMaliciousPatterns(input: string): boolean {
  const dangerousPatterns = [
    // SQL injection patterns
    /('|(--)|(;)|(\/\*)|(\*\/)|(\bunion\b)|(\bselect\b)|(\binsert\b)|(\bupdate\b)|(\bdelete\b)|(\bdrop\b)|(\bexec\b)|(\bexecute\b))/i,
    // XSS patterns
    /(<script|<iframe|<img|javascript:|onerror=|onload=|onclick=)/i,
    // Path traversal - check for dot-dot sequences and sensitive system paths
    /(\.\.\/)|(\.\.\\)|(%2e%2e)|(@@)|\/etc\/|C:\\\\Windows|C:\\Windows/i,
    // Command injection - check for command separators and command substitution
    /(;&|\|&|`|\$\(|&|\|)/i,
    // Header injection
    /(\r\n|\n|\r)/i,
    // NoSQL injection
    /(\$ne|\$gt|\$lt|\$regex|\$where)/i,
  ];

  return dangerousPatterns.some((pattern) => pattern.test(input));
}

/**
 * Sanitize input for testing (compare with actual sanitization).
 *
 * Removes:
 * - HTML tags and script content
 * - SQL special characters (quotes, semicolons, comments)
 * - Path traversal sequences
 * - Command injection characters
 * - Header injection sequences (CRLF)
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/<script[^>]*>.*?<\/script>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[;'"]/g, "")
    .replace(/\b(DROP|SELECT|INSERT|UPDATE|DELETE|UNION|EXEC|EXECUTE)\b/gi, "")
    .replace(/--|\/\*|\*\//g, "")
    .replace(/[;&|`$()]/g, "")
    .replace(/\.\.\/|\.\.\\/g, "")
    .replace(/[\r\n]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================================
// Security Context Mocking
// ============================================================================

/**
 * Create a mock security context.
 */
export function createMockSecurityContext(overrides = {}) {
  return {
    isAuthenticated: false,
    userId: null,
    apiKey: null,
    scopes: [],
    ip: "127.0.0.1",
    userAgent: "test-agent",
    sessionId: null,
    csrfToken: null,
    ...overrides,
  };
}

/**
 * Create an authenticated security context.
 */
export function createAuthenticatedContext(overrides = {}) {
  return createMockSecurityContext({
    isAuthenticated: true,
    userId: "user_123",
    apiKey: createMockApiKey(),
    scopes: ["read:arrivals", "read:alerts", "write:favorites"],
    sessionId: generateRandomToken(16),
    csrfToken: createMockCsrfToken().token,
    ...overrides,
  });
}

// ============================================================================
// Security Event Mocking
// ============================================================================

/**
 * Create a mock security event.
 */
export function createMockSecurityEvent(overrides = {}) {
  return {
    eventId: "event_" + generateRandomToken(16),
    type: "auth_failure",
    severity: "warning",
    timestamp: Date.now(),
    details: {
      ip: "127.0.0.1",
      userAgent: "test-agent",
      attemptCount: 3,
    },
    ...overrides,
  };
}

/**
 * Security event types for testing.
 */
export const SECURITY_EVENT_TYPES = {
  authentication: ["login_success", "login_failure", "logout", "session_expired"],
  authorization: ["access_denied", "insufficient_permissions", "resource_not_found"],
  rateLimit: ["rate_limit_exceeded", "rate_limit_ban", "rate_limit_reset"],
  data: ["sensitive_data_access", "data_export", "data_deletion"],
  session: ["session_created", "session_destroyed", "session_hijack_attempt"],
  csrf: ["csrf_token_missing", "csrf_token_invalid", "csrf_token_expired"],
  input: ["invalid_input", "malicious_input_detected", "sanitization_failed"],
} as const;

// ============================================================================
// Password Testing Utilities
// ============================================================================

/**
 * Password strength levels for testing.
 */
export const PASSWORD_STRENGTH = {
  weak: {
    password: "123456",
    score: 0,
    feedback: "Very weak password",
  },
  fair: {
    password: "password123",
    score: 1,
    feedback: "Weak password",
  },
  good: {
    password: "SecurePass456!",
    score: 2,
    feedback: "Good password",
  },
  strong: {
    password: "V3ry$tr0ng!P@ssw0rd#2024",
    score: 3,
    feedback: "Strong password",
  },
} as const;

/**
 * Create a mock password hash.
 */
export function createMockPasswordHash(overrides = {}) {
  return {
    hash: "$2b$10$" + generateRandomToken(53),
    salt: "$2b$10$" + generateRandomToken(22),
    iterations: 10,
    ...overrides,
  };
}

/**
 * Create a mock password reset token.
 */
export function createMockPasswordResetToken(overrides = {}) {
  return {
    tokenId: "token_" + generateRandomToken(16),
    keyId: "key_test_123",
    tokenHash: "hash_" + generateRandomToken(32),
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600000,
    used: false,
    clientIp: "127.0.0.1",
    userAgent: "test-agent",
    ...overrides,
  };
}

// ============================================================================
// RBAC Testing Utilities
// ============================================================================

/**
 * Available roles for testing.
 */
export const ROLES = {
  admin: {
    name: "admin",
    permissions: ["*"], // All permissions
  },
  user: {
    name: "user",
    permissions: [
      "read:arrivals",
      "read:alerts",
      "read:stations",
      "write:favorites",
      "write:commutes",
      "write:journal",
    ],
  },
  readonly: {
    name: "readonly",
    permissions: ["read:arrivals", "read:alerts", "read:stations"],
  },
  service: {
    name: "service",
    permissions: ["read:*", "write:push"],
  },
} as const;

/**
 * Check if a role has a specific permission.
 */
export function hasPermission(role: keyof typeof ROLES, permission: string): boolean {
  const roleConfig = ROLES[role];
  return roleConfig.permissions.some((p) => {
    if (p === "*") return true;
    if (p.endsWith(":*")) {
      const prefix = p.split(":")[0];
      return permission.startsWith(prefix + ":");
    }
    return p === permission;
  });
}

// ============================================================================
// Audit Log Testing
// ============================================================================

/**
 * Create a mock audit log entry.
 */
export function createMockAuditLogEntry(overrides = {}) {
  return {
    id: "audit_" + generateRandomToken(16),
    timestamp: Date.now(),
    userId: "user_123",
    action: "api_key_created",
    resourceType: "api_key",
    resourceId: "key_test_123",
    ip: "127.0.0.1",
    userAgent: "test-agent",
    success: true,
    details: {},
    ...overrides,
  };
}

/**
 * Audit action types for testing.
 */
export const AUDIT_ACTIONS = {
  authentication: ["login", "logout", "failed_login", "password_changed", "password_reset"],
  api_keys: ["api_key_created", "api_key_updated", "api_key_deleted", "api_key_rotated"],
  data: ["data_exported", "data_deleted", "data_updated"],
  admin: ["user_created", "user_updated", "user_deleted", "role_changed"],
  sessions: ["session_created", "session_destroyed", "session_revoked"],
} as const;

// ============================================================================
// Mock Security Middleware
// ============================================================================

/**
 * Create a mock security middleware context.
 */
export function createMockSecurityMiddleware() {
  const context = {
    request: {
      ip: "127.0.0.1",
      headers: new Headers(),
      method: "GET",
      url: "http://localhost:3001/api/test",
    },
    session: null as { sessionId: string; userId: string } | null,
    user: null as { id: string } | null,
    security: {
      isAuthenticated: false,
      csrfToken: null as string | null,
      rateLimit: {
        remaining: 60,
        resetAt: Date.now() + 60000,
      },
    },
  };

  return {
    context,
    authenticate: vi.fn((userId: string) => {
      context.security.isAuthenticated = true;
      context.user = { id: userId };
    }),
    authorize: vi.fn((_permission: string) => {
      if (!context.security.isAuthenticated) {
        throw new Error("Unauthorized");
      }
      return true;
    }),
    setCsrfToken: vi.fn((token: string) => {
      context.security.csrfToken = token;
    }),
    checkRateLimit: vi.fn(() => {
      context.security.rateLimit.remaining--;
      return context.security.rateLimit.remaining > 0;
    }),
  };
}

// ============================================================================
// Test Assertions
// ============================================================================

// Note: These assertion helpers are provided as utilities for use in vitest tests.
// The actual expect() calls should be made by the test code itself.

/**
 * Check if input is properly sanitized.
 * Returns true if the sanitized input is safe.
 */
export function isSanitized(sanitized: string): boolean {
  // Check that dangerous patterns are removed
  return !(
    sanitized.includes("<script>") ||
    sanitized.includes("<") ||
    sanitized.includes(">") ||
    sanitized.includes("javascript:") ||
    sanitized.includes("onerror=") ||
    sanitized.includes("../") ||
    sanitized.includes(";")
  );
}

/**
 * Check if headers include security headers.
 * Returns true if all required security headers are present.
 */
export function hasSecurityHeaders(headers: Headers): boolean {
  return !!(
    headers.get("x-content-type-options") === "nosniff" &&
    headers.get("x-frame-options") &&
    headers.get("x-xss-protection") &&
    headers.get("strict-transport-security")?.includes("max-age=")
  );
}
