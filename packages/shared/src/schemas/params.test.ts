/**
 * Tests for params.ts schemas
 *
 * Tests Zod validation schemas for path parameters including:
 * - Line ID validation
 * - Route ID validation
 * - Station ID validation
 * - Complex ID validation
 * - Trip ID validation
 * - Date parameter validation
 * - Query parameter schemas
 */

import { describe, expect, it } from "vitest";
import {
  alertsQuerySchema,
  commuteIdQuerySchema,
  complexIdParamSchema,
  complexIdParamsSchema,
  datePathParamSchema,
  dateRangeParamsSchema,
  emptyQuerySchema,
  equipmentQuerySchema,
  journalStatsQuerySchema,
  lineIdParamSchema,
  lineIdParamsSchema,
  paginationQuerySchema,
  positionsQuerySchema,
  routeIdParamSchema,
  routeIdParamsSchema,
  stationIdParamSchema,
  stationIdParamsSchema,
  stationSearchQuerySchema,
  tripIdParamSchema,
  tripIdParamsSchema,
} from "./params";

describe("lineIdParamSchema", () => {
  describe("valid line IDs", () => {
    it("accepts single digit lines", () => {
      const lines = ["1", "2", "3", "4", "5", "6", "7"];
      for (const line of lines) {
        const result = lineIdParamSchema.safeParse(line);
        expect(result.success).toBe(true);
      }
    });

    it("accepts letter lines", () => {
      const lines = ["A", "C", "E", "G", "H", "J", "L", "M", "N", "Q", "R", "W", "Y", "Z"];
      for (const line of lines) {
        const result = lineIdParamSchema.safeParse(line);
        expect(result.success).toBe(true);
      }
    });

    it("accepts multi-line combinations", () => {
      const lines = ["123", "456", "ACE", "BDFM", "NQRW", "JZ"];
      for (const line of lines) {
        const result = lineIdParamSchema.safeParse(line);
        expect(result.success).toBe(true);
      }
    });

    it("accepts Shuttle line identifiers", () => {
      const lines = ["FS", "SI", "SX", "GS"];
      for (const line of lines) {
        const result = lineIdParamSchema.safeParse(line);
        expect(result.success).toBe(true);
      }
    });
  });

  describe("invalid line IDs", () => {
    it("rejects empty string", () => {
      const result = lineIdParamSchema.safeParse("");
      expect(result.success).toBe(false);
    });

    it("rejects lowercase letters", () => {
      const result = lineIdParamSchema.safeParse("a");
      expect(result.success).toBe(false);
    });

    it("rejects special characters", () => {
      const result = lineIdParamSchema.safeParse("A-B");
      expect(result.success).toBe(false);
    });

    it("rejects strings that are too long", () => {
      const result = lineIdParamSchema.safeParse("ABCDEFGHI");
      expect(result.success).toBe(false);
    });

    it("rejects HTML content", () => {
      const result = lineIdParamSchema.safeParse("<script>");
      expect(result.success).toBe(false);
    });
  });
});

describe("routeIdParamSchema", () => {
  it("accepts valid route IDs", () => {
    const routes = ["1", "A", "BDFM", "NQRW", "FS", "SI"];
    for (const route of routes) {
      const result = routeIdParamSchema.safeParse(route);
      expect(result.success).toBe(true);
    }
  });

  it("accepts alphanumeric route IDs", () => {
    const result = routeIdParamSchema.safeParse("Route1");
    expect(result.success).toBe(true);
  });

  it("rejects empty string", () => {
    const result = routeIdParamSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects overly long route IDs", () => {
    const result = routeIdParamSchema.safeParse("verylongrouteid");
    expect(result.success).toBe(false);
  });
});

describe("stationIdParamSchema", () => {
  it("accepts valid station IDs", () => {
    const stations = ["123", "station_1", "Station-A", "123_station"];
    for (const station of stations) {
      const result = stationIdParamSchema.safeParse(station);
      expect(result.success).toBe(true);
    }
  });

  it("rejects empty string", () => {
    const result = stationIdParamSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects special characters other than hyphen and underscore", () => {
    const result = stationIdParamSchema.safeParse("station.1");
    expect(result.success).toBe(false);
  });

  it("rejects overly long station IDs", () => {
    const result = stationIdParamSchema.safeParse("a".repeat(51));
    expect(result.success).toBe(false);
  });
});

