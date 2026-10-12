/**
 * Deterministic reproduction of the GTFS feed HTTP 403.
 *
 * Parent pulse finding: mtamyway-ff2cff3c ("Feed fetch failed" /
 * "HTTP 403 Forbidden" at poller.ts, feed "gtfs"). This suite pins the
 * poller's wire contract and the 403 error path so later work does not
 * depend on the live MTA service.
 *
 * Request path under test:
 *   startPoller() → runPoll()
 *     → Promise.allSettled(SUBWAY_FEEDS.map(fetchFeed))
 *     → fetchFeed(config) → retry(() => tracedFetch(config.url, {...}))
 *     → !response.ok → throw Error("HTTP <status> <statusText>") with .status
 *     → catch → recordFeedFailure + recordFeedError + logger.error("Feed fetch failed")
 *
 * The wire contract (no credential values exist in it — the MTA has required
 * no API key since 2025, so the request carries no auth material at all):
 *   - URL:  https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2F<feed>
 *   - Method: GET
 *   - Headers: exactly { Accept: "application/x-protobuf" } — no
 *     Authorization / x-api-key / token / cookie of any kind.
 *
 * FIXED DEFECT, pinned here as a regression (live-verified 2026-09-17, fixed
 * under mtamyway-40979fb6): SUBWAY_FEEDS used to build each URL as
 * `${MTA_FEED_BASE_URL}/${feed.id}` while MTA_FEED_BASE_URL already ends in
 * the encoded segment `nyct%2F`. The wire URL therefore carried a literal `/`
 * after the `%2F` (`nyct%2F/gtfs`), and the live endpoint answered 403
 * Forbidden to that shape while returning 200 to the same path with the
 * literal slash removed (`nyct%2Fgtfs`). The URLs in
 * packages/shared/src/constants/feeds.ts now concatenate the feed id directly
 * onto the base; the "wire URL" assertions below pin that corrected shape so
 * the extra slash cannot come back.
 *
 * Offline: the MTA endpoint is never contacted — every response is mocked at
 * the tracedFetch seam. No real tokens, keys, or secrets appear anywhere.
 *
 * Explicit 403 handling (mtamyway-d4811957): a 403 is classified "forbidden"
 * (not the generic "http_error"), never retried, and reported through the
 * poller's normal failure path. The failure diagnostics carry feed identity,
 * the HTTP status, safe timing, and the error message — and nothing
 * credential-shaped: no request headers, no tokens, no response-body data
 * (the forbidden response's body is never even read). The assertions below
 * pin all of that.
 */

import { MTA_ALERTS_FEED_URL, MTA_FEED_BASE_URL, SUBWAY_FEEDS } from "@mta-my-way/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as cache from "./cache.js";
import * as delayDetector from "./delay-detector.js";
import * as metrics from "./middleware/metrics.js";
import * as loggerModule from "./observability/logger.js";
import * as tracing from "./observability/tracing.js";
import * as parser from "./parser.js";
import { initPoller, startPoller, stopPoller } from "./poller.js";
import * as transformer from "./transformer.js";

vi.mock("./cache.js");
vi.mock("./delay-detector.js");
vi.mock("./parser.js");
vi.mock("./transformer.js");
vi.mock("./middleware/metrics.js", () => ({
  recordFeedPollDuration: vi.fn(),
  recordFeedError: vi.fn(),
  recordFeedEntitiesProcessed: vi.fn(),
  recordCacheHitMetric: vi.fn(),
  recordCacheMissMetric: vi.fn(),
}));

vi.mock("./observability/logger.js", () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  LogLevel: { DEBUG: "debug", INFO: "info", WARN: "warn", ERROR: "error" },
  createLogger: vi.fn(),
}));

// tracedFetch is the fetch seam under test: it is left as a bare vi.fn() so
// each test installs the exact response the live service is being modeled as
// returning. withChildSpan just runs its callback, like the real span wrapper
// does for the assertions here.
vi.mock("./observability/tracing.js", () => ({
  setSpanAttribute: vi.fn(),
  tracedFetch: vi.fn(),
  withChildSpan: vi.fn((_name: string, fn: () => Promise<unknown> | unknown) => fn()),
  createTracer: vi.fn(),
  shutdownTracer: vi.fn(),
}));

const mockLogger = vi.mocked(loggerModule.logger);
const mockTracedFetch = vi.mocked(tracing.tracedFetch);

