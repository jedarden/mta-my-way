/**
 * Structured Audit Logging Tests
 *
 * Tests comprehensive audit logging including:
 * - Event logging and querying
 * - Sensitive data redaction
 * - Compliance reporting
 * - Retention policies
 * - Security incident detection
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  type AuditCategory,
  type AuditSeverity,
  type StructuredAuditEvent,
  applyRetentionPolicies,
  clearAuditLogs,
  detectSecurityIncidents,
  generateComplianceReport,
  getAuditEvent,
  getAuditLogStats,
  getCriticalSecurityEvents,
  getRelatedEvents,
  getRetentionPolicy,
  logAuditEvent,
  logAuditEventFromContext,
  queryAuditLogs,
  redactSensitiveData,
  setRetentionPolicy,
} from "./structured-audit-log.js";

// Import getChildEvents separately since it's not exported
const { getChildEvents } = await import("./structured-audit-log.js");

// Mock Hono context
function createMockContext(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    req: {
      header: (name: string) => {
        const headers: Record<string, string> = {
          "CF-Connecting-IP": "192.168.1.100",
          "User-Agent": "test-agent",
        };
        return headers[name] || undefined;
      },
    },
    get: (key: string) => {
      const context: Record<string, unknown> = {
        auth: { keyId: "test-key-123", role: "admin" },
        requestId: "req-123",
        traceId: "trace-456",
        spanId: "span-789",
      };
      return context[key];
    },
    ...overrides,
  };
}

describe("Structured Audit Logging", () => {
  beforeEach(() => {
    // Clear logs before each test (with confirmation)
    clearAuditLogs("CONFIRM_CLEAR_AUDIT_LOGS");
  });

  describe("Event Logging", () => {
    it("should log a basic audit event", () => {
      const event: StructuredAuditEvent = {
        metadata: { eventId: "event-1" },
        timestamp: new Date().toISOString(),
        category: "authentication" as AuditCategory,
        severity: "info" as AuditSeverity,
        outcome: "success",
        action: "user_login",
        actor: {
          ipAddress: "192.168.1.1",
          keyId: "user-123",
        },
        details: {},
      };

      const eventId = logAuditEvent(event);

      expect(eventId).toBe("event-1");
    });

    it("should auto-generate event ID if not provided", () => {
      const event: StructuredAuditEvent = {
        metadata: {},
        timestamp: new Date().toISOString(),
        category: "authentication" as AuditCategory,
        severity: "info" as AuditSeverity,
        outcome: "success",
        action: "test",
        actor: { ipAddress: "192.168.1.1" },
        details: {},
      };

      const eventId = logAuditEvent(event);

      expect(eventId).toBeDefined();
      expect(event.metadata.eventId).toBeDefined();
    });

    it("should redact sensitive data from details", () => {
      const event: StructuredAuditEvent = {
        metadata: {},
        timestamp: new Date().toISOString(),
        category: "authentication" as AuditCategory,
        severity: "info" as AuditSeverity,
        outcome: "success",
        action: "password_reset",
        actor: { ipAddress: "192.168.1.1" },
        details: {
          email: "user@example.com",
          password: "secret123",
          apiKey: "sk-1234567890abcdefghijklmnop1234567890abcdef",
        },
      };

      logAuditEvent(event);

      expect(event.details.email).toBe("[REDACTED_EMAIL]");
      expect(event.details.password).toContain("[REDACTED]");
      expect(event.details.apiKey).toBe("[REDACTED_KEY]");
    });
  });

  describe("Context-Based Logging", () => {
    it("should log event from Hono context", () => {
      const c = createMockContext();

      const eventId = logAuditEventFromContext(c as never, {
        category: "authentication" as AuditCategory,
        severity: "info" as AuditSeverity,
        outcome: "success",
        action: "api_key_auth",
        target: { type: "api_key", id: "key-123" },
        details: { scope: "read" },
      });

      expect(eventId).toBeDefined();
    });

    it("should extract IP address from context", () => {
      const c = createMockContext();

      const eventId = logAuditEventFromContext(c as never, {
        category: "authentication" as AuditCategory,
        severity: "info" as AuditSeverity,
        outcome: "success",
        action: "test",
      });

      const event = getAuditEvent(eventId);

      expect(event?.actor.ipAddress).toBe("192.168.1.100");
    });

    it("should extract auth context from context", () => {
      const c = createMockContext();

      const eventId = logAuditEventFromContext(c as never, {
        category: "authorization" as AuditCategory,
        severity: "info" as AuditSeverity,
        outcome: "success",
        action: "permission_check",
      });

      const event = getAuditEvent(eventId);

      expect(event?.actor.keyId).toBe("test-key-123");
      expect(event?.actor.role).toBe("admin");
    });

    it("should include correlation ID when provided", () => {
      const c = createMockContext();

      const eventId = logAuditEventFromContext(c as never, {
        category: "data_access" as AuditCategory,
        severity: "info" as AuditSeverity,
        outcome: "success",
        action: "query",
        correlationId: "corr-123",
      });

      const event = getAuditEvent(eventId);

      expect(event?.metadata.correlationId).toBe("corr-123");
    });
  });

  describe("Event Querying", () => {
    beforeEach(() => {
      // Create test events
      logAuditEvent({
        metadata: { eventId: "auth-1" },
        timestamp: new Date().toISOString(),
        category: "authentication" as AuditCategory,
        severity: "error" as AuditSeverity,
        outcome: "failure",
        action: "login_failed",
        actor: { ipAddress: "192.168.1.1", keyId: "user-1" },
        details: {},
      });

      logAuditEvent({
        metadata: { eventId: "auth-2" },
        timestamp: new Date().toISOString(),
        category: "authentication" as AuditCategory,
        severity: "info" as AuditSeverity,
        outcome: "success",
        action: "login_success",
        actor: { ipAddress: "192.168.1.1", keyId: "user-1" },
        details: {},
      });

      logAuditEvent({
        metadata: { eventId: "authz-1" },
        timestamp: new Date().toISOString(),
        category: "authorization" as AuditCategory,
        severity: "warning" as AuditSeverity,
        outcome: "failure",
        action: "access_denied",
        actor: { ipAddress: "192.168.1.2", keyId: "user-2" },
        details: {},
      });
    });

    it("should query by category", () => {
      const results = queryAuditLogs({ category: "authentication" as AuditCategory });

      expect(results).toHaveLength(2);
    });

    it("should query by severity", () => {
      const results = queryAuditLogs({ minSeverity: "warning" as AuditSeverity });

      expect(results).toHaveLength(2); // error and warning
    });

    it("should query by outcome", () => {
      const results = queryAuditLogs({ outcome: "failure" });

      expect(results).toHaveLength(2);
    });

    it("should query by actor key ID", () => {
      const results = queryAuditLogs({ actorKeyId: "user-1" });

      expect(results).toHaveLength(2);
    });

    it("should query by target type", () => {
      logAuditEvent({
        metadata: {},
        timestamp: new Date().toISOString(),
        category: "data_modification" as AuditCategory,
        severity: "info" as AuditSeverity,
        outcome: "success",
        action: "update",
        actor: { ipAddress: "192.168.1.1" },
        target: { type: "trip", id: "trip-123" },
        details: {},
      });

      const results = queryAuditLogs({ targetType: "trip" });

      expect(results).toHaveLength(1);
    });

    it("should limit results", () => {
      const results = queryAuditLogs({ limit: 2 });

      expect(results).toHaveLength(2);
    });
  });

  describe("Event Retrieval", () => {
    it("should get event by ID", () => {
      const eventId = logAuditEvent({
        metadata: { eventId: "test-event" },
        timestamp: new Date().toISOString(),
        category: "authentication" as AuditCategory,
        severity: "info" as AuditSeverity,
        outcome: "success",
        action: "test",
        actor: { ipAddress: "192.168.1.1" },
        details: {},
      });

      const event = getAuditEvent(eventId);

      expect(event).toBeDefined();
      expect(event?.action).toBe("test");
    });

    it("should return null for non-existent event", () => {
      expect(getAuditEvent("nonexistent")).toBeNull();
    });

    it("should get related events by correlation ID", () => {
      const corrId = "corr-123";

      logAuditEvent({
        metadata: { correlationId: corrId },
        timestamp: new Date().toISOString(),
        category: "authentication" as AuditCategory,
        severity: "info" as AuditSeverity,
        outcome: "success",
        action: "step1",
        actor: { ipAddress: "192.168.1.1" },
        details: {},
      });

      logAuditEvent({
        metadata: { correlationId: corrId },
        timestamp: new Date().toISOString(),
        category: "authentication" as AuditCategory,
        severity: "info" as AuditSeverity,
        outcome: "success",
        action: "step2",
        actor: { ipAddress: "192.168.1.1" },
        details: {},
      });

      const related = getRelatedEvents(corrId);

      expect(related).toHaveLength(2);
    });

    it("should get child events", () => {
      const parentId = "parent-1";

      logAuditEvent({
        metadata: { parentEventId: parentId, eventId: "child-1" },
        timestamp: new Date().toISOString(),
        category: "authentication" as AuditCategory,
        severity: "info" as AuditSeverity,
        outcome: "success",
        action: "child_action",
        actor: { ipAddress: "192.168.1.1" },
        details: {},
      });

      const children = getChildEvents(parentId);

      expect(children).toHaveLength(1);
      expect(children[0]?.metadata.eventId).toBe("child-1");
    });
  });

  describe("Statistics", () => {
    it("should return audit log statistics", () => {
      logAuditEvent({
        metadata: {},
        timestamp: new Date().toISOString(),
        category: "authentication" as AuditCategory,
        severity: "error" as AuditSeverity,
        outcome: "failure",
        action: "login_failed",
        actor: { ipAddress: "192.168.1.1" },
        details: {},
      });

      logAuditEvent({
        metadata: {},
        timestamp: new Date().toISOString(),
        category: "authorization" as AuditCategory,
        severity: "info" as AuditSeverity,
        outcome: "success",
        action: "access_granted",
        actor: { ipAddress: "192.168.1.1" },
        details: {},
      });

      const stats = getAuditLogStats();

      expect(stats.totalEvents).toBeGreaterThanOrEqual(2);
      expect(stats.failedEvents).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Compliance Reporting", () => {
    it("should generate compliance report", () => {
      // Create some compliance-tagged events
      logAuditEvent({
        metadata: {},
        timestamp: new Date().toISOString(),
        category: "authentication" as AuditCategory,
        severity: "critical" as AuditSeverity,
        outcome: "failure",
        action: "brute_force_detected",
        actor: { ipAddress: "192.168.1.1" },
        details: {},
        compliance: { soc2: true, hipaa: true },
      });

      const report = generateComplianceReport({
        startDate: new Date(Date.now() - 86400000).toISOString(),
        endDate: new Date().toISOString(),
        compliance: "soc2",
      });

      expect(report.compliance).toBe("soc2");
      expect(report.totalEvents).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Retention Policies", () => {
    it("should get default retention policy", () => {
      const policy = getRetentionPolicy("default");

      expect(policy.retentionDays).toBe(90);
    });

    it("should get SOC2 retention policy", () => {
      const policy = getRetentionPolicy("soc2");

      expect(policy.retentionDays).toBe(2555); // 7 years
    });

    it("should set custom retention policy", () => {
      setRetentionPolicy("custom", { retentionDays: 30, archiveBeforeDeletion: false });

      const policy = getRetentionPolicy("custom");

      expect(policy.retentionDays).toBe(30);
    });
  });

  describe("Security Incident Detection", () => {
    beforeEach(() => {
      const ip = "192.168.1.100";

      // Create failed auth events
      for (let i = 0; i < 5; i++) {
        logAuditEvent({
          metadata: {},
          timestamp: new Date().toISOString(),
          category: "authentication" as AuditCategory,
          severity: "error" as AuditSeverity,
          outcome: "failure",
          action: "login_failed",
          actor: { ipAddress: ip },
          details: {},
        });
      }

      // Create failed authorization events
      for (let i = 0; i < 3; i++) {
        logAuditEvent({
          metadata: {},
          timestamp: new Date().toISOString(),
          category: "authorization" as AuditCategory,
          severity: "warning" as AuditSeverity,
          outcome: "failure",
          action: "access_denied",
          actor: { keyId: "suspicious-user" },
          details: {},
        });
      }
    });

    it("should detect brute force attacks", () => {
      const incidents = detectSecurityIncidents();

      const bruteForce = incidents.find((i) => i.type === "brute_force");

      expect(bruteForce).toBeDefined();
      expect(bruteForce?.severity).toBe("high");
    });

    it("should detect privilege escalation attempts", () => {
      const incidents = detectSecurityIncidents();

      const escalation = incidents.find((i) => i.type === "privilege_escalation");

      expect(escalation).toBeDefined();
    });
  });

  describe("Critical Events", () => {
    it("should return critical security events", () => {
      logAuditEvent({
        metadata: {},
        timestamp: new Date().toISOString(),
        category: "security" as AuditCategory,
        severity: "critical" as AuditSeverity,
        outcome: "failure",
        action: "data_breach_detected",
        actor: { ipAddress: "10.0.0.1" },
        details: {},
      });

      const critical = getCriticalSecurityEvents();

      expect(critical.length).toBeGreaterThan(0);
      expect(critical[0]?.severity).toBe("critical");
    });
  });

  describe("Data Redaction", () => {
    it("should redact email addresses", () => {
      const data = { email: "user@example.com" };
      const redacted = redactSensitiveData(data);

      expect(redacted.email).toBe("[REDACTED_EMAIL]");
    });

    it("should redact phone numbers", () => {
      const data = { phone: "555-123-4567" };
      const redacted = redactSensitiveData(data);

      expect(redacted.phone).toBe("[REDACTED_PHONE]");
    });

    it("should redact SSNs", () => {
      const data = { ssn: "123-45-6789" };
      const redacted = redactSensitiveData(data);

      expect(redacted.ssn).toBe("[REDACTED_SSN]");
    });

    it("should redact credit cards", () => {
      const data = { card: "4111-1111-1111-1111" };
      const redacted = redactSensitiveData(data);

      expect(redacted.card).toBe("[REDACTED_CARD]");
    });

    it("should redact API keys", () => {
      const data = { key: "sk-1234567890abcdefghijklmnop1234567890abcdef" };
      const redacted = redactSensitiveData(data);

      expect(redacted.key).toBe("[REDACTED_KEY]");
    });

    it("should redact password fields", () => {
      const data = { user: "test", password: "secret123" };
      const redacted = redactSensitiveData(data);

      expect(redacted.password).toContain("[REDACTED]");
    });

    it("should preserve non-sensitive data", () => {
      const data = {
        name: "John Doe",
        city: "New York",
        age: 30,
      };
      const redacted = redactSensitiveData(data);

      expect(redacted.name).toBe("John Doe");
      expect(redacted.city).toBe("New York");
      expect(redacted.age).toBe(30);
    });
  });

  describe("Audit Log Management", () => {
    it("should require confirmation to clear logs", () => {
      const result = clearAuditLogs("NO_CONFIRMATION");

      expect(result).toBe(false);
    });

    it("should clear logs with proper confirmation", () => {
      // Add some events
      logAuditEvent({
        metadata: { eventId: "test-1" },
        timestamp: new Date().toISOString(),
        category: "authentication" as AuditCategory,
        severity: "info" as AuditSeverity,
        outcome: "success",
        action: "test",
        actor: { ipAddress: "192.168.1.1" },
        details: {},
      });

      const result = clearAuditLogs("CONFIRM_CLEAR_AUDIT_LOGS");

      expect(result).toBe(true);

      const stats = getAuditLogStats();
      expect(stats.totalEvents).toBe(0);
    });
  });
});