describe("complexIdParamSchema", () => {
  it("accepts valid complex IDs", () => {
    const complexes = ["123", "complex_A", "Complex-1"];
    for (const complex of complexes) {
      const result = complexIdParamSchema.safeParse(complex);
      expect(result.success).toBe(true);
    }
  });

  it("rejects empty string", () => {
    const result = complexIdParamSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects special characters", () => {
    const result = complexIdParamSchema.safeParse("complex.1");
    expect(result.success).toBe(false);
  });
});

describe("tripIdParamSchema", () => {
  it("accepts valid trip IDs", () => {
    const trips = ["123_20240115", "A_trip1", "trip.1", "TRIP-1-2-3", "MTA_123_20240115"];
    for (const trip of trips) {
      const result = tripIdParamSchema.safeParse(trip);
      expect(result.success).toBe(true);
    }
  });

  it("rejects empty string", () => {
    const result = tripIdParamSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects special characters other than allowed ones", () => {
    const result = tripIdParamSchema.safeParse("trip@1");
    expect(result.success).toBe(false);
  });

  it("rejects overly long trip IDs", () => {
    const result = tripIdParamSchema.safeParse("a".repeat(101));
    expect(result.success).toBe(false);
  });
});

describe("datePathParamSchema", () => {
  it("accepts valid ISO 8601 dates", () => {
    const dates = ["2024-01-15", "2023-12-31", "2020-02-29"];
    for (const date of dates) {
      const result = datePathParamSchema.safeParse(date);
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid date formats", () => {
    const invalidDates = ["2024/01/15", "01-15-2024", "2024-1-5", "15-01-2024"];
    for (const date of invalidDates) {
      const result = datePathParamSchema.safeParse(date);
      expect(result.success).toBe(false);
    }
  });

  it("rejects invalid dates", () => {
    const invalidDates = ["2024-13-01", "2024-02-30", "2024-00-01"];
    for (const date of invalidDates) {
      const result = datePathParamSchema.safeParse(date);
      expect(result.success).toBe(false);
    }
  });
});

describe("combined params schemas", () => {
  it("lineIdParamsSchema validates lineId", () => {
    const result = lineIdParamsSchema.safeParse({ lineId: "1" });
    expect(result.success).toBe(true);
  });

  it("routeIdParamsSchema validates id", () => {
    const result = routeIdParamsSchema.safeParse({ id: "A" });
    expect(result.success).toBe(true);
  });

  it("stationIdParamsSchema validates id", () => {
    const result = stationIdParamsSchema.safeParse({ id: "123" });
    expect(result.success).toBe(true);
  });

  it("complexIdParamsSchema validates id", () => {
    const result = complexIdParamsSchema.safeParse({ id: "123" });
    expect(result.success).toBe(true);
  });

  it("tripIdParamsSchema validates tripId", () => {
    const result = tripIdParamsSchema.safeParse({ tripId: "123_20240115" });
    expect(result.success).toBe(true);
  });

  it("dateRangeParamsSchema validates start and end dates", () => {
    const result = dateRangeParamsSchema.safeParse({
      startDate: "2024-01-01",
      endDate: "2024-01-31",
    });
    expect(result.success).toBe(true);
  });
});

describe("query parameter schemas", () => {
  describe("stationSearchQuerySchema", () => {
    it("accepts valid search query", () => {
      const result = stationSearchQuerySchema.safeParse({ q: "Times Square" });
      expect(result.success).toBe(true);
    });

    it("rejects empty search query", () => {
      const result = stationSearchQuerySchema.safeParse({ q: "" });
      expect(result.success).toBe(false);
    });

    it("rejects overly long search query", () => {
      const result = stationSearchQuerySchema.safeParse({ q: "a".repeat(101) });
      expect(result.success).toBe(false);
    });

    it("rejects HTML tags in search query", () => {
      const result = stationSearchQuerySchema.safeParse({ q: "<script>alert(1)</script>" });
      expect(result.success).toBe(false);
    });

    it("rejects event handlers in search query", () => {
      const result = stationSearchQuerySchema.safeParse({ q: "testonload=alert(1)" });
      expect(result.success).toBe(false);
    });
  });

  describe("commuteIdQuerySchema", () => {
    it("accepts valid commute ID", () => {
      const result = commuteIdQuerySchema.safeParse({ commuteId: "commute-1" });
      expect(result.success).toBe(true);
    });

    it("accepts optional commuteId", () => {
      const result = commuteIdQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("rejects invalid commute ID", () => {
      const result = commuteIdQuerySchema.safeParse({ commuteId: "invalid@id" });
      expect(result.success).toBe(false);
    });
  });

  describe("journalStatsQuerySchema", () => {
    it("accepts valid query with all parameters", () => {
      const result = journalStatsQuerySchema.safeParse({
        commuteId: "commute-1",
        startDate: "2024-01-01",
        endDate: "2024-01-31",
      });
      expect(result.success).toBe(true);
    });

    it("accepts query with only commuteId", () => {
      const result = journalStatsQuerySchema.safeParse({ commuteId: "commute-1" });
      expect(result.success).toBe(true);
    });

    it("accepts query with only dates", () => {
      const result = journalStatsQuerySchema.safeParse({
        startDate: "2024-01-01",
        endDate: "2024-01-31",
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty query", () => {
      const result = journalStatsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("rejects invalid date format", () => {
      const result = journalStatsQuerySchema.safeParse({
        startDate: "2024/01/01",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("emptyQuerySchema", () => {
    it("accepts empty object", () => {
      const result = emptyQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("rejects additional properties", () => {
      const result = emptyQuerySchema.safeParse({ extra: "param" });
      expect(result.success).toBe(false);
    });
  });

  describe("paginationQuerySchema", () => {
    it("accepts valid pagination parameters", () => {
      const result = paginationQuerySchema.safeParse({ limit: 10, offset: 0 });
      expect(result.success).toBe(true);
    });

    it("accepts optional pagination parameters", () => {
      const result = paginationQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("coerces string numbers to integers", () => {
      const result = paginationQuerySchema.safeParse({ limit: "10", offset: "5" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.limit).toBe("number");
        expect(typeof result.data.offset).toBe("number");
      }
    });

    it("enforces minimum limit of 1", () => {
      const result = paginationQuerySchema.safeParse({ limit: 0 });
      expect(result.success).toBe(false);
    });

    it("enforces maximum limit of 100", () => {
      const result = paginationQuerySchema.safeParse({ limit: 101 });
      expect(result.success).toBe(false);
    });

    it("enforces minimum offset of 0", () => {
      const result = paginationQuerySchema.safeParse({ offset: -1 });
      expect(result.success).toBe(false);
    });
  });

  describe("alertsQuerySchema", () => {
    it("accepts valid lineId filter", () => {
      const result = alertsQuerySchema.safeParse({ lineId: "1" });
      expect(result.success).toBe(true);
    });

    it("accepts valid activeOnly filter", () => {
      const result = alertsQuerySchema.safeParse({ activeOnly: "true" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.activeOnly).toBe("boolean");
      }
    });

    it("accepts empty query", () => {
      const result = alertsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("rejects invalid lineId", () => {
      const result = alertsQuerySchema.safeParse({ lineId: "invalid" });
      expect(result.success).toBe(false);
    });
  });

  describe("equipmentQuerySchema", () => {
    it("accepts valid stationId filter", () => {
      const result = equipmentQuerySchema.safeParse({ stationId: "123" });
      expect(result.success).toBe(true);
    });

    it("accepts valid type filter", () => {
      const types = ["elevator", "escalator", "all"];
      for (const type of types) {
        const result = equipmentQuerySchema.safeParse({ type });
        expect(result.success).toBe(true);
      }
    });

    it("accepts empty query", () => {
      const result = equipmentQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("rejects invalid type", () => {
      const result = equipmentQuerySchema.safeParse({ type: "invalid" });
      expect(result.success).toBe(false);
    });
  });

  describe("positionsQuerySchema", () => {
    it("accepts includeHistory flag", () => {
      const result = positionsQuerySchema.safeParse({ includeHistory: "true" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.includeHistory).toBe("boolean");
      }
    });

    it("accepts empty query", () => {
      const result = positionsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });
});
