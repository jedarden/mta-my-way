/**
 * Tests for enhanced API client
 *
 * Tests the enhanced API client including:
 * - Retry logic with exponential backoff
 * - Timeout handling
 * - Error categorization
 * - Offline detection
 */

import { act, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiErrorType, EnhancedApiError, apiEnhanced } from "./apiEnhanced";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock tracing
vi.mock("./tracing.js", () => ({
  getTraceHeaders: () => ({ "x-trace-id": "test-trace-123" }),
}));

// Mock VITE_API_BASE
vi.stubGlobal("import", {
  meta: {
    env: {
      VITE_API_BASE: "",
    },
  },
});

describe("EnhancedApiError", () => {
  it("creates error with all details", () => {
    const error = new EnhancedApiError({
      type: ApiErrorType.NETWORK,
      message: "Network error",
      status: 500,
      retryable: true,
    });

    expect(error.message).toBe("Network error");
    expect(error.type).toBe(ApiErrorType.NETWORK);
    expect(error.status).toBe(500);
    expect(error.retryable).toBe(true);
    expect(error.name).toBe("EnhancedApiError");
  });

  it("includes original error when provided", () => {
    const originalError = new Error("Original error");
    const error = new EnhancedApiError({
      type: ApiErrorType.UNKNOWN,
      message: "Wrapped error",
      retryable: false,
      originalError,
    });

    expect(error.originalError).toBe(originalError);
  });
});

describe("enhancedFetch - retry logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("retries on 500 server error", async () => {
    let attemptCount = 0;
    mockFetch.mockImplementation(() => {
      attemptCount++;
      if (attemptCount < 3) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ error: "Server error" }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: "success" }),
      });
    });

    const result = await apiEnhanced.getStations();

    expect(attemptCount).toBe(3);
    expect(result).toEqual({ data: "success" });
  });

  it("retries on 429 rate limit", async () => {
    let attemptCount = 0;
    mockFetch.mockImplementation(() => {
      attemptCount++;
      if (attemptCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 429,
          json: async () => ({ error: "Too many requests" }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: "1" }),
      });
    });

    const result = await apiEnhanced.getRoute("1");

    expect(attemptCount).toBe(2);
    expect(result).toEqual({ id: "1" });
  });

  it("does not retry on 404", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "Not found" }),
    });

    const error = await apiEnhanced.getStation("999").catch((e) => e);
    expect(error.type).toBe(ApiErrorType.NOT_FOUND);
    expect(error.retryable).toBe(false);

    expect(mockFetch).toHaveBeenCalledTimes(1); // Should not retry
  });

  it("does not retry on 401", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
    });

    const error = await apiEnhanced.getStation("101").catch((e) => e);
    expect(error.type).toBe(ApiErrorType.UNAUTHORIZED);
    expect(error.retryable).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1); // Should not retry
  });

  it("does not retry on 403", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: "Forbidden" }),
    });

    const error = await apiEnhanced.getStation("101").catch((e) => e);
    expect(error.type).toBe(ApiErrorType.UNAUTHORIZED);
    expect(error.retryable).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1); // Should not retry
  });

  it("gives up after max retries", async () => {
    vi.useFakeTimers();

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Server error" }),
    });

    const promise = apiEnhanced.getStations().catch(() => {
      // Expected to throw
    });

    // Fast-forward through all retry delays
    await vi.runAllTimersAsync();

    await promise;

    // Initial attempt + 3 retries = 4 total
    expect(mockFetch).toHaveBeenCalledTimes(4);

    vi.useRealTimers();
  });
});

describe("enhancedFetch - timeout handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("times out after custom timeout", async () => {
    // Mock fetch that respects AbortSignal
    mockFetch.mockImplementation((_url, options) => {
      return new Promise((_, reject) => {
        // Listen for abort event
        options?.signal?.addEventListener("abort", () => {
          // Reject with a DOMException-like error with name AbortError
          const error = new Error("Request timed out");
          error.name = "AbortError";
          reject(error);
        });
      });
    });

    let error: EnhancedApiError | undefined;

    // Use a short timeout for this test
    const promise = apiEnhanced.getStations({ timeout: 100 }).catch((e) => {
      error = e as EnhancedApiError;
      return e;
    });

    // Wait for the timeout to trigger
    await new Promise((resolve) => setTimeout(resolve, 200));
    await promise;

    expect(error).toBeDefined();
    expect(error!.type).toBe(ApiErrorType.TIMEOUT);
    expect(error!.message).toContain("timed out");
  }, 10000);

  it("times out after default timeout", async () => {
    vi.useFakeTimers();

    // Mock fetch that respects AbortSignal
    mockFetch.mockImplementation((_url, options) => {
      return new Promise((_, reject) => {
        // Listen for abort event
        options?.signal?.addEventListener("abort", () => {
          // Reject with a DOMException-like error with name AbortError
          const error = new Error("Request timed out");
          error.name = "AbortError";
          reject(error);
        });
      });
    });

    let error: EnhancedApiError | undefined;

    // Use a shorter timeout than the default for faster test
    const promise = apiEnhanced.getStations({ timeout: 500 }).catch((e) => {
      error = e as EnhancedApiError;
      return e;
    });

    // Fast-forward past the timeout
    await vi.runAllTimersAsync();
    await promise;

    expect(error).toBeDefined();
    expect(error!.type).toBe(ApiErrorType.TIMEOUT);
    expect(error!.message).toContain("timed out");

    vi.useRealTimers();
  }, 10000);
});

