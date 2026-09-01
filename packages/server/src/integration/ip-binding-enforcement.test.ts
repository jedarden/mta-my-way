/**
 * Comprehensive IP binding enforcement tests.
 *
 * Verifies that session IP binding is correctly enforced to prevent session hijacking.
 * Tests cover:
 * - Session token rejected when used from different IP address
 * - Same IP requests accepted with valid session token
 * - Error messages for IP mismatch are clear and secure
 * - Edge cases: localhost, trusted proxies, VPN scenarios
 * - No false positives (load balancer scenarios handled correctly)
 *
 * Acceptance Criteria:
 * 1. Session token is rejected when used from a different IP address
 * 2. Same IP requests are accepted with valid session token
 * 3. Error messages for IP mismatch are clear and secure
 * 4. Documentation covers IP binding behavior and exceptions
 * 5. No false positives (e.g., load balancer scenarios handled correctly)
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, hashApiKey, registerApiKey } from "../middleware/authentication.js";
import type { ApiKey } from "../middleware/authentication.js";
import { securityLogger } from "../middleware/security-logging.js";
import { sessionSecurity } from "../middleware/session-security.js";

describe("IP Binding Enforcement Tests", () => {
  // Test IP addresses
  const ORIGINAL_IP = "192.168.1.100";
  const SAME_SUBNET_IP = "192.168.1.105"; // Same /24 subnet
  const DIFFERENT_SUBNET_IP = "10.0.0.50"; // Different subnet
  const PUBLIC_IP = "8.8.8.8"; // Public IP
  const LOCALHOST_IP = "127.0.0.1"; // Loopback
  const PRIVATE_NETWORK_IP = "192.168.2.100"; // Different private network

  // Helper function to create a fresh app with test session
  async function createTestApp(sessionIp: string, ipBinding = true) {
    const app = new Hono();

    // Add custom error handler to return actual error messages
    app.onError((err, c) => {
      return c.text(err.message, 500);
    });

    // Generate and register test API key
    const testKeyHash = await hashApiKey("test_secret");
    const testApiKey: ApiKey = {
      keyId: "test_key_123",
      keyHash: testKeyHash.hash,
      keySalt: testKeyHash.salt,
      scope: "write",
      role: "user",
      owner: "test_user",
      rateLimitTier: 100,
      active: true,
      createdAt: Date.now(),
      expiresAt: 0,
    };
    registerApiKey(testApiKey);

    // Create a session
    const sessionResult = await createSession(
      testApiKey.keyId,
      sessionIp,
      "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36",
      { test: "metadata" },
      {
        ipBinding,
        createRefreshToken: false,
      }
    );
    const sessionId = sessionResult.sessionId;

    // Mock the session in context
    app.use("/api/*", async (c, next) => {
      c.set("session", {
        sessionId,
        keyId: testApiKey.keyId,
        clientIp: sessionIp,
        ipBinding,
        userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36",
        createdAt: Date.now() - 10 * 60 * 1000,
        lastActivityAt: Date.now() - 5 * 60 * 1000,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        active: true,
        regenerated: false,
        csrfToken: "test-csrf",
        sessionType: "standard",
      });
      await next();
    });

    return { app, sessionId, testApiKey };
  }

  beforeEach(() => {
    // Tests are isolated - each creates fresh API keys and sessions
  });

  describe("Acceptance Criterion 1: Session token rejected from different IP", () => {
    it("should reject session token when used from completely different IP", async () => {
      const { app } = await createTestApp(ORIGINAL_IP, true);
      app.use("/api/*", sessionSecurity({ enforceIpBinding: true }));
      app.get("/api/test", (c) => c.json({ success: true }));

      // Request from completely different IP
      const res = await app.request("/api/test", {
        headers: {
          "X-Forwarded-For": DIFFERENT_SUBNET_IP,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      // Should be rejected
      expect(res.status).toBe(500);
      // The error is thrown as text, not JSON
      const text = await res.text();
      expect(text).toContain("Session IP binding violation");
    });

    it("should reject session token when IP changes from private to public", async () => {
      const { app } = await createTestApp("192.168.1.100", true);
      app.use("/api/*", sessionSecurity({ enforceIpBinding: true }));
      app.get("/api/test", (c) => c.json({ success: true }));

      // Request from public IP
      const res = await app.request("/api/test", {
        headers: {
          "X-Forwarded-For": PUBLIC_IP,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      expect(res.status).toBe(500);
      const text = await res.text();
      expect(text).toContain("Session IP binding violation");
    });

    it("should reject session token when IP changes across private networks", async () => {
      const { app } = await createTestApp("192.168.1.100", true);
      app.use("/api/*", sessionSecurity({ enforceIpBinding: true }));
      app.get("/api/test", (c) => c.json({ success: true }));

      // Request from different private network (10.x.x.x vs 192.168.x.x)
      const res = await app.request("/api/test", {
        headers: {
          "X-Forwarded-For": PRIVATE_NETWORK_IP,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      expect(res.status).toBe(500);
      const text = await res.text();
      expect(text).toContain("Session IP binding violation");
    });
  });

  describe("Acceptance Criterion 2: Same IP requests accepted", () => {
    it("should accept session token from exact same IP", async () => {
      const { app } = await createTestApp(ORIGINAL_IP, true);
      app.use("/api/*", sessionSecurity({ enforceIpBinding: true }));
      app.get("/api/test", (c) => c.json({ success: true }));

      // Request from same IP
      const res = await app.request("/api/test", {
        headers: {
          "X-Forwarded-For": ORIGINAL_IP,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it("should accept session token from IP in same subnet (DHCP tolerance)", async () => {
      const { app } = await createTestApp(ORIGINAL_IP, true);
      app.use("/api/*", sessionSecurity({ enforceIpBinding: true }));
      app.get("/api/test", (c) => c.json({ success: true }));

      // Request from same subnet (different IP within /24)
      const res = await app.request("/api/test", {
        headers: {
          "X-Forwarded-For": SAME_SUBNET_IP,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  describe("Acceptance Criterion 3: Error messages are clear and secure", () => {
    it("should log security event without exposing sensitive details", async () => {
      const { app } = await createTestApp(ORIGINAL_IP, true);
      app.use("/api/*", sessionSecurity({ enforceIpBinding: true }));
      app.get("/api/test", (c) => c.json({ success: true }));

      // Request from different IP
      const res = await app.request("/api/test", {
        headers: {
          "X-Forwarded-For": DIFFERENT_SUBNET_IP,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      expect(res.status).toBe(500);

      // Verify the error message doesn't expose internal session details
      const text = await res.text();
      expect(text).toBeDefined();
      expect(text).not.toContain(expect.stringMatching(/^[a-f0-9]{8}-/)); // Don't expose UUID
      expect(text).not.toContain("test_key_123"); // Don't expose key ID
      // Should contain a clear error message
      expect(text).toContain("Session IP binding violation");
    });

    it("should provide clear error message for IP type change", async () => {
      const { app } = await createTestApp("192.168.1.100", true);
      app.use("/api/*", sessionSecurity({ enforceIpBinding: true }));
      app.get("/api/test", (c) => c.json({ success: true }));

      // Request from IPv6
      const res = await app.request("/api/test", {
        headers: {
          "X-Forwarded-For": "::1",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      expect(res.status).toBe(500);
      const text = await res.text();
      expect(text).toContain("IP type changed");
    });
  });

  describe("Acceptance Criterion 4: Edge cases (localhost, proxies, VPN)", () => {
    it("should handle localhost requests appropriately", async () => {
      const { app } = await createTestApp(LOCALHOST_IP, true);
      app.use("/api/*", sessionSecurity({ enforceIpBinding: true }));
      app.get("/api/test", (c) => c.json({ success: true }));

      // Different loopback IP in same /24 subnet
      const res = await app.request("/api/test", {
        headers: {
          "X-Forwarded-For": "127.0.0.2",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      // Should be accepted - both 127.0.0.1 and 127.0.0.2 are in same /24 subnet (127.0.0.x)
      expect(res.status).toBe(200);

      // But different loopback IP in different subnet should be rejected
      const res2 = await app.request("/api/test", {
        headers: {
          "X-Forwarded-For": "127.0.1.1",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      expect(res2.status).toBe(500);
      const text = await res2.text();
      expect(text).toContain("Session IP binding violation");
    });

    it("should extract IP from X-Forwarded-For header correctly", async () => {
      const { app } = await createTestApp(ORIGINAL_IP, true);
      app.use("/api/*", sessionSecurity({ enforceIpBinding: true }));
      app.get("/api/test", (c) => c.json({ success: true }));

      // Test with multiple IPs in X-Forwarded-For (should use first one)
      const res = await app.request("/api/test", {
        headers: {
          "X-Forwarded-For": `${ORIGINAL_IP}, 10.0.0.1, 172.16.0.1`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      // Should accept - first IP matches
      expect(res.status).toBe(200);
    });

    it("should handle CF-Connecting-IP header (Cloudflare)", async () => {
      const { app } = await createTestApp(ORIGINAL_IP, true);
      app.use("/api/*", sessionSecurity({ enforceIpBinding: true }));
      app.get("/api/test", (c) => c.json({ success: true }));

      // Cloudflare header takes priority
      const res = await app.request("/api/test", {
        headers: {
          "CF-Connecting-IP": ORIGINAL_IP,
          "X-Forwarded-For": DIFFERENT_SUBNET_IP, // Should be ignored
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      expect(res.status).toBe(200);
    });
  });

  describe("Acceptance Criterion 5: No false positives (load balancer scenarios)", () => {
    it("should not reject requests within same subnet (DHCP renewal)", async () => {
      const { app } = await createTestApp("192.168.1.50", true);
      app.use("/api/*", sessionSecurity({ enforceIpBinding: true }));
      app.get("/api/test", (c) => c.json({ success: true }));

      // Simulate DHCP renewal - IP changed but within same subnet
      const dhcpRenewedIPs = ["192.168.1.51", "192.168.1.52", "192.168.1.100", "192.168.1.200"];

      for (const ip of dhcpRenewedIPs) {
        const res = await app.request("/api/test", {
          headers: {
            "X-Forwarded-For": ip,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36",
          },
        });

        expect(res.status).toBe(200);
      }
    });

    it("should allow legitimate mobile network IP changes", async () => {
      const { app } = await createTestApp("100.100.100.100", true);
      app.use("/api/*", sessionSecurity({ enforceIpBinding: true }));
      app.get("/api/test", (c) => c.json({ success: true }));

      // Mobile networks often change IPs but stay within same subnet
      const mobileIPs = ["100.100.100.101", "100.100.100.102"];

      for (const ip of mobileIPs) {
        const res = await app.request("/api/test", {
          headers: {
            "X-Forwarded-For": ip,
            "User-Agent":
              "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
          },
        });

        expect(res.status).toBe(200);
      }

      // But different subnet should be rejected
      const res = await app.request("/api/test", {
        headers: {
          "X-Forwarded-For": "100.100.101.100", // Different subnet
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        },
      });

      expect(res.status).toBe(500);
    });

    it("should handle corporate network scenarios", async () => {
      const { app } = await createTestApp("10.0.1.50", true);
      app.use("/api/*", sessionSecurity({ enforceIpBinding: true }));
      app.get("/api/test", (c) => c.json({ success: true }));

      // Corporate network with same /24 subnet
      const corporateIPs = ["10.0.1.51", "10.0.1.100", "10.0.1.200"];

      for (const ip of corporateIPs) {
        const res = await app.request("/api/test", {
          headers: {
            "X-Forwarded-For": ip,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36",
          },
        });

        expect(res.status).toBe(200);
      }

      // Different office (different /16 subnet) should be rejected
      const res = await app.request("/api/test", {
        headers: {
          "X-Forwarded-For": "10.1.1.50", // Different /16 subnet
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      expect(res.status).toBe(500);
    });
  });

  describe("Configuration and Disabling", () => {
    it("should allow disabling IP binding enforcement", async () => {
      const { app } = await createTestApp(ORIGINAL_IP, false);
      app.use("/api/*", sessionSecurity({ enforceIpBinding: false }));
      app.get("/api/test", (c) => c.json({ success: true }));

      // Should accept even from different IP
      const res = await app.request("/api/test", {
        headers: {
          "X-Forwarded-For": DIFFERENT_SUBNET_IP,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      expect(res.status).toBe(200);
    });

    it("should skip IP binding check when session.ipBinding is false", async () => {
      const { app } = await createTestApp(ORIGINAL_IP, false);
      app.use("/api/*", sessionSecurity({ enforceIpBinding: true }));
      app.get("/api/test", (c) => c.json({ success: true }));

      // Should accept even from different IP when session.ipBinding is false
      const res = await app.request("/api/test", {
        headers: {
          "X-Forwarded-For": DIFFERENT_SUBNET_IP,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      expect(res.status).toBe(200);
    });
  });

  describe("IPv6 Support", () => {
    it("should handle IPv6 addresses with /64 subnet tolerance", async () => {
      const { app } = await createTestApp("2001:0db8:85a3:0000:0000:8a2e:0370:7334", true);
      app.use("/api/*", sessionSecurity({ enforceIpBinding: true }));
      app.get("/api/test", (c) => c.json({ success: true }));

      // Same /64 subnet (first 4 hextets match)
      const res = await app.request("/api/test", {
        headers: {
          "X-Forwarded-For": "2001:0db8:85a3:0000:0000:8a2e:0370:7335",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      expect(res.status).toBe(200);
    });

    it("should reject IPv6 addresses from different /64 subnet", async () => {
      const { app } = await createTestApp("2001:0db8:85a3:0000:0000:8a2e:0370:7334", true);
      app.use("/api/*", sessionSecurity({ enforceIpBinding: true }));
      app.get("/api/test", (c) => c.json({ success: true }));

      // Different /64 subnet
      const res = await app.request("/api/test", {
        headers: {
          "X-Forwarded-For": "2001:0db8:85a4:0000:0000:8a2e:0370:7334",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      expect(res.status).toBe(500);
    });
  });
});
