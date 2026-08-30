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
- `overrides` (optional): Partial station properties to override defaults. Uses spread syntax (`...overrides`) to merge with defaults. Accepts any subset of [Station](packages/shared/src/types/stations.ts#L29) properties:
  - `id?: string` - GTFS station ID (3-digit codes like "725" for Times Square)
  - `name?: string` - Station display name (e.g., "Times Square-42 St")
  - `lat?: number` - Latitude coordinate (NYC range: 40.5-40.9)
  - `lon?: number` - Longitude coordinate (NYC range: -74.3 to -73.7)
  - `lines?: string[]` - Subway lines serving this station (e.g., ["1", "2", "3"])
  - `northStopId?: string` - GTFS stop ID for northbound platform (typically `{id}N`)
  - `southStopId?: string` - GTFS stop ID for southbound platform (typically `{id}S`)
  - `transfers?: [TransferConnection](packages/shared/src/types/stations.ts#L15)[]` - Array of transfer connections to other stations
  - `complex?: string` - Station complex ID for multi-entrance stations (e.g., "725")
  - `ada?: boolean` - ADA wheelchair accessibility flag
  - `borough?: [Borough](packages/shared/src/types/stations.ts#L7)` - NYC borough type: "manhattan" | "brooklyn" | "queens" | "bronx" | "statenisland"

**Returns:**
- [`Station`](packages/shared/src/types/stations.ts#L29) object matching the `@mta-my-way/shared/types` Station interface:
  - `id: string` - Station GTFS ID (default: `"725"` - Times Square)
  - `name: string` - Station name (default: `"Times Square-42 St"`)
  - `lat: number` - Latitude coordinate (default: `40.7589`)
  - `lon: number` - Longitude coordinate (default: `-73.9851`)
  - `lines: string[]` - Lines serving this station (default: `["1", "2", "3", "7", "N", "Q", "R", "W"]`)
  - `northStopId: string` - Northbound platform stop ID (default: `"725N"`)
  - `southStopId: string` - Southbound platform stop ID (default: `"725S"`)
  - `transfers: [TransferConnection](packages/shared/src/types/stations.ts#L15)[]` - Transfer connections (default: `[]`)
  - `complex?: string` - Station complex ID (default: `undefined`)
  - `ada: boolean` - ADA accessible (default: `true`)
  - `borough: [Borough](packages/shared/src/types/stations.ts#L7)` - NYC borough (default: `"manhattan"`)

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

Creates a mock logger with Vitest spy functions for testing logging behavior, log level filtering, and verifying that operations log expected messages without actual console output.

**Signature:**
```typescript
function createMockLogger(): MockLogger
```

**Parameters:**
- None

**Returns:**
- `MockLogger` object with Vitest spy methods:
  - `debug: vi.fn` - Debug-level logging function
    - Type: `(message: string, context?: Record<string, unknown>) => void`
    - Accepts message string and optional context object
    - Spy tracks all calls for assertions
  - `info: vi.fn` - Info-level logging function
    - Type: `(message: string, context?: Record<string, unknown>) => void`
    - Accepts message string and optional context object
    - Most common level for operational logging
  - `warn: vi.fn` - Warning-level logging function
    - Type: `(message: string, context?: Record<string, unknown>) => void`
    - Accepts message string and optional context object
    - For non-critical issues that should be reviewed
  - `error: vi.fn` - Error-level logging function
    - Type: `(message: string, context?: Record<string, unknown>) => void`
    - Accepts message string and optional context object
    - For errors and exceptions
  - `child: vi.fn` - Creates child logger
    - Type: `(additionalContext: Record<string, unknown>) => MockLogger`
    - Returns a new independent mock logger instance
    - Child logger is separate from parent (no shared state)

**Common Usage Patterns:**

```typescript
// 1. Basic logging verification
const logger = createMockLogger();
logger.info("Station loaded", { stationId: "725" });
expect(logger.info).toHaveBeenCalledWith("Station loaded", { stationId: "725" });
expect(logger.info).toHaveBeenCalledTimes(1);

// 2. Testing that errors are logged
const logger = createMockLogger();
try {
  await riskyOperation();
} catch (error) {
  logger.error("Operation failed", { error: error.message });
}
expect(logger.error).toHaveBeenCalledWith(
  "Operation failed",
  expect.objectContaining({ error: expect.any(String) })
);

// 3. Verifying log level usage
const logger = createMockLogger();
processData(logger);
expect(logger.debug).not.toHaveBeenCalled(); // Debug logs disabled
expect(logger.info).toHaveBeenCalled(); // Info logs enabled

// 4. Testing context propagation
const logger = createMockLogger();
logger.info("User action", { userId: "123", action: "login" });
const call = logger.info.mock.calls[0];
expect(call[1]).toMatchObject({ userId: "123", action: "login" });

// 5. Multiple log calls in sequence
const logger = createMockLogger();
logger.debug("Starting process");
logger.info("Processing item 1");
logger.info("Processing item 2");
logger.warn("Processing slow");
logger.info("Completed");
expect(logger.info).toHaveBeenCalledTimes(3);
expect(logger.warn).toHaveBeenCalledTimes(1);

// 6. Conditional logging verification
const logger = createMockLogger();
if (someCondition) {
  logger.info("Condition met", { value: true });
}
expect(logger.info).toHaveBeenCalledTimes(someCondition ? 1 : 0);

// 7. Testing child logger creation
const logger = createMockLogger();
const childLogger = logger.child({ component: "Database" });
childLogger.info("Query executed");
expect(logger.child).toHaveBeenCalledWith({ component: "Database" });
expect(childLogger.info).toHaveBeenCalled(); // Child is independent mock

// 8. Verifying no unexpected logging
const logger = createMockLogger();
await silentOperation();
expect(logger.debug).not.toHaveBeenCalled();
expect(logger.info).not.toHaveBeenCalled();
expect(logger.warn).not.toHaveBeenCalled();
expect(logger.error).not.toHaveBeenCalled();

// 9. Testing log call order
const logger = createMockLogger();
logSequence(logger);
expect(logger.debug).toHaveBeenCalledBefore(logger.info);
expect(logger.info).toHaveBeenCalledBefore(logger.warn);
expect(logger.warn).toHaveBeenCalledBefore(logger.error);

// 10. Extracting context from log calls
const logger = createMockLogger();
logger.info("API request", { method: "GET", url: "/api/stations" });
const contexts = logger.info.mock.calls.map(call => call[1]);
expect(contexts).toContainEqual({ method: "GET", url: "/api/stations" });
```

**Advanced Usage Patterns:**

```typescript
// 1. Testing log filtering by level
const logger = createMockLogger();
setLogLevel("warn"); // Only warn and error
logger.debug("This won't log");
logger.info("This won't log");
logger.warn("This will log");
logger.error("This will log");
expect(logger.debug).not.toHaveBeenCalled();
expect(logger.info).not.toHaveBeenCalled();
expect(logger.warn).toHaveBeenCalledTimes(1);
expect(logger.error).toHaveBeenCalledTimes(1);

// 2. Mock logger in component testing
const logger = createMockLogger();
const component = new StationComponent(logger);
component.loadStation("725");
expect(logger.info).toHaveBeenCalledWith("Loading station", { stationId: "725" });
expect(logger.error).not.toHaveBeenCalled();

// 3. Testing error logging with error objects
const logger = createMockLogger();
try {
  JSON.parse(invalidJson);
} catch (error) {
  logger.error("JSON parse failed", { error: error.message, input: invalidJson });
}
expect(logger.error).toHaveBeenCalledWith(
  "JSON parse failed",
  expect.objectContaining({ error: expect.any(String) })
);

// 4. Verifying structured logging
const logger = createMockLogger();
logger.info("Request received", {
  method: "POST",
  path: "/api/arrivals",
  ip: "127.0.0.1",
  userAgent: "test-agent"
});
const logEntry = logger.info.mock.calls[0];
expect(logEntry[1]).toMatchObject({
  method: "POST",
  path: "/api/arrivals"
});

// 5. Testing performance logging
const logger = createMockLogger();
const start = Date.now();
await operation();
logger.info("Operation completed", { duration: Date.now() - start });
expect(logger.info).toHaveBeenCalledWith(
  "Operation completed",
  expect.objectContaining({ duration: expect.any(Number) })
);
```

**Edge Cases & Gotchas:**

- **No console output**: Logger methods are spies and don't actually log to console
  ```typescript
  const logger = createMockLogger();
  logger.info("This won't appear in console");
  // Only tracked in spy, no visible output
  ```

- **Child logger independence**: Child loggers are separate mocks, not linked to parent
  ```typescript
  const logger = createMockLogger();
  const child = logger.child({ component: "DB" });
  logger.info("Parent message");
  child.info("Child message");
  expect(logger.info).toHaveBeenCalledTimes(1); // Not 2
  expect(child.info).toHaveBeenCalledTimes(1);
  ```

- **Spy call accumulation**: Calls accumulate across test runs if logger not recreated
  ```typescript
  const logger = createMockLogger();
  logger.info("First test");
  // If logger reused in next test without clearing:
  logger.info("Second test");
  expect(logger.info).toHaveBeenCalledTimes(2); // Includes previous test
  ```

- **Context object matching**: Jest matchers needed for partial object matching
  ```typescript
  logger.info("Message", { userId: "123", action: "login" });
  expect(logger.info).toHaveBeenCalledWith("Message", { userId: "123" }); // ❌ Fails - missing action
  expect(logger.info).toHaveBeenCalledWith("Message", expect.objectContaining({ userId: "123" })); // ✅ Works
  ```

- **Missing context**: Context parameter is optional, handle undefined
  ```typescript
  logger.info("Message without context");
  const call = logger.info.mock.calls[0];
  expect(call[1]).toBeUndefined(); // Second argument is undefined
  ```

- **Order-dependent assertions**:toHaveBeenCalled*before* requires calls to exist
  ```typescript
  const logger = createMockLogger();
  logger.info("First");
  logger.info("Second");
  expect(logger.info).toHaveBeenCalledBefore(logger.error); // ❌ Fails if error never called
  ```

- **Type safety**: TypeScript allows any context shape - runtime validation needed
  ```typescript
  logger.info("Message", { wrong: "shape" }); // TypeScript accepts this
  // No runtime validation of context structure
  ```

- **Spy reset**: Mock state persists unless explicitly cleared
  ```typescript
  const logger = createMockLogger();
  logger.info("Test 1");
  logger.info.mockClear(); // Clear spy state
  logger.info("Test 2");
  expect(logger.info).toHaveBeenCalledTimes(1); // Only sees Test 2
  ```

**Performance Considerations:**

- Spy call tracking has minimal overhead (~0.01ms per call)
- Context object serialization is not performed (references stored as-is)
- For high-frequency logging (>1000 calls/second), consider using simpler logging
- Mock creation is fast but not free - create fresh mocks per test when possible

---

#### `createMockDatabase()`

Creates a mock database connection with prepared statement spies and test helper methods for testing database operations, SQL queries, transactions, and data persistence without a real database.

**Signature:**
```typescript
function createMockDatabase(): MockDatabase
```

**Parameters:**
- None

**Returns:**
- `MockDatabase` object with methods:
  - `prepare: vi.fn` - Creates prepared statement with query methods
    - Type: `(sql: string) => PreparedStatement`
    - Returns object with `{ all, get, run }` spies
    - Each call to `prepare` returns a new independent statement spy
  - `exec: vi.fn` - Execute SQL statements that don't return data
    - Type: `(sql: string) => void`
    - For DDL statements (CREATE, DROP, ALTER)
    - Spy tracks SQL strings for verification
  - `transaction: vi.fn` - Execute a function in a transaction
    - Type: `<T>(fn: () => T) => T`
    - Executes callback immediately (no real transaction isolation)
    - Returns whatever the callback returns
    - Useful for testing transaction patterns
  - `pragma: vi.fn` - Execute PRAGMA statements
    - Type: `(sql: string) => unknown[]`
    - Returns empty array by default
    - For testing SQLite pragmas (journal_mode, foreign_keys, etc.)
  - `close: vi.fn` - Close database connection
    - Type: `() => void`
    - Spy tracks close calls for cleanup verification
  - `_setData: (table: string, data: unknown[]) => void` - Test helper to set table data
    - Type: `(table: string, data: unknown[]) => void`
    - Stores data in internal Map for retrieval
    - Data persists until `_setData` called again or Map cleared
    - Not part of real database API (test-only)
  - `_getData: (table: string) => unknown[]` - Test helper to get table data
    - Type: `(table: string) => unknown[]`
    - Retrieves data from internal Map
    - Returns empty array if table not found
    - Not part of real database API (test-only)

**PreparedStatement** (returned by `prepare`):
- `all: vi.fn` - Execute query and return all rows
  - Type: `() => unknown[]`
  - Returns empty array by default unless data set via `_setData`
- `get: vi.fn` - Execute query and return first row
  - Type: `() => unknown | null`
  - Returns `null` by default unless data set via `_setData`
- `run: vi.fn` - Execute query and return metadata
  - Type: `() => { lastInsertRowid: number, changes: number }`
  - Returns `{ lastInsertRowid: 1, changes: 1 }` by default

**Common Usage Patterns:**

```typescript
// 1. Basic query with data setup
const db = createMockDatabase();
const stations = [
  { id: "725", name: "Times Square" },
  { id: "726", name: "Penn Station" }
];
db._setData("stations", stations);

const stmt = db.prepare("SELECT * FROM stations");
const results = stmt.all();
expect(results).toEqual(stations);

// 2. Testing single row queries
const db = createMockDatabase();
db._setData("users", [{ id: 1, name: "Alice" }]);

const stmt = db.prepare("SELECT * FROM users WHERE id = 1");
const user = stmt.get();
expect(user).toEqual({ id: 1, name: "Alice" });

// 3. Testing INSERT operations
const db = createMockDatabase();
const stmt = db.prepare("INSERT INTO users (name) VALUES (?)");
const result = stmt.run("Bob");
expect(result).toEqual({ lastInsertRowid: 1, changes: 1 });
expect(db.prepare).toHaveBeenCalledWith("INSERT INTO users (name) VALUES (?)");

// 4. Testing transaction patterns
const db = createMockDatabase();
const result = db.transaction(() => {
  db.prepare("INSERT INTO users (name) VALUES (?)").run("Charlie");
  db.prepare("INSERT INTO posts (title) VALUES (?)").run("First Post");
  return "success";
});
expect(result).toBe("success");
expect(db.prepare).toHaveBeenCalledTimes(2);

// 5. Testing database operations in a service
const db = createMockDatabase();
db._setData("arrivals", [{ line: "1", minutesAway: 2 }]);
const service = new ArrivalService(db);

const arrivals = await service.getArrivals("1");
expect(arrivals).toHaveLength(1);
expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("arrivals"));

// 6. Testing PRAGMA calls
const db = createMockDatabase();
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
expect(db.pragma).toHaveBeenCalledWith("journal_mode = WAL");
expect(db.pragma).toHaveBeenCalledWith("foreign_keys = ON");

// 7. Testing DDL statements
const db = createMockDatabase();
db.exec("CREATE TABLE stations (id TEXT PRIMARY KEY, name TEXT)");
db.exec("CREATE INDEX idx_stations_id ON stations(id)");
expect(db.exec).toHaveBeenCalledWith("CREATE TABLE stations (id TEXT PRIMARY KEY, name TEXT)");
expect(db.exec).toHaveBeenCalledTimes(2);

// 8. Verifying query parameters
const db = createMockDatabase();
const stmt = db.prepare("SELECT * FROM stations WHERE id = ?");
stmt.get("725");
expect(stmt.get).toHaveBeenCalledWith("725");

// 9. Testing database cleanup
const db = createMockDatabase();
const service = new DatabaseService(db);
await service.close();
expect(db.close).toHaveBeenCalled();

// 10. Empty result handling
const db = createMockDatabase();
db._setData("stations", []); // Empty table
const stmt = db.prepare("SELECT * FROM stations");
const results = stmt.all();
expect(results).toEqual([]);
```

**Advanced Usage Patterns:**

```typescript
// 1. Testing data persistence across operations
const db = createMockDatabase();
db._setData("stations", [{ id: "725", name: "Times Square" }]);

const stmt1 = db.prepare("SELECT * FROM stations");
const stmt2 = db.prepare("SELECT * FROM stations"); // Different statement
expect(stmt1.all()).toEqual(stmt2.all()); // Same data

// 2. Testing multiple tables
const db = createMockDatabase();
db._setData("stations", [{ id: "725" }]);
db._setData("arrivals", [{ line: "1" }]);

const stations = db.prepare("SELECT * FROM stations").all();
const arrivals = db.prepare("SELECT * FROM arrivals").all();
expect(stations).toHaveLength(1);
expect(arrivals).toHaveLength(1);

// 3. Testing rollback patterns (mocked)
const db = createMockDatabase();
let shouldRollback = true;
db.transaction(() => {
  db.prepare("INSERT INTO users (name) VALUES (?)").run("Alice");
  if (shouldRollback) {
    throw new Error("Rollback");
  }
});
// In real DB, rollback would happen - mock just tracks calls
expect(db.prepare).toHaveBeenCalled();

// 4. Testing batch operations
const db = createMockDatabase();
db._setData("users", Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: `User ${i + 1}` })));

const stmt = db.prepare("SELECT * FROM users");
const users = stmt.all();
expect(users).toHaveLength(100);

// 5. Testing connection lifecycle
const db = createMockDatabase();
const service = new DatabaseService(db);
await service.initialize();
expect(db.pragma).toHaveBeenCalledWith(expect.stringContaining("journal_mode"));
await service.cleanup();
expect(db.close).toHaveBeenCalled();

// 6. Testing error handling in queries
const db = createMockDatabase();
const stmt = db.prepare("SELECT * FROM nonexistent");
const results = stmt.all();
expect(results).toEqual([]); // No error, just empty results
expect(db.prepare).toHaveBeenCalledWith("SELECT * FROM nonexistent");

// 7. Testing prepared statement reuse
const db = createMockDatabase();
db._setData("stations", [{ id: "725" }, { id: "726" }]);

const stmt = db.prepare("SELECT * FROM stations WHERE id = ?");
const station1 = stmt.get("725");
const station2 = stmt.get("726");
expect(stmt.get).toHaveBeenCalledTimes(2);

// 8. Testing complex queries with joins
const db = createMockDatabase();
db._setData("stations_arrivals", [{ line: "1", destination: "Van Cortlandt" }]);
const stmt = db.prepare(`
  SELECT s.*, a.line 
  FROM stations s 
  JOIN arrivals a ON s.id = a.station_id
`);
const results = stmt.all();
expect(results).toHaveLength(1);
```

**Edge Cases & Gotchas:**

- **Data must be set before queries**: `_setData` must be called before `prepare().all()`
  ```typescript
  const db = createMockDatabase();
  const stmt = db.prepare("SELECT * FROM stations");
  const results = stmt.all(); // Returns [] (no data set)
  
  db._setData("stations", [{ id: "725" }]);
  const results2 = stmt.all(); // Still [] (new statement needed)
  const stmt2 = db.prepare("SELECT * FROM stations");
  const results3 = stmt2.all(); // Returns data
  ```

- **Table name matching**: `_setData` table name must match query intent
  ```typescript
  db._setData("stations", [{ id: "725" }]);
  const stmt = db.prepare("SELECT * FROM users"); // Wrong table
  const results = stmt.all(); // Returns [] (no users data)
  ```

- **Transaction isolation not mocked**: Transactions execute immediately
  ```typescript
  const db = createMockDatabase();
  db.transaction(() => {
    db.prepare("INSERT INTO users (name) VALUES (?)").run("Alice");
    // Changes visible immediately, no rollback support
  });
  ```

- **Statement independence**: Each `prepare()` call creates new spy
  ```typescript
  const db = createMockDatabase();
  const stmt1 = db.prepare("SELECT * FROM stations");
  const stmt2 = db.prepare("SELECT * FROM stations");
  
  stmt1.all();
  expect(stmt1.all).toHaveBeenCalledTimes(1);
  expect(stmt2.all).toHaveBeenCalledTimes(0); // Different spy
  ```

- **No SQL validation**: Any SQL string is accepted without parsing
  ```typescript
  const db = createMockDatabase();
  db.prepare("INVALID SQL SYNTAX HERE").all(); // No error
  // Mock doesn't validate SQL - just tracks calls
  ```

- **Empty table vs missing table**: Both return empty array
  ```typescript
  const db = createMockDatabase();
  db._setData("stations", []); // Empty table
  const stmt = db.prepare("SELECT * FROM stations");
  expect(stmt.all()).toEqual([]); // Empty array
  
  const stmt2 = db.prepare("SELECT * FROM users"); // Table never set
  expect(stmt2.all()).toEqual([]); // Also empty array
  ```

- **_setData overwrites previous data**: No append/merge behavior
  ```typescript
  const db = createMockDatabase();
  db._setData("stations", [{ id: "725" }]);
  db._setData("stations", [{ id: "726" }]); // Overwrites
  const stmt = db.prepare("SELECT * FROM stations");
  expect(stmt.all()).toEqual([{ id: "726" }]); // Only second dataset
  ```

- **get() returns null by default**: Even with data, need to match row
  ```typescript
  const db = createMockDatabase();
  db._setData("users", [{ id: 1, name: "Alice" }]);
  const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
  const user = stmt.get(2); // Wrong ID
  expect(user).toBeNull(); // Returns null (no filtering logic)
  ```

**Performance Considerations:**

- Mock operations are O(1) - no actual SQL execution
- Data stored in memory Map - fast lookups
- No query planning or optimization overhead
- For large datasets (>10,000 rows), consider real database integration tests
- Mock creation is fast but not free - create fresh per test when possible

**Real-World Testing Scenarios:**

```typescript
// 1. Testing repository pattern with database
test("StationRepository loads stations from database", async () => {
  const db = createMockDatabase();
  db._setData("stations", [
    { id: "725", name: "Times Square", lat: 40.7589, lon: -73.9851 }
  ]);
  
  const repository = new StationRepository(db);
  const stations = await repository.getAll();
  
  expect(stations).toHaveLength(1);
  expect(stations[0].name).toBe("Times Square");
  expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("stations"));
});

// 2. Testing data access layer error handling
test("DatabaseService handles connection failures", async () => {
  const db = createMockDatabase();
  db.prepare.mockImplementationOnce(() => {
    throw new Error("Connection lost");
  });
  
  const service = new DatabaseService(db);
  await expect(service.getStations()).rejects.toThrow("Connection lost");
});

// 3. Testing migration scripts
test("Migration creates tables and indexes", () => {
  const db = createMockDatabase();
  const migrations = new DatabaseMigrations(db);
  
  migrations.up();
  
  expect(db.exec).toHaveBeenCalledWith(expect.stringContaining("CREATE TABLE"));
  expect(db.exec).toHaveBeenCalledWith(expect.stringContaining("CREATE INDEX"));
});

// 4. Testing transaction retry logic
test("Transaction retries on deadlock", async () => {
  const db = createMockDatabase();
  let attempts = 0;
  db.transaction.mockImplementation((fn) => {
    attempts++;
    if (attempts < 3) {
      throw new Error("Database is deadlocked");
    }
    return fn();
  });
  
  await retryTransaction(db, () => db.prepare("INSERT INTO users VALUES (1)").run());
  expect(attempts).toBe(3);
});
```

---

#### `createMockResponse(data, status?)`

Creates a mock HTTP response object with fetch-like interface for testing API interactions, error handling, and response validation.

**Signature:**
```typescript
function createMockResponse(data: unknown, status?: number): MockResponse
```

**Parameters:**
- `data: unknown` - Response body data
  - Type: `unknown` (accepts any JSON-serializable value)
  - Can be object, array, string, number, boolean, null
  - Used for both `json()` and `text()` response methods
  - Stored internally and returned from both methods
- `status` (optional): HTTP status code
  - Type: `number`
  - Default: `200`
  - Valid range: 100-599 (standard HTTP status codes)
  - Determines `ok` property: `status >= 200 && status < 300`
  - Common values: 200 (OK), 201 (Created), 204 (No Content), 400 (Bad Request), 404 (Not Found), 500 (Server Error)

**Returns:**
- `MockResponse` object with properties:
  - `ok: boolean` - `true` if `status >= 200 && status < 300` (2xx status codes)
  - `status: number` - HTTP status code (the value passed in or default 200)
  - `json(): Promise<unknown>` - Async method that resolves to the `data` parameter
  - `text(): Promise<string>` - Async method that resolves to `JSON.stringify(data)`
  - `headers: Headers` - Browser `Headers` object with `content-type: application/json`

**Common Usage Patterns:**

```typescript
// 1. Basic success response
const response = createMockResponse({ arrivals: [] }, 200);
expect(response.ok).toBe(true);
expect(response.status).toBe(200);
const data = await response.json();
expect(data).toEqual({ arrivals: [] });

// 2. Error response (404 Not Found)
const notFound = createMockResponse({ error: "Station not found" }, 404);
expect(notFound.ok).toBe(false);
expect(notFound.status).toBe(404);

// 3. Server error response (500 Internal Server Error)
const serverError = createMockResponse({ error: "Database connection failed" }, 500);
expect(serverError.ok).toBe(false);
expect(serverError.status).toBe(500);

// 4. Created response (201)
const created = createMockResponse({ id: "123", name: "Test" }, 201);
expect(created.ok).toBe(true);
expect(created.status).toBe(201);

// 5. Array response
const arrayResponse = createMockResponse([
  { id: "1", name: "Item 1" },
  { id: "2", name: "Item 2" }
], 200);
const items = await arrayResponse.json();
expect(items).toHaveLength(2);

// 6. Text response using text() method
const textResponse = createMockResponse({ message: "Hello" }, 200);
const text = await textResponse.text();
expect(text).toBe('{"message":"Hello"}');

// 7. Null response body
const nullResponse = createMockResponse(null, 204);
const data = await nullResponse.json();
expect(data).toBeNull();

// 8. String response
const stringResponse = createMockResponse("Plain text response", 200);
const text = await stringResponse.text();
expect(text).toBe('"Plain text response"'); // JSON-encoded string

// 9. Number response
const numberResponse = createMockResponse(42, 200);
const num = await numberResponse.json();
expect(num).toBe(42);

// 10. Boolean response
const boolResponse = createMockResponse(true, 200);
const bool = await boolResponse.json();
expect(bool).toBe(true);
```

**Advanced Usage Patterns:**

```typescript
// 1. Testing API error handling
test("handles 404 errors gracefully", async () => {
  const mockFetch = vi.fn().mockResolvedValue(
    createMockResponse({ error: "Not found" }, 404)
  );

  const result = await fetchArrivals(mockFetch, "999");
  expect(result.error).toBe("Not found");
  expect(result.success).toBe(false);
});

// 2. Testing success/error paths
test("distinguishes success from failure", async () => {
  const success = createMockResponse({ data: "value" }, 200);
  const failure = createMockResponse({ error: "Failed" }, 500);

  expect(success.ok).toBe(true);
  expect(failure.ok).toBe(false);
});

// 3. Testing response header inspection
test("response has correct headers", async () => {
  const response = createMockResponse({ data: "test" }, 200);
  
  expect(response.headers.get("content-type")).toBe("application/json");
});

// 4. Testing with different content types (via override)
test("can create custom content type responses", async () => {
  const baseResponse = createMockResponse("text content", 200);
  const customHeaders = new Headers({
    "content-type": "text/plain"
  });
  const response = { ...baseResponse, headers: customHeaders };
  
  expect(response.headers.get("content-type")).toBe("text/plain");
});

// 5. Testing JSON parsing errors (mocked)
test("handles JSON parsing gracefully", async () => {
  const response = createMockResponse({ invalid: "data" }, 200);
  const data = await response.json();
  // Mock always returns data, no parsing errors
  expect(data).toEqual({ invalid: "data" });
});

// 6. Testing response status codes
test("validates status code ranges", async () => {
  const ok = createMockResponse({}, 200);
  const redirect = createMockResponse({}, 301);
  const clientError = createMockResponse({}, 400);
  const serverError = createMockResponse({}, 500);

  expect(ok.ok).toBe(true); // 2xx
  expect(redirect.ok).toBe(false); // 3xx
  expect(clientError.ok).toBe(false); // 4xx
  expect(serverError.ok).toBe(false); // 5xx
});

// 7. Testing response body validation
test("validates response body structure", async () => {
  const response = createMockResponse({
    arrivals: [],
    alerts: [],
    timestamp: Date.now()
  }, 200);

  const data = await response.json();
  assertHasProperties(data, ["arrivals", "alerts", "timestamp"]);
});

// 8. Testing empty responses
test("handles empty object response", async () => {
  const response = createMockResponse({}, 204);
  const data = await response.json();
  expect(data).toEqual({});
});

// 9. Testing chained API calls
test("simulates multiple API responses", async () => {
  const mockFetch = vi.fn()
    .mockResolvedValueOnce(createMockResponse({ arrivals: [] }, 200))
    .mockResolvedValueOnce(createMockResponse({ alerts: [] }, 200))
    .mockResolvedValueOnce(createMockResponse({ stations: [] }, 200));

  const arrivals = await mockFetch("/api/arrivals");
  const alerts = await mockFetch("/api/alerts");
  const stations = await mockFetch("/api/stations");

  expect(mockFetch).toHaveBeenCalledTimes(3);
  expect((await arrivals.json()).arrivals).toEqual([]);
  expect((await alerts.json()).alerts).toEqual([]);
  expect((await stations.json()).stations).toEqual([]);
});

// 10. Testing with realistic data structures
test("handles complex nested objects", async () => {
  const complexData = {
    stations: [
      { id: "725", name: "Times Square", lines: ["1", "2", "3"] },
      { id: "726", name: "Penn Station", lines: ["A", "C", "E"] }
    ],
    metadata: {
      timestamp: Date.now(),
      version: "1.0",
      source: "gtfs"
    },
    alerts: [
      { id: "1", severity: "warning", affectedLines: ["1"] }
    ]
  };

  const response = createMockResponse(complexData, 200);
  const data = await response.json();

  expect(data.stations).toHaveLength(2);
  expect(data.metadata.version).toBe("1.0");
  expect(data.alerts).toHaveLength(1);
});
```

**Edge Cases & Gotchas:**

- **`ok` property calculation**: Based on status code range, not data content
  ```typescript
  const okStatus = createMockResponse({ error: "Internal error" }, 200);
  expect(okStatus.ok).toBe(true); // true even though error in data

  const notOkStatus = createMockResponse({ success: true }, 500);
  expect(notOkStatus.ok).toBe(false); // false even though success in data
  ```

- **`json()` and `text()` return Promises**: Must be awaited, cannot access synchronously
  ```typescript
  const response = createMockResponse({ data: "test" }, 200);
  const data = response.json(); // Returns Promise, not data
  // Need: await response.json()
  ```

- **`text()` returns JSON-encoded string**: Always JSON.stringify, even for strings
  ```typescript
  const response = createMockResponse("plain text", 200);
  const text = await response.text();
  expect(text).toBe('"plain text"'); // JSON-encoded, not "plain text"
  ```

- **`data` parameter is stored directly**: No deep cloning, modifications affect response
  ```typescript
  const mutableData = { items: [] };
  const response = createMockResponse(mutableData, 200);
  mutableData.items.push("new item"); // Affects response data
  const data = await response.json();
  expect(data.items).toEqual(["new item"]);
  ```

- **Status code defaults to 200**: Omitting status gives successful response
  ```typescript
  const response = createMockResponse({ data: "test" });
  expect(response.status).toBe(200); // Default
  expect(response.ok).toBe(true);
  ```

- **Headers are always `content-type: application/json`**: Cannot override via parameter
  ```typescript
  const response = createMockResponse({ data: "test" }, 200);
  expect(response.headers.get("content-type")).toBe("application/json");
  // Must manually create Headers object for other content types
  ```

- **Non-2xx status codes are `not ok`**: Includes redirects (3xx), client errors (4xx), server errors (5xx)
  ```typescript
  const redirect = createMockResponse({}, 301);
  const clientError = createMockResponse({}, 400);
  const serverError = createMockResponse({}, 500);

  expect(redirect.ok).toBe(false);
  expect(clientError.ok).toBe(false);
  expect(serverError.ok).toBe(false);
  ```

- **`data` can be any JSON-serializable value**: Including null, primitives, arrays
  ```typescript
  const nullResp = createMockResponse(null);
  const numResp = createMockResponse(42);
  const strResp = createMockResponse("text");
  const boolResp = createMockResponse(true);
  const arrResp = createMockResponse([1, 2, 3]);
  const objResp = createMockResponse({ key: "value" });

  expect(await nullResp.json()).toBeNull();
  expect(await numResp.json()).toBe(42);
  expect(await strResp.json()).toBe("text");
  expect(await boolResp.json()).toBe(true);
  expect(await arrResp.json()).toEqual([1, 2, 3]);
  expect(await objResp.json()).toEqual({ key: "value" });
  ```

- **Response object is plain object**: Not a real Response instance
  ```typescript
  const response = createMockResponse({ data: "test" }, 200);
  expect(response).not.toBeInstanceOf(Response); // Plain object
  // But has compatible interface for testing
  expect(response.json).toBeDefined();
  expect(response.ok).toBeDefined();
  ```

- **No automatic body encoding**: Assumes data is already JSON-serializable
  ```typescript
  // This works (JSON-serializable)
  const response1 = createMockResponse({ date: new Date() }); // Date loses type info
  
  // This also works but Date becomes ISO string
  const data = await response1.json();
  expect(typeof data.date).toBe("string"); // "2026-08-30T..."
  ```

**Performance Considerations:**

- Response creation is O(1) - just object creation
- `json()` and `text()` resolve immediately (no actual parsing)
- No network overhead - purely in-memory
- Suitable for high-frequency testing (1000s of calls per test)
- No streaming - entire response always in memory

---

#### `createMockFetch(responses)`

Creates a mock `fetch` function with predefined responses for testing HTTP clients, API interactions, and network failure scenarios without real network calls.

**Signature:**
```typescript
function createMockFetch(
  responses: Array<{ url: string, response: ReturnType<typeof createMockResponse> }>
): vi.fn
```

**Parameters:**
- `responses: Array<{ url: string, response: MockResponse }>` - Array of URL-response mappings
  - `url: string` - URL or URL substring to match (uses `url.includes()` matching)
  - `response: MockResponse` - Response object from `createMockResponse()`
  - Array can be empty (returns 404 for all requests)
  - Order doesn't matter - matches any URL in responses array
  - Multiple URLs can match the same request (first match wins)

**Returns:**
- `vi.fn` - Vitest mock function with fetch-like interface
  - Accepts `(url: string)` or `(url: string, options: RequestInit)`
  - Returns `Promise<MockResponse>` matching the URL
  - Returns 404 response if no URL match found
  - Can assert on calls with `expect(mockFetch).toHaveBeenCalledWith(url)`
  - Can inspect call history with `mockFetch.mock.calls`

**Common Usage Patterns:**

```typescript
// 1. Basic mock fetch with single endpoint
const mockFetch = createMockFetch([
  { url: "/api/arrivals", response: createMockResponse({ arrivals: [] }) }
]);

const result = await mockFetch("/api/arrivals");
const data = await result.json();
expect(data.arrivals).toEqual([]);

// 2. Multiple endpoints
const mockFetch = createMockFetch([
  { url: "/api/arrivals", response: createMockResponse({ arrivals: [] }) },
  { url: "/api/alerts", response: createMockResponse({ alerts: [] }) },
  { url: "/api/stations", response: createMockResponse({ stations: [] }) }
]);

const arrivals = await mockFetch("/api/arrivals");
const alerts = await mockFetch("/api/alerts");
const stations = await mockFetch("/api/stations");

// 3. Error responses
const mockFetch = createMockFetch([
  { url: "/api/arrivals/999", response: createMockResponse({ error: "Not found" }, 404) },
  { url: "/api/error", response: createMockResponse({ error: "Server error" }, 500) }
]);

const notFound = await mockFetch("/api/arrivals/999");
expect(notFound.status).toBe(404);

// 4. URL substring matching
const mockFetch = createMockFetch([
  { url: "/api/arrivals", response: createMockResponse({ data: "arrivals" }) }
]);

// All these match the same response
await mockFetch("/api/arrivals");         // Exact match
await mockFetch("/api/arrivals/725");     // Substring match
await mockFetch("https://example.com/api/arrivals"); // Substring match

// 5. Empty responses array (404 for everything)
const mockFetch = createMockFetch([]);
const result = await mockFetch("/api/anything");
expect(result.status).toBe(404);

// 6. Asserting on fetch calls
const mockFetch = createMockFetch([
  { url: "/api/arrivals", response: createMockResponse({ arrivals: [] }) }
]);

await mockFetch("/api/arrivals");
expect(mockFetch).toHaveBeenCalledWith("/api/arrivals");
expect(mockFetch).toHaveBeenCalledTimes(1);
```

**Advanced Usage Patterns:**

```typescript
// 1. Testing API client with error handling
test("API client handles 404 gracefully", async () => {
  const mockFetch = createMockFetch([
    { url: "/api/arrivals/999", response: createMockResponse({ error: "Not found" }, 404) }
  ]);

  const client = new ApiClient(mockFetch);
  const result = await client.getArrivals("999");

  expect(result.success).toBe(false);
  expect(result.error).toBe("Not found");
});

// 2. Testing retry logic with multiple responses
test("retries on failure", async () => {
  const mockFetch = createMockFetch([
    { url: "/api/data", response: createMockResponse({ error: "Timeout" }, 500) },
    { url: "/api/data", response: createMockResponse({ data: "success" }, 200) }
  ]);

  let attempts = 0;
  const result = await retryFetch(mockFetch, "/api/data", {
    maxAttempts: 2,
    onAttempt: () => { attempts++; }
  });

  expect(attempts).toBe(2);
  expect((await result.json()).data).toBe("success");
});

// 3. Testing request method and options
test("passes fetch options correctly", async () => {
  const mockFetch = createMockFetch([
    { url: "/api/data", response: createMockResponse({ success: true }) }
  ]);

  await mockFetch("/api/data", { method: "POST", body: JSON.stringify({ test: true }) });

  expect(mockFetch).toHaveBeenCalledWith(
    "/api/data",
    expect.objectContaining({ method: "POST" })
  );
});

// 4. Testing sequential vs parallel requests
test("handles parallel requests", async () => {
  const mockFetch = createMockFetch([
    { url: "/api/1", response: createMockResponse({ id: 1 }) },
    { url: "/api/2", response: createMockResponse({ id: 2 }) },
    { url: "/api/3", response: createMockResponse({ id: 3 }) }
  ]);

  const results = await Promise.all([
    mockFetch("/api/1"),
    mockFetch("/api/2"),
    mockFetch("/api/3")
  ]);

  expect(results).toHaveLength(3);
  expect(mockFetch).toHaveBeenCalledTimes(3);
});

// 5. Testing URL matching behavior
test("matches URLs by substring", async () => {
  const mockFetch = createMockFetch([
    { url: "/api/arrivals", response: createMockResponse({ matched: "arrivals" }) }
  ]);

  const result1 = await mockFetch("/api/arrivals");
  const result2 = await mockFetch("/api/arrivals/725");
  const result3 = await mockFetch("https://example.com/api/arrivals");

  expect((await result1.json()).matched).toBe("arrivals");
  expect((await result2.json()).matched).toBe("arrivals");
  expect((await result3.json()).matched).toBe("arrivals");
});

// 6. Testing 404 for unmatched URLs
test("returns 404 for unmatched URLs", async () => {
  const mockFetch = createMockFetch([
    { url: "/api/arrivals", response: createMockResponse({ data: "matched" }) }
  ]);

  const matched = await mockFetch("/api/arrivals");
  const unmatched = await mockFetch("/api/other");

  expect(matched.status).toBe(200);
  expect(unmatched.status).toBe(404);
});

// 7. Testing with query parameters
test("matches URLs with query parameters", async () => {
  const mockFetch = createMockFetch([
    { url: "/api/arrivals", response: createMockResponse({ data: "test" }) }
  ]);

  const result = await mockFetch("/api/arrivals?station=725&direction=N");
  const data = await result.json();

  expect(data.data).toBe("test");
});

// 8. Testing call history inspection
test("tracks all fetch calls", async () => {
  const mockFetch = createMockFetch([
    { url: "/api/1", response: createMockResponse({ id: 1 }) },
    { url: "/api/2", response: createMockResponse({ id: 2 }) }
  ]);

  await mockFetch("/api/1");
  await mockFetch("/api/2");
  await mockFetch("/api/1");

  expect(mockFetch.mock.calls.length).toBe(3);
  expect(mockFetch.mock.calls[0][0]).toBe("/api/1");
  expect(mockFetch.mock.calls[1][0]).toBe("/api/2");
  expect(mockFetch.mock.calls[2][0]).toBe("/api/1");
});

// 9. Testing authentication headers
test("passes auth headers in fetch options", async () => {
  const mockFetch = createMockFetch([
    { url: "/api/data", response: createMockResponse({ authenticated: true }) }
  ]);

  await mockFetch("/api/data", {
    headers: { "Authorization": "Bearer token123" }
  });

  expect(mockFetch).toHaveBeenCalledWith("/api/data", expect.objectContaining({
    headers: expect.objectContaining({ "Authorization": "Bearer token123" })
  }));
});

// 10. Testing progressive responses
test("simulates changing data over time", async () => {
  const responses = [
    createMockResponse({ count: 1 }),
    createMockResponse({ count: 2 }),
    createMockResponse({ count: 3 })
  ];

  let callCount = 0;
  const mockFetch = vi.fn((url: string) => Promise.resolve(responses[callCount++]));

  const result1 = await mockFetch("/api/arrivals");
  const result2 = await mockFetch("/api/arrivals");
  const result3 = await mockFetch("/api/arrivals");

  expect((await result1.json()).count).toBe(1);
  expect((await result2.json()).count).toBe(2);
  expect((await result3.json()).count).toBe(3);
});
```

**Edge Cases & Gotchas:**

- **URL matching is substring-based**: Matches any URL containing the pattern
  ```typescript
  const mockFetch = createMockFetch([
    { url: "/api/arrivals", response: createMockResponse({ matched: true }) }
  ]);

  // All these match!
  await mockFetch("/api/arrivals");         // Exact match
  await mockFetch("/api/arrivals/725");     // Substring match
  await mockFetch("/api/arrivals?page=1");  // Query string match
  await mockFetch("https://example.com/api/arrivals"); // Full URL match

  // Even this matches (substring)
  await mockFetch("/api/arrivals-and-alerts"); // Matches "arrivals" substring
  ```

- **Returns 404 if no match found**: Always returns `{ error: "Not found" }` with status 404
  ```typescript
  const mockFetch = createMockFetch([
    { url: "/api/arrivals", response: createMockResponse({ data: "test" }) }
  ]);

  const unmatched = await mockFetch("/api/other");
  expect(unmatched.status).toBe(404);
  expect((await unmatched.json()).error).toBe("Not found");
  ```

- **Order doesn't matter for matching**: Matches any URL in responses array
  ```typescript
  const mockFetch = createMockFetch([
    { url: "/api/2", response: createMockResponse({ id: 2 }) },
    { url: "/api/1", response: createMockResponse({ id: 1 }) },
    { url: "/api/3", response: createMockResponse({ id: 3 }) }
  ]);

  // All work regardless of order in array
  const r1 = await mockFetch("/api/1");
  const r2 = await mockFetch("/api/2");
  const r3 = await mockFetch("/api/3");
  ```

- **First match wins for overlapping URLs**: If multiple patterns match, first in array wins
  ```typescript
  const mockFetch = createMockFetch([
    { url: "/api", response: createMockResponse({ match: "general" }) },
    { url: "/api/arrivals", response: createMockResponse({ match: "specific" }) }
  ]);

  // Matches first pattern (/api), not second (/api/arrivals)
  const result = await mockFetch("/api/arrivals");
  expect((await result.json()).match).toBe("general"); // Not "specific"
  ```

- **Empty responses array**: All requests return 404
  ```typescript
  const mockFetch = createMockFetch([]);
  const result = await mockFetch("/api/anything");
  expect(result.status).toBe(404);
  ```

- **Vitest mock function**: Has all Vitest mock features
  ```typescript
  const mockFetch = createMockFetch([
    { url: "/api/test", response: createMockResponse({ data: "test" }) }
  ]);

  await mockFetch("/api/test");

  // Can inspect calls
  expect(mockFetch).toHaveBeenCalled();
  expect(mockFetch).toHaveBeenCalledTimes(1);
  expect(mockFetch).toHaveBeenCalledWith("/api/test");

  // Can clear calls
  mockFetch.mockClear();
  expect(mockFetch).not.toHaveBeenCalled();

  // Can mock reset
  mockFetch.mockReset();
  ```

- **Accepts fetch options**: Second parameter passed to mock function
  ```typescript
  const mockFetch = createMockFetch([
    { url: "/api/data", response: createMockResponse({ received: true }) }
  ]);

  await mockFetch("/api/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ test: true })
  });

  expect(mockFetch).toHaveBeenCalledWith("/api/data", expect.objectContaining({
    method: "POST"
  }));
  ```

- **No actual network calls**: Purely in-memory, no network overhead
  ```typescript
  const mockFetch = createMockFetch([
    { url: "/api/slow", response: createMockResponse({ data: "fast" }) }
  ]);

  // Returns immediately, no network delay
  const start = Date.now();
  await mockFetch("/api/slow");
  const elapsed = Date.now() - start;

  expect(elapsed).toBeLessThan(10); // Very fast, no network
  ```

- **Response objects are not cloned**: Same object returned for matching URLs
  ```typescript
  const response = createMockResponse({ data: "test" });
  const mockFetch = createMockFetch([
    { url: "/api/test", response }
  ]);

  const r1 = await mockFetch("/api/test");
  const r2 = await mockFetch("/api/test");

  expect(r1).toBe(r2); // Same object reference
  ```

**Performance Considerations:**

- Matching is O(n) where n = number of response mappings
- For large response arrays (>100), consider using more specific URLs
- No network overhead - suitable for high-frequency testing
- Mock function call tracking adds minimal overhead
- Response objects created once at setup, not per call

---

#### `createMockHeaders(overrides?)`

Creates mock HTTP headers with standard defaults for testing request/response headers, authentication, content negotiation, and custom header validation.

**Signature:**
```typescript
function createMockHeaders(overrides?: Record<string, string>): Headers
```

**Parameters:**
- `overrides` (optional): Header key-value pairs to add/override
  - Type: `Record<string, string>`
  - Keys are case-insensitive (per HTTP spec)
  - Values are always strings
  - Empty object `{}` returns only default headers
  - Can override default headers by using same key
  - Can add new headers not in defaults

**Returns:**
- `Headers` object (real browser Headers, not a mock)
  - Default headers:
    - `content-type: application/json`
    - `user-agent: test-agent`
  - Includes all headers from `overrides` parameter
  - Overridden defaults: same key in `overrides` replaces default value
  - Methods: `get()`, `set()`, `has()`, `delete()`, `entries()`, `keys()`, `values()`, `forEach()`

**Common Usage Patterns:**

```typescript
// 1. Basic usage with default headers
const headers = createMockHeaders();
expect(headers.get("content-type")).toBe("application/json");
expect(headers.get("user-agent")).toBe("test-agent");

// 2. Adding custom headers
const headers = createMockHeaders({
  "authorization": "Bearer token123",
  "x-custom-header": "value"
});
expect(headers.get("authorization")).toBe("Bearer token123");
expect(headers.get("x-custom-header")).toBe("value");

// 3. Overriding default headers
const headers = createMockHeaders({
  "content-type": "text/plain",
  "user-agent": "custom-agent"
});
expect(headers.get("content-type")).toBe("text/plain"); // Overridden
expect(headers.get("user-agent")).toBe("custom-agent"); // Overridden

// 4. Authentication headers
const authHeaders = createMockHeaders({
  "authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
});
expect(authHeaders.get("authorization")).toContain("Bearer");

// 5. API key headers
const apiKeyHeaders = createMockHeaders({
  "x-api-key": "sk_test_123456789",
  "authorization": "Bearer api_key"
});

// 6. Content negotiation headers
const contentHeaders = createMockHeaders({
  "accept": "application/json",
  "accept-encoding": "gzip, deflate",
  "accept-language": "en-US,en;q=0.9"
});

// 7. CORS headers
const corsHeaders = createMockHeaders({
  "origin": "https://example.com",
  "access-control-request-method": "POST",
  "access-control-request-headers": "content-type"
});

// 8. Cache control headers
const cacheHeaders = createMockHeaders({
  "cache-control": "no-cache",
  "pragma": "no-cache",
  "expires": "0"
});

// 9. CSRF token headers
const csrfHeaders = createMockHeaders({
  "x-csrf-token": "abc123def456",
  "referer": "https://example.com"
});

// 10. Multiple headers of same type (not supported - Headers object enforces uniqueness)
const headers = createMockHeaders({
  "set-cookie": "session=abc; Path=/",
  "set-cookie": "token=xyz; HttpOnly" // This overwrites the first
});
expect(headers.get("set-cookie")).toBe("token=xyz; HttpOnly");
```

**Advanced Usage Patterns:**

```typescript
// 1. Testing header validation
test("validates required headers", () => {
  const headers = createMockHeaders({
    "authorization": "Bearer token",
    "x-api-version": "2"
  });

  expect(hasRequiredHeaders(headers, ["authorization", "x-api-version"])).toBe(true);
});

// 2. Testing header case insensitivity
test("headers are case-insensitive", () => {
  const headers = createMockHeaders({
    "Authorization": "Bearer token",
    "Content-Type": "application/xml"
  });

  expect(headers.get("authorization")).toBe("Bearer token");
  expect(headers.get("Authorization")).toBe("Bearer token");
  expect(headers.get("CONTENT-TYPE")).toBe("application/xml");
});

// 3. Testing header methods
test("Headers object supports all standard methods", () => {
  const headers = createMockHeaders({
    "x-test": "value"
  });

  expect(headers.has("x-test")).toBe(true);
  expect(headers.get("x-test")).toBe("value");
  
  headers.set("x-test", "new-value");
  expect(headers.get("x-test")).toBe("new-value");
  
  headers.delete("x-test");
  expect(headers.has("x-test")).toBe(false);
});

// 4. Testing header iteration
test("can iterate over headers", () => {
  const headers = createMockHeaders({
    "x-header-1": "value1",
    "x-header-2": "value2",
    "x-header-3": "value3"
  });

  const headerArray = Array.from(headers.entries());
  expect(headerArray).toHaveLength(5); // 3 custom + 2 defaults
});

// 5. Testing authentication schemes
test("supports various authentication schemes", () => {
  const bearer = createMockHeaders({
    "authorization": "Bearer token123"
  });
  
  const basic = createMockHeaders({
    "authorization": "Basic dXNlcjpwYXNz"
  });
  
  const apiKey = createMockHeaders({
    "authorization": "ApiKey abc123"
  });

  expect(bearer.get("authorization")).toMatch(/^Bearer/);
  expect(basic.get("authorization")).toMatch(/^Basic/);
  expect(apiKey.get("authorization")).toMatch(/^ApiKey/);
});

// 6. Testing conditional request headers
test("conditional request headers", () => {
  const headers = createMockHeaders({
    "if-none-match": '"33a64df551425fcc55e4d42a148795d9f25f89d4"',
    "if-modified-since": "Mon, 18 Aug 2026 12:00:00 GMT"
  });

  expect(headers.get("if-none-match")).toBeDefined();
  expect(headers.get("if-modified-since")).toBeDefined();
});

// 7. Testing content-type variations
test("different content-type values", () => {
  const json = createMockHeaders({ "content-type": "application/json" });
  const xml = createMockHeaders({ "content-type": "application/xml" });
  const form = createMockHeaders({ "content-type": "application/x-www-form-urlencoded" });
  const text = createMockHeaders({ "content-type": "text/plain" });
  const html = createMockHeaders({ "content-type": "text/html" });

  expect(json.get("content-type")).toBe("application/json");
  expect(xml.get("content-type")).toBe("application/xml");
  expect(form.get("content-type")).toBe("application/x-www-form-urlencoded");
  expect(text.get("content-type")).toBe("text/plain");
  expect(html.get("content-type")).toBe("text/html");
});

// 8. Testing with empty overrides
test("empty overrides keeps defaults", () => {
  const headers = createMockHeaders({});
  
  expect(headers.get("content-type")).toBe("application/json");
  expect(headers.get("user-agent")).toBe("test-agent");
});

// 9. Testing security headers
test("security headers", () => {
  const securityHeaders = createMockHeaders({
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    "strict-transport-security": "max-age=31536000",
    "x-xss-protection": "1; mode=block"
  });

  expect(securityHeaders.get("x-frame-options")).toBe("DENY");
  expect(securityHeaders.get("x-content-type-options")).toBe("nosniff");
  expect(securityHeaders.get("strict-transport-security")).toContain("max-age");
  expect(securityHeaders.get("x-xss-protection")).toContain("mode=block");
});

// 10. Testing with fetch-like request
test("headers work with mock fetch", async () => {
  const headers = createMockHeaders({
    "authorization": "Bearer token"
  });

  const mockFetch = vi.fn().mockResolvedValue(
    createMockResponse({ authenticated: true })
  );

  await mockFetch("/api/data", { headers });

  expect(mockFetch).toHaveBeenCalledWith("/api/data", expect.objectContaining({
    headers
  }));
});
```

**Edge Cases & Gotchas:**

- **Case-insensitive keys**: HTTP headers are case-insensitive
  ```typescript
  const headers = createMockHeaders({
    "Authorization": "Bearer token"
  });
  expect(headers.get("authorization")).toBe("Bearer token");
  expect(headers.get("AUTHORIZATION")).toBe("Bearer token");
  ```

- **Overriding defaults**: Same key replaces default value
  ```typescript
  const headers = createMockHeaders({
    "content-type": "text/plain" // Overrides "application/json"
  });
  expect(headers.get("content-type")).toBe("text/plain");
  ```

- **Real Headers object**: Not a mock, has full Headers API
  ```typescript
  const headers = createMockHeaders({ "x-test": "value" });
  
  expect(headers).toBeInstanceOf(Headers);
  expect(headers.set).toBeDefined(); // Real method
  expect(headers.get).toBeDefined(); // Real method
  expect(headers.has).toBeDefined(); // Real method
  ```

- **Header uniqueness**: Cannot have multiple values for same header
  ```typescript
  const headers = createMockHeaders({
    "set-cookie": "cookie1=value1",
    "set-cookie": "cookie2=value2" // Overwrites first!
  });
  expect(headers.get("set-cookie")).toBe("cookie2=value2");
  // Only one value per header key
  ```

- **String values only**: Values must be strings, not numbers or objects
  ```typescript
  // Wrong - will be converted to string
  const headers = createMockHeaders({
    "x-count": 100, // Converted to "100"
    "x-data": { key: "value" } // Converted to "[object Object]"
  });
  expect(headers.get("x-count")).toBe("100"); // String "100"
  expect(headers.get("x-data")).toBe("[object Object]"); // Not usable
  ```

- **Empty string values**: Valid header value (different from missing)
  ```typescript
  const headers = createMockHeaders({
    "x-empty": ""
  });
  expect(headers.get("x-empty")).toBe(""); // Empty string exists
  expect(headers.has("x-empty")).toBe(true); // Header exists
  ```

- **Whitespace in values**: Preserved as-is
  ```typescript
  const headers = createMockHeaders({
    "authorization": "Bearer   token"  // Multiple spaces preserved
  });
  expect(headers.get("authorization")).toBe("Bearer   token");
  ```

- **Special characters**: Must be valid header values
  ```typescript
  const headers = createMockHeaders({
    "x-custom": "value with spaces",
    "x-encoded": encodeURIComponent("special:chars") // Use encoding for special chars
  });
  expect(headers.get("x-custom")).toBe("value with spaces");
  ```

- **Default headers always present**: Even with overrides
  ```typescript
  const headers = createMockHeaders({
    "x-custom": "value"
  });
  // Defaults still there
  expect(headers.has("content-type")).toBe(true);
  expect(headers.has("user-agent")).toBe(true);
  // Plus custom
  expect(headers.has("x-custom")).toBe(true);
  ```

- **Undefined/null values**: Convert to string "undefined"/"null"
  ```typescript
  const headers = createMockHeaders({
    "x-test": undefined, // Becomes "undefined"
    "x-null": null      // Becomes "null"
  });
  expect(headers.get("x-test")).toBe("undefined");
  expect(headers.get("x-null")).toBe("null");
  ```

**Performance Considerations:**

- Headers object creation is O(1) - minimal overhead
- Header lookup is O(1) on average
- Iterating headers is O(n) where n = number of headers
- Suitable for high-frequency testing
- No network overhead - purely in-memory

---

#### `createMockRequest(overrides?)`

Creates a mock HTTP request object with fetch-like interface for testing request handlers, middleware, authentication, and request validation.

**Signature:**
```typescript
function createMockRequest(
  overrides?: {
    method?: string,
    url?: string,
    headers?: Headers,
    body?: unknown
  }
): MockRequest
```

**Parameters:**
- `overrides` (optional): Request properties to override
  - `method?: string` - HTTP method (default: `"GET"`)
    - Common values: `"GET"`, `"POST"`, `"PUT"`, `"PATCH"`, `"DELETE"`
    - Case-sensitive by convention (uppercase)
  - `url?: string` - Request URL (default: `"http://localhost:3001/api/test"`)
    - Can be full URL or path
    - Can include query parameters
    - Can be relative or absolute
  - `headers?: Headers` - Request headers (default: `createMockHeaders()`)
    - Real `Headers` object
    - Defaults to `content-type: application/json`, `user-agent: test-agent`
  - `body?: unknown` - Request body (default: `null`)
    - Can be any JSON-serializable value
    - Used by `json()` and `text()` methods
    - `null` for GET/DELETE requests (no body)

**Returns:**
- `MockRequest` object with properties:
  - `method: string` - HTTP method (from overrides or default `"GET"`)
  - `url: string` - Request URL (from overrides or default)
  - `headers: Headers` - Request headers (from overrides or `createMockHeaders()`)
  - `body: unknown` - Request body (from overrides or default `null`)
  - `json(): Promise<unknown>` - Async method that resolves to `body`
  - `text(): Promise<string>` - Async method that resolves to `JSON.stringify(body)`

**Common Usage Patterns:**

```typescript
// 1. Basic GET request (defaults)
const request = createMockRequest();
expect(request.method).toBe("GET");
expect(request.url).toBe("http://localhost:3001/api/test");
expect(request.body).toBeNull();

// 2. POST request with body
const postRequest = createMockRequest({
  method: "POST",
  url: "/api/favorites",
  body: { stationId: "725", label: "Work" }
});
expect(postRequest.method).toBe("POST");
expect(postRequest.url).toBe("/api/favorites");

// 3. PUT request for updates
const putRequest = createMockRequest({
  method: "PUT",
  url: "/api/favorites/fav_123",
  body: { label: "Updated Work" }
});

// 4. DELETE request
const deleteRequest = createMockRequest({
  method: "DELETE",
  url: "/api/favorites/fav_123"
});

// 5. PATCH request for partial updates
const patchRequest = createMockRequest({
  method: "PATCH",
  url: "/api/stations/725",
  body: { ada: false }
});

// 6. Request with custom headers
const authRequest = createMockRequest({
  method: "GET",
  url: "/api/user/profile",
  headers: createMockHeaders({
    "authorization": "Bearer token123"
  })
});

// 7. Request with query parameters
const queryRequest = createMockRequest({
  method: "GET",
  url: "/api/arrivals?station=725&direction=N"
});

// 8. Request with full URL
const fullUrlRequest = createMockRequest({
  method: "GET",
  url: "https://api.example.com/arrivals?station=725"
});

// 9. Request with array body
const arrayBodyRequest = createMockRequest({
  method: "POST",
  url: "/api/batch",
  body: [
    { stationId: "725", action: "add" },
    { stationId: "726", action: "remove" }
  ]
});

// 10. Request with null body (no body)
const noBodyRequest = createMockRequest({
  method: "GET",
  url: "/api/health",
  body: null
});
```

**Advanced Usage Patterns:**

```typescript
// 1. Testing request body parsing
test("parses JSON body correctly", async () => {
  const request = createMockRequest({
    method: "POST",
    url: "/api/favorites",
    body: { stationId: "725", label: "Home" }
  });

  const body = await request.json();
  expect(body.stationId).toBe("725");
  expect(body.label).toBe("Home");
});

// 2. Testing request body as text
test("returns body as JSON string", async () => {
  const request = createMockRequest({
    method: "POST",
    url: "/api/data",
    body: { message: "test" }
  });

  const text = await request.text();
  expect(text).toBe('{"message":"test"}');
});

// 3. Testing authentication middleware
test("middleware validates authorization header", () => {
  const authenticatedRequest = createMockRequest({
    method: "GET",
    url: "/api/protected",
    headers: createMockHeaders({
      "authorization": "Bearer valid_token"
    })
  });

  const isAuthenticated = checkAuth(authenticatedRequest);
  expect(isAuthenticated).toBe(true);
});

// 4. Testing different HTTP methods
test("handles all HTTP methods", () => {
  const methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

  methods.forEach(method => {
    const request = createMockRequest({ method });
    expect(request.method).toBe(method);
  });
});

// 5. Testing URL parsing
test("parses URL components", () => {
  const request = createMockRequest({
    method: "GET",
    url: "https://api.example.com:443/api/arrivals?station=725&direction=N#section"
  });

  const url = new URL(request.url);
  expect(url.hostname).toBe("api.example.com");
  expect(url.pathname).toBe("/api/arrivals");
  expect(url.searchParams.get("station")).toBe("725");
  expect(url.searchParams.get("direction")).toBe("N");
});

// 6. Testing request validation
test("validates required request properties", () => {
  const request = createMockRequest({
    method: "POST",
    url: "/api/favorites",
    body: { stationId: "725" }
  });

  expect(request.method).toBeDefined();
  expect(request.url).toBeDefined();
  expect(request.headers).toBeDefined();
  expect(request.body).toBeDefined();
});

// 7. Testing body null for GET requests
test("GET requests have null body by default", () => {
  const getRequest = createMockRequest({
    method: "GET",
    url: "/api/data"
  });

  expect(getRequest.body).toBeNull();
});

// 8. Testing body for POST requests
test("POST requests can have body", () => {
  const postRequest = createMockRequest({
    method: "POST",
    url: "/api/data",
    body: { key: "value" }
  });

  expect(postRequest.body).toEqual({ key: "value" });
});

// 9. Testing with CSRF token
test("includes CSRF token in headers", () => {
  const csrfRequest = createMockRequest({
    method: "POST",
    url: "/api/favorites",
    headers: createMockHeaders({
      "x-csrf-token": "abc123def456"
    })
  });

  expect(csrfRequest.headers.get("x-csrf-token")).toBe("abc123def456");
});

// 10. Testing API versioning via headers
test("includes API version in headers", () => {
  const versionedRequest = createMockRequest({
    method: "GET",
    url: "/api/data",
    headers: createMockHeaders({
      "accept": "application/vnd.api+json",
      "x-api-version": "2.0"
    })
  });

  expect(versionedRequest.headers.get("x-api-version")).toBe("2.0");
});
```

**Edge Cases & Gotchas:**

- **`json()` and `text()` return Promises**: Must be awaited
  ```typescript
  const request = createMockRequest({
    body: { data: "test" }
  });
  const body = request.json(); // Returns Promise, not data
  // Need: await request.json()
  ```

- **`text()` returns JSON-encoded string**: Always `JSON.stringify(body)`
  ```typescript
  const request = createMockRequest({
    body: "plain text"
  });
  const text = await request.text();
  expect(text).toBe('"plain text"'); // JSON-encoded
  ```

- **`body` is stored directly**: No deep cloning
  ```typescript
  const mutableBody = { items: [] };
  const request = createMockRequest({ body: mutableBody });
  mutableBody.items.push("new item"); // Affects request body
  ```

- **Default method is GET**: Without override, always `"GET"`
  ```typescript
  const request = createMockRequest();
  expect(request.method).toBe("GET");
  ```

- **Default URL is localhost**: Without override, always `"http://localhost:3001/api/test"`
  ```typescript
  const request = createMockRequest();
  expect(request.url).toBe("http://localhost:3001/api/test");
  ```

- **Default headers include content-type**: Even for GET requests (no body)
  ```typescript
  const request = createMockRequest({ method: "GET" });
  expect(request.headers.get("content-type")).toBe("application/json");
  ```

- **`body` can be any JSON-serializable value**: Including null, primitives, arrays
  ```typescript
  const nullBody = createMockRequest({ body: null });
  const numBody = createMockRequest({ body: 42 });
  const strBody = createMockRequest({ body: "text" });
  const arrBody = createMockRequest({ body: [1, 2, 3] });
  const objBody = createMockRequest({ body: { key: "value" } });

  expect(await objBody.json()).toEqual({ key: "value" });
  expect(await arrBody.json()).toEqual([1, 2, 3]);
  ```

- **Request object is plain object**: Not a real Request instance
  ```typescript
  const request = createMockRequest();
  expect(request).not.toBeInstanceOf(Request); // Plain object
  // But has compatible interface
  expect(request.json).toBeDefined();
  expect(request.method).toBeDefined();
  ```

- **Method is case-sensitive**: Use uppercase for HTTP methods
  ```typescript
  const request = createMockRequest({ method: "post" });
  expect(request.method).toBe("post"); // Lowercase, not "POST"
  // Convention is uppercase
  ```

- **URL is stored as-is**: No validation or parsing
  ```typescript
  const request = createMockRequest({
    url: "not-a-valid-url"
  });
  expect(request.url).toBe("not-a-valid-url"); // Stored as provided
  ```

- **Headers can be overridden**: Provide custom Headers object
  ```typescript
  const customHeaders = new Headers({
    "x-custom": "value"
  });
  const request = createMockRequest({
    headers: customHeaders
  });
  expect(request.headers.get("x-custom")).toBe("value");
  expect(request.headers.get("content-type")).toBeNull(); // No defaults
  ```

- **`null` body for GET by convention**: GET requests typically have no body
  ```typescript
  const getRequest = createMockRequest({
    method: "GET",
    body: null // Explicit null (also default)
  });
  expect(getRequest.body).toBeNull();
  ```

- **Empty object body**: Valid for POST/PUT/PATCH
  ```typescript
  const emptyPost = createMockRequest({
    method: "POST",
    body: {} // Empty JSON object
  });
  expect(await emptyPost.json()).toEqual({});
  ```

**Performance Considerations:**

- Request creation is O(1) - just object creation
- `json()` and `text()` resolve immediately (no actual parsing)
- No network overhead - purely in-memory
- Suitable for high-frequency testing
- Body parsing is minimal - just returns stored value

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

Measures the execution time of a synchronous or async function with high-resolution timing. Essential for performance benchmarking, optimization validation, and ensuring code meets performance requirements.

**Signature:**
```typescript
async function measureExecutionTime<T>(
  fn: () => T | Promise<T>
): Promise<{ result: T, durationMs: number }>
```

**Parameters:**
- `fn: () => T | Promise<T>` - Function to measure (can be sync or async)
  - Type: Function that returns `T` or `Promise<T>`
  - Zero-argument function (if arguments needed, use arrow function wrapper)
  - Can be sync function (returns `T`) or async function (returns `Promise<T>`)
  - Function is executed immediately when `measureExecutionTime` is called
  - Type parameter `T` is inferred from return type

**Returns:**
- `Promise<{ result: T, durationMs: number }>` - Object containing:
  - `result: T` - The return value of the measured function
  - `durationMs: number` - Execution time in milliseconds (high-resolution)

**Common Usage Patterns:**

```typescript
// 1. Basic async function measurement
const { result, durationMs } = await measureExecutionTime(async () => {
  await new Promise(r => setTimeout(r, 100));
  return "complete";
});
expect(result).toBe("complete");
expect(durationMs).toBeGreaterThanOrEqual(100);

// 2. Synchronous function measurement
const { result, durationMs } = await measureExecutionTime(() => {
  let sum = 0;
  for (let i = 0; i < 1000; i++) sum += i;
  return sum;
});
expect(result).toBe(499500);
console.log(`Calculation took ${durationMs}ms`);

// 3. API call measurement
const { durationMs } = await measureExecutionTime(() => fetchArrivals());
console.log(`API call completed in ${durationMs}ms`);
expect(durationMs).toBeLessThan(1000); // Must complete in < 1 second

// 4. Comparing performance of different approaches
const approach1 = await measureExecutionTime(() => method1());
const approach2 = await measureExecutionTime(() => method2());

console.log(`Method 1: ${approach1.durationMs}ms`);
console.log(`Method 2: ${approach2.durationMs}ms`);
expect(approach2.durationMs).toBeLessThan(approach1.durationMs);

// 5. Database query measurement
const { result: users, durationMs: queryTime } = await measureExecutionTime(() => 
  db.query("SELECT * FROM users")
);
console.log(`Query returned ${users.length} users in ${queryTime}ms`);

// 6. File I/O measurement
const { durationMs } = await measureExecutionTime(() => 
  fs.readFile("large-file.json", "utf8")
);
console.log(`File read in ${durationMs}ms`);

// 7. Measuring array operations
const { result, durationMs } = await measureExecutionTime(() => {
  const arr = Array.from({ length: 10000 }, (_, i) => i);
  return arr.filter(x => x % 2 === 0).map(x => x * 2);
});
console.log(`Array processing of ${result.length} items took ${durationMs}ms`);

// 8. Measuring with result validation
const { result, durationMs } = await measureExecutionTime(() => {
  return complexCalculation();
});
expect(result).toBeDefined();
expect(result.correct).toBe(true);
expect(durationMs).toBeLessThan(500);

// 9. Measuring function with side effects
let sideEffect = 0;
const { durationMs } = await measureExecutionTime(() => {
  sideEffect = 42;
  return "done";
});
expect(sideEffect).toBe(42);

// 10. Multiple measurements for averaging
const measurements = await Promise.all([
  measureExecutionTime(() => operation()),
  measureExecutionTime(() => operation()),
  measureExecutionTime(() => operation()),
  measureExecutionTime(() => operation()),
  measureExecutionTime(() => operation())
]);
const avgDuration = measurements.reduce((sum, m) => sum + m.durationMs, 0) / measurements.length;
console.log(`Average duration: ${avgDuration}ms`);
```

**Advanced Usage Patterns:**

```typescript
// 1. Performance regression testing
test("performance does not regress", async () => {
  const { durationMs } = await measureExecutionTime(() => 
    processLargeDataset(dataset)
  );
  
  expect(durationMs).toBeLessThan(1000); // Must complete in < 1 second
});

// 2. Benchmarking different algorithms
test("compares sorting algorithms", async () => {
  const data = Array.from({ length: 10000 }, () => Math.random());
  
  const bubbleSort = await measureExecutionTime(() => {
    return bubbleSortAlgorithm([...data]);
  });
  
  const quickSort = await measureExecutionTime(() => {
    return quickSortAlgorithm([...data]);
  });
  
  console.log(`Bubble sort: ${bubbleSort.durationMs}ms`);
  console.log(`Quick sort: ${quickSort.durationMs}ms`);
  expect(quickSort.durationMs).toBeLessThan(bubbleSort.durationMs);
});

// 3. Measuring memory vs CPU tradeoff
test("caching improves performance", async () => {
  const uncached = await measureExecutionTime(() => {
    return expensiveCalculation(1000);
  });
  
  const cached = await measureExecutionTime(() => {
    return cachedExpensiveCalculation(1000);
  });
  
  expect(cached.durationMs).toBeLessThan(uncached.durationMs);
  const speedup = uncached.durationMs / cached.durationMs;
  console.log(`Speedup: ${speedup}x`);
});

// 4. Measuring concurrent operations
test("parallel execution is faster", async () => {
  const sequential = await measureExecutionTime(async () => {
    await operation1();
    await operation2();
    await operation3();
  });
  
  const parallel = await measureExecutionTime(async () => {
    await Promise.all([operation1(), operation2(), operation3()]);
  });
  
  expect(parallel.durationMs).toBeLessThan(sequential.durationMs);
  console.log(`Parallel is ${sequential.durationMs / parallel.durationMs}x faster`);
});

// 5. Measuring with different input sizes
test("scales linearly with input size", async () => {
  const sizes = [100, 1000, 10000];
  const timings: number[] = [];
  
  for (const size of sizes) {
    const { durationMs } = await measureExecutionTime(() => 
      processArrayOfSize(size)
    );
    timings.push(durationMs);
  }
  
  // Check that timings grow proportionally
  expect(timings[1] / timings[0]).toBeCloseTo(10, 1);
  expect(timings[2] / timings[1]).toBeCloseTo(10, 1);
});

// 6. Measuring cold vs warm cache
test("warm cache is faster", async () => {
  const cold = await measureExecutionTime(() => 
    fetchDataFromCache()
  );
  
  const warm = await measureExecutionTime(() => 
    fetchDataFromCache()
  );
  
  expect(warm.durationMs).toBeLessThanOrEqual(cold.durationMs);
});

// 7. Measuring error handling overhead
test("error handling adds overhead", async () => {
  const withoutErrorHandling = await measureExecutionTime(() => {
    return riskyOperation();
  });
  
  const withErrorHandling = await measureExecutionTime(() => {
    try {
      return riskyOperation();
    } catch (error) {
      return null;
    }
  });
  
  expect(withErrorHandling.durationMs).toBeGreaterThan(withoutErrorHandling.durationMs);
});

// 8. Measuring async vs sync operations
test("async overhead is minimal", async () => {
  const sync = await measureExecutionTime(() => {
    return calculateSync(1000);
  });
  
  const async = await measureExecutionTime(async () => {
    return await calculateAsync(1000);
  });
  
  const overhead = async.durationMs - sync.durationMs;
  console.log(`Async overhead: ${overhead}ms`);
  expect(overhead).toBeLessThan(10); // Should be minimal
});

// 9. Statistical benchmarking
test("runs multiple iterations for statistical significance", async () => {
  const iterations = 10;
  const measurements: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const { durationMs } = await measureExecutionTime(() => operation());
    measurements.push(durationMs);
  }
  
  const avg = measurements.reduce((a, b) => a + b) / measurements.length;
  const min = Math.min(...measurements);
  const max = Math.max(...measurements);
  
  console.log(`Average: ${avg}ms, Min: ${min}ms, Max: ${max}ms`);
  expect(avg).toBeLessThan(1000);
});

// 10. Measuring with setup/teardown
test("measures core operation excluding setup", async () => {
  // Setup time not measured
  const data = await loadData();
  
  const { durationMs } = await measureExecutionTime(() => 
    processData(data)
  );
  
  // Cleanup time not measured
  await cleanupData(data);
  
  expect(durationMs).toBeLessThan(500);
});
```

**Edge Cases & Gotchas:**

- **High-resolution timing**: Uses `performance.now()` which has microsecond precision
  ```typescript
  const { durationMs } = await measureExecutionTime(() => {});
  expect(durationMs).toBeLessThan(1); // Can measure sub-millisecond times
  ```

- **Includes async overhead**: Duration includes promise resolution time
  ```typescript
  const sync = await measureExecutionTime(() => 42);
  const async = await measureExecutionTime(async () => 42);
  // async.durationMs > sync.durationMs due to Promise overhead
  ```

- **Function execution is immediate**: No setup time included in measurement
  ```typescript
  const setupStart = performance.now();
  const { durationMs } = await measureExecutionTime(() => operation());
  // setupStart time not included in durationMs
  ```

- **Throwing functions**: Exceptions propagate, measurement still valid
  ```typescript
  await expect(
    measureExecutionTime(() => { throw new Error("Failed"); })
  ).rejects.toThrow("Failed");
  ```

- **Zero-duration functions**: Can measure very fast operations
  ```typescript
  const { durationMs } = await measureExecutionTime(() => 42);
  expect(durationMs).toBeGreaterThanOrEqual(0);
  ```

- **Memory allocation**: Measurement includes GC time if triggered
  ```typescript
  const { durationMs } = await measureExecutionTime(() => {
    return Array(1000000).fill(0); // May trigger GC
  });
  ```

- **Concurrent measurements**: Multiple measurements can run in parallel
  ```typescript
  const [m1, m2, m3] = await Promise.all([
    measureExecutionTime(() => op1()),
    measureExecutionTime(() => op2()),
    measureExecutionTime(() => op3())
  ]);
  ```

- **Result type safety**: TypeScript infers result type correctly
  ```typescript
  const { result } = await measureExecutionTime(() => {
    return { id: "123", name: "Test" };
  });
  expect(result.name).toBe("Test"); // Type-safe access
  ```

**Performance Considerations:**

- Measurement overhead is < 0.1ms - negligible for most operations
- For very fast operations (< 1ms), consider running multiple iterations
- `performance.now()` is monotonically increasing and not affected by system clock changes
- Browser compatibility: Requires `performance.now()` support (all modern browsers)

**Real-World Testing Scenarios:**

```typescript
// 1. API endpoint performance testing
test("API responds within SLA", async () => {
  const { durationMs } = await measureExecutionTime(() => 
    fetch("/api/arrivals/725").then(r => r.json())
  );
  
  expect(durationMs).toBeLessThan(500); // SLA: < 500ms
  console.log(`API response time: ${durationMs}ms`);
});

// 2. Database query optimization
test("optimized query is faster", async () => {
  const unoptimized = await measureExecutionTime(() => 
    db.query("SELECT * FROM users WHERE name LIKE '%test%'")
  );
  
  const optimized = await measureExecutionTime(() => 
    db.query("SELECT * FROM users WHERE name = 'test'")
  );
  
  expect(optimized.durationMs).toBeLessThan(unoptimized.durationMs);
  console.log(`Performance improvement: ${unoptimized.durationMs / optimized.durationMs}x`);
});

// 3. Component rendering performance
test("component renders quickly", async () => {
  const { durationMs } = await measureExecutionTime(() => {
    const component = render(<ExpensiveComponent data={largeData} />);
    return component.container;
  });
  
  expect(durationMs).toBeLessThan(100); // Must render in < 100ms
});
```

---

#### `assertCompletesWithin(fn, maxMs)`

Asserts that a function completes within a specified time limit and returns the function result. Essential for performance requirements, SLA compliance testing, timeout handling validation, and ensuring code doesn't degrade over time.

**Signature:**
```typescript
async function assertCompletesWithin<T>(
  fn: () => T | Promise<T>,
  maxMs: number
): Promise<T>
```

**Parameters:**
- `fn: () => T | Promise<T>` - Function to test for performance
  - Type: Function that returns `T` or `Promise<T>`
  - Can be sync or async
  - Zero-argument function (use arrow function wrapper if arguments needed)
  - Executed immediately when `assertCompletesWithin` is called
- `maxMs: number` - Maximum allowed duration in milliseconds
  - Type: `number`
  - Must be positive (negative or zero will likely fail immediately)
  - Should be realistic for the operation being tested
  - Too low: causes false failures
  - Too high: misses real performance problems

**Returns:**
- `Promise<T>` - The function result if it completes within `maxMs`
  - Returns the actual result from `fn` for further assertions
  - Throws Vitest assertion error if execution exceeds `maxMs`
  - Type parameter `T` is inferred from return type of `fn`

**Common Usage Patterns:**

```typescript
// 1. Basic async operation timeout
const result = await assertCompletesWithin(
  () => fetchData(),
  1000
);
expect(result).toBeDefined();

// 2. Synchronous operation timeout
const sum = await assertCompletesWithin(
  () => {
    let total = 0;
    for (let i = 0; i < 1000000; i++) total += i;
    return total;
  },
  100
);
expect(sum).toBe(499999500000);

// 3. API response time assertion
const data = await assertCompletesWithin(
  () => fetch("/api/arrivals").then(r => r.json()),
  500
);
expect(data.arrivals).toBeDefined();

// 4. Database query timeout
const users = await assertCompletesWithin(
  () => db.query("SELECT * FROM users LIMIT 100"),
  200
);
expect(users.length).toBe(100);

// 5. File I/O timeout
const content = await assertCompletesWithin(
  () => fs.readFile("config.json", "utf8"),
  100
);
expect(JSON.parse(content)).toBeDefined();

// 6. Component rendering timeout
const { container } = await assertCompletesWithin(
  () => render(<MyComponent />),
  50
);
expect(container.querySelector(".my-component")).not.toBeNull();

// 7. Testing fast operations
const value = await assertCompletesWithin(
  () => 42,
  1
);
expect(value).toBe(42);

// 8. Testing with result validation
const result = await assertCompletesWithin(
  () => expensiveOperation(),
  1000
);
expect(result.correct).toBe(true);

// 9. Multiple sequential assertions
await assertCompletesWithin(() => step1(), 100);
await assertCompletesWithin(() => step2(), 100);
await assertCompletesWithin(() => step3(), 100);

// 10. Error handling with timeout
try {
  await assertCompletesWithin(
    () => slowOperation(),
    100
  );
} catch (error) {
  expect(error.message).toContain("Expected to complete within 100ms");
}
```

**Advanced Usage Patterns:**

```typescript
// 1. Performance SLA testing
test("API meets response time SLA", async () => {
  const response = await assertCompletesWithin(
    () => fetch("/api/data").then(r => r.json()),
    500 // SLA: < 500ms
  );
  expect(response).toBeDefined();
  // Test passes only if both SLA met AND response is valid
});

// 2. Progressive timeout testing
test("operation completes within reasonable time", async () => {
  const data = { size: 1000 };
  
  // Fast test for small data
  const small = await assertCompletesWithin(
    () => processData({ ...data, size: 10 }),
    100
  );
  
  // Slower test for large data
  const large = await assertCompletesWithin(
    () => processData({ ...data, size: 10000 }),
    1000
  );
  
  expect(large).toBeDefined();
});

// 3. Comparing performance
test("optimized version is faster", async () => {
  const optimizedTime = await measureExecutionTime(() => 
    assertCompletesWithin(() => optimized(), 1000)
  );
  
  const originalTime = await measureExecutionTime(() => 
    assertCompletesWithin(() => original(), 1000)
  );
  
  expect(optimizedTime.durationMs).toBeLessThan(originalTime.durationMs);
});

// 4. Testing timeout handling
test("handles timeout gracefully", async () => {
  await expect(
    assertCompletesWithin(
      () => new Promise(r => setTimeout(r, 1000)),
      100 // Too short
    )
  ).rejects.toThrow("Expected to complete within 100ms");
});

// 5. Testing retry logic with timeout
test("retry operation completes within overall timeout", async () => {
  let attempts = 0;
  
  const retryOperation = async () => {
    attempts++;
    if (attempts < 3) throw new Error("Not ready");
    return "success";
  };
  
  const result = await assertCompletesWithin(
    () => retryWithBackoff(retryOperation),
    2000 // Must complete within 2 seconds including retries
  );
  
  expect(result).toBe("success");
  expect(attempts).toBeLessThanOrEqual(5);
});

// 6. Testing concurrent operations timeout
test("parallel operations complete within timeout", async () => {
  const results = await assertCompletesWithin(
    () => Promise.all([
      fetch("/api/1"),
      fetch("/api/2"),
      fetch("/api/3")
    ]),
    1000 // All must complete within 1 second
  );
  
  expect(results).toHaveLength(3);
});

// 7. Testing progressive enhancement
test("fast path completes quickly", async () => {
  const result = await assertCompletesWithin(
    () => {
      const fast = checkFastPath();
      if (fast) return fast;
      return slowFallback();
    },
    100
  );
  
  expect(result).not.toBeNull();
});

// 8. Testing with dynamic timeouts
test("timeout scales with input size", async () => {
  const input = { items: Array.from({ length: 1000 }, () => Math.random()) };
  
  const result = await assertCompletesWithin(
    () => processItems(input),
    input.items.length * 0.5 // 0.5ms per item
  );
  
  expect(result.processed).toBe(1000);
});

// 9. Testing real-time operations
test("real-time processing keeps up", async () => {
  const stream = simulateDataStream(100); // 100 items per second
  
  const processed = await assertCompletesWithin(
    () => processStream(stream),
    2000 // Must process 200 items in 2 seconds
  );
  
  expect(processed).toBeGreaterThanOrEqual(200);
});

// 10. Testing memory-intensive operations
test("large dataset processing completes", async () => {
  const largeData = generateTestData(1000000); // 1M items
  
  const result = await assertCompletesWithin(
    () => processLargeDataset(largeData),
    5000 // 5 seconds for 1M items
  );
  
  expect(result.processedCount).toBe(1000000);
});
```

**Edge Cases & Gotchas:**

- **Timeout precision**: Actual timeout may be slightly longer than `maxMs` due to event loop timing
  ```typescript
  const start = Date.now();
  await assertCompletesWithin(() => {}, 100);
  const elapsed = Date.now() - start;
  // elapsed may be 100-105ms due to timing precision
  ```

- **Function execution starts immediately**: No setup time included in timeout
  ```typescript
  await assertCompletesWithin(() => operation(), 100);
  // Operation starts immediately, timeout is from call time
  ```

- **Throwing functions**: Exceptions propagate before timeout check
  ```typescript
  await expect(
    assertCompletesWithin(() => { throw new Error("Failed"); }, 1000)
  ).rejects.toThrow("Failed");
  // Error thrown immediately, not a timeout
  ```

- **Zero or negative timeout**: May fail immediately or behave unexpectedly
  ```typescript
  await expect(
    assertCompletesWithin(() => {}, 0)
  ).rejects.toThrow(); // Likely fails immediately
  ```

- **Very short timeouts**: May not work reliably due to event loop granularity
  ```typescript
  // 1ms timeout may not be reliable
  await expect(
    assertCompletesWithin(() => {}, 1)
  ).rejects.toThrow(); // May fail even for fast operations
  ```

- **Result type safety**: TypeScript infers result type correctly
  ```typescript
  const result = await assertCompletesWithin(() => {
    return { id: "123", value: 42 };
  }, 100);
  
  expect(result.value).toBe(42); // Type-safe access
  ```

- **Async functions work identically**: No difference in behavior
  ```typescript
  const syncResult = await assertCompletesWithin(() => 42, 100);
  const asyncResult = await assertCompletesWithin(async () => 42, 100);
  // Both work the same way
  ```

**Performance Considerations:**

- Measurement overhead is minimal (< 0.1ms) - doesn't affect timeout accuracy significantly
- For operations expected to take < 10ms, consider using `measureExecutionTime` instead
- Timeout check happens after function completes - not checked during execution
- For long-running operations, consider manual timeout cancellation

**Real-World Testing Scenarios:**

```typescript
// 1. Testing API endpoint performance
test("health check endpoint responds quickly", async () => {
  const response = await assertCompletesWithin(
    () => fetch("/health").then(r => r.json()),
    100 // Health check should be very fast
  );
  
  expect(response.status).toBe("healthy");
});

// 2. Testing database query performance
test("indexed query completes quickly", async () => {
  const users = await assertCompletesWithin(
    () => db.query("SELECT * FROM users WHERE email = 'test@example.com'"),
    50 // Indexed query should be fast
  );
  
  expect(users).toHaveLength(1);
});

// 3. Testing component rendering performance
test("component renders within frame budget", async () => {
  const { container } = await assertCompletesWithin(
    () => render(<ComplexComponent data={testData} />),
    16 // ~60fps = 16ms per frame
  );
  
  expect(container.querySelector(".ready")).not.toBeNull();
});

// 4. Testing file upload timeout
test("file upload completes within timeout", async () => {
  const file = new File(["content"], "test.txt");
  
  const result = await assertCompletesWithin(
    () => uploadFile(file),
    5000 // 5 seconds for upload
  );
  
  expect(result.success).toBe(true);
});

// 5. Testing cache performance
test("cache hit is very fast", async () => {
  await populateCache("key", "value");
  
  const result = await assertCompletesWithin(
    () => getFromCache("key"),
    1 // Cache hit should be nearly instant
  );
  
  expect(result).toBe("value");
});

// 6. Testing batch operations
test("batch processing completes within SLA", async () => {
  const items = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
  
  const results = await assertCompletesWithin(
    () => processBatch(items),
    1000 // 1 second for 1000 items = 1ms per item
  );
  
  expect(results.successful).toBe(1000);
});

// 7. Testing with realistic timeouts
test("search completes within user tolerance", async () => {
  const results = await assertCompletesWithin(
    () => searchDatabase("query string"),
    2000 // Users expect search in < 2 seconds
  );
  
  expect(results).toBeDefined();
});

// 8. Testing progressive loading
test("initial load is fast, full load takes longer", async () => {
  const initial = await assertCompletesWithin(
    () => fetchPage({ lazy: false }),
    300 // Initial load should be fast
  );
  
  const full = await assertCompletesWithin(
    () => fetchPage({ lazy: true }),
    1000 // Full load can take longer
  );
  
  expect(initial.data).toBeDefined();
  expect(full.data).toBeDefined();
});
```

---

### Async Testing Utilities

#### `waitFor(condition, timeout?, interval?)`

Waits for a condition to become true by polling at intervals. Essential for testing async state changes, DOM updates, race conditions, and operations that complete asynchronously without callbacks.

**Signature:**
```typescript
async function waitFor(
  condition: () => boolean,
  timeout?: number,
  interval?: number
): Promise<void>
```

**Parameters:**
- `condition: () => boolean` - Function that returns `true` when condition met
  - Type: Zero-argument function returning boolean
  - Called repeatedly until returns `true` or timeout
  - Should be pure (no side effects) for reliable testing
  - Can check DOM, state variables, async results, etc.
  - Throws in condition function will propagate immediately
- `timeout` (optional): Maximum wait time in milliseconds
  - Type: `number`
  - Default: `5000` (5 seconds)
  - Must be positive (zero or negative fails immediately)
  - Too short: causes false timeouts
  - Too long: slows down failing tests
- `interval` (optional): Polling interval in milliseconds
  - Type: `number`
  - Default: `50` (50ms)
  - Must be positive
  - Shorter = more responsive but more CPU usage
  - Longer = less CPU but slower detection

**Returns:**
- `Promise<void>` - Resolves when condition becomes `true`
  - Resolves immediately when condition first returns `true`
  - Throws `Error` if timeout reached before condition met
  - Error message: `"Condition not met within ${timeout}ms"`

**Common Usage Patterns:**

```typescript
// 1. Basic DOM waiting
await waitFor(
  () => document.querySelector(".result") !== null,
  2000
);
// Waits up to 2 seconds for .result element to appear

// 2. State variable waiting
let isLoading = true;
setTimeout(() => { isLoading = false; }, 1000);
await waitFor(() => !isLoading, 2000);
// Waits up to 2 seconds for isLoading to become false

// 3. Async result waiting
let asyncResult = null;
setTimeout(() => { asyncResult = "success"; }, 500);
await waitFor(() => asyncResult !== null, 1000);
expect(asyncResult).toBe("success");

// 4. Custom interval and timeout
await waitFor(
  () => data.loaded,
  10000, // 10 second timeout
  100   // Check every 100ms
);

// 5. Multiple conditions (AND logic)
await waitFor(() => 
  condition1() && condition2() && condition3(),
  5000
);

// 6. Multiple conditions (OR logic - any condition met)
await waitFor(() => 
  condition1() || condition2() || condition3(),
  5000
);

// 7. Array element existence
const items = [];
setTimeout(() => items.push("item"), 100);
await waitFor(() => items.length > 0, 1000);
expect(items).toContain("item");

// 8. Counter threshold
let counter = 0;
setInterval(() => counter++, 10);
await waitFor(() => counter >= 10, 2000);
expect(counter).toBeGreaterThanOrEqual(10);

// 9. Object property existence
const obj = {};
setTimeout(() => { obj.loaded = true; }, 100);
await waitFor(() => obj.loaded !== undefined, 1000);

// 10. Element text content
await waitFor(
  () => document.querySelector(".status")?.textContent === "complete",
  3000
);
```

**Advanced Usage Patterns:**

```typescript
// 1. Testing race conditions
test("handles concurrent state changes", async () => {
  let state = "initial";
  
  // Two concurrent operations
  setTimeout(() => { state = "operation1"; }, Math.random() * 100);
  setTimeout(() => { state = "operation2"; }, Math.random() * 100);
  
  // Wait for either operation to complete
  await waitFor(() => 
    state === "operation1" || state === "operation2",
    1000
  );
  
  expect(["operation1", "operation2"]).toContain(state);
});

// 2. Testing progressive loading
test("waits for progressive load stages", async () => {
  const loadStages = ["loading", "processing", "complete"];
  let currentStage = 0;
  
  // Simulate progressive loading
  loadStages.forEach((stage, i) => {
    setTimeout(() => { currentStage = i; }, i * 100);
  });
  
  // Wait for each stage
  for (let i = 0; i < loadStages.length; i++) {
    await waitFor(() => currentStage >= i, 500);
  }
  
  expect(currentStage).toBe(2); // Complete
});

// 3. Testing with slow networks
test("handles slow async operations", async () => {
  let dataReceived = false;
  
  // Simulate slow network (2 seconds)
  setTimeout(() => { dataReceived = true; }, 2000);
  
  await waitFor(() => dataReceived, 3000, 100);
  expect(dataReceived).toBe(true);
});

// 4. Testing failure scenarios
test("throws on timeout", async () => {
  let neverMet = false;
  
  await expect(
    waitFor(() => neverMet, 100) // 100ms timeout
  ).rejects.toThrow("Condition not met within 100ms");
});

// 5. Testing with retries
test("waits for retry logic to succeed", async () => {
  let attempts = 0;
  let success = false;
  
  const retryOperation = () => {
    attempts++;
    if (attempts >= 3) success = true;
  };
  
  setInterval(retryOperation, 50);
  await waitFor(() => success, 1000);
  
  expect(attempts).toBeGreaterThanOrEqual(3);
});

// 6. Testing DOM mutation
test("waits for DOM mutation", async () => {
  const container = document.createElement("div");
  
  setTimeout(() => {
    const element = document.createElement("span");
    element.className = "loaded";
    container.appendChild(element);
  }, 100);
  
  await waitFor(() => 
    container.querySelector(".loaded") !== null,
    1000
  );
  
  expect(container.querySelector(".loaded")).not.toBeNull();
});

// 7. Testing async queue processing
test("waits for queue to empty", async () => {
  const queue = [1, 2, 3, 4, 5];
  
  setInterval(() => {
    if (queue.length > 0) queue.shift();
  }, 50);
  
  await waitFor(() => queue.length === 0, 1000);
  expect(queue).toHaveLength(0);
});

// 8. Testing with complex conditions
test("handles complex boolean logic", async () => {
  let flags = { a: false, b: false, c: false };
  
  setTimeout(() => { flags.a = true; }, 50);
  setTimeout(() => { flags.b = true; }, 100);
  setTimeout(() => { flags.c = true; }, 150);
  
  // Wait for all flags true
  await waitFor(() => 
    Object.values(flags).every(v => v),
    1000
  );
  
  expect(flags).toEqual({ a: true, b: true, c: true });
});

// 9. Testing with external state
test("waits for external service state", async () => {
  let serviceReady = false;
  
  // Simulate service initialization
  setTimeout(() => { serviceReady = true; }, 500);
  
  await waitFor(() => serviceReady, 2000);
  expect(serviceReady).toBe(true);
});

// 10. Testing progressive timeout increase
test("increases timeout on retry", async () => {
  let attempt = 0;
  let success = false;
  
  const tryWithBackoff = async () => {
    attempt++;
    const timeout = 100 * attempt; // Progressive timeout
    
    try {
      await waitFor(() => success, timeout);
      return true;
    } catch {
      if (attempt < 3) {
        return tryWithBackoff();
      }
      throw new Error("Failed after 3 attempts");
    }
  };
  
  // Succeed on 3rd attempt
  setTimeout(() => { success = true; }, 300);
  
  const result = await tryWithBackoff();
  expect(result).toBe(true);
});
```

**Edge Cases & Gotchas:**

- **Condition function called repeatedly**: Called on every interval tick
  ```typescript
  let callCount = 0;
  await waitFor(() => {
    callCount++;
    return false;
  }, 1000, 10); // 1000ms timeout, 10ms interval
  
  // Called ~100 times (1000/10)
  expect(callCount).toBeGreaterThan(90);
  ```

- **Throws on timeout**: Error message includes timeout value
  ```typescript
  await expect(
    waitFor(() => false, 100)
  ).rejects.toThrow("Condition not met within 100ms");
  ```

- **Short intervals = more CPU**: Higher polling frequency uses more CPU
  ```typescript
  // High CPU usage
  await waitFor(() => condition, 5000, 1); // Every 1ms
  
  // Lower CPU usage
  await waitFor(() => condition, 5000, 100); // Every 100ms
  ```

- **Condition function throws**: Propagates immediately, doesn't wait for timeout
  ```typescript
  await expect(
    waitFor(() => { throw new Error("Failed"); }, 5000)
  ).rejects.toThrow("Failed");
  // Throws immediately, not after 5 seconds
  ```

- **Zero or negative timeout**: May fail immediately or behave unexpectedly
  ```typescript
  await expect(
    waitFor(() => true, 0)
  ).rejects.toThrow(); // Likely fails immediately
  ```

- **Condition returns immediately**: No delay if condition already true
  ```typescript
  const start = Date.now();
  await waitFor(() => true, 5000);
  const elapsed = Date.now() - start;
  
  expect(elapsed).toBeLessThan(10); // Very fast, condition already true
  ```

- **Condition becomes true just before timeout**: Should still succeed
  ```typescript
  let condition = false;
  setTimeout(() => { condition = true; }, 4900); // Just before 5s timeout
  
  await waitFor(() => condition, 5000);
  // Should succeed (condition met at 4.9s)
  ```

- **Multiple concurrent waits**: Can have multiple `waitFor` calls running
  ```typescript
  const wait1 = waitFor(() => flag1, 1000);
  const wait2 = waitFor(() => flag2, 1000);
  const wait3 = waitFor(() => flag3, 1000);
  
  await Promise.all([wait1, wait2, wait3]);
  ```

- **Condition with side effects**: Possible but not recommended
  ```typescript
  let counter = 0;
  await waitFor(() => {
    counter++; // Side effect - runs every interval
    return counter >= 10;
  }, 1000);
  
  expect(counter).toBeGreaterThanOrEqual(10); // Side effect ran
  ```

- **Interval precision**: Actual interval may be slightly longer than specified
  ```typescript
  const start = Date.now();
  await waitFor(() => false, 100, 10); // 10ms interval
  
  const elapsed = Date.now() - start;
  // elapsed may be 100-110ms due to timing precision
  ```

- **Condition function scope**: Captures variables from outer scope
  ```typescript
  let outerVar = false;
  setTimeout(() => { outerVar = true; }, 100);
  
  await waitFor(() => outerVar, 1000); // Captures outerVar
  expect(outerVar).toBe(true);
  ```

**Performance Considerations:**

- CPU usage scales with polling frequency: 1ms interval = high CPU, 100ms = lower
- Memory usage is minimal - just stores state and interval ID
- Condition function should be fast (avoid expensive operations in polling loop)
- For long-running waits (>10s), consider using events or promises instead
- Default interval (50ms) balances responsiveness and CPU usage

---

#### `flushPromises()`

Flushes all pending promises in the microtask queue. Essential for testing async operations, promise chains, mock verifications, and ensuring all async work has completed before making assertions.

**Signature:**
```typescript
async function flushPromises(): Promise<void>
```

**Parameters:**
- None

**Returns:**
- `Promise<void>` - Resolves after microtask queue is empty
  - Uses `setTimeout(..., 0)` to yield to event loop
  - Allows all pending microtasks to complete
  - Returns promise that resolves after next tick
  - No return value (void)

**Common Usage Patterns:**

```typescript
// 1. Basic promise flushing
someAsyncOperation();
await flushPromises(); // Ensures all promises resolved
expect(mockFn).toHaveBeenCalled();

// 2. Flushing after async state update
setState({ loading: true });
await flushPromises();
expect(state.loading).toBe(false);

// 3. Flushing multiple promises
Promise.resolve().then(() => console.log("1"));
Promise.resolve().then(() => console.log("2"));
Promise.resolve().then(() => console.log("3"));

await flushPromises();
// All three promises have executed

// 4. Flushing with mock verifications
const mockFn = vi.fn();
Promise.resolve().then(() => mockFn("called"));

await flushPromises();
expect(mockFn).toHaveBeenCalledWith("called");

// 5. Flushing in beforeEach hook
beforeEach(async () => {
  setupTest();
  await flushPromises(); // Ensure all async setup complete
});

// 6. Flushing after DOM updates
document.body.innerHTML = "<div>test</div>";
Promise.resolve().then(() => {
  document.querySelector("div")?.classList.add("loaded");
});

await flushPromises();
expect(document.querySelector("div")).toHaveClass("loaded");

// 7. Flushing with promise chains
Promise.resolve()
  .then(() => console.log("step 1"))
  .then(() => console.log("step 2"))
  .then(() => console.log("step 3"));

await flushPromises();
// All steps executed

// 8. Flushing async operations in sequence
operation1();
await flushPromises();
expect(result1).toBeDefined();

operation2();
await flushPromises();
expect(result2).toBeDefined();

// 9. Flushing before assertions
const result = fetchData();
await flushPromises();
expect(result.data).toBeDefined();

// 10. Flushing in test teardown
afterEach(async () => {
  cleanup();
  await flushPromises(); // Ensure all cleanup async work complete
});
```

**Advanced Usage Patterns:**

```typescript
// 1. Testing async state updates
test("async state updates complete before assertions", async () => {
  let state = { updated: false };
  
  Promise.resolve().then(() => {
    state.updated = true;
  });
  
  // Without flushPromises, this might fail
  await flushPromises();
  expect(state.updated).toBe(true);
});

// 2. Testing promise chain execution order
test("promise chains execute in order", async () => {
  const order: number[] = [];
  
  Promise.resolve()
    .then(() => { order.push(1); return Promise.resolve(); })
    .then(() => { order.push(2); })
    .then(() => { order.push(3); });
  
  await flushPromises();
  expect(order).toEqual([1, 2, 3]);
});

// 3. Testing mock callbacks in promises
test("mock functions called in promises are verified", async () => {
  const mockFn = vi.fn();
  
  Promise.resolve()
    .then(() => mockFn("first"))
    .then(() => mockFn("second"));
  
  await flushPromises();
  expect(mockFn).toHaveBeenCalledTimes(2);
});

// 4. Testing error handling in promises
test("promise errors don't prevent flush", async () => {
  let errorHandled = false;
  
  Promise.reject(new Error("Test error"))
    .catch(() => { errorHandled = true; });
  
  await flushPromises();
  expect(errorHandled).toBe(true);
});

// 5. Testing multiple async sources
test("flushes all promise sources", async () => {
  const results: string[] = [];
  
  Promise.resolve().then(() => results.push("promise1"));
  Promise.resolve().then(() => results.push("promise2"));
  Promise.resolve().then(() => results.push("promise3"));
  
  setTimeout(() => results.push("timeout"), 0);
  queueMicrotask(() => results.push("microtask"));
  
  await flushPromises();
  expect(results).toContain("promise1");
  expect(results).toContain("promise2");
  expect(results).toContain("promise3");
});

// 6. Testing with async components
test("component async operations complete", async () => {
  const component = new AsyncComponent();
  component.loadData();
  
  await flushPromises();
  expect(component.data).toBeDefined();
});

// 7. Testing race conditions
test("handles race conditions in promises", async () => {
  let winner: string | null = null;
  
  Promise.resolve().then(() => { winner = "first"; });
  Promise.resolve().then(() => { winner = "second"; });
  
  await flushPromises();
  expect(["first", "second"]).toContain(winner);
});

// 8. Testing nested promises
test("nested promises complete", async () => {
  let depth = 0;
  
  Promise.resolve().then(() => {
    depth++;
    return Promise.resolve().then(() => {
      depth++;
      return Promise.resolve().then(() => {
        depth++;
      });
    });
  });
  
  await flushPromises();
  expect(depth).toBe(3);
});

// 9. Testing promise.all behavior
test("Promise.all completes before assertions", async () => {
  const values = await Promise.all([
    Promise.resolve(1),
    Promise.resolve(2),
    Promise.resolve(3)
  ]);
  
  await flushPromises();
  expect(values).toEqual([1, 2, 3]);
});

// 10. Testing async test patterns
test("common async test pattern", async () => {
  // Arrange
  const mockFn = vi.fn();
  
  // Act
  Promise.resolve().then(() => mockFn());
  
  // Assert - after flushing
  await flushPromises();
  expect(mockFn).toHaveBeenCalled();
});
```

**Edge Cases & Gotchas:**

- **Only flushes microtasks**: Uses `setTimeout(..., 0)` which yields to event loop
  ```typescript
  Promise.resolve().then(() => console.log("microtask"));
  setTimeout(() => console.log("macrotask"), 0);
  
  await flushPromises();
  // "microtask" printed, "macrotask" may not be yet
  ```

- **Doesn't wait for macrotasks**: setTimeout, setInterval run in macrotask queue
  ```typescript
  setTimeout(() => { flag = true; }, 100);
  await flushPromises();
  expect(flag).toBe(false); // Still false, macrotask not run
  ```

- **Promises created during flush**: May not be executed in same flush
  ```typescript
  let callCount = 0;
  Promise.resolve().then(() => {
    callCount++;
    Promise.resolve().then(() => {
      callCount++; // Created during flush
    });
  });
  
  await flushPromises();
  expect(callCount).toBe(1); // Only first promise executed
  ```

- **Multiple flushes for nested promises**: Need multiple flushes for deeply nested
  ```typescript
  let depth = 0;
  Promise.resolve().then(() => {
    depth++;
    return Promise.resolve().then(() => {
      depth++;
      return Promise.resolve().then(() => {
        depth++;
      });
    });
  });
  
  await flushPromises();
  await flushPromises(); // May need second flush
  await flushPromises(); // May need third flush
  expect(depth).toBe(3);
  ```

- **Async/await creates promises**: Even async/await needs flushing
  ```typescript
  let flag = false;
  (async () => {
    await Promise.resolve();
    flag = true;
  })();
  
  await flushPromises();
  expect(flag).toBe(true);
  ```

- **Promise rejection**: Rejected promises still complete (need error handling)
  ```typescript
  let errorCaught = false;
  Promise.reject(new Error("Test"))
    .catch(() => { errorCaught = true; });
  
  await flushPromises();
  expect(errorCaught).toBe(true);
  ```

- **Mock promises**: Mock promises created with vi.fn().mockResolvedValue need flush
  ```typescript
  const mockFn = vi.fn().mockResolvedValue("result");
  mockFn().then(value => console.log(value));
  
  await flushPromises();
  expect(mockFn).toHaveBeenCalled();
  ```

- **Race conditions in promises**: Multiple promises may complete in any order
  ```typescript
  let winner: string = "";
  Promise.resolve().then(() => { winner = "A"; });
  Promise.resolve().then(() => { winner = "B"; });
  
  await flushPromises();
  expect(["A", "B"]).toContain(winner); // Either
  ```

- **No-op if no pending promises**: Returns immediately if queue empty
  ```typescript
  const start = Date.now();
  await flushPromises(); // No pending promises
  const elapsed = Date.now() - start;
  
  expect(elapsed).toBeLessThan(5); // Very fast
  ```

- **Performance overhead**: Small overhead from setTimeout(..., 0)
  ```typescript
  const start = Date.now();
  await flushPromises();
  const elapsed = Date.now() - start;
  
  expect(elapsed).toBeLessThan(10); // Should be fast
  ```

**Performance Considerations:**

- Uses `setTimeout(..., 0)` which adds ~1-5ms overhead
- For heavy promise testing, consider `waitFor` instead
- Multiple flushes compound overhead
- Most efficient when used once per test (not in loops)
- Memory usage is minimal - just yields to event loop

**When to Use vs Alternatives:**

- Use `flushPromises()` for: Simple promise completion, mock verification, basic async testing
- Use `waitFor()` for: DOM updates, complex conditions, retries, state changes
- Use `waitForAll()` for: Parallel operations, concurrent promises, batch processing
- Use `await promise` for: Single predictable async operations

---

#### `waitForAll(operations)`

Waits for multiple async operations to complete in parallel and returns all results. Essential for testing concurrent operations, batch processing, parallel API calls, and scenarios where multiple async tasks must complete before assertions.

**Signature:**
```typescript
async function waitForAll<T>(operations: Array<() => Promise<T>>): Promise<T[]>
```

**Parameters:**
- `operations: Array<() => Promise<T>>` - Array of async functions to execute in parallel
  - Each element is a function that returns a Promise (not the Promise itself)
  - Functions are called immediately when `waitForAll` is invoked
  - Type parameter `T` can be any type - results array contains `T[]`
  - Empty array resolves immediately with `[]`

**Returns:**
- `Promise<T[]>` - Array of results in the same order as input operations
  - Resolves when all operations complete successfully
  - Rejects if any operation rejects (fail-fast behavior)
  - Results are ordered by input array position, not completion order
  - Type is `T[]` where `T` is the inferred type from operation return values

**Common Usage Patterns:**

```typescript
// 1. Basic parallel operations
const results = await waitForAll([
  () => Promise.resolve(1),
  () => Promise.resolve(2),
  () => Promise.resolve(3)
]);
expect(results).toEqual([1, 2, 3]);

// 2. Async functions with different return types
const results = await waitForAll([
  () => Promise.resolve({ id: "1", name: "Item 1" }),
  () => Promise.resolve({ id: "2", name: "Item 2" }),
  () => Promise.resolve({ id: "3", name: "Item 3" })
]);
expect(results).toHaveLength(3);
expect(results[0].name).toBe("Item 1");

// 3. Simulating parallel API calls
const mockFetch = vi.fn().mockResolvedValue(createMockResponse({ data: "value" }));
const results = await waitForAll([
  () => mockFetch("/api/arrivals/725"),
  () => mockFetch("/api/arrivals/726"),
  () => mockFetch("/api/alerts")
]);
expect(results).toHaveLength(3);
expect(mockFetch).toHaveBeenCalledTimes(3);

// 4. Operations with delays
const delays = await waitForAll([
  () => new Promise(r => setTimeout(() => r(100), 100)),
  () => new Promise(r => setTimeout(() => r(200), 50)),
  () => new Promise(r => setTimeout(() => r(300), 150))
]);
expect(delays).toEqual([100, 200, 300]);

// 5. Complex async operations
const results = await waitForAll([
  async () => {
    await new Promise(r => setTimeout(r, 100));
    return "operation1";
  },
  async () => {
    await new Promise(r => setTimeout(r, 200));
    return "operation2";
  }
]);
expect(results[0]).toBe("operation1");
expect(results[1]).toBe("operation2");

// 6. Empty operations array
const results = await waitForAll([]);
expect(results).toEqual([]);

// 7. Single operation
const result = await waitForAll([
  () => Promise.resolve("single")
]);
expect(result).toEqual(["single"]);

// 8. Operations returning arrays
const results = await waitForAll([
  () => Promise.resolve([1, 2, 3]),
  () => Promise.resolve([4, 5, 6])
]);
expect(results[0]).toEqual([1, 2, 3]);
expect(results[1]).toEqual([4, 5, 6]);

// 9. Testing concurrent state changes
let counter = 0;
await waitForAll([
  async () => { counter += 1; },
  async () => { counter += 1; },
  async () => { counter += 1; }
]);
expect(counter).toBe(3);

// 10. Error handling (one operation fails)
await expect(
  waitForAll([
    () => Promise.resolve("success"),
    () => Promise.reject(new Error("Failed")),
    () => Promise.resolve("also success")
  ])
).rejects.toThrow("Failed");
```

**Advanced Usage Patterns:**

```typescript
// 1. Parallel data fetching with aggregation
test("aggregates data from multiple sources", async () => {
  const sources = [
    { id: "1", data: "Data from source 1" },
    { id: "2", data: "Data from source 2" },
    { id: "3", data: "Data from source 3" }
  ];
  
  const fetchData = async (id: string) => {
    await new Promise(r => setTimeout(r, 100));
    return sources.find(s => s.id === id);
  };
  
  const results = await waitForAll([
    () => fetchData("1"),
    () => fetchData("2"),
    () => fetchData("3")
  ]);
  
  expect(results).toHaveLength(3);
  expect(results.every(r => r?.data)).toBe(true);
});

// 2. Testing race conditions
test("all operations complete despite timing differences", async () => {
  const completionTimes: number[] = [];
  
  const operations = [
    async () => {
      const start = Date.now();
      await new Promise(r => setTimeout(r, Math.random() * 100));
      completionTimes.push(Date.now() - start);
      return "op1";
    },
    async () => {
      const start = Date.now();
      await new Promise(r => setTimeout(r, Math.random() * 100));
      completionTimes.push(Date.now() - start);
      return "op2";
    },
    async () => {
      const start = Date.now();
      await new Promise(r => setTimeout(r, Math.random() * 100));
      completionTimes.push(Date.now() - start);
      return "op3";
    }
  ];
  
  const results = await waitForAll(operations);
  expect(results).toEqual(["op1", "op2", "op3"]);
  expect(completionTimes).toHaveLength(3);
});

// 3. Testing concurrent mutations
test("concurrent mutations don't interfere", async () => {
  const state = { values: [1, 2, 3] };
  
  await waitForAll([
    async () => {
      await new Promise(r => setTimeout(r, 50));
      state.values.push(4);
    },
    async () => {
      await new Promise(r => setTimeout(r, 100));
      state.values.push(5);
    },
    async () => {
      await new Promise(r => setTimeout(r, 75));
      state.values.push(6);
    }
  ]);
  
  expect(state.values).toContain(4);
  expect(state.values).toContain(5);
  expect(state.values).toContain(6);
});

// 4. Testing batch processing
test("processes batches in parallel", async () => {
  const batches = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
  
  const processBatch = async (batch: number[]) => {
    await new Promise(r => setTimeout(r, 100));
    return batch.map(x => x * 2);
  };
  
  const results = await waitForAll([
    () => processBatch(batches[0]),
    () => processBatch(batches[1]),
    () => processBatch(batches[2])
  ]);
  
  expect(results[0]).toEqual([2, 4, 6]);
  expect(results[1]).toEqual([8, 10, 12]);
  expect(results[2]).toEqual([14, 16, 18]);
});

// 5. Testing with different return types
test("handles heterogeneous return types", async () => {
  const results = await waitForAll([
    () => Promise.resolve({ count: 5 }),
    () => Promise.resolve([1, 2, 3]),
    () => Promise.resolve("success"),
    () => Promise.resolve(42)
  ]);
  
  expect(results[0]).toEqual({ count: 5 });
  expect(results[1]).toEqual([1, 2, 3]);
  expect(results[2]).toBe("success");
  expect(results[3]).toBe(42);
});

// 6. Testing concurrent API clients
test("multiple API clients fetch concurrently", async () => {
  const clients = [
    { name: "Client1", fetch: async () => ({ data: "client1" }) },
    { name: "Client2", fetch: async () => ({ data: "client2" }) },
    { name: "Client3", fetch: async () => ({ data: "client3" }) }
  ];
  
  const results = await waitForAll([
    () => clients[0].fetch(),
    () => clients[1].fetch(),
    () => clients[2].fetch()
  ]);
  
  expect(results[0].data).toBe("client1");
  expect(results[1].data).toBe("client2");
  expect(results[2].data).toBe("client3");
});

// 7. Testing error propagation
test("first error propagates immediately", async () => {
  let longOpCompleted = false;
  
  try {
    await waitForAll([
      () => Promise.reject(new Error("Fast error")),
      async () => {
        await new Promise(r => setTimeout(r, 1000));
        longOpCompleted = true;
        return "completed";
      }
    ]);
  } catch (error) {
    expect((error as Error).message).toBe("Fast error");
    expect(longOpCompleted).toBe(false); // Short-circuited
  }
});

// 8. Testing ordered results despite completion order
test("results are ordered by input not completion", async () => {
  const results = await waitForAll([
    () => new Promise(r => setTimeout(() => r("last"), 300)),
    () => new Promise(r => setTimeout(() => r("first"), 100)),
    () => new Promise(r => setTimeout(() => r("middle"), 200))
  ]);
  
  expect(results).toEqual(["last", "first", "middle"]);
  // Order preserved despite different completion times
});

// 9. Testing with async generators
test("processes multiple async generators", async () => {
  const gen1 = async function*() {
    yield 1; yield 2; yield 3;
  };
  const gen2 = async function*() {
    yield 4; yield 5; yield 6;
  };
  
  const collect = async (gen: AsyncGenerator<any>) => {
    const items = [];
    for await (const item of gen()) items.push(item);
    return items;
  };
  
  const results = await waitForAll([
    () => collect(gen1),
    () => collect(gen2)
  ]);
  
  expect(results[0]).toEqual([1, 2, 3]);
  expect(results[1]).toEqual([4, 5, 6]);
});

// 10. Testing resource cleanup
test("cleans up all resources even if some fail", async () => {
  const cleanup: any[] = [];
  
  try {
    await waitForAll([
      async () => {
        await new Promise(r => setTimeout(r, 100));
        cleanup.push("op1");
        return "success1";
      },
      async () => {
        await new Promise(r => setTimeout(r, 50));
        throw new Error("op2 failed");
      },
      async () => {
        await new Promise(r => setTimeout(r, 150));
        cleanup.push("op3");
        return "success3";
      }
    ]);
  } catch (error) {
    expect(cleanup).not.toContain("op3"); // Short-circuited
    expect((error as Error).message).toBe("op2 failed");
  }
});
```

**Edge Cases & Gotchas:**

- **Fail-fast behavior**: First rejection rejects the entire `Promise.all()`
  ```typescript
  await expect(
    waitForAll([
      () => Promise.reject(new Error("First error")),
      () => Promise.reject(new Error("Second error")),
      () => Promise.resolve("Success")
    ])
  ).rejects.toThrow("First error");
  // Only "First error" is thrown, others are lost
  ```

- **Operations start immediately**: Functions are called when `waitForAll` is invoked, not lazily
  ```typescript
  let started = 0;
  const ops = [
    () => { started++; return Promise.resolve(1); },
    () => { started++; return Promise.resolve(2); }
  ];
  
  waitForAll(ops); // Both functions called immediately
  expect(started).toBe(2);
  ```

- **Order preservation**: Results are in input order, not completion order
  ```typescript
  const results = await waitForAll([
    () => new Promise(r => setTimeout(() => r("slow"), 200)),
    () => new Promise(r => setTimeout(() => r("fast"), 50))
  ]);
  expect(results).toEqual(["slow", "fast"]); // Input order preserved
  ```

- **Empty array**: Resolves immediately with empty array
  ```typescript
  const results = await waitForAll([]);
  expect(results).toEqual([]);
  // No delay, immediate resolution
  ```

- **Mixed types**: TypeScript infers union type for heterogeneous arrays
  ```typescript
  const results = await waitForAll([
    () => Promise.resolve(42),
    () => Promise.resolve("string"),
    () => Promise.resolve({ key: "value" })
  ]);
  // Type is (string | number | { key: string })[]
  ```

- **Memory accumulation**: All results held in memory until all complete
  ```typescript
  const largeArrays = await waitForAll([
    () => Promise.resolve(new Array(1000000).fill(1)),
    () => Promise.resolve(new Array(1000000).fill(2))
  ]);
  // Both large arrays held in memory simultaneously
  ```

- **Long-running operations**: No individual timeout for each operation
  ```typescript
  await expect(
    waitForAll([
      () => new Promise(r => setTimeout(r, 10000)) // 10 second operation
    ])
  ).resolves.toBeUndefined(); // Will wait full 10 seconds
  ```

- **Nested promises**: Functions returning non-Promise values are wrapped
  ```typescript
  const results = await waitForAll([
    () => 42, // Not a Promise
    () => Promise.resolve(100)
  ]);
  expect(results).toEqual([42, 100]);
  // Non-Promise values are treated as resolved promises
  ```

**Performance Considerations:**

- Operations run in parallel on available CPU cores (for CPU-bound operations)
- I/O-bound operations benefit most from parallel execution
- Memory usage scales with operation count and result size
- For very large operation arrays (>1000), consider batching
- Network operations are limited by browser connection limits

**Real-World Testing Scenarios:**

```typescript
// 1. Testing parallel API data fetching
test("fetches data from multiple endpoints", async () => {
  const mockFetch = vi.fn()
    .mockResolvedValueOnce(createMockResponse({ arrivals: [] }))
    .mockResolvedValueOnce(createMockResponse({ alerts: [] }))
    .mockResolvedValueOnce(createMockResponse({ stations: [] }));
  
  const results = await waitForAll([
    () => mockFetch("/api/arrivals"),
    () => mockFetch("/api/alerts"),
    () => mockFetch("/api/stations")
  ]);
  
  expect(results).toHaveLength(3);
  expect(mockFetch).toHaveBeenCalledTimes(3);
});

// 2. Testing concurrent state updates
test("updates state from multiple sources concurrently", async () => {
  const state = {
    user: null as any,
    settings: null as any,
    notifications: null as any
  };
  
  await waitForAll([
    async () => {
      state.user = { id: "123", name: "Test User" };
    },
    async () => {
      state.settings = { theme: "dark" };
    },
    async () => {
      state.notifications = [{ message: "Welcome" }];
    }
  ]);
  
  expect(state.user).not.toBeNull();
  expect(state.settings).not.toBeNull();
  expect(state.notifications).not.toBeNull();
});

// 3. Testing parallel file processing
test("processes multiple files in parallel", async () => {
  const files = [
    { name: "file1.txt", content: "content1" },
    { name: "file2.txt", content: "content2" },
    { name: "file3.txt", content: "content3" }
  ];
  
  const processFile = async (file: any) => {
    await new Promise(r => setTimeout(r, 100));
    return { ...file, processed: true };
  };
  
  const results = await waitForAll([
    () => processFile(files[0]),
    () => processFile(files[1]),
    () => processFile(files[2])
  ]);
  
  expect(results.every(r => r.processed)).toBe(true);
});

// 4. Testing concurrent database queries
test("executes multiple queries concurrently", async () => {
  const db = createMockDatabase();
  
  const results = await waitForAll([
    () => Promise.resolve({ users: [] }),
    () => Promise.resolve({ posts: [] }),
    () => Promise.resolve({ comments: [] })
  ]);
  
  expect(results[0].users).toEqual([]);
  expect(results[1].posts).toEqual([]);
  expect(results[2].comments).toEqual([]);
});

// 5. Testing parallel validation
test("validates multiple fields concurrently", async () => {
  const validators = {
    email: async (value: string) => value.includes("@"),
    username: async (value: string) => value.length >= 3,
    password: async (value: string) => value.length >= 8
  };
  
  const results = await waitForAll([
    () => validators.email("test@example.com"),
    () => validators.username("test"),
    () => validators.password("password123")
  ]);
  
  expect(results).toEqual([true, true, true]);
});
```

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
