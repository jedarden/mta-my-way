/**
 * Test utilities for security testing.
 */

import type { Context } from "hono";

/**
 * Create a mock Hono context for testing.
 */
export function createMockContext(overrides: Partial<Context> = {}): Context {
  const mockReq = {
    header: vi.fn((name: string) => {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        "user-agent": "test-agent",
        "x-forwarded-for": "127.0.0.1",
      };
      return headers[name.toLowerCase()] || null;
    }),
    method: "GET",
    path: "/test",
    url: "http://localhost/test",
    query: () => ({}),
    param: vi.fn(),
    json: vi.fn(),
    formData: vi.fn(),
    body: vi.fn(),
  } as unknown as Context["req"];

  const mockRes = {
    status: vi.fn((code: number) => mockRes as unknown as typeof mockRes & Context["res"]),
    json: vi.fn((body: unknown) => new Response(JSON.stringify(body))),
    text: vi.fn((body: string) => new Response(body)),
    body: vi.fn((body: unknown) => new Response(JSON.stringify(body))),
    headers: new Headers(),
  } as unknown as Context["res"];

  return {
    req: mockReq,
    res: mockRes,
    get: vi.fn((key: string) => undefined),
    set: vi.fn((key: string, value: unknown) => {}),
    header: vi.fn((name: string, value: string) => {}),
    ...overrides,
  } as unknown as Context;
}

/**
 * Security test scenarios for common vulnerabilities.
 */
export const securityTestScenarios = {
  /**
   * SQL injection test payloads.
   */
  sqlInjection: [
    "'; DROP TABLE users; --",
    "' OR '1'='1",
    "1' UNION SELECT * FROM users--",
    "'; EXEC xp_cmdshell('dir'); --",
    "1'; INSERT INTO users VALUES ('hacker', 'password'); --",
  ],

  /**
   * XSS test payloads.
   */
  xss: [
    "<script>alert('XSS')</script>",
    "<img src=x onerror=alert('XSS')>",
    "<svg onload=alert('XSS')>",
    "javascript:alert('XSS')",
    "<iframe src='javascript:alert(XSS)'>",
  ],

  /**
   * Path traversal test payloads.
   */
  pathTraversal: [
    "../../../etc/passwd",
    "..\\..\\..\\windows\\system32\\drivers\\etc\\hosts",
    "....//....//....//etc/passwd",
    "%2e%2e%2fetc%2fpasswd",
  ],

  /**
   * CSRF test scenarios.
   */
  csrf: {
    validToken: "valid-csrf-token",
    expiredToken: "expired-csrf-token",
    invalidToken: "invalid-csrf-token",
    missingToken: "",
  },

  /**
   * Rate limiting test scenarios.
   */
  rateLimit: {
    burstRequestCount: 100,
    sustainedRequestCount: 1000,
    timeWindowMs: 60000,
  },

  /**
   * Authentication test credentials.
   */
  auth: {
    validApiKey: "valid-api-key",
    invalidApiKey: "invalid-api-key",
    expiredToken: "expired-token",
    revokedToken: "revoked-token",
  },
};

/**
 * Assert that a response has security headers.
 */
export function assertSecurityHeaders(
  headers: Headers,
  requiredHeaders: string[] = [
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Strict-Transport-Security",
    "Content-Security-Policy",
  ]
): void {
  const missing = requiredHeaders.filter((h) => !headers.get(h));

  if (missing.length > 0) {
    throw new Error(`Missing security headers: ${missing.join(", ")}`);
  }
}

/**
 * Assert that CSP is configured correctly.
 */
