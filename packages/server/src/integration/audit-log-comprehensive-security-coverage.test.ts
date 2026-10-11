/**
 * Integration coverage for security middleware and the audit records it emits.
 * Successful API-key logins are kept in authentication's separate session log;
 * security violations are written to the shared audit log.
 */

import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type AuditEvent, getAuditLogStats, queryAuditLog } from "../middleware/audit-log.js";
import {
  apiKeyAuth,
  generateApiKey,
  getAuditLogForKey,
  hashApiKey,
  registerApiKey,
} from "../middleware/authentication.js";
import { requireAdmin, requireResourceAccess } from "../middleware/authorization.js";
import { validateContentType } from "../middleware/content-type.js";
import { csrfCookie } from "../middleware/cookie-security.js";
import { csrfProtection, generateCsrfToken } from "../middleware/csrf-protection.js";
import { hostHeaderProtection } from "../middleware/host-header-protection.js";
import { httpMethodRestrictions } from "../middleware/http-method-restrictions.js";
import { jsonDepthProtection } from "../middleware/json-depth-protection.js";
import { hppProtection } from "../middleware/parameter-pollution.js";
import { pathTraversalPrevention } from "../middleware/path-traversal.js";
import { rateLimiter } from "../middleware/rate-limiter.js";
import { requestId } from "../middleware/request-id.js";
import { responseSizeLimits } from "../middleware/response-size-limits.js";
import { securityHeaders } from "../middleware/security-headers.js";
import { securityLogging } from "../middleware/security-logging.js";
import { ssrfProtection } from "../middleware/ssrf-protection.js";
import { cleanupAllState } from "./test-helpers.js";

const PUBLIC = "/api/public/status";
const TRIPS = "/api/trips";
const ADMIN = "/api/admin/users";
const COOKIE_ACTION = "/api/cookie-action";
const ATTACKER_IP = "198.51.100.99";
const ATTACKER_UA = "Security-Test-Scanner/1.0";

function createSecureApp(): Hono {
  const app = new Hono();
  app.use("*", requestId);
  app.use("*", securityLogging());
  app.use("*", securityHeaders());
  app.use("*", validateContentType());
  app.use("*", hostHeaderProtection({ allowedHosts: ["test.example"] }));
  app.use("*", csrfProtection({ excludePaths: [COOKIE_ACTION] }));
  app.use("*", pathTraversalPrevention());
  app.use("*", hppProtection({ strategy: "reject" }));
  app.use("*", ssrfProtection({ allowUserProvidedUrls: true }));
  app.use("*", jsonDepthProtection({ maxDepth: 4 }));
  // PATCH is supported by Request, so it exercises the actual restriction.
  app.use("*", httpMethodRestrictions({ additionalBlockedMethods: ["PATCH"] }));
  app.use("*", rateLimiter());
  app.use("*", responseSizeLimits({ maxJsonSize: 128 }));

  app.get(PUBLIC, (c) => c.json({ status: "ok" }));
  app.get(TRIPS, apiKeyAuth(), requireResourceAccess("trip", "read"), (c) => c.json({ trips: [] }));
  app.post(TRIPS, apiKeyAuth(), (c) => c.json({ created: true }));
  app.get(ADMIN, apiKeyAuth(), requireAdmin(), (c) => c.json({ users: [] }));
  app.get("/api/public/large", (c) => c.json({ payload: "x".repeat(256) }));
  app.post(COOKIE_ACTION, csrfCookie(), (c) => c.json({ created: true }));
  return app;
}

async function request(
  app: Hono,
  method: string,
  path: string,
  options: {
    ip?: string;
    userAgent?: string;
    authorization?: string;
    csrfToken?: string;
    body?: string;
    headers?: Record<string, string>;
  } = {}
): Promise<Response> {
  return app.request(path, {
    method,
    headers: {
      Host: "test.example",
      "CF-Connecting-IP": options.ip ?? "198.51.100.1",
      "User-Agent": options.userAgent ?? "Security-Test-Client/1.0",
      ...(options.authorization ? { Authorization: options.authorization } : {}),
      ...(options.csrfToken ? { "X-CSRF-Token": options.csrfToken } : {}),
      ...options.headers,
    },
    body: options.body,
  });
}

