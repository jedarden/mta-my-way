/**
 * The base middleware test suite in action — and the reference example for
 * writing one.
 *
 * The middleware under test is a small favorites-listing gate, the shape most
 * of the server's middleware take: authenticate the request, short-circuit
 * with a failure response and a failed audit event when the caller is
 * missing or under-privileged, otherwise call `next()` and record a success
 * event attributed to the acting user.
 *
 * Every helper class appears once, in its usual role:
 *
 * - {@link createMiddlewareSuite} wires the per-test context in the
 *   lifecycle hooks;
 * - `suite.current.users` supplies the admin/regular/guest fixtures, which
 *   double as the token directory the middleware authenticates against;
 * - `suite.current.data` supplies the arrivals the terminal handler serves;
 * - `suite.current.audit` is the sink the middleware records into;
 * - `suite.current.expectAuditTrail()` asserts on the trail the run left
 *   behind.
 */

import type { AuditedEvent } from "@mta-my-way/shared/testing/audit-assertions";
import { type MiddlewareLike, createMiddlewareSuite } from "@mta-my-way/shared/testing/middleware";
import { type MockUser, createMockAuditEvent } from "@mta-my-way/shared/testing/middleware";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// ============================================================================
// The middleware under test
// ============================================================================

/**
 * A favorites-listing middleware: deny unauthenticated callers with 401,
 * deny guests with 403, otherwise serve the board and record what happened.
 *
 * Production audit middlewares write into an injected sink; this one takes
 * the recorder's `record` as that sink, which is exactly how a test wires the
 * recorder in. Tokens are fixture user IDs — the fixtures are the directory.
 */
function createFavoritesAuditor(
  sink: (event: AuditedEvent) => void,
  directory: readonly MockUser[]
): MiddlewareLike {
  return async (request, next) => {
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    const user = directory.find((u) => u.id === token);
    const base = {
      timestamp: Date.now(),
      clientIp: "127.0.0.1",
      userAgent: "test-agent",
      method: request.method,
      path: new URL(request.url).pathname,
    };

    if (!user) {
      sink(
        createMockAuditEvent({
          ...base,
          action: "favorites:list_denied",
          category: "authorization",
          severity: "warning",
          success: false,
          error: "unauthenticated",
        })
      );
      return Response.json({ error: "unauthenticated" }, { status: 401 });
    }

    if (user.role === "guest") {
      sink(
        createMockAuditEvent({
          ...base,
          action: "favorites:list_denied",
          category: "authorization",
          severity: "warning",
          success: false,
          error: "insufficient_role",
          performedBy: user.id,
          role: user.role,
        })
      );
      return Response.json({ error: "insufficient_role" }, { status: 403 });
    }

    const response = await next();
    sink(
      createMockAuditEvent({
        ...base,
        action: "favorites:listed",
        category: "data_access",
        severity: "info",
        success: response.ok,
        performedBy: user.id,
        role: user.role,
        resourceType: "favorite",
      })
    );
    return response;
  };
}

// ============================================================================
// The suite
// ============================================================================

describe("favorites auditor (base suite example)", () => {
  const suite = createMiddlewareSuite("favorites-auditor", {
    request: { url: "http://localhost:3001/api/favorites" },
  });

  beforeEach(() => suite.setup());
  afterEach(() => suite.teardown());

  /** The auditor wired to this test's recorder and fixture directory. */
  function auditor(): MiddlewareLike {
    const { audit, users } = suite.current;
    return createFavoritesAuditor(audit.record, [users.admin, users.regular, users.guest]);
  }

  // ------------------------------------------------------------------------
  // Tests — each one also demonstrates the helper it leans on
  // ------------------------------------------------------------------------

  it("serves the seeded arrival board to a regular user and records one success event", async () => {
    const { fixture, users, data, audit } = suite.current;

    const response = await fixture.run({
      middleware: [auditor()],
      request: fixture.createRequest({
        headers: { authorization: `Bearer ${users.regular.id}` },
      }),
      // The terminal handler serves the seeded board, so the test asserts
      // against `data` rather than hand-built JSON.
      handler: () => Response.json(data.arrivals),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(data.arrivals);
    audit
      .expect()
      .hasCount(1)
      .attributedTo(users.regular.id)
      .allSucceeded()
      .event("favorites:listed")
      .withSeverity("info")
      .forResource("favorite")
      .fromIp("127.0.0.1");
  });

  it("denies an unauthenticated caller with 401 and a failed warning event", async () => {
    const { fixture, audit } = suite.current;

    const response = await fixture.run({ middleware: [auditor()] });

    expect(response.status).toBe(401);
    audit
      .expect()
      .hasCount(1)
      .event("favorites:list_denied")
      .failed("unauthenticated")
      .withSeverity("warning")
      .withSeverityAtLeast("warning");
  });

  it("denies a guest with 403 while still attributing the denial", async () => {
    const { fixture, users, audit } = suite.current;

    const response = await fixture.run({
      middleware: [auditor()],
      request: fixture.createRequest({
        headers: { authorization: `Bearer ${users.guest.id}` },
      }),
    });

    expect(response.status).toBe(403);
    audit
      .expect()
      .hasCount(1)
      .attributedTo(users.guest.id)
      .event("favorites:list_denied")
      .failed("insufficient_role");
  });

  it("records denials and successes in request order across a burst", async () => {
    const { fixture, users, audit } = suite.current;
    const gate = auditor();
    const runAs = (token: string) =>
      fixture.run({
        middleware: [gate],
        request: fixture.createRequest({ headers: { authorization: `Bearer ${token}` } }),
      });

    await runAs(users.regular.id);
    await runAs(users.guest.id);
    await runAs(users.admin.id);

    audit
      .expect()
      .hasCount(3)
      .inChronologicalOrder()
      .withActionCount("favorites:listed", 2)
      .withActionCount("favorites:list_denied", 1);
  });

  it("starts every test with a clean trail and fresh fixtures", () => {
    // The previous tests recorded into their own per-test recorders; this one
    // proves the suite hands out a fresh context rather than a shared one.
    const { audit, users, data } = suite.current;

    expect(audit.events).toHaveLength(0);
    expect(users.regular.id).toBe("user-regular-1");
    expect(data.stations.map((s) => s.id)).toEqual(["101", "102", "103"]);
  });

  it("exposes the suite's configured role as the primary user", () => {
    const { user } = suite.current;

    expect(user.role).toBe("user");
    expect(user.permissions).toContain("trips:read:own");
  });
});
