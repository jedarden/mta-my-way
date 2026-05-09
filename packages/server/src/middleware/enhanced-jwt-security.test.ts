/**
 * Enhanced JWT Security Tests
 *
 * Tests advanced JWT security features including:
 * - Device fingerprinting
 * - Token usage tracking
 * - Compromise detection
 * - Token revocation
 * - Geographic and behavioral analysis
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  type CompromiseDetectionResult,
  type DeviceFingerprint,
  type TokenUsageRecord,
  clearOldTokenUsage,
  detectTokenCompromise,
  flagSuspectedCompromise,
  generateDeviceFingerprint,
  getTokenTrackingStats,
  getTokenUsage,
  isTokenRevoked,
  recordTokenUsage,
  revokeToken,
  unflagSuspectedCompromise,
  unrevokeToken,
} from "./enhanced-jwt-security.js";

describe("Enhanced JWT Security", () => {
  const testTokenId = "test-token-123";

  beforeEach(() => {
    // Clean up before each test
    clearOldTokenUsage(0); // Clear all token usage records
    // Also need to clear revocations and suspected compromises for clean tests
    unrevokeToken(testTokenId);
    unflagSuspectedCompromise(testTokenId);
  });

  describe("Device Fingerprinting", () => {
    it("should generate device fingerprint from user agent", () => {
      const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0";
      const fingerprint = generateDeviceFingerprint(userAgent, "192.168.1.1");

      expect(fingerprint.deviceId).toBeDefined();
      expect(fingerprint.userAgentHash).toBeDefined();
      expect(fingerprint.deviceType).toBe("desktop");
      expect(fingerprint.osFamily).toBe("Windows");
      expect(fingerprint.browserFamily).toBe("Chrome");
    });

    it("should detect mobile devices", () => {
      const userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)";
      const fingerprint = generateDeviceFingerprint(userAgent);

      expect(fingerprint.deviceType).toBe("mobile");
      expect(fingerprint.osFamily).toBe("iOS");
    });

    it("should detect tablets", () => {
      const userAgent = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)";
      const fingerprint = generateDeviceFingerprint(userAgent);

      expect(fingerprint.deviceType).toBe("tablet");
    });

    it("should detect unknown devices", () => {
      const fingerprint = generateDeviceFingerprint("");

      expect(fingerprint.deviceType).toBe("unknown");
    });

    it("should include IP address in fingerprint", () => {
      const ipAddress = "192.168.1.100";
      const fingerprint = generateDeviceFingerprint("test-agent", ipAddress);

      expect(fingerprint.ipAddress).toBe(ipAddress);
    });

    it("should generate consistent device IDs for same user agent", () => {
      const userAgent = "Mozilla/5.0 Chrome/120.0.0.0";
      const fp1 = generateDeviceFingerprint(userAgent);
      const fp2 = generateDeviceFingerprint(userAgent);

      expect(fp1.deviceId).toBe(fp2.deviceId);
    });
  });

  describe("Token Usage Tracking", () => {
    it("should record token usage", () => {
      const record: Omit<TokenUsageRecord, "tokenId"> = {
        usedAt: Date.now(),
        clientIp: "192.168.1.1",
        userAgent: "test-agent",
        requestPath: "/api/trips",
        suspicious: false,
      };

      recordTokenUsage(testTokenId, record);

      const usage = getTokenUsage(testTokenId);
      expect(usage).toHaveLength(1);
      expect(usage[0]?.clientIp).toBe("192.168.1.1");
    });

    it("should keep only last 100 records", () => {
      for (let i = 0; i < 150; i++) {
        recordTokenUsage(testTokenId, {
          usedAt: Date.now() + i,
          clientIp: `192.168.1.${i % 256}`,
          suspicious: false,
        });
      }

      const usage = getTokenUsage(testTokenId);
      expect(usage.length).toBeLessThanOrEqual(100);
    });

    it("should handle multiple tokens", () => {
      recordTokenUsage("token1", { usedAt: Date.now(), clientIp: "1.1.1.1", suspicious: false });
      recordTokenUsage("token2", { usedAt: Date.now(), clientIp: "2.2.2.2", suspicious: false });

      expect(getTokenUsage("token1")).toHaveLength(1);
      expect(getTokenUsage("token2")).toHaveLength(1);
    });

    it("should return empty array for unknown token", () => {
      expect(getTokenUsage("unknown")).toHaveLength(0);
    });
  });

  describe("Compromise Detection", () => {
    it("should allow first-time token usage", () => {
      const result = detectTokenCompromise(testTokenId, {
        clientIp: "192.168.1.1",
        userAgent: "test-agent",
      });

      expect(result.compromised).toBe(false);
      expect(result.riskScore).toBe(0);
    });

    it("should detect IP address change", () => {
      // Record usage from first IP
      recordTokenUsage(testTokenId, {
        usedAt: Date.now(),
        clientIp: "192.168.1.1",
        userAgent: "test-agent",
        suspicious: false,
      });

      // Check from different IP
      const result = detectTokenCompromise(testTokenId, {
        clientIp: "10.0.0.1", // Different subnet (not 192.168.x.x)
        userAgent: "test-agent",
      });

      // Different IP subnet should be detected
      expect(result.analysis.deviceAnomaly).toBe(true);
      expect(result.riskScore).toBeGreaterThan(0);
    });

    it("should detect user agent change", () => {
      recordTokenUsage(testTokenId, {
        usedAt: Date.now(),
        clientIp: "192.168.1.1",
        userAgent: "Mozilla/5.0 Chrome/120.0.0.0",
        suspicious: false,
      });

      const result = detectTokenCompromise(testTokenId, {
        clientIp: "192.168.1.1",
        userAgent: "Mozilla/5.0 Firefox/121.0.0.0",
      });

      // User agent change should be detected as device anomaly
      expect(result.analysis.deviceAnomaly).toBe(true);
      expect(result.riskScore).toBeGreaterThan(0);
    });

    it("should allow same subnet IP change", () => {
      recordTokenUsage(testTokenId, {
        usedAt: Date.now(),
        clientIp: "192.168.1.100",
        userAgent: "test-agent",
        suspicious: false,
      });

      const result = detectTokenCompromise(testTokenId, {
        clientIp: "192.168.1.101", // Same subnet
        userAgent: "test-agent",
      });

      expect(result.compromised).toBe(false);
    });

    it("should detect geographic anomaly", () => {
      recordTokenUsage(testTokenId, {
        usedAt: Date.now(),
        clientIp: "192.168.1.1",
        location: {
          country: "US",
          city: "New York",
          coordinates: { lat: 40.7128, lon: -74.006 },
        },
        suspicious: false,
      });

      const result = detectTokenCompromise(
        testTokenId,
        {
          clientIp: "192.168.1.2",
          location: {
            country: "GB",
            city: "London",
            coordinates: { lat: 51.5074, lon: -0.1278 },
          },
        },
        { maxGeoDistance: 100 } // Only 100km threshold
      );

      expect(result.analysis.geographicAnomaly).toBe(true);
      expect(result.riskScore).toBeGreaterThan(0);
    });

    it("should recommend revoke for high risk scores", () => {
      // Record initial usage
      recordTokenUsage(testTokenId, {
        usedAt: Date.now(),
        clientIp: "192.168.1.1",
        userAgent: "Chrome",
        location: {
          country: "US",
          coordinates: { lat: 40.7128, lon: -74.006 },
        },
        suspicious: false,
      });

      // Check from completely different location with different device
      const result = detectTokenCompromise(
        testTokenId,
        {
          clientIp: "10.0.0.1", // Different subnet
          userAgent: "Firefox", // Different browser
          location: {
            country: "CN", // Different country
            coordinates: { lat: 39.9042, lon: 116.4074 },
          },
        },
        { maxGeoDistance: 100 } // Lower threshold to trigger geographic anomaly
      );

      // With multiple risk factors, should recommend challenge or revoke
      expect(["challenge", "revoke"]).toContain(result.recommendedAction);
      expect(result.riskScore).toBeGreaterThanOrEqual(60);
    });
  });

  describe("Token Revocation", () => {
    it("should revoke token", () => {
      const revocation = revokeToken(testTokenId, "User requested", "admin");

      expect(revocation.tokenId).toBe(testTokenId);
      expect(revocation.reason).toBe("User requested");
      expect(revocation.revokedBy).toBe("admin");
    });

    it("should detect revoked token", () => {
      revokeToken(testTokenId, "Security reason", "admin");

      const revoked = isTokenRevoked(testTokenId);

      expect(revoked).toBeDefined();
      expect(revoked?.tokenId).toBe(testTokenId);
    });

    it("should return undefined for non-revoked token", () => {
      expect(isTokenRevoked("nonexistent")).toBeUndefined();
    });

    it("should unrevoke token", () => {
      revokeToken(testTokenId, "Reason", "admin");
      const unrevokeResult = unrevokeToken(testTokenId);

      expect(unrevokeResult).toBe(true);
      expect(isTokenRevoked(testTokenId)).toBeUndefined();
    });

    it("should return false when unrevoking non-existent revocation", () => {
      const result = unrevokeToken("nonexistent");

      expect(result).toBe(false);
    });

    it("should block revoked tokens in compromise detection", () => {
      revokeToken(testTokenId, "Compromised", "admin");

      const result = detectTokenCompromise(testTokenId, {
        clientIp: "192.168.1.1",
      });

      expect(result.compromised).toBe(true);
      expect(result.riskScore).toBe(100);
      expect(result.riskFactors).toContainEqual("Token has been revoked");
    });
  });

  describe("Suspected Compromise", () => {
    it("should flag suspected compromise", () => {
      // clearOldTokenUsage doesn't clear suspectedCompromises, so we need to unflag first
      unflagSuspectedCompromise(testTokenId);

      const result = flagSuspectedCompromise(testTokenId);

      // Set.add returns the Set itself, but we can check if the token was added
      expect(result.has(testTokenId)).toBe(true);
    });

    it("should detect flagged compromise", () => {
      // Clear any existing revocation first
      unrevokeToken(testTokenId);

      flagSuspectedCompromise(testTokenId);

      const result = detectTokenCompromise(testTokenId, {
        clientIp: "192.168.1.1",
      });

      expect(result.compromised).toBe(true);
      expect(result.riskFactors).toContainEqual("Token is flagged as suspected compromise");
    });

    it("should unflag suspected compromise", () => {
      flagSuspectedCompromise(testTokenId);
      const unflagged = unflagSuspectedCompromise(testTokenId);

      expect(unflagged).toBe(true);
    });

    it("should return false when unflagging non-existent flag", () => {
      const result = unflagSuspectedCompromise("nonexistent");

      expect(result).toBe(false);
    });
  });

  describe("Token Usage Cleanup", () => {
    it("should clear old token usage records", () => {
      const oldTime = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days ago

      recordTokenUsage("old-token", {
        usedAt: oldTime,
        clientIp: "192.168.1.1",
        suspicious: false,
      });

      recordTokenUsage("new-token", {
        usedAt: Date.now(),
        clientIp: "192.168.1.1",
        suspicious: false,
      });

      const cleared = clearOldTokenUsage(7); // Clear records older than 7 days

      expect(cleared).toBeGreaterThan(0);
    });
  });

  describe("Statistics", () => {
    it("should return token tracking stats", () => {
      // Use unique token IDs to avoid conflicts
      const token1 = "stats-token-1";
      const token2 = "stats-token-2";
      const token3 = "stats-token-3";
      const token4 = "stats-token-4";

      recordTokenUsage(token1, { usedAt: Date.now(), clientIp: "1.1.1.1", suspicious: false });
      recordTokenUsage(token2, { usedAt: Date.now(), clientIp: "2.2.2.2", suspicious: false });
      revokeToken(token3, "Reason", "admin");
      flagSuspectedCompromise(token4);

      const stats = getTokenTrackingStats();

      // Should count tokens with usage records, revocations, and suspected compromises
      expect(stats.totalTrackedTokens).toBeGreaterThanOrEqual(2);
      expect(stats.revokedTokens).toBeGreaterThanOrEqual(1);
      expect(stats.suspectedCompromises).toBeGreaterThanOrEqual(1);
    });

    it("should track total usage records", () => {
      // Use a unique token ID for this test
      const uniqueTokenId = "stats-usage-test-token";

      // Clear previous records first
      clearOldTokenUsage(0);

      for (let i = 0; i < 5; i++) {
        recordTokenUsage(uniqueTokenId, {
          usedAt: Date.now() + i,
          clientIp: "192.168.1.1",
          suspicious: false,
        });
      }

      const stats = getTokenTrackingStats();

      // Should have exactly 5 usage records for this token
      const usage = getTokenUsage(uniqueTokenId);
      expect(usage.length).toBe(5);
    });
  });

  describe("Edge Cases", () => {
    it("should handle missing location data", () => {
      recordTokenUsage(testTokenId, {
        usedAt: Date.now(),
        clientIp: "192.168.1.1",
        suspicious: false,
      });

      const result = detectTokenCompromise(testTokenId, {
        clientIp: "192.168.1.2",
      });

      expect(result).toBeDefined();
    });

    it("should handle incomplete coordinates", () => {
      recordTokenUsage(testTokenId, {
        usedAt: Date.now(),
        clientIp: "192.168.1.1",
        location: { country: "US" }, // No coordinates
        suspicious: false,
      });

      const result = detectTokenCompromise(
        testTokenId,
        {
          clientIp: "192.168.1.2",
          location: { country: "US" }, // Same country, still no coordinates
        },
        { enableGeographicValidation: true }
      );

      // Should not flag geographic anomaly for same country without coordinates
      expect(result.analysis.geographicAnomaly).toBe(false);
    });

    it("should handle missing user agent", () => {
      const fingerprint = generateDeviceFingerprint(undefined, "192.168.1.1");

      expect(fingerprint.userAgentHash).toBe("unknown");
    });

    it("should handle empty token ID", () => {
      const result = detectTokenCompromise("", {
        clientIp: "192.168.1.1",
      });

      expect(result).toBeDefined();
    });
  });
});
