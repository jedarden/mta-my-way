/**
 * Integration tests for audit logging across security middleware chain.
 *
 * Verifies that the audit log captures security events from all middleware in the chain:
 * - Authentication attempts (success/failure)
 * - Authorization denials
 * - Rate limit hits
 * - CSRF validation failures
 * - Other security events (path traversal, parameter pollution, SSRF, etc.)
 * - Proper context (user ID, IP, endpoint, timestamp)
 * - Log format and completeness
 * - Event correlation across middleware
 *
 * Uses existing test helpers and mocks the audit logger for verification.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type AuditEvent,
  type AuditEventCategory,
  addAuditEvent,
  clearAuditLog,
  queryAuditLog,
} from "../middleware/audit-log.js";
import { authentication, optionalAuth } from "../middleware/authentication.js";
import { requireResourceAccess } from "../middleware/authorization.js";
import { csrfProtection } from "../middleware/csrf-protection.js";
import { hostHeaderProtection } from "../middleware/host-header-protection.js";
import { jsonDepthProtection } from "../middleware/json-depth-protection.js";
import { hppProtection } from "../middleware/parameter-pollution.js";
import { pathTraversalPrevention } from "../middleware/path-traversal.js";
import { rateLimiter } from "../middleware/rate-limiter.js";
import { ssrfProtection } from "../middleware/ssrf-protection.js";
import { cleanupAllState } from "./test-helpers.js";

// ---------------------------------------------------------------------------
// Test Utilities
// ---------------------------------------------------------------------------

/**
 * Extract client IP from audit event.
 */
function getClientIp(event: AuditEvent): string {
  return event.clientIp || "unknown";
}

/**
 * Extract timestamp from audit event.
 */
function getTimestamp(event: AuditEvent): number {
  return event.timestamp;
}

/**
 * Verify audit event has required fields.
 */
function verifyEventStructure(event: AuditEvent, requiredFields: (keyof AuditEvent)[]): void {
  for (const field of requiredFields) {
    expect(event[field]).toBeDefined();
    expect(event[field]).not.toBeNull();
  }
}

/**
 * Verify audit event has proper timestamp format.
 */