function securityEvent(action: string, pattern?: string): AuditEvent {
  const event = queryAuditLog({ category: "security", action }).find(
    (item) =>
      pattern === undefined ||
      (item.metadata?.details as Record<string, unknown> | undefined)?.pattern === pattern ||
      (item.metadata?.details as Record<string, unknown> | undefined)?.attackType === pattern
  );
  expect(
    event,
    `Expected security audit event ${action}${pattern ? ` (${pattern})` : ""}`
  ).toBeDefined();
  return event!;
}

function authFailure(reason: string): AuditEvent {
  const event = queryAuditLog({ category: "security", action: "auth_failure" }).find(
    (item) => (item.metadata?.details as Record<string, unknown> | undefined)?.reason === reason
  );
  expect(event, `Expected authentication failure audit event for ${reason}`).toBeDefined();
  return event!;
}

function expectIncidentContext(event: AuditEvent, ip: string, userAgent: string): void {
  expect(event.clientIp).toBe(ip);
  expect(event.path).toBeTruthy();
  expect(event.method).toBeTruthy();
  expect(event.timestamp).toBeGreaterThan(Date.now() - 10_000);
  expect(event.timestamp).toBeLessThanOrEqual(Date.now());
  expect(event.metadata?.userAgent).toBe(userAgent);
}

