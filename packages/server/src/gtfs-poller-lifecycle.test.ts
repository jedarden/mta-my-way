/**
 * Full GTFS poller lifecycle regression coverage.
 *
 * Bead mtamyway-362386af (split child of pulse finding mtamyway-ff2cff3c,
 * following the 403 hardening in mtamyway-d4811957). The sibling suite
 * gtfs-feed-403.test.ts pins the wire contract and the failure path; this
 * suite pins the lifecycle around it:
 *
 *   1. An authorized success — under the current contract the request is
 *      credential-free (the MTA has required no API key since 2025, so there
 *      is no key to configure), and a corrected-shape URL is what the service
 *      answers 200. The success body flows bytes → parseFeed → the real feed
 *      cache → rebuild (transformFeeds → updateArrivals/updatePositions),
 *      with success metrics, span attributes, and the completion log.
 *   2. A 403 rejection in a later poll rejects only that feed (one wire
 *      attempt, "forbidden" classification, redacted diagnostic, body
 *      unread) and preserves every other feed's concurrently-fetched result —
 *      and the forbidden feed's own last-good parse, which stays served
 *      rather than being evicted (cache.ts: "serve stale data rather than
 *      nothing").
 *   3. The success path emits no credential-shaped data in any diagnostic.
 *
 * Unlike the 403 suite, the cache module here is only partially mocked: the
 * parsed-feed store (recordFeedSuccess/recordFeedFailure/getAllParsedFeeds/
 * getAllFeedAges/isCircuitOpen and the test reset helper) is the REAL
 * in-memory implementation, so result preservation is proven against the
 * actual store rather than a mock of it. Only the rebuild write-out points
 * (updateArrivals/updatePositions) are stubs. Every HTTP response is mocked
 * at the tracedFetch seam; the MTA endpoint is never contacted, and no real
 * token, key, or secret appears anywhere in the fixtures.
 */

import { POLLING_INTERVALS, SUBWAY_FEEDS } from "@mta-my-way/shared";
import type { transit_realtime } from "@mta-my-way/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as cache from "./cache.js";
import * as delayDetector from "./delay-detector.js";
import * as metrics from "./middleware/metrics.js";
import * as loggerModule from "./observability/logger.js";
import * as tracing from "./observability/tracing.js";
import type { ParsedFeed } from "./parser.js";
import * as parser from "./parser.js";
import { initPoller, startPoller, stopPoller } from "./poller.js";
import * as transformer from "./transformer.js";

// Partial mock: real in-memory feed store, stubbed rebuild write-out.
vi.mock("./cache.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./cache.js")>();
  return {
    ...actual,
    updateArrivals: vi.fn(),
    updatePositions: vi.fn(),
  };
});
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

// tracedFetch is the fetch seam under test: left as a bare vi.fn() so each
// test installs the exact responses being modeled. withChildSpan just runs
// its callback, like the real span wrapper does for the assertions here.
vi.mock("./observability/tracing.js", () => ({
  setSpanAttribute: vi.fn(),
  tracedFetch: vi.fn(),
  withChildSpan: vi.fn((_name: string, fn: () => Promise<unknown> | unknown) => fn()),
  createTracer: vi.fn(),
  shutdownTracer: vi.fn(),
}));

const mockLogger = vi.mocked(loggerModule.logger);
const mockTracedFetch = vi.mocked(tracing.tracedFetch);

/** The poll cycle interval (30s) the second poll in the lifecycle test fires. */
const POLL_INTERVAL_MS = POLLING_INTERVALS.arrivals * 1000;

/** Distinct deterministic success body per feed. */
const payloadFor = (feedId: string): Uint8Array =>
  Uint8Array.from(Buffer.from(`protobuf-frame:${feedId}:${feedId.length}`));

/** Feed id from its wire URL (…/nyct%2F<id>). */
const feedIdFor = (url: string): string => url.slice(url.lastIndexOf("%2F") + 3);

/** A 200 the way fetchFeed consumes it: ok, body readable as the feed's bytes. */
const okResponseFor = (feedId: string): Response =>
  ({
    ok: true,
    status: 200,
    statusText: "OK",
    arrayBuffer: async () => payloadFor(feedId).slice().buffer as ArrayBuffer,
  }) as unknown as Response;

