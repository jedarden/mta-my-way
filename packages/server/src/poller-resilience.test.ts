import { SUBWAY_FEEDS } from "@mta-my-way/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as cache from "./cache.js";
import * as delayDetector from "./delay-detector.js";
import * as metrics from "./middleware/metrics.js";
import { logger } from "./observability/logger.js";
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
}));
vi.mock("./observability/logger.js", () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("./observability/tracing.js", () => ({
  setSpanAttribute: vi.fn(),
  tracedFetch: vi.fn(),
  withChildSpan: vi.fn((_name: string, fn: () => Promise<unknown> | unknown) => fn()),
}));

const feedUrl = SUBWAY_FEEDS.find((feed) => feed.id === "gtfs")!.url;
const okResponse = () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }) as Response;

describe("GTFS poller transport retries", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5); // deterministic 500/1000/2000ms backoff
    vi.mocked(cache.isCircuitOpen).mockReturnValue(false);
    vi.mocked(cache.getAllParsedFeeds).mockReturnValue(new Map());
    vi.mocked(cache.getAllFeedAges).mockReturnValue(new Map());
    vi.mocked(delayDetector.extractVehiclePositions).mockReturnValue([]);
    vi.mocked(transformer.transformFeeds).mockReturnValue(new Map());
    vi.mocked(parser.parseFeed).mockReturnValue({
      message: {},
      entityCount: 2,
      headerTimestamp: Date.now(),
    });
    vi.mocked(tracing.tracedFetch).mockResolvedValue(okResponse());
    initPoller({}, {});
  });

  afterEach(() => {
    stopPoller();
    vi.useRealTimers();
  });

  it.each([
    ["network rejection", new TypeError("connection reset")],
    ["request timeout", new DOMException("timed out", "AbortError")],
  ])("recovers from one %s while other feeds complete", async (_name, error) => {
    let attempts = 0;
    vi.mocked(tracing.tracedFetch).mockImplementation(async (url) => {
      if (url !== feedUrl) return okResponse();
      attempts++;
      if (attempts === 1) throw error;
      return okResponse();
    });

    startPoller();
    await vi.advanceTimersByTimeAsync(0);
    expect(attempts).toBe(1);
    expect(cache.recordFeedSuccess).toHaveBeenCalledTimes(SUBWAY_FEEDS.length - 1);
    await vi.advanceTimersByTimeAsync(500);

    expect(attempts).toBe(2);
    expect(cache.recordFeedSuccess).toHaveBeenCalledWith(
      "gtfs",
      expect.objectContaining({ entityCount: 2 }),
      2,
      expect.any(Number)
    );
    expect(cache.recordFeedFailure).not.toHaveBeenCalled();
    expect(metrics.recordFeedError).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      "Poll complete",
      expect.objectContaining({ feeds_ok: SUBWAY_FEEDS.length, feeds_failed: 0 })
    );
  });

  it("records a persistent network failure after four attempts without blocking cache updates", async () => {
    let attempts = 0;
    vi.mocked(tracing.tracedFetch).mockImplementation(async (url) => {
      if (url !== feedUrl) return okResponse();
      attempts++;
      throw new TypeError("connection reset");
    });

    startPoller();
    await vi.advanceTimersByTimeAsync(3500);

    expect(attempts).toBe(4);
    expect(cache.recordFeedFailure).toHaveBeenCalledWith(
      "gtfs",
      "connection reset",
      expect.any(Number)
    );
    expect(metrics.recordFeedError).toHaveBeenCalledWith("gtfs", "network");
    expect(cache.recordFeedSuccess).toHaveBeenCalledTimes(SUBWAY_FEEDS.length - 1);
    expect(cache.updatePositions).toHaveBeenCalledTimes(1);
    expect(cache.updateArrivals).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      "Poll complete",
      expect.objectContaining({ feeds_ok: SUBWAY_FEEDS.length - 1, feeds_failed: 1 })
    );
  });
});
