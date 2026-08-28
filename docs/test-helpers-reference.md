# Test Helpers Reference

**Package:** `@mta-my-way/shared/testing`  
**Directory:** `packages/shared/src/testing/`  
**Last Updated:** 2026-08-27

This document provides detailed API reference documentation for all test helper functions in the MTA My Way shared testing package, including signatures, parameters, return types, usage examples, and edge cases.

---

## Table of Contents

1. [Core Test Helpers (`test-helpers.ts`)](#core-test-helpers-test-helpersts)
2. [Observability Testing Helpers (`observability-helpers.ts`)](#observability-testing-helpers-observability-helpersts)
3. [Security Testing Helpers (`security-helpers.ts`)](#security-testing-helpers-security-helpersts)

---

## Core Test Helpers (`test-helpers.ts`)

### Mock Data Generators

#### `createMockStation(overrides?)`

Creates a mock subway station object with default properties matching NYC subway GTFS data structure.

**Signature:**
```typescript
function createMockStation(overrides?: Partial<Station>): Station
```

**Parameters:**
- `overrides` (optional): Partial station properties to override defaults. Uses spread syntax (`...overrides`) to merge with defaults. Accepts any subset of Station properties:
  - `id?: string` - GTFS station ID (3-digit codes like "725" for Times Square)
  - `name?: string` - Station display name (e.g., "Times Square-42 St")
  - `lat?: number` - Latitude coordinate (NYC range: 40.5-40.9)
  - `lon?: number` - Longitude coordinate (NYC range: -74.3 to -73.7)
  - `lines?: string[]` - Subway lines serving this station (e.g., ["1", "2", "3"])
  - `northStopId?: string` - GTFS stop ID for northbound platform (typically `{id}N`)
  - `southStopId?: string` - GTFS stop ID for southbound platform (typically `{id}S`)
  - `transfers?: TransferConnection[]` - Array of transfer connections to other stations
  - `complex?: string` - Station complex ID for multi-entrance stations (e.g., "725")
  - `ada?: boolean` - ADA wheelchair accessibility flag
  - `borough?: Borough` - NYC borough type: "manhattan" | "brooklyn" | "queens" | "bronx" | "statenisland"

**Returns:**
- `Station` object matching the `@mta-my-way/shared/types` Station interface:
  - `id: string` - Station GTFS ID (default: `"725"` - Times Square)
  - `name: string` - Station name (default: `"Times Square-42 St"`)
  - `lat: number` - Latitude coordinate (default: `40.7589`)
  - `lon: number` - Longitude coordinate (default: `-73.9851`)
  - `lines: string[]` - Lines serving this station (default: `["1", "2", "3", "7", "N", "Q", "R", "W"]`)
  - `northStopId: string` - Northbound platform stop ID (default: `"725N"`)
  - `southStopId: string` - Southbound platform stop ID (default: `"725S"`)
  - `transfers: TransferConnection[]` - Transfer connections (default: `[]`)
  - `complex?: string` - Station complex ID (default: `undefined`)
  - `ada: boolean` - ADA accessible (default: `true`)
  - `borough: Borough` - NYC borough (default: `"manhattan"`)

**Usage Examples:**

```typescript
// Basic usage - single station with minimal overrides
const station = createMockStation({
  id: "101",
  name: "South Ferry",
  lines: ["1"],
  ada: true
});

// Create a Brooklyn station
const brooklynStation = createMockStation({
  id: "237",
  name: "Atlantic Ave-Barclays Ctr",
  lat: 40.6855,
  lon: -73.9771,
  lines: ["2", "3", "4", "5", "B", "D", "N", "Q", "R"],
  borough: "brooklyn",
  ada: true
});

// Create a transfer station with connections
const transferStation = createMockStation({
  id: "R20",
  name: "Flushing-Main St",
  lines: ["7"],
  transfers: [
    {
      toStationId: "L16",
      toLines: ["L"],
      walkingSeconds: 420,
      accessible: true
    }
  ]
});

// Create non-ADA accessible station
const noAdaStation = createMockStation({
  id: "D14",
  name: "West 4 St",
  lines: ["A", "B", "C", "D", "E", "F", "M"],
  ada: false,
  transfers: [
    {
      toStationId: "621",
      toLines: ["1", "2", "3"],
      walkingSeconds: 180,
      accessible: false
    }
  ]
});

// Create Queens terminal station
const queensStation = createMockStation({
  id: "H03",
  name: "Jamaica-179 St",
  lat: 40.7577,
  lon: -73.9311,
  lines: ["E"],
  borough: "queens",
  ada: true
});

// Override merging - shallow merge via spread syntax
const station2 = createMockStation({
  id: "102",
  name: "Wall St",
  lines: ["2", "3"]  // Replaces entire lines array, doesn't merge
});
// Result: id="102", name="Wall St", lines=["2","3"], lat=40.7589 (default preserved)
```

**Real-World NYC Station Patterns:**

```typescript
// Terminal stations (end of line)
const terminalStation = createMockStation({
  id: "101",
  name: "South Ferry",
  lines: ["1"],
  transfers: [] // Terminal stations typically have no transfers
});

// Major transfer hubs (Times Square, Atlantic Ave, etc.)
const transferHub = createMockStation({
  id: "725",
  name: "Times Square-42 St",
  lines: ["1", "2", "3", "7", "N", "Q", "R", "W"],
  transfers: [
    { toStationId: "628", toLines: ["A", "C", "E"], walkingSeconds: 300, accessible: true },
    { toStationId: "621", toLines: ["S"], walkingSeconds: 120, accessible: true }
  ],
  ada: true
});

// Express-only stations
const expressStation = createMockStation({
  id: "635",
  name: "14 St",
  lines: ["A", "C", "E", "L"], // No local 1/2/3 service
  ada: true
});

// Borough-specific patterns
const bronxStation = createMockStation({
  id: "702",
  name: "Fordham Rd",
  lines: ["D", "4"],
  borough: "bronx",
  ada: true
});

// Multi-entrance station complexes (stations with multiple entrances/exits)
const timesSquareComplex = createMockStation({
  id: "725",
  name: "Times Square-42 St",
  lines: ["1", "2", "3", "7", "N", "Q", "R", "W"],
  complex: "725",  // All entrances share this complex ID
  transfers: [
    { toStationId: "628", toLines: ["A", "C", "E"], walkingSeconds: 300, accessible: true },
    { toStationId: "621", toLines: ["S"], walkingSeconds: 120, accessible: true }
  ],
  ada: true,
  borough: "manhattan"
});

// Complex with multiple parent stations (e.g., Columbus Circle)
const columbusCircle = createMockStation({
  id: "623",
  name: "59 St-Columbus Circle",
  lines: ["A", "B", "C", "D", "1"],
  complex: "623",
  transfers: [
    { toStationId: "624", toLines: ["2", "3"], walkingSeconds: 180, accessible: true }
  ],
  ada: true,
  borough: "manhattan"
});

// Express-local transfer stations (same line, different service)
const expressLocalTransfer = createMockStation({
  id: "635",
  name: "14 St",
  lines: ["A", "C", "E", "L"],  // A/C/E express, L local
  transfers: [
    { toStationId: "632", toLines: ["1", "2", "3"], walkingSeconds: 240, accessible: true }
  ],
  ada: true,
  borough: "manhattan"
});
```

**Common Testing Patterns:**

```typescript
// Test data setup for station search
const searchResults = [
  createMockStation({ id: "725", name: "Times Square" }),
  createMockStation({ id: "726", name: "34 St-Penn Station" }),
  createMockStation({ id: "727", name: "42 St-Port Authority" })
];

// Test arrival data with station context
const timesSquare = createMockStation({
  id: "725",
  name: "Times Square-42 St",
  lines: ["1", "2", "3"]
});

const arrivals = [
  createMockArrival({ line: "1", destination: "South Ferry" }),
  createMockArrival({ line: "2", destination: "Flatbush Ave" })
];

// Test favorites with station
const favorite = createMockFavorite({
  stationId: timesSquare.id,
  stationName: timesSquare.name,
  lines: ["1", "2", "3"]
});

// Test ADA accessibility filtering
const adaStations = [
  createMockStation({ id: "101", name: "South Ferry", ada: true }),
  createMockStation({ id: "102", name: "Clark St", ada: false })
].filter(s => s.ada);
```

**Edge Cases & Gotchas:**

- **Override merging is shallow**: Uses spread syntax (`...overrides`), so nested objects/arrays are replaced, not merged
  ```typescript
  const station = createMockStation({ lines: ["1", "2"] });
  // Result: lines=["1","2"], NOT ["1","2","3","7","N","Q","R","W"]
  ```

- **Lines array override**: Providing `lines` replaces the entire array - doesn't merge with defaults
  ```typescript
  // If you want to ADD lines, you must specify all of them
  const bad = createMockStation({ lines: ["L"] });  // Only has L, lost all default lines
  const good = createMockStation({ lines: ["7", "N", "Q", "R", "W", "L"] });  // Has all needed lines
  ```

- **Transfers structure**: If overriding `transfers`, must provide complete array with proper `TransferConnection` structure (from `@mta-my-way/shared/types`)
  ```typescript
  const transferStation = createMockStation({
    transfers: [{
      toStationId: "726",        // Required: target station GTFS ID
      toLines: ["A", "C"],       // Required: lines available at transfer
      walkingSeconds: 300,       // Optional: walking time in seconds
      accessible: true           // Optional: ADA-compliant transfer path
    }]
  });
  ```

- **Station IDs**: Use real MTA GTFS station IDs for realistic tests
  - Manhattan: `725` (Times Square), `726` (Penn Station), `621` (Grand Central)
  - Brooklyn: `237` (Atlantic Ave), `R16` (Court St), `D14` (Pacific St)
  - Queens: `H03` (Jamaica), `G05` (Court Sq), `R23` (Flushing)
  - Bronx: `702` (Fordham Rd), `619` (161 St-Yankee Stadium)

- **Coordinates**: `lat`/`lon` should be within NYC bounds for geolocation tests
  - Manhattan: `lat: 40.70-40.88`, `lon: -74.02--73.92`
  - Brooklyn: `lat: 40.57-40.70`, `lon: -74.04--73.83`
  - Queens: `lat: 40.54-40.78`, `lon: -73.92--73.70`
  - Bronx: `lat: 40.78-40.92`, `lon: -73.93--73.76`

- **Stop ID conventions**: North/south stop IDs typically follow pattern `{stationId}N` and `{stationId}S`
  - Override if testing stop-specific logic (e.g., platform-specific arrivals)

- **Borough values**: Must use lowercase: `"manhattan"`, `"brooklyn"`, `"queens"`, `"bronx"`
  - Used for borough-based filtering and analytics

- **Type safety**: Returns `Record<string, unknown>`, not typed `Station` interface
  - TypeScript won't enforce Station shape at compile time
  - Use in tests where runtime validation or duck typing is acceptable

- **Timestamp independence**: No timestamps in station objects - safe to use without time mocking
  - Stations are static data - no `createdAt`, `updatedAt`, or temporal fields

- **Transfer path accessibility**: Mark transfers as `accessible: false` to test ADA routing
  ```typescript
  const inaccessibleTransfer = createMockStation({
    transfers: [{
      toStationId: "726",
      toLines: ["A", "C"],
      walkingSeconds: 180,
      accessible: false  // No elevator, stairs only
    }]
  });
  ```

- **Multiple line transfers**: A transfer can provide access to multiple lines
  ```typescript
  const multiLineTransfer = createMockStation({
    transfers: [{
      toStationId: "237",  // Atlantic Ave
      toLines: ["2", "3", "4", "5", "B", "D", "N", "Q", "R"],  // 9 lines available
      walkingSeconds: 300,
      accessible: true
    }]
  });
  ```

---

#### `createMockRoute(overrides?)`

Creates a mock subway route object.

**Signature:**
```typescript
function createMockRoute(overrides?: Record<string, unknown>): Record<string, unknown>
```

**Parameters:**
- `overrides` (optional): Partial route properties to override defaults. Uses spread syntax (`...overrides`) to merge with defaults.

**Returns:**
- `Record<string, unknown>` object with properties:
  - `id: string` - Route GTFS ID (default: `"1"`)
  - `shortName: string` - Short route name (default: `"1"`)
  - `longName: string` - Full route name (default: `"Broadway-7th Ave Local"`)
  - `color: string` - Hex color for UI (default: `"#EE352E"`)
  - `textColor: string` - Text contrast color (default: `"#FFFFFF"`)
  - `feedId: string` - GTFS feed source (default: `"gtfs"`)
  - `division: string` - Division code (default: `"A"`)
  - `stops: string[]` - Station IDs on route (default: `["101", "102", "103"]`)
  - `isExpress: boolean` - Express service flag (default: `false`)

**Example:**
```typescript
// Create an express route
const expressRoute = createMockRoute({
  id: "2",
  shortName: "2",
  longName: "7th Ave Express",
  isExpress: true,
  color: "#EE352E"  // Same color as 1 train
});

// Create a route with custom stops
const localRoute = createMockRoute({
  id: "1",
  stops: ["725", "726", "727", "728", "729", "730"]  // Times Square to 14 St
});

// Override division for IND/BMT lines
const indRoute = createMockRoute({
  id: "A",
  shortName: "A",
  longName: "8 Ave Express",
  division: "B",  // IND division
  color: "#0039A6"
});
```

**Edge Cases & Gotchas:**
- **Stops array**: Providing `stops` replaces the entire array - use real station IDs from GTFS data
- **Express vs Local**: Set `isExpress: true` for express routes - affects UI rendering and trip planning
- **Color codes**: Use official MTA line colors for consistency (1: `#EE352E`, A: `#0039A6`, etc.)
- **Division codes**: `"A"` = IRT, `"B"` = IND/BMT - affects some system behaviors
- **Route IDs**: Must match GTFS route IDs (numeric for IRT, letters for IND/BMT)
- **Override merging**: Shallow merge - nested arrays (stops) are completely replaced
- **Type safety**: Returns `Record<string, unknown>`, not typed `Route` interface

---

#### `createMockArrival(overrides?)`

Creates a mock train arrival object.

**Signature:**
```typescript
function createMockArrival(overrides?: Record<string, unknown>): Record<string, unknown>
```

**Parameters:**
- `overrides` (optional): Partial arrival properties to override defaults. Uses spread syntax (`...overrides`) to merge with defaults.

**Returns:**
- `Record<string, unknown>` object with properties:
  - `line: string` - Line identifier (default: `"1"`)
  - `direction: "N" | "S"` - Direction (default: `"N"`)
  - `arrivalTime: number` - Unix timestamp (default: `Date.now() + 120000` = 2 minutes from now)
  - `minutesAway: number` - Minutes until arrival (default: `2`)
  - `isAssigned: boolean` - Trip assignment status (default: `true`)
  - `isRerouted: boolean` - Reroute status (default: `false`)
  - `tripId: string` - GTFS trip ID (default: `"trip_123"`)
  - `destination: string` - Destination station name (default: `"Van Cortlandt Park"`)
  - `confidence: "high" | "medium" | "low"` - Data confidence (default: `"high"`)
  - `feedName: string` - Feed source (default: `"gtfs"`)
  - `feedAge: number` - Feed staleness in seconds (default: `8`)

**Example:**
```typescript
// Create a southbound arrival
const arrival = createMockArrival({
  line: "A",
  direction: "S",
  minutesAway: 5,
  confidence: "medium"
});

// Create an arrival with custom destination
const arrival2 = createMockArrival({
  line: "2",
  destination: "New Lots Ave",
  minutesAway: 12
});

// Create a low-confidence arrival (stale data)
const staleArrival = createMockArrival({
  line: "1",
  confidence: "low",
  feedAge: 45,  // 45 seconds old
  arrivalTime: Date.now() + 60000  // 1 minute away
});

// Create an unassigned trip
const unassigned = createMockArrival({
  isAssigned: false,
  tripId: "unassigned_trip"
});
```

**Edge Cases & Gotchas:**
- **Timestamp coupling**: `arrivalTime` uses `Date.now()` at call time - not stable across tests unless time is mocked
- **Time inconsistency**: `minutesAway` and `arrivalTime` can become inconsistent - ensure they match if overriding both
- **Direction type**: Must be literal type `"N"` or `"S"` - string values like `"north"` will fail type checks
- **Confidence levels**: `"low"` confidence may trigger UI warnings or different display behavior
- **Feed age**: Should be < 60 seconds for realistic live data; > 60s suggests stale feed
- **Trip assignments**: `isAssigned: false` means trip ID is unreliable (train not yet assigned by dispatch)
- **Rerouted trains**: Set `isRerouted: true` to simulate trains on different tracks than usual
- **Destination names**: Use real MTA destination names for realism (e.g., "Van Cortlandt Park", "New Lots Ave")
- **Type safety**: Returns `Record<string, unknown>`, not typed `Arrival` interface

---

#### `createMockAlert(overrides?)`

Creates a mock service alert object.

**Signature:**
```typescript
function createMockAlert(overrides?: Record<string, unknown>): Record<string, unknown>
```

**Parameters:**
- `overrides` (optional): Partial alert properties to override defaults. Uses spread syntax (`...overrides`) to merge with defaults.

**Returns:**
- `Record<string, unknown>` object with properties:
  - `id: string` - Alert unique ID (default: `"alert_123"`)
  - `severity: "info" | "warning" | "severe"` - Alert level (default: `"warning"`)
  - `headline: string` - Alert headline (default: `"Delays on 1 train"`)
  - `description: string` - Full description (default: `"1 trains running with delays due to signal problems"`)
  - `affectedLines: string[]` - Lines impacted (default: `["1"]`)
  - `activePeriod: { start: number, end: number }` - Active window with start/end timestamps
  - `cause: string` - GTFS cause code (default: `"SIGNAL_PROBLEM"`)
  - `effect: string` - GTFS effect code (default: `"DELAY"`)

**Example:**
```typescript
// Create a severe service suspension
const suspension = createMockAlert({
  id: "alert_suspension",
  severity: "severe",
  headline: "No 1 train service",
  description: "No 1 train service between 14 St and Chambers St due to signal problems",
  affectedLines: ["1"],
  cause: "SIGNAL_PROBLEM",
  effect: "SUSPENDED"
});

// Create a planned work alert
const plannedWork = createMockAlert({
  id: "alert_planned",
  severity: "info",
  headline: "Planned Work",
  description: "1 trains run local in both directions due to track maintenance",
  affectedLines: ["1", "2", "3"],
  activePeriod: {
    start: Date.now() + 86400000,  // Starts tomorrow
    end: Date.now() + 172800000     // Ends in 2 days
  },
  cause: "CONSTRUCTION",
  effect: "SIGNIFICANT_DELAYS"
});

// Create an active delay
const activeDelay = createMockAlert({
  severity: "warning",
  headline: "Delays",
  affectedLines: ["A", "C"],
  activePeriod: {
    start: Date.now() - 3600000,   // Started 1 hour ago
    end: Date.now() + 3600000      // Ends in 1 hour
  }
});
```

**Edge Cases & Gotchas:**
- **Timestamp coupling**: `activePeriod.start` and `activePeriod.end` use `Date.now()` at call time - not stable across tests
- **Active window logic**: Start can be in past (already active) or future (scheduled); end must be > start
- **Severity affects UI**: `"severe"` alerts may trigger notifications, banners, or special UI treatment
- **Affected lines array**: Providing `affectedLines` replaces entire array - doesn't merge with defaults
- **GTFS codes**: Use valid GTFS cause codes (SIGNAL_PROBLEM, CONSTRUCTION, POLICE_ACTIVITY, etc.)
- **GTFS effects**: Use valid GTFS effect codes (DELAY, SUSPENDED, SIGNIFICANT_DELAYS, etc.)
- **Multiple lines**: Can alert multiple lines simultaneously - useful for corridor-wide issues
- **Override merging**: Nested `activePeriod` object is replaced entirely, not merged
- **Type safety**: Returns `Record<string, unknown>`, not typed `Alert` interface

**Example:**
```typescript
const severeAlert = createMockAlert({
  id: "alert_456",
  severity: "severe",
  headline: "No 1 train service",
  affectedLines: ["1", "2", "3"],
  activePeriod: {
    start: Date.now() - 3600000,
    end: Date.now() + 7200000
  }
});
```

**Edge Cases:**
- `activePeriod.start` can be in past (already active) or future (scheduled)
- `activePeriod.end` should be > `start` for valid window
- `severity` affects UI prioritization and notifications
- `cause` and `effect` should be valid GTFS codes

---

#### `createMockFavorite(overrides?)`

Creates a mock favorite station object for user quick access.

**Signature:**
```typescript
function createMockFavorite(overrides?: Record<string, unknown>): Record<string, unknown>
```

**Parameters:**
- `overrides` (optional): Partial favorite properties to override defaults. Uses spread syntax (`...overrides`) to merge with defaults.

**Returns:**
- `Record<string, unknown>` object with properties:
  - `id: string` - Favorite unique ID (default: `"fav_123"`)
  - `stationId: string` - Station GTFS ID (default: `"725"`)
  - `stationName: string` - Station name (default: `"Times Square-42 St"`)
  - `lines: string[]` - Lines to show (default: `["1", "2", "3"]`)
  - `direction: "N" | "S" | "both"` - Direction filter (default: `"both"`)
  - `sortOrder: number` - Display order (default: `0`)
  - `label: string` - User label (default: `"Work"`)

**Example:**
```typescript
// Create a home favorite with northbound only
const home = createMockFavorite({
  id: "fav_home",
  stationId: "101",
  stationName: "South Ferry",
  label: "Home",
  direction: "N",
  sortOrder: 0,
  lines: ["1"]
});

// Create a work favorite with all directions
const work = createMockFavorite({
  id: "fav_work",
  stationId: "725",
  stationName: "Times Square-42 St",
  label: "Work",
  direction: "both",
  sortOrder: 1,
  lines: ["1", "2", "3", "7", "N", "Q", "R", "W"]
});

// Create a favorite with specific lines only
const selective = createMockFavorite({
  stationId: "726",
  stationName: "34 St-Penn Station",
  label: "Penn Station",
  direction: "both",
  lines: ["A", "C", "E"]  // Only ACE lines, not 1/2/3
});

// Override sortOrder to change display priority
const priority = createMockFavorite({
  label: "Gym",
  sortOrder: -1  // Shows first (lower = higher priority)
});
```

**Edge Cases & Gotchas:**
- **Direction type**: Must be literal type `"N"`, `"S"`, or `"both"` - string values like `"north"` will fail type checks
- **Sort order**: Lower numbers display first (higher priority); can be negative for top priority
- **Lines filtering**: `lines` array filters which lines to show - should be subset of station's available lines
- **Station consistency**: `stationId` and `stationName` should match real GTFS data
- **Direction filtering**: `"N"` shows only northbound, `"S"` only southbound, `"both"` shows both
- **Override merging**: Providing `lines` replaces entire array - doesn't merge with defaults
- **Duplicate labels**: Multiple favorites can have same label (not unique constraint in mock)
- **Type safety**: Returns `Record<string, unknown>`, not typed `Favorite` interface
- **Display ordering**: UI sorts by `sortOrder` ascending, then by `label` alphabetically

---

#### `createMockCommute(overrides?)`

Creates a mock commute object for trip planning and transfer suggestions.

**Signature:**
```typescript
function createMockCommute(overrides?: Record<string, unknown>): Record<string, unknown>
```

**Parameters:**
- `overrides` (optional): Partial commute properties to override defaults. Uses spread syntax (`...overrides`) to merge with defaults.

**Returns:**
- `Record<string, unknown>` object with properties:
  - `id: string` - Commute unique ID (default: `"commute_123"`)
  - `name: string` - Commute name (default: `"Work"`)
  - `origin: Station` - Origin station (uses `createMockStation()` internally)
  - `destination: Station` - Destination station (uses `createMockStation()` internally)
  - `preferredLines: string[]` - Preferred lines (default: `["1", "2", "3"]`)
  - `enableTransferSuggestions: boolean` - Transfer hints (default: `true`)

**Example:**
```typescript
// Create a simple commute with defaults
const commute = createMockCommute({
  name: "Home to Office"
});

// Create a commute with custom stations
const customCommute = createMockCommute({
  name: "Home to Office",
  origin: createMockStation({ id: "101", name: "South Ferry" }),
  destination: createMockStation({ id: "725", name: "Times Square" }),
  preferredLines: ["1"]
});

// Create a commute without transfer suggestions
const noTransfers = createMockCommute({
  name: "Direct Route",
  enableTransferSuggestions: false,
  preferredLines: ["1"]
});

// Create a commute with multiple preferred lines
const multiLine = createMockCommute({
  name: "Multi-Line Commute",
  origin: createMockStation({ id: "726", name: "34 St-Penn Station" }),
  destination: createMockStation({ id: "101", name: "South Ferry" }),
  preferredLines: ["1", "2", "3", "A", "C"],
  enableTransferSuggestions: true
});
```

**Edge Cases & Gotchas:**
- **Station object creation**: Default origin/destination use `createMockStation()` internally - always valid station objects
- **Station consistency**: When providing custom stations, ensure `id` and `name` match real GTFS data
- **Preferred lines**: Should include lines that actually serve both origin and destination stations
- **Transfer suggestions**: `enableTransferSuggestions: true` enables transfer recommendation features in UI
- **Line selection**: `preferredLines` affects which routes are prioritized in trip planning
- **Override merging**: Providing `origin` or `destination` replaces entire station object (not merged)
- **Same station**: Can create commutes where origin equals destination (edge case for testing)
- **Type safety**: Returns `Record<string, unknown>`, not typed `Commute` interface
- **Nested objects**: `origin` and `destination` are full station objects with all station properties

---

#### `createMockTripRecord(overrides?)`

Creates a mock historical trip record for trip history and analytics.

**Signature:**
```typescript
function createMockTripRecord(overrides?: Record<string, unknown>): Record<string, unknown>
```

**Parameters:**
- `overrides` (optional): Partial trip record properties to override defaults. Uses spread syntax (`...overrides`) to merge with defaults.

**Returns:**
- `Record<string, unknown>` object with properties:
  - `id: string` - Trip unique ID (default: `"trip_123"`)
  - `date: string` - ISO date string (default: today's date in `YYYY-MM-DD` format)
  - `origin: Station` - Origin station (uses `createMockStation()` internally)
  - `destination: Station` - Destination station (uses `createMockStation()` internally)
  - `line: string` - Line taken (default: `"1"`)
  - `departureTime: number` - Unix timestamp (default: 1 hour ago)
  - `arrivalTime: number` - Unix timestamp (default: 30 min ago)
  - `actualDurationMinutes: number` - Actual duration (default: `30`)
  - `source: "manual" | "inferred" | "tracked"` - Data source (default: `"tracked"`)

**Example:**
```typescript
// Create a basic trip record with defaults
const trip = createMockTripRecord();

// Create a manual trip entry (user entered manually)
const manualTrip = createMockTripRecord({
  date: "2026-08-27",
  line: "A",
  actualDurationMinutes: 45,
  source: "manual"
});

// Create an inferred trip (system predicted from location)
const inferredTrip = createMockTripRecord({
  origin: createMockStation({ id: "725", name: "Times Square" }),
  destination: createMockStation({ id: "101", name: "South Ferry" }),
  line: "1",
  departureTime: Date.now() - 7200000,  // 2 hours ago
  arrivalTime: Date.now() - 5400000,    // 90 min ago
  actualDurationMinutes: 30,
  source: "inferred"
});

// Create a tracked trip (GPS-tracked journey)
const trackedTrip = createMockTripRecord({
  line: "2",
  actualDurationMinutes: 25,
  source: "tracked"
});

// Create a trip with specific timestamps
const datedTrip = createMockTripRecord({
  date: "2026-08-20",
  departureTime: 1692540000000,  // Specific timestamp
  arrivalTime: 1692541800000,
  actualDurationMinutes: 30
});
```

**Edge Cases & Gotchas:**
- **Timestamp coupling**: `departureTime` and `arrivalTime` use `Date.now()` at call time - not stable across tests
- **Time inconsistency**: Default timestamps (1h ago, 30min ago) may not match `actualDurationMinutes: 30` - ensure consistency if overriding
- **Date format**: `date` uses `new Date().toISOString().split("T")[0]` - always `YYYY-MM-DD` format
- **Source types**: `"manual"` (user entered), `"inferred"` (system predicted), `"tracked"` (GPS recorded) - affects data reliability indicators
- **Station objects**: Default origin/destination use `createMockStation()` internally - always valid station objects
- **Duration calculation**: `actualDurationMinutes` should approximately equal `(arrivalTime - departureTime) / 60000`
- **Historical trips**: Set `date` to past dates for historical trip records
- **Override merging**: Providing `origin` or `destination` replaces entire station object
- **Type safety**: Returns `Record<string, unknown>`, not typed `TripRecord` interface
- **Future trips**: Can create trips with `arrivalTime` in future (edge case for testing validation logic)

---

#### `createMockPushSubscription(overrides?)`

Creates a mock web push subscription object for push notification testing.

**Signature:**
```typescript
function createMockPushSubscription(overrides?: Record<string, unknown>): Record<string, unknown>
```

**Parameters:**
- `overrides` (optional): Partial subscription properties to override defaults. Uses spread syntax (`...overrides`) to merge with defaults.

**Returns:**
- `Record<string, unknown>` object with properties:
  - `endpoint: string` - Push service URL (default: FCM test endpoint `"https://fcm.googleapis.com/fcm/send/test_endpoint"`)
  - `keys: { p256dh: string, auth: string }` - VAPID encryption keys
  - `expirationTime: number | null` - Expiration timestamp or null (default: `null`)

**Example:**
```typescript
// Create a basic subscription with defaults
const subscription = createMockPushSubscription();

// Create a subscription with custom endpoint (Mozilla)
const mozillaSub = createMockPushSubscription({
  endpoint: "https://updates.push.services.mozilla.com/wpush/v2/test",
  keys: {
    p256dh: "real_p256dh_key_base64_encoded",
    auth: "real_auth_key_base64_encoded"
  }
});

// Create a subscription with expiration
const expiringSub = createMockPushSubscription({
  endpoint: "https://fcm.googleapis.com/fcm/send/device123",
  expirationTime: Date.now() + 86400000000  // Expires in ~1000 days
});

// Create an expired subscription (for testing cleanup logic)
const expiredSub = createMockPushSubscription({
  expirationTime: Date.now() - 86400000  // Expired yesterday
});

// Override only keys (keep default endpoint)
const customKeys = createMockPushSubscription({
  keys: {
    p256dh: "BMx5h7_8abcdef...",
    auth: "a1b2c3d4..."
  }
});
```

**Edge Cases & Gotchas:**
- **Endpoint format**: Must be valid HTTPS URL format for push service (FCM, Mozilla, etc.)
- **Key encoding**: `p256dh` and `auth` should be base64-encoded strings (in real subscriptions)
- **Test keys**: Default keys are `"test_p256dh_key"` and `"test_auth_key"` - not real VAPID keys
- **Expiration behavior**: `expirationTime: null` means subscription never expires (common in production)
- **Expired subscriptions**: Set `expirationTime < Date.now()` to test expiration/cleanup logic
- **Push service types**: Different browsers use different endpoints (FCM for Chrome, Mozilla for Firefox)
- **Override merging**: Providing `keys` replaces entire keys object - doesn't merge with defaults
- **VAPID authentication**: Real subscriptions use Web Authentication for encryption - test mocks skip this
- **Type safety**: Returns `Record<string, unknown>`, not typed `PushSubscription` interface
- **Duplicate subscriptions**: Same endpoint can be created multiple times (no uniqueness constraint)

---

#### `createTestFixture()`

Creates a complete test fixture with related objects for integration testing.

**Signature:**
```typescript
function createTestFixture(): TestFixture
```

**Parameters:**
- None

**Returns:**
- `TestFixture` object containing:
  - `stations: { timesSquare: Station, pennStation: Station }` - Two predefined stations
  - `routes: { "1": Route }` - Route 1 with stops
  - `arrivals: { timesSquareNorth: Arrival[], timesSquareSouth: Arrival[] }` - Arrival arrays for both directions
  - `alerts: Alert[]` - Array of service alerts
  - `favorites: Favorite[]` - Array of favorite stations
  - `commutes: Commute[]` - Array of commute objects

**Example:**
```typescript
// Destructure the fixture
const { stations, arrivals, alerts, favorites, commutes } = createTestFixture();

// Access station data
console.log(stations.timesSquare.name); // "Times Square-42 St"
console.log(stations.pennStation.id);   // "726"

// Access arrival data
console.log(arrivals.timesSquareNorth.length); // 3 arrivals
console.log(arrivals.timesSquareNorth[0].line); // "1"

// Access alerts
console.log(alerts.length); // 1 alert
console.log(alerts[0].affectedLines); // ["1"]

// Access favorites
console.log(favorites[0].label); // "Work"

// Access commutes
console.log(commutes[0].name); // "Work"
console.log(commutes[0].origin.id); // "725"

// Use fixture in integration test
const fixture = createTestFixture();
test("displays arrivals for Times Square", () => {
  const { arrivals, stations } = fixture;
  const northArrivals = arrivals.timesSquareNorth;
  expect(northArrivals.length).toBeGreaterThan(0);
  expect(northArrivals[0].line).toBe("1");
});
```

**Fixture Structure Details:**
- **stations**: Two stations with IDs `"725"` (Times Square) and `"726"` (Penn Station)
- **routes**: Single route `"1"` with stops `["101", "102", "103"]`
- **arrivals**: 
  - `timesSquareNorth`: 3 arrivals (lines 1, 1, 2 with directions N, N, N)
  - `timesSquareSouth`: 2 arrivals (lines 1, 2 with directions S, S)
- **alerts**: 1 warning alert for line 1
- **favorites**: 1 favorite for Times Square labeled "Work"
- **commutes**: 1 commute from Times Square to Penn Station named "Work"

**Edge Cases & Gotchas:**
- **Data relationships**: Fixture maintains internal consistency (arrivals reference stations in fixture)
- **Isolated fixtures**: Each call creates independent fixture - modifications don't affect other fixtures
- **No deep cloning**: Fixture objects are plain objects - modifications within fixture persist
- **Timestamp coupling**: Arrival timestamps use `Date.now()` at call time - not stable across tests
- **Station IDs**: Uses hardcoded station IDs `"725"` and `"726"` - real Times Square and Penn Station IDs
- **Limited coverage**: Fixture only includes route 1 - override or extend for other lines
- **Ideal for integration**: Perfect for testing components with realistic data relationships
- **Not for unit tests**: Overkill for simple unit tests - use individual `createMock*` functions instead
- **Type safety**: Returns untyped object structure - not a TypeScript interface
- **Extending fixtures**: Can override fixture properties after creation for custom scenarios

---

#### `createMockLogger()`

Creates a mock logger with Vitest spy functions.

**Signature:**
```typescript
function createMockLogger(): MockLogger
```

**Parameters:**
- None

**Returns:**
- `MockLogger` object with methods:
  - `debug: vi.fn` - Debug-level logging
  - `info: vi.fn` - Info-level logging
  - `warn: vi.fn` - Warning-level logging
  - `error: vi.fn` - Error-level logging
  - `child: vi.fn` - Creates child logger (returns new mock)

**Example:**
```typescript
const logger = createMockLogger();
logger.info("Station loaded", { stationId: "725" });
expect(logger.info).toHaveBeenCalledWith("Station loaded", expect.any(Object));
```

**Edge Cases:**
- All methods are Vitest spies - can assert on calls
- `child()` returns a new independent mock logger
- Does not actually log to console (mocked for testing)

---

#### `createMockDatabase()`

Creates a mock database connection with helper methods.

**Signature:**
```typescript
function createMockDatabase(): MockDatabase
```

**Parameters:**
- None

**Returns:**
- `MockDatabase` object with methods:
  - `prepare: vi.fn` - Returns `{ all, get, run }` spies
  - `exec: vi.fn` - Execute SQL
  - `transaction: vi.fn` - Run transaction (executes callback immediately)
  - `pragma: vi.fn` - Run PRAGMA, returns `[]`
  - `close: vi.fn` - Close connection
  - `_setData(table, data)` - Test helper: set table data
  - `_getData(table)` - Test helper: get table data

**Example:**
```typescript
const db = createMockDatabase();
db._setData("stations", [station1, station2]);
const stmt = db.prepare("SELECT * FROM stations");
const stations = stmt.all();
```

**Edge Cases:**
- `_setData`/`_getData` are test helpers not present in real DB
- `transaction` executes callback immediately (no real transaction)
- `prepare` always returns spies - data must be set via `_setData`

---

#### `createMockResponse(data, status?)`

Creates a mock HTTP response object.

**Signature:**
```typescript
function createMockResponse(data: unknown, status?: number): MockResponse
```

**Parameters:**
- `data: unknown` - Response body data
- `status` (optional): HTTP status code (default: `200`)

**Returns:**
- `MockResponse` object with properties:
  - `ok: boolean` - `status >= 200 && status < 300`
  - `status: number` - HTTP status code
  - `json(): Promise<unknown>` - Async JSON parser
  - `text(): Promise<string>` - Async text parser
  - `headers: Headers` - Response headers

**Example:**
```typescript
const response = createMockResponse({ arrivals: [] }, 200);
expect(response.ok).toBe(true);
const data = await response.json();
```

**Edge Cases:**
- `json()` returns `Promise` - must be awaited
- `text()` returns `JSON.stringify(data)`
- `headers` always includes `content-type: application/json`

---

#### `createMockFetch(responses)`

Creates a mock `fetch` function with predefined responses.

**Signature:**
```typescript
function createMockFetch(responses: Array<{ url: string, response: MockResponse }>): vi.fn
```

**Parameters:**
- `responses`: Array of URL-response mappings

**Returns:**
- `vi.fn` - Mocked fetch function that matches URLs

**Example:**
```typescript
const mockFetch = createMockFetch([
  { url: "/api/arrivals", response: createMockResponse({ data: [] }) },
  { url: "/api/alerts", response: createMockResponse({ alerts: [] }) }
]);

const result = await mockFetch("/api/arrivals");
```

**Edge Cases:**
- URL matching is substring-based (`url.includes()`)
- Returns 404 if no URL match found
- Order doesn't matter - matches any URL in array

---

#### `createMockHeaders(overrides?)`

Creates mock HTTP headers.

**Signature:**
```typescript
function createMockHeaders(overrides?: Record<string, string>): Headers
```

**Parameters:**
- `overrides` (optional): Header key-value pairs to add/override

**Returns:**
- `Headers` object with:
  - `content-type: application/json` (default)
  - `user-agent: test-agent` (default)
  - Any additional headers from `overrides`

**Example:**
```typescript
const headers = createMockHeaders({
  "authorization": "Bearer token123",
  "x-custom-header": "value"
});
```

**Edge Cases:**
- Override default headers by passing same key in `overrides`
- Returns real `Headers` object (not a mock)

---

#### `createMockRequest(overrides?)`

Creates a mock HTTP request object.

**Signature:**
```typescript
function createMockRequest(overrides?: {
  method?: string,
  url?: string,
  headers?: Headers,
  body?: unknown
}): MockRequest
```

**Parameters:**
- `overrides` (optional): Request properties to override

**Returns:**
- `MockRequest` object with:
  - `method: string` (default: `"GET"`)
  - `url: string` (default: `"http://localhost:3001/api/test"`)
  - `headers: Headers` (default: `createMockHeaders()`)
  - `body: unknown` (default: `null`)
  - `json(): Promise<unknown>` - Async body parser
  - `text(): Promise<string>` - Async body parser

**Example:**
```typescript
const request = createMockRequest({
  method: "POST",
  url: "/api/favorites",
  body: { stationId: "725" }
});
```

**Edge Cases:**
- `json()` and `text()` return async promises
- `body` can be any JSON-serializable value

---

### Assertion Helpers

#### `assertHasProperties(obj, requiredProps)`

Asserts an object has all required properties.

**Signature:**
```typescript
function assertHasProperties(obj: unknown, requiredProps: string[]): void
```

**Parameters:**
- `obj: unknown` - Object to check (any type)
- `requiredProps: string[]` - Array of required property names (strings)

**Returns:**
- `void` - Throws Vitest assertion error if any property is missing or object is null/undefined

**Example:**
```typescript
// Basic usage - check station has required fields
const station = createMockStation();
assertHasProperties(station, ["id", "name", "lat", "lon"]);
// Passes if station has all four properties

// Check API response has expected structure
const response = { status: 200, data: { arrivals: [] } };
assertHasProperties(response, ["status", "data"]);
assertHasProperties(response.data, ["arrivals"]);

// Check user object has authentication properties
const user = { id: "123", email: "test@example.com", authenticated: true };
assertHasProperties(user, ["id", "email", "authenticated"]);

// Multiple property checks
assertHasProperties(arrival, ["line", "direction", "arrivalTime", "minutesAway"]);

// Empty array always passes (no properties required)
assertHasProperties(obj, []);
```

**Implementation Details:**
```typescript
// Actual implementation from test-helpers.ts
export function assertHasProperties(obj: unknown, requiredProps: string[]): void {
  expect(obj).toBeDefined();
  expect(obj).not.toBeNull();

  const actualObj = obj as Record<string, unknown>;
  for (const prop of requiredProps) {
    expect(actualObj).toHaveProperty(prop);
  }
}
```

**Edge Cases & Gotchas:**
- **Null/undefined handling**: Throws with `"expected undefined to be defined"` if object is null/undefined
- **Nested properties**: Only checks top-level properties - doesn't validate nested structure
- **Property existence**: Checks property exists (not null/undefined) - doesn't validate value type
- **Empty array**: Always passes (no properties to check)
- **Property order**: Order in `requiredProps` doesn't matter
- **Inherited properties**: Checks own properties AND inherited properties from prototype chain
- **Falsy values**: Property exists but has falsy value (0, false, "") still passes
- **Vitest matcher**: Uses `toHaveProperty()` matcher - provides clear assertion error messages
- **Type casting**: Internally casts to `Record<string, unknown>` for property access
- **Performance**: O(n) complexity where n = length of `requiredProps` array

---

#### `assertIsRecent(timestamp, maxAgeMs?)`

Asserts a timestamp is recent (within max age from current time).

**Signature:**
```typescript
function assertIsRecent(timestamp: number, maxAgeMs: number = 60000): void
```

**Parameters:**
- `timestamp: number` - Unix timestamp (in milliseconds) to check
- `maxAgeMs` (optional): Maximum age in milliseconds (default: `60000` = 1 minute)

**Returns:**
- `void` - Throws Vitest assertion error if timestamp is too old or in the future

**Example:**
```typescript
// Basic usage - timestamp is within default 60-second window
assertIsRecent(Date.now() - 30000); // Passes (30s old, limit 60s)

// Custom age limit - 5 minutes
assertIsRecent(arrival.arrivalTime, 300000); // Within 5 minutes

// Check feed freshness
assertIsRecent(lastFeedUpdate, 10000); // Feed must be < 10 seconds old

// Check timestamp is not too old
assertIsRecent(alert.activePeriod.start, 86400000); // Started within last 24 hours

// Check session freshness
assertIsRecent(session.lastActivityAt, 1800000); // Activity within 30 minutes

// Test data staleness
const staleTimestamp = Date.now() - 120000; // 2 minutes ago
assertIsRecent(staleTimestamp, 60000); // Throws (too old for 60s limit)
```

**Implementation Details:**
```typescript
// Actual implementation from test-helpers.ts
export function assertIsRecent(timestamp: number, maxAgeMs = 60000): void {
  const now = Date.now();
  const age = now - timestamp;
  expect(age).toBeGreaterThanOrEqual(0);  // Not in future
  expect(age).toBeLessThanOrEqual(maxAgeMs);  // Not too old
}
```

**Edge Cases & Gotchas:**
- **Current time dependency**: Uses `Date.now()` at assertion time - requires time mocking for stable tests
- **Future timestamps**: Throws if `timestamp > Date.now()` (age < 0) - prevents future timestamps
- **Default too short**: Default `maxAgeMs: 60000` (1 minute) often too short for real production data
- **Recommended limits**: 
  - Live arrivals: `5000-10000` ms (5-10 seconds)
  - Feed updates: `10000-60000` ms (10-60 seconds)
  - User sessions: `1800000-3600000` ms (30-60 minutes)
  - Alerts: `86400000` ms (24 hours)
- **Age calculation**: `age = Date.now() - timestamp` - positive means past, negative means future
- **Zero age**: Timestamp exactly equal to `Date.now()` passes (age = 0, <= maxAgeMs)
- **Boundary condition**: Timestamp exactly `maxAgeMs` old passes (`age <= maxAgeMs` inclusive check)
- **Unit confusion**: Parameter is in milliseconds - don't pass seconds (common mistake)
- **Monotonic time**: Assumes system time doesn't change during test (no DST or manual time adjustments)
- **Performance**: O(1) complexity - simple arithmetic comparison

---

#### `assertApiResponse(response, expectedStatus, expectedDataShape)`

Asserts API response has correct status code and data structure.

**Signature:**
```typescript
function assertApiResponse(
  response: unknown,
  expectedStatus: number,
  expectedDataShape: Record<string, unknown>
): void
```

**Parameters:**
- `response: unknown` - Response object with `status` and `data` properties
- `expectedStatus: number` - Expected HTTP status code (e.g., 200, 404, 500)
- `expectedDataShape: Record<string, unknown>` - Expected data structure for partial matching

**Returns:**
- `void` - Throws Vitest assertion error if status mismatches or data structure doesn't match

**Example:**
```typescript
// Basic usage - check status and data exists
const response = { status: 200, data: { arrivals: [] } };
assertApiResponse(response, 200, { arrivals: expect.any(Array) });
// Passes if status is 200 and response.data.arrivals exists

// Check error response
const errorResponse = { status: 404, data: { error: "Not found" } };
assertApiResponse(errorResponse, 404, { error: expect.any(String) });

// Check complex response structure
const complexResponse = {
  status: 200,
  data: {
    arrivals: [{ line: "1", direction: "N" }],
    alerts: [],
    timestamp: Date.now()
  }
};
assertApiResponse(complexResponse, 200, {
  arrivals: expect.any(Array),
  alerts: expect.any(Array),
  timestamp: expect.any(Number)
});

// Check response with nested objects
const nestedResponse = {
  status: 200,
  data: {
    station: { id: "725", name: "Times Square" },
    arrivals: []
  }
};
assertApiResponse(nestedResponse, 200, {
  station: { id: expect.any(String), name: expect.any(String) },
  arrivals: expect.any(Array)
});

// Partial match - only check specific properties
const fullResponse = {
  status: 200,
  data: {
    arrivals: [],
    alerts: [],
    timestamp: Date.now(),
    version: "1.0"
  }
};
assertApiResponse(fullResponse, 200, {
  arrivals: expect.any(Array)
  // Doesn't check alerts, timestamp, version - partial match
});
```

**Implementation Details:**
```typescript
// Actual implementation from test-helpers.ts
export function assertApiResponse(
  response: unknown,
  expectedStatus: number,
  expectedDataShape: Record<string, unknown>
): void {
  const resp = response as { status?: number; data?: unknown };
  expect(resp.status).toBe(expectedStatus);

  if (expectedDataShape) {
    expect(resp.data).toBeDefined();
    expect(resp.data).toMatchObject(expectedDataShape);
  }
}
```

**Edge Cases & Gotchas:**
- **Status mismatch**: Throws with `"expected 200 but received 404"` if status differs
- **Missing status**: Throws if `response.status` is undefined
- **Data undefined**: Throws `"expected undefined to be defined"` if `response.data` is undefined and `expectedDataShape` provided
- **Partial matching**: Uses `toMatchObject()` - only checks properties in `expectedDataShape`, ignores extra properties in `response.data`
- **Jest matchers**: Can use `expect.any()`, `expect.stringContaining()`, etc. in `expectedDataShape`
- **Nested objects**: Checks nested object structure recursively with `toMatchObject()`
- **Empty shape**: Passing `{}` as `expectedDataShape` only checks `response.data` exists (any value passes)
- **Null data**: `response.data: null` fails `.toBeDefined()` check
- **Type casting**: Internally casts to `{ status?: number; data?: unknown }` - assumes this structure
- **No data check**: If `expectedDataShape` is empty object `{}`, skips data validation (only checks status)
- **Array responses**: Use `{ arrivals: expect.any(Array) }` pattern for array responses
- **Performance**: O(n) where n = depth of `expectedDataShape` object

---

#### `assertIsSorted(array, key, order?)`

Asserts an array is sorted by a specific property key in ascending or descending order.

**Signature:**
```typescript
function assertIsSorted<T>(array: T[], key: keyof T, order: "asc" | "desc" = "asc"): void
```

**Parameters:**
- `array: T[]` - Array of objects to check (generic type)
- `key: keyof T` - Property key to sort by (must exist on all objects)
- `order` (optional): Sort direction - `"asc"` (ascending) or `"desc"` (descending) (default: `"asc"`)

**Returns:**
- `void` - Throws Vitest assertion error if array is not sorted by the specified key

**Example:**
```typescript
// Basic ascending sort
const arrivals = [
  { arrivalTime: 100, line: "1" },
  { arrivalTime: 200, line: "2" },
  { arrivalTime: 300, line: "3" }
];
assertIsSorted(arrivals, "arrivalTime", "asc"); // Passes

// Descending sort
const sortedDesc = [
  { arrivalTime: 300, line: "3" },
  { arrivalTime: 200, line: "2" },
  { arrivalTime: 100, line: "1" }
];
assertIsSorted(sortedDesc, "arrivalTime", "desc"); // Passes

// Default order (ascending if not specified)
assertIsSorted(arrivals, "arrivalTime"); // Uses "asc" by default

// Sort by string property
const stations = [
  { name: "A St", id: "101" },
  { name: "B St", id: "102" },
  { name: "C St", id: "103" }
];
assertIsSorted(stations, "name", "asc"); // Passes

// Mixed array (unsorted) - throws
const unsorted = [
  { arrivalTime: 300, line: "3" },
  { arrivalTime: 100, line: "1" },
  { arrivalTime: 200, line: "2" }
];
assertIsSorted(unsorted, "arrivalTime", "asc"); // Throws

// Empty array - always passes
assertIsSorted([], "arrivalTime", "asc"); // Passes

// Single element - always passes
assertIsSorted([{ arrivalTime: 100 }], "arrivalTime", "asc"); // Passes
```

**Implementation Details:**
```typescript
// Actual implementation from test-helpers.ts
export function assertIsSorted<T>(array: T[], key: keyof T, order: "asc" | "desc" = "asc"): void {
  for (let i = 0; i < array.length - 1; i++) {
    const current = array[i][key];
    const next = array[i + 1][key];

    if (order === "asc") {
      expect(current).toBeLessThanOrEqual(next);
    } else {
      expect(current).toBeGreaterThanOrEqual(next);
    }
  }
}
```

**Edge Cases & Gotchas:**
- **Adjacent comparison**: Only checks adjacent pairs (array[i] vs array[i+1]) - O(n) complexity, efficient but may miss transitive violations
- **Empty arrays**: Always pass (no adjacent pairs to compare)
- **Single element**: Always pass (no adjacent pairs to compare)
- **Comparable values**: Requires values to support comparison operators (`<=`, `>=`) - works for numbers, strings, dates
- **Type safety**: Uses `keyof T` - TypeScript ensures key exists on array elements
- **Non-existent keys**: TypeScript error if key doesn't exist on type `T`
- **Stable sort**: Doesn't check sort stability - only verifies order, not original positions of equal elements
- **Duplicate values**: Equal adjacent values pass in both `"asc"` and `"desc"` (uses `<=` and `>=`)
- **Mixed types**: Comparison may fail if array has mixed types for same key (e.g., number and string)
- **Custom objects**: Works with any objects having comparable property values
- **Descending default**: Default is `"asc"` - must explicitly pass `"desc"` for descending order
- **Performance**: O(n) where n = array length - efficient for large arrays
- **No deep comparison**: Only compares values at specified key - doesn't check overall object equality

---

### Test Setup Helpers

#### `setupTestEnvironment()`

Sets up common test mocks (console, performance API, etc.).

**Signature:**
```typescript
function setupTestEnvironment(): void
```

**Parameters:**
- None

**Returns:**
- `void`

**Example:**
```typescript
beforeEach(() => {
  setupTestEnvironment();
});

afterEach(() => {
  cleanupTestEnvironment();
});
```

**What it mocks:**
- `console.debug` and `console.log` (reduces noise)
- `performance` API with `now()`, `mark()`, `measure()`
- `requestIdleCallback` and `cancelIdleCallback` (if not present)

**Edge Cases:**
- Must call `cleanupTestEnvironment()` after tests
- Mocks are global - affects all tests in suite
- Some mocks may interfere with performance tests

---

#### `cleanupTestEnvironment()`

Restores all mocked globals and clears spies.

**Signature:**
```typescript
function cleanupTestEnvironment(): void
```

**Parameters:**
- None

**Returns:**
- `void`

**Example:**
```typescript
afterEach(() => {
  cleanupTestEnvironment();
});
```

**What it restores:**
- All console methods
- All performance API methods
- All idle callback methods
- Any other Vitest mocks via `vi.restoreAllMocks()`

**Edge Cases:**
- Should be called in `afterEach` hook
- Restores to original state before `setupTestEnvironment()`
- Clears all Vitest spies

---

#### `createTestContext()`

Creates a complete test context with common setup.

**Signature:**
```typescript
function createTestContext(): TestContext
```

**Parameters:**
- None

**Returns:**
- `TestContext` object containing:
  - `mockLogger: MockLogger`
  - `mockDb: MockDatabase`
  - `mockFetch: vi.fn`
  - `fixture: TestFixture`
  - `cleanup: () => void` - Cleanup function

**Example:**
```typescript
const { mockLogger, mockDb, cleanup } = createTestContext();

// Run test
mockLogger.info("Test");

// Cleanup
cleanup();
```

**Edge Cases:**
- Automatically calls `setupTestEnvironment()`
- Must call `cleanup()` to restore environment
- All mocks are independent across contexts

---

### Time Utilities

#### `mockCurrentTime(timestamp)`

Mocks `Date.now()` and `Date.parse()` to return consistent timestamps.

**Signature:**
```typescript
function mockCurrentTime(timestamp: number): void
```

**Parameters:**
- `timestamp: number` - Fixed timestamp to return from `Date.now()`

**Returns:**
- `void`

**Example:**
```typescript
mockCurrentTime(1696000000000);
console.log(Date.now()); // Always 1696000000000
```

**Edge Cases:**
- Mocks `Date.parse()` to always return same timestamp (simplified)
- Affects all code using `Date.now()`
- Must restore with `vi.restoreAllMocks()` after test

---

#### `createMockDateString(date?)`

Creates a mock ISO date string.

**Signature:**
```typescript
function createMockDateString(date?: Date): string
```

**Parameters:**
- `date` (optional): Date object (default: `new Date()`)

**Returns:**
- `string` - ISO 8601 date string

**Example:**
```typescript
const dateStr = createMockDateString(new Date("2026-08-27"));
console.log(dateStr); // "2026-08-27T00:00:00.000Z"
```

**Edge Cases:**
- Uses built-in `Date.toISOString()` method
- Returns UTC time (ends with `Z`)
- Useful for consistent date formatting in tests

---

### Performance Testing Utilities

#### `measureExecutionTime(fn)`

Measures execution time of a synchronous or async function.

**Signature:**
```typescript
async function measureExecutionTime<T>(
  fn: () => T | Promise<T>
): Promise<{ result: T, durationMs: number }>
```

**Parameters:**
- `fn: () => T | Promise<T>` - Function to measure (sync or async)

**Returns:**
- `Promise<{ result: T, durationMs: number }>` - Result and execution time

**Example:**
```typescript
const { result, durationMs } = await measureExecutionTime(() => {
  return fetchArrivals();
});
console.log(`Fetch took ${durationMs}ms`);
```

**Edge Cases:**
- Uses `performance.now()` for high-resolution timing
- Includes both sync and async execution time
- Duration includes promise resolution overhead

---

#### `assertCompletesWithin(fn, maxMs)`

Asserts a function completes within a time limit.

**Signature:**
```typescript
async function assertCompletesWithin<T>(
  fn: () => T | Promise<T>,
  maxMs: number
): Promise<T>
```

**Parameters:**
- `fn: () => T | Promise<T>` - Function to test
- `maxMs: number` - Maximum allowed duration in milliseconds

**Returns:**
- `Promise<T>` - Function result (throws if exceeds maxMs)

**Example:**
```typescript
const result = await assertCompletesWithin(
  () => fetchArrivals(),
  1000
); // Throws if takes > 1 second
```

**Edge Cases:**
- Throws Vitest assertion error if exceeds limit
- Returns function result if passes
- Useful for SLA testing and performance requirements

---

### Async Testing Utilities

#### `waitFor(condition, timeout?, interval?)`

Waits for a condition to become true.

**Signature:**
```typescript
async function waitFor(
  condition: () => boolean,
  timeout?: number,
  interval?: number
): Promise<void>
```

**Parameters:**
- `condition: () => boolean` - Function that returns true when condition met
- `timeout` (optional): Max wait time in ms (default: `5000`)
- `interval` (optional): Poll interval in ms (default: `50`)

**Returns:**
- `Promise<void>` - Resolves when condition true, throws on timeout

**Example:**
```typescript
await waitFor(
  () => document.querySelector(".result") !== null,
  2000,
  100
); // Polls every 100ms for 2 seconds
```

**Edge Cases:**
- Throws error with timeout message if condition never true
- Condition function is called on each tick
- Shorter intervals = more responsive but more CPU

---

#### `flushPromises()`

Flushes all pending promises.

**Signature:**
```typescript
async function flushPromises(): Promise<void>
```

**Parameters:**
- None

**Returns:**
- `Promise<void>` - Resolves after microtask queue empty

**Example:**
```typescript
someAsyncOperation();
await flushPromises(); // Ensures all promises resolved
expect(mockFn).toHaveBeenCalled();
```

**Edge Cases:**
- Uses `setTimeout(..., 0)` to flush microtasks
- Only flushes already-created promises
- Does not wait for new promises created during flush

---

#### `waitForAll(operations)`

Waits for multiple async operations to complete.

**Signature:**
```typescript
async function waitForAll<T>(operations: Array<() => Promise<T>>): Promise<T[]>
```

**Parameters:**
- `operations: Array<() => Promise<T>>` - Array of async functions

**Returns:**
- `Promise<T[]>` - Array of results in same order as operations

**Example:**
```typescript
const results = await waitForAll([
  () => fetchArrivals("725"),
  () => fetchArrivals("726"),
  () => fetchAlerts()
]);
```

**Edge Cases:**
- Uses `Promise.all()` - all operations run in parallel
- Throws if any operation fails
- Results are in same order as input array

---

## Observability Testing Helpers (`observability-helpers.ts`)

### Logger Mocking

#### `createMockLogger()`

Creates a mock logger that captures all log entries.

**Signature:**
```typescript
function createMockLogger(): MockLogger
```

**Parameters:**
- None

**Returns:**
- `MockLogger` object with:
  - `entries: LogEntry[]` - Array of captured log entries
  - `debug(message, context?)` - Log at debug level
  - `info(message, context?)` - Log at info level
  - `warn(message, context?)` - Log at warning level
  - `error(message, error?, context?)` - Log at error level
  - `child(additionalContext)` - Create child logger
  - `clear()` - Clear all entries
  - `getEntriesAtLevel(level)` - Filter by level
  - `getEntriesWithMessage(message)` - Filter by message
  - `getLastEntry()` - Get most recent entry

**LogEntry Shape:**
```typescript
interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  timestamp?: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}
```

**Example:**
```typescript
const logger = createMockLogger();
logger.info("User logged in", { userId: "123" });
logger.error("Database error", new Error("Connection failed"));

expect(logger.entries).toHaveLength(2);
expect(logger.getEntriesAtLevel("info")).toHaveLength(1);
```

**Edge Cases:**
- All methods are Vitest spies + capture entries
- `child()` returns new independent logger (doesn't inherit entries)
- `error()` accepts optional Error object for stack trace

---

#### `assertLoggerCalled(mockLogger, level, message, context?)`

Asserts logger was called with specific parameters.

**Signature:**
```typescript
function assertLoggerCalled(
  mockLogger: MockLogger,
  level: LogEntry["level"],
  message: string,
  context?: Record<string, unknown>
): void
```

**Parameters:**
- `mockLogger: MockLogger` - Mock logger instance
- `level: "debug" | "info" | "warn" | "error"` - Expected log level
- `message: string` - Expected message
- `context` (optional): Expected context properties

**Returns:**
- `void` - Throws if assertion fails

**Example:**
```typescript
logger.info("Station loaded", { stationId: "725" });
assertLoggerCalled(logger, "info", "Station loaded", { stationId: "725" });
```

**Edge Cases:**
- Uses `expect.objectContaining()` for context matching
- Message must match exactly (not substring)
- Context check is optional if omitted

---

#### `assertLoggerNotCalled(mockLogger, level)`

Asserts logger was NOT called at a specific level.

**Signature:**
```typescript
function assertLoggerNotCalled(
  mockLogger: MockLogger,
  level: LogEntry["level"]
): void
```

**Parameters:**
- `mockLogger: MockLogger` - Mock logger instance
- `level: "debug" | "info" | "warn" | "error"` - Level that should not be called

**Returns:**
- `void` - Throws if assertion fails

**Example:**
```typescript
logger.info("Started");
assertLoggerNotCalled(logger, "error"); // Passes if no errors logged
```

**Edge Cases:**
- Useful for testing error-free operations
- Only checks specified level (other levels may be called)

---

### Metrics Testing

#### `createMockMetricsRegistry()`

Creates a mock metrics registry with counter, gauge, and histogram support.

**Signature:**
```typescript
function createMockMetricsRegistry(): MockMetricsRegistry
```

**Parameters:**
- None

**Returns:**
- `MockMetricsRegistry` object with:
  - `metrics: Map<string, MetricSnapshot[]>` - All captured metrics
  - `counter(name, help)` - Create counter with `inc()`, `reset()` methods
  - `gauge(name, help)` - Create gauge with `set()`, `inc()`, `dec()` methods
  - `histogram(name, help, buckets?)` - Create histogram with `observe()`, `reset()` methods
  - `getSnapshots()` - Get all metric snapshots
  - `getMetricSnapshots(name)` - Get snapshots for specific metric
  - `getMetricValue(name)` - Get current value of metric
  - `clear()` - Clear all metrics

**MetricSnapshot Shape:**
```typescript
interface MetricSnapshot {
  type: "counter" | "gauge" | "histogram";
  name: string;
  value: number;
  labels?: Record<string, string>;
  timestamp: number;
}
```

**Example:**
```typescript
const metrics = createMockMetricsRegistry();
const counter = metrics.counter("api_requests", "Total API requests");
counter.inc(1, { endpoint: "/api/arrivals" });

expect(metrics.getMetricValue("api_requests")).toBe(1);
```

**Edge Cases:**
- Counter value is sum of all increments
- Gauge value is last set value (not sum)
- Histogram value is sum of all observations

---

#### `assertCounterIncremented(mockMetrics, metricName, expectedValue?)`

Asserts a counter was incremented (optionally to a specific value).

**Signature:**
```typescript
function assertCounterIncremented(
  mockMetrics: MockMetricsRegistry,
  metricName: string,
  expectedValue?: number
): void
```

**Parameters:**
- `mockMetrics: MockMetricsRegistry` - Mock metrics instance
- `metricName: string` - Name of counter metric
- `expectedValue` (optional): Expected final value

**Returns:**
- `void` - Throws if assertion fails

**Example:**
```typescript
counter.inc();
counter.inc();
assertCounterIncremented(metrics, "api_requests", 2);
```

**Edge Cases:**
- Without `expectedValue`, only checks counter was called > 0 times
- With `expectedValue`, checks exact value
- Throws if metric has no snapshots

---

#### `assertGaugeSet(mockMetrics, metricName, expectedValue)`

Asserts a gauge was set to a specific value.

**Signature:**
```typescript
function assertGaugeSet(
  mockMetrics: MockMetricsRegistry,
  metricName: string,
  expectedValue: number
): void
```

**Parameters:**
- `mockMetrics: MockMetricsRegistry` - Mock metrics instance
- `metricName: string` - Name of gauge metric
- `expectedValue: number` - Expected value

**Returns:**
- `void` - Throws if assertion fails

**Example:**
```typescript
gauge.set(42);
assertGaugeSet(metrics, "active_connections", 42);
```

**Edge Cases:**
- Checks last value (not sum)
- Throws if metric has no snapshots
- Useful for state tracking metrics

---

#### `assertHistogramObserved(mockMetrics, metricName, expectedValues?)`

Asserts a histogram observed specific values.

**Signature:**
```typescript
function assertHistogramObserved(
  mockMetrics: MockMetricsRegistry,
  metricName: string,
  expectedValues?: number[]
): void
```

**Parameters:**
- `mockMetrics: MockMetricsRegistry` - Mock metrics instance
- `metricName: string` - Name of histogram metric
- `expectedValues` (optional): Expected observed values in order

**Returns:**
- `void` - Throws if assertion fails

**Example:**
```typescript
histogram.observe(100);
histogram.observe(200);
histogram.observe(150);
assertHistogramObserved(metrics, "request_duration", [100, 200, 150]);
```

**Edge Cases:**
- Without `expectedValues`, only checks histogram was called > 0 times
- With `expectedValues`, checks exact array match (order matters)
- Useful for distribution testing

---

### Tracing Testing

#### `createMockTracer()`

Creates a mock distributed tracing system with span management.

**Signature:**
```typescript
function createMockTracer(): MockTracer
```

**Parameters:**
- None

**Returns:**
- `MockTracer` object with:
  - `spans: SpanSnapshot[]` - Completed spans
  - `activeSpans: SpanSnapshot[]` - Currently active spans
  - `generateTraceId()` - Generate random trace ID
  - `generateSpanId()` - Generate random span ID
  - `startSpan(name, parentContext?)` - Start new span
  - `endSpan(attributes?)` - End current active span
  - `activeSpan()` - Get current active span
  - `addEvent(name, attributes?)` - Add event to current span
  - `setAttribute(key, value)` - Set attribute on current span
  - `setStatus(code, message?)` - Set status of current span
  - `withSpan(name, fn)` - Run function within a span
  - `getCompletedSpans()` - Get all completed spans
  - `clearCompleted()` - Clear completed spans
  - `getSpansForTrace(traceId)` - Get all spans for a trace

**SpanSnapshot Shape:**
```typescript
interface SpanSnapshot {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
  attributes: Record<string, string | number | boolean>;
  status?: { code: number, message?: string };
}
```

**Example:**
```typescript
const tracer = createMockTracer();
const span = tracer.startSpan("fetchArrivals");
tracer.setAttribute("stationId", "725");
tracer.endSpan({ success: true });

expect(tracer.getCompletedSpans()).toHaveLength(1);
```

**Edge Cases:**
- `withSpan()` automatically handles errors (sets status)
- Span duration is calculated on `endSpan()`
- Parent context creates hierarchical traces

---

#### `assertSpanCreated(mockTracer, name)`

Asserts a span was created with a specific name.

**Signature:**
```typescript
function assertSpanCreated(
  mockTracer: MockTracer,
  name: string
): void
```

**Parameters:**
- `mockTracer: MockTracer` - Mock tracer instance
- `name: string` - Expected span name

**Returns:**
- `void` - Throws if assertion fails

**Example:**
```typescript
tracer.startSpan("fetchArrivals");
assertSpanCreated(tracer, "fetchArrivals");
```

**Edge Cases:**
- Only checks `startSpan` was called with name
- Doesn't check if span was completed
- Useful for verifying operation tracking

---

#### `assertSpanHasAttributes(span, attributes)`

Asserts a span has specific attributes with values.

**Signature:**
```typescript
function assertSpanHasAttributes(
  span: SpanSnapshot,
  attributes: Record<string, string | number | boolean>
): void
```

**Parameters:**
- `span: SpanSnapshot` - Span to check
- `attributes: Record<string, string | number | boolean>` - Expected attributes

**Returns:**
- `void` - Throws if assertion fails

**Example:**
```typescript
const span = tracer.getCompletedSpans()[0];
assertSpanHasAttributes(span, {
  stationId: "725",
  success: true
});
```

**Edge Cases:**
- Checks exact match for each attribute
- Throws if any expected attribute missing or wrong value
- Useful for context propagation testing

---

#### `assertSpanCompletedWithin(span, maxMs)`

Asserts a span completed within a time limit.

**Signature:**
```typescript
function assertSpanCompletedWithin(
  span: SpanSnapshot,
  maxMs: number
): void
```

**Parameters:**
- `span: SpanSnapshot` - Span to check
- `maxMs: number` - Maximum allowed duration in milliseconds

**Returns:**
- `void` - Throws if assertion fails

**Example:**
```typescript
const span = tracer.getCompletedSpans()[0];
assertSpanCompletedWithin(span, 1000); // Must complete in < 1 second
```

**Edge Cases:**
- Uses `span.duration` calculated on `endSpan()`
- Throws if duration > maxMs
- Useful for performance SLA testing

---

### Performance Testing

#### `createPerformanceMonitor()`

Creates a performance monitor for measuring operation execution time.

**Signature:**
```typescript
function createPerformanceMonitor(): PerformanceMonitor
```

**Parameters:**
- None

**Returns:**
- `PerformanceMonitor` object with:
  - `snapshots: PerformanceSnapshot[]` - All measurements
  - `start(name, metadata?)` - Start measuring, returns `end()` function
  - `measure(name, fn, metadata?)` - Measure function execution
  - `getSnapshots(name)` - Get snapshots for named operation
  - `getStatistics(name)` - Get statistics (count, min, max, avg, p50, p95, p99)
  - `clear()` - Clear all snapshots

**PerformanceSnapshot Shape:**
```typescript
interface PerformanceSnapshot {
  name: string;
  duration: number;
  startTime: number;
  endTime: number;
  metadata?: Record<string, unknown>;
}
```

**Example:**
```typescript
const monitor = createPerformanceMonitor();
const { result, duration } = await monitor.measure("fetchArrivals", fetchArrivals);
console.log(`Fetch took ${duration}ms`);

const stats = monitor.getStatistics("fetchArrivals");
console.log(`P95: ${stats.p95}ms`);
```

**Edge Cases:**
- `getSnapshots(name)` returns array of all measurements
- `getStatistics(name)` returns `null` if no measurements
- Percentiles are calculated from sorted durations

---

#### `assertCompletesWithin(monitor, name, fn, maxMs)`

Asserts an operation completes within a time limit.

**Signature:**
```typescript
async function assertCompletesWithin<T>(
  monitor: PerformanceMonitor,
  name: string,
  fn: () => T | Promise<T>,
  maxMs: number
): Promise<T>
```

**Parameters:**
- `monitor: PerformanceMonitor` - Performance monitor instance
- `name: string` - Operation name for tracking
- `fn: () => T | Promise<T>` - Function to measure
- `maxMs: number` - Maximum allowed duration

**Returns:**
- `Promise<T>` - Function result (throws if exceeds maxMs)

**Example:**
```typescript
const result = await assertCompletesWithin(
  monitor,
  "fetchArrivals",
  fetchArrivals,
  1000
);
```

**Edge Cases:**
- Automatically measures and records operation
- Throws Vitest assertion error if exceeds limit
- Returns function result if passes

---

#### `assertMeetsSLO(monitor, name, slo)`

Asserts performance meets SLO requirements.

**Signature:**
```typescript
function assertMeetsSLO(
  monitor: PerformanceMonitor,
  name: string,
  slo: {
    maxMs?: number,
    p95Ms?: number,
    p99Ms?: number
  }
): void
```

**Parameters:**
- `monitor: PerformanceMonitor` - Performance monitor instance
- `name: string` - Operation name
- `slo: { maxMs?, p95Ms?, p99Ms? }` - SLO thresholds

**Returns:**
- `void` - Throws if assertion fails

**Example:**
```typescript
assertMeetsSLO(monitor, "fetchArrivals", {
  maxMs: 2000,
  p95Ms: 1500,
  p99Ms: 1800
});
```

**Edge Cases:**
- Throws if `getStatistics(name)` returns `null`
- Only checks thresholds that are provided
- Useful for SLA compliance testing

---

### Health Check Testing

#### `createMockHealthChecker()`

Creates a mock health checker for system health validation.

**Signature:**
```typescript
function createMockHealthChecker(): MockHealthChecker
```

**Parameters:**
- None

**Returns:**
- `MockHealthChecker` object with:
  - `checks: HealthCheckSnapshot[]` - Check results
  - `register(name, checkFn, details?)` - Register health check, returns `run()` method
  - `getStatus()` - Get overall health status
  - `getChecks()` - Get all check results
  - `clear()` - Clear all check results

**HealthCheckSnapshot Shape:**
```typescript
interface HealthCheckSnapshot {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: number;
  details?: Record<string, unknown>;
}
```

**Example:**
```typescript
const health = createMockHealthChecker();
const dbCheck = health.register("database", async () => {
  return await pingDatabase();
});
await dbCheck.run();

expect(health.getStatus()).toBe("healthy");
```

**Edge Cases:**
- Check functions that throw are marked `"unhealthy"`
- `getStatus()` returns `"degraded"` if any check degraded
- `getStatus()` returns `"unhealthy"` if any check unhealthy

---

#### `assertHealthCheckPasses(healthChecker, name)`

Asserts a health check passes.

**Signature:**
```typescript
async function assertHealthCheckPasses(
  healthChecker: MockHealthChecker,
  name: string
): Promise<void>
```

**Parameters:**
- `healthChecker: MockHealthChecker` - Mock health checker instance
- `name: string` - Check name

**Returns:**
- `Promise<void>` - Throws if assertion fails

**Example:**
```typescript
const check = health.register("api", async () => true);
await assertHealthCheckPasses(health, "api");
```

**Edge Cases:**
- Registers new check with `async () => true` function
- Runs check and asserts result is `true`
- Useful for testing health check infrastructure

---

#### `assertSystemHealthy(healthChecker)`

Asserts the overall system is healthy.

**Signature:**
```typescript
function assertSystemHealthy(
  healthChecker: MockHealthChecker
): void
```

**Parameters:**
- `healthChecker: MockHealthChecker` - Mock health checker instance

**Returns:**
- `void` - Throws if assertion fails

**Example:**
```typescript
await dbCheck.run();
await cacheCheck.run();
assertSystemHealthy(health);
```

**Edge Cases:**
- Checks `getStatus()` returns `"healthy"`
- Returns `"healthy"` if no checks registered
- Throws if any check unhealthy or degraded

---

### Integration Helpers

#### `createMockObservability()`

Creates a complete observability mock suite.

**Signature:**
```typescript
function createMockObservability(): {
  logger: MockLogger,
  metrics: MockMetricsRegistry,
  tracer: MockTracer,
  performance: PerformanceMonitor,
  health: MockHealthChecker
}
```

**Parameters:**
- None

**Returns:**
- Object containing all observability mocks

**Example:**
```typescript
const obs = createMockObservability();
obs.logger.info("Test");
obs.metrics.counter("test", "Test").inc();
const span = obs.tracer.startSpan("test");
obs.tracer.endSpan();
```

**Edge Cases:**
- All mocks are independent
- Useful for integration testing
- No cross-coupling between systems

---

#### `setupObservabilityMocks()`

Sets up test environment with observability mocks and reset/assert helpers.

**Signature:**
```typescript
function setupObservabilityMocks(): ObservabilityMocks
```

**Parameters:**
- None

**Returns:**
- `ObservabilityMocks` object containing:
  - All observability mocks (from `createMockObservability()`)
  - `reset()` - Reset all mocks to initial state
  - `assertWorking()` - Assert all observability systems are working

**Example:**
```typescript
const mocks = setupObservabilityMocks();

// Run tests
mocks.logger.info("Test");
mocks.metrics.counter("test", "Test").inc();

// Assert working
mocks.assertWorking();

// Reset for next test
mocks.reset();
```

**Edge Cases:**
- `reset()` clears all mock state
- `assertWorking()` validates infrastructure
- Useful for test suite setup

---

## Security Testing Helpers (`security-helpers.ts`)

### Mock Authentication

#### `createMockApiKey(overrides?)`

Generates a mock API key with scopes, rate limit tier, expiration.

**Signature:**
```typescript
function createMockApiKey(overrides?: Partial<ApiKey>): ApiKey
```

**Parameters:**
- `overrides` (optional): Partial API key properties to override defaults

**Returns:**
- `ApiKey` object with properties:
  - `keyId: string` - Key identifier (default: `"key_test_123"`)
  - `keyHash: string` - Hashed key value (default: random)
  - `keySalt: string` - Salt for hashing (default: random)
  - `scope: string` - Space-separated permissions (default: `"read:arrivals read:alerts"`)
  - `role: string` - User role (default: `"user"`)
  - `rateLimitTier: number` - Rate limit tier (default: `1`)
  - `active: boolean` - Key status (default: `true`)
  - `createdAt: number` - Creation timestamp (default: 1 day ago)
  - `expiresAt: number` - Expiration timestamp (default: 1 year from now)
  - `failedAttempts: number` - Failed login attempts (default: `0`)

**Example:**
```typescript
const apiKey = createMockApiKey({
  scope: "read:arrivals read:alerts write:favorites",
  role: "admin",
  rateLimitTier: 10
});
```

**Edge Cases:**
- `scope` should be space-separated permissions
- `expiresAt: 0` means key never expires
- `active: false` simulates disabled key
- `failedAttempts > 0` simulates compromised key

---

#### `createMockAuthToken(overrides?)`

Generates a mock authentication token with scopes and expiration.

**Signature:**
```typescript
function createMockAuthToken(overrides?: Partial<AuthToken>): AuthToken
```

**Parameters:**
- `overrides` (optional): Partial auth token properties to override defaults

**Returns:**
- `AuthToken` object with properties:
  - `token: string` - Bearer token string (default: `"Bearer " + random token`)
  - `expiresAt: number` - Expiration timestamp (default: 1 hour from now)
  - `scopes: string[]` - Permission scopes (default: `["read:arrivals", "read:alerts"]`)
  - `userId: string` - User ID (default: `"user_123"`)

**Example:**
```typescript
const token = createMockAuthToken({
  userId: "user_456",
  scopes: ["read:arrivals", "write:favorites"],
  expiresAt: Date.now() + 7200000 // 2 hours
});
```

**Edge Cases:**
- `token` should start with `"Bearer "`
- `scopes` should match API key permissions
- `expiresAt < Date.now()` simulates expired token

---

#### `createMockSession(overrides?)`

Generates a mock user session with ID, activity timestamp, IP, user agent.

**Signature:**
```typescript
function createMockSession(overrides?: Partial<Session>): Session
```

**Parameters:**
- `overrides` (optional): Partial session properties to override defaults

**Returns:**
- `Session` object with properties:
  - `sessionId: string` - Session ID (default: random 16-char token)
  - `userId: string` - User ID (default: `"user_123"`)
  - `createdAt: number` - Creation timestamp (default: now)
  - `lastActivityAt: number` - Last activity timestamp (default: now)
  - `expiresAt: number` - Expiration timestamp (default: 1 hour from now)
  - `ip: string` - Client IP address (default: `"127.0.0.1"`)
  - `userAgent: string` - Client user agent (default: `"test-agent"`)

**Example:**
```typescript
const session = createMockSession({
  userId: "user_456",
  ip: "192.168.1.100",
  userAgent: "Mozilla/5.0...",
  expiresAt: Date.now() + 3600000 // 1 hour
});
```

**Edge Cases:**
- `expiresAt < Date.now()` simulates expired session
- `lastActivityAt` older than timeout simulates stale session
- `ip` can be used for geo-location testing

---

### CSRF Protection

#### `generateRandomToken(length?)`

Generates a random alphanumeric token for testing.

**Signature:**
```typescript
function generateRandomToken(length?: number): string
```

**Parameters:**
- `length` (optional): Token length in characters (default: `32`)

**Returns:**
- `string` - Random alphanumeric token

**Example:**
```typescript
const token = generateRandomToken(32); // 32-char random string
const shortToken = generateRandomToken(16); // 16-char random string
```

**Edge Cases:**
- Uses alphanumeric characters only (A-Z, a-z, 0-9)
- Not cryptographically secure (for testing only)
- Same length inputs can produce same token (collision possible)

---

#### `createMockCsrfToken()`

Creates a mock CSRF token with expiration.

**Signature:**
```typescript
function createMockCsrfToken(): { token: string, expiresAt: number }
```

**Parameters:**
- None

**Returns:**
- Object with:
  - `token: string` - 32-char random token
  - `expiresAt: number` - Expiration timestamp (default: 1 hour from now)

**Example:**
```typescript
const { token, expiresAt } = createMockCsrfToken();
console.log(token); // "aB1xY2..."
```

**Edge Cases:**
- `expiresAt < Date.now()` simulates expired token
- Token is random each call (not deterministic)

---

#### `createCsrfHeaders(token)`

Creates CSRF headers for testing requests.

**Signature:**
```typescript
function createCsrfHeaders(token: string): Headers
```

**Parameters:**
- `token: string` - CSRF token value

**Returns:**
- `Headers` object with:
  - `x-csrf-token: <token>`
  - `content-type: application/json`

**Example:**
```typescript
const headers = createCsrfHeaders("my_token_123");
fetch("/api/favorites", { headers });
```

**Edge Cases:**
- Always sets `content-type: application/json`
- Token must be provided (no default)

---

### Rate Limiting

#### `createMockRateLimitState(overrides?)`

Creates a mock rate limit state with remaining requests and reset time.

**Signature:**
```typescript
function createMockRateLimitState(overrides?: Partial<RateLimitState>): RateLimitState
```

**Parameters:**
- `overrides` (optional): Partial rate limit state properties to override defaults

**Returns:**
- `RateLimitState` object with properties:
  - `identifier: string` - Client identifier (default: `"127.0.0.1"`)
  - `remaining: number` - Remaining requests (default: `60`)
  - `resetAt: number` - Reset timestamp (default: 1 minute from now)
  - `limit: number` - Request limit (default: `60`)
  - `windowMs: number` - Window duration in ms (default: `60000`)

**Example:**
```typescript
const state = createMockRateLimitState({
  identifier: "user_123",
  remaining: 0,
  limit: 100
});
```

**Edge Cases:**
- `remaining: 0` simulates rate-limited client
- `resetAt < Date.now()` simulates stale window
- `identifier` can be IP or user ID

---

#### `createMockRateLimitBan(overrides?)`

Creates a mock rate limit ban with ban expiration and violation count.

**Signature:**
```typescript
function createMockRateLimitBan(overrides?: Partial<RateLimitBan>): RateLimitBan
```

**Parameters:**
- `overrides` (optional): Partial ban properties to override defaults

**Returns:**
- `RateLimitBan` object with properties:
  - `identifier: string` - Banned identifier (default: `"127.0.0.1"`)
  - `bannedUntil: number` - Ban expiration timestamp (default: 1 hour from now)
  - `violationCount: number` - Number of violations (default: `5`)
  - `reason: string` - Ban reason (default: `"Rate limit exceeded"`)

**Example:**
```typescript
const ban = createMockRateLimitBan({
  identifier: "user_123",
  bannedUntil: Date.now() + 7200000, // 2 hours
  violationCount: 10
});
```

**Edge Cases:**
- `bannedUntil < Date.now()` simulates expired ban
- `violationCount` affects ban duration in real system
- `identifier` can be IP or user ID

---

### Input Validation

#### `MALICIOUS_INPUTS`

Constant containing malicious input patterns for testing validation.

**Signature:**
```typescript
const MALICIOUS_INPUTS = {
  sqlInjection: string[],
  xss: string[],
  pathTraversal: string[],
  commandInjection: string[],
  ldapInjection: string[],
  nosqlInjection: string[],
  headerInjection: string[]
}
```

**Value:**
```typescript
{
  sqlInjection: [
    "'; DROP TABLE users; --",
    "1' OR '1'='1",
    "admin'--",
    "admin'/*",
    "1' UNION SELECT * FROM users--"
  ],
  xss: [
    "<script>alert('XSS')</script>",
    "<img src=x onerror=alert('XSS')>",
    "<svg onload=alert('XSS')>",
    "javascript:alert('XSS')",
    "<iframe src='javascript:alert(XSS)'>"
  ],
  pathTraversal: [
    "../../../etc/passwd",
    "..\\..\\..\\windows\\system32",
    "/etc/passwd",
    "C:\\Windows\\System32\\config\\sam"
  ],
  commandInjection: [
    "; ls -la",
    "| cat /etc/passwd",
    "& whoami",
    "`id`",
    "$(whoami)"
  ],
  ldapInjection: [
    "*)(uid=*",
    "*)(&",
    "*(|(mail=*"
  ],
  nosqlInjection: [
    '{"$ne": null}',
    '{"$gt": ""}',
    '{"$regex": ".*"}'
  ],
  headerInjection: [
    "value\r\nX-Injected: true",
    "value\nX-Injected: true",
    "value\rX-Injected: true"
  ]
}
```

**Example:**
```typescript
for (const input of MALICIOUS_INPUTS.sqlInjection) {
  const result = validateInput(input);
  expect(result.isValid).toBe(false);
}
```

**Edge Cases:**
- Contains real malicious patterns (use only in tests)
- Covers common OWASP vulnerabilities
- Each category tests specific attack vector

---

#### `containsMaliciousPatterns(input)`

Tests if input contains dangerous patterns (returns boolean).

**Signature:**
```typescript
function containsMaliciousPatterns(input: string): boolean
```

**Parameters:**
- `input: string` - Input to test

**Returns:**
- `boolean` - `true` if dangerous patterns detected

**Example:**
```typescript
expect(containsMaliciousPatterns("'; DROP TABLE users; --")).toBe(true);
expect(containsMaliciousPatterns("normal input")).toBe(false);
```

**Patterns checked:**
- SQL injection: quotes, comments, SQL keywords
- XSS: script tags, javascript: protocol, event handlers
- Path traversal: `../`, system paths
- Command injection: command separators, substitution
- Header injection: CRLF characters
- NoSQL injection: MongoDB operators

**Edge Cases:**
- Uses regex patterns (may have false positives/negatives)
- Not a replacement for comprehensive validation
- Useful for quick sanity checks in tests

---

#### `sanitizeInput(input)`

Sanitizes input by removing dangerous content (for comparison).

**Signature:**
```typescript
function sanitizeInput(input: string): string
```

**Parameters:**
- `input: string` - Input to sanitize

**Returns:**
- `string` - Sanitized input

**Example:**
```typescript
const sanitized = sanitizeInput("<script>alert('XSS')</script>");
console.log(sanitized); // "alert('XSS')"
```

**What it removes:**
- HTML tags (`<script>`, `<img>`, etc.)
- SQL special characters (`'`, `;`, `"`)
- SQL keywords (`DROP`, `SELECT`, etc.)
- Path traversal sequences (`../`)
- Command injection characters (`;`, `|`, `` ` ``, `$`, `()`)
- Header injection sequences (`\r`, `\n`)
- NoSQL operators (`$ne`, `$gt`, etc.)

**Edge Cases:**
- Test helper only (not production sanitization)
- Overly aggressive (may remove safe content)
- Use to compare against actual implementation

---

### Security Context Mocking

#### `createMockSecurityContext(overrides?)`

Creates a mock security context with auth status, user, scopes, IP.

**Signature:**
```typescript
function createMockSecurityContext(overrides?: Partial<SecurityContext>): SecurityContext
```

**Parameters:**
- `overrides` (optional): Partial security context properties to override defaults

**Returns:**
- `SecurityContext` object with properties:
  - `isAuthenticated: boolean` - Auth status (default: `false`)
  - `userId: string | null` - User ID (default: `null`)
  - `apiKey: ApiKey | null` - API key object (default: `null`)
  - `scopes: string[]` - Permission scopes (default: `[]`)
  - `ip: string` - Client IP address (default: `"127.0.0.1"`)
  - `userAgent: string` - Client user agent (default: `"test-agent"`)
  - `sessionId: string | null` - Session ID (default: `null`)
  - `csrfToken: string | null` - CSRF token (default: `null`)

**Example:**
```typescript
const context = createMockSecurityContext({
  isAuthenticated: true,
  userId: "user_123",
  scopes: ["read:arrivals", "write:favorites"],
  ip: "192.168.1.100"
});
```

**Edge Cases:**
- `isAuthenticated: false` but `userId` set = inconsistent state
- `scopes` should match API key or role permissions
- `csrfToken` required for state-changing operations

---

#### `createAuthenticatedContext(overrides?)`

Creates an authenticated security context with user ID, API key, scopes.

**Signature:**
```typescript
function createAuthenticatedContext(overrides?: Partial<SecurityContext>): SecurityContext
```

**Parameters:**
- `overrides` (optional): Partial security context properties to override defaults

**Returns:**
- `SecurityContext` object with:
  - `isAuthenticated: true`
  - `userId: "user_123"`
  - `apiKey: ApiKey` (mock API key)
  - `scopes: ["read:arrivals", "read:alerts", "write:favorites"]`
  - `sessionId: string` (random 16-char token)
  - `csrfToken: string` (random 32-char token)
  - Plus defaults from `createMockSecurityContext()`

**Example:**
```typescript
const context = createAuthenticatedContext({
  userId: "user_456",
  scopes: ["read:*"]
});
```

**Edge Cases:**
- Always `isAuthenticated: true`
- Includes default API key and scopes
- Useful for authenticated request testing

---

### Security Event Mocking

#### `createMockSecurityEvent(overrides?)`

Creates a mock security event with type, severity, timestamp, details.

**Signature:**
```typescript
function createMockSecurityEvent(overrides?: Partial<SecurityEvent>): SecurityEvent
```

**Parameters:**
- `overrides` (optional): Partial security event properties to override defaults

**Returns:**
- `SecurityEvent` object with properties:
  - `eventId: string` - Event ID (default: `"event_" + random token`)
  - `type: string` - Event type (default: `"auth_failure"`)
  - `severity: string` - Event severity (default: `"warning"`)
  - `timestamp: number` - Event timestamp (default: now)
  - `details: Record<string, unknown>` - Event details (default: IP, UA, attempt count)

**Example:**
```typescript
const event = createMockSecurityEvent({
  type: "rate_limit_exceeded",
  severity: "severe",
  details: { ip: "192.168.1.100", violationCount: 10 }
});
```

**Edge Cases:**
- `type` should be valid security event type
- `severity` affects alerting and response
- `details` can include any contextual data

---

#### `SECURITY_EVENT_TYPES`

Constant containing security event type categories.

**Signature:**
```typescript
const SECURITY_EVENT_TYPES = {
  authentication: string[],
  authorization: string[],
  rateLimit: string[],
  data: string[],
  session: string[],
  csrf: string[],
  input: string[]
}
```

**Value:**
```typescript
{
  authentication: ["login_success", "login_failure", "logout", "session_expired"],
  authorization: ["access_denied", "insufficient_permissions", "resource_not_found"],
  rateLimit: ["rate_limit_exceeded", "rate_limit_ban", "rate_limit_reset"],
  data: ["sensitive_data_access", "data_export", "data_deletion"],
  session: ["session_created", "session_destroyed", "session_hijack_attempt"],
  csrf: ["csrf_token_missing", "csrf_token_invalid", "csrf_token_expired"],
  input: ["invalid_input", "malicious_input_detected", "sanitization_failed"]
}
```

**Example:**
```typescript
for (const type of SECURITY_EVENT_TYPES.authentication) {
  console.log(type); // "login_success", "login_failure", etc.
}
```

**Edge Cases:**
- Use these types for consistency
- Event types map to monitoring alerts
- Categories affect event routing and response

---

### Password Testing Utilities

#### `PASSWORD_STRENGTH`

Constant containing password strength levels (weak, fair, good, strong).

**Signature:**
```typescript
const PASSWORD_STRENGTH = {
  weak: { password: string, score: number, feedback: string },
  fair: { password: string, score: number, feedback: string },
  good: { password: string, score: number, feedback: string },
  strong: { password: string, score: number, feedback: string }
}
```

**Value:**
```typescript
{
  weak: {
    password: "123456",
    score: 0,
    feedback: "Very weak password"
  },
  fair: {
    password: "password123",
    score: 1,
    feedback: "Weak password"
  },
  good: {
    password: "SecurePass456!",
    score: 2,
    feedback: "Good password"
  },
  strong: {
    password: "V3ry$tr0ng!P@ssw0rd#2024",
    score: 3,
    feedback: "Strong password"
  }
}
```

**Example:**
```typescript
const { password, score, feedback } = PASSWORD_STRENGTH.strong;
console.log(password); // "V3ry$tr0ng!P@ssw0rd#2024"
```

**Edge Cases:**
- Passwords are for testing only (not real credentials)
- `score` is 0-3 (higher = stronger)
- `feedback` is user-facing message

---

#### `createMockPasswordHash(overrides?)`

Creates a mock password hash with salt and iterations.

**Signature:**
```typescript
function createMockPasswordHash(overrides?: Partial<PasswordHash>): PasswordHash
```

**Parameters:**
- `overrides` (optional): Partial password hash properties to override defaults

**Returns:**
- `PasswordHash` object with properties:
  - `hash: string` - Bcrypt hash (default: `"$2b$10$" + random token`)
  - `salt: string` - Bcrypt salt (default: `"$2b$10$" + random token`)
  - `iterations: number` - Bcrypt rounds (default: `10`)

**Example:**
```typescript
const passwordHash = createMockPasswordHash({
  iterations: 12
});
```

**Edge Cases:**
- Hash format mimics Bcrypt (`$2b$10$...`)
- Not a real hash (random tokens only)
- Use for testing hash verification logic

---

#### `createMockPasswordResetToken(overrides?)`

Creates a mock password reset token with expiration and metadata.

**Signature:**
```typescript
function createMockPasswordResetToken(overrides?: Partial<PasswordResetToken>): PasswordResetToken
```

**Parameters:**
- `overrides` (optional): Partial token properties to override defaults

**Returns:**
- `PasswordResetToken` object with properties:
  - `tokenId: string` - Token ID (default: `"token_" + random token`)
  - `keyId: string` - Associated API key ID (default: `"key_test_123"`)
  - `tokenHash: string` - Hashed token value (default: `"hash_" + random token`)
  - `createdAt: number` - Creation timestamp (default: now)
  - `expiresAt: number` - Expiration timestamp (default: 1 hour from now)
  - `used: boolean` - Token used status (default: `false`)
  - `clientIp: string` - Client IP address (default: `"127.0.0.1"`)
  - `userAgent: string` - Client user agent (default: `"test-agent"`)

**Example:**
```typescript
const resetToken = createMockPasswordResetToken({
  keyId: "key_user_456",
  expiresAt: Date.now() + 3600000 // 1 hour
});
```

**Edge Cases:**
- `expiresAt < Date.now()` simulates expired token
- `used: true` simulates already-used token
- `clientIp` and `userAgent` for audit trail

---

### RBAC Testing Utilities

#### `ROLES`

Constant containing role definitions with permissions (admin, user, readonly, service).

**Signature:**
```typescript
const ROLES = {
  admin: { name: string, permissions: string[] },
  user: { name: string, permissions: string[] },
  readonly: { name: string, permissions: string[] },
  service: { name: string, permissions: string[] }
}
```

**Value:**
```typescript
{
  admin: {
    name: "admin",
    permissions: ["*"] // All permissions
  },
  user: {
    name: "user",
    permissions: [
      "read:arrivals",
      "read:alerts",
      "read:stations",
      "write:favorites",
      "write:commutes",
      "write:journal"
    ]
  },
  readonly: {
    name: "readonly",
    permissions: ["read:arrivals", "read:alerts", "read:stations"]
  },
  service: {
    name: "service",
    permissions: ["read:*", "write:push"]
  }
}
```

**Example:**
```typescript
const adminPermissions = ROLES.admin.permissions;
console.log(adminPermissions); // ["*"]
```

**Edge Cases:**
- `"*"` means all permissions (admin only)
- `"read:*"` means all read permissions (service only)
- Other permissions are explicit and granular

---

#### `hasPermission(role, permission)`

Checks if a role has a specific permission (supports wildcard `*` and prefix matching).

**Signature:**
```typescript
function hasPermission(role: keyof typeof ROLES, permission: string): boolean
```

**Parameters:**
- `role: keyof typeof ROLES` - Role name (`"admin" | "user" | "readonly" | "service"`)
- `permission: string` - Permission to check

**Returns:**
- `boolean` - `true` if role has permission

**Example:**
```typescript
expect(hasPermission("admin", "anything")).toBe(true); // "*"
expect(hasPermission("user", "read:arrivals")).toBe(true);
expect(hasPermission("user", "admin:delete")).toBe(false);
expect(hasPermission("service", "read:alerts")).toBe(true); // "read:*"
```

**Edge Cases:**
- `"*"` matches any permission
- `"prefix:*"` matches any permission with prefix
- Exact match required for non-wildcard permissions
- Case-sensitive

---

### Audit Log Testing

#### `createMockAuditLogEntry(overrides?)`

Creates a mock audit log entry with action, resource, IP, user agent.

**Signature:**
```typescript
function createMockAuditLogEntry(overrides?: Partial<AuditLogEntry>): AuditLogEntry
```

**Parameters:**
- `overrides` (optional): Partial audit log properties to override defaults

**Returns:**
- `AuditLogEntry` object with properties:
  - `id: string` - Entry ID (default: `"audit_" + random token`)
  - `timestamp: number` - Event timestamp (default: now)
  - `userId: string` - User ID (default: `"user_123"`)
  - `action: string` - Action performed (default: `"api_key_created"`)
  - `resourceType: string` - Resource type (default: `"api_key"`)
  - `resourceId: string` - Resource ID (default: `"key_test_123"`)
  - `ip: string` - Client IP address (default: `"127.0.0.1"`)
  - `userAgent: string` - Client user agent (default: `"test-agent"`)
  - `success: boolean` - Action success status (default: `true`)
  - `details: Record<string, unknown>` - Additional details (default: `{}`)

**Example:**
```typescript
const entry = createMockAuditLogEntry({
  action: "data_exported",
  resourceType: "trips",
  userId: "user_456",
  success: true
});
```

**Edge Cases:**
- `success: false` for failed/denied actions
- `details` can include any contextual data
- `timestamp` should be event time, not log time

---

#### `AUDIT_ACTIONS`

Constant containing audit action categories.

**Signature:**
```typescript
const AUDIT_ACTIONS = {
  authentication: string[],
  api_keys: string[],
  data: string[],
  admin: string[],
  sessions: string[]
}
```

**Value:**
```typescript
{
  authentication: ["login", "logout", "failed_login", "password_changed", "password_reset"],
  api_keys: ["api_key_created", "api_key_updated", "api_key_deleted", "api_key_rotated"],
  data: ["data_exported", "data_deleted", "data_updated"],
  admin: ["user_created", "user_updated", "user_deleted", "role_changed"],
  sessions: ["session_created", "session_destroyed", "session_revoked"]
}
```

**Example:**
```typescript
for (const action of AUDIT_ACTIONS.authentication) {
  console.log(action); // "login", "logout", etc.
}
```

**Edge Cases:**
- Use these actions for consistency
- Categories affect log filtering and reporting
- Actions map to compliance requirements

---

### Mock Security Middleware

#### `createMockSecurityMiddleware()`

Creates a mock security middleware with request context and auth/authorization methods.

**Signature:**
```typescript
function createMockSecurityMiddleware(): MockSecurityMiddleware
```

**Parameters:**
- None

**Returns:**
- `MockSecurityMiddleware` object with:
  - `context: SecurityContext` - Request security context
  - `authenticate(userId)` - Authenticate a user
  - `authorize(permission)` - Authorize a permission (throws if not authenticated)
  - `setCsrfToken(token)` - Set CSRF token
  - `checkRateLimit()` - Check and decrement rate limit

**Context Structure:**
```typescript
{
  request: {
    ip: string,
    headers: Headers,
    method: string,
    url: string
  },
  session: { sessionId: string, userId: string } | null,
  user: { id: string } | null,
  security: {
    isAuthenticated: boolean,
    csrfToken: string | null,
    rateLimit: {
      remaining: number,
      resetAt: number
    }
  }
}
```

**Example:**
```typescript
const middleware = createMockSecurityMiddleware();
middleware.authenticate("user_123");
middleware.authorize("read:arrivals"); // Passes
middleware.authorize("admin:delete"); // Throws (not admin)
```

**Edge Cases:**
- `authorize()` throws if `isAuthenticated: false`
- `checkRateLimit()` returns `false` when rate limit reached
- Context is mutable (methods modify it)

---

### Test Assertions

#### `isSanitized(sanitized)`

Checks if input is properly sanitized (returns boolean).

**Signature:**
```typescript
function isSanitized(sanitized: string): boolean
```

**Parameters:**
- `sanitized: string` - Sanitized input to check

**Returns:**
- `boolean` - `true` if properly sanitized

**Example:**
```typescript
expect(isSanitized("safe input")).toBe(true);
expect(isSanitized("<script>alert('XSS')</script>")).toBe(false);
expect(isSanitized("'; DROP TABLE users; --")).toBe(false);
```

**What it checks:**
- No `<script>` tags or `<`/`>` characters
- No `javascript:` protocol
- No event handlers (`onerror=`, `onload=`, etc.)
- No path traversal (`../`)
- No SQL injection characters (`;`)

**Edge Cases:**
- Test helper only (not comprehensive validation)
- May have false positives for safe inputs
- Use to compare against actual sanitization

---

#### `hasSecurityHeaders(headers)`

Checks if headers include required security headers (returns boolean).

**Signature:**
```typescript
function hasSecurityHeaders(headers: Headers): boolean
```

**Parameters:**
- `headers: Headers` - HTTP headers to check

**Returns:**
- `boolean` - `true` if all required headers present

**Example:**
```typescript
const headers = new Headers({
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "x-xss-protection": "1; mode=block",
  "strict-transport-security": "max-age=31536000"
});

expect(hasSecurityHeaders(headers)).toBe(true);
```

**Required headers:**
- `x-content-type-options: nosniff` (exact match)
- `x-frame-options` (any value)
- `x-xss-protection` (any value)
- `strict-transport-security` (must include `max-age=`)

**Edge Cases:**
- All four headers must be present
- Values only checked for `x-content-type-options` and `strict-transport-security`
- Case-sensitive header names

---

## E2E Test Helpers (`tests/e2e/helpers/`)

### Port Checking

#### `checkPort(port)`

Checks if a TCP port is already in use on the local machine.

**Signature:**
```typescript
function checkPort(port: number): Promise<boolean>
```

**Parameters:**
- `port: number` - Port number to check (e.g., `3001`)

**Returns:**
- `Promise<boolean>` - `true` if port is in use, `false` if port is available

**Example:**
```typescript
import { checkPort } from "../helpers/check-port";

const portInUse = await checkPort(3001);
if (portInUse) {
  console.error("Port 3001 is already in use");
  process.exit(1);
}
```

**How it works:**
- Attempts to create a TCP server on the specified port
- If `EADDRINUSE` error occurs, port is in use → returns `true`
- If server starts successfully, port is available → returns `false` after closing server
- Other errors return `false` (assume port is available)

**Edge Cases:**
- Only checks `127.0.0.1` (localhost) - doesn't detect port usage on other interfaces
- Must be awaited - returns Promise, not boolean directly
- Race condition possible between check and actual server start
- Other processes may bind the port between check and use

**Use Cases:**
- Pre-flight checks before starting E2E test server
- CI/CD pipeline validation before service startup
- Detecting conflicts with development servers

**Exit Code Integration:**
The helper module includes a `main()` function that exits with:
- `0` - Port is available
- `1` - Port is in use
- `2` - Error occurred during check

```bash
# Usage in CI scripts
node tests/e2e/helpers/check-port.ts || exit 1
```
