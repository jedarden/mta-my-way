/**
 * Concurrent Session Management Tests
 *
 * Tests session management features including:
 * - Session registration and tracking
 * - Concurrent session limits
 * - Session conflict resolution
 * - Device-based session limits
 * - Session cleanup
 * - Session pinning
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { AuthSession } from "./authentication.js";
import {
  type ConcurrentSessionConfig,
  type ConflictResolution,
  type SessionDeviceInfo,
  type SessionPriority,
  cleanupExpiredSessions,
  clearAllSessions,
  getDeviceSessionCount,
  getSessionStats,
  getUserSessionCount,
  getUserSessions,
  pinSession,
  registerSession,
  startSessionCleanup,
  stopSessionCleanup,
  terminateAllOtherSessions,
  terminateAllUserSessions,
  terminateSession,
  unpinSession,
  updateSessionActivity,
} from "./concurrent-session-management.js";

describe("Concurrent Session Management", () => {
  const mockSession = (keyId: string, sessionId: string): AuthSession => ({
    sessionId,
    keyId,
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600000, // 1 hour
    clientIp: "192.168.1.1",
    userAgent: "test-agent",
    lastActivityAt: Date.now(),
  });

  const mockDeviceInfo = (deviceId: string): SessionDeviceInfo => ({
    deviceId,
    deviceType: "desktop",
    trusted: false,
  });

  beforeEach(() => {
    clearAllSessions();
  });

  describe("Session Registration", () => {
    it("should register a new session", () => {
      const session = mockSession("user1", "session1");
      const result = registerSession(session);

      expect(result.allowed).toBe(true);
      expect(result.terminatedSessions).toHaveLength(0);
      expect(getUserSessionCount("user1")).toBe(1);
    });

    it("should register session with device info", () => {
      const session = mockSession("user1", "session1");
      const deviceInfo = mockDeviceInfo("device1");

      registerSession(session, { deviceInfo });

      expect(getDeviceSessionCount("device1")).toBe(1);
    });

    it("should register session with priority", () => {
      const session = mockSession("user1", "session1");
      const result = registerSession(session, { priority: "high" });

      expect(result.allowed).toBe(true);
      const sessions = getUserSessions("user1");
      expect(sessions[0]?.priority).toBe("high");
    });

    it("should allow multiple sessions under default limit", () => {
      const config = { maxConcurrentSessions: 5 };

      for (let i = 0; i < 3; i++) {
        const session = mockSession("user1", `session${i}`);
        const result = registerSession(session, {}, config);
        expect(result.allowed).toBe(true);
      }

      expect(getUserSessionCount("user1")).toBe(3);
    });
  });

  describe("Concurrent Session Limits", () => {
    it("should enforce max concurrent sessions with deny_new strategy", () => {
      const config = {
        maxConcurrentSessions: 2,
        conflictResolution: "deny_new" as ConflictResolution,
      };

      const session1 = mockSession("user1", "session1");
      const session2 = mockSession("user1", "session2");
      const session3 = mockSession("user1", "session3");

      expect(registerSession(session1, {}, config).allowed).toBe(true);
      expect(registerSession(session2, {}, config).allowed).toBe(true);
      const result3 = registerSession(session3, {}, config);

      expect(result3.allowed).toBe(false);
      expect(result3.reason).toContain("Maximum concurrent sessions");
    });

    it("should terminate oldest session with terminate_oldest strategy", async () => {
      const config = {
        maxConcurrentSessions: 2,
        conflictResolution: "terminate_oldest" as ConflictResolution,
      };

      const session1 = mockSession("user1", "session1");
      const session2 = mockSession("user1", "session2");
      const session3 = mockSession("user1", "session3");

      registerSession(session1, {}, config);
      await new Promise((resolve) => setTimeout(resolve, 10)); // Ensure time difference
      registerSession(session2, {}, config);

      const result3 = registerSession(session3, {}, config);

      expect(result3.allowed).toBe(true);
      expect(result3.terminatedSessions).toHaveLength(1);
      expect(result3.terminatedSessions[0]).toBe("session1"); // Oldest terminated
    });

    it("should terminate lowest priority session with terminate_lowest_priority strategy", () => {
      const config = {
        maxConcurrentSessions: 2,
        conflictResolution: "terminate_lowest_priority" as ConflictResolution,
      };

      const session1 = mockSession("user1", "session1");
      const session2 = mockSession("user1", "session2");
      const session3 = mockSession("user1", "session3");

      registerSession(session1, { priority: "high" as SessionPriority }, config);
      registerSession(session2, { priority: "low" as SessionPriority }, config);

      const result3 = registerSession(session3, {}, config);

      expect(result3.allowed).toBe(true);
      expect(result3.terminatedSessions[0]).toBe("session2"); // Low priority terminated
    });

    it("should allow all sessions with allow_all strategy", () => {
      const config = {
        maxConcurrentSessions: 2,
        conflictResolution: "allow_all" as ConflictResolution,
      };

      for (let i = 0; i < 5; i++) {
        const session = mockSession("user1", `session${i}`);
        const result = registerSession(session, {}, config);
        expect(result.allowed).toBe(true);
      }

      expect(getUserSessionCount("user1")).toBe(5);
    });
  });

  describe("Device Session Limits", () => {
    it("should enforce max sessions per device", () => {
      const config = { maxSessionsPerDevice: 2 };
      const deviceInfo = mockDeviceInfo("device1");

      const session1 = mockSession("user1", "session1");
      const session2 = mockSession("user1", "session2");
      const session3 = mockSession("user1", "session3");

      registerSession(session1, { deviceInfo }, config);
      registerSession(session2, { deviceInfo }, config);
      const result3 = registerSession(session3, { deviceInfo }, config);

      expect(result3.warnings).toContainEqual(
        expect.stringContaining("Maximum sessions per device reached")
      );
      expect(getDeviceSessionCount("device1")).toBe(2);
    });
  });

  describe("Session Termination", () => {
    it("should terminate a specific session", () => {
      const session1 = mockSession("user1", "session1");
      const session2 = mockSession("user1", "session2");

      registerSession(session1);
      registerSession(session2);

      expect(terminateSession("session1")).toBe(true);
      expect(getUserSessionCount("user1")).toBe(1);
    });

    it("should return false when terminating non-existent session", () => {
      expect(terminateSession("nonexistent")).toBe(false);
    });

    it("should terminate all user sessions", () => {
      registerSession(mockSession("user1", "session1"));
      registerSession(mockSession("user1", "session2"));
      registerSession(mockSession("user2", "session3"));

      const count = terminateAllUserSessions("user1");

      expect(count).toBe(2);
      expect(getUserSessionCount("user1")).toBe(0);
      expect(getUserSessionCount("user2")).toBe(1);
    });

    it("should terminate all sessions except specified one", () => {
      registerSession(mockSession("user1", "session1"));
      registerSession(mockSession("user1", "session2"));
      registerSession(mockSession("user1", "session3"));

      const count = terminateAllOtherSessions("user1", "session2");

      expect(count).toBe(2);
      expect(getUserSessions("user1")).toHaveLength(1);
      expect(getUserSessions("user1")[0]?.sessionId).toBe("session2");
    });
  });

  describe("Session Pinning", () => {
    it("should pin a session", () => {
      const session = mockSession("user1", "session1");
      registerSession(session);

      expect(pinSession("session1")).toBe(true);

      const sessions = getUserSessions("user1");
      expect(sessions[0]?.pinned).toBe(true);
    });

    it("should not terminate pinned sessions", async () => {
      const config = {
        maxConcurrentSessions: 2,
        conflictResolution: "terminate_oldest" as ConflictResolution,
      };

      const session1 = mockSession("user1", "session1");
      const session2 = mockSession("user1", "session2");
      const session3 = mockSession("user1", "session3");

      registerSession(session1, { pinned: true }, config);
      await new Promise((resolve) => setTimeout(resolve, 10));
      registerSession(session2, {}, config);

      const result3 = registerSession(session3, {}, config);

      expect(result3.terminatedSessions[0]).not.toBe("session1"); // Pinned session not terminated
    });

    it("should unpin a session", () => {
      const session = mockSession("user1", "session1");
      registerSession(session, { pinned: true });

      expect(unpinSession("session1")).toBe(true);

      const sessions = getUserSessions("user1");
      expect(sessions[0]?.pinned).toBe(false);
    });
  });

  describe("Session Activity", () => {
    it("should update session activity", async () => {
      const session = mockSession("user1", "session1");
      registerSession(session);

      await new Promise((resolve) => setTimeout(resolve, 10));
      const updated = updateSessionActivity("session1");

      expect(updated).toBe(true);

      const sessions = getUserSessions("user1");
      expect(sessions[0]?.lastActivityAt).toBeGreaterThan(session.createdAt);
    });

    it("should return false for non-existent session", () => {
      expect(updateSessionActivity("nonexistent")).toBe(false);
    });
  });

  describe("Session Cleanup", () => {
    it("should clean up expired sessions", () => {
      const now = Date.now();
      const expiredSession: AuthSession = {
        sessionId: "expired",
        keyId: "user1",
        createdAt: now - 100000,
        expiresAt: now - 1000, // Expired
        clientIp: "192.168.1.1",
        userAgent: "test",
        lastActivityAt: now - 1000,
      };

      const validSession = mockSession("user1", "valid");

      registerSession(expiredSession);
      registerSession(validSession);

      const result = cleanupExpiredSessions();

      expect(result.cleaned).toBe(1);
      expect(getUserSessionCount("user1")).toBe(1);
    });

    it("should clean up idle sessions", async () => {
      const config = { maxIdleTime: 100 }; // 100ms

      const session = mockSession("user1", "session1");
      registerSession(session);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const result = cleanupExpiredSessions(config);

      expect(result.cleaned).toBe(1);
    });
  });

  describe("Statistics", () => {
    it("should return session statistics", () => {
      registerSession(mockSession("user1", "session1"), { priority: "high" as SessionPriority });
      registerSession(mockSession("user1", "session2"), { priority: "low" as SessionPriority });
      registerSession(mockSession("user2", "session3"), { pinned: true });

      const stats = getSessionStats();

      expect(stats.totalUsers).toBe(2);
      expect(stats.totalSessions).toBe(3);
      expect(stats.sessionsByPriority.high).toBe(1);
      expect(stats.sessionsByPriority.low).toBe(1);
      expect(stats.pinnedSessions).toBe(1);
    });
  });

  describe("Auto-cleanup Interval", () => {
    it("should start and stop cleanup interval", () => {
      expect(startSessionCleanup()).toBeUndefined(); // Already defined, should not error
      expect(stopSessionCleanup()).toBeUndefined(); // Should not error
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty sessions gracefully", () => {
      expect(getUserSessions("nonexistent")).toHaveLength(0);
      expect(getUserSessionCount("nonexistent")).toBe(0);
    });

    it("should handle device limits without device info", () => {
      const session = mockSession("user1", "session1");
      const result = registerSession(session, {}, { maxSessionsPerDevice: 1 });

      expect(result.allowed).toBe(true);
    });

    it("should handle all sessions pinned scenario", () => {
      const config = {
        maxConcurrentSessions: 2,
        conflictResolution: "terminate_oldest" as ConflictResolution,
      };

      registerSession(mockSession("user1", "session1"), { pinned: true }, config);
      registerSession(mockSession("user1", "session2"), { pinned: true }, config);

      const result3 = registerSession(mockSession("user1", "session3"), {}, config);

      expect(result3.allowed).toBe(false);
      expect(result3.reason).toContain("All existing sessions are pinned");
    });
  });
});
