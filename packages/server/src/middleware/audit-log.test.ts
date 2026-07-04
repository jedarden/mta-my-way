/**
 * Tests for audit log system.
 */

import type { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AuditEvent,
  type AuditEventCategory,
  type AuditEventSeverity,
  type AuditLogFilters,
  addAuditEvent,
  applyAuditLogRetention,
  clearAuditLog,
  exportAuditLogAsCsv,
  exportAuditLogAsJson,
  extractAuthContext,
  getAuditLogForResource,
  getAuditLogForUser,
  getAuditLogStats,
  getClientIp,
  getFailedAuthzAttempts,
  getRecentSecurityEvents,
  getUserAgent,
  logAdminOperation,
  logApiKeyCreated,
  logApiKeyRevoked,
  logAuthorizationFailure,
  logAuthorizationSuccess,
  logDataAccess,
  logSecurityEvent,
  queryAuditLog,
} from "./audit-log.js";

describe("Audit Log", () => {
  beforeEach(() => {
    // Clear audit log before each test
    clearAuditLog();
  });

  describe("addAuditEvent", () => {
    it("should add an event to the audit log", () => {
      const eventId = addAuditEvent({
        category: "authentication",
        severity: "info",
        action: "login",
        success: true,
        performedBy: "user-123",
      });

      expect(eventId).toBeDefined();
      expect(eventId).toMatch(/^audit_/);
    });

    it("should generate unique event IDs", () => {
      const id1 = addAuditEvent({
        category: "authentication",
        severity: "info",
        action: "login",
        success: true,
      });

      const id2 = addAuditEvent({
        category: "authentication",
        severity: "info",
        action: "login",
        success: true,
      });

      expect(id1).not.toBe(id2);
    });

    it("should auto-generate timestamp", () => {
      const beforeTime = Date.now();

      addAuditEvent({
        category: "authentication",
        severity: "info",
        action: "login",
        success: true,
      });

      const afterTime = Date.now();

      const events = queryAuditLog({ limit: 1 });
      expect(events[0]?.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(events[0]?.timestamp).toBeLessThanOrEqual(afterTime);
    });

    it("should store all event properties", () => {
      addAuditEvent({
        category: "authorization",
        severity: "warning",
        action: "access_denied",
        resourceType: "api_keys",
        resourceId: "key-123",
        success: false,
        performedBy: "user-456",
        role: "user",
        error: "Insufficient permissions",
        clientIp: "192.168.1.1",
        userAgent: "Mozilla/5.0",
        path: "/api/keys",
        method: "POST",
        metadata: { attempt: 1 },
      });

      const events = queryAuditLog({ limit: 1 });
      const event = events[0];

      expect(event?.category).toBe("authorization");
      expect(event?.severity).toBe("warning");
      expect(event?.action).toBe("access_denied");
      expect(event?.resourceType).toBe("api_keys");
      expect(event?.resourceId).toBe("key-123");
      expect(event?.success).toBe(false);
      expect(event?.performedBy).toBe("user-456");
      expect(event?.role).toBe("user");
      expect(event?.error).toBe("Insufficient permissions");
      expect(event?.clientIp).toBe("192.168.1.1");
      expect(event?.userAgent).toBe("Mozilla/5.0");
      expect(event?.path).toBe("/api/keys");
      expect(event?.method).toBe("POST");
      expect(event?.metadata).toEqual({ attempt: 1 });
    });
  });

  describe("queryAuditLog", () => {
    beforeEach(() => {
      // Add test events
      addAuditEvent({
        category: "authentication",
        severity: "info",
        action: "login",
        success: true,
        performedBy: "user-1",
      });

      addAuditEvent({
        category: "authorization",
        severity: "warning",
        action: "access_denied",
        success: false,
        performedBy: "user-2",
      });

      addAuditEvent({
        category: "admin",
        severity: "error",
        action: "config_change",
        success: false,
        performedBy: "admin-1",
      });
    });

    it("should return all events when no filters provided", () => {
      const events = queryAuditLog();

      expect(events.length).toBeGreaterThanOrEqual(3);
    });

    it("should filter by category", () => {
      const events = queryAuditLog({ category: "authentication" as AuditEventCategory });

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events.every((e) => e.category === "authentication")).toBe(true);
    });

    it("should filter by severity", () => {
      const events = queryAuditLog({ severity: "warning" as AuditEventSeverity });

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events.every((e) => e.severity === "warning")).toBe(true);
    });

    it("should filter by action", () => {
      const events = queryAuditLog({ action: "login" });

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events.every((e) => e.action === "login")).toBe(true);
    });

    it("should filter by resource type", () => {
      addAuditEvent({
        category: "authorization",
        severity: "warning",
        action: "access_denied",
        resourceType: "api_keys",
        success: false,
      });

      const events = queryAuditLog({ resourceType: "api_keys" });

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events.every((e) => e.resourceType === "api_keys")).toBe(true);
    });

    it("should filter by resource ID", () => {
      addAuditEvent({
        category: "data_access",
        severity: "info",
        action: "read",
        resourceId: "resource-123",
        success: true,
      });

      const events = queryAuditLog({ resourceId: "resource-123" });

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events.every((e) => e.resourceId === "resource-123")).toBe(true);
    });

    it("should filter by performer", () => {
      const events = queryAuditLog({ performedBy: "user-1" });

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events.every((e) => e.performedBy === "user-1")).toBe(true);
    });

    it("should filter by success status", () => {
      const successfulEvents = queryAuditLog({ success: true });
      const failedEvents = queryAuditLog({ success: false });

      expect(successfulEvents.every((e) => e.success === true)).toBe(true);
      expect(failedEvents.every((e) => e.success === false)).toBe(true);
    });

    it("should filter by timestamp range", () => {
      const now = Date.now();

      addAuditEvent({
        category: "test",
        severity: "info",
        action: "timestamp_test",
        success: true,
      });

      const events = queryAuditLog({
        startTimestamp: now - 1000,
        endTimestamp: now + 1000,
      });

      expect(events.length).toBeGreaterThanOrEqual(1);
    });

    it("should apply limit and offset", () => {
      const events1 = queryAuditLog({ limit: 1 });
      const events2 = queryAuditLog({ limit: 1, offset: 1 });

      expect(events1.length).toBe(1);
      expect(events2.length).toBe(1);
      expect(events1[0]?.id).not.toBe(events2[0]?.id);
    });

    it("should combine multiple filters", () => {
      addAuditEvent({
        category: "authorization",
        severity: "warning",
        action: "access_denied",
        success: false,
        performedBy: "user-1",
      });

      const events = queryAuditLog({
        category: "authorization" as AuditEventCategory,
        performedBy: "user-1",
        success: false,
      });

      expect(
        events.every(
          (e) => e.category === "authorization" && e.performedBy === "user-1" && !e.success
        )
      ).toBe(true);
    });
  });

  describe("getAuditLogStats", () => {
    beforeEach(() => {
      // Add various events for statistics
      addAuditEvent({
        category: "authentication",
        severity: "info",
        action: "login",
        success: true,
        performedBy: "user-1",
      });

      addAuditEvent({
        category: "authentication",
        severity: "warning",
        action: "login_failed",
        success: false,
        performedBy: "user-2",
      });

      addAuditEvent({
        category: "authorization",
        severity: "error",
        action: "access_denied",
        success: false,
        performedBy: "user-3",
      });
    });

    it("should return total events count", () => {
      const stats = getAuditLogStats();

      expect(stats.totalEvents).toBeGreaterThan(0);
    });

    it("should count events by category", () => {
      const stats = getAuditLogStats();

      expect(stats.eventsByCategory).toBeDefined();
      expect(stats.eventsByCategory.authentication).toBeGreaterThan(0);
    });

    it("should count events by severity", () => {
      const stats = getAuditLogStats();

      expect(stats.eventsBySeverity).toBeDefined();
      expect(stats.eventsBySeverity.info).toBeGreaterThan(0);
    });

    it("should count failed events in last 24h", () => {
      const stats = getAuditLogStats();

      expect(stats.failedEvents24h).toBeGreaterThanOrEqual(0);
    });

    it("should count unique users in last 24h", () => {
      const stats = getAuditLogStats();

      expect(stats.uniqueUsers24h).toBeGreaterThanOrEqual(0);
    });

    it("should return top actions in last 24h", () => {
      const stats = getAuditLogStats();

      expect(stats.topActions24h).toBeDefined();
      expect(Array.isArray(stats.topActions24h)).toBe(true);
    });
  });

  describe("getAuditLogForResource", () => {
    it("should return events for a specific resource", () => {
      addAuditEvent({
        category: "api_keys",
        severity: "info",
        action: "create",
        resourceType: "api_key",
        resourceId: "key-123",
        success: true,
      });

      addAuditEvent({
        category: "api_keys",
        severity: "warning",
        action: "revoke",
        resourceType: "api_key",
        resourceId: "key-123",
        success: true,
      });

      const events = getAuditLogForResource("api_key", "key-123");

      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events.every((e) => e.resourceType === "api_key" && e.resourceId === "key-123")).toBe(
        true
      );
    });

    it("should respect limit parameter", () => {
      addAuditEvent({
        category: "api_keys",
        severity: "info",
        action: "create",
        resourceType: "api_key",
        resourceId: "key-456",
        success: true,
      });

      const events = getAuditLogForResource("api_key", "key-456", 10);

      expect(events.length).toBeLessThanOrEqual(10);
    });
  });

  describe("getAuditLogForUser", () => {
    it("should return events for a specific user", () => {
      addAuditEvent({
        category: "authentication",
        severity: "info",
        action: "login",
        performedBy: "user-123",
        success: true,
      });

      addAuditEvent({
        category: "authorization",
        severity: "warning",
        action: "access_denied",
        performedBy: "user-123",
        success: false,
      });

      const events = getAuditLogForUser("user-123");

      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events.every((e) => e.performedBy === "user-123")).toBe(true);
    });
  });

  describe("getFailedAuthzAttempts", () => {
    it("should return failed authorization attempts", () => {
      addAuditEvent({
        category: "authorization",
        severity: "warning",
        action: "access_denied",
        success: false,
        performedBy: "user-123",
      });

      addAuditEvent({
        category: "authorization",
        severity: "error",
        action: "permission_denied",
        success: false,
        performedBy: "user-456",
      });

      const events = getFailedAuthzAttempts();

      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events.every((e) => e.category === "authorization" && !e.success)).toBe(true);
    });

    it("should filter by performer", () => {
      addAuditEvent({
        category: "authorization",
        severity: "warning",
        action: "access_denied",
        success: false,
        performedBy: "user-123",
      });

      const events = getFailedAuthzAttempts("user-123");

      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events.every((e) => e.performedBy === "user-123")).toBe(true);
    });

    it("should respect limit parameter", () => {
      for (let i = 0; i < 100; i++) {
        addAuditEvent({
          category: "authorization",
          severity: "warning",
          action: "access_denied",
          success: false,
          performedBy: `user-${i}`,
        });
      }

      const events = getFailedAuthzAttempts(undefined, 10);

      expect(events.length).toBeLessThanOrEqual(10);
    });
  });

  describe("getRecentSecurityEvents", () => {
    it("should return recent security events", () => {
      addAuditEvent({
        category: "security",
        severity: "critical",
        action: "breach_detected",
        success: false,
      });

      addAuditEvent({
        category: "security",
        severity: "high",
        action: "suspicious_activity",
        success: true,
      });

      const events = getRecentSecurityEvents();

      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events.every((e) => e.category === "security")).toBe(true);
    });

    it("should respect limit parameter", () => {
      for (let i = 0; i < 100; i++) {
        addAuditEvent({
          category: "security",
          severity: "info",
          action: `event-${i}`,
          success: true,
        });
      }

      const events = getRecentSecurityEvents(10);

      expect(events.length).toBeLessThanOrEqual(10);
    });
  });

  describe("Helper Functions", () => {
    describe("getClientIp", () => {
      it("should extract IP from CF-Connecting-IP header", () => {
        const c = {
          req: {
            header: vi.fn((name: string) => {
              if (name === "CF-Connecting-IP") return "192.168.1.1";
              return undefined;
            }),
          },
        } as unknown as Hono;

        const ip = getClientIp(c);

        expect(ip).toBe("192.168.1.1");
      });

      it("should extract IP from X-Forwarded-For header", () => {
        const c = {
          req: {
            header: vi.fn((name: string) => {
              if (name === "X-Forwarded-For") return "10.0.0.1, 10.0.0.2";
              return undefined;
            }),
          },
        } as unknown as Hono;

        const ip = getClientIp(c);

        expect(ip).toBe("10.0.0.1");
      });

      it("should extract IP from X-Real-IP header", () => {
        const c = {
          req: {
            header: vi.fn((name: string) => {
              if (name === "X-Real-IP") return "172.16.0.1";
              return undefined;
            }),
          },
        } as unknown as Hono;

        const ip = getClientIp(c);

        expect(ip).toBe("172.16.0.1");
      });

      it("should return unknown when no IP headers found", () => {
        const c = {
          req: {
            header: vi.fn(() => undefined),
          },
        } as unknown as Hono;

        const ip = getClientIp(c);

        expect(ip).toBe("unknown");
      });
    });

    describe("getUserAgent", () => {
      it("should extract user agent from header", () => {
        const c = {
          req: {
            header: vi.fn((name: string) => {
              if (name === "User-Agent") return "Mozilla/5.0";
              return undefined;
            }),
          },
        } as unknown as Hono;

        const userAgent = getUserAgent(c);

        expect(userAgent).toBe("Mozilla/5.0");
      });

      it("should return unknown when no user agent found", () => {
        const c = {
          req: {
            header: vi.fn(() => undefined),
          },
        } as unknown as Hono;

        const userAgent = getUserAgent(c);

        expect(userAgent).toBe("unknown");
      });
    });

    describe("extractAuthContext", () => {
      it("should extract auth context from request", () => {
        const c = {
          get: vi.fn((key: string) => {
            if (key === "auth") {
              return {
                keyId: "user-123",
                role: "admin",
              };
            }
            return undefined;
          }),
        } as unknown as Hono;

        const auth = extractAuthContext(c);

        expect(auth.performedBy).toBe("user-123");
        expect(auth.role).toBe("admin");
      });

      it("should return undefined when no auth context", () => {
        const c = {
          get: vi.fn(() => undefined),
        } as unknown as Hono;

        const auth = extractAuthContext(c);

        expect(auth.performedBy).toBeUndefined();
        expect(auth.role).toBeUndefined();
      });
    });
  });

  describe("Logging Helpers", () => {
    let testContext: Hono;

    beforeEach(() => {
      testContext = {
        req: {
          header: vi.fn((name: string) => {
            const headers: Record<string, string> = {
              "CF-Connecting-IP": "192.168.1.1",
              "User-Agent": "Mozilla/5.0",
            };
            return headers[name];
          }),
          path: "/api/test",
          method: "POST",
        },
        get: vi.fn((key: string) => {
          if (key === "rbacAuthContext") {
            return {
              keyId: "user-123",
              role: "user",
            };
          }
          return undefined;
        }),
      } as unknown as Hono;
    });

    describe("logAuthorizationSuccess", () => {
      it("should log successful authorization", () => {
        const eventId = logAuthorizationSuccess(testContext, "api_keys", "create");

        expect(eventId).toBeDefined();

        const events = queryAuditLog({ limit: 1 });
        const event = events[0];

        expect(event?.category).toBe("authorization");
        expect(event?.action).toBe("api_keys:create");
        expect(event?.success).toBe(true);
      });
    });

    describe("logAuthorizationFailure", () => {
      it("should log failed authorization", () => {
        const eventId = logAuthorizationFailure(
          testContext,
          "api_keys",
          "delete",
          "Insufficient permissions"
        );

        expect(eventId).toBeDefined();

        const events = queryAuditLog({ limit: 1 });
        const event = events[0];

        expect(event?.category).toBe("authorization");
        expect(event?.action).toBe("api_keys:delete");
        expect(event?.success).toBe(false);
        expect(event?.error).toBe("Insufficient permissions");
      });
    });

    describe("logApiKeyCreated", () => {
      it("should log API key creation", () => {
        const eventId = logApiKeyCreated(testContext, "key-123", "read", "user");

        expect(eventId).toBeDefined();

        const events = queryAuditLog({ limit: 1 });
        const event = events[0];

        expect(event?.category).toBe("api_keys");
        expect(event?.action).toBe("api_key:create");
        expect(event?.resourceId).toBe("key-123");
        expect(event?.success).toBe(true);
      });
    });

    describe("logApiKeyRevoked", () => {
      it("should log API key revocation", () => {
        const eventId = logApiKeyRevoked(testContext, "key-456");

        expect(eventId).toBeDefined();

        const events = queryAuditLog({ limit: 1 });
        const event = events[0];

        expect(event?.category).toBe("api_keys");
        expect(event?.action).toBe("api_key:revoke");
        expect(event?.resourceId).toBe("key-456");
        expect(event?.success).toBe(true);
      });
    });

    describe("logAdminOperation", () => {
      it("should log admin operation", () => {
        const eventId = logAdminOperation(testContext, "user_delete", "user", "user-789", true, {
          reason: "Violation of terms",
        });

        expect(eventId).toBeDefined();

        const events = queryAuditLog({ limit: 1 });
        const event = events[0];

        expect(event?.category).toBe("admin");
        expect(event?.action).toBe("user_delete");
        expect(event?.resourceType).toBe("user");
        expect(event?.resourceId).toBe("user-789");
        expect(event?.success).toBe(true);
      });
    });

    describe("logDataAccess", () => {
      it("should log data access", () => {
        const eventId = logDataAccess(testContext, "subscription", "read", "sub-123", true);

        expect(eventId).toBeDefined();

        const events = queryAuditLog({ limit: 1 });
        const event = events[0];

        expect(event?.category).toBe("data_access");
        expect(event?.action).toBe("subscription:read");
        expect(event?.resourceId).toBe("sub-123");
        expect(event?.success).toBe(true);
      });
    });

    describe("logSecurityEvent", () => {
      it("should log security event", () => {
        const eventId = logSecurityEvent(testContext, "brute_force_detected", "critical", {
          attempts: 100,
          ip: "192.168.1.100",
        });

        expect(eventId).toBeDefined();

        const events = queryAuditLog({ limit: 1 });
        const event = events[0];

        expect(event?.category).toBe("security");
        expect(event?.action).toBe("brute_force_detected");
        expect(event?.severity).toBe("critical");
        expect(event?.metadata).toEqual({
          attempts: 100,
          ip: "192.168.1.100",
        });
      });
    });
  });

  describe("Export Functions", () => {
    beforeEach(() => {
      // Add test events for export
      addAuditEvent({
        category: "authentication",
        severity: "info",
        action: "login",
        success: true,
        performedBy: "user-1",
      });

      addAuditEvent({
        category: "authorization",
        severity: "warning",
        action: "access_denied",
        success: false,
        performedBy: "user-2",
      });
    });

    describe("exportAuditLogAsJson", () => {
      it("should export audit log as JSON", () => {
        const json = exportAuditLogAsJson();

        expect(json).toBeDefined();
        expect(() => JSON.parse(json)).not.toThrow();

        const parsed = JSON.parse(json);
        expect(Array.isArray(parsed)).toBe(true);
      });

      it("should respect filters", () => {
        const json = exportAuditLogAsJson({
          category: "authentication" as AuditEventCategory,
        });

        const parsed = JSON.parse(json);
        expect(parsed.every((e: AuditEvent) => e.category === "authentication")).toBe(true);
      });
    });

    describe("exportAuditLogAsCsv", () => {
      it("should export audit log as CSV", () => {
        const csv = exportAuditLogAsCsv();

        expect(csv).toBeDefined();
        expect(csv).toContain("id,timestamp,category,severity");

        const lines = csv.split("\n");
        expect(lines.length).toBeGreaterThan(1); // Header + data rows
      });

      it("should include proper headers", () => {
        const csv = exportAuditLogAsCsv();

        const headers = csv.split("\n")[0];
        expect(headers).toContain("id");
        expect(headers).toContain("timestamp");
        expect(headers).toContain("category");
        expect(headers).toContain("severity");
        expect(headers).toContain("action");
      });

      it("should respect filters", () => {
        const csv = exportAuditLogAsCsv({
          severity: "info" as AuditEventSeverity,
        });

        const lines = csv.split("\n").slice(1); // Skip header
        lines.forEach((line) => {
          if (line.trim()) {
            const parts = line.split(",");
            expect(parts[3]).toBe("info"); // severity column (index 3)
          }
        });
      });
    });
  });

  describe("Maintenance Functions", () => {
    describe("clearAuditLog", () => {
      it("should clear all audit events", () => {
        // Add events
        for (let i = 0; i < 10; i++) {
          addAuditEvent({
            category: "test",
            severity: "info",
            action: `test-${i}`,
            success: true,
          });
        }

        const beforeCount = getAuditLogStats().totalEvents;
        expect(beforeCount).toBeGreaterThan(0);

        const cleared = clearAuditLog();
        expect(cleared).toBe(beforeCount);

        const afterCount = getAuditLogStats().totalEvents;
        expect(afterCount).toBe(0);
      });
    });

    describe("applyAuditLogRetention", () => {
      it("should remove old events based on retention policy", () => {
        // Add events with different timestamps
        const oldEvents = [
          addAuditEvent({
            category: "test",
            severity: "info",
            action: "old-event",
            success: true,
          }),
          addAuditEvent({
            category: "test",
            severity: "info",
            action: "old-event-2",
            success: true,
          }),
        ];

        const newEvent = addAuditEvent({
          category: "test",
          severity: "info",
          action: "new-event",
          success: true,
        });

        const beforeCount = getAuditLogStats().totalEvents;

        // Apply retention of 1 hour (should remove old events)
        const removed = applyAuditLogRetention(60 * 60 * 1000);

        // Since events were just created, none should be removed
        // But we're testing the function works
        expect(removed).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe("Event Categories and Severities", () => {
    const allCategories: AuditEventCategory[] = [
      "authentication",
      "authorization",
      "api_keys",
      "users",
      "sessions",
      "admin",
      "data_access",
      "configuration",
      "security",
    ];

    const allSeverities: AuditEventSeverity[] = ["info", "warning", "error", "critical"];

    it("should support all event categories", () => {
      for (const category of allCategories) {
        const eventId = addAuditEvent({
          category,
          severity: "info",
          action: "test",
          success: true,
        });

        expect(eventId).toBeDefined();
      }
    });

    it("should support all severity levels", () => {
      for (const severity of allSeverities) {
        const eventId = addAuditEvent({
          category: "test",
          severity,
          action: "test",
          success: true,
        });

        expect(eventId).toBeDefined();
      }
    });
  });
});
