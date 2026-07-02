/**
 * Integration tests for rate limiter combined with authentication middleware.
 *
 * Verifies that the global (IP-based) rate limiter interacts correctly
 * with optional auth — which runs before the rate limiter in the production
 * chain.  Key invariants:
 *
 * - Auth context is established first but does NOT create per-user buckets;
 *   the rate limiter remains IP-based.
 * - Authenticated and unauthenticated requests from the same IP share one
 *   bucket.
 * - Different IPs always have independent buckets regardless of auth
 *   identity.
 * - Rate limiting (429) is enforced identically for authenticated and
 *   unauthenticated traffic.
 * - Earlier middleware (requestId, securityHeaders) still applies to both
 *   successful and rate-limited authenticated requests.
 */

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AuthVars } from "../test/rate-limiter-harness.js";
import {
  IP_A,
  IP_B,
  createAuthBeforeRateLimitApp,
  disableRateLimiting,
  enableRateLimiting,
  mockOptionalAuth,
  rateLimiter,
  resetRateLimiter,
} from "../test/rate-limiter-harness.js";
import { requestId } from "./request-id.js";
import { securityHeaders } from "./security-headers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Bearer token for user "alice" (apiKeyId:key-user-1, userId:alice). */
const ALICE_AUTH = "Bearer key-user-1:alice";

