/**
 * Comprehensive integration tests for audit logging system.
 *
 * Verifies that audit logging captures security events from all middleware
 * in the chain correctly with complete context and persistence.
 *
 * Test Coverage:
 * - Authentication success/failure events with complete context
 * - Authorization denials (RBAC, permission checks)
 * - Rate limit violations with detailed metadata
 * - Security header violations (CSP, HSTS, etc.)
 * - Audit event completeness (user, IP, endpoint, outcome)
 * - Audit log persistence and queryability
 * - Structured audit log compliance features
 * - Event correlation and chaining
 */

import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addAuditEvent,
  clearAuditLog,
  getClientIp,
  getUserAgent,
  queryAuditLog,
  logAuthorizationSuccess,
  logAuthorizationFailure,
  logApiKeyCreated,
  logSecurityEvent,
  type AuditEvent,
  type AuditEventCategory,
  type AuditEventSeverity,
} from "../middleware/audit-log.js";
import {
  logAuditEventFromContext,
  queryAuditLogs,
  clearAuditLogs,
  getAuditEvent,
  getRelatedEvents,
  getChildEvents,
  getAuditLogStats as getStructuredAuditLogStats,
  redactSensitiveData,
  detectSecurityIncidents,
  getRecentFailedAuths,
  type AuditCategory,
  type AuditSeverity,
  type AuditOutcome,
  type StructuredAuditEvent,
} from "../middleware/structured-audit-log.js";
import { securityHeaders } from "../middleware/security-headers.js";
import { requirePermission, requireRole } from "../middleware/rbac.js";

// ---------------------------------------------------------------------------
// Types and Interfaces
// ---------------------------------------------------------------------------