describe("security middleware audit coverage", () => {
  let app: Hono;
  let adminKey: string;
  const adminKeyId = "test_key_admin";

  beforeEach(async () => {
    await cleanupAllState();
    app = createSecureApp();
    adminKey = await generateApiKey();
    const hashed = await hashApiKey(adminKey);
    await registerApiKey({
      keyId: adminKeyId,
      keyHash: hashed.hash,
      keySalt: hashed.salt,
      scope: "admin",
      rateLimitTier: 10,
      active: true,
      createdAt: Date.now(),
      expiresAt: 0,
      role: "admin",
    });
  });

  it("adds a request ID and security headers to a valid public response", async () => {
    const response = await request(app, "GET", PUBLIC);
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Request-ID")).toMatch(/^[a-z0-9-]+$/i);
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("audits rejected content types with request context", async () => {
    const response = await request(app, "POST", TRIPS, {
      body: "<data/>",
      headers: { "Content-Type": "application/xml" },
    });
    expect(response.status).toBe(415);
    const event = securityEvent("suspicious_request", "invalid_content_type");
    expect(event.severity).toBe("warning");
    expectIncidentContext(event, "198.51.100.1", "Security-Test-Client/1.0");
  });

  it("records successful API-key login in the authentication session log", async () => {
    const response = await request(app, "GET", TRIPS, {
      authorization: `Bearer ${adminKeyId}:${adminKey}`,
    });
    expect(response.status).toBe(200);
    const entry = getAuditLogForKey(adminKeyId).find((item) => item.action === "login_success");
    expect(entry).toMatchObject({ keyId: adminKeyId, clientIp: "198.51.100.1" });
  });

  it("audits a rejected API key with severity and source context", async () => {
    const response = await request(app, "GET", TRIPS, {
      authorization: "Bearer invalid_key:wrong_token",
      ip: ATTACKER_IP,
      userAgent: ATTACKER_UA,
    });
    expect(response.status).toBe(401);
    const event = authFailure("invalid_api_key");
    expect(event.success).toBe(false);
    expect(event.severity).toBe("error");
    expect((event.metadata?.details as Record<string, unknown>).reason).toBe("invalid_api_key");
    expectIncidentContext(event, ATTACKER_IP, ATTACKER_UA);
  });

  it("keeps repeated failed authentication attempts attributable to one IP", async () => {
    for (let index = 0; index < 3; index++) {
      const response = await request(app, "GET", TRIPS, {
        authorization: `Bearer wrong_key_${index}:wrong_secret`,
        ip: ATTACKER_IP,
      });
      expect(response.status).toBe(401);
    }
    const failures = queryAuditLog({ category: "security", action: "auth_failure" }).filter(
      (event) =>
        event.clientIp === ATTACKER_IP &&
        (event.metadata?.details as Record<string, unknown> | undefined)?.reason ===
          "invalid_api_key"
    );
    expect(failures).toHaveLength(3);
    expect(failures.every((event) => event.success === false)).toBe(true);
  });

  it("allows an authorized resource read without a denial event", async () => {
    const response = await request(app, "GET", TRIPS, {
      authorization: `Bearer ${adminKeyId}:${adminKey}`,
    });
    expect(response.status).toBe(200);
    expect(queryAuditLog({ action: "authz_failure" })).toHaveLength(0);
  });

  it("audits an admin authorization denial with resource and action", async () => {
    const keyId = "test_key_limited";
    const key = await generateApiKey();
    const hashed = await hashApiKey(key);
    await registerApiKey({
      keyId,
      keyHash: hashed.hash,
      keySalt: hashed.salt,
      scope: "read",
      rateLimitTier: 10,
      active: true,
      createdAt: Date.now(),
      expiresAt: 0,
      role: "user",
    });
    const response = await request(app, "GET", ADMIN, {
      authorization: `Bearer ${keyId}:${key}`,
    });
    expect(response.status).toBe(403);
    const event = securityEvent("authz_failure");
    expect(event.success).toBe(false);
    expect(event.metadata?.details).toMatchObject({ resource: "admin", action: "admin" });
  });

  it("audits a rate-limit response with the offending IP", async () => {
    // The bucket refills once per elapsed second; keep the request burst at
    // one instant so a slow CI worker cannot refill a token mid-test.
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const ip = "198.51.100.100";
    for (let index = 0; index < 60; index++) {
      expect((await request(app, "GET", PUBLIC, { ip })).status).toBe(200);
    }
    const response = await request(app, "GET", PUBLIC, { ip });
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
    const event = securityEvent("rate_limit_exceeded");
    expect(event.clientIp).toBe(ip);
    expect(event.success).toBe(false);
  });

  it("audits path traversal in a query parameter", async () => {
    const response = await request(app, "GET", `${PUBLIC}?file=..%2Fetc%2Fpasswd`, {
      ip: ATTACKER_IP,
      userAgent: ATTACKER_UA,
    });
    expect(response.status).toBe(400);
    const event = securityEvent("path_traversal_blocked");
    expect(event.success).toBe(false);
    expect(event.severity).toBe("error");
    expectIncidentContext(event, ATTACKER_IP, ATTACKER_UA);
  });

  it("audits rejected duplicate query parameters", async () => {
    const response = await request(app, "GET", `${PUBLIC}?id=1&id=2`, { ip: ATTACKER_IP });
    expect(response.status).toBe(400);
    const event = securityEvent("hpp_blocked");
    expect(event.metadata?.details).toMatchObject({ parameters: ["id"] });
  });

  it("audits an over-depth JSON body", async () => {
    const response = await request(app, "POST", TRIPS, {
      csrfToken: generateCsrfToken(),
      body: JSON.stringify({ a: { b: { c: { d: { e: true } } } } }),
      headers: { "Content-Type": "application/json" },
    });
    expect(response.status).toBe(413);
    const event = securityEvent("blocked_attack", "json_depth_protection");
    expect(event.success).toBe(false);
  });

  it("audits private-network URLs rejected by SSRF validation", async () => {
    const response = await request(app, "GET", `${PUBLIC}?url=http%3A%2F%2F192.168.1.1%2Fadmin`, {
      ip: ATTACKER_IP,
      userAgent: ATTACKER_UA,
    });
    expect(response.status).toBe(400);
    const event = securityEvent("suspicious_request", "ssrf_url_blocked");
    expectIncidentContext(event, ATTACKER_IP, ATTACKER_UA);
  });

  it("audits a Host header outside the allow-list", async () => {
    const response = await request(app, "GET", PUBLIC, {
      ip: ATTACKER_IP,
      userAgent: ATTACKER_UA,
      headers: { Host: "attacker.example" },
    });
    expect(response.status).toBe(400);
    const event = securityEvent("suspicious_request", "host_header_rejected");
    expectIncidentContext(event, ATTACKER_IP, ATTACKER_UA);
  });

  it("audits a state-changing request without a CSRF token", async () => {
    const response = await request(app, "POST", TRIPS, {
      body: JSON.stringify({ test: true }),
      headers: { "Content-Type": "application/json" },
    });
    expect(response.status).toBe(403);
    const event = authFailure("missing_csrf_token");
    expect((event.metadata?.details as Record<string, unknown>).reason).toBe("missing_csrf_token");
    expect(event.method).toBe("POST");
  });

  it("audits an invalid CSRF cookie with its failure reason and request context", async () => {
    const response = await request(app, "POST", COOKIE_ACTION, {
      ip: ATTACKER_IP,
      userAgent: ATTACKER_UA,
      headers: { Cookie: "csrf_token=not-a-valid-signed-cookie" },
    });

    expect(response.status).toBe(403);
    const event = authFailure("missing_csrf_cookie");
    expect(event.category).toBe("security");
    expect(event.success).toBe(false);
    expect(event.severity).toBe("error");
    expect(event.path).toBe(COOKIE_ACTION);
    expect(event.method).toBe("POST");
    expect(event.metadata?.details).toMatchObject({ reason: "missing_csrf_cookie" });
    expectIncidentContext(event, ATTACKER_IP, ATTACKER_UA);
  });

  it("audits a restricted HTTP method that Request can construct", async () => {
    const response = await request(app, "PATCH", PUBLIC, { csrfToken: generateCsrfToken() });
    expect(response.status).toBe(405);
    const event = securityEvent("blocked_attack", "http_method_blocked");
    expect(event.success).toBe(false);
    expect(event.method).toBe("PATCH");
  });

  it("audits a response that exceeds the JSON size limit", async () => {
    const response = await request(app, "GET", "/api/public/large");
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: "Response too large" });
    const event = securityEvent("blocked_attack", "json_response_size_limit");
    expect(event.success).toBe(false);
  });

  it("reports and filters the failed security events it collected", async () => {
    await request(app, "GET", PUBLIC, { headers: { Host: "attacker.example" }, ip: ATTACKER_IP });
    await request(app, "GET", `${PUBLIC}?file=..%2Fetc%2Fpasswd`, { ip: ATTACKER_IP });
    const stats = getAuditLogStats();
    expect(stats.totalEvents).toBeGreaterThanOrEqual(2);
    expect(stats.eventsByCategory.security).toBe(stats.totalEvents);
    expect(stats.failedEvents24h).toBeGreaterThanOrEqual(1);
    const failures = queryAuditLog({ category: "security", success: false });
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures.some((event) => event.clientIp === ATTACKER_IP)).toBe(true);
  });

  it("preserves incident context and chronological timestamps across attack types", async () => {
    await request(app, "GET", `${PUBLIC}?file=..%2Fetc%2Fpasswd`, {
      ip: ATTACKER_IP,
      userAgent: ATTACKER_UA,
    });
    await request(app, "GET", `${PUBLIC}?url=http%3A%2F%2Flocalhost%3A6379`, {
      ip: ATTACKER_IP,
      userAgent: ATTACKER_UA,
    });
    const events = queryAuditLog({ category: "security" }).filter((event) =>
      ["path_traversal_blocked", "suspicious_request"].includes(event.action)
    );
    expect(events.some((event) => event.action === "path_traversal_blocked")).toBe(true);
    expect(
      events.some(
        (event) =>
          (event.metadata?.details as Record<string, unknown> | undefined)?.pattern ===
          "ssrf_url_blocked"
      )
    ).toBe(true);
    for (const event of events) expectIncidentContext(event, ATTACKER_IP, ATTACKER_UA);
    const times = events.map((event) => event.timestamp).sort((a, b) => a - b);
    expect(times[0]).toBeLessThanOrEqual(times[times.length - 1]!);
  });
});
