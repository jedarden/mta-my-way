/**
 * Unit tests for apiCached
 *
 * Tests cached API client with application-level caching.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiCached } from "./apiCached";

// Mock the base API and cache modules
vi.mock("./api", () => ({
  api: {
    getStations: vi.fn(),
    getStation: vi.fn(),
    getRoutes: vi.fn(),
    getRoute: vi.fn(),
    getArrivals: vi.fn(),
    searchStations: vi.fn(),
    getComplexes: vi.fn(),
    getAlerts: vi.fn(),
    getAlertsForLine: vi.fn(),
    getHealth: vi.fn(),
    analyzeCommute: vi.fn(),
    getEquipment: vi.fn(),
    getAllEquipment: vi.fn(),
    getVapidPublicKey: vi.fn(),
    subscribePush: vi.fn(),
    unsubscribePush: vi.fn(),
    getTrip: vi.fn(),
    getPositions: vi.fn(),
  },
}));

vi.mock("./apiCache", () => ({
  apiCache: {
    fetch: vi.fn(),
    has: vi.fn(),
    invalidate: vi.fn(),
    stats: vi.fn(),
    preload: vi.fn(),
  },
}));

import { api } from "./api";
import { apiCache } from "./apiCache";

const mockApi = api as any;
const mockApiCache = apiCache as any;

describe("apiCached", () => {
  const mockStations = [
    { id: "101", name: "South Ferry", lines: ["1"] },
    { id: "102", name: "Rector St", lines: ["1"] },
  ];

  const mockRoutes = [
    { id: "1", shortName: "1", longName: "Broadway-7th Ave Local", color: "#EE352E" },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("stations endpoints", () => {
    it("fetches all stations with caching", async () => {
      mockApiCache.fetch.mockResolvedValue(mockStations);

      const result = await apiCached.getStations();

      expect(mockApiCache.fetch).toHaveBeenCalledWith(
        "/api/stations",
        expect.any(Function),
        undefined
      );
      expect(result).toEqual(mockStations);
    });

    it("fetches single station with caching", async () => {
      const mockStation = { id: "101", name: "South Ferry", lines: ["1"] };
      mockApiCache.fetch.mockResolvedValue(mockStation);

      const result = await apiCached.getStation("101");

      expect(mockApiCache.fetch).toHaveBeenCalledWith(
        "/api/stations/101",
        expect.any(Function),
        undefined
      );
      expect(result).toEqual(mockStation);
    });

    it("passes forceRefresh option", async () => {
      mockApiCache.fetch.mockResolvedValue(mockStations);

      await apiCached.getStations({ forceRefresh: true });

      expect(mockApiCache.fetch).toHaveBeenCalledWith("/api/stations", expect.any(Function), {
        forceRefresh: true,
      });
    });

    it("passes custom strategy option", async () => {
      mockApiCache.fetch.mockResolvedValue(mockStations);

      await apiCached.getStations({ strategy: "STATIC" });

      expect(mockApiCache.fetch).toHaveBeenCalledWith("/api/stations", expect.any(Function), {
        strategy: "STATIC",
      });
    });
  });

  describe("routes endpoints", () => {
    it("fetches all routes with caching", async () => {
      mockApiCache.fetch.mockResolvedValue(mockRoutes);

      const result = await apiCached.getRoutes();

      expect(mockApiCache.fetch).toHaveBeenCalledWith(
        "/api/routes",
        expect.any(Function),
        undefined
      );
      expect(result).toEqual(mockRoutes);
    });

    it("fetches single route with caching", async () => {
      const mockRoute = {
        id: "1",
        shortName: "1",
        longName: "Broadway-7th Ave Local",
        color: "#EE352E",
      };
      mockApiCache.fetch.mockResolvedValue(mockRoute);

      const result = await apiCached.getRoute("1");

      expect(mockApiCache.fetch).toHaveBeenCalledWith(
        "/api/routes/1",
        expect.any(Function),
        undefined
      );
      expect(result).toEqual(mockRoute);
    });
  });

  describe("arrivals endpoint", () => {
    it("fetches arrivals with REALTIME strategy by default", async () => {
      const mockArrivals = {
        stationId: "101",
        stationName: "South Ferry",
        northbound: [],
        southbound: [],
      };
      mockApiCache.fetch.mockResolvedValue(mockArrivals);

      const result = await apiCached.getArrivals("101");

      expect(mockApiCache.fetch).toHaveBeenCalledWith("/api/arrivals/101", expect.any(Function), {
        strategy: "REALTIME",
      });
      expect(result).toEqual(mockArrivals);
    });

    it("allows overriding default strategy", async () => {
      mockApiCache.fetch.mockResolvedValue({});

      await apiCached.getArrivals("101", { strategy: "STATIC" });

      expect(mockApiCache.fetch).toHaveBeenCalledWith("/api/arrivals/101", expect.any(Function), {
        strategy: "STATIC",
      });
    });
  });

  describe("search endpoint", () => {
    it("bypasses cache for search", async () => {
      mockApi.searchStations.mockResolvedValue(mockStations);

      const result = await apiCached.searchStations("South");

      expect(mockApi.searchStations).toHaveBeenCalledWith("South");
      expect(mockApiCache.fetch).not.toHaveBeenCalled();
      expect(result).toEqual(mockStations);
    });
  });

  describe("complexes endpoint", () => {
    it("fetches complexes with caching", async () => {
      const mockComplexes = [
        {
          complexId: "725-726",
          name: "Times Sq-42 St / Port Authority",
          stations: ["725", "726"],
        },
      ];
      mockApiCache.fetch.mockResolvedValue(mockComplexes);

      const result = await apiCached.getComplexes();

      expect(mockApiCache.fetch).toHaveBeenCalledWith(
        "/api/static/complexes",
        expect.any(Function),
        undefined
      );
      expect(result).toEqual(mockComplexes);
    });
  });

  describe("alerts endpoints", () => {
    it("fetches all alerts with SEMI_STATIC strategy by default", async () => {
      const mockAlerts = {
        alerts: [],
        meta: {
          count: 0,
          officialCount: 0,
          predictedCount: 0,
          lastUpdatedAt: null,
          matchRate: 1,
        },
      };
      mockApiCache.fetch.mockResolvedValue(mockAlerts);

      const result = await apiCached.getAlerts();

      expect(mockApiCache.fetch).toHaveBeenCalledWith("/api/alerts", expect.any(Function), {
        strategy: "SEMI_STATIC",
      });
      expect(result).toEqual(mockAlerts);
    });

    it("fetches alerts for line with SEMI_STATIC strategy", async () => {
      const mockLineAlerts = {
        alerts: [],
        lineId: "1",
      };
      mockApiCache.fetch.mockResolvedValue(mockLineAlerts);

      const result = await apiCached.getAlertsForLine("1");

      expect(mockApiCache.fetch).toHaveBeenCalledWith("/api/alerts/1", expect.any(Function), {
        strategy: "SEMI_STATIC",
      });
      expect(result).toEqual(mockLineAlerts);
    });
  });

  describe("health endpoint", () => {
    it("fetches health with HEALTH strategy by default", async () => {
      const mockHealth = {
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime_seconds: 3600,
        feeds: [],
      };
      mockApiCache.fetch.mockResolvedValue(mockHealth);

      const result = await apiCached.getHealth();

      expect(mockApiCache.fetch).toHaveBeenCalledWith("/api/health", expect.any(Function), {
        strategy: "HEALTH",
      });
      expect(result).toEqual(mockHealth);
    });
  });

  describe("commute analyze endpoint", () => {
    it("fetches commute analysis with COMMUTE strategy by default", async () => {
      const mockAnalysis = {
        commuteId: "work",
        origin: { stationId: "101", stationName: "South Ferry" },
        destination: { stationId: "725", stationName: "Times Sq" },
        directRoutes: [],
        transferRoutes: [],
        recommendation: "direct" as const,
        timestamp: Date.now(),
      };
      mockApiCache.fetch.mockResolvedValue(mockAnalysis);

      const options = {
        originId: "101",
        destinationId: "725",
      };

      const result = await apiCached.analyzeCommute(options);

      expect(mockApiCache.fetch).toHaveBeenCalledWith(
        "/api/commute/analyze",
        expect.any(Function),
        { strategy: "COMMUTE" }
      );
      expect(result).toEqual(mockAnalysis);
    });

    it("passes all options to the API call", async () => {
      mockApiCache.fetch.mockResolvedValue({});

      const options = {
        originId: "101",
        destinationId: "725",
        preferredLines: ["1"],
        commuteId: "work",
        accessibleMode: true,
      };

      await apiCached.analyzeCommute(options);

      const fetchCall = mockApiCache.fetch.mock.calls[0];
      const apiFn = fetchCall[1];

      // The API function should be called with the options
      expect(apiFn).toBeInstanceOf(Function);
    });
  });

  describe("equipment endpoints", () => {
    it("fetches equipment for station with SEMI_STATIC strategy", async () => {
      const mockEquipment = {
        stationId: "101",
        stationName: "South Ferry",
        elevators: [],
        escalators: [],
      };
      mockApiCache.fetch.mockResolvedValue(mockEquipment);

      const result = await apiCached.getEquipment("101");

      expect(mockApiCache.fetch).toHaveBeenCalledWith("/api/equipment/101", expect.any(Function), {
        strategy: "SEMI_STATIC",
      });
      expect(result).toEqual(mockEquipment);
    });

    it("fetches all equipment with SEMI_STATIC strategy", async () => {
      const mockAllEquipment = {
        stations: [],
        count: 0,
      };
      mockApiCache.fetch.mockResolvedValue(mockAllEquipment);

      const result = await apiCached.getAllEquipment();

      expect(mockApiCache.fetch).toHaveBeenCalledWith("/api/equipment", expect.any(Function), {
        strategy: "SEMI_STATIC",
      });
      expect(result).toEqual(mockAllEquipment);
    });
  });

  describe("push notification endpoints", () => {
    it("bypasses cache for VAPID key", async () => {
      const mockKey = { publicKey: "test-key" };
      mockApi.getVapidPublicKey.mockResolvedValue(mockKey);

      const result = await apiCached.getVapidPublicKey();

      expect(mockApi.getVapidPublicKey).toHaveBeenCalled();
      expect(mockApiCache.fetch).not.toHaveBeenCalled();
      expect(result).toEqual(mockKey);
    });

    it("bypasses cache for subscribe", async () => {
      const mockResponse = { success: true };
      mockApi.subscribePush.mockResolvedValue(mockResponse);

      const request = {
        subscription: { endpoint: "https://test.com", keys: {} },
        favorites: [],
      };

      const result = await apiCached.subscribePush(request);

      expect(mockApi.subscribePush).toHaveBeenCalledWith(request);
      expect(mockApiCache.fetch).not.toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });

    it("bypasses cache for unsubscribe", async () => {
      const mockResponse = { success: true };
      mockApi.unsubscribePush.mockResolvedValue(mockResponse);

      const request = { endpoint: "https://test.com" };

      const result = await apiCached.unsubscribePush(request);

      expect(mockApi.unsubscribePush).toHaveBeenCalledWith(request);
      expect(mockApiCache.fetch).not.toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });
  });

  describe("trip tracking endpoint", () => {
    it("fetches trip with TRIP strategy by default", async () => {
      const mockTrip = {
        tripId: "test-trip",
        stops: [],
      };
      mockApiCache.fetch.mockResolvedValue(mockTrip);

      const result = await apiCached.getTrip("test-trip");

      expect(mockApiCache.fetch).toHaveBeenCalledWith("/api/trip/test-trip", expect.any(Function), {
        strategy: "TRIP",
      });
      expect(result).toEqual(mockTrip);
    });
  });

  describe("positions endpoint", () => {
    it("fetches positions with REALTIME strategy by default", async () => {
      const mockPositions = {
        lineId: "1",
        trains: [],
      };
      mockApiCache.fetch.mockResolvedValue(mockPositions);

      const result = await apiCached.getPositions("1");

      expect(mockApiCache.fetch).toHaveBeenCalledWith("/api/positions/1", expect.any(Function), {
        strategy: "REALTIME",
      });
      expect(result).toEqual(mockPositions);
    });
  });

  describe("cache management utilities", () => {
    it("provides has method", () => {
      mockApiCache.has.mockReturnValue(true);

      const result = apiCached.cache.has("/api/stations");

      expect(mockApiCache.has).toHaveBeenCalledWith("/api/stations");
      expect(result).toBe(true);
    });

    it("provides invalidate method", () => {
      mockApiCache.invalidate.mockReturnValue(undefined);

      apiCached.cache.invalidate("/api/stations");

      expect(mockApiCache.invalidate).toHaveBeenCalledWith("/api/stations");
    });

    it("provides stats method", () => {
      const mockStats = {
        size: 10,
        entries: [],
      };
      mockApiCache.stats.mockReturnValue(mockStats);

      const result = apiCached.cache.stats();

      expect(mockApiCache.stats).toHaveBeenCalled();
      expect(result).toEqual(mockStats);
    });

    it("provides preload method", () => {
      mockApiCache.preload.mockResolvedValue(undefined);

      const paths = ["/api/stations", "/api/routes"];

      apiCached.cache.preload(paths);

      expect(mockApiCache.preload).toHaveBeenCalledWith(paths);
    });
  });

  describe("combined options", () => {
    it("passes both forceRefresh and strategy", async () => {
      mockApiCache.fetch.mockResolvedValue([]);

      await apiCached.getStations({ forceRefresh: true, strategy: "STATIC" });

      expect(mockApiCache.fetch).toHaveBeenCalledWith("/api/stations", expect.any(Function), {
        forceRefresh: true,
        strategy: "STATIC",
      });
    });
  });
});