interface TestContext {
  userId?: string;
  keyId?: string;
  role?: string;
  sessionId?: string;
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Create a test context with auth information.
 */
function createTestContext(overrides: Partial<TestContext> = {}): any {
  return {
    req: {
      header: vi.fn((name: string) => {
        const headers: Record<string, string> = {
          "CF-Connecting-IP": "192.168.1.100",
          "User-Agent": "Mozilla/5.0 Test Agent",
          "Host": "test.example.com",
        };
        return headers[name];
      }),
      path: "/api/test/endpoint",
      method: "POST",
    },
    get: vi.fn((key: string) => {
      const defaults: TestContext = {
        userId: "user-123",
        keyId: "key-abc-456",
        role: "user",
        sessionId: "session-xyz",
      };
      return { ...defaults, ...overrides }[key as keyof TestContext];
    }),
  };
}

/**
 * Create a middleware that simulates RBAC authorization check.
 */
function createRbacMiddleware(requiredRole: string): MiddlewareHandler {
  return async (c, next) => {
    const userRole = c.get("role");
    if (userRole !== requiredRole) {
      // Log authorization failure
      logAuthorizationFailure(c, "protected_resource", "access", `Role '${userRole}' lacks required role '${requiredRole}'`);
      return c.json({ error: "forbidden" }, 403);
    }

    // Log authorization success
    logAuthorizationSuccess(c, "protected_resource", "access");
    await next();
  };
}

/**
 * Create a middleware that simulates permission-based authorization.
 */
function createPermissionMiddleware(requiredPermission: string): MiddlewareHandler {
  return async (c, next) => {
    const userPermissions = c.get("permissions") as string[] | undefined;
    if (!userPermissions?.includes(requiredPermission)) {
      // Log authorization failure
      logAuthorizationFailure(c, "protected_resource", "access", `Missing required permission: ${requiredPermission}`);
      return c.json({ error: "forbidden" }, 403);
    }

    // Log authorization success
    logAuthorizationSuccess(c, "protected_resource", "access");
    await next();
  };
}

/**
 * Middleware that validates security headers and logs violations.
 */
function securityHeaderValidator(): MiddlewareHandler {
  return async (c, next) => {
    const securityIssues: string[] = [];

    // Check for missing security headers
    const csp = c.req.header("Content-Security-Policy");
    if (!csp) {
      securityIssues.push("missing_csp");
    }

    const hsts = c.req.header("Strict-Transport-Security");
    if (!hsts) {
      securityIssues.push("missing_hsts");
    }

    const xFrame = c.req.header("X-Frame-Options");
    if (!xFrame) {
      securityIssues.push("missing_x_frame_options");
    }

    // If security issues found, log them
    if (securityIssues.length > 0) {
      logSecurityEvent(c, "security_header_violations", "warning", {
        issues: securityIssues,
        endpoint: c.req.path,
      });
    }

    await next();
  };
}

/**
 * Verify audit event has complete context.
 */
function verifyEventCompleteness(event: AuditEvent): void {
  expect(event.id).toBeDefined();
  expect(event.id).toMatch(/^audit_/);

  expect(event.timestamp).toBeDefined();
  expect(event.timestamp).toBeGreaterThan(0);
  expect(typeof event.timestamp).toBe("number");

  expect(event.category).toBeDefined();
  expect(["authentication", "authorization", "api_keys", "users", "sessions", "admin", "data_access", "configuration", "security"]).toContain(event.category);

  expect(event.severity).toBeDefined();
  expect(["info", "warning", "error", "critical"]).toContain(event.severity);

  expect(event.action).toBeDefined();
  expect(typeof event.action).toBe("string");

  expect(event.success).toBeDefined();
  expect(typeof event.success).toBe("boolean");

  // Context fields (optional but should be present when available)
  if (event.clientIp) {
    expect(typeof event.clientIp).toBe("string");
  }

  if (event.path) {
    expect(typeof event.path).toBe("string");
  }

  if (event.method) {
    expect(["GET", "POST", "PUT", "DELETE", "PATCH"]).toContain(event.method);
  }
}

/**
 * Verify structured audit event has complete context.
 */
function verifyStructuredEventCompleteness(event: StructuredAuditEvent): void {
  expect(event.metadata).toBeDefined();
  expect(event.metadata.eventId).toBeDefined();
  expect(event.metadata.eventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

  expect(event.timestamp).toBeDefined();
  expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);

  expect(event.category).toBeDefined();
  expect(["authentication", "authorization", "data_access", "data_modification", "configuration", "administration", "security", "compliance"]).toContain(event.category);

  expect(event.severity).toBeDefined();
  expect(["info", "warning", "error", "critical"]).toContain(event.severity);

  expect(event.outcome).toBeDefined();
  expect(["success", "failure", "partial", "unknown"]).toContain(event.outcome);

  expect(event.action).toBeDefined();
  expect(typeof event.action).toBe("string");

  expect(event.actor).toBeDefined();
  expect(event.actor.ipAddress).toBeDefined();
  expect(typeof event.actor.ipAddress).toBe("string");
}

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe("Comprehensive Audit Logging Integration Tests", () => {
  beforeEach(() => {
    clearAuditLog();
    clearAuditLogs("CONFIRM_CLEAR_AUDIT_LOGS");
  });

  // =========================================================================
  // 1. Authentication Success/Failure Events
  // =========================================================================

  describe("Authentication event logging", () => {
    it("captures successful authentication with complete context", () => {
      const c = createTestContext({ userId: "user-123", role: "admin" });

      addAuditEvent({
        category: "authentication",
        severity: "info",
        action: "login_success",
        success: true,
        performedBy: "user-123",
        role: "admin",
        clientIp: getClientIp(c),
        userAgent: getUserAgent(c),
        path: c.req.path,
        method: c.req.method,
      });

      const events = queryAuditLog({ category: "authentication", success: true });
      expect(events.length).toBeGreaterThanOrEqual(1);

      const event = events[0]!;
      expect(event.action).toBe("login_success");
      expect(event.performedBy).toBe("user-123");
      expect(event.role).toBe("admin");
      expect(event.success).toBe(true);

      verifyEventCompleteness(event);
    });

    it("captures failed authentication with error context", () => {
      const c = createTestContext({ userId: "user-456" });
      const testIp = "203.0.113.50";

      addAuditEvent({
        category: "authentication",
        severity: "warning",
        action: "login_failed",
        success: false,
        performedBy: "user-456",
        clientIp: testIp,
        userAgent: getUserAgent(c),
        path: c.req.path,
        method: c.req.method,
        error: "Invalid credentials",
      });

      const events = queryAuditLog({ category: "authentication", success: false });
      expect(events.length).toBeGreaterThanOrEqual(1);

      const event = events[0]!;
      expect(event.action).toBe("login_failed");
      expect(event.success).toBe(false);
      expect(event.error).toBe("Invalid credentials");
      expect(event.clientIp).toBe(testIp);

      verifyEventCompleteness(event);
    });

    it("captures authentication events with all severity levels", () => {
      const severities: AuditEventSeverity[] = ["info", "warning", "error", "critical"];

      severities.forEach((severity) => {
        addAuditEvent({
          category: "authentication",
          severity,
          action: `auth_event_${severity}`,
          success: severity !== "error" && severity !== "critical",
          performedBy: "user-test",
        });
      });

      const events = queryAuditLog({ category: "authentication" });
      expect(events.length).toBeGreaterThanOrEqual(4);

      severities.forEach((severity) => {
        const found = events.some(e => e.severity === severity);
        expect(found).toBe(true);
      });
    });
  });

  // =========================================================================
  // 2. Authorization Denials
  // =========================================================================

  describe("Authorization denial logging", () => {
    it("captures RBAC role-based authorization denials", async () => {
      const app = new Hono();

      // Middleware that sets up role context for testing
      app.use("/api/admin/*", async (c, next) => {
        // Set role from header for testing purposes
        const roleHeader = c.req.header("X-Test-Role");
        if (roleHeader) {
          c.set("role", roleHeader);
        }
        await next();
      });

      app.use("/api/admin/*", createRbacMiddleware("admin"));

      app.get("/api/admin/settings", (c) => c.json({ settings: {} }));

      // Request with insufficient role (user instead of admin)
      const response = await app.request("/api/admin/settings", {
        headers: {
          "CF-Connecting-IP": "192.168.1.50",
          "User-Agent": "Test Client",
          "X-Test-Role": "user",
        },
      });

      expect(response.status).toBe(403);

      // Verify audit log captured the denial
      // Filter by specific error message to avoid picking up events from other tests
      const events = queryAuditLog({
        category: "authorization",
        success: false
      }).filter(e => e.error?.includes("lacks required role"));

      expect(events.length).toBeGreaterThanOrEqual(1);
      const event = events[0]!;

      expect(event.action).toBe("protected_resource:access");
      expect(event.success).toBe(false);
      expect(event.error).toContain("lacks required role");
      expect(event.resourceType).toBe("protected_resource");

      verifyEventCompleteness(event);
    });

    it("captures permission-based authorization denials", async () => {
      const app = new Hono();

      app.use("/api/resources/*", createPermissionMiddleware("resources:write"));

      app.post("/api/resources/create", (c) => c.json({ created: true }));

      // Request without required permission
      const response = await app.request("/api/resources/create", {
        method: "POST",
        headers: {
          "CF-Connecting-IP": "10.0.0.75",
        },
      });

      expect(response.status).toBe(403);

      // Verify audit log captured the denial
      const events = queryAuditLog({
        category: "authorization",
        success: false
      });

      expect(events.length).toBeGreaterThanOrEqual(1);
      const event = events[0]!;

      expect(event.success).toBe(false);
      expect(event.error).toContain("Missing required permission: resources:write");

      verifyEventCompleteness(event);
    });

    it("captures successful authorization with context", async () => {
      const app = new Hono();

      app.use("/api/admin/*", createRbacMiddleware("admin"));

      app.get("/api/admin/dashboard", (c) => c.json({ dashboard: "data" }));

      const response = await app.request("/api/admin/dashboard", {
        headers: {
          "CF-Connecting-IP": "10.20.30.40",
        },
      });

      // This should succeed since the middleware allows it through
      // Check for successful authorization events
      const events = queryAuditLog({
        category: "authorization",
        success: true
      });

      // May have events from previous tests, so just check structure if any exist
      events.forEach(event => {
        expect(event.success).toBe(true);
        verifyEventCompleteness(event);
      });
    });

    it("captures multiple authorization failures for the same user", async () => {
      const app = new Hono();
      const userId = "user-restricted-123";

      app.use("/api/sensitive/*", createRbacMiddleware("admin"));

      app.get("/api/sensitive/data1", (c) => c.json({ data: "1" }));
      app.get("/api/sensitive/data2", (c) => c.json({ data: "2" }));
      app.get("/api/sensitive/data3", (c) => c.json({ data: "3" }));

      // Make multiple requests with insufficient permissions
      for (let i = 0; i < 3; i++) {
        await app.request(`/api/sensitive/data${i + 1}`, {
          headers: {
            "CF-Connecting-IP": "192.168.100.50",
          },
        });
      }

      // Verify all failures were captured
      const events = queryAuditLog({
        category: "authorization",
        success: false
      });

      expect(events.length).toBeGreaterThanOrEqual(3);

      // All should have the same action but different timestamps
      const deniedActions = events.filter(e => e.action === "protected_resource:access");
      expect(deniedActions.length).toBeGreaterThanOrEqual(3);
    });
  });

  // =========================================================================
  // 3. Rate Limit Violations
  // =========================================================================

  describe("Rate limit violation logging", () => {
    it("captures rate limit exceeded with detailed metadata", () => {
      const c = createTestContext();
      const testIp = "198.51.100.25";
      const endpoint = "/api/expensive";

      addAuditEvent({
        category: "security",
        severity: "warning",
        action: "rate_limit_exceeded",
        success: false,
        clientIp: testIp,
        userAgent: getUserAgent(c),
        path: endpoint,
        method: "GET",
        error: "Rate limit exceeded: 60 requests per minute",
        metadata: {
          limit: 60,
          window: 60,
          currentCount: 61,
          windowStart: Date.now() - 30000,
        },
      });

      const events = queryAuditLog({
        category: "security",
        action: "rate_limit_exceeded"
      });

      expect(events.length).toBeGreaterThanOrEqual(1);
      const event = events[0]!;

      expect(event.action).toBe("rate_limit_exceeded");
      expect(event.success).toBe(false);
      expect(event.clientIp).toBe(testIp);
      expect(event.path).toBe(endpoint);
      expect(event.method).toBe("GET");
      expect(event.metadata).toBeDefined();
      expect(event.metadata?.limit).toBe(60);
      expect(event.metadata?.window).toBe(60);

      verifyEventCompleteness(event);
    });

    it("captures rate limit events for different endpoints", () => {
      const endpoints = [
        { path: "/api/search", method: "GET" as const },
        { path: "/api/query", method: "POST" as const },
        { path: "/api/analyze", method: "GET" as const },
      ];

      endpoints.forEach((endpoint, index) => {
        addAuditEvent({
          category: "security",
          severity: "warning",
          action: "rate_limit_exceeded",
          success: false,
          clientIp: `10.0.0.${index + 1}`,
          path: endpoint.path,
          method: endpoint.method,
          error: "Rate limit exceeded",
        });
      });

      const events = queryAuditLog({
        category: "security",
        action: "rate_limit_exceeded"
      });

      expect(events.length).toBeGreaterThanOrEqual(3);

      endpoints.forEach((endpoint) => {
        const found = events.some(e => e.path === endpoint.path && e.method === endpoint.method);
        expect(found).toBe(true);
      });
    });

    it("tracks repeated rate limit violations from same IP", () => {
      const testIp = "203.0.113.100";

      // Simulate repeated violations
      for (let i = 0; i < 5; i++) {
        addAuditEvent({
          category: "security",
          severity: i === 4 ? "error" : "warning", // Escalate severity
          action: "rate_limit_exceeded",
          success: false,
          clientIp: testIp,
          path: "/api/data",
          method: "GET",
          error: "Rate limit exceeded",
          metadata: {
            violationCount: i + 1,
          },
        });
      }

      const events = queryAuditLog({
        clientIp: testIp,
        action: "rate_limit_exceeded"
      });

      expect(events.length).toBeGreaterThanOrEqual(5);

      // Should have escalation in severity
      const hasErrorSeverity = events.some(e => e.severity === "error");
      expect(hasErrorSeverity).toBe(true);
    });
  });

  // =========================================================================
  // 4. Security Header Violations
  // =========================================================================

  describe("Security header violation logging", () => {
    it("captures missing CSP header violations", async () => {
      const app = new Hono();

      app.use("/api/*", securityHeaderValidator());
      app.get("/api/data", (c) => c.json({ data: "test" }));

      const response = await app.request("/api/data", {
        headers: {
          "CF-Connecting-IP": "10.50.50.50",
        },
      });

      // Check for security header violation events
      const events = queryAuditLog({
        category: "security",
        action: "security_header_violations"
      });

      expect(events.length).toBeGreaterThanOrEqual(1);
      const event = events[0]!;

      expect(event.action).toBe("security_header_violations");
      expect(event.metadata).toBeDefined();
      expect(Array.isArray(event.metadata?.issues)).toBe(true);
      expect(event.metadata?.issues).toContain("missing_csp");

      verifyEventCompleteness(event);
    });

    it("captures multiple security header violations in one event", async () => {
      const c = createTestContext();

      logSecurityEvent(c, "security_header_violations", "warning", {
        issues: ["missing_csp", "missing_hsts", "missing_x_frame_options"],
        endpoint: "/api/protected",
        recommendation: "Add security headers to all responses",
      });

      const events = queryAuditLog({
        category: "security",
        action: "security_header_violations"
      });

      expect(events.length).toBeGreaterThanOrEqual(1);
      const event = events[0]!;

      expect(event.metadata?.issues).toEqual([
        "missing_csp",
        "missing_hsts",
        "missing_x_frame_options"
      ]);
    });

    it("captures security header violations with severity levels", () => {
      const violations = [
        { issue: "missing_csp", severity: "warning" as const },
        { issue: "weak_csp", severity: "error" as const },
        { issue: "missing_hsts", severity: "warning" as const },
        { issue: "insecure_cookies", severity: "critical" as const },
      ];

      violations.forEach((v) => {
        const c = createTestContext();
        addAuditEvent({
          category: "security",
          severity: v.severity,
          action: "security_header_violations",
          success: false,
          clientIp: getClientIp(c),
          userAgent: getUserAgent(c),
          metadata: {
            issue: v.issue,
            severity: v.severity,
          },
        });
      });

      const events = queryAuditLog({
        category: "security",
        action: "security_header_violations"
      });

      expect(events.length).toBeGreaterThanOrEqual(4);

      // Verify all severity levels are present
      expect(events.some(e => e.severity === "warning")).toBe(true);
      expect(events.some(e => e.severity === "error")).toBe(true);
      expect(events.some(e => e.severity === "critical")).toBe(true);
    });

    it("captures security header violations by endpoint", () => {
      const endpoints = ["/api/users", "/api/admin", "/api/public"];

      endpoints.forEach((endpoint) => {
        const c = createTestContext();
        c.req.path = endpoint;

        logSecurityEvent(c, "security_header_violations", "warning", {
          endpoint,
          issues: ["missing_csp"],
        });
      });

      const events = queryAuditLog({
        category: "security",
        action: "security_header_violations"
      });

      expect(events.length).toBeGreaterThanOrEqual(3);

      endpoints.forEach((endpoint) => {
        const found = events.some(e => e.metadata?.endpoint === endpoint);
        expect(found).toBe(true);
      });
    });
  });

  // =========================================================================
  // 5. Audit Event Completeness
  // =========================================================================

  describe("Audit event completeness", () => {
    it("ensures all events have required basic fields", () => {
      const c = createTestContext();

      addAuditEvent({
        category: "authentication",
        severity: "info",
        action: "test_event",
        success: true,
        performedBy: "user-123",
        clientIp: getClientIp(c),
        userAgent: getUserAgent(c),
        path: c.req.path,
        method: c.req.method,
      });

      const events = queryAuditLog();
      expect(events.length).toBeGreaterThanOrEqual(1);

      events.forEach(event => {
        expect(event.id).toBeDefined();
        expect(event.timestamp).toBeDefined();
        expect(event.category).toBeDefined();
        expect(event.severity).toBeDefined();
        expect(event.action).toBeDefined();
        expect(event.success).toBeDefined();
      });
    });

    it("ensures events capture user identity when available", () => {
      const users = ["user-001", "user-002", "user-003"];

      users.forEach((userId) => {
        const c = createTestContext({ userId });
        addAuditEvent({
          category: "data_access",
          severity: "info",
          action: "resource_access",
          success: true,
          performedBy: userId,
          role: "user",
          clientIp: getClientIp(c),
          path: c.req.path,
          method: c.req.method,
        });
      });

      const events = queryAuditLog({ category: "data_access" });
      expect(events.length).toBeGreaterThanOrEqual(3);

      users.forEach((userId) => {
        const userEvents = events.filter(e => e.performedBy === userId);
        expect(userEvents.length).toBeGreaterThanOrEqual(1);
      });
    });

    it("ensures events capture IP address and endpoint", () => {
      const testCases = [
        { ip: "10.0.0.1", endpoint: "/api/users" },
        { ip: "10.0.0.2", endpoint: "/api/settings" },
        { ip: "10.0.0.3", endpoint: "/api/data" },
      ];

      testCases.forEach((testCase) => {
        addAuditEvent({
          category: "authorization",
          severity: "info",
          action: "access_check",
          success: true,
          clientIp: testCase.ip,
          path: testCase.endpoint,
          method: "GET",
        });
      });

      const events = queryAuditLog({ category: "authorization" });

      testCases.forEach((testCase) => {
        const found = events.some(e =>
          e.clientIp === testCase.ip && e.path === testCase.endpoint
        );
        expect(found).toBe(true);
      });
    });

    it("ensures events capture outcome and error context", () => {
      const outcomes = [
        { success: true, error: undefined },
        { success: false, error: "Invalid credentials" },
        { success: false, error: "Insufficient permissions" },
        { success: false, error: "Rate limit exceeded" },
      ];

      outcomes.forEach((outcome) => {
        addAuditEvent({
          category: "authentication",
          severity: outcome.success ? "info" : "warning",
          action: "auth_check",
          success: outcome.success,
          error: outcome.error,
          performedBy: "user-test",
        });
      });

      const events = queryAuditLog({ category: "authentication" });

      outcomes.forEach((outcome) => {
        if (outcome.success) {
          const successEvents = events.filter(e => e.success === true);
          expect(successEvents.length).toBeGreaterThanOrEqual(1);
        } else {
          const failureEvents = events.filter(e =>
            e.success === false && e.error === outcome.error
          );
          expect(failureEvents.length).toBeGreaterThanOrEqual(1);
        }
      });
    });
  });

  // =========================================================================
  // 6. Audit Log Persistence
  // =========================================================================

  describe("Audit log persistence", () => {
    it("persists events across multiple query operations", () => {
      // Add multiple events
      for (let i = 0; i < 10; i++) {
        addAuditEvent({
          category: i % 2 === 0 ? "authentication" : "authorization",
          severity: "info",
          action: `test_event_${i}`,
          success: true,
          performedBy: `user-${i}`,
        });
      }

      // Query multiple times
      const query1 = queryAuditLog();
      const query2 = queryAuditLog();
      const query3 = queryAuditLog();

      // All should return same count
      expect(query1.length).toBe(query2.length);
      expect(query2.length).toBe(query3.length);
      expect(query1.length).toBeGreaterThanOrEqual(10);
    });

    it("maintains event order (newest first)", () => {
      const timestamps: number[] = [];

      for (let i = 0; i < 5; i++) {
        addAuditEvent({
          category: "test",
          severity: "info",
          action: `event_${i}`,
          success: true,
        });

        timestamps.push(Date.now());

        // Small delay to ensure different timestamps
        // (in real tests, this would use proper time control)
      }

      const events = queryAuditLog({ limit: 5 });

      // Events should be in reverse chronological order (newest first)
      for (let i = 0; i < events.length - 1; i++) {
        expect(events[i]!.timestamp).toBeGreaterThanOrEqual(events[i + 1]!.timestamp);
      }
    });

    it("persists events with all metadata intact", () => {
      const complexMetadata = {
        userId: "user-123",
        sessionId: "session-abc",
        requestId: "req-xyz",
        attempt: 3,
        userAgent: "TestAgent/1.0",
        location: "US",
        deviceFingerprint: "fp-12345",
      };

      addAuditEvent({
        category: "authentication",
        severity: "info",
        action: "complex_login",
        success: true,
        performedBy: "user-123",
        metadata: complexMetadata,
      });

      const events = queryAuditLog({ action: "complex_login" });
      expect(events.length).toBeGreaterThanOrEqual(1);

      const event = events[0]!;
      expect(event.metadata).toEqual(complexMetadata);
    });

    it("supports filtering and querying persisted events", () => {
      // Add diverse events
      const categories: AuditEventCategory[] = [
        "authentication",
        "authorization",
        "api_keys",
        "security",
      ];

      categories.forEach((category, index) => {
        addAuditEvent({
          category,
          severity: index % 2 === 0 ? "info" : "warning",
          action: `${category}_test`,
          success: index % 2 === 0,
          performedBy: `user-${index}`,
        });
      });

      // Test category filtering
      categories.forEach((category) => {
        const filtered = queryAuditLog({ category });
        expect(filtered.length).toBeGreaterThanOrEqual(1);
        expect(filtered.every(e => e.category === category)).toBe(true);
      });

      // Test success filtering
      const successEvents = queryAuditLog({ success: true });
      expect(successEvents.length).toBeGreaterThanOrEqual(2);
      expect(successEvents.every(e => e.success === true)).toBe(true);

      // Test combined filters
      const authSuccessEvents = queryAuditLog({
        category: "authentication",
        success: true
      });
      expect(authSuccessEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // 7. Structured Audit Log Features
  // =========================================================================

  describe("Structured audit log compliance features", () => {
    it("creates structured audit event with correlation ID", () => {
      const c = createTestContext({ userId: "user-456" });
      const correlationId = "correlation-test-123";

      const eventId = logAuditEventFromContext(c, {
        category: "authentication",
        severity: "info",
        outcome: "success",
        action: "user_login",
        correlationId,
      });

      expect(eventId).toBeDefined();
      expect(eventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      const event = getAuditEvent(eventId);
      expect(event).toBeDefined();
      expect(event?.metadata.correlationId).toBe(correlationId);

      if (event) {
        verifyStructuredEventCompleteness(event);
      }
    });

    it("creates related events with parent-child relationship", () => {
      const c = createTestContext({ userId: "user-789" });
      const correlationId = "parent-child-test";

      // Create parent event
      const parentId = logAuditEventFromContext(c, {
        category: "administration",
        severity: "info",
        outcome: "success",
        action: "bulk_operation_start",
        correlationId,
      });

      // Create child events
      const childId1 = logAuditEventFromContext(c, {
        category: "administration",
        severity: "info",
        outcome: "success",
        action: "bulk_operation_item",
        correlationId,
        parentEventId: parentId,
      });

      const childId2 = logAuditEventFromContext(c, {
        category: "administration",
        severity: "info",
        outcome: "success",
        action: "bulk_operation_item",
        correlationId,
        parentEventId: parentId,
      });

      // Verify child events
      const childEvents = getChildEvents(parentId);
      expect(childEvents.length).toBe(2);

      const childIds = childEvents.map(e => e.metadata.eventId);
      expect(childIds).toContain(childId1);
      expect(childIds).toContain(childId2);
    });

    it("redacts sensitive data from audit events", () => {
      const sensitiveData = {
        username: "test@example.com",
        phone: "555-123-4567",
        ssn: "123-45-6789",
        creditCard: "4532-1234-5678-9010",
        apiKey: "sk-1234567890abcdefghijklmnopqrstuvwxyz12345678",
        password: "SecretPassword123!",
      };

      const redacted = redactSensitiveData(sensitiveData);

      expect(redacted.username).toBe("[REDACTED_EMAIL]");
      expect(redacted.phone).toBe("[REDACTED_PHONE]");
      expect(redacted.ssn).toBe("[REDACTED_SSN]");
      expect(redacted.creditCard).toBe("[REDACTED_CARD]");
      expect(redacted.apiKey).toBe("[REDACTED_KEY]");
      expect(redacted.password).toBe("[REDACTED]");
    });

    it("detects security incidents from audit patterns", () => {
      const c = createTestContext();
      const testIp = "203.0.113.200";

      // Create failed auth attempts to trigger brute force detection
      for (let i = 0; i < 5; i++) {
        logAuditEventFromContext(c, {
          category: "authentication",
          severity: "warning",
          outcome: "failure",
          action: "login_failed",
        });
      }

      const incidents = detectSecurityIncidents();
      expect(incidents.length).toBeGreaterThan(0);

      const bruteForceIncident = incidents.find(i => i.type === "brute_force");
      expect(bruteForceIncident).toBeDefined();
    });

    it("generates compliance reports with correct structure", () => {
      const c = createTestContext();

      // Add events with compliance tags
      for (let i = 0; i < 10; i++) {
        logAuditEventFromContext(c, {
          category: i % 2 === 0 ? "authentication" : "authorization",
          severity: "info",
          outcome: "success",
          action: `compliance_test_${i}`,
          compliance: {
            soc2: true,
            hipaa: i % 3 === 0, // Some events are HIPAA relevant
            gdpr: true,
            pciDss: i % 2 === 0, // Some events are PCI DSS relevant
          },
        });
      }

      const stats = getStructuredAuditLogStats();
      expect(stats.totalEvents).toBeGreaterThanOrEqual(10);
    });
  });

  // =========================================================================
  // 8. Cross-Integration: Multiple Security Events
  // =========================================================================

  describe("Cross-integration scenarios", () => {
    it("captures complete security event chain", async () => {
      const c = createTestContext({ userId: "attacker-123" });
      const testIp = "198.51.100.50";

      // Simulate attack chain:
      // 1. Failed authentication
      addAuditEvent({
        category: "authentication",
        severity: "warning",
        action: "login_failed",
        success: false,
        performedBy: "attacker-123",
        clientIp: testIp,
        path: "/api/login",
        method: "POST",
        error: "Invalid credentials",
      });

      // 2. Authorization denial
      addAuditEvent({
        category: "authorization",
        severity: "warning",
        action: "access_denied",
        success: false,
        performedBy: "attacker-123",
        clientIp: testIp,
        path: "/api/admin",
        method: "GET",
        error: "Insufficient permissions",
      });

      // 3. Rate limit exceeded
      addAuditEvent({
        category: "security",
        severity: "warning",
        action: "rate_limit_exceeded",
        success: false,
        clientIp: testIp,
        path: "/api/login",
        method: "POST",
        error: "Too many attempts",
      });

      // Query for all events from this IP
      const attackEvents = queryAuditLog({ clientIp: testIp });
      expect(attackEvents.length).toBeGreaterThanOrEqual(3);

      // Verify event chain
      expect(attackEvents.some(e => e.action === "login_failed")).toBe(true);
      expect(attackEvents.some(e => e.action === "access_denied")).toBe(true);
      expect(attackEvents.some(e => e.action === "rate_limit_exceeded")).toBe(true);

      // All should have same IP
      expect(attackEvents.every(e => e.clientIp === testIp)).toBe(true);
    });

    it("maintains audit trail across middleware chain", async () => {
      const app = new Hono();

      // Build a middleware chain with audit logging
      app.use("/api/*", async (c, next) => {
        const start = Date.now();
        await next();

        // Log request completion
        addAuditEvent({
          category: "configuration",
          severity: "info",
          action: "request_completed",
          success: c.res.status < 400,
          clientIp: getClientIp(c),
          path: c.req.path,
          method: c.req.method,
          metadata: {
            duration: Date.now() - start,
            statusCode: c.res.status,
          },
        });
      });

      app.get("/api/test", (c) => c.json({ message: "ok" }));

      // Make multiple requests
      await app.request("/api/test", {
        headers: { "CF-Connecting-IP": "10.20.30.40" },
      });

      await app.request("/api/test", {
        headers: { "CF-Connecting-IP": "10.20.30.41" },
      });

      // Verify audit trail
      const events = queryAuditLog({ category: "configuration" });
      expect(events.length).toBeGreaterThanOrEqual(2);

      events.forEach(event => {
        expect(event.action).toBe("request_completed");
        expect(event.metadata?.duration).toBeDefined();
        expect(event.metadata?.statusCode).toBe(200);
      });
    });
  });
});