/** Bearer token for user "bob" (apiKeyId:key-user-2, userId:bob). */
const BOB_AUTH = "Bearer key-user-2:bob";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("rate limiter + optional auth integration", () => {
  let app: Hono;

  beforeEach(() => {
    enableRateLimiting();
    app = createAuthBeforeRateLimitApp();
  });

  afterEach(() => {
    disableRateLimiting();
  });

  // -----------------------------------------------------------------------
  // AC 1: counters increment identically for authenticated & unauthenticated
  // -----------------------------------------------------------------------

  describe("counter increments for authenticated requests", () => {
    it("decrements remaining tokens the same as unauthenticated", async () => {
      // Authenticated request — first token consumed
      const res1 = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
      });
      expect(res1.status).toBe(200);
      expect(res1.headers.get("X-RateLimit-Remaining")).toBe("59");

      // Unauthenticated request from same IP — same bucket
      const res2 = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res2.status).toBe(200);
      expect(res2.headers.get("X-RateLimit-Remaining")).toBe("58");

      // Another authenticated request — continues decrementing
      const res3 = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: BOB_AUTH },
      });
      expect(res3.status).toBe(200);
      expect(res3.headers.get("X-RateLimit-Remaining")).toBe("57");
    });

    it("alternating auth and no-auth requests share one counter", async () => {
      let remaining: number | null = null;

      for (let i = 0; i < 10; i++) {
        const headers: Record<string, string> = { "CF-Connecting-IP": IP_A };
        // Alternate between authenticated and unauthenticated
        if (i % 2 === 0) headers.Authorization = ALICE_AUTH;
        const res = await app.request("/api/test", { headers });
        expect(res.status).toBe(200);
        remaining = Number(res.headers.get("X-RateLimit-Remaining"));
      }

      // 10 requests from same IP → remaining should be 50 regardless of auth mix
      expect(remaining).toBe(50);
    });
  });

  // -----------------------------------------------------------------------
  // AC 2: same-IP different users share one bucket
  // -----------------------------------------------------------------------

  describe("same-IP different users share one bucket", () => {
    it("different authenticated users on the same IP share the same rate limit bucket", async () => {
      // User alice
      const res1 = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
      });
      expect(res1.headers.get("X-RateLimit-Remaining")).toBe("59");

      // User bob — same IP, same bucket
      const res2 = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: BOB_AUTH },
      });
      expect(res2.headers.get("X-RateLimit-Remaining")).toBe("58");

      // Unauthenticated — still same bucket
      const res3 = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res3.headers.get("X-RateLimit-Remaining")).toBe("57");
    });

    it("exhausting bucket as one user blocks a different user on the same IP", async () => {
      // Exhaust as alice
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
        });
      }

      // Bob on same IP — rate limited
      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: BOB_AUTH },
      });
      expect(res.status).toBe(429);
    });
  });

  // -----------------------------------------------------------------------
  // AC 3: different IPs have independent buckets regardless of auth
  // -----------------------------------------------------------------------

  describe("different IPs have independent buckets regardless of auth identity", () => {
    it("same authenticated user on different IPs gets independent buckets", async () => {
      // Alice on IP A
      const res1 = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
      });
      expect(res1.headers.get("X-RateLimit-Remaining")).toBe("59");

      // Same alice on IP B — full bucket
      const res2 = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_B, Authorization: ALICE_AUTH },
      });
      expect(res2.headers.get("X-RateLimit-Remaining")).toBe("59");
    });

    it("exhausting IP A does not affect IP B even with same auth identity", async () => {
      // Exhaust IP A as alice
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
        });
      }

      // IP A is exhausted
      const blocked = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
      });
      expect(blocked.status).toBe(429);

      // IP B with same alice — still has full bucket
      const ok = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_B, Authorization: ALICE_AUTH },
      });
      expect(ok.status).toBe(200);
      expect(ok.headers.get("X-RateLimit-Remaining")).toBe("59");
    });

    it("different users on different IPs are fully independent", async () => {
      // Alice on IP A
      const res1 = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
      });
      expect(res1.headers.get("X-RateLimit-Remaining")).toBe("59");

      // Bob on IP B — independent full bucket
      const res2 = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_B, Authorization: BOB_AUTH },
      });
      expect(res2.headers.get("X-RateLimit-Remaining")).toBe("59");

      // Exhaust IP A as alice
      for (let i = 0; i < 59; i++) {
        await app.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
        });
      }

      // IP A exhausted
      const blocked = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
      });
      expect(blocked.status).toBe(429);

      // Bob on IP B — unaffected
      const bobOk = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_B, Authorization: BOB_AUTH },
      });
      expect(bobOk.status).toBe(200);
      expect(bobOk.headers.get("X-RateLimit-Remaining")).toBe("58");
    });
  });

  // -----------------------------------------------------------------------
  // AC 4: 429 enforcement for authenticated requests after exhaustion
  // -----------------------------------------------------------------------

  describe("429 enforcement for authenticated requests", () => {
    it("rate limiter enforces 429 for authenticated requests after exhaustion", async () => {
      // Exhaust tokens from authenticated user on IP A
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
        });
      }

      // Even with valid auth, should be rate limited
      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
      });
      expect(res.status).toBe(429);
    });

    it("429 response includes rate limit headers for authenticated requests", async () => {
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
        });
      }

      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
      });
      expect(res.status).toBe(429);
      expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
      expect(res.headers.get("X-RateLimit-Reset")).toBeTruthy();
      expect(res.headers.get("Retry-After")).toBe("1");
    });

    it("switching auth identity on exhausted IP does not bypass 429", async () => {
      // Exhaust as alice
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
        });
      }

      // Try as bob — same IP, still blocked
      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: BOB_AUTH },
      });
      expect(res.status).toBe(429);

      // Try unauthenticated — same IP, still blocked
      const res2 = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res2.status).toBe(429);
    });

    it("unauthenticated requests also deplete the shared bucket, leading to 429 for authed requests", async () => {
      // 60 unauthenticated requests exhaust the IP bucket
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }

      // Authenticated request is blocked because IP bucket is shared
      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
      });
      expect(res.status).toBe(429);
    });
  });

  // -----------------------------------------------------------------------
  // AC 5: X-Request-ID present on authenticated requests even when rate limited
  // -----------------------------------------------------------------------

  describe("X-Request-ID on authenticated requests", () => {
    it("present on successful authenticated requests", async () => {
      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("X-Request-ID")).toBeTruthy();
    });

    it("present even when rate limited (requestId runs before rate limiter)", async () => {
      // Exhaust tokens
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
        });
      }

      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
      });
      expect(res.status).toBe(429);
      // requestId runs before rate limiter in createAuthBeforeRateLimitApp
      expect(res.headers.get("X-Request-ID")).toBeTruthy();
    });

    it("unique across authenticated requests", async () => {
      const ids = new Set<string>();

      for (let i = 0; i < 5; i++) {
        const res = await app.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
        });
        const id = res.headers.get("X-Request-ID");
        expect(id).toBeTruthy();
        ids.add(id!);
      }

      // All request IDs should be unique
      expect(ids.size).toBe(5);
    });

    it("absent when rate limiter is placed before requestId (chain ordering)", async () => {
      resetRateLimiter();
      const reversedApp = new Hono<AuthVars>();
      reversedApp.use("/api/*", mockOptionalAuth());
      reversedApp.use("/api/*", rateLimiter());
      reversedApp.use("/api/*", requestId);
      reversedApp.get("/api/test", (c) => c.json({ ok: true }));

      // Exhaust tokens
      for (let i = 0; i < 60; i++) {
        await reversedApp.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
        });
      }

      const res = await reversedApp.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
      });
      expect(res.status).toBe(429);
      // rate limiter short-circuits before requestId runs
      expect(res.headers.get("X-Request-ID")).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // AC 6: security headers present on authenticated requests
  // -----------------------------------------------------------------------

  describe("security headers on authenticated requests", () => {
    it("present on successful authenticated requests", async () => {
      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Security-Policy")).toBeTruthy();
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("present on unauthenticated requests on same IP", async () => {
      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Security-Policy")).toBeTruthy();
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("present on 429 responses (securityHeaders wraps via await next, so it runs after rate limiter returns)", async () => {
      // Exhaust tokens
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
        });
      }

      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
      });
      expect(res.status).toBe(429);
      // In createAuthBeforeRateLimitApp, securityHeaders runs BEFORE rate limiter.
      // It calls await next() which enters the rate limiter; when rate limiter
      // short-circuits with c.json(), control returns to securityHeaders which
      // then adds headers to the response. So headers ARE present on 429s.
      expect(res.headers.get("Content-Security-Policy")).toBeTruthy();
    });

    it("present on 429 when securityHeaders runs before rate limiter (wraps via await next)", async () => {
      resetRateLimiter();
      const headersFirstApp = new Hono<AuthVars>();
      headersFirstApp.use("/api/*", requestId);
      headersFirstApp.use("/api/*", securityHeaders());
      headersFirstApp.use("/api/*", mockOptionalAuth());
      headersFirstApp.use("/api/*", rateLimiter());
      headersFirstApp.get("/api/test", (c) => c.json({ ok: true }));

      // Exhaust tokens
      for (let i = 0; i < 60; i++) {
        await headersFirstApp.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
        });
      }

      const res = await headersFirstApp.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A, Authorization: ALICE_AUTH },
      });
      expect(res.status).toBe(429);
      // securityHeaders calls await next(), which enters the rate limiter.
      // When rate limiter returns 429, control flows back to securityHeaders
      // which adds its headers to the response.
      expect(res.headers.get("Content-Security-Policy")).toBeTruthy();
      expect(res.headers.get("X-Request-ID")).toBeTruthy();
    });
  });
});
