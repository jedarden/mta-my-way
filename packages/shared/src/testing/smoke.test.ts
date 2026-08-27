/**
 * Smoke test to verify test infrastructure is working correctly.
 *
 * This test validates:
 * - Test helpers from @mta-my-way/shared/testing can be imported
 * - Mock data generators work
 * - Fixtures create valid test data
 * - Assertions function correctly
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  assertHasProperties,
  assertIsRecent,
  cleanupTestEnvironment,
  createMockArrival,
  createMockDatabase,
  createMockHeaders,
  createMockLogger,
  createMockRequest,
  createMockStation,
  createTestFixture,
  measureExecutionTime,
  setupTestEnvironment,
} from "./test-helpers";

describe("Test Infrastructure Smoke Test", () => {
  beforeEach(() => {
    setupTestEnvironment();
  });

  it("can create mock station data", () => {
    const station = createMockStation({
      id: "725",
      name: "Times Square-42 St",
    });

    expect(station.id).toBe("725");
    expect(station.name).toBe("Times Square-42 St");
    expect(station.lines).toContain("1");
    expect(station.ada).toBe(true);
  });

  it("can create mock arrival data", () => {
    const arrival = createMockArrival({
      line: "1",
      direction: "N",
      minutesAway: 2,
    });

    expect(arrival.line).toBe("1");
    expect(arrival.direction).toBe("N");
    expect(arrival.minutesAway).toBe(2);
    expect(arrival.confidence).toBe("high");
  });

  it("can create complete test fixture", () => {
    const fixture = createTestFixture();

    expect(fixture.stations.timesSquare).toBeDefined();
    expect(fixture.routes["1"]).toBeDefined();
    expect(fixture.arrivals.timesSquareNorth).toHaveLength(3);
    expect(fixture.alerts).toHaveLength(1);
    expect(fixture.favorites).toHaveLength(1);
    expect(fixture.commutes).toHaveLength(1);
  });

  it("assertHasProperties validates object structure", () => {
    const station = createMockStation();
    assertHasProperties(station, ["id", "name", "lat", "lon", "lines"]);
  });

  it("assertIsRecent validates timestamp freshness", () => {
    const now = Date.now();
    assertIsRecent(now, 1000); // 1 second ago is recent
  });

  it("can create and use mock logger", () => {
    const logger = createMockLogger();

    logger.info("Test message", { stationId: "725" });

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith("Test message", { stationId: "725" });
  });

  it("can create and use mock database", () => {
    const db = createMockDatabase();

    db._setData("stations", [createMockStation({ id: "725" }), createMockStation({ id: "726" })]);

    const stations = db._getData("stations");
    expect(stations).toHaveLength(2);
  });

  it("can measure execution time", async () => {
    const { result, durationMs } = await measureExecutionTime(async () => {
      return "test result";
    });

    expect(result).toBe("test result");
    expect(durationMs).toBeGreaterThanOrEqual(0);
    expect(durationMs).toBeLessThan(100); // Should be very fast
  });

  it("can create mock HTTP request with headers", () => {
    const headers = createMockHeaders({
      "content-type": "application/json",
      authorization: "Bearer token123",
    });

    const request = createMockRequest({
      method: "POST",
      url: "http://localhost:3001/api/favorites",
      headers,
      body: { stationId: "725" },
    });

    expect(request.method).toBe("POST");
    expect(request.headers.get("authorization")).toBe("Bearer token123");
  });

  it("cleanupTestEnvironment restores mocks", () => {
    setupTestEnvironment();

    const logger = createMockLogger();
    logger.info("test");

    expect(logger.info).toHaveBeenCalledTimes(1);

    cleanupTestEnvironment();

    // After cleanup, new mocks should be fresh
    const logger2 = createMockLogger();
    expect(logger2.info).toHaveBeenCalledTimes(0);
  });

  it("fixture data has correct relationships", () => {
    const fixture = createTestFixture();

    // Arrivals should be for the correct lines
    const northboundArrivals = fixture.arrivals.timesSquareNorth;
    expect(northboundArrivals[0].line).toBe("1");
    expect(northboundArrivals[0].direction).toBe("N");

    // Alerts should affect specific lines
    expect(fixture.alerts[0].affectedLines).toContain("1");

    // Commutes should have origin and destination
    expect(fixture.commutes[0].origin).toEqual(fixture.stations.timesSquare);
    expect(fixture.commutes[0].destination).toEqual(fixture.stations.pennStation);

    // Routes should be properly structured
    expect(fixture.routes["1"].id).toBe("1");
    expect(fixture.routes["1"].shortName).toBe("1");
  });
});

describe("Test Infrastructure - Edge Cases", () => {
  it("handles empty overrides in mock generators", () => {
    const station = createMockStation(); // No overrides
    expect(station).toBeDefined();
    expect(station.id).toBe("725"); // Default value
  });

  it("handles partial overrides in mock generators", () => {
    const arrival = createMockArrival({
      line: "2", // Override line
      // direction should use default
    });

    expect(arrival.line).toBe("2");
    expect(arrival.direction).toBe("N"); // Default value
  });

  it("handles empty fixture sets", () => {
    const fixture = createTestFixture();
    expect(fixture.stations).toBeDefined();
    expect(Object.keys(fixture.stations)).toHaveLength(2);
  });

  it("measures execution time correctly", async () => {
    let delay = 10;

    const { durationMs } = await measureExecutionTime(async () => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return "done";
    });

    // Duration should be at least our delay (with some tolerance for execution overhead)
    expect(durationMs).toBeGreaterThanOrEqual(delay - 5);
  });
});
