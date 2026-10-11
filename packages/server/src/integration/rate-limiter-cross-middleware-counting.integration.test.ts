/**
 * Rate limiter cross-middleware counting integration tests (mtamyway-1efee286).
 *
 * Drives the real `createApp()` middleware chain — requestId, security
 * headers/logging, input guards, optional auth, session security, CSRF,
 * apiKeyAuth + authorization guards, then the shared rate limiter — and
 * proves the limiter's counting semantics survive contact with the full
 * chain, where the sibling unit-level suites use synthetic chains.
 *
 * Pins, per the current implementation:
 * - Exactly one token is consumed per request, not one per middleware hop,
 *   even though the limiter is registered alongside ~15 other middleware
 *   and instantiated separately for `/api/*` and `/auth/*`.
 * - Requests rejected upstream of the limiter (401 authentication failure,
 *   403 authorization failure, CSRF validation failure) consume no tokens:
 *   the rejection carries no X-RateLimit headers and the next allowed
 *   request on the same IP still sees a full counter.
 * - The boundary: N-1 requests pass, the Nth is rejected with the
 *   429 + Retry-After + X-RateLimit-* shape, and middleware upstream of the
 *   limiter still stamped the rejection.
 *
 * Domain data comes from the shared seed helpers and response assertions
 * from the shared middleware helpers (`@mta-my-way/shared/testing/*`).
 * `config-helpers` from the same tree is not importable here yet: it has no
 * package.json export and is untracked WIP in another worker's tree, so a
 * committed import would fail a clean-checkout run.
 *
 * Time is frozen for the whole suite so the 1 token/second refill can never
 * shift a counter between requests; the boundary test is exact as a result.
 */

import {
  SECURITY_HEADER_NAMES,
  assertHeader,
  assertNoHeader,
  assertSecurityHeaders,
} from "@mta-my-way/shared/testing/middleware";
import { seedRoutes, seedStations } from "@mta-my-way/shared/testing/seed-helpers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { initDelayPredictor } from "../delay-predictor.js";
import { resetRateLimiter, setRateLimiterTestMode } from "../middleware/rate-limiter.js";
import {
  cleanupAllState,
  createTestReadCredentials,
  createTestUserCredentials,
  getCsrfToken,
} from "./test-helpers.js";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/** Distinct CF-Connecting-IP per test so buckets never share state. */
const IP_COUNTING = "192.0.2.1";
const IP_PROTECTED = "192.0.2.2";
const IP_UNAUTHENTICATED = "192.0.2.3";
const IP_FORBIDDEN = "192.0.2.4";
const IP_NO_CSRF = "192.0.2.5";
const IP_INTERLEAVED = "192.0.2.6";
const IP_BOUNDARY = "192.0.2.7";
const IP_NEIGHBOUR = "192.0.2.9";

/** Frozen wall clock: no refill second can pass mid-sequence. */
const FROZEN_NOW_MS = 1_700_000_000_000;

/** Security headers the real chain emits outside HTTPS-only HSTS. */
const EXPECTED_SECURITY_HEADERS = SECURITY_HEADER_NAMES.filter(
  (name) => name !== "Strict-Transport-Security"
);

/** Identity headers the limiter's client-IP resolution keys on. */
function withIp(ip: string): Record<string, string> {
  return { "CF-Connecting-IP": ip };
}

/**
 * POST headers for the protected commute route. The CSRF token header is
 * omitted entirely when no token is given, to exercise the missing-token
 * rejection rather than an invalid-token one.
 */
function postHeaders(
  ip: string,
  authorization?: string,
  csrfToken?: string
): Record<string, string> {
  return {
    "CF-Connecting-IP": ip,
    "Content-Type": "application/json",
    ...(authorization === undefined ? {} : { Authorization: authorization }),
    ...(csrfToken === undefined ? {} : { "X-CSRF-Token": csrfToken }),
  };
}

