/**
 * Integration tests for audit logging across the real middleware chain.
 *
 * Unlike the bridge-based audit tests (audit-log-security-events.test.ts),
 * these tests wire the production middleware themselves — requestId,
 * securityLogging, hostHeaderProtection, csrfProtection, pathTraversal,
 * HPP, SSRF, JSON-depth, auth, rateLimiter — and let the real
 * `securityLogger` → `addAuditEvent` path in security-logging.ts write the
 * audit entries. Nothing here fabricates events on the middleware's behalf.
 *
 * Covered:
 * - Authentication attempts: valid key (no failure event), missing key,
 *   unknown key, malformed token — each with the audited failure reason
 * - Authorization decisions: scope denial (authz_failure) and grant
 *   (logAuthorizationSuccess written by the handler, the intended usage)
 * - Rate limiting: quota exhaustion (429 → rate_limit_exceeded) and
 *   token-refill reset
 * - Security events: CSRF failures, host-header rejection, path traversal,
 *   parameter pollution
 * - Audit event format: required fields, enum validity, uniqueness, ordering
 * - Request ID correlation: every structured audit event for a request
 *   carries the request's ID (request-id.ts → structured-audit-log.ts), and
 *   client-supplied IDs pass through only when safe
 *
 * Note on request IDs: the legacy AUDIT_LOG entries (audit-log.ts) have no
 * requestId field by design — the request ID is correlated on the structured
 * store (structured-audit-log.ts), which is what request-id.ts documents as
 * its consumer. Legacy entries correlate by clientIp/path/method.
 */

import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type AuditEvent,
  type AuditEventCategory,
  clearAuditLog,
  logAuthorizationSuccess,
  queryAuditLog,
} from "../middleware/audit-log.js";
import { apiKeyAuth, optionalAuth } from "../middleware/authentication.js";
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
import {
  type StructuredAuditEvent,
  clearAuditLogs,
  getRelatedEvents,
  logAuditEventFromContext,
  queryAuditLogs,
} from "../middleware/structured-audit-log.js";
import { cleanupAllState, createTestApiKey } from "./test-helpers.js";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const CLIENT_IP = "203.0.113.7";
const USER_AGENT = "audit-chain-test-agent/1.0";
// The harness allowlists this host (as ALLOWED_HOSTS does in production).
// Bare hostHeaderProtection() defaults would block localhost AND allow every
// other hostname, leaving no rejecting case to audit.
const VALID_HOST = "api.mtamyway.test";

const AUDIT_CATEGORIES = [
  "authentication",
  "authorization",
  "api_keys",
  "users",
  "sessions",
  "admin",
  "data_access",
  "configuration",
  "security",
];

const AUDIT_SEVERITIES = ["info", "warning", "error", "critical"];

/**
 * The security event details shipped in an audit entry's metadata block.
 */
function detailsOf(event: AuditEvent): Record<string, unknown> {
  return (event.metadata?.details as Record<string, unknown> | undefined) ?? {};
}

/**
 * Find audit events by action.
 */
function eventsByAction(action: string): AuditEvent[] {
  return queryAuditLog({ action, limit: 1000 });
}

/**
 * Issue a request through the chain the way production traffic arrives:
 * an explicit Host (app.request sends none, which hostHeaderProtection
 * rightly blocks) plus the client IP header Cloudflare sets.
 */
function chainRequest(app: Hono, path: string, init: RequestInit = {}): Promise<Response> {
  return app.request(path, {
    ...init,
    headers: {
      Host: VALID_HOST,
      "CF-Connecting-IP": CLIENT_IP,
      "User-Agent": USER_AGENT,
      ...init.headers,
    },
  });
}

/**
 * Structured audit middleware, the shape request-id.ts documents: events
 * bookending the request, stamped with the request ID both as the event's
 * context.requestId and as the correlation ID grouping related events.
 */
