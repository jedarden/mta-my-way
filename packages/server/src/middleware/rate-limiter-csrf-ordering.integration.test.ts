/**
 * Integration tests for rate limiter combined with CSRF protection and
 * middleware ordering behavior.
 *
 * Verifies:
 * - CSRF-blocked POSTs do NOT consume rate limit tokens (CSRF runs before
 *   the rate limiter in the production chain).
 * - Successful POSTs with a valid CSRF token still decrement the rate limit.
 * - Unauthenticated requests to protected endpoints still consume tokens.
 * - Middleware ordering: rate limiter before requestId means requestId does
 *   not run on 429.
 * - Global (IP-based) rate limiter enforces per-IP regardless of per-user
 *   auth identity.
 * - Rate limiter resets correctly between test suites (no bucket leakage).
 * - Multiple sequential resets do not cause state corruption.
 *
 * These tests exercise the middleware chain via the reusable harness so they
 * mirror production ordering without duplicating setup boilerplate.
 */

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthVars } from "../test/rate-limiter-harness.js";
import {
  IP_A,
  IP_B,
  createAuthCsrfChainApp,
  createReversedOrderApp,
  createStandardChainApp,
  disableRateLimiting,
  enableRateLimiting,
  mockCsrfProtection,
  mockOptionalAuth,
  rateLimiter,
  requestId,
  resetRateLimiter,
} from "../test/rate-limiter-harness.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Bearer token for user "alice". */
const ALICE_AUTH = "Bearer key-user-1:alice";

/** Bearer token for user "bob". */
const BOB_AUTH = "Bearer key-user-2:bob";

