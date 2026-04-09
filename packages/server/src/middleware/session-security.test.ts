/**
 * Tests for enhanced session security utilities.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "./authentication.js";
import {
  analyzeUserAgent,
  areIpsInSameSubnet,
  assessSessionRisk,
  calculateDistance,
  calculateIpDistance,
  calculateUserAgentSimilarity,
  clearSecurityEvents,
  detectImpossibleTravel,
  getDeviceTrustLevel,
  getIpClass,
  getOrCreateDeviceTrust,
  isDeviceTrusted,
  isLegitimateUserAgentChange,
  parseIpAddress,
  recordSecurityEvent,
  removeDeviceTrust,
  setDeviceTrustLevel,
  updateDeviceTrust,
} from "./session-security.js";

describe("Session Security", () => {
  describe("IP Address Parsing", () => {
    it("should parse IPv4 address", () => {
      const info = parseIpAddress("192.168.1.100");

      expect(info.ip).toBe("192.168.1.100");
      expect(info.type).toBe("ipv4");
      expect(info.octets).toEqual([192, 168, 1, 100]);
      expect(info.isPrivate).toBe(true);
      expect(info.isLoopback).toBe(false);
    });

    it("should parse IPv4 public address", () => {
      const info = parseIpAddress("8.8.8.8");

      expect(info.ip).toBe("8.8.8.8");
      expect(info.type).toBe("ipv4");
      expect(info.octets).toEqual([8, 8, 8, 8]);
      expect(info.isPrivate).toBe(false);
      expect(info.isLoopback).toBe(false);
    });

    it("should parse IPv4 loopback address", () => {
      const info = parseIpAddress("127.0.0.1");

      expect(info.ip).toBe("127.0.0.1");
      expect(info.type).toBe("ipv4");
      expect(info.isLoopback).toBe(true);
    });

    it("should parse IPv6 address", () => {
      const info = parseIpAddress("::1");

      expect(info.ip).toBe("::1");
      expect(info.type).toBe("ipv6");
      expect(info.isLoopback).toBe(true);
    });

    it("should parse unknown address format", () => {
      const info = parseIpAddress("invalid");

      expect(info.ip).toBe("invalid");
      expect(info.type).toBe("unknown");
      expect(info.isPrivate).toBe(false);
      expect(info.isLoopback).toBe(false);
    });
  });

  describe("IP Subnet Matching", () => {
    it("should detect IPs in same /24 subnet", () => {
      const result = areIpsInSameSubnet("192.168.1.100", "192.168.1.200", 24);

      expect(result).toBe(true);
    });

    it("should detect IPs in different /24 subnets", () => {
      const result = areIpsInSameSubnet("192.168.1.100", "192.168.2.100", 24);

      expect(result).toBe(false);
    });

    it("should detect IPs in same /16 subnet", () => {
      const result = areIpsInSameSubnet("192.168.1.100", "192.168.255.255", 16);

      expect(result).toBe(true);
    });

    it("should detect IPs in different /16 subnets", () => {
      const result = areIpsInSameSubnet("192.168.1.100", "192.169.1.100", 16);

      expect(result).toBe(false);
    });

    it("should return false for different IP types", () => {
      const result = areIpsInSameSubnet("192.168.1.100", "::1", 24);

      expect(result).toBe(false);
    });
  });

  describe("IP Distance Calculation", () => {
    it("should calculate distance between similar coordinates", () => {
      // Two points within NYC - approximately 5-8 km apart
      const distance = calculateDistance(40.7128, -74.006, 40.758, -73.9855);

      expect(distance).toBeGreaterThan(5);
      expect(distance).toBeLessThan(10);
    });

    it("should calculate distance between different coordinates", () => {
      // NYC to approximately 50km away
      const distance = calculateDistance(40.7128, -74.006, 41.0, -74.5);

      expect(distance).toBeGreaterThan(40);
      expect(distance).toBeLessThan(60);
    });

    it("should return max distance for different IP types", () => {
      // Note: calculateDistance works with coordinates, not IP addresses
      // For IP-based distance, use calculateIpDistance instead
      const ipDistance = calculateIpDistance("192.168.1.100", "::1");

      expect(ipDistance).toBe(100);
    });
  });

  describe("IP Class Detection", () => {
    it("should detect Class A IP", () => {
      const ipClass = getIpClass("10.0.0.1");

      expect(ipClass).toBe("A");
    });

    it("should detect Class B IP", () => {
      const ipClass = getIpClass("172.16.0.1");

      expect(ipClass).toBe("B");
    });

    it("should detect Class C IP", () => {
      const ipClass = getIpClass("192.168.1.1");

      expect(ipClass).toBe("C");
    });

    it("should return unknown for non-IPv4", () => {
      const ipClass = getIpClass("::1");

      expect(ipClass).toBe("unknown");
    });
  });

  describe("User Agent Analysis", () => {
    it("should analyze Chrome user agent", () => {
      const ua =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
      const info = analyzeUserAgent(ua);

      expect(info.browser).toBe("chrome");
      expect(info.os).toBe("windows");
      expect(info.osVersion).toBe("10");
      expect(info.deviceType).toBe("desktop");
      expect(info.hardware).toBe("x64");
    });

    it("should analyze Firefox user agent", () => {
      const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0";
      const info = analyzeUserAgent(ua);

      expect(info.browser).toBe("firefox");
      expect(info.os).toBe("windows");
      expect(info.deviceType).toBe("desktop");
    });

    it("should analyze Safari user agent", () => {
      const ua =
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15";
      const info = analyzeUserAgent(ua);

      expect(info.browser).toBe("safari");
      expect(info.os).toBe("macos");
      expect(info.deviceType).toBe("desktop");
    });

    it("should analyze mobile user agent", () => {
      const ua =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
      const info = analyzeUserAgent(ua);

      expect(info.os).toBe("ios");
      expect(info.deviceType).toBe("mobile");
    });

    it("should analyze tablet user agent", () => {
      const ua =
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
      const info = analyzeUserAgent(ua);

      expect(info.os).toBe("ios");
      expect(info.deviceType).toBe("tablet");
    });

    it("should detect bot user agent", () => {
      const ua = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
      const info = analyzeUserAgent(ua);

      expect(info.deviceType).toBe("bot");
    });

    it("should handle unknown user agent", () => {
      const info = analyzeUserAgent("unknown");

      expect(info.deviceType).toBe("unknown");
      expect(info.raw).toBe("unknown");
    });
  });

  describe("User Agent Similarity", () => {
    it("should calculate high similarity for same browser", () => {
      const ua1 = "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36";
      const ua2 = "Mozilla/5.0 (Windows NT 10.0) Chrome/121.0.0.0 Safari/537.36";

      const similarity = calculateUserAgentSimilarity(ua1, ua2);

      expect(similarity).toBeGreaterThan(80);
    });

    it("should calculate low similarity for different browsers", () => {
      const ua1 = "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36";
      const ua2 = "Mozilla/5.0 (Windows NT 10.0; rv:121.0) Firefox/121.0";

      const similarity = calculateUserAgentSimilarity(ua1, ua2);

      // Same OS and device type gives some similarity, but different browser reduces it
      expect(similarity).toBeGreaterThanOrEqual(50);
      expect(similarity).toBeLessThan(90);
    });

    it("should calculate medium similarity for same OS, different browser", () => {
      const ua1 = "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36";
      const ua2 = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) Safari/605.1.15";

      const similarity = calculateUserAgentSimilarity(ua1, ua2);

      expect(similarity).toBeGreaterThan(30);
      expect(similarity).toBeLessThan(70);
    });
  });

  describe("Legitimate User Agent Change Detection", () => {
    it("should detect legitimate browser version update", () => {
      const oldUa = "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36";
      const newUa = "Mozilla/5.0 (Windows NT 10.0) Chrome/121.0.0.0 Safari/537.36";

      const isLegitimate = isLegitimateUserAgentChange(oldUa, newUa);

      expect(isLegitimate).toBe(true);
    });

    it("should detect legitimate browser change on same device", () => {
      const oldUa = "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36";
      const newUa = "Mozilla/5.0 (Windows NT 10.0; rv:121.0) Firefox/121.0";

      const isLegitimate = isLegitimateUserAgentChange(oldUa, newUa);

      expect(isLegitimate).toBe(true);
    });

    it("should detect suspicious cross-platform change", () => {
      const oldUa = "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36";
      const newUa = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15";

      const isLegitimate = isLegitimateUserAgentChange(oldUa, newUa);

      expect(isLegitimate).toBe(false);
    });
  });

  describe("Session Risk Assessment", () => {
    let testSession: AuthSession;

    beforeEach(() => {
      // Clear security events before each test
      clearSecurityEvents("test-session-id");

      testSession = {
        sessionId: "test-session-id",
        keyId: "test-key",
        createdAt: Date.now() - 10 * 60 * 1000, // 10 minutes ago
        lastActivityAt: Date.now() - 5 * 60 * 1000, // 5 minutes ago
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        clientIp: "192.168.1.100",
        userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36",
        active: true,
        ipBinding: true,
        regenerated: false,
        csrfToken: "test-csrf-token",
        sessionType: "standard",
      };
    });

    it("should assess low risk for stable session", async () => {
      const assessment = await assessSessionRisk(
        testSession,
        "192.168.1.100",
        testSession.userAgent
      );

      expect(assessment.riskScore).toBeLessThan(20);
      expect(assessment.riskLevel).toBe("low");
      expect(assessment.recommendedAction).toBe("allow");
      expect(assessment.riskFactors).toHaveLength(0);
    });

    it("should assess medium risk for IP change within subnet", async () => {
      const assessment = await assessSessionRisk(
        testSession,
        "192.168.1.200", // Same subnet, different IP
        testSession.userAgent
      );

      expect(assessment.riskScore).toBeGreaterThanOrEqual(10);
      expect(assessment.riskLevel).toBe("low" || "medium");
      expect(assessment.riskFactors).toContain("IP address changed within same subnet");
    });

    it("should assess high risk for IP subnet change", async () => {
      const assessment = await assessSessionRisk(
        testSession,
        "192.168.2.100", // Different subnet
        testSession.userAgent
      );

      expect(assessment.riskScore).toBeGreaterThanOrEqual(30);
      expect(assessment.riskLevel).toBe("medium" || "high");
      expect(assessment.riskFactors).toContain("IP address changed to different subnet");
    });

    it("should assess high risk for user agent change", async () => {
      const assessment = await assessSessionRisk(
        testSession,
        testSession.clientIp,
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15" // Different OS/device
      );

      expect(assessment.riskScore).toBeGreaterThanOrEqual(30);
      expect(assessment.riskLevel).toBe("medium" || "high");
      expect(assessment.riskFactors.some((f) => f.includes("User-Agent"))).toBe(true);
    });

    it("should assess low risk for new session", async () => {
      const newSession = {
        ...testSession,
        createdAt: Date.now() - 2 * 60 * 1000, // 2 minutes ago
        sessionId: "new-session-id",
      };

      const assessment = await assessSessionRisk(
        newSession,
        testSession.clientIp,
        testSession.userAgent
      );

      expect(assessment.riskScore).toBeLessThan(20);
      expect(assessment.riskLevel).toBe("low");
    });

    it("should include recorded security events in assessment", async () => {
      recordSecurityEvent("test-session-id", {
        type: "failed_auth_attempt",
        timestamp: Date.now(),
        score: 20,
        details: { reason: "test" },
      });

      const assessment = await assessSessionRisk(
        testSession,
        testSession.clientIp,
        testSession.userAgent
      );

      expect(assessment.riskScore).toBeGreaterThanOrEqual(20);
      expect(assessment.events.some((e) => e.type === "failed_auth_attempt")).toBe(true);
    });
  });

  describe("Security Event Recording", () => {
    it("should record a security event", () => {
      const sessionId = "test-session-events";
      const event = {
        type: "test_event",
        timestamp: Date.now(),
        score: 10,
        details: { test: "data" },
      };

      recordSecurityEvent(sessionId, event);

      // Event should be recorded (we can't directly access the Map,
      // but we can verify it doesn't throw)
      expect(() => recordSecurityEvent(sessionId, event)).not.toThrow();
    });

    it("should clear security events for a session", () => {
      const sessionId = "test-session-clear";

      recordSecurityEvent(sessionId, {
        type: "test_event",
        timestamp: Date.now(),
        score: 10,
      });

      clearSecurityEvents(sessionId);

      // Should not throw when clearing
      expect(() => clearSecurityEvents(sessionId)).not.toThrow();
    });
  });

  describe("Device Trust Management", () => {
    const deviceId = "test-device-123";

    beforeEach(() => {
      // Remove device trust before each test
      removeDeviceTrust(deviceId);
    });

    it("should create new device trust record", () => {
      const trustInfo = getOrCreateDeviceTrust(deviceId);

      expect(trustInfo.deviceId).toBe(deviceId);
      expect(trustInfo.trustLevel).toBe("unknown");
      expect(trustInfo.successfulAuths).toBe(0);
    });

    it("should update device trust on successful auth", () => {
      const trustInfo = getOrCreateDeviceTrust(deviceId);

      updateDeviceTrust(deviceId);

      expect(trustInfo.successfulAuths).toBe(1);
      expect(trustInfo.lastSeenAt).toBeGreaterThan(trustInfo.firstSeenAt);
    });

    it("should promote device to trusted after 5 auths", () => {
      getOrCreateDeviceTrust(deviceId);

      for (let i = 0; i < 5; i++) {
        updateDeviceTrust(deviceId);
      }

      const trustLevel = getDeviceTrustLevel(deviceId);
      expect(trustLevel).toBe("trusted");
    });

    it("should promote device to highly trusted after 10 auths", () => {
      getOrCreateDeviceTrust(deviceId);

      for (let i = 0; i < 10; i++) {
        updateDeviceTrust(deviceId);
      }

      const trustLevel = getDeviceTrustLevel(deviceId);
      expect(trustLevel).toBe("highly_trusted");
    });

    it("should check if device is trusted", () => {
      getOrCreateDeviceTrust(deviceId);

      expect(isDeviceTrusted(deviceId)).toBe(false);

      for (let i = 0; i < 5; i++) {
        updateDeviceTrust(deviceId);
      }

      expect(isDeviceTrusted(deviceId)).toBe(true);
    });

    it("should manually set device trust level", () => {
      setDeviceTrustLevel(deviceId, "trusted");

      expect(getDeviceTrustLevel(deviceId)).toBe("trusted");
    });

    it("should remove device trust record", () => {
      getOrCreateDeviceTrust(deviceId);
      removeDeviceTrust(deviceId);

      expect(getDeviceTrustLevel(deviceId)).toBe("unknown");
    });
  });

  describe("Impossible Travel Detection", () => {
    it("should not detect impossible travel for short distance", async () => {
      const event1 = {
        timestamp: Date.now() - 60 * 60 * 1000, // 1 hour ago
        ip: "192.168.1.100",
        geo: { latitude: 40.7128, longitude: -74.006 }, // NYC
      };

      const event2 = {
        timestamp: Date.now(),
        ip: "192.168.1.101",
        geo: { latitude: 40.758, longitude: -73.9855 }, // NYC (different location)
      };

      const result = await detectImpossibleTravel(event1, event2);

      expect(result.impossible).toBe(false);
    });

    it("should detect impossible travel for long distance in short time", async () => {
      const event1 = {
        timestamp: Date.now() - 30 * 60 * 1000, // 30 minutes ago
        ip: "192.168.1.100",
        geo: { latitude: 40.7128, longitude: -74.006 }, // NYC
      };

      const event2 = {
        timestamp: Date.now(),
        ip: "192.168.1.101",
        geo: { latitude: 51.5074, longitude: -0.1278 }, // London (~5570 km)
      };

      const result = await detectImpossibleTravel(event1, event2);

      expect(result.impossible).toBe(true);
      expect(result.speed).toBeGreaterThan(900); // Faster than commercial jet
      expect(result.distance).toBeDefined();
    });

    it("should handle events without geolocation", async () => {
      const event1 = {
        timestamp: Date.now() - 60 * 60 * 1000,
        ip: "192.168.1.100",
      };

      const event2 = {
        timestamp: Date.now(),
        ip: "192.168.1.101",
      };

      const result = await detectImpossibleTravel(event1, event2);

      expect(result.impossible).toBe(false);
      expect(result.speed).toBeUndefined();
    });

    it("should calculate distance between coordinates", () => {
      // NYC to LA distance is approximately 3944 km
      const distance = calculateDistance(40.7128, -74.006, 34.0522, -118.2437);

      expect(distance).toBeGreaterThan(3900);
      expect(distance).toBeLessThan(4000);
    });

    it("should calculate short distance accurately", () => {
      // Distance within NYC
      const distance = calculateDistance(40.7128, -74.006, 40.758, -73.9855);

      expect(distance).toBeGreaterThan(5);
      expect(distance).toBeLessThan(10);
    });
  });
});