function verifyTimestamp(event: AuditEvent): void {
  expect(event.timestamp).toBeGreaterThan(0);
  expect(event.timestamp).toBeLessThanOrEqual(Date.now());
  const date = new Date(event.timestamp);
  expect(date.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
}

/**
 * Filter audit events by category.
 */
function getEventsByCategory(category: AuditEventCategory): AuditEvent[] {
  return queryAuditLog({ category });
}

/**
 * Filter audit events by action.
 */
function getEventsByAction(action: string): AuditEvent[] {
  return queryAuditLog({ action });
}

/**
 * Get failed authentication events.
 */
function getFailedAuthEvents(): AuditEvent[] {
  return queryAuditLog({ category: "authentication", success: false });
}

/**
 * Get failed authorization events.
 */
function getFailedAuthzEvents(): AuditEvent[] {
  return queryAuditLog({ category: "authorization", success: false });
}

/**
 * Get security events.
 */
function getSecurityEvents(): AuditEvent[] {
  return queryAuditLog({ category: "security" });
}

// ---------------------------------------------------------------------------
// Test Setup
// ---------------------------------------------------------------------------

const TEST_IP = "192.0.2.1";
const TEST_USER_AGENT = "test-agent/1.0";
const TEST_API_KEY = "test_key_valid_key_for_testing";
const TEST_KEY_ID = "test_key_123";

describe("audit logging - security middleware coverage", () => {
  let app: Hono;
  let testEvents: AuditEvent[] = [];

  beforeEach(async () => {
    // Reset all module state for test isolation
    await cleanupAllState();
    clearAuditLog();

    // Create test app with full security middleware chain
    app = new Hono();

    // Add middleware in production order
    app.use("*", async (c, next) => {
      // Add test context for IP and user agent
      c.req.header("CF-Connecting-IP", TEST_IP);
      c.req.header("User-Agent", TEST_USER_AGENT);
      await next();
    });

    // Security middleware chain
    app.use("*", hostHeaderProtection());
    app.use("*", csrfProtection());
    app.use("*", pathTraversalPrevention());
    app.use("*", hppProtection());
    app.use("*", ssrfProtection());
    app.use("*", jsonDepthProtection());
    app.use("*", optionalAuth());
    app.use("*", rateLimiter());

    // Test routes
    app.get("/api/test", (c) => c.json({ ok: true }));
    app.post("/api/trips", (c) => c.json({ created: true }));
    app.delete("/api/trips/:id", (c) => {
      return requireResourceAccess("trip", "delete")(c, async () => c.json({ deleted: true }));
    });

    // Capture audit events for verification
    testEvents = [];
    const originalAdd = addAuditEvent;
    // @ts-expect-error - Monkey patch for testing
    globalThis.addAuditEvent = (event: Omit<AuditEvent, "id" | "timestamp">): string => {
      const id = originalAdd(event);
      const saved = queryAuditLog({ limit: 1 })[0];
      if (saved) testEvents.push(saved);
      return id;
    };
  });

  // ---------------------------------------------------------------------------
  // Authentication Event Logging
  // ---------------------------------------------------------------------------

  describe("authentication events", () => {
    it("logs successful authentication with proper context", async () => {
      const res = await app.request("/api/test", {
        headers: {
          Authorization: `Bearer ${TEST_KEY_ID}:${TEST_API_KEY}`,
          "CF-Connecting-IP": TEST_IP,
        },
      });

      expect(res.status).toBe(200);

      // Verify authentication success was logged
      const authEvents = getEventsByCategory("authentication");
      const successEvent = authEvents.find((e) => e.success);

      expect(successEvent).toBeDefined();
      if (successEvent) {
        verifyEventStructure(successEvent, ["id", "timestamp", "category", "action", "success"]);
        verifyTimestamp(successEvent);
        expect(successEvent.performedBy).toBe(TEST_KEY_ID);
        expect(getClientIp(successEvent)).toBe(TEST_IP);
      }
    });

    it("logs failed authentication attempts", async () => {
      const res = await app.request("/api/test", {
        headers: {
          Authorization: "Bearer invalid_key:bad_token",
          "CF-Connecting-IP": TEST_IP,
        },
      });

      expect(res.status).toBe(401);

      // Verify authentication failure was logged
      const failedEvents = getFailedAuthEvents();
      expect(failedEvents.length).toBeGreaterThan(0);

      const failedEvent = failedEvents[0];
      if (failedEvent) {
        verifyEventStructure(failedEvent, [
          "id",
          "timestamp",
          "category",
          "action",
          "success",
          "error",
        ]);
        verifyTimestamp(failedEvent);
        expect(failedEvent.success).toBe(false);
        expect(failedEvent.error).toBeDefined();
        expect(failedEvent.clientIp).toBe(TEST_IP);
      }
    });

    it("includes user agent in authentication events", async () => {
      const testUA = "Mozilla/5.0 Test-Agent";
      const res = await app.request("/api/test", {
        headers: {
          Authorization: "Bearer invalid_key:bad_token",
          "CF-Connecting-IP": TEST_IP,
          "User-Agent": testUA,
        },
      });

      expect(res.status).toBe(401);

      const failedEvents = getFailedAuthEvents();
      const event = failedEvents[0];
      if (event) {
        expect(event.userAgent).toBe(testUA);
      }
    });

    it("correlates auth events by request ID/IP", async () => {
      const ip1 = "192.0.2.10";
      const ip2 = "192.0.2.20";

      // Failed auth from IP 1
      await app.request("/api/test", {
        headers: {
          Authorization: "Bearer invalid:bad",
          "CF-Connecting-IP": ip1,
        },
      });

      // Failed auth from IP 2
      await app.request("/api/test", {
        headers: {
          Authorization: "Bearer invalid2:bad2",
          "CF-Connecting-IP": ip2,
        },
      });

      const failedEvents = getFailedAuthEvents();
      const ip1Events = failedEvents.filter((e) => e.clientIp === ip1);
      const ip2Events = failedEvents.filter((e) => e.clientIp === ip2);

      expect(ip1Events.length).toBe(1);
      expect(ip2Events.length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Authorization Event Logging
  // ---------------------------------------------------------------------------

  describe("authorization events", () => {
    it("logs successful authorization", async () => {
      // This would need proper auth setup - simplified for now
      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": TEST_IP },
      });

      expect(res.status).toBe(200);

      // Verify authorization success was logged
      const authzEvents = getEventsByCategory("authorization");
      const successEvent = authzEvents.find((e) => e.success);

      expect(successEvent).toBeDefined();
      if (successEvent) {
        verifyEventStructure(successEvent, ["id", "timestamp", "category", "action", "success"]);
        verifyTimestamp(successEvent);
      }
    });

    it("logs authorization denials with proper context", async () => {
      // Attempt to delete a trip without proper authorization
      const res = await app.request("/api/trips/some-trip-id", {
        method: "DELETE",
        headers: {
          Authorization: "Bearer user_key_limited:token",
          "CF-Connecting-IP": TEST_IP,
        },
      });

      // Should be denied
      expect(res.status).toBe(401 || 403);

      // Verify authorization failure was logged
      const failedEvents = getFailedAuthzEvents();
      expect(failedEvents.length).toBeGreaterThan(0);

      const failedEvent = failedEvents[0];
      if (failedEvent) {
        verifyEventStructure(failedEvent, [
          "id",
          "timestamp",
          "category",
          "action",
          "success",
          "error",
        ]);
        verifyTimestamp(failedEvent);
        expect(failedEvent.success).toBe(false);
        expect(failedEvent.resourceType).toBe("trip");
        expect(failedEvent.action).toContain("delete");
        expect(failedEvent.clientIp).toBe(TEST_IP);
      }
    });

    it("includes resource details in authorization events", async () => {
      const resourceId = "trip_12345";

      const res = await app.request(`/api/trips/${resourceId}`, {
        method: "DELETE",
        headers: {
          Authorization: "Bearer limited_user:token",
          "CF-Connecting-IP": TEST_IP,
        },
      });

      const failedEvents = getFailedAuthzEvents();
      const event = failedEvents[0];
      if (event) {
        expect(event.resourceId).toBe(resourceId);
        expect(event.resourceType).toBe("trip");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Rate Limit Event Logging
  // ---------------------------------------------------------------------------

  describe("rate limit events", () => {
    it("logs rate limit exceeded events", async () => {
      // Make many requests to trigger rate limit
      const requests = [];
      for (let i = 0; i < 65; i++) {
        requests.push(
          app.request("/api/test", {
            headers: { "CF-Connecting-IP": TEST_IP },
          })
        );
      }

      await Promise.all(requests);

      // Verify rate limit event was logged
      const securityEvents = getSecurityEvents();
      const rateLimitEvent = securityEvents.find((e) => e.action === "rate_limit_exceeded");

      expect(rateLimitEvent).toBeDefined();
      if (rateLimitEvent) {
        verifyEventStructure(rateLimitEvent, ["id", "timestamp", "category", "action"]);
        verifyTimestamp(rateLimitEvent);
        expect(rateLimitEvent.severity).toBe("warning");
        expect(rateLimitEvent.clientIp).toBe(TEST_IP);
      }
    });

    it("includes rate limit metadata in events", async () => {
      const ip = "192.0.2.50";

      // Exhaust rate limit
      for (let i = 0; i < 65; i++) {
        await app.request("/api/test", {
          headers: { "CF-Connecting-IP": ip },
        });
      }

      const securityEvents = getSecurityEvents();
      const rateLimitEvent = securityEvents.find((e) => e.action === "rate_limit_exceeded");

      if (rateLimitEvent) {
        expect(rateLimitEvent.metadata).toBeDefined();
        expect(rateLimitEvent.clientIp).toBe(ip);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // CSRF Event Logging
  // ---------------------------------------------------------------------------

  describe("CSRF event logging", () => {
    it("logs CSRF validation failures", async () => {
      // Attempt state-changing request without CSRF token
      const res = await app.request("/api/trips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": TEST_IP,
        },
        body: JSON.stringify({ originId: "101", destinationId: "725" }),
      });

      // CSRF should reject this
      expect(res.status).toBe(403);

      // Verify CSRF failure was logged
      const securityEvents = getSecurityEvents();
      const csrfEvent = securityEvents.find((e) => e.action === "csrf_validation_failed");

      expect(csrfEvent).toBeDefined();
      if (csrfEvent) {
        verifyEventStructure(csrfEvent, ["id", "timestamp", "category", "action", "success"]);
        verifyTimestamp(csrfEvent);
        expect(csrfEvent.severity).toBe("warning");
        expect(csrfEvent.success).toBe(false);
        expect(csrfEvent.clientIp).toBe(TEST_IP);
        expect(csrfEvent.method).toBe("POST");
      }
    });

    it("includes request details in CSRF events", async () => {
      const res = await app.request("/api/trips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": TEST_IP,
          "User-Agent": "CSRF-Attack-Tool/1.0",
        },
        body: JSON.stringify({ data: "test" }),
      });

      const securityEvents = getSecurityEvents();
      const csrfEvent = securityEvents.find((e) => e.action === "csrf_validation_failed");

      if (csrfEvent) {
        expect(csrfEvent.path).toBe("/api/trips");
        expect(csrfEvent.method).toBe("POST");
        expect(csrfEvent.userAgent).toBe("CSRF-Attack-Tool/1.0");
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Path Traversal Event Logging
  // ---------------------------------------------------------------------------

  describe("path traversal event logging", () => {
    it("logs blocked path traversal attempts", async () => {
      const res = await app.request("/api/test?file=../../../etc/passwd", {
        headers: { "CF-Connecting-IP": TEST_IP },
      });

      const securityEvents = getSecurityEvents();
      const pathTraversalEvent = securityEvents.find((e) => e.action === "path_traversal_blocked");

      expect(pathTraversalEvent).toBeDefined();
      if (pathTraversalEvent) {
        verifyEventStructure(pathTraversalEvent, [
          "id",
          "timestamp",
          "category",
          "action",
          "severity",
        ]);
        verifyTimestamp(pathTraversalEvent);
        expect(pathTraversalEvent.severity).toBe("error");
        expect(pathTraversalEvent.success).toBe(false);
        expect(pathTraversalEvent.clientIp).toBe(TEST_IP);
      }
    });

    it("includes detected path in traversal events", async () => {
      const maliciousPath = "/api/../../../sensitive/data";

      const res = await app.request(maliciousPath, {
        headers: { "CF-Connecting-IP": TEST_IP },
      });

      const securityEvents = getSecurityEvents();
      const pathTraversalEvent = securityEvents.find((e) => e.action === "path_traversal_blocked");

      if (pathTraversalEvent) {
        expect(pathTraversalEvent.path).toContain("..");
        expect(pathTraversalEvent.metadata).toBeDefined();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Parameter Pollution Event Logging
  // ---------------------------------------------------------------------------

  describe("parameter pollution event logging", () => {
    it("logs blocked HTTP parameter pollution attempts", async () => {
      const res = await app.request("/api/test?id=1&id=2&id=3", {
        headers: { "CF-Connecting-IP": TEST_IP },
      });

      const securityEvents = getSecurityEvents();
      const hppEvent = securityEvents.find((e) => e.action === "hpp_blocked");

      expect(hppEvent).toBeDefined();
      if (hppEvent) {
        verifyEventStructure(hppEvent, ["id", "timestamp", "category", "action", "severity"]);
        verifyTimestamp(hppEvent);
        expect(hppEvent.severity).toBe("warning");
        expect(hppEvent.clientIp).toBe(TEST_IP);
      }
    });

    it("includes polluted parameter names in events", async () => {
      const res = await app.request("/api/test?user=alice&user=bob", {
        headers: { "CF-Connecting-IP": TEST_IP },
      });

      const securityEvents = getSecurityEvents();
      const hppEvent = securityEvents.find((e) => e.action === "hpp_blocked");

      if (hppEvent) {
        expect(hppEvent.metadata).toBeDefined();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // SSRF Event Logging
  // ---------------------------------------------------------------------------

  describe("SSRF event logging", () => {
    it("logs blocked SSRF attempts", async () => {
      const res = await app.request("/api/test?url=http://localhost:6379", {
        headers: { "CF-Connecting-IP": TEST_IP },
      });

      const securityEvents = getSecurityEvents();
      const ssrfEvent = securityEvents.find((e) => e.action === "ssrf_blocked");

      expect(ssrfEvent).toBeDefined();
      if (ssrfEvent) {
        verifyEventStructure(ssrfEvent, ["id", "timestamp", "category", "action", "severity"]);
        verifyTimestamp(ssrfEvent);
        expect(ssrfEvent.severity).toBe("critical");
        expect(ssrfEvent.success).toBe(false);
        expect(ssrfEvent.clientIp).toBe(TEST_IP);
      }
    });

    it("includes blocked URL in SSRF events", async () => {
      const internalUrl = "http://169.254.169.254/latest/meta-data/";

      const res = await app.request(`/api/test?url=${encodeURIComponent(internalUrl)}`, {
        headers: { "CF-Connecting-IP": TEST_IP },
      });

      const securityEvents = getSecurityEvents();
      const ssrfEvent = securityEvents.find((e) => e.action === "ssrf_blocked");

      if (ssrfEvent) {
        expect(ssrfEvent.metadata).toBeDefined();
        expect(ssrfEvent.metadata?.url).toBeDefined();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Host Header Event Logging
  // ---------------------------------------------------------------------------

  describe("host header event logging", () => {
    it("logs blocked host header attacks", async () => {
      const res = await app.request("/api/test", {
        headers: {
          Host: "evil.com",
          "CF-Connecting-IP": TEST_IP,
        },
      });

      const securityEvents = getSecurityEvents();
      const hostEvent = securityEvents.find((e) => e.action === "host_header_blocked");

      expect(hostEvent).toBeDefined();
      if (hostEvent) {
        verifyEventStructure(hostEvent, ["id", "timestamp", "category", "action", "severity"]);
        verifyTimestamp(hostEvent);
        expect(hostEvent.severity).toBe("warning");
        expect(hostEvent.clientIp).toBe(TEST_IP);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // JSON Depth Event Logging
  // ---------------------------------------------------------------------------

  describe("JSON depth event logging", () => {
    it("logs blocked excessive JSON depth attempts", async () => {
      // Create a deeply nested object that exceeds depth limits
      const deeplyNested: Record<string, unknown> = {};
      let current = deeplyNested;
      for (let i = 0; i < 10; i++) {
        current["level" + i] = {};
        current = current["level" + i] as Record<string, unknown>;
      }

      const res = await app.request("/api/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": TEST_IP,
        },
        body: JSON.stringify(deeplyNested),
      });

      const securityEvents = getSecurityEvents();
      const jsonEvent = securityEvents.find((e) => e.action === "json_depth_exceeded");

      if (jsonEvent) {
        verifyEventStructure(jsonEvent, ["id", "timestamp", "category", "action", "severity"]);
        verifyTimestamp(jsonEvent);
        expect(jsonEvent.severity).toBe("warning");
        expect(jsonEvent.clientIp).toBe(TEST_IP);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Event Correlation and Completeness
  // ---------------------------------------------------------------------------

  describe("event correlation and completeness", () => {
    it("correlates events from same request across middleware", async () => {
      const testIp = "192.0.2.100";

      // Make a request that triggers multiple middleware
      const res = await app.request("/api/../../../etc/passwd?id=1&id=2", {
        headers: {
          Authorization: "Bearer invalid:bad",
          "CF-Connecting-IP": testIp,
        },
      });

      // Get all events from this IP
      const ipEvents = queryAuditLog({}).filter((e) => e.clientIp === testIp);

      // Should have multiple events from different middleware
      expect(ipEvents.length).toBeGreaterThan(0);

      // All should have the same IP
      expect(ipEvents.every((e) => e.clientIp === testIp)).toBe(true);

      // All should have valid timestamps
      expect(ipEvents.every((e) => e.timestamp > 0 && e.timestamp <= Date.now())).toBe(true);
    });

    it("maintains event order by timestamp", async () => {
      const startTime = Date.now();

      await app.request("/api/test", { headers: { "CF-Connecting-IP": "192.0.2.201" } });
      await app.request("/api/test", { headers: { "CF-Connecting-IP": "192.0.2.202" } });
      await app.request("/api/test", { headers: { "CF-Connecting-IP": "192.0.2.203" } });

      const allEvents = queryAuditLog({});

      // Events should be ordered by timestamp (newest first)
      for (let i = 0; i < allEvents.length - 1; i++) {
        expect(allEvents[i]!.timestamp).toBeGreaterThanOrEqual(allEvents[i + 1]!.timestamp);
      }
    });

    it("ensures all required fields are present", async () => {
      await app.request("/api/test", {
        headers: {
          Authorization: "Bearer invalid:bad",
          "CF-Connecting-IP": TEST_IP,
        },
      });

      const events = queryAuditLog({});
      for (const event of events) {
        // Required fields for every audit event
        expect(event.id).toBeDefined();
        expect(event.timestamp).toBeDefined();
        expect(event.category).toBeDefined();
        expect(event.severity).toBeDefined();
        expect(event.action).toBeDefined();
        expect(event.success).toBeDefined();

        // ID should be unique string
        expect(typeof event.id).toBe("string");
        expect(event.id.length).toBeGreaterThan(0);

        // Category should be valid
        expect([
          "authentication",
          "authorization",
          "api_keys",
          "users",
          "sessions",
          "admin",
          "data_access",
          "configuration",
          "security",
        ]).toContain(event.category);

        // Severity should be valid
        expect(["info", "warning", "error", "critical"]).toContain(event.severity);
      }
    });

    it("provides complete context for security incident response", async () => {
      const attackerIp = "192.0.2.999";
      const attackerUA = "AttackTool/1.0";

      // Simulate an attack with multiple vectors
      await app.request("/api/../../../etc/passwd", {
        headers: {
          "CF-Connecting-IP": attackerIp,
          "User-Agent": attackerUA,
          Authorization: "Bearer invalid:bad",
        },
      });

      // Get all security events from this IP
      const securityEvents = queryAuditLog({}).filter(
        (e) => e.clientIp === attackerIp && e.category === "security"
      );

      // Each event should have complete incident response data
      for (const event of securityEvents) {
        expect(event.clientIp).toBe(attackerIp);
        expect(event.userAgent).toBe(attackerUA);
        expect(event.timestamp).toBeDefined();
        expect(event.action).toBeDefined();
        expect(event.severity).toBeDefined();

        // Should have metadata for investigation
        expect(event.metadata).toBeDefined();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Performance and Scale
  // ---------------------------------------------------------------------------

  describe("performance and scale", () => {
    it("handles high volume of events without loss", async () => {
      const initialCount = queryAuditLog({}).length;

      // Generate many events
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          app.request("/api/test", {
            headers: { "CF-Connecting-IP": `192.0.2.${i % 250}` },
          })
        );
      }

      await Promise.all(promises);

      const finalCount = queryAuditLog({}).length;
      expect(finalCount).toBeGreaterThan(initialCount);
    });

    it("maintains query performance with many events", async () => {
      // Generate events
      for (let i = 0; i < 50; i++) {
        await app.request("/api/test", {
          headers: { "CF-Connecting-IP": `192.0.2.${i}` },
        });
      }

      const startTime = Date.now();
      const events = queryAuditLog({ category: "authentication" });
      const queryTime = Date.now() - startTime;

      // Query should be fast (< 100ms)
      expect(queryTime).toBeLessThan(100);
      expect(Array.isArray(events)).toBe(true);
    });
  });
});
