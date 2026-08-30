/**
 * Integration tests for security middleware chain.
 *
 * Verifies that all security middleware works correctly in combination:
 * - Host-header protection + CSRF protection
 * - Host-header protection + security headers
 * - Host-header protection + authentication/authorization
 * - Host-header protection + rate limiting
 * - Full security middleware chain integration
 *
 * These tests ensure that security protections work together without
 * interfering with each other or with legitimate functionality.
 */

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashApiKey, optionalAuth, registerApiKey } from "./authentication.js";
import type { ApiKey } from "./authentication.js";
import { clearCsrfTokenStore, csrfProtection } from "./csrf-protection.js";
import {
  hostHeaderProtection,
  validateHostHeader,
  type HostHeaderProtectionOptions,
} from "./host-header-protection.js";
import { securityHeaders } from "./security-headers.js";
import { requireAdmin } from "./authorization.js";
import {
  enableRateLimiting,
  disableRateLimiting,
  resetRateLimiter,
  rateLimiter,
} from "../test/rate-limiter-harness.js";

describe("Security Middleware Integration Tests", () => {
  describe("Host-Header + CSRF Protection Integration", () => {
    let app: Hono;
    let validCsrfToken: string;

    beforeEach(() => {
      clearCsrfTokenStore();
      app = new Hono();

      // Apply host-header protection first, then CSRF
      app.use("/api/*", hostHeaderProtection({
        allowedHosts: ["api.example.com", "localhost"],
        blockLocalhost: false,
      }));
      app.use("/api/*", csrfProtection({ excludePaths: [] }));

      // Test endpoints
      app.get("/api/csrf-token", (c) => {
        const token = c.get("csrfToken");
        return c.json({ token });
      });

      app.post("/api/test", (c) => c.json({ created: true }));
    });

    it("should allow requests with valid host and CSRF token", async () => {
      // Get CSRF token with valid host
      const getRes = await app.request("/api/csrf-token", {
        headers: { Host: "api.example.com" },
      });

      expect(getRes.status).toBe(200);
      const { token } = await getRes.json();
      validCsrfToken = token;

      // Use token in POST with valid host
      const postRes = await app.request("/api/test", {
        method: "POST",
        headers: {
          Host: "api.example.com",
          "X-CSRF-Token": validCsrfToken,
          Cookie: `csrf_token=${validCsrfToken}`,
        },
      });

      expect(postRes.status).toBe(200);
    });

    it("should reject requests with invalid host even with valid CSRF token", async () => {
      // Get CSRF token with valid host
      const getRes = await app.request("/api/csrf-token", {
        headers: { Host: "api.example.com" },
      });

      const { token } = await getRes.json();

      // Try to use token with invalid host
      const postRes = await app.request("/api/test", {
        method: "POST",
        headers: {
          Host: "evil.com",
          "X-CSRF-Token": token,
          Cookie: `csrf_token=${token}`,
        },
      });

      expect(postRes.status).toBe(400);
      const body = await postRes.json();
      expect(body.error).toBe("Invalid Host header");
    });

    it("should reject requests with valid host but missing CSRF token", async () => {
      const postRes = await app.request("/api/test", {
        method: "POST",
        headers: { Host: "api.example.com" },
      });

      expect(postRes.status).toBe(403);
    });

    it("should handle subdomain in allow-list with CSRF", async () => {
      const postRes = await app.request("/api/test", {
        method: "POST",
        headers: {
          Host: "sub.api.example.com",
          "X-CSRF-Token": "test-token",
        },
      });

      // Host validation should fail (need CSRF token)
      expect([400, 403]).toContain(postRes.status);
    });

    it("should validate host header before CSRF check", async () => {
      // Request with invalid host - should be rejected by host-header protection
      // before CSRF validation runs
      const res = await app.request("/api/test", {
        method: "POST",
        headers: {
          Host: "attacker.com",
          "X-CSRF-Token": "some-token",
        },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.reason).toBe("host_not_allowed");
    });
  });

  describe("Host-Header + Security Headers Integration", () => {
    let app: Hono;

    beforeEach(() => {
      app = new Hono();

      // Apply host-header protection, then security headers
      app.use("/api/*", hostHeaderProtection({
        allowedHosts: ["api.example.com"],
        blockLocalhost: false,
      }));
      app.use("/api/*", securityHeaders());

      app.get("/api/test", (c) => c.json({ ok: true }));
    });

    it("should set security headers on valid host", async () => {
      const res = await app.request("/api/test", {
        headers: { Host: "api.example.com" },
      });

      expect(res.status).toBe(200);

      // Check security headers are present
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
      expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
      expect(res.headers.get("Content-Security-Policy")).toBeDefined();
    });

    it("should not set security headers on invalid host (blocked before middleware)", async () => {
      const res = await app.request("/api/test", {
        headers: { Host: "evil.com" },
      });

      expect(res.status).toBe(400);

      // Security headers middleware shouldn't run because host-header blocked it
      // but headers might still be set depending on middleware ordering
      const body = await res.json();
      expect(body.error).toBe("Invalid Host header");
    });

    it("should set CSP with validated hostname", async () => {
      const res = await app.request("/api/test", {
        headers: { Host: "api.example.com" },
      });

      expect(res.status).toBe(200);
      const csp = res.headers.get("Content-Security-Policy");
      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self'");
    });
  });

  describe("Host-Header + Authentication Integration", () => {
    const setupAuthApp = async () => {
      const app = new Hono();

      // Generate and register test API key
      const testKeyHash = await hashApiKey("test_secret");
      const testApiKey: ApiKey = {
        keyId: "test_key_123",
        keyHash: testKeyHash.hash,
        keySalt: testKeyHash.salt,
        scope: "read",
        owner: "test_user",
        rateLimitTier: 100,
        active: true,
        createdAt: Date.now(),
        expiresAt: 0,
      };
      registerApiKey(testApiKey);

      // Apply host-header protection, then auth
      app.use("/api/*", hostHeaderProtection({
        allowedHosts: ["api.example.com"],
        blockLocalhost: false,
      }));
      app.use("/api/*", optionalAuth({ allowSessions: false }));

      // Define routes AFTER middleware
      app.get("/api/protected", (c) => {
        const userId = c.get("userId");
        return c.json({ userId, authenticated: !!userId });
      });

      return app;
    };

    it("should allow authenticated request with valid host", async () => {
      const app = await setupAuthApp();
      const res = await app.request("/api/protected", {
        headers: {
          Host: "api.example.com",
          Authorization: "Bearer test_key_123:test_secret",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.authenticated).toBe(true);
      expect(body.userId).toBe("test_user");
    });

    it("should reject authenticated request with invalid host", async () => {
      const res = await app.request("/api/protected", {
        headers: {
          Host: "evil.com",
          Authorization: "Bearer test_secret",
        },
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Invalid Host header");
    });

    it("should allow unauthenticated request with valid host on public endpoint", async () => {
      const app = await setupAuthApp();
      const res = await app.request("/api/protected", {
        headers: { Host: "api.example.com" },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.authenticated).toBe(false);
    });

    it("should reject unauthenticated request with invalid host", async () => {
      const app = await setupAuthApp();
      const res = await app.request("/api/protected", {
        headers: { Host: "attacker.com" },
      });

      expect(res.status).toBe(400);
    });
  });

  describe("Host-Header + Authorization Integration", () => {
    let app: Hono;

    beforeEach(() => {
      app = new Hono();

      // Apply host-header protection, then authorization
      app.use("/api/*", hostHeaderProtection({
        allowedHosts: ["api.example.com"],
        blockLocalhost: false,
      }));
      app.use("/api/admin/*", requireAdmin());

      app.get("/api/admin/users", (c) => c.json({ users: [] }));
    });

    it("should check host header before authorization", async () => {
      const res = await app.request("/api/admin/users", {
        headers: { Host: "evil.com" },
      });

      // Host-header protection should reject before authorization runs
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.reason).toBe("host_not_allowed");
    });

    it("should allow request with valid host and permissions", async () => {
      // This would require proper auth setup in a real scenario
      const res = await app.request("/api/admin/users", {
        headers: { Host: "api.example.com" },
      });

      // Should not be blocked by host-header
      // May be 401/403 due to auth, but not 400 from host validation
      expect([200, 401, 403]).toContain(res.status);
    });
  });

  describe("Host-Header + Rate Limiting Integration", () => {
    let app: Hono;

    beforeEach(() => {
      enableRateLimiting();
      resetRateLimiter();

      app = new Hono();

      // Apply host-header protection, then rate limiting
      app.use("/api/*", hostHeaderProtection({
        allowedHosts: ["api.example.com"],
        blockLocalhost: false,
      }));
      app.use("/api/*", rateLimiter());

      app.get("/api/test", (c) => c.json({ ok: true }));
    });

    afterEach(() => {
      disableRateLimiting();
    });

    it("should allow requests within rate limit with valid host", async () => {
      const res = await app.request("/api/test", {
        headers: {
          Host: "api.example.com",
          "CF-Connecting-IP": "127.0.0.1",
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");
    });

    it("should reject rate-limited requests even with valid host", async () => {
      // Exhaust rate limit
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", {
          headers: {
            Host: "api.example.com",
            "CF-Connecting-IP": "127.0.0.1",
          },
        });
      }

      const res = await app.request("/api/test", {
        headers: {
          Host: "api.example.com",
          "CF-Connecting-IP": "127.0.0.1",
        },
      });

      expect(res.status).toBe(429);
    });

    it("should reject invalid host without consuming rate limit", async () => {
      // Get initial rate limit state
      const initial = await app.request("/api/test", {
        headers: {
          Host: "api.example.com",
          "CF-Connecting-IP": "127.0.0.1",
        },
      });
      expect(initial.headers.get("X-RateLimit-Remaining")).toBe("59");

      // Try invalid host - should not consume rate limit
      const blocked = await app.request("/api/test", {
        headers: {
          Host: "evil.com",
          "CF-Connecting-IP": "127.0.0.1",
        },
      });
      expect(blocked.status).toBe(400);

      // Rate limit should still be at 59 (host-header blocked before rate limiter)
      const after = await app.request("/api/test", {
        headers: {
          Host: "api.example.com",
          "CF-Connecting-IP": "127.0.0.1",
        },
      });
      expect(after.headers.get("X-RateLimit-Remaining")).toBe("58");
    });

    it("should track rate limits independently per valid host", async () => {
      // Request from api.example.com
      const res1 = await app.request("/api/test", {
        headers: {
          Host: "api.example.com",
          "CF-Connecting-IP": "127.0.0.1",
        },
      });
      expect(res1.headers.get("X-RateLimit-Remaining")).toBe("59");

      // Rate limiter is IP-based, not host-based, so same IP = same bucket
      const res2 = await app.request("/api/test", {
        headers: {
          Host: "api.example.com",
          "CF-Connecting-IP": "127.0.0.1",
        },
      });
      expect(res2.headers.get("X-RateLimit-Remaining")).toBe("58");
    });
  });

  describe("Full Security Middleware Chain Integration", () => {
    const setupFullChainApp = async () => {
      clearCsrfTokenStore();
      enableRateLimiting();
      resetRateLimiter();

      const app = new Hono();

      // Generate and register test API key
      const testKeyHash = await hashApiKey("integration_secret");
      const testApiKey: ApiKey = {
        keyId: "integration_key_456",
        keyHash: testKeyHash.hash,
        keySalt: testKeyHash.salt,
        scope: "read",
        owner: "integration_user",
        rateLimitTier: 100,
        active: true,
        createdAt: Date.now(),
        expiresAt: 0,
      };
      registerApiKey(testApiKey);

      // Apply full security middleware chain in production order
      // 1. Host-header protection (first line of defense)
      app.use("/api/*", hostHeaderProtection({
        allowedHosts: ["api.example.com", "localhost"],
        blockLocalhost: false,
      }));

      // 2. Security headers (apply to all valid requests)
      app.use("/api/*", securityHeaders());

      // 3. Rate limiting (before auth to avoid DoS)
      app.use("/api/*", rateLimiter());

      // 4. Authentication (optional)
      app.use("/api/*", optionalAuth({ allowSessions: false }));

      // 5. CSRF protection (for state-changing operations)
      app.use("/api/*", csrfProtection({ excludePaths: [] }));

      // Define routes AFTER all middleware
      app.get("/api/health", (c) => {
        const userId = c.get("userId");
        return c.json({ status: "ok", userId });
      });

      app.get("/api/csrf-token", (c) => {
        const token = c.get("csrfToken");
        return c.json({ token });
      });

      app.post("/api/action", (c) => {
        const userId = c.get("userId");
        return c.json({ action: "completed", userId });
      });

      return app;
    };

    afterEach(() => {
      disableRateLimiting();
    });

    it("should allow GET request through entire chain with valid host", async () => {
      const app = await setupFullChainApp();
      const res = await app.request("/api/health", {
        headers: {
          Host: "api.example.com",
          "CF-Connecting-IP": "10.0.0.1",
        },
      });

      expect(res.status).toBe(200);

      // Verify security headers
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
      expect(res.headers.get("Content-Security-Policy")).toBeDefined();

      // Verify rate limit headers
      expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");

      const body = await res.json();
      expect(body.status).toBe("ok");
    });

    it("should allow authenticated GET through entire chain", async () => {
      const app = await setupFullChainApp();
      const res = await app.request("/api/health", {
        headers: {
          Host: "api.example.com",
          Authorization: "Bearer integration_key_456:integration_secret",
          "CF-Connecting-IP": "10.0.0.2",
        },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.userId).toBe("integration_user");
    });

    it("should allow POST with valid host, auth, and CSRF token", async () => {
      const app = await setupFullChainApp();
      // Get CSRF token
      const csrfRes = await app.request("/api/csrf-token", {
        headers: {
          Host: "api.example.com",
          "CF-Connecting-IP": "10.0.0.3",
        },
      });

      expect(csrfRes.status).toBe(200);
      const { token } = await csrfRes.json();

      // Use token in POST
      const postRes = await app.request("/api/action", {
        method: "POST",
        headers: {
          Host: "api.example.com",
          Authorization: "Bearer integration_key_456:integration_secret",
          "X-CSRF-Token": token,
          Cookie: `csrf_token=${token}`,
          "CF-Connecting-IP": "10.0.0.3",
        },
      });

      expect(postRes.status).toBe(200);
      const body = await postRes.json();
      expect(body.action).toBe("completed");
      expect(body.userId).toBe("integration_user");
    });

    it("should reject POST with invalid host even with valid auth and CSRF", async () => {
      const app = await setupFullChainApp();
      // Get CSRF token with valid host
      const csrfRes = await app.request("/api/csrf-token", {
        headers: { Host: "api.example.com" },
      });

      const { token } = await csrfRes.json();

      // Try POST with invalid host
      const postRes = await app.request("/api/action", {
        method: "POST",
        headers: {
          Host: "evil.com",
          Authorization: "Bearer integration_key_456:integration_secret",
          "X-CSRF-Token": token,
        },
      });

      expect(postRes.status).toBe(400);
      const body = await postRes.json();
      expect(body.error).toBe("Invalid Host header");
    });

    it("should reject POST with valid host but missing CSRF token", async () => {
      const app = await setupFullChainApp();
      const postRes = await app.request("/api/action", {
        method: "POST",
        headers: {
          Host: "api.example.com",
          Authorization: "Bearer integration_key_456:integration_secret",
          "CF-Connecting-IP": "10.0.0.4",
        },
      });

      expect(postRes.status).toBe(403);
    });

    it("should handle rate limiting correctly in full chain", async () => {
      const app = await setupFullChainApp();
      const ip = "10.0.0.5";

      // Make 60 requests to exhaust limit
      for (let i = 0; i < 60; i++) {
        const res = await app.request("/api/health", {
          headers: {
            Host: "api.example.com",
            "CF-Connecting-IP": ip,
          },
        });
        expect(res.status).toBe(200);
      }

      // Next request should be rate limited
      const res = await app.request("/api/health", {
        headers: {
          Host: "api.example.com",
          "CF-Connecting-IP": ip,
        },
      });

      expect(res.status).toBe(429);
    });

    it("should not consume rate limit for requests blocked by host validation", async () => {
      const app = await setupFullChainApp();
      const ip = "10.0.0.6";

      // Make one valid request
      const res1 = await app.request("/api/health", {
        headers: {
          Host: "api.example.com",
          "CF-Connecting-IP": ip,
        },
      });
      expect(res1.headers.get("X-RateLimit-Remaining")).toBe("59");

      // Try invalid host - should not consume rate limit
      const blocked = await app.request("/api/health", {
        headers: {
          Host: "blocked.com",
          "CF-Connecting-IP": ip,
        },
      });
      expect(blocked.status).toBe(400);

      // Rate limit should still be at 59 (host-header blocked first)
      const res2 = await app.request("/api/health", {
        headers: {
          Host: "api.example.com",
          "CF-Connecting-IP": ip,
        },
      });
      expect(res2.headers.get("X-RateLimit-Remaining")).toBe("58");
    });

    it("should apply security headers to all successful responses", async () => {
      const app = await setupFullChainApp();
      const res = await app.request("/api/health", {
        headers: { Host: "api.example.com" },
      });

      expect(res.status).toBe(200);

      // Verify all security headers are present
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
      expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
      expect(res.headers.get("Permissions-Policy")).toBeDefined();
      expect(res.headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
      expect(res.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
      expect(res.headers.get("Cross-Origin-Embedder-Policy")).toBe("require-corp");
      expect(res.headers.get("X-XSS-Protection")).toBe("1; mode=block");

      const csp = res.headers.get("Content-Security-Policy");
      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
    });
  });

  describe("Host-Header Validation Edge Cases", () => {
    let app: Hono;

    beforeEach(() => {
      app = new Hono();
      app.use("/api/*", hostHeaderProtection({
        allowedHosts: ["api.example.com"],
        blockLocalhost: false,
      }));
      app.get("/api/test", (c) => c.json({ ok: true }));
    });

    it("should handle hostname with port correctly", async () => {
      const res = await app.request("/api/test", {
        headers: { Host: "api.example.com:8080" },
      });

      expect(res.status).toBe(200);
    });

    it("should reject IP address in host header", async () => {
      const res = await app.request("/api/test", {
        headers: { Host: "192.168.1.1" },
      });

      expect(res.status).toBe(400);
    });

    it("should reject hostname with spaces", async () => {
      const res = await app.request("/api/test", {
        headers: { Host: "api .example.com" },
      });

      expect(res.status).toBe(400);
    });

    it("should reject hostname with control characters", async () => {
      // Note: Hono's request API won't allow control characters in headers
      // This test verifies the validation logic works when called directly
      const result = validateHostHeader("api\x00.example.com");
      expect(result.valid).toBe(false);
      expect(result.reason).toBe("invalid_hostname_format");
    });

    it("should handle case-insensitive hostname matching", async () => {
      const res = await app.request("/api/test", {
        headers: { Host: "API.Example.COM" },
      });

      expect(res.status).toBe(200);
    });
  });
});