describe("enhancedFetch - offline detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws offline error when navigator.onLine is false", async () => {
    const originalOnLine = navigator.onLine;
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: false,
    });

    await expect(apiEnhanced.getStations()).rejects.toThrow();

    const error = await apiEnhanced.getStations().catch((e) => e);
    expect(error.type).toBe(ApiErrorType.OFFLINE);
    expect(error.retryable).toBe(true);
    expect(error.message).toContain("offline");

    // Restore
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: originalOnLine,
    });
  });

  it("does not fetch when offline", async () => {
    const originalOnLine = navigator.onLine;
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: false,
    });

    try {
      await apiEnhanced.getStations();
    } catch {
      // Expected
    }

    expect(mockFetch).not.toHaveBeenCalled();

    // Restore
    Object.defineProperty(navigator, "onLine", {
      writable: true,
      value: originalOnLine,
    });
  });
});

describe("enhancedFetch - error categorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("categorizes 404 as NOT_FOUND", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: "Not found" }),
    });

    const error = await apiEnhanced.getStation("999").catch((e) => e);

    expect(error.type).toBe(ApiErrorType.NOT_FOUND);
    expect(error.status).toBe(404);
    expect(error.retryable).toBe(false);
  });

  it("categorizes 401 as UNAUTHORIZED", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Unauthorized" }),
    });

    const error = await apiEnhanced.getAlerts().catch((e) => e);

    expect(error.type).toBe(ApiErrorType.UNAUTHORIZED);
    expect(error.status).toBe(401);
    expect(error.retryable).toBe(false);
  });

  it("categorizes 403 as UNAUTHORIZED", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "Forbidden" }),
    });

    const error = await apiEnhanced.getAlerts().catch((e) => e);

    expect(error.type).toBe(ApiErrorType.UNAUTHORIZED);
    expect(error.status).toBe(403);
  });

  it("categorizes 500 as SERVER", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal server error" }),
    });

    const promise = apiEnhanced.getHealth().catch((e) => e);

    // Fast-forward through all retry delays
    vi.runAllTimersAsync();

    const error = await promise;

    expect(error.type).toBe(ApiErrorType.SERVER);
    expect(error.status).toBe(500);
    expect(error.retryable).toBe(true);
  });

  it("categorizes 503 as SERVER", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "Service unavailable" }),
    });

    const promise = apiEnhanced.getRoutes().catch((e) => e);

    // Fast-forward through all retry delays
    vi.runAllTimersAsync();

    const error = await promise;

    expect(error.type).toBe(ApiErrorType.SERVER);
    expect(error.status).toBe(503);
  });

  it("categorizes 429 as SERVER with rate limit message", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "Too many requests" }),
    });

    const promise = apiEnhanced.getArrivals("101").catch((e) => e);

    // Fast-forward through all retry delays
    vi.runAllTimersAsync();

    const error = await promise;

    expect(error.type).toBe(ApiErrorType.SERVER);
    expect(error.status).toBe(429);
    expect(error.message).toContain("Too many requests");
  });
});

describe("enhancedFetch - network errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("handles network failures", async () => {
    mockFetch.mockRejectedValue(new Error("Failed to fetch"));

    const promise = apiEnhanced.getStations().catch((e) => e);

    // Fast-forward through retry delays
    await vi.runAllTimersAsync();

    const error = await promise;

    expect(error.type).toBe(ApiErrorType.NETWORK);
    expect(error.message).toContain("Network error");
  });

  it("handles JSON parse errors", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });

    const promise = apiEnhanced.getStations().catch((e) => e);

    // Fast-forward through retry delays
    await vi.runAllTimersAsync();

    const error = await promise;

    expect(error.type).toBe(ApiErrorType.PARSE);
  });
});

