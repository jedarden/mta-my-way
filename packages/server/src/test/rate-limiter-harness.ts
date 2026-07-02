/**
 * Test harness for rate limiter integration tests.
 *
 * Provides reusable app factories, mock middleware helpers, IP constants,
 * and rate limiter test-mode/reset utilities so integration tests can
 * compose different middleware chains without duplicating setup code.
 *
 * Each factory mirrors a specific production middleware ordering so
 * tests can verify correct interaction between the rate limiter and
 * its neighbours.
 */

import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import {
  getRateLimiterTestMode,
  rateLimiter,
  resetRateLimiter,
  setRateLimiterTestMode,
} from "../middleware/rate-limiter.js";
import { requestId } from "../middleware/request-id.js";
import { securityHeaders } from "../middleware/security-headers.js";
import { securityLogging } from "../middleware/security-logging.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shared Hono variables set by the mock auth middleware. */
export type AuthVars = {
  Variables: {
    userId?: string;
    userRole?: string;
    apiKeyId?: string;
  };
};

// ---------------------------------------------------------------------------
// IP constants
// ---------------------------------------------------------------------------

/** First test IP — used as the primary identity in most tests. */
export const IP_A = "10.0.0.1";

/** Second test IP — used to verify per-IP isolation. */
export const IP_B = "10.0.0.2";

// ---------------------------------------------------------------------------
// Mock middleware helpers
// ---------------------------------------------------------------------------

/**
 * Middleware that simulates optional auth parsing.
 *
 * Reads `Authorization: Bearer <apiKeyId>:<userId>` and sets the
 * corresponding variables on the Hono context.
 */
export function mockOptionalAuth(): MiddlewareHandler<AuthVars> {
  return async (c, next) => {
    const auth = c.req.header("Authorization");
    if (auth?.startsWith("Bearer ")) {
      const parts = auth.slice(7).split(":");
      if (parts.length === 2) {
        c.set("apiKeyId", parts[0]);
        c.set("userId", parts[1]);
        c.set("userRole", "user");
      }
    }
    await next();
  };
}

/**
 * Middleware that blocks POST/PUT/DELETE/PATCH without X-CSRF-Token.
 *
 * Lightweight stand-in for the real CSRF protection — enough to verify
 * that CSRF-blocked requests short-circuit before the rate limiter.
 */
export function mockCsrfProtection(): MiddlewareHandler {
  return async (c, next) => {
    const method = c.req.method;
    if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
      const token = c.req.header("X-CSRF-Token");
      if (!token) {
        return c.json({ error: "CSRF token missing" }, 403);
      }
    }
    await next();
  };
}

/**
 * Middleware that records the request's status code after downstream
 * handlers run.  Returns a spy (`vi.fn`) via the returned `onComplete`
 * callback so tests can assert on observed status codes.
 */
export function createStatusRecorder(): {
  middleware: MiddlewareHandler;
  getStatuses: () => number[];
  clear: () => void;
} {
  const statuses: number[] = [];

  const middleware: MiddlewareHandler = async (c, next) => {
    await next();
    statuses.push(c.res.status);
  };

  return {
    middleware,
    getStatuses: () => [...statuses],
    clear: () => statuses.length = 0,
  };
}

// ---------------------------------------------------------------------------
// App factories
// ---------------------------------------------------------------------------

/**
 * Standard middleware chain: requestId → rateLimiter → securityHeaders → securityLogging.
 *
 * This is the baseline chain used by most integration tests.
 */
export function createStandardChainApp(): Hono<AuthVars> {
  const app = new Hono<AuthVars>();

  app.use("/api/*", requestId);
  app.use("/api/*", rateLimiter());
  app.use("/api/*", securityHeaders());
  app.use("/api/*", securityLogging());

  app.get("/api/test", (c) => c.json({ message: "ok" }));
  app.post("/api/action", (c) => c.json({ action: "done" }));

  return app;
}

/**
 * Reversed order: rateLimiter BEFORE requestId.
 *
 * Useful for verifying that request IDs are only set when the
 * requestId middleware runs before the rate limiter.
 */
export function createReversedOrderApp(): Hono<AuthVars> {
  const app = new Hono<AuthVars>();

  app.use("/api/*", rateLimiter());
  app.use("/api/*", requestId);
  app.use("/api/*", securityHeaders());

  app.get("/api/test", (c) => c.json({ message: "ok" }));

  return app;
}

/**
 * Auth before rate limiter: requestId → securityHeaders → optionalAuth → rateLimiter.
 *
 * Tests that the rate limiter still applies after auth context is set.
 */
export function createAuthBeforeRateLimitApp(): Hono<AuthVars> {
  const app = new Hono<AuthVars>();

  app.use("/api/*", requestId);
  app.use("/api/*", securityHeaders());
  app.use("/api/*", mockOptionalAuth());
  app.use("/api/*", rateLimiter());

  app.get("/api/test", (c) => c.json({ message: "ok" }));
  app.post("/api/action", (c) => c.json({ action: "done" }));

  return app;
}

/**
 * Full auth + CSRF + rate limiter chain (production-like order).
 *
 * requestId → securityHeaders → optionalAuth → csrfProtection → rateLimiter.
 *
 * Verifies that CSRF-blocked requests do NOT consume rate limit tokens
 * (they short-circuit before reaching the rate limiter).
 */
export function createAuthCsrfChainApp(): Hono<AuthVars> {
  const app = new Hono<AuthVars>();

  app.use("/api/*", requestId);
  app.use("/api/*", securityHeaders());
  app.use("/api/*", mockOptionalAuth());
  app.use("/api/*", mockCsrfProtection());
  app.use("/api/*", rateLimiter());

  app.get("/api/test", (c) =>
    c.json({ message: "ok", userId: c.get("userId") ?? null })
  );
  app.post("/api/action", (c) =>
    c.json({ action: "done", userId: c.get("userId") ?? null })
  );
  app.get("/api/profile", (c) => {
    const userId = c.get("userId");
    if (!userId) return c.json({ error: "unauthorized" }, 401);
    return c.json({ userId, role: c.get("userRole") });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Test-mode / reset utilities
// ---------------------------------------------------------------------------

/**
 * Activate rate limiting for a test and clear all buckets.
 *
 * Call in `beforeEach` to start each test from a clean slate with
 * rate limiting enabled.
 */
export function enableRateLimiting(): void {
  setRateLimiterTestMode(false);
  resetRateLimiter();
}

/**
 * Disable rate limiting (bypass) and clear all buckets.
 *
 * Call in `afterEach` so rate limiting doesn't leak into unrelated
 * tests that don't expect it.
 */
export function disableRateLimiting(): void {
  setRateLimiterTestMode(true);
  resetRateLimiter();
}

/**
 * Convenience: run `fn` with rate limiting enabled, then disabled.
 *
 * Resets before and after.  Useful for one-off test helpers outside
 * of `describe`/`beforeEach` blocks.
 */
export async function withRateLimiting<T>(fn: () => Promise<T>): Promise<T> {
  enableRateLimiting();
  try {
    return await fn();
  } finally {
    disableRateLimiting();
  }
}

// Re-export the low-level primitives for callers that need finer control.
export { getRateLimiterTestMode, rateLimiter, resetRateLimiter, setRateLimiterTestMode };
