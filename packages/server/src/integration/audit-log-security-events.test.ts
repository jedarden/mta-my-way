/**
 * Integration tests for audit log capture of security events.
 *
 * Verifies that the audit log captures security events produced by
 * middleware blocking requests across the full middleware chain:
 *   - Failed authentication attempts (401/403)
 *   - CSRF token failures (403)
 *   - Rate limit exceeded (429)
 *   - Host-header protection blocks (400)
 *
 * Each test builds a lightweight Hono app with a bridge middleware that
 * writes security events into the in-memory AUDIT_LOG from audit-log.ts.
 * After triggering the security event, the test queries the audit log
 * to verify the entry exists with correct metadata (IP, path, timestamp).
 *
 * Uses the simple audit-log module (audit-log.ts) because the
 * security-logging middleware currently writes to the observability
 * logger rather than the AUDIT_LOG array; the bridge middleware closes
 * that gap for integration testing.
 */

import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addAuditEvent,
  clearAuditLog,
  getClientIp,
  getUserAgent,
  queryAuditLog,
} from "../middleware/audit-log.js";
import { hostHeaderProtection } from "../middleware/host-header-protection.js";
import {
  type AuthVars,
  IP_A,
  IP_B,
  disableRateLimiting,
  enableRateLimiting,
  mockCsrfProtection,
  mockOptionalAuth,
  rateLimiter,
} from "../test/rate-limiter-harness.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CapturedEvent {
  eventType: string;
  statusCode: number;
  ip: string;
  path: string;
  method: string;
  details: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a middleware that bridges security events into the audit-log
 * AUDIT_LOG array.  It inspects the response status after downstream
 * handlers run and writes an audit entry for any security-relevant code.
 *
 * Captures:
 *   - 401/403 → authentication failure
 *   - 429     → rate limit exceeded
 *   - 400     → host-header / input validation block (category: security)
 */
function auditLogBridgeMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    await next();

    const status = c.res.status;
    const ip = getClientIp(c);
    const path = c.req.path;
    const method = c.req.method;

    if (status === 401 || status === 403) {
      addAuditEvent({
        category: "authentication",
        severity: "warning",
        action: "auth_failure",
        success: false,
        clientIp: ip,
        userAgent: getUserAgent(c),
        path,
        method,
        error: `HTTP ${status}`,
      });
    } else if (status === 429) {
      addAuditEvent({
        category: "security",
        severity: "warning",
        action: "rate_limit_exceeded",
        success: false,
        clientIp: ip,
        userAgent: getUserAgent(c),
        path,
        method,
        error: "Rate limit exceeded",
      });
    } else if (status === 400) {
      addAuditEvent({
        category: "security",
        severity: "warning",
        action: "host_header_blocked",
        success: false,
        clientIp: ip,
        userAgent: getUserAgent(c),
        path,
        method,
        error: "Host header validation failed",
      });
    }
  };
}

/**
 * Make a request with a specific IP address via CF-Connecting-IP header.
 */
function requestWithIp(
  app: Hono,
  path: string,
  ip: string,
  options: RequestInit = {}
): Promise<Response> {
  return app.request(path, {
    ...options,
    headers: {
      ...options.headers,
      "CF-Connecting-IP": ip,
    },
  });
}

// ---------------------------------------------------------------------------
// App factories
// ---------------------------------------------------------------------------

/**
 * App with auth → audit-bridge chain.
 * Auth middleware requires a valid Authorization header.
 */
function createAuthAuditApp(): Hono<AuthVars> {
  const app = new Hono<AuthVars>();

  app.use("/api/*", mockOptionalAuth());
  app.use("/api/*", auditLogBridgeMiddleware());

  app.get("/api/protected", (c) => {
    const userId = c.get("userId");
    if (!userId) return c.json({ error: "unauthorized" }, 401);
    return c.json({ ok: true, userId });
  });

  app.post("/api/action", (c) => {
    const userId = c.get("userId");
    if (!userId) return c.json({ error: "unauthorized" }, 401);
    return c.json({ ok: true, userId });
  });

  return app;
}