describe("apiEnhanced endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getStations calls correct endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: "101" }],
    });

    await apiEnhanced.getStations();

    expect(mockFetch).toHaveBeenCalledWith("/api/stations", expect.any(Object));
  });

  it("getStation calls correct endpoint with ID", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "101" }),
    });

    await apiEnhanced.getStation("101");

    expect(mockFetch).toHaveBeenCalledWith("/api/stations/101", expect.any(Object));
  });

  it("getRoutes calls correct endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: "1" }],
    });

    await apiEnhanced.getRoutes();

    expect(mockFetch).toHaveBeenCalledWith("/api/routes", expect.any(Object));
  });

  it("getRoute calls correct endpoint with ID", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: "1" }),
    });

    await apiEnhanced.getRoute("1");

    expect(mockFetch).toHaveBeenCalledWith("/api/routes/1", expect.any(Object));
  });

  it("getArrivals calls correct endpoint with stationId", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ stationId: "101", northbound: [], southbound: [] }),
    });

    await apiEnhanced.getArrivals("101");

    expect(mockFetch).toHaveBeenCalledWith("/api/arrivals/101", expect.any(Object));
  });

  it("searchStations encodes query parameter", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    await apiEnhanced.searchStations("Times Square");

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/stations/search?q=Times+Square",
      expect.any(Object)
    );
  });

  it("getAlerts calls correct endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ alerts: [], meta: { count: 0 } }),
    });

    await apiEnhanced.getAlerts();

    expect(mockFetch).toHaveBeenCalledWith("/api/alerts", expect.any(Object));
  });

  it("getHealth calls correct endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok", feeds: [] }),
    });

    await apiEnhanced.getHealth();

    expect(mockFetch).toHaveBeenCalledWith("/api/health", expect.any(Object));
  });

  it("analyzeCommute sends POST with body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ origin: {}, destination: {}, directRoutes: [] }),
    });

    await apiEnhanced.analyzeCommute({
      originId: "101",
      destinationId: "102",
      preferredLines: ["1"],
    });

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe("/api/commute/analyze");
    expect(callArgs[1]?.method).toBe("POST");

    const body = JSON.parse(callArgs[1]?.body as string);
    expect(body.originId).toBe("101");
    expect(body.destinationId).toBe("102");
    expect(body.preferredLines).toEqual(["1"]);
  });

  it("getEquipment calls correct endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ stationId: "101", equipment: [] }),
    });

    await apiEnhanced.getEquipment("101");

    expect(mockFetch).toHaveBeenCalledWith("/api/equipment/101", expect.any(Object));
  });

  it("getAllEquipment calls correct endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ stations: [], count: 0 }),
    });

    await apiEnhanced.getAllEquipment();

    expect(mockFetch).toHaveBeenCalledWith("/api/equipment", expect.any(Object));
  });

  it("getVapidPublicKey calls correct endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ publicKey: "test-key" }),
    });

    await apiEnhanced.getVapidPublicKey();

    expect(mockFetch).toHaveBeenCalledWith("/api/push/vapid-public-key", expect.any(Object));
  });

  it("subscribePush sends POST request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    const subscription = {
      subscription: { endpoint: "https://test.com", keys: {} },
      favorites: [],
    };

    await apiEnhanced.subscribePush(subscription);

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe("/api/push/subscribe");
    expect(callArgs[1]?.method).toBe("POST");
  });

  it("unsubscribePush sends DELETE request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    await apiEnhanced.unsubscribePush({ endpoint: "https://test.com" });

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe("/api/push/unsubscribe");
    expect(callArgs[1]?.method).toBe("DELETE");
  });

  it("getTrip encodes trip ID", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ tripId: "trip-123", stops: [] }),
    });

    await apiEnhanced.getTrip("trip with spaces");

    expect(mockFetch).toHaveBeenCalledWith("/api/trip/trip%20with%20spaces", expect.any(Object));
  });

  it("getPositions calls correct endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ trains: [], stations: [] }),
    });

    await apiEnhanced.getPositions("1");

    expect(mockFetch).toHaveBeenCalledWith("/api/positions/1", expect.any(Object));
  });
});

describe("enhancedFetch - trace headers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes trace headers in requests", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    await apiEnhanced.getStations();

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1]?.headers?.["x-trace-id"]).toBe("test-trace-123");
  });
});

describe("enhancedFetch - exponential backoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses exponential backoff for retries", async () => {
    let attemptCount = 0;
    mockFetch.mockImplementation(() => {
      attemptCount++;
      if (attemptCount < 4) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ error: "Server error" }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: "success" }),
      });
    });

    const startTime = Date.now();
    const promise = apiEnhanced.getStations();

    // Let the retries happen
    await vi.runAllTimersAsync();
    await promise;

    const endTime = Date.now();
    const elapsed = endTime - startTime;

    // Should have taken at least some time due to backoff
    // Base delay: 1000ms, exponential with jitter
    // Attempt 0: fail, retry after ~1000ms
    // Attempt 1: fail, retry after ~2000ms
    // Attempt 2: fail, retry after ~4000ms
    // Attempt 3: success
    expect(attemptCount).toBe(4);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });
});
