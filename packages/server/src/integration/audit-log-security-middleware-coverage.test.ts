/**
 * Security middleware audit coverage using the events emitted by the real chain.
 * The legacy audit store records security events under category "security";
 * successful API-key authentication also writes to authentication's own log.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AuditEvent,
  logAuthorizationSuccess,
  queryAuditLog,
} from "../middleware/audit-log.js";
import { apiKeyAuth, getAuditLogForKey, optionalAuth } from "../middleware/authentication.js";
import { requireResourceAccess } from "../middleware/authorization.js";
import { csrfProtection } from "../middleware/csrf-protection.js";
import { hostHeaderProtection } from "../middleware/host-header-protection.js";
import { jsonDepthProtection } from "../middleware/json-depth-protection.js";
import { hppProtection } from "../middleware/parameter-pollution.js";
import { pathTraversalPrevention } from "../middleware/path-traversal.js";
import { rateLimiter } from "../middleware/rate-limiter.js";
import { requestId } from "../middleware/request-id.js";
import { securityLogging } from "../middleware/security-logging.js";
import { ssrfProtection } from "../middleware/ssrf-protection.js";
import { cleanupAllState, createTestApiKey } from "./test-helpers.js";

const VALID_HOST = "api.mtamyway.test";
const TEST_IP = "192.0.2.1";
const TEST_USER_AGENT = "audit-coverage-agent/1.0";

function detailsOf(event: AuditEvent): Record<string, unknown> {
  return (event.metadata?.details as Record<string, unknown> | undefined) ?? {};
}

function requiredEvent(
  action: string,
  predicate: (event: AuditEvent) => boolean = () => true
): AuditEvent {
  const event = queryAuditLog({ action, limit: 1000 }).find(predicate);
  expect(event, `expected audit event ${action}`).toBeDefined();
  return event!;
}

function expectContext(event: AuditEvent, ip = TEST_IP): void {
  expect(event.id).toMatch(/^audit_/);
  expect(event.timestamp).toBeGreaterThan(0);
  expect(event.timestamp).toBeLessThanOrEqual(Date.now());
  expect(event.category).toBe("security");
  expect(event.clientIp).toBe(ip);
}

describe("audit logging - security middleware coverage", () => {
  let app: Hono;

  function send(path: string, init: RequestInit = {}): Promise<Response> {
    return app.request(path, {
      ...init,
      headers: {
        Host: VALID_HOST,
        "CF-Connecting-IP": TEST_IP,
        "User-Agent": TEST_USER_AGENT,
        ...init.headers,
      },
    });
  }

  beforeEach(async () => {
    await cleanupAllState();
    app = new Hono();
    app.use("*", requestId);
    app.use("*", securityLogging());
    app.use("*", hostHeaderProtection({ allowedHosts: [VALID_HOST] }));
    app.use("*", csrfProtection({ excludePaths: ["/api/json"] }));
    app.use("*", pathTraversalPrevention());
    app.use("*", hppProtection({ strategy: "reject" }));
    app.use("*", ssrfProtection());
    app.use("*", jsonDepthProtection());
    app.use("*", optionalAuth());
    app.use("*", rateLimiter());

    app.get("/api/open", (c) => c.json({ ok: true }));
    app.post("/api/action", (c) => c.json({ created: true }));
    app.post("/api/json", (c) => c.json({ accepted: true }));
    app.get("/api/auth", apiKeyAuth(), (c) => c.json({ ok: true }));
    app.get("/api/protected/:id", apiKeyAuth(), requireResourceAccess("trip", "delete"), (c) => {
      logAuthorizationSuccess(c, "trip", "delete");
      return c.json({ authorized: true });
    });
  });

  describe("authentication events", () => {
    it("records a successful API-key login with the real key ID and client IP", async () => {
      const credentials = await createTestApiKey("read", "user");
      const res = await send("/api/auth", {
        headers: { Authorization: credentials.authorizationHeader },
      });

      expect(res.status).toBe(200);
      const login = getAuditLogForKey(credentials.keyId).find(
        (entry) => entry.action === "login_success"
      );
      expect(login).toMatchObject({ keyId: credentials.keyId, clientIp: TEST_IP });
      expect(queryAuditLog({ action: "auth_failure" })).toHaveLength(0);
    });

    it("records a missing API key as an authentication failure", async () => {
      const res = await send("/api/auth");

      expect(res.status).toBe(401);
      const event = requiredEvent(
        "auth_failure",
        (entry) => detailsOf(entry).reason === "missing_api_key"
      );
      expectContext(event);
      expect(event.success).toBe(false);
      expect(event.path).toBe("/api/auth");
    });

    it("records the user agent on an invalid-key failure", async () => {
      const userAgent = "Mozilla/5.0 Test-Agent";
      const res = await send("/api/auth", {
        headers: { Authorization: "Bearer invalid_key:bad_token", "User-Agent": userAgent },
      });

      expect(res.status).toBe(401);
      const event = requiredEvent(
        "auth_failure",
        (entry) => detailsOf(entry).reason === "invalid_api_key"
      );
      expectContext(event);
      expect(event.metadata?.userAgent).toBe(userAgent);
    });

    it("keeps failed authentication events attributable to each IP", async () => {
      const ip1 = "192.0.2.10";
      const ip2 = "192.0.2.20";
      for (const [ip, key] of [
        [ip1, "unknown1"],
        [ip2, "unknown2"],
      ]) {
        const res = await send("/api/auth", {
          headers: { Authorization: `Bearer ${key}:bad`, "CF-Connecting-IP": ip },
        });
        expect(res.status).toBe(401);
      }

      const failures = queryAuditLog({ action: "auth_failure" });
      expect(failures.filter((event) => event.clientIp === ip1).length).toBeGreaterThan(0);
      expect(failures.filter((event) => event.clientIp === ip2).length).toBeGreaterThan(0);
    });
  });

  describe("authorization events", () => {
    it("records an authorized resource operation", async () => {
      const credentials = await createTestApiKey("admin", "admin");
      const res = await send("/api/protected/trip-1", {
        headers: { Authorization: credentials.authorizationHeader },
      });

      expect(res.status).toBe(200);
      const event = requiredEvent("trip:delete");
      expect(event).toMatchObject({
        category: "authorization",
        success: true,
        resourceType: "trip",
        performedBy: credentials.keyId,
        clientIp: TEST_IP,
        path: "/api/protected/trip-1",
      });
    });

    it("records a scope denial with the protected resource", async () => {
      const credentials = await createTestApiKey("read", "user");
      const res = await send("/api/protected/trip-2", {
        headers: { Authorization: credentials.authorizationHeader },
      });

      expect(res.status).toBe(403);
      const event = requiredEvent("authz_failure");
      expectContext(event);
      expect(event.success).toBe(false);
      expect(detailsOf(event)).toMatchObject({ resource: "trip", action: "delete" });
    });

    it("retains the denied request path and actor IP", async () => {
      const credentials = await createTestApiKey("read", "user");
      const res = await send("/api/protected/trip-12345", {
        headers: { Authorization: credentials.authorizationHeader },
      });

      expect(res.status).toBe(403);
      const event = requiredEvent("authz_failure");
      expect(event.path).toBe("/api/protected/trip-12345");
      expect(event.clientIp).toBe(TEST_IP);
      expect(event.method).toBe("GET");
    });
  });

  describe("rate-limit events", () => {
    it("records a 429 after the per-IP quota is exhausted", async () => {
      vi.spyOn(Date, "now").mockReturnValue(Date.now());
      const responses = await Promise.all(Array.from({ length: 65 }, () => send("/api/open")));

      expect(responses.some((res) => res.status === 429)).toBe(true);
      const event = requiredEvent("rate_limit_exceeded");
      expectContext(event);
      expect(event.metadata?.statusCode).toBe(429);
    });

    it("retains rate-limit metadata on the audited violation", async () => {
      vi.spyOn(Date, "now").mockReturnValue(Date.now());
      const ip = "192.0.2.50";
      await Promise.all(
        Array.from({ length: 65 }, () => send("/api/open", { headers: { "CF-Connecting-IP": ip } }))
      );

      const event = requiredEvent("rate_limit_exceeded");
      expectContext(event, ip);
      expect(event.metadata?.details).toMatchObject({ limit: 0, window: 0 });
    });
  });

  describe("request validation events", () => {
    it("records a missing CSRF token", async () => {
      const res = await send("/api/action", { method: "POST" });

      expect(res.status).toBe(403);
      const event = requiredEvent(
        "auth_failure",
        (entry) => detailsOf(entry).reason === "missing_csrf_token"
      );
      expectContext(event);
      expect(event.method).toBe("POST");
      expect(event.success).toBe(false);
    });

    it("retains the user agent and path on CSRF failure", async () => {
      const userAgent = "CSRF-Attack-Tool/1.0";
      const res = await send("/api/action", {
        method: "POST",
        headers: { "User-Agent": userAgent },
      });

      expect(res.status).toBe(403);
      const event = requiredEvent(
        "auth_failure",
        (entry) => detailsOf(entry).reason === "missing_csrf_token"
      );
      expect(event.path).toBe("/api/action");
      expect(event.metadata?.userAgent).toBe(userAgent);
    });

    it("records a blocked path traversal query", async () => {
      const res = await send("/api/open?file=../../../etc/passwd");

      expect(res.status).toBe(400);
      const event = requiredEvent("path_traversal_blocked");
      expectContext(event);
      expect(event.severity).toBe("error");
      expect(event.success).toBe(false);
    });

    it("retains the offending parameter name on traversal events", async () => {
      const res = await send("/api/open?file=../../sensitive/data");

      expect(res.status).toBe(400);
      const event = requiredEvent("path_traversal_blocked");
      expect(detailsOf(event).detectedPath).toBe("query parameter: file");
    });

    it("records rejected duplicate query parameters", async () => {
      const res = await send("/api/open?id=1&id=2");

      expect(res.status).toBe(400);
      const event = requiredEvent("hpp_blocked");
      expectContext(event);
      expect(event.severity).toBe("warning");
    });

    it("retains polluted parameter names", async () => {
      const res = await send("/api/open?user=alice&user=bob");

      expect(res.status).toBe(400);
      const event = requiredEvent("hpp_blocked");
      expect(detailsOf(event).parameters).toContain("user");
    });

    it("records a blocked URL in a query parameter", async () => {
      const res = await send("/api/open?url=http://localhost:6379");

      expect(res.status).toBe(400);
      const event = requiredEvent(
        "suspicious_request",
        (entry) => detailsOf(entry).pattern === "potential_ssrf"
      );
      expectContext(event);
      expect(event.severity).toBe("warning");
    });

    it("retains the SSRF rejection reason", async () => {
      const url = "http://169.254.169.254/latest/meta-data/";
      const res = await send(`/api/open?url=${encodeURIComponent(url)}`);

      expect(res.status).toBe(400);
      const event = requiredEvent(
        "suspicious_request",
        (entry) => detailsOf(entry).pattern === "potential_ssrf"
      );
      expect(String(detailsOf(event).description)).toContain("url=");
    });

    it("records a disallowed Host", async () => {
      const res = await send("/api/open", { headers: { Host: "evil.com" } });

      expect(res.status).toBe(400);
      const event = requiredEvent(
        "suspicious_request",
        (entry) => detailsOf(entry).pattern === "host_header_rejected"
      );
      expectContext(event);
      expect(String(detailsOf(event).description)).toContain("host_not_allowed");
    });

    it("records a missing Host", async () => {
      const res = await app.request("/api/open", { headers: { "CF-Connecting-IP": TEST_IP } });

      expect(res.status).toBe(400);
      const event = requiredEvent(
        "suspicious_request",
        (entry) => detailsOf(entry).pattern === "host_header_rejected"
      );
      expect(String(detailsOf(event).description)).toContain("missing_host_header");
    });

    it("records a blocked excessive JSON depth", async () => {
      let nested: Record<string, unknown> = {};
      for (let i = 0; i < 40; i++) nested = { level: nested };
      const res = await send("/api/json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nested),
      });

      expect(res.status).toBe(413);
      const event = requiredEvent("blocked_attack");
      expectContext(event);
      expect(detailsOf(event).attackType).toBe("json_depth_protection");
    });
  });

  describe("event integrity and querying", () => {
    it("retains a request ID while logging events for the same request", async () => {
      const res = await send("/api/open?file=../../etc/passwd", {
        headers: { "X-Request-ID": "incident-123" },
      });

      expect(res.status).toBe(400);
      expect(res.headers.get("X-Request-ID")).toBe("incident-123");
      const events = queryAuditLog({}).filter((event) => event.clientIp === TEST_IP);
      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events.every((event) => event.path === "/api/open")).toBe(true);
    });

    it("queries newest audit events first", async () => {
      await send("/api/open?file=../../etc/passwd");
      await send("/api/open?user=one&user=two");

      const events = queryAuditLog({});
      expect(events.length).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < events.length - 1; i++) {
        expect(events[i]!.timestamp).toBeGreaterThanOrEqual(events[i + 1]!.timestamp);
      }
    });

    it("stores complete audit event structure", async () => {
      await send("/api/open?file=../../etc/passwd");

      const events = queryAuditLog({});
      expect(events.length).toBeGreaterThan(0);
      for (const event of events) {
        expect(event.id).toMatch(/^audit_/);
        expect(event.timestamp).toBeGreaterThan(0);
        expect(["security", "authorization"]).toContain(event.category);
        expect(["info", "warning", "error", "critical"]).toContain(event.severity);
        expect(event.action.length).toBeGreaterThan(0);
        expect(typeof event.success).toBe("boolean");
      }
    });

    it("retains incident response context", async () => {
      const ip = "192.0.2.99";
      const userAgent = "AttackTool/1.0";
      const res = await send("/api/open?file=../../etc/passwd", {
        headers: { "CF-Connecting-IP": ip, "User-Agent": userAgent },
      });

      expect(res.status).toBe(400);
      const event = requiredEvent("path_traversal_blocked");
      expectContext(event, ip);
      expect(event.metadata?.userAgent).toBe(userAgent);
      expect(event.method).toBe("GET");
      expect(detailsOf(event).detectedPath).toBeDefined();
    });

    it("retains audit events from a large request batch", async () => {
      const responses = await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          send("/api/open", { headers: { Host: "evil.com", "CF-Connecting-IP": `192.0.2.${i}` } })
        )
      );

      expect(responses.every((res) => res.status === 400)).toBe(true);
      expect(queryAuditLog({ action: "suspicious_request", limit: 1000 })).toHaveLength(100);
    });

    it("filters a populated audit store by action", async () => {
      await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          send("/api/open", { headers: { Host: "evil.com", "CF-Connecting-IP": `192.0.2.${i}` } })
        )
      );

      const suspicious = queryAuditLog({ action: "suspicious_request", limit: 1000 });
      expect(suspicious).toHaveLength(50);
      expect(suspicious.every((event) => event.clientIp?.startsWith("192.0.2."))).toBe(true);
    });
  });
});
