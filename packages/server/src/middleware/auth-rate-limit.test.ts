/**
 * Tests for authentication rate limiting middleware.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addTrustedIp,
  authRateLimit,
  banIp,
  cleanupRateLimits,
  getRateLimitStats,
  getRateLimitStatus,
  removeTrustedIp,
  resetRateLimit,
  unbanIp,
} from "./auth-rate-limit.js";

describe("Authentication Rate Limiting", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    // Clear rate limits before each test
    cleanupRateLimits();
  });

  describe("standard tier rate limiting", () => {
    it("should allow requests within limit", async () => {
      app.use("*", authRateLimit("standard"));
      app.get("/test", (c) => c.json({ ok: true }));

      // Make 20 requests (at the limit)
      for (let i = 0; i < 20; i++) {
        const res = await app.request("/test");
        expect(res.status).toBe(200);
      }
    });

    it("should block requests exceeding limit", async () => {
      app.use("*", authRateLimit("standard"));
      app.get("/test", (c) => c.json({ ok: true }));

      // Make 20 requests (at the limit)
      for (let i = 0; i < 20; i++) {
        await app.request("/test");
      }

      // Next request should be blocked
      const res = await app.request("/test");
      expect(res.status).toBe(429);
    });

    it("should reset after window expires", async () => {
      app.use("*", authRateLimit("standard", { config: { windowMs: 100 } }));
      app.get("/test", (c) => c.json({ ok: true }));

      // Exhaust the limit
      for (let i = 0; i < 20; i++) {
        await app.request("/test");
      }

      // Should be blocked
      let res = await app.request("/test");
      expect(res.status).toBe(429);

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should be allowed again
      res = await app.request("/test");
      expect(res.status).toBe(200);
    });

    it("should add rate limit headers", async () => {
      app.use("*", authRateLimit("standard"));
      app.get("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test");

      expect(res.headers.get("X-RateLimit-Limit")).toBe("20");
      expect(res.headers.get("X-RateLimit-Remaining")).toBeTruthy();
      expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
    });
  });

  describe("strict tier rate limiting", () => {
    it("should allow fewer requests than standard tier", async () => {
      app.use("*", authRateLimit("strict"));
      app.get("/test", (c) => c.json({ ok: true }));

      // Make 5 requests (at the strict limit)
      for (let i = 0; i < 5; i++) {
        const res = await app.request("/test");
        expect(res.status).toBe(200);
      }

      // Next request should be blocked
      const res = await app.request("/test");
      expect(res.status).toBe(429);
    });
  });

  describe("aggressive tier rate limiting", () => {
    it("should allow only 1 request per minute", async () => {
      app.use("*", authRateLimit("aggressive"));
      app.get("/test", (c) => c.json({ ok: true }));

      // First request should succeed
      const res1 = await app.request("/test");
      expect(res1.status).toBe(200);

      // Second request should be blocked
      const res2 = await app.request("/test");
      expect(res2.status).toBe(429);
    });
  });

  describe("skip successful requests", () => {
    it("should not count successful requests when configured", async () => {
      app.use("*", authRateLimit("standard", { config: { skipSuccessfulRequests: true } }));
      app.get("/test", (c) => c.json({ ok: true }));

      // Make more requests than the limit (all successful)
      for (let i = 0; i < 25; i++) {
        const res = await app.request("/test");
        expect(res.status).toBe(200);
      }
    });
  });

  describe("trusted IPs", () => {
    it("should allow unlimited requests from trusted IPs", async () => {
      const trustedIp = "10.0.0.1";
      addTrustedIp(trustedIp);

      app.use("*", authRateLimit("aggressive"));
      app.get("/test", (c) => c.json({ ok: true }));

      // Make multiple requests from trusted IP
      for (let i = 0; i < 10; i++) {
        const res = await app.request("/test", {
          headers: {
            "X-Forwarded-For": trustedIp,
          },
        });
        expect(res.status).toBe(200);
      }

      removeTrustedIp(trustedIp);
    });

    it("should not allow unlimited requests from untrusted IPs", async () => {
      app.use("*", authRateLimit("aggressive"));
      app.get("/test", (c) => c.json({ ok: true }));

      // First request succeeds
      const res1 = await app.request("/test", {
        headers: {
          "X-Forwarded-For": "192.168.1.100",
        },
      });
      expect(res1.status).toBe(200);

      // Second request is blocked
      const res2 = await app.request("/test", {
        headers: {
          "X-Forwarded-For": "192.168.1.100",
        },
      });
      expect(res2.status).toBe(429);
    });
  });

  describe("IP banning", () => {
    it("should ban IP after threshold violations", async () => {
      app.use("*", authRateLimit("strict", { config: { banThreshold: 3, banDurationMs: 5000 } }));
      app.get("/test", (c) => c.json({ ok: true }));

      const clientIp = "192.168.1.50";

      // Exhaust limit multiple times to trigger ban
      for (let violation = 0; violation < 3; violation++) {
        for (let i = 0; i < 5; i++) {
          await app.request("/test", {
            headers: {
              "X-Forwarded-For": clientIp,
            },
          });
        }
      }

      // IP should now be banned
      const res = await app.request("/test", {
        headers: {
          "X-Forwarded-For": clientIp,
        },
      });
      expect(res.status).toBe(429);
      const json = await res.json();
      expect(json.message).toContain("banned");
    });

    it("should manually ban an IP", () => {
      const ip = "10.0.0.100";
      banIp(ip, 5000);

      const status = getRateLimitStatus(ip);
      expect(status?.banned).toBe(true);
      expect(status?.bannedUntil).toBeGreaterThan(Date.now());
    });

    it("should unban a banned IP", () => {
      const ip = "10.0.0.101";
      banIp(ip, 5000);

      expect(getRateLimitStatus(ip)?.banned).toBe(true);

      unbanIp(ip);

      // After unban, the entry should still exist but not be banned
      const status = getRateLimitStatus(ip);
      expect(status?.banned).toBeUndefined();
    });
  });

  describe("CAPTCHA triggering", () => {
    it("should trigger CAPTCHA after threshold violations", async () => {
      app.use("*", authRateLimit("standard", { config: { captchaThreshold: 2 } }));
      app.get("/test", (c) => {
        const requireCaptcha = c.get("requireCaptcha");
        return c.json({ requireCaptcha: !!requireCaptcha });
      });

      const clientIp = "192.168.1.75";

      // First window - exhaust limit
      for (let i = 0; i < 20; i++) {
        await app.request("/test", {
          headers: {
            "X-Forwarded-For": clientIp,
          },
        });
      }

      // Get the rate limit exceeded response
      const res = await app.request("/test", {
        headers: {
          "X-Forwarded-For": clientIp,
        },
      });
      expect(res.status).toBe(429);

      const json = await res.json();
      expect(json.message).toContain("CAPTCHA");
    });
  });

  describe("API key-based limiting", () => {
    it("should limit by API key when extractor provided", async () => {
      const keyExtractor = () => "test_api_key";

      app.use("*", authRateLimit("standard", { keyExtractor }));
      app.get("/test", (c) => c.json({ ok: true }));

      // Make 20 requests (at the limit)
      for (let i = 0; i < 20; i++) {
        const res = await app.request("/test");
        expect(res.status).toBe(200);
      }

      // Next request should be blocked
      const res = await app.request("/test");
      expect(res.status).toBe(429);
    });
  });

  describe("management functions", () => {
    it("should reset rate limit for identifier", async () => {
      app.use("*", authRateLimit("aggressive"));
      app.get("/test", (c) => c.json({ ok: true }));

      // Exhaust limit
      const res1 = await app.request("/test", {
        headers: { "X-Forwarded-For": "10.0.0.50" },
      });
      expect(res1.status).toBe(200);

      const res2 = await app.request("/test", {
        headers: { "X-Forwarded-For": "10.0.0.50" },
      });
      expect(res2.status).toBe(429);

      // Reset and try again
      resetRateLimit("10.0.0.50");

      const res3 = await app.request("/test", {
        headers: { "X-Forwarded-For": "10.0.0.50" },
      });
      expect(res3.status).toBe(200);
    });

    it("should get rate limit statistics", async () => {
      app.use("*", authRateLimit("standard"));
      app.get("/test", (c) => c.json({ ok: true }));

      // Make some requests from different IPs
      for (let i = 0; i < 10; i++) {
        await app.request("/test", {
          headers: { "X-Forwarded-For": `192.168.1.${i}` },
        });
      }

      const stats = getRateLimitStats();
      expect(stats.totalEntries).toBeGreaterThan(0);
      expect(stats.bannedIps).toBe(0);
      expect(typeof stats.entriesByViolationCount).toBe("object");
    });

    it("should clean up expired entries", async () => {
      app.use("*", authRateLimit("standard", { config: { windowMs: 50 } }));
      app.get("/test", (c) => c.json({ ok: true }));

      // Create entries
      for (let i = 0; i < 5; i++) {
        await app.request("/test", {
          headers: { "X-Forwarded-For": `10.0.1.${i}` },
        });
      }

      const statsBefore = getRateLimitStats();
      expect(statsBefore.totalEntries).toBeGreaterThan(0);

      // Wait for windows to expire
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Run cleanup
      const cleaned = cleanupRateLimits();
      expect(cleaned).toBeGreaterThan(0);
    });
  });

  describe("different client IP headers", () => {
    it("should use CF-Connecting-IP header when available", async () => {
      app.use("*", authRateLimit("aggressive"));
      app.get("/test", (c) => c.json({ ok: true }));

      // First request with CF header
      const res1 = await app.request("/test", {
        headers: {
          "CF-Connecting-IP": "173.245.50.100",
        },
      });
      expect(res1.status).toBe(200);

      // Second request with same CF header should be blocked
      const res2 = await app.request("/test", {
        headers: {
          "CF-Connecting-IP": "173.245.50.100",
        },
      });
      expect(res2.status).toBe(429);
    });

    it("should use X-Forwarded-For header when CF header not available", async () => {
      app.use("*", authRateLimit("aggressive"));
      app.get("/test", (c) => c.json({ ok: true }));

      // Request with X-Forwarded-For
      const res1 = await app.request("/test", {
        headers: {
          "X-Forwarded-For": "203.0.113.50",
        },
      });
      expect(res1.status).toBe(200);

      // Second request should be blocked
      const res2 = await app.request("/test", {
        headers: {
          "X-Forwarded-For": "203.0.113.50",
        },
      });
      expect(res2.status).toBe(429);
    });

    it("should handle X-Forwarded-For with multiple IPs", async () => {
      app.use("*", authRateLimit("aggressive"));
      app.get("/test", (c) => c.json({ ok: true }));

      // X-Forwarded-For can contain multiple IPs - should use the first one
      const res1 = await app.request("/test", {
        headers: {
          "X-Forwarded-For": "203.0.113.50, 10.0.0.1, 10.0.0.2",
        },
      });
      expect(res1.status).toBe(200);

      // Same first IP should be blocked
      const res2 = await app.request("/test", {
        headers: {
          "X-Forwarded-For": "203.0.113.50, 10.0.0.3",
        },
      });
      expect(res2.status).toBe(429);
    });
  });

  describe("localhost bypass", () => {
    it("should bypass rate limiting for localhost by default", async () => {
      app.use("*", authRateLimit("aggressive"));
      app.get("/test", (c) => c.json({ ok: true }));

      // Multiple requests from localhost should all succeed
      for (let i = 0; i < 10; i++) {
        const res = await app.request("/test", {
          headers: {
            "X-Forwarded-For": "127.0.0.1",
          },
        });
        expect(res.status).toBe(200);
      }
    });
  });

  describe("custom configuration", () => {
    it("should merge custom configuration with tier defaults", async () => {
      app.use("*", authRateLimit("standard", { config: { requests: 3 } }));
      app.get("/test", (c) => c.json({ ok: true }));

      // Custom limit of 3 requests
      for (let i = 0; i < 3; i++) {
        const res = await app.request("/test");
        expect(res.status).toBe(200);
      }

      // 4th request should be blocked
      const res = await app.request("/test");
      expect(res.status).toBe(429);
    });

    it("should allow disabling rate limiting", async () => {
      app.use("*", authRateLimit("standard", { config: { requests: 10000 } }));
      app.get("/test", (c) => c.json({ ok: true }));

      // Many requests should all succeed
      for (let i = 0; i < 100; i++) {
        const res = await app.request("/test");
        expect(res.status).toBe(200);
      }
    });
  });
});