function structuredAuditTrail(): MiddlewareHandler {
  return async (c, next) => {
    const requestIdForEvent = c.get("requestId") as string | undefined;
    logAuditEventFromContext(c, {
      category: "security",
      severity: "info",
      outcome: "success",
      action: "request_started",
      correlationId: requestIdForEvent,
    });
    await next();
    const status = c.res.status;
    logAuditEventFromContext(c, {
      category: "security",
      severity: "info",
      outcome: status < 400 ? "success" : "failure",
      action: "request_completed",
      correlationId: requestIdForEvent,
    });
  };
}

interface ChainOptions {
  /** HPP strategy override — the default ("first") never rejects. */
  hppReject?: boolean;
  /**
   * CSRF exclude paths, matching production's excludePaths shape (prefix
   * match). app.ts excludes "/api/trip", which covers "/api/trips/..." —
   * authorization tests reuse that exclusion so a DELETE reaches the
   * authorization middleware the way it does in production.
   */
  csrfExcludePaths?: string[];
}

/**
 * Build the production-shaped middleware chain under test.
 */
function buildChainApp(options: ChainOptions = {}): Hono {
  const app = new Hono();

  app.use("*", requestId);
  app.use("*", structuredAuditTrail());
  app.use("*", securityLogging());
  app.use("*", hostHeaderProtection({ allowedHosts: [VALID_HOST] }));
  app.use(
    "*",
    csrfProtection(options.csrfExcludePaths ? { excludePaths: options.csrfExcludePaths } : {})
  );
  app.use("*", pathTraversalPrevention());
  app.use("*", options.hppReject ? hppProtection({ strategy: "reject" }) : hppProtection());
  app.use("*", ssrfProtection());
  app.use("*", jsonDepthProtection());
  app.use("*", optionalAuth());
  app.use("*", rateLimiter());

  return app;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("audit logging across the middleware chain", () => {
  beforeEach(async () => {
    await cleanupAllState();
    clearAuditLog();
    clearAuditLogs("CONFIRM_CLEAR_AUDIT_LOGS");
  });

  // =========================================================================
  // Authentication events
  // =========================================================================

  describe("authentication events", () => {
    function buildAuthApp(): Hono {
      const app = buildChainApp();
      app.get("/api/secure", apiKeyAuth({ requiredScope: "read" }), (c) => c.json({ ok: true }));
      return app;
    }

    it("a valid API key authenticates without logging any auth_failure", async () => {
      const { authorizationHeader } = await createTestApiKey("read", "user");
      const app = buildAuthApp();

      const res = await chainRequest(app, "/api/secure", {
        headers: { Authorization: authorizationHeader },
      });

      expect(res.status).toBe(200);
      expect(eventsByAction("auth_failure")).toEqual([]);
    });

    it("a missing key is logged as auth_failure with the audited reason", async () => {
      const app = buildAuthApp();

      const res = await chainRequest(app, "/api/secure");

      expect(res.status).toBe(401);

      const failures = eventsByAction("auth_failure");
      const missing = failures.find((e) => detailsOf(e)["reason"] === "missing_api_key");
      expect(missing).toBeDefined();

      // The middleware logs the failure before the response is finalized, so
      // the status-based securityLogging middleware supplies the 401 record.
      expect(failures.some((e) => e.metadata?.["statusCode"] === 401)).toBe(true);

      if (missing) {
        expect(missing.category).toBe("security");
        expect(missing.success).toBe(false);
        expect(missing.severity).toBe("error");
        expect(missing.clientIp).toBe(CLIENT_IP);
        expect(missing.path).toBe("/api/secure");
        expect(missing.method).toBe("GET");
        expect(missing.metadata?.["userAgent"]).toBe(USER_AGENT);
      }
    });

    it("an unknown key/secret pair is logged as auth_failure (invalid_api_key)", async () => {
      const app = buildAuthApp();

      const res = await chainRequest(app, "/api/secure", {
        headers: { Authorization: "Bearer unknown_key:not-the-secret" },
      });

      expect(res.status).toBe(401);
      const reasons = eventsByAction("auth_failure").map((e) => detailsOf(e)["reason"]);
      expect(reasons).toContain("invalid_api_key");
    });

    it("a malformed token fails format validation and is logged before any lookup", async () => {
      const app = buildAuthApp();

      // Spaces are not valid in a key id — rejectable without touching the store
      const res = await chainRequest(app, "/api/secure", {
        headers: { Authorization: "Bearer bad key id:secret" },
      });

      expect(res.status).toBe(401);
      const reasons = eventsByAction("auth_failure").map((e) => detailsOf(e)["reason"]);
      expect(reasons).toContain("invalid_api_key_format");
    });
  });

  // =========================================================================
  // Authorization events
  // =========================================================================

  describe("authorization events", () => {
    function buildAuthzApp(): Hono {
      // Production's CSRF excludePaths lists "/api/trip", whose prefix match
      // covers "/api/trips/..." — mirror that so the DELETE reaches
      // requireResourceAccess instead of being rejected as a CSRF failure.
      const app = buildChainApp({ csrfExcludePaths: ["/api/trip"] });
      app.delete("/api/trips/:id", requireResourceAccess("trip", "delete"), (c) => {
        logAuthorizationSuccess(c, "trip", "delete");
        return c.json({ deleted: c.req.param("id") });
      });
      return app;
    }

    it("an unauthenticated delete is denied and logged as authz_failure", async () => {
      const app = buildAuthzApp();

      const res = await chainRequest(app, "/api/trips/trip-1", { method: "DELETE" });

      expect(res.status).toBe(401);

      const denials = eventsByAction("authz_failure");
      const denial = denials.find((e) => e.success === false);
      expect(denial).toBeDefined();
      if (denial) {
        expect(denial.category).toBe("security");
        expect(denial.severity).toBe("warning");
        expect(detailsOf(denial)["resource"]).toBe("trip");
        expect(detailsOf(denial)["action"]).toBe("delete");
        expect(denial.clientIp).toBe(CLIENT_IP);
        expect(denial.method).toBe("DELETE");
      }
    });

    it("a read-scope key is denied a delete and the denial names the actor's request", async () => {
      const { authorizationHeader } = await createTestApiKey("read", "user");
      const app = buildAuthzApp();

      const res = await chainRequest(app, "/api/trips/trip-1", {
        method: "DELETE",
        headers: { Authorization: authorizationHeader },
      });

      expect(res.status).toBe(403);
      expect(eventsByAction("authz_failure").length).toBeGreaterThan(0);
      // The key itself was valid — no key-validation failure may appear.
      // (securityLogging does log a generic "HTTP 403" auth_failure for any
      // 403 response; that is the status-level record, not an auth rejection.)
      const keyFailures = eventsByAction("auth_failure").map((e) => detailsOf(e)["reason"]);
      expect(keyFailures).not.toContain("missing_api_key");
      expect(keyFailures).not.toContain("invalid_api_key");
      expect(keyFailures).not.toContain("invalid_api_key_format");
    });

    it("a granted delete logs an authorization success naming the resource and actor", async () => {
      const { authorizationHeader, keyId } = await createTestApiKey("write", "user");
      const app = buildAuthzApp();

      const res = await chainRequest(app, "/api/trips/trip-1", {
        method: "DELETE",
        headers: { Authorization: authorizationHeader },
      });

      expect(res.status).toBe(200);

      const grants = queryAuditLog({ category: "authorization", success: true, limit: 100 });
      const grant = grants.find((e) => e.action === "trip:delete");
      expect(grant).toBeDefined();
      if (grant) {
        expect(grant.resourceType).toBe("trip");
        expect(grant.performedBy).toBe(keyId);
        expect(grant.clientIp).toBe(CLIENT_IP);
        expect(grant.path).toBe("/api/trips/trip-1");
        expect(grant.method).toBe("DELETE");
      }
    });
  });

  // =========================================================================
  // Rate limit events
  // =========================================================================

  describe("rate limit events", () => {
    function buildOpenApp(): Hono {
      const app = buildChainApp();
      app.get("/api/open", (c) => c.json({ ok: true }));
      return app;
    }

    it("exhausting the per-IP quota logs exactly one rate_limit_exceeded event", async () => {
      const app = buildOpenApp();

      // The bucket holds 60 tokens; the 61st request is the violation
      let lastStatus = 0;
      for (let i = 0; i < 61; i++) {
        lastStatus = (await chainRequest(app, "/api/open")).status;
      }

      expect(lastStatus).toBe(429);

      const violations = eventsByAction("rate_limit_exceeded");
      expect(violations).toHaveLength(1);

      const violation = violations[0]!;
      expect(violation.category).toBe("security");
      expect(violation.severity).toBe("warning");
      expect(violation.success).toBe(false);
      expect(violation.clientIp).toBe(CLIENT_IP);
      expect(violation.metadata?.["statusCode"]).toBe(429);
    });

    it("quota reset: after the refill interval the next request succeeds and logs no new violation", async () => {
      const app = buildOpenApp();

      for (let i = 0; i < 61; i++) {
        await chainRequest(app, "/api/open");
      }
      expect(eventsByAction("rate_limit_exceeded")).toHaveLength(1);

      // The bucket refills one token per second
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const res = await chainRequest(app, "/api/open");
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");

      // The reset itself is not a security event — the count is unchanged
      expect(eventsByAction("rate_limit_exceeded")).toHaveLength(1);
    });
  });

  // =========================================================================
  // Security events
  // =========================================================================

  describe("security events", () => {
    function buildActionApp(hppReject = false): Hono {
      const app = buildChainApp({ hppReject });
      app.post("/api/action", (c) => c.json({ done: true }));
      app.get("/api/open", (c) => c.json({ ok: true }));
      return app;
    }

    it("a state-changing request without a CSRF token is logged as auth_failure (missing_csrf_token)", async () => {
      const app = buildActionApp();

      const res = await chainRequest(app, "/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: "x" }),
      });

      expect(res.status).toBe(403);

      const failures = eventsByAction("auth_failure");
      const csrfFailure = failures.find((e) => detailsOf(e)["reason"] === "missing_csrf_token");
      expect(csrfFailure).toBeDefined();
      if (csrfFailure) {
        expect(csrfFailure.success).toBe(false);
        expect(csrfFailure.clientIp).toBe(CLIENT_IP);
        expect(csrfFailure.path).toBe("/api/action");
        expect(csrfFailure.method).toBe("POST");
        // CSRF passes the status explicitly at log time
        expect(detailsOf(csrfFailure)["statusCode"]).toBe(403);
      }
    });

    it("an invalid CSRF token is logged as auth_failure (invalid_csrf_token)", async () => {
      const app = buildActionApp();

      const res = await chainRequest(app, "/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": "forged-token" },
        body: JSON.stringify({ data: "x" }),
      });

      expect(res.status).toBe(403);
      const reasons = eventsByAction("auth_failure").map((e) => detailsOf(e)["reason"]);
      expect(reasons).toContain("invalid_csrf_token");
    });

    it("a disallowed Host header is rejected and logged as a suspicious request", async () => {
      const app = buildActionApp();

      const res = await chainRequest(app, "/api/open", {
        headers: { Host: "evil.example.com" },
      });

      expect(res.status).toBe(400);

      const hostEvents = eventsByAction("suspicious_request");
      const hostEvent = hostEvents.find((e) => detailsOf(e)["pattern"] === "host_header_rejected");
      expect(hostEvent).toBeDefined();
      if (hostEvent) {
        expect(hostEvent.category).toBe("security");
        expect(hostEvent.severity).toBe("warning");
        expect(hostEvent.clientIp).toBe(CLIENT_IP);
        expect(hostEvent.path).toBe("/api/open");
        // The request never reached a handler — no auth failure was involved
        expect(eventsByAction("auth_failure")).toEqual([]);
      }
    });

    it("a path traversal attempt in a query parameter is blocked and logged", async () => {
      const app = buildActionApp();

      const res = await chainRequest(app, "/api/open?file=../../../etc/passwd");

      expect(res.status).toBe(400);

      const traversals = eventsByAction("path_traversal_blocked");
      expect(traversals.length).toBeGreaterThan(0);
      const traversal = traversals[0]!;
      expect(traversal.severity).toBe("error");
      expect(traversal.success).toBe(false);
      expect(traversal.clientIp).toBe(CLIENT_IP);
      expect(String(detailsOf(traversal)["detectedPath"])).toContain("file");
    });

    it("duplicate query parameters under the reject strategy are logged as hpp_blocked", async () => {
      const app = buildActionApp(true);

      const res = await chainRequest(app, "/api/open?id=1&id=2");

      expect(res.status).toBe(400);

      const hppEvents = eventsByAction("hpp_blocked");
      expect(hppEvents.length).toBeGreaterThan(0);
      const hppEvent = hppEvents[0]!;
      expect(hppEvent.severity).toBe("warning");
      expect(hppEvent.clientIp).toBe(CLIENT_IP);
      expect(detailsOf(hppEvent)["parameters"]).toEqual(["id"]);
    });
  });

  // =========================================================================
  // Audit log format
  // =========================================================================

  describe("audit log format", () => {
    it("every captured event carries the required fields with valid values", async () => {
      const app = buildChainApp();
      app.get("/api/open", (c) => c.json({ ok: true }));
      app.post("/api/action", (c) => c.json({ done: true }));

      // A mix of outcomes so the format check covers several emitters
      await chainRequest(app, "/api/open");
      await chainRequest(app, "/api/secure");
      await chainRequest(app, "/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await chainRequest(app, "/api/open?file=../etc/passwd");

      const events = queryAuditLog({ limit: 1000 });
      expect(events.length).toBeGreaterThan(0);

      const seenIds = new Set<string>();
      for (const event of events) {
        expect(typeof event.id).toBe("string");
        expect(event.id.length).toBeGreaterThan(0);
        seenIds.add(event.id);

        expect(event.timestamp).toBeGreaterThan(Date.now() - 10_000);
        expect(event.timestamp).toBeLessThanOrEqual(Date.now());
        expect(new Date(event.timestamp).toISOString()).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
        );

        expect(AUDIT_CATEGORIES).toContain(event.category as AuditEventCategory);
        expect(AUDIT_SEVERITIES).toContain(event.severity);

        expect(typeof event.action).toBe("string");
        expect(event.action.length).toBeGreaterThan(0);
        expect(typeof event.success).toBe("boolean");

        expect(event.clientIp).toBe(CLIENT_IP);
      }
      expect(seenIds.size).toBe(events.length);
    });

    it("events are stored newest-first", async () => {
      const app = buildChainApp();
      app.get("/api/open", (c) => c.json({ ok: true }));

      await chainRequest(app, "/api/secure");
      await chainRequest(app, "/api/secure");

      const events = queryAuditLog({ limit: 1000 });
      for (let i = 0; i < events.length - 1; i++) {
        expect(events[i]!.timestamp).toBeGreaterThanOrEqual(events[i + 1]!.timestamp);
      }
    });
  });

  // =========================================================================
  // Request ID correlation
  // =========================================================================

  describe("request ID correlation", () => {
    function buildCorrelationApp(): Hono {
      const app = buildChainApp();
      app.get("/api/open", (c) => c.json({ ok: true }));
      app.get("/api/secure", apiKeyAuth({ requiredScope: "read" }), (c) => c.json({ ok: true }));
      return app;
    }

    it("both structured events for a request carry the request's ID", async () => {
      const app = buildCorrelationApp();

      const res = await chainRequest(app, "/api/open", {
        headers: { "X-Request-ID": "audit-corr-123" },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("X-Request-ID")).toBe("audit-corr-123");

      const mine = queryAuditLogs({}).filter(
        (e) => e.action === "request_started" || e.action === "request_completed"
      );
      expect(mine.length).toBe(2);
      for (const event of mine) {
        expect(event.context.requestId).toBe("audit-corr-123");
      }
    });

    it("events from different requests never share a request ID", async () => {
      const app = buildCorrelationApp();

      await chainRequest(app, "/api/open");
      await chainRequest(app, "/api/open");

      const completions = queryAuditLogs({}).filter((e) => e.action === "request_completed");
      expect(completions.length).toBe(2);
      expect(completions[0]!.context.requestId).toBeDefined();
      expect(completions[1]!.context.requestId).toBeDefined();
      expect(completions[0]!.context.requestId).not.toBe(completions[1]!.context.requestId);
    });

    it("related events group under the request's correlation ID", async () => {
      const app = buildCorrelationApp();

      const res = await chainRequest(app, "/api/open", {
        headers: { "X-Request-ID": "audit-corr-456" },
      });
      expect(res.status).toBe(200);

      const related: StructuredAuditEvent[] = getRelatedEvents("audit-corr-456");
      expect(related.length).toBe(2);
      expect(related.map((e) => e.action).sort()).toEqual(["request_completed", "request_started"]);
      for (const event of related) {
        expect(event.metadata.correlationId).toBe("audit-corr-456");
        expect(event.context.requestId).toBe("audit-corr-456");
      }
    });

    it("an unsafe client-supplied request ID is replaced, not echoed", async () => {
      const app = buildCorrelationApp();

      // Unsafe per request-id.ts's SAFE_ID_RE but still a legal header value
      // (a CRLF payload cannot be constructed through the Fetch Headers API
      // at all — it is rejected client-side, before the middleware runs).
      const unsafeId = "bad;id<script>";
      const res = await chainRequest(app, "/api/open", {
        headers: { "X-Request-ID": unsafeId },
      });

      expect(res.status).toBe(200);

      const echoed = res.headers.get("X-Request-ID") ?? "";
      expect(echoed).not.toBe(unsafeId);
      expect(echoed).toMatch(/^[a-zA-Z0-9\-_.]{1,64}$/);

      const completions = queryAuditLogs({}).filter((e) => e.action === "request_completed");
      expect(completions[0]!.context.requestId).toBe(echoed);
    });

    it("a rejected request's legacy audit entry carries the request's correlation context", async () => {
      const app = buildCorrelationApp();

      const res = await chainRequest(app, "/api/secure", {
        headers: { "X-Request-ID": "audit-corr-789" },
      });
      expect(res.status).toBe(401);

      // The legacy store has no requestId field; its correlation fields are
      // ip/path/method/userAgent, which must match the rejected request.
      const failure = eventsByAction("auth_failure").find(
        (e) => detailsOf(e)["reason"] === "missing_api_key"
      );
      expect(failure).toBeDefined();
      if (failure) {
        expect(failure.clientIp).toBe(CLIENT_IP);
        expect(failure.path).toBe("/api/secure");
        expect(failure.method).toBe("GET");
        expect(failure.metadata?.["userAgent"]).toBe(USER_AGENT);
      }

      // The structured store still ties both bookends to the same request ID
      const related = getRelatedEvents("audit-corr-789");
      expect(related.length).toBe(2);
      const completed = related.find((e) => e.action === "request_completed");
      expect(completed?.outcome).toBe("failure");
    });
  });
});