const ANALYZE_BODY = JSON.stringify({ originId: "101", destinationId: "103" });

/** Build the real app over seeded domain data, mirroring the ordering suite. */
function createSeededApp(): ReturnType<typeof createApp> {
  const stations = Object.fromEntries(
    seedStations({ count: 3 }).map((station) => [station.id, station])
  );
  const routes = Object.fromEntries(
    seedRoutes({ count: 1, stops: ["101", "102", "103"] }).map((route) => [route.id, route])
  );
  initDelayPredictor({}, stations);
  return createApp(stations, routes, {}, {}, "/tmp/test-web");
}

/** Read the bucket counter a response reported, as a number. */
function remainingOf(response: Response): number {
  const raw = response.headers.get("x-ratelimit-remaining");
  expect(raw).not.toBeNull();
  return Number(raw);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("rate limiter cross-middleware counting through the real chain", () => {
  beforeEach(async () => {
    await cleanupAllState();
    setRateLimiterTestMode(false);
    resetRateLimiter();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FROZEN_NOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
    // Leave the limiter bypassed so the buckets this suite burns cannot
    // leak into another suite sharing the module under a merged run.
    setRateLimiterTestMode(true);
    resetRateLimiter();
  });

  describe("once per request, not once per middleware hop", () => {
    it("consumes exactly one token per allowed request while every chain layer runs", async () => {
      const app = createSeededApp();

      for (let i = 0; i < 8; i++) {
        const res = await app.request("/api/stations", { headers: withIp(IP_COUNTING) });

        expect(res.status).toBe(200);
        // The seeded domain data actually flowed through the chain.
        expect(await res.json()).toHaveLength(3);
        // One decrement per request — an extra limiter invocation anywhere
        // in the ~15-middleware chain would double this.
        expect(remainingOf(res)).toBe(59 - i);
        // The rest of the chain still ran around the limiter.
        assertSecurityHeaders(res, EXPECTED_SECURITY_HEADERS);
        assertHeader(res, "x-request-id");
      }
    });

    it("consumes one token for an authorized protected POST through auth, authorization and audit", async () => {
      const app = createSeededApp();
      const credentials = await createTestUserCredentials();
      const csrfToken = await getCsrfToken(app);

      const res = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: postHeaders(IP_PROTECTED, credentials.authorizationHeader, csrfToken),
        body: ANALYZE_BODY,
      });

      expect(res.status).toBe(200);
      expect(remainingOf(res)).toBe(59);
      assertSecurityHeaders(res, EXPECTED_SECURITY_HEADERS);
      assertHeader(res, "x-request-id");
    });
  });

  describe("rejected requests upstream of the limiter consume no tokens", () => {
    it("leaves the counter untouched after a 401 authentication failure", async () => {
      const app = createSeededApp();
      const csrfToken = await getCsrfToken(app);

      const rejected = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: postHeaders(
          IP_UNAUTHENTICATED,
          "Bearer test_key_missing:invalid-secret",
          csrfToken
        ),
        body: ANALYZE_BODY,
      });

      expect(rejected.status).toBe(401);
      // The limiter sits downstream of authentication, so it never stamped
      // the rejection.
      assertNoHeader(rejected, "x-ratelimit-remaining");

      const next = await app.request("/api/stations", { headers: withIp(IP_UNAUTHENTICATED) });
      expect(next.status).toBe(200);
      expect(remainingOf(next)).toBe(59);
    });

    it("leaves the counter untouched after a 403 authorization failure", async () => {
      const app = createSeededApp();
      const readCredentials = await createTestReadCredentials();
      const csrfToken = await getCsrfToken(app);

      const rejected = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: postHeaders(IP_FORBIDDEN, readCredentials.authorizationHeader, csrfToken),
        body: ANALYZE_BODY,
      });

      expect(rejected.status).toBe(403);
      assertNoHeader(rejected, "x-ratelimit-remaining");

      const next = await app.request("/api/stations", { headers: withIp(IP_FORBIDDEN) });
      expect(next.status).toBe(200);
      expect(remainingOf(next)).toBe(59);
    });

    it("leaves the counter untouched after a CSRF validation failure", async () => {
      const app = createSeededApp();

      // CSRF runs before both the API-key guard and the limiter, so no
      // credentials are needed to reach the rejection.
      const rejected = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: postHeaders(IP_NO_CSRF),
        body: ANALYZE_BODY,
      });

      expect(rejected.status).toBe(403);
      assertNoHeader(rejected, "x-ratelimit-remaining");

      const next = await app.request("/api/stations", { headers: withIp(IP_NO_CSRF) });
      expect(next.status).toBe(200);
      expect(remainingOf(next)).toBe(59);
    });

    it("keeps the counter exact across interleaved allowed and rejected requests", async () => {
      const app = createSeededApp();
      const readCredentials = await createTestReadCredentials();
      const csrfToken = await getCsrfToken(app);

      const first = await app.request("/api/stations", { headers: withIp(IP_INTERLEAVED) });
      expect(first.status).toBe(200);
      expect(remainingOf(first)).toBe(59);

      const unauthenticated = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: postHeaders(IP_INTERLEAVED, "Bearer test_key_missing:invalid-secret", csrfToken),
        body: ANALYZE_BODY,
      });
      expect(unauthenticated.status).toBe(401);

      const forbidden = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: postHeaders(IP_INTERLEAVED, readCredentials.authorizationHeader, csrfToken),
        body: ANALYZE_BODY,
      });
      expect(forbidden.status).toBe(403);

      const csrfRejected = await app.request("/api/commute/analyze", {
        method: "POST",
        headers: postHeaders(IP_INTERLEAVED),
        body: ANALYZE_BODY,
      });
      expect(csrfRejected.status).toBe(403);

      const second = await app.request("/api/stations", { headers: withIp(IP_INTERLEAVED) });
      expect(second.status).toBe(200);
      // Three rejections consumed nothing; two allowed requests, one each.
      expect(remainingOf(second)).toBe(58);
    });
  });

  describe("boundary at the limit", () => {
    it("passes N-1 requests and rejects the Nth with the 429 + Retry-After shape", async () => {
      const app = createSeededApp();

      // The full allotment: 60 requests pass, counters stepping 59 → 0.
      for (let i = 0; i < 60; i++) {
        const res = await app.request("/api/stations", { headers: withIp(IP_BOUNDARY) });
        expect(res.status).toBe(200);
        expect(remainingOf(res)).toBe(59 - i);
        expect(res.headers.get("retry-after")).toBeNull();
      }

      const exhausted = await app.request("/api/stations", { headers: withIp(IP_BOUNDARY) });

      expect(exhausted.status).toBe(429);
      assertHeader(exhausted, "retry-after", "1");
      assertHeader(exhausted, "x-ratelimit-limit", "60");
      assertHeader(exhausted, "x-ratelimit-remaining", "0");
      assertHeader(
        exhausted,
        "x-ratelimit-reset",
        String(Math.ceil((FROZEN_NOW_MS + 1000) / 1000))
      );
      expect(await exhausted.json()).toEqual({ error: "Too many requests", retryAfter: 1 });
      // Middleware upstream of the limiter still stamped the rejection;
      // downstream response limiting and compression never ran.
      assertSecurityHeaders(exhausted, EXPECTED_SECURITY_HEADERS);
      assertHeader(exhausted, "x-request-id");

      // The bucket, not the route, is exhausted: a neighbouring IP is
      // unaffected.
      const neighbour = await app.request("/api/stations", { headers: withIp(IP_NEIGHBOUR) });
      expect(neighbour.status).toBe(200);
      expect(remainingOf(neighbour)).toBe(59);
    });
  });
});