/** A 200 the way fetchFeed consumes it: ok, body readable as bytes. */
const okResponse = (): Response =>
  ({
    ok: true,
    status: 200,
    statusText: "OK",
    arrayBuffer: async () => new ArrayBuffer(0),
  }) as unknown as Response;

/** The live service's rejection for the current wire URL shape. */
const forbiddenResponse = (): Response & { arrayBuffer: ReturnType<typeof vi.fn> } =>
  ({
    ok: false,
    status: 403,
    statusText: "Forbidden",
    // Spied so the failure-path tests can prove the rejected body is never
    // read (a real 403 body is the service's error payload and must not be
    // parsed, logged, or otherwise pulled into diagnostics).
    arrayBuffer: vi.fn(),
  }) as unknown as Response & { arrayBuffer: ReturnType<typeof vi.fn> };

describe("GTFS feed 403 reproduction", () => {
  // Minimal station/route index — initPoller requires them before startPoller.
  const stations = {
    "101": {
      id: "101",
      name: "South Ferry",
      lat: 40.702,
      lon: -74.013,
      lines: ["1"],
      northStopId: "101N",
      southStopId: "101S",
      transfers: [],
      ada: true,
      borough: "manhattan",
    },
  };
  const routes = {
    "1": {
      id: "1",
      shortName: "1",
      longName: "Broadway-7th Ave Local",
      color: "#EE352E",
      textColor: "#FFFFFF",
      feedId: "gtfs",
      division: "A",
      stops: ["101"],
      isExpress: false,
    },
  };

  beforeEach(() => {
    // The global setup file restores all mocks in afterEach, so every mock
    // this suite depends on is configured fresh here.
    mockTracedFetch.mockResolvedValue(okResponse());
    vi.mocked(cache.isCircuitOpen).mockReturnValue(false);
    vi.mocked(cache.getAllParsedFeeds).mockReturnValue(new Map());
    vi.mocked(cache.getAllFeedAges).mockReturnValue(new Map());
    vi.mocked(cache.updateArrivals).mockImplementation(() => {});
    vi.mocked(cache.updatePositions).mockImplementation(() => {});
    vi.mocked(delayDetector.extractVehiclePositions).mockReturnValue([]);
    vi.mocked(delayDetector.processVehicleUpdates).mockImplementation(() => {});
    vi.mocked(transformer.transformFeeds).mockReturnValue(new Map());
    vi.mocked(parser.parseFeed).mockReturnValue({
      message: {},
      entityCount: 0,
      headerTimestamp: Date.now(),
    });

    initPoller(stations, routes);
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopPoller();
    vi.useRealTimers();
  });

  describe("wire contract", () => {
    it("fetches every configured subway feed with the documented request shape", async () => {
      startPoller();
      // The first poll is a direct void runPoll(), not a timer: advancing by
      // 0ms just drains its promise chain. runOnlyPendingTimersAsync would
      // also fire the 30s interval's first tick and double every fetch.
      await vi.advanceTimersByTimeAsync(0);
      stopPoller();

      expect(mockTracedFetch).toHaveBeenCalledTimes(SUBWAY_FEEDS.length);

      // URLs must be exactly the ones SUBWAY_FEEDS derives from the MTA base
      // URL — one request per feed, none skipped, none extra — and each must
      // carry the corrected encoded path (`nyct%2Fgtfs`, not `nyct%2F/gtfs`).
      const sentUrls = mockTracedFetch.mock.calls.map(([url]) => String(url)).sort();
      const expectedUrls = SUBWAY_FEEDS.map((feed) => `${MTA_FEED_BASE_URL}${feed.id}`).sort();
      expect(sentUrls).toEqual(expectedUrls);
      expect(sentUrls).toEqual(SUBWAY_FEEDS.map((feed) => feed.url).sort());
      for (const url of sentUrls) {
        expect(url).not.toContain("%2F/");
      }

      for (const [, options] of mockTracedFetch.mock.calls) {
        expect(options?.method).toBe("GET");
        // The full auth contract in one assertion: the request carries the
        // protobuf Accept header and nothing else. The MTA requires no API
        // key since 2025, so any credential-bearing header here would be a
        // regression (and a secret-handling risk), not a requirement.
        expect(options?.headers).toEqual({ Accept: "application/x-protobuf" });
      }

      // The accepted (200) mocked response makes every feed succeed — the
      // corrected wire shape is one the feed service answers, so a full poll
      // records success for all eight feeds and no failure.
      const successfulFeeds = vi
        .mocked(cache.recordFeedSuccess)
        .mock.calls.map(([feedId]) => feedId)
        .sort();
      expect(successfulFeeds).toEqual(SUBWAY_FEEDS.map((feed) => feed.id).sort());
      expect(cache.recordFeedFailure).not.toHaveBeenCalled();
    });

    it("pins the corrected wire URL the live endpoint answers 200", () => {
      // Live-verified 2026-09-17 (no credentials involved — none exist):
      //   nyct%2F/gtfs  → 403 Forbidden   (former shape, %2F plus literal /)
      //   nyct%2Fgtfs   → 200 OK          (encoded segment only — current)
      // The base URL already ends in the encoded `nyct%2F`, so the feed id
      // must be concatenated with no intervening `/`; a literal slash in the
      // path segment is exactly the 403 defect this suite guards against.
      for (const feed of SUBWAY_FEEDS) {
        expect(feed.url).toBe(`${MTA_FEED_BASE_URL}${feed.id}`);
        expect(feed.url).not.toContain("%2F/");
      }

      // The sibling alerts feed is a full literal and correctly shaped — the
      // defect was confined to the SUBWAY_FEEDS template. (The ENE literal in
      // feeds.ts is too, but the shared barrel does not re-export it.)
      expect(MTA_ALERTS_FEED_URL).not.toContain("%2F/");
    });
  });

  describe("403 response path", () => {
    it("surfaces a 403 on one feed as the captured Feed-fetch-failed error and keeps the rest of the poll running", async () => {
      const forbidden = forbiddenResponse();
      mockTracedFetch.mockImplementation(async (url) => {
        // "gtfs" is the feed id the pulse finding captured (allSettled index 0).
        // The corrected wire URL ends in the encoded segment `nyct%2Fgtfs` —
        // %2Fgtfs matches only the A Division feed, not gtfs-ace/gtfs-l/etc.
        return String(url).endsWith("%2Fgtfs") ? forbidden : okResponse();
      });

      startPoller();
      // Drain the immediate poll's promise chain without firing the interval
      // (see the request-shape test above).
      await vi.advanceTimersByTimeAsync(0);
      stopPoller();

      // The exact log signature the pulse scanner captured, now carrying the
      // discrete HTTP status alongside feed identity and safe timing.
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Feed fetch failed",
        expect.any(Error),
        expect.objectContaining({
          feed: "gtfs",
          status: 403,
          latency_ms: expect.any(Number),
          error: "HTTP 403 Forbidden",
        })
      );

      // The diagnostic's context is exactly the safe set: feed identity,
      // status, timing, and the error message — nothing else rides along.
      const failureCall = mockLogger.error.mock.calls.find(
        ([message]) => message === "Feed fetch failed"
      );
      expect(failureCall).toBeDefined();
      const failureContext = failureCall![2] as Record<string, unknown>;
      expect(Object.keys(failureContext).sort()).toEqual(["error", "feed", "latency_ms", "status"]);

      // The error itself exposes only its message and status — no request
      // headers or response payload are attached to it.
      const errorArg = failureCall![1] as Error & { status?: number };
      expect(errorArg.message).toBe("HTTP 403 Forbidden");
      expect(errorArg.status).toBe(403);
      expect(errorArg).not.toHaveProperty("headers");
      expect(errorArg).not.toHaveProperty("body");

      // A rejected body is the service's error payload — never read, so it
      // can never reach diagnostics.
      expect(forbidden.arrayBuffer).not.toHaveBeenCalled();

      // Failure recorded in the feed cache with the thrown error message.
      expect(cache.recordFeedFailure).toHaveBeenCalledWith(
        "gtfs",
        "HTTP 403 Forbidden",
        expect.any(Number)
      );
      const successfulFeeds = vi
        .mocked(cache.recordFeedSuccess)
        .mock.calls.map(([feedId]) => feedId);
      expect(successfulFeeds).not.toContain("gtfs");
      expect(successfulFeeds).toHaveLength(SUBWAY_FEEDS.length - 1);

      // 403 is an explicit, expected feed rejection: classified "forbidden"
      // in the error metric and the tracing span — not the generic
      // http_error, not rate_limited, not server_error.
      expect(metrics.recordFeedError).toHaveBeenCalledWith("gtfs", "forbidden");
      expect(vi.mocked(tracing.setSpanAttribute)).toHaveBeenCalledWith(
        "feed.error_type",
        "forbidden"
      );

      // Promise.allSettled semantics: the forbidden feed must not take down
      // the cycle — the remaining feeds are still parsed, transformed and
      // cached, and the poll reports 7 ok / 1 failed.
      expect(cache.updateArrivals).toHaveBeenCalled();
      expect(cache.updatePositions).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Poll complete",
        expect.objectContaining({
          feeds_ok: SUBWAY_FEEDS.length - 1,
          feeds_failed: 1,
        })
      );
    });

    it("does not retry a 403 and survives every feed being forbidden", async () => {
      mockTracedFetch.mockResolvedValue(forbiddenResponse());

      startPoller();
      // Drain the immediate poll's promise chain without firing the interval
      // (see the request-shape test above).
      await vi.advanceTimersByTimeAsync(0);

      // One wire attempt per feed: 403 is non-retryable (the retry predicate
      // only retries network errors, timeouts, 429 and 5xx).
      expect(mockTracedFetch).toHaveBeenCalledTimes(SUBWAY_FEEDS.length);

      // Advance well past the full backoff ladder (500ms + 1s + 2s) but short
      // of the 30s poll interval, so only a retry — never the next poll —
      // could add calls. A 403 must not produce any.
      await vi.advanceTimersByTimeAsync(10_000);
      expect(mockTracedFetch).toHaveBeenCalledTimes(SUBWAY_FEEDS.length);
      stopPoller();

      // Every feed fails with the same message and the same classification;
      // the poll still completes (feeds_ok 0 / feeds_failed 8) instead of
      // hanging or throwing.
      const failures = vi.mocked(cache.recordFeedFailure).mock.calls;
      expect(failures.map(([feedId, error]) => [feedId, error]).sort()).toEqual(
        SUBWAY_FEEDS.map((feed) => [feed.id, "HTTP 403 Forbidden"]).sort()
      );
      const errorTypes = vi.mocked(metrics.recordFeedError).mock.calls.map(([, type]) => type);
      expect(errorTypes).toEqual(Array(SUBWAY_FEEDS.length).fill("forbidden"));
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Poll complete",
        expect.objectContaining({
          feeds_ok: 0,
          feeds_failed: SUBWAY_FEEDS.length,
        })
      );
    });

    it("emits no credential-shaped data in any diagnostic during a forbidden poll", async () => {
      const forbidden = forbiddenResponse();
      mockTracedFetch.mockResolvedValue(forbidden);

      startPoller();
      await vi.advanceTimersByTimeAsync(0);
      // Run past the backoff ladder so every diagnostic the failure path can
      // emit (including any retry warns) is covered by the scan below — a
      // 403 must produce none, but the scan must not assume that.
      await vi.advanceTimersByTimeAsync(10_000);
      stopPoller();

      // Mirror of the logger's own SENSITIVE_FIELDS list
      // (observability/logger.ts): no diagnostic argument may carry a
      // credential-shaped key at any nesting depth.
      const sensitiveKey =
        /^(password|passwd|token|secret|authorization|apikey|api_key|cookie|credential|private_key|privatekey|pepper|salt)$/i;

      const keys: string[] = [];
      const strings: string[] = [];
      const inspect = (value: unknown): void => {
        if (value === null || typeof value !== "object") {
          if (typeof value === "string") strings.push(value);
          return;
        }
        if (value instanceof Error) {
          // What the logger serializes from an error: name, message,
          // stack, code — inspect exactly those.
          strings.push(value.name, value.message, value.stack ?? "");
          return;
        }
        for (const [key, child] of Object.entries(value)) {
          keys.push(key);
          inspect(child);
        }
      };

      for (const mockFn of [mockLogger.error, mockLogger.warn, mockLogger.info, mockLogger.debug]) {
        for (const call of mockFn.mock.calls) {
          for (const arg of call) inspect(arg);
        }
      }

      for (const key of keys) {
        expect(key).not.toMatch(sensitiveKey);
      }
      // The request header object is the only credential-shaped structure on
      // this wire, and the rejected body is the service's error payload:
      // neither may surface in diagnostics.
      expect(keys).not.toContain("headers");
      expect(strings).not.toContain("application/x-protobuf");
      expect(forbidden.arrayBuffer).not.toHaveBeenCalled();
    });
  });
});
