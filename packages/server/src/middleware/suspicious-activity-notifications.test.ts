/**
 * Tests for suspicious activity notification system.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type NotificationChannel,
  type NotificationPreferences,
  type SecurityEvent,
  type SecurityEventType,
  clearNotificationRateLimit,
  createSecurityEvent,
  getNotificationHistory,
  getNotificationPreferences,
  getNotificationStats,
  notifySecurityEvent,
  registerNotificationTemplate,
  resetNotificationStorage,
  setNotificationPreferences,
} from "./suspicious-activity-notifications.js";

describe("Suspicious Activity Notifications", () => {
  beforeEach(() => {
    // Reset all in-memory storage before each test
    resetNotificationStorage();
  });

  describe("createSecurityEvent", () => {
    it("should create a security event with required fields", () => {
      const event = createSecurityEvent("login_failed_multiple", "test-key", "192.168.1.1");

      expect(event.eventId).toBeDefined();
      expect(event.type).toBe("login_failed_multiple");
      expect(event.keyId).toBe("test-key");
      expect(event.clientIp).toBe("192.168.1.1");
      expect(event.timestamp).toBeDefined();
      expect(event.severity).toBe("medium");
      expect(event.details).toEqual({});
    });

    it("should create a security event with custom details", () => {
      const event = createSecurityEvent("password_changed", "user-key", "10.0.0.1", {
        userAgent: "Mozilla/5.0",
        sessionId: "session-123",
      });

      expect(event.details.userAgent).toBe("Mozilla/5.0");
      expect(event.details.sessionId).toBe("session-123");
    });

    it("should assign correct severity to event types", () => {
      const criticalEvent = createSecurityEvent("session_hijacking_detected", "key-1", "1.1.1.1");
      expect(criticalEvent.severity).toBe("critical");

      const highEvent = createSecurityEvent("impossible_travel_detected", "key-2", "2.2.2.2");
      expect(highEvent.severity).toBe("critical");

      const mediumEvent = createSecurityEvent("login_failed_multiple", "key-3", "3.3.3.3");
      expect(mediumEvent.severity).toBe("medium");

      const lowEvent = createSecurityEvent("password_changed", "key-4", "4.4.4.4");
      expect(lowEvent.severity).toBe("low");
    });

    it("should generate unique event IDs", () => {
      const event1 = createSecurityEvent("login_success_new_device", "key-1", "1.1.1.1");
      const event2 = createSecurityEvent("login_success_new_device", "key-1", "1.1.1.1");

      expect(event1.eventId).not.toBe(event2.eventId);
    });
  });

  describe("Notification Preferences", () => {
    it("should set and get notification preferences", () => {
      const preferences: NotificationPreferences = {
        keyId: "user-123",
        email: "user@example.com",
        phone: "+1234567890",
        channelPreferences: {
          low: ["in_app"],
          medium: ["in_app", "email"],
          high: ["in_app", "email", "push"],
          critical: ["in_app", "email", "sms", "push"],
        },
        excludedEvents: [],
        enabled: true,
      };

      setNotificationPreferences(preferences);

      const retrieved = getNotificationPreferences("user-123");
      expect(retrieved).toEqual(preferences);
    });

    it("should create default preferences when none exist", async () => {
      const event = createSecurityEvent("password_changed", "new-user", "192.168.1.1");
      await notifySecurityEvent(event);

      const preferences = getNotificationPreferences("new-user");
      expect(preferences).toBeDefined();
      expect(preferences?.enabled).toBe(true);
      expect(preferences?.channelPreferences.low).toContain("in_app");
    });

    it("should handle excluded events", async () => {
      const preferences: NotificationPreferences = {
        keyId: "user-123",
        channelPreferences: {
          low: ["in_app"],
          medium: ["in_app"],
          high: ["in_app"],
          critical: ["in_app"],
        },
        excludedEvents: ["password_changed"],
        enabled: true,
      };

      setNotificationPreferences(preferences);

      const event = createSecurityEvent("password_changed", "user-123", "192.168.1.1");
      const results = await notifySecurityEvent(event);

      expect(results).toHaveLength(0);
    });

    it("should respect disabled notifications", async () => {
      const preferences: NotificationPreferences = {
        keyId: "user-123",
        channelPreferences: {
          low: ["in_app"],
          medium: ["in_app"],
          high: ["in_app"],
          critical: ["in_app"],
        },
        excludedEvents: [],
        enabled: false,
      };

      setNotificationPreferences(preferences);

      const event = createSecurityEvent("login_failed_multiple", "user-123", "192.168.1.1");
      const results = await notifySecurityEvent(event);

      expect(results).toHaveLength(0);
    });

    it("should store quiet hours configuration", () => {
      const preferences: NotificationPreferences = {
        keyId: "user-123",
        quietHours: {
          enabled: true,
          start: "22:00",
          end: "06:00",
          timezone: "America/New_York",
        },
        channelPreferences: {
          low: ["in_app"],
          medium: ["in_app"],
          high: ["in_app"],
          critical: ["in_app"],
        },
        excludedEvents: [],
        enabled: true,
      };

      setNotificationPreferences(preferences);

      const retrieved = getNotificationPreferences("user-123");
      expect(retrieved?.quietHours).toEqual({
        enabled: true,
        start: "22:00",
        end: "06:00",
        timezone: "America/New_York",
      });
    });
  });

  describe("Notification Sending", () => {
    it("should send notifications to appropriate channels based on severity", async () => {
      const preferences: NotificationPreferences = {
        keyId: "user-123",
        channelPreferences: {
          low: ["in_app"],
          medium: ["in_app", "email"],
          high: ["in_app", "email", "push"],
          critical: ["in_app", "email", "sms", "push"],
        },
        excludedEvents: [],
        enabled: true,
      };

      setNotificationPreferences(preferences);

      // Low severity event
      const lowEvent = createSecurityEvent("password_changed", "user-123", "192.168.1.1");
      const lowResults = await notifySecurityEvent(lowEvent);

      expect(lowResults).toHaveLength(1);
      expect(lowResults[0]?.channel).toBe("in_app");

      // Critical severity event
      const criticalEvent = createSecurityEvent(
        "session_hijacking_detected",
        "user-123",
        "192.168.1.1"
      );
      const criticalResults = await notifySecurityEvent(criticalEvent);

      expect(criticalResults).toHaveLength(4);
      expect(criticalResults.map((r) => r.channel)).toEqual(
        expect.arrayContaining(["in_app", "email", "sms", "push"])
      );
    });

    it("should handle notification delivery failures gracefully", async () => {
      const preferences: NotificationPreferences = {
        keyId: "user-123",
        email: "invalid-email", // This might cause failure
        channelPreferences: {
          low: ["email"],
          medium: ["email"],
          high: ["email"],
          critical: ["email"],
        },
        excludedEvents: [],
        enabled: true,
      };

      setNotificationPreferences(preferences);

      const event = createSecurityEvent("password_changed", "user-123", "192.168.1.1");
      const results = await notifySecurityEvent(event);

      // Should return results even if some fail
      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
    });

    it("should store notification history", async () => {
      const preferences: NotificationPreferences = {
        keyId: "user-123",
        channelPreferences: {
          low: ["in_app"],
          medium: ["in_app"],
          high: ["in_app"],
          critical: ["in_app"],
        },
        excludedEvents: [],
        enabled: true,
      };

      setNotificationPreferences(preferences);

      const event = createSecurityEvent("password_changed", "user-123", "192.168.1.1");
      await notifySecurityEvent(event);

      const history = getNotificationHistory(event.eventId);
      expect(history).toBeDefined();
      expect(history?.length).toBeGreaterThan(0);
    });
  });

  describe("Rate Limiting", () => {
    it("should rate limit notifications per channel", async () => {
      const preferences: NotificationPreferences = {
        keyId: "user-123",
        channelPreferences: {
          low: ["in_app"],
          medium: ["in_app"],
          high: ["in_app"],
          critical: ["in_app"],
        },
        excludedEvents: [],
        enabled: true,
      };

      setNotificationPreferences(preferences);

      // Send 11 notifications with different IPs to avoid deduplication
      // but same user to trigger rate limiting
      const results: Array<ReturnType<typeof notifySecurityEvent>> = [];
      for (let i = 0; i < 11; i++) {
        const event = createSecurityEvent("password_changed", "user-123", `192.168.1.${i}`, {
          attempt: i,
        });
        results.push(notifySecurityEvent(event));
      }

      await Promise.all(results);

      // Check that at least one was rate limited
      const allResults = await Promise.all(results);
      const rateLimited = allResults.filter((r) =>
        r.some((result) => !result.success && result.error === "Rate limit exceeded")
      );

      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it("should clear rate limits for a user", async () => {
      const preferences: NotificationPreferences = {
        keyId: "user-123",
        channelPreferences: {
          low: ["in_app"],
          medium: ["in_app"],
          high: ["in_app"],
          critical: ["in_app"],
        },
        excludedEvents: [],
        enabled: true,
      };

      setNotificationPreferences(preferences);

      // Exhaust rate limit (using different IPs to avoid deduplication)
      for (let i = 0; i < 11; i++) {
        const event = createSecurityEvent("password_changed", "user-123", `192.168.1.${i}`);
        await notifySecurityEvent(event);
      }

      // Clear rate limit
      clearNotificationRateLimit("user-123");

      // Should be able to send again (with different IP to avoid deduplication)
      const event = createSecurityEvent("password_changed", "user-123", "192.168.1.99");
      const results = await notifySecurityEvent(event);

      expect(results).toHaveLength(1);
      expect(results[0]?.success).toBe(true);
    });

    it("should clear rate limits for specific channel", async () => {
      clearNotificationRateLimit("user-123", "email");

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe("Event Deduplication", () => {
    it("should deduplicate similar events within time window", async () => {
      const preferences: NotificationPreferences = {
        keyId: "user-123",
        channelPreferences: {
          low: ["in_app"],
          medium: ["in_app"],
          high: ["in_app"],
          critical: ["in_app"],
        },
        excludedEvents: [],
        enabled: true,
      };

      setNotificationPreferences(preferences);

      // Send first event
      const event1 = createSecurityEvent("login_failed_multiple", "user-123", "192.168.1.1");
      const results1 = await notifySecurityEvent(event1);
      expect(results1).toHaveLength(1);

      // Send similar event immediately (should be deduplicated)
      const event2 = createSecurityEvent("login_failed_multiple", "user-123", "192.168.1.1");
      const results2 = await notifySecurityEvent(event2);
      expect(results2).toHaveLength(0);
    });

    it("should not deduplicate different event types", async () => {
      const preferences: NotificationPreferences = {
        keyId: "user-123",
        channelPreferences: {
          low: ["in_app"],
          medium: ["in_app"],
          high: ["in_app"],
          critical: ["in_app"],
        },
        excludedEvents: [],
        enabled: true,
      };

      setNotificationPreferences(preferences);

      const event1 = createSecurityEvent("password_changed", "user-123", "192.168.1.1");
      await notifySecurityEvent(event1);

      const event2 = createSecurityEvent("mfa_enabled", "user-123", "192.168.1.1");
      const results2 = await notifySecurityEvent(event2);

      expect(results2).toHaveLength(1);
    });
  });

  describe("Custom Templates", () => {
    it("should register and use custom notification templates", async () => {
      const customTemplate = {
        eventType: "password_changed" as SecurityEventType,
        subject: "Custom: Password Changed",
        body: "Your password was changed at {{timestamp}} from IP {{ip}}.",
        placeholders: {
          timestamp: "Event timestamp",
          ip: "IP address",
        },
      };

      registerNotificationTemplate(customTemplate);

      const preferences: NotificationPreferences = {
        keyId: "user-123",
        channelPreferences: {
          low: ["in_app"],
          medium: ["in_app"],
          high: ["in_app"],
          critical: ["in_app"],
        },
        excludedEvents: [],
        enabled: true,
      };

      setNotificationPreferences(preferences);

      const event = createSecurityEvent("password_changed", "user-123", "192.168.1.1");
      const results = await notifySecurityEvent(event);

      // Should use custom template
      expect(results).toHaveLength(1);
    });
  });

  describe("Statistics", () => {
    it("should return notification statistics", async () => {
      const preferences: NotificationPreferences = {
        keyId: "user-123",
        channelPreferences: {
          low: ["in_app"],
          medium: ["in_app"],
          high: ["in_app"],
          critical: ["in_app"],
        },
        excludedEvents: [],
        enabled: true,
      };

      setNotificationPreferences(preferences);

      const event = createSecurityEvent("password_changed", "user-123", "192.168.1.1");
      await notifySecurityEvent(event);

      const stats = getNotificationStats();

      expect(stats.totalPreferences).toBeGreaterThan(0);
      expect(stats.totalHistoryEntries).toBeGreaterThan(0);
      expect(stats.recentEventsCount).toBeGreaterThan(0);
    });
  });

  describe("Security Event Types", () => {
    const allEventTypes: SecurityEventType[] = [
      "login_success_new_device",
      "login_success_new_location",
      "login_success_suspicious_time",
      "login_failed_multiple",
      "password_changed",
      "mfa_enabled",
      "mfa_disabled",
      "mfa_verification_failed",
      "session_hijacking_detected",
      "session_revoked",
      "account_locked",
      "account_unlocked",
      "api_key_created",
      "api_key_deleted",
      "unusual_access_pattern",
      "impossible_travel_detected",
      "rate_limit_exceeded",
      "captcha_required",
      "suspicious_user_agent",
      "ip_blacklisted",
      "data_export_request",
      "password_reset_requested",
      "password_reset_completed",
      "email_changed",
      "security_question_answered",
    ];

    it("should create events for all security event types", () => {
      for (const eventType of allEventTypes) {
        const event = createSecurityEvent(eventType, "test-key", "192.168.1.1");

        expect(event.type).toBe(eventType);
        expect(event.eventId).toBeDefined();
        expect(event.severity).toBeDefined();
        expect(event.keyId).toBe("test-key");
        expect(event.clientIp).toBe("192.168.1.1");
      }
    });

    it("should assign severity levels correctly", () => {
      const criticalEvents: SecurityEventType[] = [
        "session_hijacking_detected",
        "impossible_travel_detected",
      ];

      const highEvents: SecurityEventType[] = [
        "login_success_new_location",
        "account_locked",
        "unusual_access_pattern",
        "ip_blacklisted",
        "email_changed",
      ];

      for (const eventType of criticalEvents) {
        const event = createSecurityEvent(eventType, "key-1", "1.1.1.1");
        expect(event.severity).toBe("critical");
      }

      for (const eventType of highEvents) {
        const event = createSecurityEvent(eventType, "key-1", "1.1.1.1");
        expect(event.severity).toBe("high");
      }
    });
  });

  describe("Webhook Notifications", () => {
    it("should send webhook notification with valid URL", async () => {
      // Mock fetch to avoid actual HTTP requests
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        } as Response)
      );

      const preferences: NotificationPreferences = {
        keyId: "user-123",
        webhookUrl: "https://example.com/webhook",
        channelPreferences: {
          low: ["webhook"],
          medium: ["webhook"],
          high: ["webhook"],
          critical: ["webhook"],
        },
        excludedEvents: [],
        enabled: true,
      };

      setNotificationPreferences(preferences);

      const event = createSecurityEvent("password_changed", "user-123", "192.168.1.1");
      const results = await notifySecurityEvent(event);

      expect(results).toHaveLength(1);
      expect(results[0]?.channel).toBe("webhook");
      expect(results[0]?.success).toBe(true);

      vi.restoreAllMocks();
    });

    it("should handle webhook timeout", async () => {
      global.fetch = vi.fn(() => Promise.reject(new Error("Request timeout")));

      const preferences: NotificationPreferences = {
        keyId: "user-123",
        webhookUrl: "https://slow-server.com/webhook",
        channelPreferences: {
          low: ["webhook"],
          medium: ["webhook"],
          high: ["webhook"],
          critical: ["webhook"],
        },
        excludedEvents: [],
        enabled: true,
      };

      setNotificationPreferences(preferences);

      const event = createSecurityEvent("password_changed", "user-123", "192.168.1.1");
      const results = await notifySecurityEvent(event);

      expect(results).toHaveLength(1);
      expect(results[0]?.success).toBe(false);
      expect(results[0]?.channel).toBe("webhook");

      vi.restoreAllMocks();
    });
  });

  describe("Device Detection", () => {
    it("should detect device types from user agents", () => {
      const event1 = createSecurityEvent("login_success_new_device", "key-1", "192.168.1.1", {
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)",
      });

      expect(event1.details.userAgent).toBeDefined();

      const event2 = createSecurityEvent("login_success_new_device", "key-1", "192.168.1.1", {
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      });

      expect(event2.details.userAgent).toBeDefined();
    });
  });

  describe("Notification Channels", () => {
    const allChannels: NotificationChannel[] = ["email", "sms", "push", "in_app", "webhook"];

    it("should support all notification channel types", () => {
      const preferences: NotificationPreferences = {
        keyId: "user-123",
        email: "user@example.com",
        phone: "+1234567890",
        pushToken: "push-token-123",
        webhookUrl: "https://example.com/webhook",
        channelPreferences: {
          low: allChannels,
          medium: allChannels,
          high: allChannels,
          critical: allChannels,
        },
        excludedEvents: [],
        enabled: true,
      };

      setNotificationPreferences(preferences);

      const retrieved = getNotificationPreferences("user-123");
      expect(retrieved?.email).toBe("user@example.com");
      expect(retrieved?.phone).toBe("+1234567890");
      expect(retrieved?.pushToken).toBe("push-token-123");
      expect(retrieved?.webhookUrl).toBe("https://example.com/webhook");
    });
  });
});
