/**
 * Tests for API client
 *
 * Tests the core API client including:
 * - CSRF token handling
 * - Request retry logic
 * - Error handling
 * - API endpoint methods
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError, api } from "./api";

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

describe("ApiClientError", () => {
  it("creates error with status", () => {
    const error = new ApiClientError("Not found", 404);
    expect(error.message).toBe("Not found");
    expect(error.status).toBe(404);
    expect(error.name).toBe("ApiClientError");
  });
});

describe("API client - CSRF handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    document.cookie = "";
  });

  it("includes CSRF token for state-changing requests", async () => {
    document.cookie = "csrf_token=test-token-123";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    await api.analyzeCommute({
      originId: "101",
      destinationId: "102",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1]?.headers?.["X-CSRF-Token"]).toBe("test-token-123");
  });

  it("fetches new CSRF token if none exists", async () => {
    // Clear CSRF token from cookie
    Object.defineProperty(document, "cookie", {
      writable: true,
      value: "",
    });

    // First call fetches CSRF token
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: "new-token-456" }),
    } as Response);

    // Second call makes the actual request
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    await api.analyzeCommute({
      originId: "101",
      destinationId: "102",
    });

    // Should have 2 calls: one for CSRF token, one for the actual request
    expect(mockFetch).toHaveBeenCalledTimes(2);
    // First call should be to fetch CSRF token
    expect(mockFetch.mock.calls[0][0]).toContain("/api/csrf-token");
    // Second call should be the actual API call
    expect(mockFetch.mock.calls[1][0]).toContain("/api/commute/analyze");
  });

  it("does not include CSRF token for GET requests", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    await api.getStations();

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1]?.headers?.["X-CSRF-Token"]).toBeUndefined();
  });
});

describe("API client - Non-retryable errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("does not retry on 404", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ message: "Not found", status: 404 }),
    });

    await expect(api.getStation("999")).rejects.toThrow("Not found");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 400 validation error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ message: "Bad request", status: 400 }),
    });

    await expect(api.searchStations("")).rejects.toThrow("Bad request");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 401 unauthorized", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ message: "Unauthorized", status: 401 }),
    });

    await expect(api.getStations()).rejects.toThrow("Unauthorized");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 403 forbidden", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ message: "Forbidden", status: 403 }),
    });

    await expect(api.getStations()).rejects.toThrow("Forbidden");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("API client - Error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("throws ApiClientError on failed response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ message: "Station not found", status: 404 }),
    });

    try {
      await api.getStation("999");
      expect.fail("Should have thrown ApiClientError");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError);
      expect((error as ApiClientError).message).toBe("Station not found");
      expect((error as ApiClientError).status).toBe(404);
    }
  });

  it("includes trace headers in requests", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    await api.getStations();

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1]?.headers?.["x-trace-id"]).toBe("test-trace-123");
  });

  it("handles JSON parse errors gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new Error("Invalid JSON");
      },
    });

    // Should still throw when JSON parsing fails
    await expect(api.getStations()).rejects.toThrow();
  });
});

describe("API client - Endpoint methods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.cookie = "csrf_token=test-token-123";
  });

  describe("Stations", () => {
    it("getStations fetches all stations", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: "101", name: "Station 1" }],
      });

      const result = await api.getStations();

      expect(mockFetch).toHaveBeenCalledWith("/api/stations", expect.any(Object));
      expect(result).toEqual([{ id: "101", name: "Station 1" }]);
    });

    it("getStation fetches single station", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "101", name: "Station 1" }),
      });

      const result = await api.getStation("101");

      expect(mockFetch).toHaveBeenCalledWith("/api/stations/101", expect.any(Object));
      expect(result).toEqual({ id: "101", name: "Station 1" });
    });
  });

  describe("Routes", () => {
    it("getRoutes fetches all routes", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: "1", shortName: "1" }],
      });

      const result = await api.getRoutes();

      expect(mockFetch).toHaveBeenCalledWith("/api/routes", expect.any(Object));
      expect(result).toEqual([{ id: "1", shortName: "1" }]);
    });

    it("getRoute fetches single route", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "1", shortName: "1" }),
      });

      const result = await api.getRoute("1");

      expect(mockFetch).toHaveBeenCalledWith("/api/routes/1", expect.any(Object));
      expect(result).toEqual({ id: "1", shortName: "1" });
    });
  });

  describe("Arrivals", () => {
    it("getArrivals fetches station arrivals", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          stationId: "101",
          stationName: "Test Station",
          northbound: [],
          southbound: [],
        }),
      });

      await api.getArrivals("101");

      expect(mockFetch).toHaveBeenCalledWith("/api/arrivals/101", expect.any(Object));
    });
  });

  describe("Search", () => {
    it("searchStations encodes query parameter", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      await api.searchStations("Times Square");

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/stations/search?q=Times+Square",
        expect.any(Object)
      );
    });

    it("searchStations encodes special characters", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      await api.searchStations("St & George");

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/stations/search?q=St+%26+George",
        expect.any(Object)
      );
    });
  });

  describe("Alerts", () => {
    it("getAlerts fetches all alerts", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ alerts: [], meta: { count: 0 } }),
      });

      await api.getAlerts();

      expect(mockFetch).toHaveBeenCalledWith("/api/alerts", expect.any(Object));
    });

    it("getAlertsForLine fetches line-specific alerts", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ alerts: [], lineId: "1" }),
      });

      await api.getAlertsForLine("1");

      expect(mockFetch).toHaveBeenCalledWith("/api/alerts/1", expect.any(Object));
    });
  });

  describe("Health", () => {
    it("getHealth fetches system health", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ok",
          timestamp: "2024-01-01T00:00:00Z",
          uptime_seconds: 3600,
          feeds: [],
          alerts: { count: 0 },
          failingFeedsCount: 0,
        }),
      });

      await api.getHealth();

      expect(mockFetch).toHaveBeenCalledWith("/api/health", expect.any(Object));
    });
  });

  describe("Commute", () => {
    it("analyzeCommute sends POST with body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          origin: { stationId: "101" },
          destination: { stationId: "102" },
          directRoutes: [],
          transferRoutes: [],
        }),
      });

      await api.analyzeCommute({
        originId: "101",
        destinationId: "102",
        preferredLines: ["1"],
        accessibleMode: true,
      });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe("/api/commute/analyze");
      expect(callArgs[1]?.method).toBe("POST");

      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.originId).toBe("101");
      expect(body.destinationId).toBe("102");
      expect(body.preferredLines).toEqual(["1"]);
      expect(body.accessibleMode).toBe(true);
    });
  });

  describe("Equipment", () => {
    it("getEquipment fetches station equipment", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stationId: "101", equipment: [], adaAccessible: true }),
      });

      await api.getEquipment("101");

      expect(mockFetch).toHaveBeenCalledWith("/api/equipment/101", expect.any(Object));
    });

    it("getAllEquipment fetches all equipment", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ stations: [], count: 0 }),
      });

      await api.getAllEquipment();

      expect(mockFetch).toHaveBeenCalledWith("/api/equipment", expect.any(Object));
    });
  });

  describe("Push notifications", () => {
    it("getVapidPublicKey fetches public key", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ publicKey: "test-key" }),
      });

      await api.getVapidPublicKey();

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

      await api.subscribePush(subscription);

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe("/api/push/subscribe");
      expect(callArgs[1]?.method).toBe("POST");
    });

    it("unsubscribePush sends DELETE request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await api.unsubscribePush({ endpoint: "https://test.com" });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe("/api/push/unsubscribe");
      expect(callArgs[1]?.method).toBe("DELETE");
    });

    it("updatePushSubscription sends PATCH request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await api.updatePushSubscription({
        endpoint: "https://test.com",
        favorites: [{ id: "fav1", stationId: "101", lines: ["1"], direction: "both" }],
      });

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe("/api/push/subscription");
      expect(callArgs[1]?.method).toBe("PATCH");
    });
  });

  describe("Trip tracking", () => {
    it("getTrip fetches trip data", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tripId: "trip-123",
          routeId: "1",
          destination: "Van Cortlandt Park",
          stops: [],
        }),
      });

      await api.getTrip("trip-123");

      expect(mockFetch).toHaveBeenCalledWith("/api/trip/trip-123", expect.any(Object));
    });

    it("getPositions fetches line diagram data", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ trains: [], stations: [] }),
      });

      await api.getPositions("1");

      expect(mockFetch).toHaveBeenCalledWith("/api/positions/1", expect.any(Object));
    });

    it("getTrip encodes special characters in trip ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tripId: "trip-with-special-chars",
          routeId: "1",
          stops: [],
        }),
      });

      await api.getTrip("trip with spaces & special!");

      // Note: ! is not encoded by encodeURIComponent
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/trip/trip%20with%20spaces%20%26%20special!",
        expect.any(Object)
      );
    });
  });
});

describe("API client - Request headers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    document.cookie = "csrf_token=test-token-123";
  });

  it("sets Content-Type to application/json", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    await api.analyzeCommute({ originId: "101", destinationId: "102" });

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1]?.headers?.["Content-Type"]).toBe("application/json");
  });

  it("merges custom headers with defaults", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    // This test verifies that trace headers are included
    await api.getStations();

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1]?.headers).toHaveProperty("x-trace-id");
  });
});
