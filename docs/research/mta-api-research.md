# MTA Real-Time Train Arrival API Research

> Research conducted: 2026-03-19

---

## Table of Contents

1. [MTA API Overview](#1-mta-api-overview)
2. [Authentication and Access](#2-authentication-and-access)
3. [GTFS-RT (General Transit Feed Specification - Realtime)](#3-gtfs-rt-general-transit-feed-specification---realtime)
4. [GTFS Static Data](#4-gtfs-static-data)
5. [How to Get Train Arrival Times at a Specific Station](#5-how-to-get-train-arrival-times-at-a-specific-station)
6. [Alternative and Supplementary APIs](#6-alternative-and-supplementary-apis)
7. [Common Libraries and Tools](#7-common-libraries-and-tools)
8. [Known Limitations and Gotchas](#8-known-limitations-and-gotchas)

---

## 1. MTA API Overview

The Metropolitan Transportation Authority (MTA) provides several data APIs for developers to access real-time and static transit information across its services: NYC Subway, Long Island Rail Road (LIRR), Metro-North Railroad (MNR), and MTA Bus.

### Available APIs

| API | Format | Coverage | Use Case |
|-----|--------|----------|----------|
| **GTFS-RT (Realtime)** | Protocol Buffers | Subway, LIRR, MNR | Real-time vehicle positions, trip updates, arrival predictions |
| **GTFS Static** | CSV (zipped) | Subway, LIRR, MNR, Bus | Schedules, stop/station data, route definitions |
| **GTFS Alerts** | Protocol Buffers | All modes | Service alerts, delays, planned work |
| **SIRI (Bus Time)** | XML / JSON | MTA Bus, NYCT Bus | Real-time bus positions, stop monitoring |
| **OneBusAway REST** | JSON | Bus | Discovery services, stop/route lookup |

### Primary Developer Resources

- **Developer portal**: https://www.mta.info/developers
- **API gateway**: https://api.mta.info
- **Legacy data mine (may be deprecated)**: https://datamine.mta.info
- **Developer support (Google Group)**: https://groups.google.com/g/mtadeveloperresources

---

## 2. Authentication and Access

### Current Status: No API Key Required for Subway GTFS-RT

As of the most recent updates, **API keys are no longer required** to access MTA GTFS-RT subway feeds. The feeds at `api-endpoint.mta.info` can be fetched directly without authentication headers.

This was confirmed by the `nyct-gtfs` library (v2.0.0+) and the `underground` library, both of which removed API key requirements.

### Historical Context

Previously, developers needed to:
1. Register at https://api.mta.info/#/landing
2. Agree to the MTA Data Feed Agreement
3. Obtain an API key
4. Pass the key in requests (via header or query parameter)

### Bus Time API (Still Requires Key)

The SIRI-based Bus Time API **still requires** an API key:
- Register at: http://bt.mta.info/wiki/Developers/Index
- Rate limit: **1 request per 30 seconds** (strictly enforced)

### LIRR and Metro-North

These feeds may still require API key authentication. Contact MTA developer support for access details.

### Terms of Use

- Free for public-facing, non-commercial applications
- Commercial use requires a separate licensing agreement
- Full terms: https://api.mta.info/#/DataFeedAgreement

---

## 3. GTFS-RT (General Transit Feed Specification - Realtime)

### 3.1 Overview

GTFS-RT is a standardized format (maintained by MobilityData, originally created by Google) for transmitting real-time transit information. It uses **Protocol Buffers (protobuf)** -- a compact binary serialization format -- for efficient data transmission.

The MTA's implementation extends the base GTFS-RT specification with **NYCT-specific extensions** that provide additional subway-specific data.

### 3.2 Feed Endpoints

#### Subway Feeds (by line group)

All subway feeds use the base URL: `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/`

| Feed | Lines Covered | Endpoint |
|------|--------------|----------|
| **1-7, S (A Division)** | 1, 2, 3, 4, 5, 6, 7, S (42nd St Shuttle) | `.../nyct/gtfs` |
| **ACE** | A, C, E, H (Rockaway Shuttle), FS (Franklin Shuttle) | `.../nyct/gtfs-ace` |
| **BDFM** | B, D, F, M | `.../nyct/gtfs-bdfm` |
| **G** | G | `.../nyct/gtfs-g` |
| **JZ** | J, Z | `.../nyct/gtfs-jz` |
| **L** | L | `.../nyct/gtfs-l` |
| **NQRW** | N, Q, R, W | `.../nyct/gtfs-nqrw` |
| **SIR** | Staten Island Railway | `.../nyct/gtfs-si` |

Full example URL:
```
https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs-ace
```

**Feed organization**: The A Division (numbered lines) is in a single combined feed. The B Division (lettered lines) is split by color/line group. This reflects the different tracking technologies used (see Section 8).

#### Commuter Rail Feeds

| Feed | Endpoint |
|------|----------|
| **LIRR** | `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr/gtfs-lirr` |
| **Metro-North** | `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr/gtfs-mnr` |

#### Service Alert Feeds

| Feed | Endpoint |
|------|----------|
| **All Alerts** | `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys/all-alerts` |
| **Subway Alerts** | `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys/subway-alerts` |
| **Bus Alerts** | `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys/bus-alerts` |
| **LIRR Alerts** | `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys/lirr-alerts` |
| **MNR Alerts** | `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys/mnr-alerts` |

### 3.3 Protocol Buffers Format

#### Base GTFS-RT Message Hierarchy

The protobuf response is a `FeedMessage` containing a list of `FeedEntity` objects. Each entity contains one of three types of real-time data:

```
FeedMessage
  +-- FeedHeader
  |     +-- gtfs_realtime_version: string ("2.0")
  |     +-- incrementality: enum (FULL_DATASET | DIFFERENTIAL)
  |     +-- timestamp: uint64 (POSIX time)
  |
  +-- FeedEntity[] (repeated)
        +-- id: string
        +-- trip_update: TripUpdate      (arrival/departure predictions)
        +-- vehicle: VehiclePosition     (current vehicle location)
        +-- alert: Alert                 (service alerts)
```

#### TripUpdate Structure (What You Need for Arrival Times)

```
TripUpdate
  +-- trip: TripDescriptor
  |     +-- trip_id: string           (e.g., "123550_1..S02R")
  |     +-- route_id: string          (e.g., "1", "A", "N")
  |     +-- direction_id: uint32
  |     +-- start_time: string
  |     +-- start_date: string        (e.g., "20260319")
  |     +-- schedule_relationship: enum
  |           SCHEDULED = 0
  |           ADDED = 1
  |           CANCELED = 3
  |
  +-- vehicle: VehicleDescriptor
  |
  +-- stop_time_update[]: StopTimeUpdate (repeated -- one per remaining stop)
  |     +-- stop_sequence: uint32
  |     +-- stop_id: string           (e.g., "127N" for northbound at stop 127)
  |     +-- arrival: StopTimeEvent
  |     |     +-- time: int64         (POSIX timestamp -- THE ARRIVAL PREDICTION)
  |     |     +-- delay: int32        (seconds of delay from schedule)
  |     |     +-- uncertainty: int32
  |     +-- departure: StopTimeEvent
  |     |     +-- time: int64
  |     |     +-- delay: int32
  |     |     +-- uncertainty: int32
  |     +-- schedule_relationship: enum
  |           SCHEDULED = 0
  |           SKIPPED = 1
  |           NO_DATA = 2
  |
  +-- timestamp: uint64
```

**Key field**: `stop_time_update[].arrival.time` -- This is the predicted arrival time as a POSIX/Unix timestamp (seconds since epoch). Convert to local time (America/New_York) for display.

#### VehiclePosition Structure

```
VehiclePosition
  +-- trip: TripDescriptor
  +-- vehicle: VehicleDescriptor
  +-- position: Position
  |     +-- latitude: float
  |     +-- longitude: float
  |     +-- bearing: float
  |     +-- speed: float
  +-- stop_id: string
  +-- current_status: enum
  |     INCOMING_AT = 0
  |     STOPPED_AT = 1
  |     IN_TRANSIT_TO = 2
  +-- current_stop_sequence: uint32
  +-- timestamp: uint64
  +-- congestion_level: enum
  +-- occupancy_status: enum
```

#### Alert Structure

```
Alert
  +-- active_period[]: TimeRange
  |     +-- start: uint64
  |     +-- end: uint64
  +-- informed_entity[]: EntitySelector
  |     +-- agency_id: string
  |     +-- route_id: string        (e.g., "1", "F", "B36")
  |     +-- stop_id: string
  +-- cause: enum (TECHNICAL_PROBLEM, CONSTRUCTION, etc.)
  +-- effect: enum (NO_SERVICE, REDUCED_SERVICE, SIGNIFICANT_DELAYS, etc.)
  +-- header_text: TranslatedString
  +-- description_text: TranslatedString
  +-- severity_level: enum (INFO, WARNING, SEVERE)
```

### 3.4 NYCT-Specific Extensions

The MTA extends the base GTFS-RT spec with NYC subway-specific fields. These are defined in the `nyct-subway.proto` file.

#### NyctFeedHeader (extends FeedHeader)

```protobuf
message NyctFeedHeader {
  // Version of the NYCT Subway extensions (currently "1.0")
  required string nyct_subway_version = 1;

  // The feed replaces scheduled trips within these periods.
  // If a static GTFS trip is NOT in the feed within this window,
  // it should be considered CANCELLED.
  repeated TripReplacementPeriod trip_replacement_period = 2;
}

message TripReplacementPeriod {
  optional string route_id = 1;
  // End time is typically now + 30 minutes
  optional transit_realtime.TimeRange replacement_period = 2;
}
```

**Critical concept**: The trip_replacement_period defines a time window (typically 30 minutes from now). Within this window, the feed is authoritative -- any scheduled trip NOT present in the feed should be considered cancelled.

#### NyctTripDescriptor (extends TripDescriptor)

```protobuf
message NyctTripDescriptor {
  // Internal NYCT train ID (e.g., "06 0123+ PEL/BBR")
  // Format: [trip_type][line][origin_time][+/blank] [origin]/[destination]
  //   trip_type: 0=scheduled, ==reroute, /=skip stop, $=turn train
  //   +: 30 seconds past the minute; blank: on the minute
  optional string train_id = 1;

  // True if train is assigned to physical equipment and likely to depart
  optional bool is_assigned = 2;

  // Direction enum
  enum Direction {
    NORTH = 1;   // Uptown, Bronx-bound
    EAST = 2;    // Not currently used
    SOUTH = 3;   // Downtown, Brooklyn-bound
    WEST = 4;    // Not currently used
  }
  optional Direction direction = 3;
}
```

**Direction mapping**:
- `NORTH (1)`: Uptown, Bronx-bound. Also: Times Sq Shuttle to Grand Central.
- `SOUTH (3)`: Downtown, Brooklyn-bound. Also: Times Sq Shuttle to Times Square.
- `EAST` and `WEST` are defined but **not currently used**.

#### NyctStopTimeUpdate (extends StopTimeUpdate)

```protobuf
message NyctStopTimeUpdate {
  // Planned arrival track
  // Manhattan: 1=SB local, 2=SB express, 3=NB express, 4=NB local
  // Bronx (except Dyre Ave): M=bi-directional express
  // Dyre Ave: 1=SB, 2=NB, 3=bi-directional
  optional string scheduled_track = 1;

  // Actual track (only set for the NEXT station)
  // Different actual vs scheduled = train was manually rerouted
  optional string actual_track = 2;
}
```

When `actual_track` differs from `scheduled_track`, the train has been manually rerouted and **prediction data may become unreliable**.

### 3.5 Feed Update Frequency

- Feeds are regenerated approximately every **30 seconds**
- Data should not be older than **90 seconds** for trip updates and vehicle positions
- Service alerts should not be older than **10 minutes**
- Predicted times are **not updated** when a train is not moving (detect via VehiclePosition timestamp)

---

## 4. GTFS Static Data

The GTFS static data is the companion dataset needed to interpret the real-time feed. It maps stop_ids to human-readable station names, route_ids to line names, and provides the scheduled timetable.

### 4.1 Download URLs

| Dataset | URL | Update Frequency |
|---------|-----|-----------------|
| **Subway (Regular)** | `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip` | A few times per year |
| **Subway (Supplemented)** | `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_supplemented.zip` | Hourly (includes 7-day service changes) |
| **LIRR** | `https://rrgtfsfeeds.s3.amazonaws.com/gtfslirr.zip` | Periodic |
| **Metro-North** | `https://rrgtfsfeeds.s3.amazonaws.com/gtfsmnr.zip` | Periodic |
| **Bus (Bronx)** | `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_bx.zip` | Quarterly |
| **Bus (Brooklyn)** | `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_b.zip` | Quarterly |
| **Bus (Manhattan)** | `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_m.zip` | Quarterly |
| **Bus (Queens)** | `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_q.zip` | Quarterly |
| **Bus (Staten Island)** | `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_si.zip` | Quarterly |
| **MTA Bus Company** | `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_busco.zip` | Quarterly |

### 4.2 Key Files in the Static GTFS Archive

| File | Purpose |
|------|---------|
| `stops.txt` | **Station/stop definitions** -- stop_id, stop_name, lat/lon, parent_station |
| `routes.txt` | Route definitions -- route_id, route_short_name, route_color |
| `trips.txt` | Trip definitions linking routes to stop sequences |
| `stop_times.txt` | Scheduled arrival/departure times for each trip at each stop |
| `transfers.txt` | Transfer connections between stops/stations |
| `calendar.txt` / `calendar_dates.txt` | Service calendars |

### 4.3 Stop ID Format and Structure

The MTA uses a **hierarchical stop ID system** with three levels:

```
Parent Station:  101          (location_type=1, represents the station complex)
  Child Stop:    101N         (Northbound platform/boarding area)
  Child Stop:    101S         (Southbound platform/boarding area)
```

**Example entries from `stops.txt`**:

```csv
stop_id,stop_name,stop_lat,stop_lon,location_type,parent_station
101,Van Cortlandt Park-242 St,40.889248,-73.898583,1,
101N,Van Cortlandt Park-242 St,40.889248,-73.898583,,101
101S,Van Cortlandt Park-242 St,40.889248,-73.898583,,101
```

Key points:
- **Parent station** (e.g., `101`): Has `location_type=1`, no parent. Represents the physical station.
- **Child stops** (e.g., `101N`, `101S`): Reference parent via `parent_station` field. The suffix indicates direction:
  - `N` = Northbound (Uptown/Bronx-bound)
  - `S` = Southbound (Downtown/Brooklyn-bound)
- The GTFS-RT feed uses the **child stop IDs** (with N/S suffix) in its `stop_id` fields.
- Stop IDs are numeric for the original IRT/BMT/IND lines (e.g., `101` through `902`). Some stations serving multiple complexes may have letter prefixes.

### 4.4 Supplemented vs Regular Static Feed

- **Regular GTFS**: The "normal" schedule. Updated a few times per year during schedule changes.
- **Supplemented GTFS**: Includes planned service changes (weekend work, reroutes) for the next 7 calendar days. Updated hourly. **Use this for more accurate schedule matching.**

---

## 5. How to Get Train Arrival Times at a Specific Station

### Step-by-Step Walkthrough

#### Step 1: Identify the Station's stop_id

Download the static GTFS data and look up the station in `stops.txt`:

```bash
# Download and extract
curl -o gtfs_subway.zip https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip
unzip gtfs_subway.zip -d gtfs_subway

# Find a station (e.g., Times Square-42 St)
grep -i "times sq" gtfs_subway/stops.txt
```

Example result:
```
725,Times Sq-42 St,40.75529,-73.987495,1,
725N,Times Sq-42 St,40.75529,-73.987495,,725
725S,Times Sq-42 St,40.75529,-73.987495,,725
```

So for Times Square: `725N` (northbound) and `725S` (southbound).

**Important**: Some large station complexes may have multiple stop IDs for different line groups. For example, Times Square-42 St serves the 1/2/3, 7, N/Q/R/W, and S lines, each potentially with different stop IDs. Check which stop_id corresponds to which route via `stop_times.txt` or use a library that handles this mapping.

#### Step 2: Determine Which Feed to Query

Match the subway line(s) you care about to the correct feed endpoint:

| If you want... | Query this feed |
|-----------------|----------------|
| 1, 2, 3 trains at Times Sq | `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs` |
| N, Q, R, W trains at Times Sq | `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs-nqrw` |
| 7 train at Times Sq | `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs` |

#### Step 3: Fetch the Feed

```bash
# Simple fetch with curl (returns binary protobuf)
curl -o feed.pb "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs"
```

The response is a binary Protocol Buffer -- it is **not human-readable** and must be decoded.

#### Step 4: Parse the Protobuf Response

##### Option A: Using Python with `nyct-gtfs` (Recommended -- Easiest)

```python
from nyct_gtfs import NYCTFeed

# Initialize feed for the 1 line
feed = NYCTFeed("1")

# Filter trips headed for a specific stop
trains = feed.filter_trips(
    line_id=["1", "2", "3"],
    headed_for_stop_id=["725N", "725S"],  # Times Sq northbound and southbound
    underway=True
)

for train in trains:
    print(f"Route: {train.route_id}")
    print(f"Direction: {train.direction}")  # "N" or "S"
    print(f"Headsign: {train.headsign_text}")
    print(f"Assigned: {train.is_assigned}")

    for update in train.stop_time_updates:
        if update.stop_id in ("725N", "725S"):
            print(f"  Arrival at {update.stop_name}: {update.arrival}")
            print(f"  Stop ID: {update.stop_id}")
```

Install: `pip install nyct-gtfs`

##### Option B: Using Python with `underground`

```python
from underground import SubwayFeed

# Fetch feed for the Q line
feed = SubwayFeed.get("Q")

# Extract stop dictionary
# Returns: {"route_id": {"stop_id": [datetime, datetime, ...]}}
stops = feed.extract_stop_dict()

# Get all Q train arrivals at a specific stop
if "Q" in stops and "R31N" in stops["Q"]:
    arrivals = stops["Q"]["R31N"]
    for arrival_time in arrivals:
        print(f"Q train arriving at: {arrival_time}")
```

Install: `pip install underground`

##### Option C: Using Python with raw protobuf parsing

```python
import requests
from google.transit import gtfs_realtime_pb2
from datetime import datetime
import pytz

# Fetch the feed
response = requests.get(
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs"
)

# Parse protobuf
feed = gtfs_realtime_pb2.FeedMessage()
feed.ParseFromString(response.content)

# Target stop
TARGET_STOP = "725N"  # Times Sq-42 St, northbound
eastern = pytz.timezone("America/New_York")
now = datetime.now(eastern)

# Iterate through all entities
arrivals = []
for entity in feed.entity:
    if not entity.HasField("trip_update"):
        continue

    trip = entity.trip_update
    route_id = trip.trip.route_id  # e.g., "1", "2", "3"

    for stop_update in trip.stop_time_update:
        if stop_update.stop_id == TARGET_STOP:
            arrival_time = stop_update.arrival.time  # POSIX timestamp
            if arrival_time > 0:
                dt = datetime.fromtimestamp(arrival_time, tz=eastern)
                minutes_away = (dt - now).total_seconds() / 60
                arrivals.append({
                    "route": route_id,
                    "arrival": dt,
                    "minutes_away": round(minutes_away, 1),
                    "stop_id": stop_update.stop_id
                })

# Sort by arrival time
arrivals.sort(key=lambda x: x["arrival"])

for a in arrivals:
    print(f"{a['route']} train: {a['arrival'].strftime('%I:%M %p')} "
          f"({a['minutes_away']} min away)")
```

Install: `pip install gtfs-realtime-bindings requests pytz`

**Note**: The raw approach using `gtfs-realtime-bindings` will parse the standard GTFS-RT fields but will **not** decode NYCT-specific extensions (train_id, is_assigned, direction, scheduled_track, actual_track). For those, you need to compile the `nyct-subway.proto` extension file or use a library like `nyct-gtfs` that handles it.

##### Option D: Using Node.js

```javascript
const GtfsRealtimeBindings = require("gtfs-realtime-bindings");

async function getArrivals(stopId) {
  const response = await fetch(
    "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs"
  );
  const buffer = await response.arrayBuffer();
  const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
    new Uint8Array(buffer)
  );

  const arrivals = [];
  const now = Date.now() / 1000;

  for (const entity of feed.entity) {
    if (!entity.tripUpdate) continue;

    for (const stopUpdate of entity.tripUpdate.stopTimeUpdate) {
      if (stopUpdate.stopId === stopId && stopUpdate.arrival) {
        const arrivalTime = Number(stopUpdate.arrival.time);
        if (arrivalTime > now) {
          arrivals.push({
            route: entity.tripUpdate.trip.routeId,
            arrival: new Date(arrivalTime * 1000),
            minutesAway: Math.round((arrivalTime - now) / 60),
          });
        }
      }
    }
  }

  return arrivals.sort((a, b) => a.arrival - b.arrival);
}

getArrivals("725N").then((arrivals) => {
  arrivals.forEach((a) => {
    console.log(`${a.route} train: ${a.arrival.toLocaleTimeString()} (${a.minutesAway} min)`);
  });
});
```

Install: `npm install gtfs-realtime-bindings`

#### Step 5: Handle Direction (Northbound / Southbound)

Direction is encoded in two places:

1. **stop_id suffix**: `N` or `S` appended to the numeric stop ID
   - `725N` = Times Sq-42 St, Northbound platform
   - `725S` = Times Sq-42 St, Southbound platform

2. **NYCT extension**: `NyctTripDescriptor.direction` enum
   - `NORTH (1)` = Uptown / Bronx-bound
   - `SOUTH (3)` = Downtown / Brooklyn-bound

To get arrivals for both directions, query both `{stop_id}N` and `{stop_id}S`.

**Directional meaning varies by line/location**:
- For most of Manhattan: N=Uptown, S=Downtown
- For Brooklyn: N=toward Manhattan, S=away from Manhattan
- For Queens (7 train): N=toward Flushing, S=toward Manhattan
- Shuttles have their own conventions (documented in the proto)

---

## 6. Alternative and Supplementary APIs

### 6.1 SIRI Bus Time API

For real-time bus information, the MTA uses SIRI (Service Interface for Real Time Information):

**StopMonitoring endpoint** (bus arrivals at a stop):
```
https://bustime.mta.info/api/siri/stop-monitoring.json?key=YOUR_KEY&MonitoringRef=STOP_ID
```

**VehicleMonitoring endpoint** (track a specific vehicle or all on a line):
```
https://bustime.mta.info/api/siri/vehicle-monitoring.json?key=YOUR_KEY&LineRef=MTA+NYCT_B63
```

Parameters:
- `key`: Required API key
- `MonitoringRef`: GTFS stop_id
- `OperatorRef`: `MTA` (optional, defaults to all)
- `LineRef`: Line identifier (e.g., `MTA NYCT_B63`)
- `version`: `2` (recommended)

Notable: Bus Time provides "distance away" rather than time-based predictions as an extension to standard SIRI.

**Rate limit**: 1 request per 30 seconds, strictly enforced.

Documentation: https://bustime.mta.info/wiki/Developers/SIRIStopMonitoring

### 6.2 OneBusAway REST API (Bus)

A REST API for bus discovery services (routes, stops, schedules):
- Documentation: https://bustime.mta.info/wiki/Developers/OneBusAwayRESTfulAPI

### 6.3 MTA Open Data Portal

Historical and aggregated datasets on the NY State open data platform:
- **Portal**: https://data.ny.gov (search for "MTA")
- **Catalog**: https://data.ny.gov/Transportation/MTA-Open-Data-Catalog-and-Publication-Schedule/f462-ka72
- Includes: hourly ridership by station, fare payment data, performance metrics
- **Performance dashboard**: https://metrics.mta.info

### 6.4 Service Status / Alerts API

For building a "service status box" showing current service disruptions:
- Endpoint: `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys/all-alerts`
- Key fields: `sort_order` (higher = more severe), `alert_type` (e.g., "Delays", "Part Suspended"), `InformedEntity.route_id`
- Alert IDs by agency: `MTASBWY` (subway), `MTABC` (bus), `LI` (LIRR), `MNR` (Metro-North)
- Documentation: https://new.mta.info/document/90881

### 6.5 Third-Party Proxies and Wrappers

- **Transitland**: Caches and redistributes MTA feeds with additional metadata. https://www.transit.land
- **MTAPI** (GitHub: jonthornton/MTAPI): JSON proxy server that converts protobuf feeds to REST/JSON

---

## 7. Common Libraries and Tools

### 7.1 Official GTFS-RT Bindings

The `gtfs-realtime-bindings` project (maintained by MobilityData) provides pre-generated protobuf bindings:

| Language | Package | Install |
|----------|---------|---------|
| **Python** | `gtfs-realtime-bindings` | `pip install gtfs-realtime-bindings` |
| **JavaScript/Node.js** | `gtfs-realtime-bindings` | `npm install gtfs-realtime-bindings` |
| **Java** | `gtfs-realtime-bindings` | Maven: `com.google.transit:gtfs-realtime-bindings` |
| **Go** | `gtfs-realtime-bindings` | Module in the repo's `golang/` directory |
| **.NET** | `GtfsRealtimeBindings` | NuGet package |
| **Rust** (unofficial) | `gtfs-rt` | `cargo add gtfs-rt` |

GitHub: https://github.com/MobilityData/gtfs-realtime-bindings

### 7.2 MTA-Specific Libraries

| Library | Language | Description | Install |
|---------|----------|-------------|---------|
| **nyct-gtfs** | Python | High-level NYC subway feed parser. Handles NYCT extensions, stop name resolution, direction, filtering. **Recommended for subway.** | `pip install nyct-gtfs` |
| **underground** | Python | Utilities for NYC realtime MTA data. CLI tools included. No API key needed. | `pip install underground` |
| **nyctrains** | Python | FastAPI-based, exposes feeds as human-readable JSON | `pip install nyctrains` |
| **mta-gtfs** | Node.js | Node.js MTA API library for static + realtime data | `npm install mta-gtfs` |
| **OneMTA** | Java | MTA Bus and Subway APIs in one Java library | GitHub: KatsuteDev/OneMTA |
| **mta** (Go) | Go | Go package for MTA GTFS-RT parsing | `go get github.com/chuhlomin/mta/v2` |

### 7.3 Protobuf Tools

- **protoc**: The Protocol Buffer compiler. Needed if you want to compile the NYCT extension `.proto` files yourself.
- **protobuf3-to-dict** (Python): Converts protobuf messages to Python dictionaries for easier manipulation. `pip install protobuf3-to-dict`
- **protobuf.js** (Node.js): Alternative JavaScript protobuf library. Can load `.proto` files directly at runtime.

### 7.4 NYCT Extension Proto Files

To decode MTA-specific fields, you need two proto files:
1. **Base GTFS-RT**: https://github.com/MobilityData/gtfs-realtime-bindings/blob/master/gtfs-realtime.proto
2. **NYCT Subway extensions**: Available from MTA's developer resources (originally at `datamine.mta.info/sites/all/files/pdfs/nyct-subway.proto.txt`, also mirrored on GitHub in various projects)

Compile with:
```bash
protoc --python_out=. gtfs-realtime.proto nyct-subway.proto
```

### 7.5 Useful CLI Tools

```bash
# underground CLI -- list stops for a route
underground findstops --route Q

# underground CLI -- show departures
underground stops Q

# curl + protoc for quick inspection
curl -s "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs" \
  | protoc --decode=transit_realtime.FeedMessage gtfs-realtime.proto
```

---

## 8. Known Limitations and Gotchas

### 8.1 A Division vs B Division: Different Tracking Technologies

This is the single most important thing to understand about MTA real-time data quality:

**A Division (Numbered lines: 1, 2, 3, 4, 5, 6, 7, S)**
- Tracked by **Automatic Train Supervision (ATS)** -- a centralized system that knows train positions continuously along the track
- The **L line** additionally has **CBTC** (Communications-Based Train Control), the most advanced system
- Predictions are generally **accurate and reliable**
- Countdown clocks have been operational since ~2007

**B Division (Lettered lines: A, C, E, B, D, F, M, G, J, Z, N, Q, R, W, SIR)**
- Tracked by **Bluetooth beacons** at station entrances/exits
- The system only knows when a train **enters or leaves a station**, not where it is between stations
- Arrival predictions are **estimates based on scheduled travel time** between stations
- If a train is stuck between stations, moving slowly, or rerouted, the system does not know and **will not update predictions**
- Accuracy: approximately **80-95%** by MTA's own estimate
- In one survey of 100 trains: 44 arrived later than predicted, 20 on time, 35 early, 1 never showed

### 8.2 Trip Replacement Period

The GTFS-RT feed uses a "replacement period" model (typically **now + 30 minutes**):
- Within this window, the feed is **authoritative**
- Any scheduled trip from static GTFS **not present** in the real-time feed should be considered **cancelled**
- This is different from many other transit agencies that use incremental updates

### 8.3 Unassigned Trips

Trips appear in the feed before a physical train is assigned to them:
- `is_assigned = false`: Trip is planned but no train has been designated yet
- `is_assigned = true`: A physical train has been assigned and will likely depart soon
- Unassigned trips may be cancelled without warning
- Trips are usually assigned **a few minutes before** scheduled departure, sometimes late

### 8.4 Trip ID Instability

- Trip IDs in the real-time feed are **shortened versions** of static GTFS trip IDs
  - Real-time: `"123550_1..S02R"`
  - Static: `"A20130803WKD_000800_1..S03R"`
- Partial matching is possible but not guaranteed
- The `nyct_train_id` is for internal MTA use and provides an association with rail operations identifiers, but it is not stable across feed updates
- Train identifiers can **change from minute to minute** in some cases

### 8.5 Stale Data and Frozen Predictions

- When a train is not moving, its predicted arrival times are **not updated**
- The countdown clocks only count down when trains are moving; otherwise they show the last published time
- Detect stale data by checking the `timestamp` in VehiclePosition -- if it hasn't changed, the train hasn't moved
- The `underground` library has a "stalled timeout" feature (default 90 seconds) to filter out stale trains

### 8.6 Track Rerouting

- When `actual_track` differs from `scheduled_track` in the NYCT extension, the train has been manually rerouted
- In this case, **prediction data becomes unreliable** because the train is no longer following its schedule
- The MTA's countdown clock system removes rerouted trains from schedule displays
- The `actual_track` field is only set for the **first (next) station** of the remaining trip -- it is not known further ahead

### 8.7 Shuttles and Special Services

- **42nd St Shuttle (S)**: Included in the A Division feed (`gtfs`). Direction conventions: to Grand Central = NORTH, to Times Square = SOUTH.
- **Franklin Ave Shuttle (FS)**: Included in the ACE feed (`gtfs-ace`)
- **Rockaway Shuttle (H)**: Included in the ACE feed (`gtfs-ace`)
- Shuttle predictions may be less reliable since they operate on short, fixed routes

### 8.8 Express/Local Distinctions

- The feed provides the **route_id** (e.g., "2" or "5") but does not explicitly label a trip as "express" or "local"
- You must infer express vs local from the **list of stops** in the trip's `stop_time_update` array
- An express train will skip local-only stations (those stops will simply not appear in the updates)
- The `scheduled_track` field can also hint at this: track 1/4 = local, track 2/3 = express (in Manhattan)

### 8.9 Service Changes and Supplements

- The NYC subway has **thousands of supplement schedules per year** due to maintenance, construction, and planned work
- During service changes, trains may be rerouted to different tracks, skip stations, or run on different lines
- The **supplemented GTFS** feed (updated hourly) captures planned changes for the next 7 days
- Real-time predictions during service disruptions are less reliable, especially for B Division lines

### 8.10 Feed Reliability

- Feeds occasionally go down or return empty responses
- Implement retry logic and fallback handling
- Cache the last successful response for graceful degradation
- The `underground` library defaults to 100 retry attempts for connection failures

### 8.11 Alerts Feed Limitations

- The only alerts included in the NYCT Subway GTFS-RT feed are notifications about **delayed trains**
- For comprehensive service status (planned work, suspensions, etc.), use the dedicated alerts feeds
- Alert severity is encoded in `sort_order` (higher = more severe): Delays=22, Suspended=39

---

## Appendix A: Quick Reference -- Minimal Python Example

```python
"""
Minimal example: Get next train arrivals at a NYC subway station.
No API key required.
"""
from nyct_gtfs import NYCTFeed
from datetime import datetime, timezone

# 1. Pick your line and station
LINE = "1"           # Which subway line
STOP_ID = "725N"     # Times Sq-42 St, Northbound (see stops.txt)

# 2. Fetch and parse the feed
feed = NYCTFeed(LINE)

# 3. Get upcoming arrivals
now = datetime.now(timezone.utc)
arrivals = []

for trip in feed.trips:
    for stop in trip.stop_time_updates:
        if stop.stop_id == STOP_ID and stop.arrival and stop.arrival > now:
            arrivals.append({
                "line": trip.route_id,
                "arrival": stop.arrival,
                "minutes": round((stop.arrival - now).total_seconds() / 60, 1),
                "direction": trip.direction,
                "assigned": trip.is_assigned,
            })

arrivals.sort(key=lambda x: x["arrival"])

for a in arrivals[:5]:
    assigned = "*" if a["assigned"] else " "
    print(f"  {assigned} {a['line']} train  {a['minutes']:5.1f} min  "
          f"({a['arrival'].strftime('%I:%M %p')})")
```

## Appendix B: Complete Feed URL Reference

### Subway GTFS-RT (Realtime)

```
https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs          # 1,2,3,4,5,6,7,S
https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs-ace      # A,C,E,H,FS
https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs-bdfm     # B,D,F,M
https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs-g        # G
https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs-jz       # J,Z
https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs-l        # L
https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs-nqrw     # N,Q,R,W
https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs-si       # SIR
```

### Commuter Rail GTFS-RT

```
https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr/gtfs-lirr     # Long Island Rail Road
https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr/gtfs-mnr       # Metro-North Railroad
```

### Service Alerts GTFS-RT

```
https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys/all-alerts      # All agencies
https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys/subway-alerts   # Subway only
https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys/bus-alerts      # Bus only
https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys/lirr-alerts     # LIRR only
https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys/mnr-alerts      # Metro-North only
```

### Static GTFS

```
https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip           # Subway (regular schedule)
https://rrgtfsfeeds.s3.amazonaws.com/gtfs_supplemented.zip     # Subway (with 7-day service changes)
https://rrgtfsfeeds.s3.amazonaws.com/gtfslirr.zip              # LIRR
https://rrgtfsfeeds.s3.amazonaws.com/gtfsmnr.zip               # Metro-North
```

## Appendix C: Sources

- MTA Developer Resources: https://www.mta.info/developers
- MTA API Gateway: https://api.mta.info
- GTFS-RT Specification: https://gtfs.org/documentation/realtime/reference/
- GTFS-RT Protobuf Schema: https://github.com/MobilityData/gtfs-realtime-bindings/blob/master/gtfs-realtime.proto
- NYCT Subway Proto Extensions: https://github.com/chriswhong/mta-realtime-test/blob/master/nyct-subway.proto.txt
- MTA GTFS-RT Reference (PDF): https://www.mta.info/document/134521
- nyct-gtfs Library: https://github.com/Andrew-Dickinson/nyct-gtfs
- underground Library: https://github.com/nolanbconaway/underground
- MTAPI (JSON Proxy): https://github.com/jonthornton/MTAPI
- MTA Bus Time (SIRI): https://bustime.mta.info/wiki/Developers/Index
- MTA Alerts Documentation: https://new.mta.info/document/90881
- MTA Open Data: https://www.mta.info/open-data
- NY State Open Data: https://data.ny.gov
- Transitland Feed Directory: https://www.transit.land
- MTA Developer Google Group: https://groups.google.com/g/mtadeveloperresources
- MTA Data Feed Agreement: https://api.mta.info/#/DataFeedAgreement