/** A valid CSRF token value for tests. */
const VALID_CSRF_TOKEN = "test-csrf-token";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("rate limiter CSRF and middleware ordering integration", () => {
  // ========================================================================
  // 1. CSRF-blocked POSTs do NOT consume rate limit tokens
  // ========================================================================

  describe("CSRF-blocked POSTs do not consume rate limit tokens", () => {
    let app: Hono;

    beforeEach(() => {
      enableRateLimiting();
      app = createAuthCsrfChainApp();
    });

    afterEach(() => {
      disableRateLimiting();
    });

    it("POST without CSRF token returns 403 and does not decrement rate limit", async () => {
      // First request to see initial remaining
      const initial = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(initial.status).toBe(200);
      expect(initial.headers.get("X-RateLimit-Remaining")).toBe("59");

      // POST without CSRF token — should be blocked by CSRF (403)
      const blocked = await app.request("/api/action", {
        method: "POST",
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(blocked.status).toBe(403);

      // Rate limit remaining should still be 59 — CSRF short-circuited
      // before rate limiter could decrement
      const after = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(after.status).toBe(200);
      expect(after.headers.get("X-RateLimit-Remaining")).toBe("58");
    });

    it("multiple CSRF-blocked POSTs do not drain the rate limit bucket", async () => {
      // Send 20 POSTs without CSRF token
      for (let i = 0; i < 20; i++) {
        const res = await app.request("/api/action", {
          method: "POST",
          headers: { "CF-Connecting-IP": IP_A },
        });
        expect(res.status).toBe(403);
      }

      // Rate limit should still have a full bucket — all POSTs were
      // short-circuited by CSRF before reaching the rate limiter
      const check = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(check.status).toBe(200);
      expect(check.headers.get("X-RateLimit-Remaining")).toBe("59");
    });

    it("PUT without CSRF token also does not consume rate limit tokens", async () => {
      const initial = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(initial.headers.get("X-RateLimit-Remaining")).toBe("59");

      const blocked = await app.request("/api/action", {
        method: "PUT",
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(blocked.status).toBe(403);

      const after = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(after.headers.get("X-RateLimit-Remaining")).toBe("58");
    });

    it("DELETE without CSRF token also does not consume rate limit tokens", async () => {
      const initial = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(initial.headers.get("X-RateLimit-Remaining")).toBe("59");

      const blocked = await app.request("/api/action", {
        method: "DELETE",
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(blocked.status).toBe(403);

      const after = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(after.headers.get("X-RateLimit-Remaining")).toBe("58");
    });

    it("PATCH without CSRF token also does not consume rate limit tokens", async () => {
      const initial = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(initial.headers.get("X-RateLimit-Remaining")).toBe("59");

      const blocked = await app.request("/api/action", {
        method: "PATCH",
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(blocked.status).toBe(403);

      const after = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(after.headers.get("X-RateLimit-Remaining")).toBe("58");
    });

    it("GET requests still consume tokens even when CSRF middleware is in chain", async () => {
      const res1 = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res1.status).toBe(200);
      expect(res1.headers.get("X-RateLimit-Remaining")).toBe("59");

      const res2 = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res2.status).toBe(200);
      expect(res2.headers.get("X-RateLimit-Remaining")).toBe("58");
    });

    it("rate limit headers are absent on CSRF-blocked responses", async () => {
      const res = await app.request("/api/action", {
        method: "POST",
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res.status).toBe(403);
      // CSRF short-circuits before rate limiter — no rate limit headers
      expect(res.headers.get("X-RateLimit-Limit")).toBeNull();
      expect(res.headers.get("X-RateLimit-Remaining")).toBeNull();
      expect(res.headers.get("X-RateLimit-Reset")).toBeNull();
    });
  });

  // ========================================================================
  // 2. Successful POSTs with valid CSRF token still decrement rate limit
  // ========================================================================

  describe("successful POSTs with valid CSRF token decrement rate limit", () => {
    let app: Hono;

    beforeEach(() => {
      enableRateLimiting();
      app = createAuthCsrfChainApp();
    });

    afterEach(() => {
      disableRateLimiting();
    });

    it("POST with valid CSRF token succeeds and decrements rate limit", async () => {
      const res = await app.request("/api/action", {
        method: "POST",
        headers: {
          "CF-Connecting-IP": IP_A,
          "X-CSRF-Token": VALID_CSRF_TOKEN,
        },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");
    });

    it("consecutive valid POSTs each decrement the counter", async () => {
      for (let i = 0; i < 10; i++) {
        const res = await app.request("/api/action", {
          method: "POST",
          headers: {
            "CF-Connecting-IP": IP_A,
            "X-CSRF-Token": VALID_CSRF_TOKEN,
          },
        });
        expect(res.status).toBe(200);
        expect(res.headers.get("X-RateLimit-Remaining")).toBe(String(59 - i));
      }
    });

    it("mixing GET and valid POST requests shares one bucket", async () => {
      // 30 GETs + 30 valid POSTs = 60 requests → bucket exhausted
      for (let i = 0; i < 30; i++) {
        await app.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A },
        });
        await app.request("/api/action", {
          method: "POST",
          headers: {
            "CF-Connecting-IP": IP_A,
            "X-CSRF-Token": VALID_CSRF_TOKEN,
          },
        });
      }

      const blocked = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(blocked.status).toBe(429);
    });

    it("rate limit headers are present on successful POSTs with CSRF token", async () => {
      const res = await app.request("/api/action", {
        method: "POST",
        headers: {
          "CF-Connecting-IP": IP_A,
          "X-CSRF-Token": VALID_CSRF_TOKEN,
        },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");
      expect(res.headers.get("X-RateLimit-Reset")).toBeDefined();
    });

    it("authenticated POSTs with valid CSRF token decrement the shared IP bucket", async () => {
      // Authenticated POST
      const res1 = await app.request("/api/action", {
        method: "POST",
        headers: {
          "CF-Connecting-IP": IP_A,
          Authorization: ALICE_AUTH,
          "X-CSRF-Token": VALID_CSRF_TOKEN,
        },
      });
      expect(res1.status).toBe(200);
      expect(res1.headers.get("X-RateLimit-Remaining")).toBe("59");

      // Unauthenticated GET — same bucket, decremented
      const res2 = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res2.status).toBe(200);
      expect(res2.headers.get("X-RateLimit-Remaining")).toBe("58");
    });
  });

  // ========================================================================
  // 3. Unauthenticated requests to protected endpoints still consume tokens
  // ========================================================================

  describe("unauthenticated requests consume rate limit tokens", () => {
    let app: Hono;

    beforeEach(() => {
      enableRateLimiting();
      // Use the auth+CSRF chain which has optional auth + CSRF + rate limiter
      app = createAuthCsrfChainApp();
    });

    afterEach(() => {
      disableRateLimiting();
    });

    it("unauthenticated GET to /api/test consumes a token", async () => {
      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");
    });

    it("unauthenticated GET to /api/profile returns 401 but still consumed a token", async () => {
      const res = await app.request("/api/profile", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      // The route itself returns 401 for unauthenticated, but the rate
      // limiter already ran and decremented (rate limiter is after auth
      // in this chain, so auth runs first, then rate limiter, then handler)
      expect(res.status).toBe(401);
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");
    });

    it("60 unauthenticated requests exhaust the bucket for all users on same IP", async () => {
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }

      // Authenticated request from same IP should be rate limited
      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
      });
      expect(res.status).toBe(429);
    });

    it("rate limit headers are present on unauthenticated requests", async () => {
      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
      expect(res.headers.get("X-RateLimit-Remaining")).toBeDefined();
      expect(res.headers.get("X-RateLimit-Reset")).toBeDefined();
    });
  });

  // ========================================================================
  // 4. Middleware ordering: requestId does not run when rate limiter is first
  // ========================================================================

  describe("middleware ordering: rate limiter before requestId", () => {
    let app: Hono;

    beforeEach(() => {
      enableRateLimiting();
      app = createReversedOrderApp();
    });

    afterEach(() => {
      disableRateLimiting();
    });

    it("X-Request-ID is present on 200 (requestId runs before short-circuit)", async () => {
      // In createReversedOrderApp, rateLimiter is before requestId.
      // On a 200, the rate limiter calls next() so requestId runs.
      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res.status).toBe(200);
      // requestId runs AFTER rate limiter on success path, so it IS present
      expect(res.headers.get("X-Request-ID")).toBeTruthy();
    });

    it("X-Request-ID is absent on 429 (rate limiter short-circuits before requestId)", async () => {
      // Exhaust tokens
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }

      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res.status).toBe(429);
      // rate limiter returns 429 before requestId gets to run
      expect(res.headers.get("X-Request-ID")).toBeNull();
    });

    it("rate limit headers are present on 429 regardless of requestId position", async () => {
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }

      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res.status).toBe(429);
      expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
      expect(res.headers.get("Retry-After")).toBe("1");
    });

    it("custom middleware after rate limiter does not run on 429", async () => {
      let downstreamRan = false;

      const customApp = new Hono<AuthVars>();
      customApp.use("/api/*", rateLimiter());
      customApp.use("/api/*", async (_c, next) => {
        downstreamRan = true;
        await next();
      });
      customApp.get("/api/test", (c) => c.json({ ok: true }));

      // Exhaust
      for (let i = 0; i < 60; i++) {
        await customApp.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }

      downstreamRan = false;
      const res = await customApp.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res.status).toBe(429);
      expect(downstreamRan).toBe(false);
    });
  });

  // ========================================================================
  // 5. Global rate limiter enforces per-IP regardless of auth identity
  // ========================================================================

  describe("global rate limiter enforces per-IP regardless of auth identity", () => {
    let app: Hono;

    beforeEach(() => {
      enableRateLimiting();
      app = createAuthCsrfChainApp();
    });

    afterEach(() => {
      disableRateLimiting();
    });

    it("same user on different IPs gets independent buckets", async () => {
      // Alice on IP A
      const resA = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
      });
      expect(resA.headers.get("X-RateLimit-Remaining")).toBe("59");

      // Alice on IP B — independent full bucket
      const resB = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_B, Authorization: ALICE_AUTH },
      });
      expect(resB.headers.get("X-RateLimit-Remaining")).toBe("59");
    });

    it("different users on same IP share one bucket", async () => {
      // Alice on IP A
      const res1 = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
      });
      expect(res1.headers.get("X-RateLimit-Remaining")).toBe("59");

      // Bob on same IP A — same bucket
      const res2 = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: BOB_AUTH },
      });
      expect(res2.headers.get("X-RateLimit-Remaining")).toBe("58");
    });

    it("exhausting bucket as one user blocks all users on same IP", async () => {
      // Exhaust as alice
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
        });
      }

      // Bob on same IP — blocked
      const bobRes = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: BOB_AUTH },
      });
      expect(bobRes.status).toBe(429);

      // Unauthenticated on same IP — blocked
      const anonRes = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(anonRes.status).toBe(429);
    });

    it("exhausting IP A does not affect IP B even for different users", async () => {
      // Exhaust IP A as alice
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
        });
      }

      // Bob on IP B — full bucket, unaffected
      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_B, Authorization: BOB_AUTH },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");
    });

    it("switching auth identity does not create a new bucket", async () => {
      // 30 requests as alice
      for (let i = 0; i < 30; i++) {
        await app.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
        });
      }

      // 30 requests as bob — same bucket, exhausts it
      for (let i = 0; i < 30; i++) {
        await app.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A, Authorization: BOB_AUTH },
        });
      }

      // alice on same IP — blocked (bucket shared)
      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
      });
      expect(res.status).toBe(429);
    });
  });

  // ========================================================================
  // 6. Rate limiter resets correctly between test suites (no bucket leakage)
  // ========================================================================

  describe("rate limiter resets between test suites (no bucket leakage)", () => {
    let app: Hono;

    beforeEach(() => {
      // enableRateLimiting calls resetRateLimiter internally
      enableRateLimiting();
      app = createStandardChainApp();
    });

    afterEach(() => {
      disableRateLimiting();
    });

    it("each test starts with a fresh bucket (remaining=59)", async () => {
      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");
    });

    it("buckets from a previous describe block do not leak into this block", async () => {
      // If reset wasn't working, tokens might be < 60
      for (let i = 0; i < 60; i++) {
        const res = await app.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A },
        });
        expect(res.status).toBe(200);
      }

      // Next should be 429 — bucket has exactly 60 tokens, no leakage
      const blocked = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(blocked.status).toBe(429);
    });

    it("a second IP also starts with a full bucket after reset", async () => {
      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_B },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");
    });

    it("reset clears bucket for previously exhausted IP", async () => {
      // Exhaust IP A
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }
      const blocked = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(blocked.status).toBe(429);

      // Reset clears all state
      resetRateLimiter();

      const fresh = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(fresh.status).toBe(200);
      expect(fresh.headers.get("X-RateLimit-Remaining")).toBe("59");
    });

    it("enableRateLimiting creates a clean state for each test", async () => {
      // This is effectively testing that beforeEach's enableRateLimiting()
      // call leaves a fresh bucket. The test infrastructure calls
      // enableRateLimiting which calls resetRateLimiter.
      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");
    });
  });

  // ========================================================================
  // 7. Multiple sequential resets do not cause state corruption
  // ========================================================================

  describe("multiple sequential resets do not cause state corruption", () => {
    let app: Hono;

    beforeEach(() => {
      enableRateLimiting();
      app = createStandardChainApp();
    });

    afterEach(() => {
      disableRateLimiting();
    });

    it("double reset produces a valid fresh bucket", async () => {
      // Use some tokens
      for (let i = 0; i < 30; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }

      // Double reset
      resetRateLimiter();
      resetRateLimiter();

      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");
      expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
    });

    it("triple reset produces a valid fresh bucket", async () => {
      for (let i = 0; i < 40; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }

      resetRateLimiter();
      resetRateLimiter();
      resetRateLimiter();

      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");
    });

    it("reset after exhaustion then immediate use works correctly", async () => {
      // Exhaust
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }

      const blocked = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(blocked.status).toBe(429);

      // Reset and immediately exhaust again
      resetRateLimiter();

      for (let i = 0; i < 60; i++) {
        const res = await app.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A },
        });
        expect(res.status).toBe(200);
        expect(Number(res.headers.get("X-RateLimit-Remaining"))).toBe(59 - i);
      }

      // Should be blocked again
      const blockedAgain = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(blockedAgain.status).toBe(429);
    });

    it("alternating reset and use cycles remain consistent", async () => {
      for (let cycle = 0; cycle < 5; cycle++) {
        resetRateLimiter();

        // Use 10 tokens
        for (let i = 0; i < 10; i++) {
          const res = await app.request("/api/test", {
            headers: { "CF-Connecting-IP": IP_A },
          });
          expect(res.status).toBe(200);
          expect(Number(res.headers.get("X-RateLimit-Remaining"))).toBe(59 - i);
        }

        // Should have 49 remaining
        const check = await app.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A },
        });
        expect(check.headers.get("X-RateLimit-Remaining")).toBe("49");
      }
    });

    it("reset with multiple IPs then reset clears all", async () => {
      // Use tokens from both IPs
      for (let i = 0; i < 30; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_B } });
      }

      // Both at 29 remaining
      const resA = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(resA.headers.get("X-RateLimit-Remaining")).toBe("29");

      const resB = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_B },
      });
      expect(resB.headers.get("X-RateLimit-Remaining")).toBe("29");

      // Double reset
      resetRateLimiter();
      resetRateLimiter();

      // Both IPs should have full buckets
      const freshA = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(freshA.headers.get("X-RateLimit-Remaining")).toBe("59");

      const freshB = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_B },
      });
      expect(freshB.headers.get("X-RateLimit-Remaining")).toBe("59");
    });

    it("rapid consecutive resets (10x) do not corrupt state", async () => {
      // Use some tokens first
      for (let i = 0; i < 50; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }

      // Rapid resets
      for (let i = 0; i < 10; i++) {
        resetRateLimiter();
      }

      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");
      expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
    });

    it("reset during partial exhaustion preserves correct counter after reset", async () => {
      // Use 15 tokens
      for (let i = 0; i < 15; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }

      // Reset
      resetRateLimiter();

      // Use 1 token
      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");

      // Should be able to use all 60
      for (let i = 0; i < 59; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }

      const last = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(last.status).toBe(429);
    });
  });

  // ========================================================================
  // 8. CSRF + rate limiter interaction with mixed auth patterns
  // ========================================================================

  describe("CSRF + rate limiter interaction with mixed auth patterns", () => {
    let app: Hono;

    beforeEach(() => {
      enableRateLimiting();
      app = createAuthCsrfChainApp();
    });

    afterEach(() => {
      disableRateLimiting();
    });

    it("CSRF-blocked requests do not prevent authenticated requests from using their tokens", async () => {
      // 20 CSRF-blocked POSTs (no tokens consumed)
      for (let i = 0; i < 20; i++) {
        const res = await app.request("/api/action", {
          method: "POST",
          headers: { "CF-Connecting-IP": IP_A },
        });
        expect(res.status).toBe(403);
      }

      // Authenticated user still has all 60 tokens available
      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");

      // Can make 60 requests total before being blocked
      for (let i = 0; i < 59; i++) {
        await app.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
        });
      }

      const blocked = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
      });
      expect(blocked.status).toBe(429);
    });

    it("CSRF-blocked authenticated POSTs still do not consume tokens", async () => {
      // Authenticated POST without CSRF token
      for (let i = 0; i < 30; i++) {
        const res = await app.request("/api/action", {
          method: "POST",
          headers: {
            "CF-Connecting-IP": IP_A,
            Authorization: ALICE_AUTH,
          },
        });
        expect(res.status).toBe(403);
      }

      // Bucket still full
      const check = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(check.headers.get("X-RateLimit-Remaining")).toBe("59");
    });

    it("valid CSRF token with auth returns route payload with userId", async () => {
      const res = await app.request("/api/action", {
        method: "POST",
        headers: {
          "CF-Connecting-IP": IP_A,
          Authorization: ALICE_AUTH,
          "X-CSRF-Token": VALID_CSRF_TOKEN,
        },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.userId).toBe("alice");
    });

    it("CSRF-blocked responses include error body, not rate limit info", async () => {
      const res = await app.request("/api/action", {
        method: "POST",
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBeTruthy();
      // No rate limit properties in the body
      expect(body).not.toHaveProperty("retryAfter");
    });
  });
});