export function assertCspHeaders(csp: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check for dangerous directives
  const dangerousPatterns = [
    { pattern: /unsafe-eval/, name: "unsafe-eval" },
    { pattern: /unsafe-inline(?![\s-])/, name: "unsafe-inline without nonce/hash" },
    { pattern: /\*/, name: "wildcard source" },
    { pattern: /data:/, name: "data: source" },
  ];

  for (const { pattern, name } of dangerousPatterns) {
    if (pattern.test(csp)) {
      errors.push(`CSP contains potentially dangerous ${name}`);
    }
  }

  // Check for required directives
  const requiredDirectives = ["default-src", "script-src"];
  for (const directive of requiredDirectives) {
    if (!csp.includes(directive)) {
      errors.push(`CSP missing required directive: ${directive}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Assert that sensitive data is not leaked in response.
 */
export function assertNoSensitiveDataLeak(
  responseBody: string,
  sensitiveFields: string[] = ["password", "token", "secret", "apiKey"]
): void {
  const lowerBody = responseBody.toLowerCase();

  for (const field of sensitiveFields) {
    // Look for patterns like "password":"value" or password: "value"
    const pattern = new RegExp(`"${field}"\\s*:\\s*"[^"]+`, "i");
    if (pattern.test(lowerBody)) {
      throw new Error(`Response potentially leaks sensitive field: ${field}`);
    }
  }
}

/**
 * Test input sanitization for XSS.
 */
export function testXssSanitization(
  sanitize: (input: string) => string,
  payloads: string[] = securityTestScenarios.xss
): { sanitized: string[]; failed: string[] } {
  const sanitized: string[] = [];
  const failed: string[] = [];

  for (const payload of payloads) {
    const result = sanitize(payload);
    if (result === payload) {
      failed.push(payload);
    } else {
      sanitized.push(payload);
    }
  }

  return { sanitized, failed };
}

/**
 * Test SQL injection protection.
 */
export function testSqlInjectionProtection(
  query: (input: string) => unknown,
  payloads: string[] = securityTestScenarios.sqlInjection
): { blocked: string[]; failed: string[] } {
  const blocked: string[] = [];
  const failed: string[] = [];

  for (const payload of payloads) {
    try {
      const result = query(payload);
      // If query succeeds without error, check if it was properly sanitized
      blocked.push(payload);
    } catch (error) {
      // Query threw an error, which is good for SQL injection attempts
      blocked.push(payload);
    }
  }

  return { blocked, failed };
}

/**
 * Test path traversal protection.
 */
export function testPathTraversalProtection(
  resolvePath: (input: string) => string,
  payloads: string[] = securityTestScenarios.pathTraversal
): { blocked: string[]; failed: string[] } {
  const blocked: string[] = [];
  const failed: string[] = [];

  for (const payload of payloads) {
    const result = resolvePath(payload);

    // Check if result stays within expected bounds
    const isTraversalAttempt = /\.\./.test(payload);
    const hasEscaped = /\.\.[\/\\]/.test(result);

    if (isTraversalAttempt && !hasEscaped) {
      blocked.push(payload);
    } else if (isTraversalAttempt && hasEscaped) {
      failed.push(payload);
    } else {
      blocked.push(payload);
    }
  }

  return { blocked, failed };
}

/**
 * Create a mock rate limiter for testing.
 */
export class MockRateLimiter {
  private attempts: Map<string, number[]> = new Map();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs = 60000, maxRequests = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  /**
   * Check if a request should be rate limited.
   */
  check(identifier: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const attempts = this.attempts.get(identifier) || [];

    // Remove old attempts outside the window
    const validAttempts = attempts.filter((t) => now - t < this.windowMs);

    if (validAttempts.length >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: validAttempts[0]! + this.windowMs,
      };
    }

    validAttempts.push(now);
    this.attempts.set(identifier, validAttempts);

    return {
      allowed: true,
      remaining: this.maxRequests - validAttempts.length,
      resetAt: now + this.windowMs,
    };
  }

  /**
   * Reset rate limit for an identifier.
   */
  reset(identifier: string): void {
    this.attempts.delete(identifier);
  }

  /**
   * Clear all rate limit data.
   */
  clear(): void {
    this.attempts.clear();
  }

  /**
   * Get current attempt count for an identifier.
   */
  getAttempts(identifier: string): number {
    const attempts = this.attempts.get(identifier) || [];
    const now = Date.now();
    return attempts.filter((t) => now - t < this.windowMs).length;
  }
}

/**
 * Assert rate limiting behavior.
 */
export async function assertRateLimit(
  rateLimiter: MockRateLimiter,
  identifier: string,
  maxRequests: number
): Promise<void> {
  // Should allow requests up to the limit
  for (let i = 0; i < maxRequests; i++) {
    const result = rateLimiter.check(identifier);
    if (!result.allowed) {
      throw new Error(`Rate limit triggered prematurely at request ${i + 1}/${maxRequests}`);
    }
  }

  // Next request should be rate limited
  const result = rateLimiter.check(identifier);
  if (result.allowed) {
    throw new Error("Rate limit did not trigger after exceeding max requests");
  }
}

/**
 * Create a mock authentication context for testing.
 */
export function createMockAuthContext(
  overrides: {
    isAuthenticated?: boolean;
    apiKey?: string;
    userId?: string;
    roles?: string[];
    permissions?: string[];
  } = {}
): Context {
  const context = createMockContext({
    get: vi.fn((key: string) => {
      const authData = {
        isAuthenticated: overrides.isAuthenticated ?? true,
        apiKey: overrides.apiKey ?? "test-api-key",
        userId: overrides.userId ?? "test-user-id",
        roles: overrides.roles ?? ["user"],
        permissions: overrides.permissions ?? ["read:own"],
      };
      return authData[key as keyof typeof authData];
    }),
  });

  return context;
}