/** The live service's rejection for the current wire URL shape. */
const forbiddenResponse = (): Response & { arrayBuffer: ReturnType<typeof vi.fn> } =>
  ({
    ok: false,
    status: 403,
    statusText: "Forbidden",
    // Spied so the failure-path test can prove the rejected body is never
    // read (a real 403 body is the service's error payload and must never be
    // parsed, logged, or otherwise pulled into diagnostics).
    arrayBuffer: vi.fn(),
  }) as unknown as Response & { arrayBuffer: ReturnType<typeof vi.fn> };

describe("GTFS poller lifecycle", () => {
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

  // Every parseFeed call's returned object, per feed, in call order. With the
  // fake clock this is also the poll discriminator: poll 1 parses run at the
  // base time, poll 2's run 30s later, so parse[0] and parse[1] per feed are
  // distinct objects from distinct polls.
  let parseCallsByFeed: Map<string, ParsedFeed[]>;

  beforeEach(() => {
    parseCallsByFeed = new Map();
    // The global setup file restores all mocks in afterEach, so every mock
    // this suite depends on is configured fresh here.
    vi.mocked(cache.updateArrivals).mockImplementation(() => {});
    vi.mocked(cache.updatePositions).mockImplementation(() => {});
    vi.mocked(delayDetector.extractVehiclePositions).mockReturnValue([]);
    vi.mocked(delayDetector.processVehicleUpdates).mockImplementation(() => {});
    vi.mocked(transformer.transformFeeds).mockReturnValue(new Map());
    vi.mocked(parser.parseFeed).mockImplementation(
      (feedId: string, data: Uint8Array): ParsedFeed => {
        const parsed: ParsedFeed = {
          feedId,
          message: {} as unknown as transit_realtime.FeedMessage,
          feedTimestamp: Math.floor(Date.now() / 1000),
          entityCount: data.byteLength,
          tripReplacementPeriod: null,
          tripReplacementPeriods: [],
        };
        const calls = parseCallsByFeed.get(feedId) ?? [];
        calls.push(parsed);
        parseCallsByFeed.set(feedId, calls);
        return parsed;
      }
    );
    mockTracedFetch.mockImplementation(
      async (url) => okResponseFor(feedIdFor(String(url))) // default: all feeds answer 200
    );

    // Real store: start every test from pristine feed state.
    cache.resetAllCacheStateForTesting();
    initPoller(stations, routes);
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopPoller();
    vi.useRealTimers();
  });

  /** Drain the immediate poll's promise chain without firing the 30s interval. */
  const runFirstPoll = async (): Promise<void> => {
    // The first poll is a direct void runPoll(), not a timer: advancing by
    // 0ms just drains its promise chain (recipe proven in
    // gtfs-feed-403.test.ts — runOnlyPendingTimersAsync would also fire the
    // interval's first tick and double every fetch).
    await vi.advanceTimersByTimeAsync(0);
  };

  describe("authorized success", () => {
    it("runs the full success lifecycle: fetch → parse → real feed cache → rebuild, with metrics, spans, and the completion log", async () => {
      startPoller();
      await runFirstPoll();
      stopPoller();

      // Exactly one wire request per configured feed, at the configured URLs.
      expect(mockTracedFetch).toHaveBeenCalledTimes(SUBWAY_FEEDS.length);
      const sentUrls = mockTracedFetch.mock.calls.map(([url]) => String(url)).sort();
      expect(sentUrls).toEqual(SUBWAY_FEEDS.map((feed) => feed.url).sort());

      // Each feed's success body reached the parser byte-for-byte, once.
      expect(parser.parseFeed).toHaveBeenCalledTimes(SUBWAY_FEEDS.length);
      for (const feed of SUBWAY_FEEDS) {
        const parseCalls = vi.mocked(parser.parseFeed).mock.calls.filter(([id]) => id === feed.id);
        expect(parseCalls).toHaveLength(1);
        const [, data] = parseCalls[0]!;
        expect(Buffer.from(data).equals(Buffer.from(payloadFor(feed.id)))).toBe(true);
      }

      // The real in-memory store holds every feed's parsed result…
      const store = cache.getAllParsedFeeds();
      expect(store.size).toBe(SUBWAY_FEEDS.length);
      // …exactly the object parseFeed returned for that feed, proving the
      // recordFeedSuccess path stored the live parse (not a copy or a stub).
      for (const feed of SUBWAY_FEEDS) {
        const [parsed] = parseCallsByFeed.get(feed.id)!;
        expect(store.get(feed.id)).toBe(parsed);
      }

      // The poll rebuild read the real store and handed it to the transformer,
      // whose result is what reached the arrivals cache.
      expect(transformer.transformFeeds).toHaveBeenCalledTimes(1);
      const rebuilt = vi.mocked(transformer.transformFeeds).mock.calls[0]![0] as Map<
        string,
        ParsedFeed
      >;
      expect(rebuilt.size).toBe(SUBWAY_FEEDS.length);
      for (const feed of SUBWAY_FEEDS) {
        expect(rebuilt.get(feed.id)).toBe(store.get(feed.id));
      }
      const arrivals = vi.mocked(transformer.transformFeeds).mock.results[0]!.value;
      expect(cache.updateArrivals).toHaveBeenCalledTimes(1);
      expect(vi.mocked(cache.updateArrivals).mock.calls[0]![0]).toBe(arrivals);
      expect(cache.updatePositions).toHaveBeenCalledTimes(1);

      // Success metrics: poll duration and entity count per feed.
      expect(metrics.recordFeedPollDuration).toHaveBeenCalledTimes(SUBWAY_FEEDS.length);
      for (const [, feedId] of vi.mocked(metrics.recordFeedPollDuration).mock.calls) {
        expect(SUBWAY_FEEDS.some((feed) => feed.id === feedId)).toBe(true);
      }
      for (const feed of SUBWAY_FEEDS) {
        expect(metrics.recordFeedEntitiesProcessed).toHaveBeenCalledWith(
          feed.id,
          payloadFor(feed.id).byteLength
        );
      }

      // Success span attributes; no error attribute anywhere.
      const statusAttrs = vi
        .mocked(tracing.setSpanAttribute)
        .mock.calls.filter(([key]) => key === "feed.status");
      expect(statusAttrs).toHaveLength(SUBWAY_FEEDS.length);
      for (const [, value] of statusAttrs) {
        expect(value).toBe("success");
      }
      const entityAttrs = vi
        .mocked(tracing.setSpanAttribute)
        .mock.calls.filter(([key]) => key === "feed.entity_count");
      expect(entityAttrs).toHaveLength(SUBWAY_FEEDS.length);
      expect(
        vi.mocked(tracing.setSpanAttribute).mock.calls.some(([key]) => key === "feed.error_type")
      ).toBe(false);

      // Per-feed success debug log and the cycle completion log.
      const successDebugs = mockLogger.debug.mock.calls.filter(
        ([message]) => message === "Feed fetched successfully"
      );
      expect(successDebugs).toHaveLength(SUBWAY_FEEDS.length);
      for (const feed of SUBWAY_FEEDS) {
        expect(mockLogger.debug).toHaveBeenCalledWith(
          "Feed fetched successfully",
          expect.objectContaining({ feed: feed.id, latency_ms: expect.any(Number) })
        );
      }
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Poll complete",
        expect.objectContaining({
          feeds_ok: SUBWAY_FEEDS.length,
          feeds_failed: 0,
        })
      );
      expect(mockLogger.error).not.toHaveBeenCalled();
    });
  });

  describe("403 rejection in a later poll", () => {
    it("rejects only the forbidden feed and preserves every other feed's result — including the forbidden feed's last-good parse", async () => {
      // Poll 1: every feed answers 200; the store fills with poll-1 parses.
      startPoller();
      await runFirstPoll();
      const poll1Parses = new Map(
        SUBWAY_FEEDS.map((feed) => [feed.id, parseCallsByFeed.get(feed.id)![0]!])
      );
      expect(cache.getAllParsedFeeds().size).toBe(SUBWAY_FEEDS.length);

      // Poll 2 (fired by the 30s interval, the real cadence): the "gtfs" feed
      // — the feed id the pulse finding captured — is forbidden; every other
      // feed answers 200 again.
      const forbidden = forbiddenResponse();
      mockTracedFetch.mockImplementation(async (url) =>
        String(url).endsWith("%2Fgtfs") ? forbidden : okResponseFor(feedIdFor(String(url)))
      );
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
      stopPoller();

      // One wire attempt per feed per poll: the 403 was not retried (only
      // network errors, timeouts, 429 and 5xx retry).
      expect(mockTracedFetch).toHaveBeenCalledTimes(SUBWAY_FEEDS.length * 2);
      const gtfsCalls = mockTracedFetch.mock.calls.filter((([url]) =>
        String(url).endsWith("%2Fgtfs")) as (call: unknown[]) => boolean);
      expect(gtfsCalls).toHaveLength(2);

      // The rejection is classified "forbidden" and reported through the
      // normal failure path with exactly the redacted diagnostic shape.
      expect(metrics.recordFeedError).toHaveBeenCalledWith("gtfs", "forbidden");
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
      const failureCall = mockLogger.error.mock.calls.find(
        ([message]) => message === "Feed fetch failed"
      );
      const failureContext = failureCall![2] as Record<string, unknown>;
      expect(Object.keys(failureContext).sort()).toEqual(["error", "feed", "latency_ms", "status"]);
      // The rejected body is the service's error payload — never read.
      expect(forbidden.arrayBuffer).not.toHaveBeenCalled();

      // Only the forbidden feed's poll failed: it was parsed once (poll 1),
      // every other feed was parsed again from its fresh concurrent 200.
      expect(parseCallsByFeed.get("gtfs")).toHaveLength(1);
      for (const feed of SUBWAY_FEEDS.filter((f) => f.id !== "gtfs")) {
        expect(parseCallsByFeed.get(feed.id)).toHaveLength(2);
      }

      // Preservation, against the real store: it still holds ALL eight feeds.
      // The seven that answered 200 in poll 2 carry their fresh parses; the
      // forbidden one keeps its poll-1 parse — a failed poll never evicts the
      // last-good result (serve stale rather than nothing).
      const store = cache.getAllParsedFeeds();
      expect(store.size).toBe(SUBWAY_FEEDS.length);
      expect(store.get("gtfs")).toBe(poll1Parses.get("gtfs"));
      for (const feed of SUBWAY_FEEDS) {
        const parses = parseCallsByFeed.get(feed.id)!;
        expect(store.get(feed.id)).toBe(parses[parses.length - 1]);
      }

      // One failure did not trip the circuit breaker (opens after 3
      // consecutive failures), so the next cycle will retry the feed.
      expect(cache.isCircuitOpen("gtfs")).toBe(false);

      // The rebuild handed the transformer the full preserved set, and its
      // result reached the arrivals cache.
      const rebuildCalls = vi.mocked(transformer.transformFeeds).mock.calls;
      expect(rebuildCalls).toHaveLength(2);
      const rebuilt2 = rebuildCalls[1]![0] as Map<string, ParsedFeed>;
      expect(rebuilt2.size).toBe(SUBWAY_FEEDS.length);
      for (const feed of SUBWAY_FEEDS) {
        expect(rebuilt2.get(feed.id)).toBe(store.get(feed.id));
      }
      expect(vi.mocked(cache.updateArrivals).mock.calls[1]![0]).toBe(
        vi.mocked(transformer.transformFeeds).mock.results[1]!.value
      );

      // Both cycles completed and reported the split honestly.
      const completions = mockLogger.info.mock.calls.filter(
        ([message]) => message === "Poll complete"
      );
      expect(completions).toHaveLength(2);
      expect(completions[0]![1]).toEqual(
        expect.objectContaining({ feeds_ok: SUBWAY_FEEDS.length, feeds_failed: 0 })
      );
      expect(completions[1]![1]).toEqual(
        expect.objectContaining({ feeds_ok: SUBWAY_FEEDS.length - 1, feeds_failed: 1 })
      );
    });
  });

  describe("success-path diagnostics", () => {
    it("emits no credential-shaped data in any diagnostic during a fully successful poll", async () => {
      startPoller();
      await runFirstPoll();
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
      // The request headers (Accept-only, but still request material) and the
      // auth-bearing header names must never surface in success diagnostics.
      expect(keys).not.toContain("headers");
      expect(strings).not.toContain("application/x-protobuf");
      expect(strings).not.toContain("Authorization");
    });
  });
});