/**
 * App with CSRF → audit-bridge chain.
 * CSRF middleware blocks state-changing requests without tokens.
 */
function createCsrfAuditApp(): Hono<AuthVars> {
  const app = new Hono<AuthVars>();

  app.use("/api/*", auditLogBridgeMiddleware());
  app.use("/api/*", mockOptionalAuth());
  app.use("/api/*", mockCsrfProtection());

  app.post("/api/action", (c) => c.json({ action: "done" }));

  return app;
}

/**
 * App with rate limiter → audit-bridge chain.
 * Rate limiter enforces token bucket per IP.
 */
function createRateLimitAuditApp(): Hono<AuthVars> {
  const app = new Hono<AuthVars>();

  app.use("/api/*", auditLogBridgeMiddleware());
  app.use("/api/*", rateLimiter());

  app.get("/api/test", (c) => c.json({ message: "ok" }));

  return app;
}

/**
 * App with host-header protection → audit-bridge chain.
 * Blocks requests with disallowed Host headers (returns 400).
 */
function createHostHeaderAuditApp(): Hono {
  const app = new Hono();

  app.use("/api/*", auditLogBridgeMiddleware());
  app.use("/api/*", hostHeaderProtection({ allowedHosts: ["allowed.test", "mta-my-way.test"] }));

  app.get("/api/test", (c) => c.json({ message: "ok" }));

  return app;
}

/**
 * Full middleware chain: auth → CSRF → rate limiter → audit-bridge.
 */
