# Real-World Usage Examples: createMockStation

**Helper Function:** `createMockStation(overrides?)`  
**Package:** `@mta-my-way/shared/testing`  
**Last Updated:** 2026-08-30

This document provides practical, real-world examples of how to use `createMockStation` in actual testing scenarios. Each example includes the problem context, the solution using `createMockStation`, and an explanation of why this approach works.

---

## Table of Contents

1. [Basic Examples](#basic-examples)
2. [Override Patterns](#override-patterns)
3. [Test Scenarios](#test-scenarios)
4. [Integration Patterns](#integration-patterns)

---

## Basic Examples

### Example 1: Quick Test Setup with Defaults

**Problem:** You need a station object quickly for a unit test and don't care about specific values.

```typescript
import { createMockStation } from "@mta-my-way/shared/testing";

describe("Station rendering", () => {
  it("displays station name", () => {
    const station = createMockStation();
    
    render(<StationCard station={station} />);
    expect(screen.getByText("Times Square-42 St")).toBeInTheDocument();
  });
});
```

**Why This Works:** `createMockStation()` with no arguments returns a fully-populated station object with sensible defaults (Times Square-42 St). This is perfect for tests where the specific station doesn't matter - you just need a valid station object.

---

### Example 2: Create a Station for a Specific Subway Line

**Problem:** You're testing line-specific features (like filtering by line or showing line colors) and need a station that only serves specific lines.

```typescript
import { createMockStation } from "@mta-my-way/shared/testing";

describe("Line filtering", () => {
  it("shows only stations serving the 1 train", () => {
    const southFerry = createMockStation({
      id: "101",
      name: "South Ferry",
      lines: ["1"],  // Terminal station - only the 1 train
      ada: true,
      borough: "manhattan"
    });

    const stations = [southFerry, createMockStation({ lines: ["2", "3"] })];
    const line1Stations = filterStationsByLine(stations, "1");
    
    expect(line1Stations).toHaveLength(1);
    expect(line1Stations[0].name).toBe("South Ferry");
  });
});
```

**Why This Works:** By overriding the `lines` array, you create a realistic station that serves only specific trains. This is essential for testing line filtering logic, line-specific UI features, and route calculations.

---

### Example 3: ADA Accessibility Testing

**Problem:** You need to test accessibility features and need both ADA-compliant and non-ADA stations.

```typescript
import { createMockStation } from "@mta-my-way/shared/testing";

describe("Accessibility features", () => {
  it("filters out non-ADA stations when accessibility mode is enabled", () => {
    const adaStation = createMockStation({ ada: true });
    const nonAdaStation = createMockStation({ 
      id: "401", 
      name: "Smith St-9 St",
      ada: false 
    });

    const allStations = [adaStation, nonAdaStation];
    const accessibleOnly = filterAdaStations(allStations);
    
    expect(accessibleOnly).toHaveLength(1);
    expect(accessibleOnly[0].ada).toBe(true);
    expect(accessibleOnly).not.toContain(nonAdaStation);
  });
});
```

**Why This Works:** The `ada` property controls station accessibility. By creating stations with both `ada: true` and `ada: false`, you can test filtering logic, accessibility indicators, and user preferences for accessible routes.

---

## Override Patterns

### Example 4: Override Multiple Related Fields

**Problem:** You need a station in a specific borough with correct coordinates.

```typescript
import { createMockStation } from "@mta-my-way/shared/testing";

describe("Location-based features", () => {
  it("calculates distance between Brooklyn stations", () => {
    const highSt = createMockStation({
      id: "234",
      name: "High St",
      lat: 40.7022,   // Brooklyn coordinates
      lon: -73.9894,
      lines: ["A", "C"],
      borough: "brooklyn"
    });

    const clarkSt = createMockStation({
      id: "235",
      name: "Clark St",
      lat: 40.6953,   // Brooklyn coordinates
      lon: -73.9909,
      lines: ["2", "3"],
      borough: "brooklyn"
    });

    const distance = calculateDistance(highSt, clarkSt);
    expect(distance).toBeGreaterThan(0); // ~0.78 km
  });
});
```

**Why This Works:** Coordinating multiple overrides (coordinates, borough, and lines) creates realistic station data for geographic calculations. This is essential for testing location-based features like "nearest station" or distance-based sorting.

---

### Example 5: Create a Transfer Hub

**Problem:** You're testing transfer logic and need a station with multiple transfer options.

```typescript
import { createMockStation } from "@mta-my-way/shared/testing";

describe("Transfer connections", () => {
  it("shows available transfers from a hub station", () => {
    const pennStation = createMockStation({
      id: "726",
      name: "34 St-Penn Station",
      lines: ["1", "2", "3"],
      transfers: [
        {
          toStationId: "727",
          toLines: ["A", "C", "E"],
          walkingSeconds: 180,
          accessible: true
        },
        {
          toStationId: "728",
          toLines: ["N", "Q", "R", "W"],
          walkingSeconds: 240,
          accessible: false
        }
      ],
      ada: true,
      borough: "manhattan"
    });

    const accessibleTransfers = pennStation.transfers.filter(t => t.accessible);
    expect(accessibleTransfers).toHaveLength(1);
    expect(accessibleTransfers[0].toLines).toContain("A");
  });
});
```

**Why This Works:** The `transfers` array defines transfer connections with walking times and accessibility info. This tests transfer discovery logic, accessible route planning, and multi-line journey features.

---

### Example 6: Create Related Stations for a Route

**Problem:** You're testing route calculation and need multiple stations that form a realistic route segment.

```typescript
import { createMockStation } from "@mta-my-way/shared/testing";

describe("Route calculation", () => {
  it("calculates stops between Times Square and Herald Square", () => {
    // Create stations along a realistic route
    const timesSquare = createMockStation({ id: "725", name: "Times Square-42 St" });
    const pennStation = createMockStation({ id: "726", name: "34 St-Penn Station" });
    const heraldSquare = createMockStation({
      id: "727",
      name: "34 St-Herald Sq",
      transfers: [
        { 
          toStationId: "728", 
          toLines: ["N", "Q", "R"], 
          walkingSeconds: 120, 
          accessible: true 
        }
      ]
    });

    const route = calculateRoute(timesSquare, heraldSquare);
    expect(route.stations).toEqual([timesSquare, pennStation, heraldSquare]);
    expect(route.totalStops).toBe(2);
  });
});
```

**Why This Works:** Creating multiple related stations with consistent IDs and realistic names allows you to test route planning algorithms, stop counting, and journey display logic.

---

## Test Scenarios

### Example 7: Testing Station Search Functionality

**Problem:** You need to test fuzzy search and autocomplete features with various station names.

```typescript
import { createMockStation } from "@mta-my-way/shared/testing";

describe("Station search", () => {
  it("returns stations matching partial search terms", () => {
    const stations = [
      createMockStation({ id: "725", name: "Times Square-42 St" }),
      createMockStation({ id: "726", name: "34 St-Penn Station" }),
      createMockStation({ id: "727", name: "34 St-Herald Sq" }),
      createMockStation({ id: "631", name: "Court Sq" }),
      createMockStation({ id: "237", name: "Atlantic Ave-Barclays Ctr" })
    ];

    // Test partial match
    const results = searchStations(stations, "34 st");
    expect(results).toHaveLength(2);
    expect(results.every(s => s.name.includes("34 St"))).toBe(true);

    // Test case-insensitive search
    const caseResults = searchStations(stations, "PENN");
    expect(caseResults).toHaveLength(1);
  });
});
```

**Why This Works:** Creating stations with diverse but realistic names (including hyphens, abbreviations, and varied formats) allows you to test search robustness, case sensitivity, and partial matching logic.

---

### Example 8: Testing Favorites and User Preferences

**Problem:** You're testing user favorites and need stations with specific characteristics for different use cases.

```typescript
import { createMockStation, createMockFavorite } from "@mta-my-way/shared/testing";

describe("User favorites", () => {
  it("saves favorite stations with custom labels", () => {
    const workStation = createMockStation({
      id: "726",
      name: "34 St-Penn Station",
      lines: ["1", "2", "3"],
      ada: true
    });

    const homeStation = createMockStation({
      id: "101",
      name: "South Ferry",
      lines: ["1"],
      borough: "manhattan"
    });

    const favorite = createMockFavorite({
      id: "fav_1",
      stationId: workStation.id,
      stationName: workStation.name,
      lines: workStation.lines,
      label: "Work",
      direction: "both"
    });

    expect(favorite.label).toBe("Work");
    expect(favorite.lines).toContain("1");
  });
});
```

**Why This Works:** Combining `createMockStation` with `createMockFavorite` creates complete test data for user preference features. This tests favorite management, quick access buttons, and personalized station lists.

---

### Example 9: Testing Real-Time Arrivals with Station Context

**Problem:** You need to test arrival display features that depend on station characteristics (like showing platform information).

```typescript
import { createMockStation, createMockArrival } from "@mta-my-way/shared/testing";

describe("Arrival display", () => {
  it("shows arrivals with platform information for accessible stations", () => {
    const station = createMockStation({
      id: "725",
      name: "Times Square-42 St",
      lines: ["1", "2", "3"],
      ada: true
    });

    const arrivals = [
      createMockArrival({ 
        line: "1", 
        direction: "N", 
        minutesAway: 2,
        destination: "Van Cortlandt Park"
      }),
      createMockArrival({ 
        line: "2", 
        direction: "N", 
        minutesAway: 5,
        destination: "Wakefield"
      })
    ];

    const result = formatArrivals(station, arrivals);
    expect(result).toContain("Northbound");
    expect(result).toContain("2 min");
    expect(result).toContain("5 min");
  });
});
```

**Why This Works:** Combining mock stations with mock arrivals creates realistic arrival display scenarios. This tests countdown timers, direction indicators, and platform-specific features.

---

## Integration Patterns

### Example 10: Setting Up Test Fixtures for Component Testing

**Problem:** You're testing a React component that displays station information and need consistent test data across multiple tests.

```typescript
import { createMockStation } from "@mta-my-way/shared/testing";

// Define test fixtures at the top of your test file
const TIMES_SQUARE = createMockStation({ 
  id: "725", 
  name: "Times Square-42 St" 
});

const PENN_STATION = createMockStation({ 
  id: "726", 
  name: "34 St-Penn Station" 
});

const SOUTH_FERRY = createMockStation({ 
  id: "101", 
  name: "South Ferry", 
  lines: ["1"] 
});

describe("StationList component", () => {
  it("renders all stations", () => {
    const stations = [TIMES_SQUARE, PENN_STATION, SOUTH_FERRY];
    render(<StationList stations={stations} />);
    
    expect(screen.getByText("Times Square-42 St")).toBeInTheDocument();
    expect(screen.getByText("34 St-Penn Station")).toBeInTheDocument();
    expect(screen.getByText("South Ferry")).toBeInTheDocument();
  });

  it("filters stations by line", () => {
    const stations = [TIMES_SQUARE, PENN_STATION, SOUTH_FERRY];
    render(<StationList stations={stations} filterLine="1" />);
    
    expect(screen.getByText("South Ferry")).toBeInTheDocument();
    expect(screen.queryByText("Penn Station")).not.toBeInTheDocument();
  });
});
```

**Why This Works:** Defining stations as constants at the top of your test file ensures consistency across tests and makes tests more readable. When you need to modify a station, you change it in one place.

---

### Example 11: Testing Database Operations with Mock Stations

**Problem:** You're testing database code that persists and retrieves station data.

```typescript
import { createMockStation, createMockDatabase } from "@mta-my-way/shared/testing";

describe("Station repository", () => {
  it("saves and retrieves stations", async () => {
    const db = createMockDatabase();
    const repository = new StationRepository(db);

    const station = createMockStation({
      id: "999",
      name: "Test Station",
      lines: ["1"],
      borough: "manhattan"
    });

    await repository.save(station);
    const retrieved = await repository.findById("999");

    expect(retrieved).toEqual(station);
  });

  it("queries stations by borough", async () => {
    const db = createMockDatabase();
    db._setData("stations", [
      createMockStation({ id: "725", borough: "manhattan" }),
      createMockStation({ id: "234", borough: "brooklyn" }),
      createMockStation({ id: "501", borough: "queens" })
    ]);

    const repository = new StationRepository(db);
    const brooklynStations = await repository.findByBorough("brooklyn");

    expect(brooklynStations).toHaveLength(1);
    expect(brooklynStations[0].id).toBe("234");
  });
});
```

**Why This Works:** Combining `createMockStation` with `createMockDatabase` allows you to test data persistence logic without a real database. The `_setData` helper populates the mock database with test stations.

---

### Example 12: Testing API Responses with Station Data

**Problem:** You're testing API endpoints that return station information.

```typescript
import { createMockStation, createMockResponse } from "@mta-my-way/shared/testing";

describe("Station API", () => {
  it("returns station details", async () => {
    const station = createMockStation({
      id: "725",
      name: "Times Square-42 St",
      lines: ["1", "2", "3", "7", "N", "Q", "R", "W"]
    });

    const mockResponse = createMockResponse({
      status: "success",
      data: station
    }, 200);

    // Mock the fetch call
    global.fetch = vi.fn(() => Promise.resolve(mockResponse));

    const result = await fetchStation("725");
    
    expect(result.name).toBe("Times Square-42 St");
    expect(result.lines).toHaveLength(8);
  });
});
```

**Why This Works:** Using `createMockStation` to generate API response data ensures your mock responses match the exact structure of real API responses. This tests response parsing, error handling, and data validation.

---

## Summary: When to Use Each Pattern

| Scenario | Pattern | Example Reference |
|----------|---------|-------------------|
| **Quick unit test** | Use defaults (`createMockStation()`) | Example 1 |
| **Line-specific features** | Override `lines` array | Example 2 |
| **Accessibility testing** | Override `ada` property | Example 3 |
| **Geographic features** | Override `lat`, `lon`, `borough` together | Example 4 |
| **Transfer logic** | Populate `transfers` array | Example 5 |
| **Route calculation** | Create multiple related stations | Example 6 |
| **Search/autocomplete** | Create stations with varied names | Example 7 |
| **User preferences** | Combine with `createMockFavorite` | Example 8 |
| **Arrival display** | Combine with `createMockArrival` | Example 9 |
| **Component testing** | Define station constants as fixtures | Example 10 |
| **Database testing** | Combine with `createMockDatabase` | Example 11 |
| **API testing** | Use for mock response data | Example 12 |

---

## Best Practices

1. **Define reusable fixtures** at the top of your test file for stations used across multiple tests
2. **Override only what you need** - let defaults handle the rest
3. **Maintain consistency** - if you override `id`, also override `northStopId` and `southStopId`
4. **Use real station IDs** when possible (e.g., "725" for Times Square) for authenticity
5. **Combine with other helpers** like `createMockArrival`, `createMockFavorite` for complete test scenarios
6. **Test edge cases** by creating stations with minimal lines, no transfers, or non-ADA status

---

## Related Documentation

- [Test Helpers Reference](./test-helpers-reference.md) - Complete API documentation
- [Test Helpers Inventory](./test-helpers-inventory.md) - All available test helpers
- [Test Helpers Types](./test-helpers-types.md) - TypeScript type definitions
