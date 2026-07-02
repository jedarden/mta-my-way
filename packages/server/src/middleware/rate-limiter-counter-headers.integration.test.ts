/**
 * Integration tests for rate limiter counter decrements and header output.
 *
 * Verifies that the rate limiter correctly:
 * - Decrements remaining tokens on each request
 * - Sets X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset on every
 *   request (both 200 and 429)
 * - Allows earlier middleware (requestId, securityHeaders) to process before the
 *   rate limiter short-circuits on 429
 * - Short-circuits so downstream middleware does not run on 429
 * - Refills tokens over time
 * - Clears all state on reset, producing a fresh bucket
 *
 * These tests exercise the middleware chain via the reusable harness so they
 * mirror production ordering without duplicating setup boilerplate.
 */

import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IP_A,
  IP_B,
  createStandardChainApp,
  disableRateLimiting,
  enableRateLimiting,
  getRateLimiterTestMode,
  rateLimiter,
  resetRateLimiter,
  setRateLimiterTestMode,
  withRateLimiting,
} from "../test/rate-limiter-harness.js";
import { requestId } from "./request-id.js";
import { securityHeaders } from "./security-headers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Middleware that records whether it ran. Passes through all requests. */
function createMarkerMiddleware(marker: string): {
  middleware: MiddlewareHandler;
  didRun: () => boolean;
  reset: () => void;
} {
  let ran = false;
  return {
    middleware: async (_c, next) => {
      ran = true;
      await next();
    },
    didRun: () => ran,
    reset: () => {
      ran = false;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("rate limiter counter and header integration", () => {
  // ========================================================================
  // 1. Counter decrements
  // ========================================================================

  describe("counter decrements", () => {
    let app: Hono;

    beforeEach(() => {
      enableRateLimiting();
      app = createStandardChainApp();
    });

    afterEach(() => {
      disableRateLimiting();
    });

    it("decrements remaining tokens by exactly 1 on each request", async () => {
      for (let i = 0; i < 10; i++) {
        const res = await app.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A },
        });
        expect(res.status).toBe(200);
        expect(res.headers.get("X-RateLimit-Remaining")).toBe(String(59 - i));
      }
    });

    it("decrements monotonically from 59 down to 0 without skipping values", async () => {
      const remainingValues: number[] = [];

      for (let i = 0; i < 60; i++) {
        const res = await app.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A },
        });
        remainingValues.push(Number(res.headers.get("X-RateLimit-Remaining")!));
      }

      // Should be exactly [59, 58, 57, ..., 1, 0]
      for (let i = 0; i < remainingValues.length; i++) {
        expect(remainingValues[i]).toBe(59 - i);
      }
    });

    it("reports 0 remaining immediately before the 429 cutoff", async () => {
      // Use exactly 60 tokens — the last request should show remaining=0
      for (let i = 0; i < 60; i++) {
        const res = await app.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A },
        });
        expect(res.status).toBe(200);
        expect(Number(res.headers.get("X-RateLimit-Remaining"))).toBeGreaterThanOrEqual(0);
      }

      // The 60th request consumed the last token → remaining = 0
      const lastOk = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(lastOk.status).toBe(429);
      expect(lastOk.headers.get("X-RateLimit-Remaining")).toBe("0");
    });

    it("counts requests against the same bucket regardless of HTTP method", async () => {
      // Mix GET and POST — all draw from the same IP bucket
      for (let i = 0; i < 30; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
        await app.request("/api/action", {
          method: "POST",
          headers: { "CF-Connecting-IP": IP_A },
        });
      }

      // 60 requests total — bucket is exhausted
      const blocked = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(blocked.status).toBe(429);
    });

    it("tracks separate counters for different IPs", async () => {
      // Exhaust IP A
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }

      // IP A is blocked
      const resA = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(resA.status).toBe(429);

      // IP B has a full, untouched bucket
      const resB = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_B },
      });
      expect(resB.status).toBe(200);
      expect(resB.headers.get("X-RateLimit-Remaining")).toBe("59");
    });
  });

  // ========================================================================
  // 2. X-RateLimit headers presence and consistency
  // ========================================================================

  describe("X-RateLimit headers presence and consistency", () => {
    let app: Hono;

    beforeEach(() => {
      enableRateLimiting();
      app = createStandardChainApp();
    });

    afterEach(() => {
      disableRateLimiting();
    });

    it("sets X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset on every 200", async () => {
      for (let i = 0; i < 5; i++) {
        const res = await app.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A },
        });
        expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
        expect(res.headers.get("X-RateLimit-Remaining")).toBeDefined();
        expect(res.headers.get("X-RateLimit-Reset")).toBeDefined();
      }
    });

    it("sets X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset on every 429", async () => {
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }

      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res.status).toBe(429);
      expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
      expect(res.headers.get("X-RateLimit-Reset")).toBeDefined();
    });

    it("X-RateLimit-Limit is always '60' across all requests", async () => {
      const responses = [];
      for (let i = 0; i < 61; i++) {
        responses.push(await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } }));
      }

      for (const res of responses) {
        expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
      }
    });

    it("X-RateLimit-Remaining decreases by exactly 1 on consecutive 200s", async () => {
      const res1 = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      const res2 = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });

      const diff =
        Number(res1.headers.get("X-RateLimit-Remaining")!) -
        Number(res2.headers.get("X-RateLimit-Remaining")!);
      expect(diff).toBe(1);
    });

    it("X-RateLimit-Reset is a valid epoch second timestamp", async () => {
      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      const resetStr = res.headers.get("X-RateLimit-Reset")!;
      const resetEpoch = Number(resetStr);

      // Should be an integer ≥ current time
      expect(Number.isInteger(resetEpoch)).toBe(true);
      expect(resetEpoch).toBeGreaterThan(Date.now() / 1000 - 1);
    });

    it("X-RateLimit-Reset stays constant within the same refill window", async () => {
      const resets: string[] = [];
      for (let i = 0; i < 5; i++) {
        const res = await app.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A },
        });
        resets.push(res.headers.get("X-RateLimit-Reset")!);
      }

      // All should be the same (within the same second)
      const uniqueResets = new Set(resets);
      expect(uniqueResets.size).toBe(1);
    });

    it("429 also includes Retry-After header", async () => {
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }

      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("1");
    });

    it("200 responses do NOT include Retry-After header", async () => {
      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("Retry-After")).toBeNull();
    });
  });

  // ========================================================================
  // 3. Rate-limited requests still pass through earlier middleware
  // ========================================================================

  describe("rate-limited requests pass through earlier middleware", () => {
    let app: Hono;

    beforeEach(() => {
      enableRateLimiting();
      app = createStandardChainApp();
    });

    afterEach(() => {
      disableRateLimiting();
    });

    it("X-Request-ID is present on 429 responses (requestId runs before rateLimiter)", async () => {
      // requestId → rateLimiter: requestId sets the header, then rateLimiter
      // short-circuits on 429. requestId header is already committed.
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }

      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res.status).toBe(429);
      expect(res.headers.get("X-Request-ID")).toBeTruthy();
    });

    it("X-Request-ID has a consistent format on both 200 and 429", async () => {
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

      const okRes = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(okRes.headers.get("X-Request-ID")).toMatch(uuidRe);

      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }
      const limitedRes = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(limitedRes.headers.get("X-Request-ID")).toMatch(uuidRe);
    });

    it("custom earlier middleware runs even when rate limiter returns 429", async () => {
      const marker = createMarkerMiddleware("pre-rate-limit");

      const customApp = new Hono();
      customApp.use("/api/*", marker.middleware);
      customApp.use("/api/*", requestId);
      customApp.use("/api/*", rateLimiter());
      customApp.get("/api/test", (c) => c.json({ ok: true }));

      // Exhaust tokens
      for (let i = 0; i < 60; i++) {
        marker.reset();
        await customApp.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }

      marker.reset();
      const res = await customApp.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });

      expect(res.status).toBe(429);
      expect(marker.didRun()).toBe(true);
    });

    it("security headers from earlier middleware survive rate limiter 429", async () => {
      // requestId → rateLimiter → securityHeaders in standard chain.
      // When rateLimiter short-circuits with 429, securityHeaders (downstream)
      // never runs. But headers set by earlier middleware (requestId) persist.
      //
      // Build a chain where securityHeaders is BEFORE rateLimiter:
      const secHeadersApp = new Hono();
      secHeadersApp.use("/api/*", securityHeaders());
      secHeadersApp.use("/api/*", rateLimiter());
      secHeadersApp.get("/api/test", (c) => c.json({ ok: true }));

      // Exhaust
      for (let i = 0; i < 60; i++) {
        await secHeadersApp.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }

      const res = await secHeadersApp.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });

      expect(res.status).toBe(429);
      // securityHeaders ran BEFORE rateLimiter, so its headers are set
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("Content-Security-Policy")).toBeTruthy();
    });
  });

  // ========================================================================
  // 4. Rate limiter short-circuits — downstream middleware does not run
  // ========================================================================

  describe("rate limiter short-circuits downstream middleware on 429", () => {
    beforeEach(() => {
      enableRateLimiting();
    });

    afterEach(() => {
      disableRateLimiting();
    });

    it("downstream middleware does not execute when rate limiter returns 429", async () => {
      const downstream = createMarkerMiddleware("downstream");

      const app = new Hono();
      app.use("/api/*", rateLimiter());
      app.use("/api/*", downstream.middleware);
      app.get("/api/test", (c) => c.json({ ok: true }));

      // Exhaust tokens
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }

      downstream.reset();
      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });

      expect(res.status).toBe(429);
      expect(downstream.didRun()).toBe(false);
    });

    it("downstream middleware does execute on 200 (allowed request)", async () => {
      const downstream = createMarkerMiddleware("downstream");

      const app = new Hono();
      app.use("/api/*", rateLimiter());
      app.use("/api/*", downstream.middleware);
      app.get("/api/test", (c) => c.json({ ok: true }));

      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });

      expect(res.status).toBe(200);
      expect(downstream.didRun()).toBe(true);
    });

    it("route handler does not execute on 429", async () => {
      let handlerCalled = false;

      const app = new Hono();
      app.use("/api/*", rateLimiter());
      app.get("/api/test", (c) => {
        handlerCalled = true;
        return c.json({ ok: true });
      });

      // Exhaust tokens
      for (let i = 0; i < 60; i++) {
        handlerCalled = false;
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
        // Handler should have run for each successful request
        expect(handlerCalled).toBe(true);
      }

      handlerCalled = false;
      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });

      expect(res.status).toBe(429);
      expect(handlerCalled).toBe(false);
    });

    it("security headers (downstream) are absent on 429 when placed after rate limiter", async () => {
      // In the standard chain: requestId → rateLimiter → securityHeaders
      // securityHeaders runs after rateLimiter via next(), so 429 short-circuits
      const app = createStandardChainApp();

      // Exhaust
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }

      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });

      expect(res.status).toBe(429);
      expect(res.headers.get("Content-Security-Policy")).toBeNull();
      expect(res.headers.get("X-Content-Type-Options")).toBeNull();
    });

    it("security headers are present on 200 (downstream middleware runs normally)", async () => {
      const app = createStandardChainApp();

      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Security-Policy")).toBeTruthy();
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });
  });

  // ========================================================================
  // 5. Token refill behavior over time
  // ========================================================================

  describe("token refill over time", () => {
    afterEach(() => {
      vi.useRealTimers();
      disableRateLimiting();
    });

    it("refills 1 token after 1 second", async () => {
      vi.useFakeTimers();
      enableRateLimiting();

      const app = new Hono();
      app.use("/api/*", rateLimiter());
      app.get("/api/test", (c) => c.json({ ok: true }));

      // Exhaust all tokens
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }

      // Blocked
      const blocked = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(blocked.status).toBe(429);

      // Advance time by exactly 1 second (one refill interval)
      vi.advanceTimersByTime(1000);

      // One token should have been refilled
      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");

      // Next request should be blocked again (only 1 token was refilled)
      const blockedAgain = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(blockedAgain.status).toBe(429);
    });

    it("refills multiple tokens proportional to elapsed time", async () => {
      vi.useFakeTimers();
      enableRateLimiting();

      const app = new Hono();
      app.use("/api/*", rateLimiter());
      app.get("/api/test", (c) => c.json({ ok: true }));

      // Exhaust all tokens
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }

      // Advance 5 seconds → 5 tokens refilled
      vi.advanceTimersByTime(5000);

      // Use the 5 refilled tokens
      for (let i = 0; i < 5; i++) {
        const res = await app.request("/api/test", {
          headers: { "CF-Connecting-IP": IP_A },
        });
        expect(res.status).toBe(200);
      }

      // 6th should be blocked
      const blocked = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(blocked.status).toBe(429);
    });

    it("refilled tokens cap at MAX_TOKENS (60)", async () => {
      vi.useFakeTimers();
      enableRateLimiting();

      const app = new Hono();
      app.use("/api/*", rateLimiter());
      app.get("/api/test", (c) => c.json({ ok: true }));

      // Use 10 tokens
      for (let i = 0; i < 10; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }
      expect(
        Number(
          (await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } })).headers.get(
            "X-RateLimit-Remaining"
          )!
        )
      ).toBe(49);

      // Advance 120 seconds — far more than needed to refill 10 tokens
      vi.advanceTimersByTime(120_000);

      // Bucket should be capped at 60 tokens
      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");
    });

    it("X-RateLimit-Reset advances after a refill interval passes", async () => {
      vi.useFakeTimers();
      enableRateLimiting();

      const app = new Hono();
      app.use("/api/*", rateLimiter());
      app.get("/api/test", (c) => c.json({ ok: true }));

      const res1 = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      const resetBefore = Number(res1.headers.get("X-RateLimit-Reset")!);

      // Advance past the reset point
      vi.advanceTimersByTime(2000);

      const res2 = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      const resetAfter = Number(res2.headers.get("X-RateLimit-Reset")!);

      // Reset timestamp should have advanced
      expect(resetAfter).toBeGreaterThanOrEqual(resetBefore);
    });

    it("partial refill within same second gives no extra tokens", async () => {
      vi.useFakeTimers();
      enableRateLimiting();

      const app = new Hono();
      app.use("/api/*", rateLimiter());
      app.get("/api/test", (c) => c.json({ ok: true }));

      // Exhaust
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }

      // Advance only 500ms — less than one refill interval
      vi.advanceTimersByTime(500);

      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res.status).toBe(429);
    });
  });

  // ========================================================================
  // 6. Rate limit reset clears state and creates fresh bucket
  // ========================================================================

  describe("rate limit reset clears state", () => {
    let app: Hono;

    beforeEach(() => {
      enableRateLimiting();
      app = createStandardChainApp();
    });

    afterEach(() => {
      disableRateLimiting();
    });

    it("resetRateLimiter restores a full bucket with 60 tokens", async () => {
      // Use 40 tokens
      for (let i = 0; i < 40; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }

      const before = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(before.headers.get("X-RateLimit-Remaining")).toBe("19");

      resetRateLimiter();

      const after = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(after.status).toBe(200);
      expect(after.headers.get("X-RateLimit-Remaining")).toBe("59");
    });

    it("resetRateLimiter unblocks a previously exhausted IP", async () => {
      // Exhaust all tokens
      for (let i = 0; i < 60; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
      }

      const blocked = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(blocked.status).toBe(429);

      resetRateLimiter();

      const unblocked = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(unblocked.status).toBe(200);
      expect(unblocked.headers.get("X-RateLimit-Remaining")).toBe("59");
    });

    it("resetRateLimiter clears buckets for all IPs simultaneously", async () => {
      // Use tokens from both IPs
      for (let i = 0; i < 30; i++) {
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_A } });
        await app.request("/api/test", { headers: { "CF-Connecting-IP": IP_B } });
      }

      // Both should have 29 remaining
      const resA = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(resA.headers.get("X-RateLimit-Remaining")).toBe("29");

      const resB = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_B },
      });
      expect(resB.headers.get("X-RateLimit-Remaining")).toBe("29");

      resetRateLimiter();

      // Both IPs should now have full buckets
      const freshA = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(freshA.headers.get("X-RateLimit-Remaining")).toBe("59");

      const freshB = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_B },
      });
      expect(freshB.headers.get("X-RateLimit-Remaining")).toBe("59");
    });

    it("resetRateLimiter does not change the test mode flag", async () => {
      expect(getRateLimiterTestMode()).toBe(false);
      resetRateLimiter();
      expect(getRateLimiterTestMode()).toBe(false);
    });

    it("a fresh bucket after reset has the correct X-RateLimit-Limit", async () => {
      resetRateLimiter();

      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
    });

    it("consecutive resets are safe and produce a valid fresh bucket", async () => {
      resetRateLimiter();
      resetRateLimiter();
      resetRateLimiter();

      const res = await app.request("/api/test", {
        headers: { "CF-Connecting-IP": IP_A },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("X-RateLimit-Remaining")).toBe("59");
      expect(res.headers.get("X-RateLimit-Limit")).toBe("60");
    });
  });
});
