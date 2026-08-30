# Station Type Definitions

This document describes the TypeScript type definitions used by `createMockStation` and other station-related utilities.

**Source:** `packages/shared/src/types/stations.ts`

## Borough Type

**Location:** Line 7

```typescript
export type Borough = "manhattan" | "brooklyn" | "queens" | "bronx" | "statenisland";
```

A union type representing the five boroughs of New York City. Used to identify which borough a station is located in.

**Possible values:**
- `"manhattan"` - Manhattan borough
- `"brooklyn"` - Brooklyn borough
- `"queens"` - Queens borough
- `"bronx"` - Bronx borough
- `"statenisland"` - Staten Island borough

## TransferConnection Interface

**Location:** Lines 15-24

```typescript
export interface TransferConnection {
  /** Target station ID */
  toStationId: string;
  /** Lines available at the transfer station */
  toLines: string[];
  /** Estimated walking time for transfer in seconds */
  walkingSeconds: number;
  /** Whether the transfer path is ADA accessible */
  accessible: boolean;
}
```

Represents a transfer connection between two subway stations.

**Fields:**
- `toStationId: string` - The ID of the destination station for the transfer
- `toLines: string[]` - Array of subway line identifiers available at the transfer destination
- `walkingSeconds: number` - Estimated walking time in seconds to complete the transfer
- `accessible: boolean` - Whether the transfer path is ADA compliant ( wheelchair accessible)

## Station Interface

**Location:** Lines 29-52

```typescript
export interface Station {
  /** Parent station ID, e.g., "725" */
  id: string;
  /** Station display name, e.g., "Times Sq-42 St" */
  name: string;
  /** Latitude */
  lat: number;
  /** Longitude */
  lon: number;
  /** All lines serving this station */
  lines: string[];
  /** Northbound platform stop ID, e.g., "725N" */
  northStopId: string;
  /** Southbound platform stop ID, e.g., "725S" */
  southStopId: string;
  /** Available transfers from this station */
  transfers: TransferConnection[];
  /** Station complex ID for multi-entrance stations */
  complex?: string;
  /** Whether the station is ADA accessible */
  ada: boolean;
  /** Borough */
  borough: Borough;
}
```

Represents a complete subway station with all metadata needed for routing and display.

**Fields:**
- `id: string` - Unique station identifier (parent station ID), e.g., "725" for Times Square
- `name: string` - Display name for the station, e.g., "Times Sq-42 St"
- `lat: number` - Geographic latitude coordinate
- `lon: number` - Geographic longitude coordinate
- `lines: string[]` - Array of subway line identifiers that serve this station
- `northStopId: string` - Stop ID for the northbound platform, e.g., "725N"
- `southStopId: string` - Stop ID for the southbound platform, e.g., "725S"
- `transfers: TransferConnection[]` - Array of transfer connections to other stations
- `complex?: string` - Optional station complex ID for multi-entrance stations (e.g., large stations with multiple entrances)
- `ada: boolean` - Whether the station is ADA compliant (has wheelchair accessibility)
- `borough: Borough` - The NYC borough where the station is located

## Related Types

The file also defines additional supporting types:

### Division Type
**Location:** Line 10
```typescript
export type Division = "A" | "B";
```
MTA division identifier (A = numbered lines, B = lettered lines).

### Route Interface
**Location:** Lines 64-83
```typescript
export interface Route {
  id: string;
  shortName: string;
  longName: string;
  color: string;
  textColor: string;
  feedId: string;
  division: Division;
  stops: string[];
  isExpress: boolean;
}
```

Represents a subway route/line with display names, colors, and stop ordering.

## Usage Example

```typescript
import { Station, Borough, TransferConnection } from '@mta-my-way/shared/types/stations';

const mockStation: Station = {
  id: "725",
  name: "Times Sq-42 St",
  lat: 40.7589,
  lon: -73.9851,
  lines: ["1", "2", "3", "7", "N", "Q", "R", "S"],
  northStopId: "725N",
  southStopId: "725S",
  transfers: [
    {
      toStationId: "628",
      toLines: ["A", "C", "E"],
      walkingSeconds: 180,
      accessible: true
    }
  ],
  complex: "310",
  ada: true,
  borough: "manhattan"
};
```

## See Also

- **StationIndex:** Dictionary mapping station IDs to Station objects
- **StationComplex:** Groups of related stations (e.g., multi-entrance complexes)
- **TransferEdge:** Simplified transfer connection for route computation
- **Route, RouteIndex:** Route/line definitions