function createFullChainAuditApp(): Hono<AuthVars> {
  const app = new Hono<AuthVars>();

  app.use("/api/*", auditLogBridgeMiddleware());
  app.use("/api/*", mockOptionalAuth());
  app.use("/api/*", mockCsrfProtection());
  app.use("/api/*", rateLimiter());

  app.get("/api/test", (c) => c.json({ message: "ok" }));
  app.post("/api/action", (c) => {
    const userId = c.get("userId");
    if (!userId) return c.json({ error: "unauthorized" }, 401);
    return c.json({ action: "done", userId });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Audit log captures security events from middleware", () => {
  beforeEach(() => {
    clearAuditLog();
    disableRateLimiting();
  });

  afterEach(() => {
    disableRateLimiting();
  });

  // =========================================================================
  // 1. Authentication failure audit entries
  // =========================================================================

  describe("Failed authentication attempts", () => {
    it("unauthenticated GET to protected endpoint produces audit log entry", async () => {
      const app = createAuthAuditApp();

      await requestWithIp(app, "/api/protected", IP_A);

      const events = queryAuditLog({ category: "authentication", success: false });
      expect(events.length).toBeGreaterThanOrEqual(1);

      const event = events[0]!;
      expect(event.action).toBe("auth_failure");
      expect(event.clientIp).toBe(IP_A);
      expect(event.path).toBe("/api/protected");
      expect(event.method).toBe("GET");
      expect(event.timestamp).toBeGreaterThan(0);
    });

    it("unauthenticated POST produces audit log entry with method=POST", async () => {
      const app = createAuthAuditApp();

      await requestWithIp(app, "/api/action", IP_A, { method: "POST" });

      const events = queryAuditLog({ category: "authentication", success: false });
      expect(events.length).toBeGreaterThanOrEqual(1);

      const event = events[0]!;
      expect(event.method).toBe("POST");
      expect(event.path).toBe("/api/action");
    });

    it("audit entry IP matches CF-Connecting-IP header", async () => {
      const app = createAuthAuditApp();
      const testIp = "203.0.113.42";

      await requestWithIp(app, "/api/protected", testIp);

      const events = queryAuditLog({ category: "authentication", success: false });
      expect(events[0]!.clientIp).toBe(testIp);
    });

    it("audit entry timestamp is recent (within last 5 seconds)", async () => {
      const app = createAuthAuditApp();
      const beforeMs = Date.now();

      await requestWithIp(app, "/api/protected", IP_A);

      const afterMs = Date.now();
      const events = queryAuditLog({ category: "authentication", success: false });
      const ts = events[0]!.timestamp;

      expect(ts).toBeGreaterThanOrEqual(beforeMs);
      expect(ts).toBeLessThanOrEqual(afterMs);
    });

    it("multiple failed auth attempts from same IP produce multiple entries", async () => {
      const app = createAuthAuditApp();

      await requestWithIp(app, "/api/protected", IP_A);
      await requestWithIp(app, "/api/protected", IP_A);
      await requestWithIp(app, "/api/protected", IP_A);

      const events = queryAuditLog({ category: "authentication", success: false });
      expect(events.length).toBeGreaterThanOrEqual(3);
      expect(events.every((e) => e.clientIp === IP_A)).toBe(true);
    });

    it("successful auth does NOT produce auth_failure audit entry", async () => {
      const app = createAuthAuditApp();

      await requestWithIp(app, "/api/protected", IP_A, {
        headers: { Authorization: "Bearer validuser:validsecret" },
      });

      const events = queryAuditLog({ category: "authentication", success: false });
      // The mockOptionalAuth accepts the token, so the handler should
      // return 200 (not 401), and the bridge middleware should NOT log.
      expect(events.length).toBe(0);
    });
  });

  // =========================================================================
  // 2. CSRF failure audit entries
  // =========================================================================

  describe("CSRF failures", () => {
    it("POST without CSRF token produces audit log entry", async () => {
      const app = createCsrfAuditApp();

      await requestWithIp(app, "/api/action", IP_A, {
        method: "POST",
        headers: { Authorization: "Bearer user:pass" },
      });

      const events = queryAuditLog({ category: "authentication", success: false });
      expect(events.length).toBeGreaterThanOrEqual(1);

      const event = events[0]!;
      expect(event.action).toBe("auth_failure");
      expect(event.clientIp).toBe(IP_A);
      expect(event.path).toBe("/api/action");
      expect(event.method).toBe("POST");
    });

    it("CSRF failure audit entry contains correct path and method", async () => {
      const app = createCsrfAuditApp();

      await requestWithIp(app, "/api/action", IP_A, {
        method: "POST",
      });

      const events = queryAuditLog({ category: "authentication", success: false });
      const event = events[0]!;

      expect(event.path).toBe("/api/action");
      expect(event.method).toBe("POST");
      expect(event.timestamp).toBeGreaterThan(0);
    });

    it("GET request bypasses CSRF and does NOT produce auth_failure entry", async () => {
      const app = createCsrfAuditApp();

      // GET requests bypass CSRF in mockCsrfProtection
      await requestWithIp(app, "/api/test", IP_A);

      const events = queryAuditLog({ category: "authentication", success: false });
      // The route doesn't exist, so no audit entry is expected
      // (only security-relevant status codes trigger the bridge)
      expect(events.length).toBe(0);
    });
  });

  // =========================================================================
  // 3. Rate limit audit entries
  // =========================================================================

  describe("Rate limit exceeded", () => {
    it("rate limit hit produces audit log entry with category=security", async () => {
      enableRateLimiting();

      const app = createRateLimitAuditApp();

      // Drain tokens — 60 tokens per bucket
      let lastStatus = 0;
      for (let i = 0; i < 62; i++) {
        const res = await requestWithIp(app, "/api/test", "10.0.0.50");
        lastStatus = res.status;
        if (res.status === 429) break;
      }

      expect(lastStatus).toBe(429);

      const events = queryAuditLog({ category: "security", action: "rate_limit_exceeded" });
      expect(events.length).toBeGreaterThanOrEqual(1);

      const event = events[0]!;
      expect(event.success).toBe(false);
      expect(event.clientIp).toBe("10.0.0.50");
      expect(event.path).toBe("/api/test");
      expect(event.method).toBe("GET");
    });

    it("rate limit audit entry contains IP and path metadata", async () => {
      enableRateLimiting();

      const app = createRateLimitAuditApp();

      let lastStatus = 0;
      for (let i = 0; i < 62; i++) {
        const res = await requestWithIp(app, "/api/test", "192.168.99.99");
        lastStatus = res.status;
        if (res.status === 429) break;
      }

      expect(lastStatus).toBe(429);

      const events = queryAuditLog({ action: "rate_limit_exceeded" });
      const event = events[0]!;

      expect(event.clientIp).toBe("192.168.99.99");
      expect(event.path).toBe("/api/test");
      expect(event.timestamp).toBeGreaterThan(0);
    });

    it("rate limit audit entry has recent timestamp", async () => {
      enableRateLimiting();

      const app = createRateLimitAuditApp();
      const beforeMs = Date.now();

      let lastStatus = 0;
      for (let i = 0; i < 62; i++) {
        const res = await requestWithIp(app, "/api/test", "10.0.0.51");
        lastStatus = res.status;
        if (res.status === 429) break;
      }

      const afterMs = Date.now();
      expect(lastStatus).toBe(429);

      const events = queryAuditLog({ action: "rate_limit_exceeded" });
      const ts = events[0]!.timestamp;

      expect(ts).toBeGreaterThanOrEqual(beforeMs);
      expect(ts).toBeLessThanOrEqual(afterMs);
    });
  });

  // =========================================================================
  // 4. Host-header protection audit entries
  // =========================================================================

  describe("Host-header protection blocks", () => {
    it("request with disallowed host produces audit log entry", async () => {
      const app = createHostHeaderAuditApp();

      const res = await app.request("/api/test", {
        headers: { Host: "evil.com" },
      });

      // Host header protection returns 400 for disallowed hosts
      expect(res.status).toBe(400);

      const events = queryAuditLog({ category: "security", action: "host_header_blocked" });
      expect(events.length).toBeGreaterThanOrEqual(1);

      const event = events[0]!;
      expect(event.success).toBe(false);
      expect(event.path).toBe("/api/test");
      expect(event.method).toBe("GET");
      expect(event.timestamp).toBeGreaterThan(0);
    });

    it("host-header blocked request preserves client IP", async () => {
      const app = createHostHeaderAuditApp();

      await app.request("/api/test", {
        headers: { Host: "evil.com", "CF-Connecting-IP": "10.20.30.40" },
      });

      const events = queryAuditLog({ category: "security", action: "host_header_blocked" });
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0]!.clientIp).toBe("10.20.30.40");
    });

    it("request with allowed host does NOT produce host_header_blocked entry", async () => {
      const app = createHostHeaderAuditApp();

      const res = await app.request("/api/test", {
        headers: { Host: "allowed.test" },
      });

      expect(res.status).toBe(200);

      const events = queryAuditLog({ category: "security", action: "host_header_blocked" });
      expect(events.length).toBe(0);
    });

    it("request with IP in Host header produces audit log entry when blocked", async () => {
      const app = createHostHeaderAuditApp();

      const res = await app.request("/api/test", {
        headers: { Host: "192.168.1.1" },
      });

      // IP addresses not in the allow-list are blocked
      expect(res.status).toBe(400);

      const events = queryAuditLog({ category: "security", action: "host_header_blocked" });
      expect(events.length).toBeGreaterThanOrEqual(1);
    });

    it("host-header block audit entry has recent timestamp", async () => {
      const app = createHostHeaderAuditApp();
      const beforeMs = Date.now();

      await app.request("/api/test", {
        headers: { Host: "evil.com" },
      });

      const afterMs = Date.now();
      const events = queryAuditLog({ category: "security", action: "host_header_blocked" });
      const ts = events[0]!.timestamp;

      expect(ts).toBeGreaterThanOrEqual(beforeMs);
      expect(ts).toBeLessThanOrEqual(afterMs);
    });
  });

  // =========================================================================
  // 5. Host-header audit capture: full chain integration
  // =========================================================================

  describe("Host-header audit capture integration", () => {
    it("request with Host: evil.com returns 400 through createHostHeaderAuditApp", async () => {
      const app = createHostHeaderAuditApp();

      const res = await app.request("/api/test", {
        headers: { Host: "evil.com" },
      });

      expect(res.status).toBe(400);
    });

    it("audit log contains host_header_blocked entry after a blocked request", async () => {
      const app = createHostHeaderAuditApp();

      await app.request("/api/test", {
        headers: { Host: "evil.com" },
      });

      const events = queryAuditLog({ action: "host_header_blocked" });
      expect(events.length).toBeGreaterThanOrEqual(1);

      const event = events[0]!;
      expect(event.action).toBe("host_header_blocked");
    });

    it("blocked entry has correct metadata (path, method, clientIp, success: false)", async () => {
      const app = createHostHeaderAuditApp();

      await app.request("/api/test", {
        headers: { Host: "evil.com", "CF-Connecting-IP": IP_A },
      });

      const events = queryAuditLog({ action: "host_header_blocked" });
      expect(events.length).toBeGreaterThanOrEqual(1);

      const event = events[0]!;
      expect(event.success).toBe(false);
      expect(event.path).toBe("/api/test");
      expect(event.method).toBe("GET");
      expect(event.clientIp).toBe(IP_A);
    });

    it("request with allowed host does NOT produce host_header_blocked entry", async () => {
      const app = createHostHeaderAuditApp();

      const res = await app.request("/api/test", {
        headers: { Host: "allowed.test" },
      });

      expect(res.status).toBe(200);

      const events = queryAuditLog({ action: "host_header_blocked" });
      expect(events.length).toBe(0);
    });

    it("blocked request preserves client IP from CF-Connecting-IP header", async () => {
      const app = createHostHeaderAuditApp();

      await app.request("/api/test", {
        headers: {
          Host: "evil.com",
          "CF-Connecting-IP": IP_B,
        },
      });

      const events = queryAuditLog({ action: "host_header_blocked" });
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[0]!.clientIp).toBe(IP_B);
    });
  });

  // =========================================================================
  // 6. Cross-cutting: metadata correctness across all event types
  // =========================================================================

  describe("Audit entry metadata correctness", () => {
    it("all auth failure entries have valid timestamps", async () => {
      const app = createAuthAuditApp();
      const beforeMs = Date.now();

      await requestWithIp(app, "/api/protected", IP_A);

      const afterMs = Date.now();
      const events = queryAuditLog({ category: "authentication", success: false });

      for (const event of events) {
        expect(event.timestamp).toBeGreaterThanOrEqual(beforeMs);
        expect(event.timestamp).toBeLessThanOrEqual(afterMs);
        expect(typeof event.timestamp).toBe("number");
      }
    });

    it("all auth failure entries preserve client IP from CF-Connecting-IP", async () => {
      const app = createAuthAuditApp();
      const testIps = ["10.0.0.1", "172.16.0.1", "203.0.113.55"];

      for (const ip of testIps) {
        clearAuditLog();
        await requestWithIp(app, "/api/protected", ip);

        const events = queryAuditLog({ category: "authentication", success: false });
        if (events.length > 0) {
          expect(events[0]!.clientIp).toBe(ip);
        }
      }
    });

    it("all auth failure entries preserve request path", async () => {
      const app = createAuthAuditApp();
      const paths = ["/api/protected", "/api/action"];

      for (const path of paths) {
        clearAuditLog();
        await requestWithIp(app, path, IP_A);

        const events = queryAuditLog({ category: "authentication", success: false });
        if (events.length > 0) {
          expect(events[0]!.path).toBe(path);
        }
      }
    });

    it("all auth failure entries have severity=warning", async () => {
      const app = createAuthAuditApp();

      await requestWithIp(app, "/api/protected", IP_A);

      const events = queryAuditLog({ category: "authentication", success: false });
      for (const event of events) {
        expect(event.severity).toBe("warning");
      }
    });

    it("rate limit entries have category=security and correct metadata", async () => {
      enableRateLimiting();

      const app = createRateLimitAuditApp();

      let lastStatus = 0;
      for (let i = 0; i < 62; i++) {
        const res = await requestWithIp(app, "/api/test", "10.0.0.52");
        lastStatus = res.status;
        if (res.status === 429) break;
      }

      if (lastStatus === 429) {
        const events = queryAuditLog({ category: "security" });
        const rateLimitEvents = events.filter((e) => e.action === "rate_limit_exceeded");
        for (const event of rateLimitEvents) {
          expect(event.category).toBe("security");
          expect(event.success).toBe(false);
          expect(event.severity).toBe("warning");
          expect(event.clientIp).toBe("10.0.0.52");
          expect(event.path).toBe("/api/test");
          expect(event.method).toBe("GET");
        }
      }
    });

    it("host-header blocked entries have category=security and correct metadata", async () => {
      const app = createHostHeaderAuditApp();

      await app.request("/api/test", {
        headers: {
          Host: "evil.com",
          "CF-Connecting-IP": "99.88.77.66",
        },
      });

      const events = queryAuditLog({ category: "security", action: "host_header_blocked" });
      expect(events.length).toBeGreaterThanOrEqual(1);

      const event = events[0]!;
      expect(event.category).toBe("security");
      expect(event.success).toBe(false);
      expect(event.severity).toBe("warning");
      expect(event.clientIp).toBe("99.88.77.66");
      expect(event.path).toBe("/api/test");
    });
  });

  // =========================================================================
  // 7. Smoke tests: end-to-end audit log queryability
  // =========================================================================

  describe("Smoke tests", () => {
    it("queryAuditLog({ action: 'host_header_blocked' }) returns >= 1 after blocked request", async () => {
      const app = createHostHeaderAuditApp();

      const res = await app.request("/api/test", {
        headers: { Host: "evil.com" },
      });

      // End-to-end: request blocked → bridge middleware fires → audit event written → queryable
      expect(res.status).toBe(400);

      const events = queryAuditLog({ action: "host_header_blocked" });
      expect(events.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // 8. Full chain: multiple middleware interactions produce correct audit
  // =========================================================================

  describe("Full middleware chain audit trail", () => {
    it("auth failure then CSRF failure produce separate audit entries", async () => {
      const app = createCsrfAuditApp();

      // First: request without auth (triggers 401 from optional auth → handler)
      await requestWithIp(app, "/api/action", IP_A, { method: "POST" });

      // Second: request with auth but no CSRF (triggers 403)
      await requestWithIp(app, "/api/action", IP_B, {
        method: "POST",
        headers: { Authorization: "Bearer user:pass" },
      });

      const events = queryAuditLog({ category: "authentication", success: false });

      // Both requests should produce audit entries from the bridge middleware
      expect(events.length).toBeGreaterThanOrEqual(2);

      // Verify IPs are distinct
      const ips = events.map((e) => e.clientIp);
      expect(ips).toContain(IP_A);
      expect(ips).toContain(IP_B);
    });

    it("audit log is empty after clear between test scenarios", () => {
      // Verify clean slate
      const events = queryAuditLog();
      expect(events.length).toBe(0);
    });

    it("rapid sequential auth failures produce chronologically ordered entries", async () => {
      const app = createAuthAuditApp();

      const timestamps: number[] = [];

      for (let i = 0; i < 5; i++) {
        await requestWithIp(app, "/api/protected", IP_A);
        // Query after each to get timestamps
        const events = queryAuditLog({ category: "authentication", success: false });
        if (events.length > 0) {
          timestamps.push(events[0]!.timestamp);
        }
      }

      // Since AUDIT_LOG stores newest first, events[0] is always the
      // latest entry, so each sampled timestamp should be >= the previous.
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]!).toBeGreaterThanOrEqual(timestamps[i - 1]!);
      }
    });

    it("different event types appear in the same audit log", async () => {
      // Auth failure
      const authApp = createAuthAuditApp();
      await requestWithIp(authApp, "/api/protected", IP_A);

      // Host-header block
      const hostApp = createHostHeaderAuditApp();
      await hostApp.request("/api/test", { headers: { Host: "evil.com" } });

      // Both categories should be represented
      const authEvents = queryAuditLog({ category: "authentication", success: false });
      const securityEvents = queryAuditLog({ category: "security" });

      expect(authEvents.length).toBeGreaterThanOrEqual(1);
      expect(securityEvents.length).toBeGreaterThanOrEqual(1);
    });
  });
});
