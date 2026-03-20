# MTA My Way -- Implementation Plan

## 1. Project Overview

### Vision

MTA My Way is a mobile-first progressive web app for NYC subway commuters who are actively riding the system. It is built for the person standing on a platform at 8:02 AM who needs to know, in under three seconds, when their train arrives, whether a transfer is worth it, and whether anything is broken on their route. It is not a trip planner for tourists. It is not a map explorer. It is a fast, opinionated, commuter-grade tool.

### Target User

Daily NYC subway commuters (estimated 3.5 million weekday rides). The primary persona rides the same route most days, has strong opinions about express-vs-local tradeoffs, and already knows the system well enough that they do not need turn-by-turn directions. They want data, not guidance.

### Value Proposition -- What Makes This Different

Based on the competitive analysis, the existing landscape has specific gaps that MTA My Way targets:

1. **Speed to information.** The official MTA app's 2024 redesign buried arrival times behind multiple taps. Underway and Commutely proved that "open and see your data in under 3 seconds" is the defining feature commuters want. MTA My Way makes favorites-first the entire architecture -- the home screen is your arrivals, not a map or search bar.

2. **Transfer intelligence.** No existing app answers "should I transfer?" with real-time data. Subway Now shows arrivals; Citymapper plans trips. Neither tells you "if you transfer to the express at this station, you save 4 minutes based on current train positions." MTA My Way does.

3. **Alerts that are actually useful.** The competitive analysis documents that MTA notifications are either too broad (line-level) or incomprehensible (raw MTA alert text). MTA My Way filters alerts to the exact stations, lines, and directions the user cares about, and rewrites them in plain language.

4. **PWA -- no app store friction.** Most competitors are native iOS/Android apps. A PWA means instant access via URL, installable to home screen, works offline, and avoids the 30% app store tax. It also means cross-platform from day one with a single codebase.

5. **No ads, no accounts, no subscriptions for core features.** The competitive analysis shows that Moovit's aggressive ads cause people to miss trains, and that subscription fatigue is real. Core functionality (arrivals, favorites, alerts) is permanently free.

---

## 2. Technical Architecture

### 2.1 High-Level Architecture

A single container runs on the `apexalgo-iad` Kubernetes cluster (us-east-1), serving both the API and the static PWA assets. Public access is through the existing Cloudflare Tunnel. Deployment follows the established GitOps pattern via ArgoCD.

```
     +-------------------+
     |   MTA GTFS-RT     |
     |   Feed Endpoints  |
     |   (8 subway feeds |
     |    + alerts feed) |
     +--------+----------+
              |
              | Protobuf (binary)
              | (~sub-10ms from us-east-1)
              v
+----------------------------------------------+
|   apexalgo-iad cluster (us-east-1)           |
|                                              |
|   +----------------------------------------+|
|   |  mta-my-way container (Hono + Node.js) ||
|   |                                        ||
|   |  /api/*    Backend API                 ||
|   |    - Feed polling (30s interval)       ||
|   |    - Protobuf parse + NYCT extensions  ||
|   |    - JSON transform + cache            ||
|   |    - Alert filter + simplification     ||
|   |    - Transfer computation              ||
|   |    - Web Push sender                   ||
|   |                                        ||
|   |  /*        Static PWA assets           ||
|   |    - Built React app (vite build)      ||
|   |    - Service Worker                    ||
|   |    - Web App Manifest                  ||
|   +----------------------------------------+|
|                                              |
+---------------------+------------------------+
                      |
                      | Cloudflare Tunnel
                      | (already configured)
                      v
              +----------------+
              |  Cloudflare    |
              |  (TLS, CDN,    |
              |   caching)     |
              +-------+--------+
                      |
                      | HTTPS
                      v
              +----------------+
              |  Mobile PWA    |
              |  (browser)     |
              +----------------+
```

**Key architectural decisions:**
- **Single origin:** Frontend and API are served from the same container, eliminating CORS entirely.
- **us-east-1 proximity:** MTA feeds are NYC-hosted. Fetching from IAD gives sub-10ms latency vs 60-80ms from west coast.
- **Cloudflare Tunnel:** The cluster already has an active tunnel. No new ingress infrastructure needed -- just add a DNS route for the mta-my-way service.
- **Cloudflare caching:** Static assets cached at the edge aggressively. API responses cached with short TTL (15s) for global users.

### 2.2 Frontend

**Framework: React 19 + Vite 6**

Rationale:
- React's component model maps well to the repeating UI patterns (arrival rows, station cards, alert banners).
- Vite provides fast HMR during development and optimized production builds with code splitting.
- React 19's server components are not needed here -- this is a client-heavy app where state changes every 30 seconds. Standard client React is the right choice.
- The ecosystem depth (React Router, testing libraries, PWA plugins) is unmatched.

**PWA Layer: vite-plugin-pwa (Workbox under the hood)**

- Service Worker for offline caching of static assets and last-known arrival data.
- Web App Manifest for installability (home screen icon, splash screen, standalone display mode).
- Background sync for queuing push notification subscription changes when offline.

**State Management: Zustand**

Rationale:
- Lightweight (1.1kB) compared to Redux or MobX.
- No boilerplate, no providers, no context wrappers.
- Perfect for the app's state shape: a flat set of favorites, a map of station arrivals, and a list of alerts.
- Built-in middleware for persisting to localStorage (favorites, preferences).

**Styling: Tailwind CSS 4**

Rationale:
- Utility-first approach produces the smallest possible CSS bundle for mobile.
- Design tokens (colors, spacing, typography) are configured once and enforced everywhere.
- No runtime cost (unlike CSS-in-JS).
- Responsive design utilities are essential for the mobile-first approach.

### 2.3 Backend

**Runtime: Node.js 22 LTS with Hono framework, deployed as a single container on apexalgo-iad**

Rationale:
- Hono is a lightweight web framework (14kB) that can serve both the API and static PWA assets from a single process.
- The `gtfs-realtime-bindings` npm package provides native protobuf parsing for GTFS-RT feeds.
- Node.js has the best protobuf.js ecosystem for working with NYCT extensions.
- TypeScript end-to-end (shared types between frontend and backend).
- Single container simplifies deployment -- one Dockerfile, one Kubernetes Deployment, one ArgoCD Application.

**Responsibilities:**
1. Serve the built PWA static assets (`/*`) -- the Vite production build is copied into the container image.
2. Poll MTA GTFS-RT feeds on a 30-second interval (matching MTA's update frequency).
3. Parse protobuf responses including NYCT extensions (direction, is_assigned, track info).
4. Transform into a clean JSON API (`/api/*`) organized by station.
5. Maintain an in-memory cache with 30-second TTL, falling back to last-good-response if MTA feeds are down.
6. Serve the GTFS static data (stops, routes, transfers) as pre-processed JSON.
7. Compute transfer recommendations by comparing arrival times across lines at transfer stations.
8. Filter and simplify service alerts, matching them to affected stations/lines.
9. Send Web Push notifications for subscribed alert conditions.

### 2.4 Data Flow

```
1. Backend timer fires every 30 seconds
2. Fetch all 8 subway GTFS-RT feeds + subway alerts feed in parallel
3. Parse each protobuf response into structured objects
4. For each feed entity:
   a. Extract route_id, direction, stop_time_updates
   b. Index arrivals by stop_id (e.g., "725N" -> [{route: "1", arrival: 1742425800, assigned: true}, ...])
   c. Flag stale data (VehiclePosition timestamp > 90s old)
   d. Mark unassigned trips (is_assigned = false) with lower confidence
5. Merge all feeds into a single station-indexed arrival map
6. Compute transfer opportunities at known transfer stations
7. Cache the merged result; serve to frontend via REST endpoint
8. Parse alerts feed; diff against previous alerts; trigger push notifications for new/changed alerts
```

### 2.5 Push Notification Architecture

```
Frontend (Service Worker)          Backend                    MTA
    |                                 |                        |
    |-- Subscribe (PushSubscription)->|                        |
    |                                 |-- Poll alerts feed --->|
    |                                 |<-- Alert protobuf -----|
    |                                 |                        |
    |                                 | Diff: new alert found  |
    |                                 | Match against subscriptions
    |<-- Web Push notification -------|                        |
    |                                 |                        |
```

- Uses the Web Push API (RFC 8030) with VAPID authentication.
- Push subscriptions are stored server-side, keyed by a hash of the subscription endpoint (no user accounts needed).
- Each subscription is associated with a set of station+line+direction tuples (the user's favorites).
- When a new alert matches a subscription's tuples, a push notification is sent.
- The Service Worker handles the `push` event and displays a notification even when the app is closed.

---

## 3. Data Model

### 3.1 User Favorites (localStorage, synced to backend for push)

```typescript
interface UserPreferences {
  favorites: Favorite[];
  commutes: Commute[];
  settings: Settings;
  pushSubscription: PushSubscriptionJSON | null;
  schemaVersion: number; // for migration
}

interface Favorite {
  id: string;                    // UUID
  stationId: string;             // Parent station ID, e.g., "725"
  stationName: string;           // "Times Sq-42 St"
  lines: string[];               // ["1", "2", "3"] -- subset of lines at this station
  direction: "N" | "S" | "both"; // Northbound, Southbound, or both
  sortOrder: number;             // Display ordering
  label?: string;                // Optional user label, e.g., "Morning commute"
}

interface Commute {
  id: string;                    // UUID
  name: string;                  // "Work", "Home"
  origin: StationRef;
  destination: StationRef;
  preferredLines: string[];      // Lines the user prefers for this commute
  enableTransferSuggestions: boolean;
}

interface StationRef {
  stationId: string;
  stationName: string;
}

interface Settings {
  theme: "light" | "dark" | "system";
  showUnassignedTrips: boolean;  // Default: false (hide low-confidence arrivals)
  refreshInterval: number;       // Seconds, default 30, min 15
  alertSeverityFilter: "all" | "delays" | "major"; // Default: "delays"
  hapticFeedback: boolean;       // Vibrate on pull-to-refresh
}
```

### 3.2 Commute / Trip Configuration

```typescript
interface CommuteAnalysis {
  commuteId: string;
  origin: StationRef;
  destination: StationRef;
  directRoutes: DirectRoute[];
  transferRoutes: TransferRoute[];
  recommendation: "direct" | "transfer";
  timestamp: number; // When this analysis was computed
}

interface DirectRoute {
  line: string;                  // e.g., "F"
  direction: "N" | "S";
  nextArrivals: ArrivalTime[];   // Next 3 arrivals at origin
  estimatedTravelMinutes: number;
  estimatedArrivalAtDestination: number; // POSIX timestamp
}

interface TransferRoute {
  legs: TransferLeg[];
  totalEstimatedMinutes: number;
  estimatedArrivalAtDestination: number;
  timeSavedVsDirect: number;     // Minutes saved compared to best direct route
  transferStation: StationRef;
}

interface TransferLeg {
  line: string;
  direction: "N" | "S";
  boardAt: StationRef;
  alightAt: StationRef;
  nextArrival: ArrivalTime;
  estimatedTravelMinutes: number;
}
```

### 3.3 Cached GTFS Static Data

Processed at build time and served as static JSON files. These change only a few times per year.

```typescript
interface StationIndex {
  [stationId: string]: Station;
}

interface Station {
  id: string;                    // Parent station ID, e.g., "725"
  name: string;                  // "Times Sq-42 St"
  lat: number;
  lon: number;
  lines: string[];               // All lines serving this station
  northStopId: string;           // e.g., "725N"
  southStopId: string;           // e.g., "725S"
  transfers: TransferConnection[];
  complex?: string;              // Station complex ID for multi-entrance stations
  ada: boolean;                  // ADA accessible
  borough: "manhattan" | "brooklyn" | "queens" | "bronx" | "statenisland";
}

interface TransferConnection {
  toStationId: string;
  toLines: string[];
  walkingSeconds: number;        // Estimated walking time for transfer
  accessible: boolean;           // Transfer path is ADA accessible
}

interface RouteIndex {
  [routeId: string]: Route;
}

interface Route {
  id: string;                    // e.g., "1", "A", "N"
  shortName: string;             // e.g., "1", "A", "N"
  longName: string;              // e.g., "Broadway-7th Ave Local"
  color: string;                 // Hex color, e.g., "#EE352E"
  textColor: string;             // Text color for contrast
  feedId: string;                // Which GTFS-RT feed, e.g., "gtfs", "gtfs-ace"
  division: "A" | "B";          // A Division (numbered) or B Division (lettered)
  stops: string[];               // Ordered list of stop IDs for this route
}
```

### 3.4 Real-Time Arrival Data (from backend API)

```typescript
interface StationArrivals {
  stationId: string;
  stationName: string;
  updatedAt: number;             // POSIX timestamp of last feed parse
  feedAge: number;               // Seconds since MTA generated this data
  northbound: ArrivalTime[];
  southbound: ArrivalTime[];
  alerts: StationAlert[];
}

interface ArrivalTime {
  line: string;                  // Route ID, e.g., "1"
  direction: "N" | "S";
  arrivalTime: number;           // POSIX timestamp
  minutesAway: number;           // Computed convenience field
  isAssigned: boolean;           // Train physically assigned to this trip
  isRerouted: boolean;           // actual_track != scheduled_track
  tripId: string;                // For tracking the same train across refreshes
  destination: string;           // Terminal station name (headsign)
  confidence: "high" | "medium" | "low";
  // high = A Division + assigned
  // medium = A Division + unassigned, or B Division + assigned
  // low = B Division + unassigned
}

interface StationAlert {
  id: string;
  severity: "info" | "warning" | "severe";
  headline: string;              // Simplified, plain-language headline
  description: string;           // Full description
  affectedLines: string[];
  activePeriod: { start: number; end?: number };
  cause: string;
  effect: string;
}
```

---

## 4. Feature Breakdown by Phase

### Phase 1: Core -- Real-Time Arrivals, Favorites, Station Search

**Goal:** A functional app that a commuter can install and use daily for checking arrival times at their stations.

**Features:**

1. **Station search** -- Type-ahead search over all 472 subway stations. Search by name, line, or cross-street. Results show lines served and borough.

2. **Station detail view** -- For any station, show next arrivals for all lines in both directions. Group by direction (Northbound / Southbound). Show line bullet, destination, minutes away, and confidence indicator. Auto-refresh every 30 seconds. Pull-to-refresh for manual update.

3. **Favorites system** -- Add stations to favorites from station detail view. Configure which lines and direction to show per favorite. Reorder favorites via drag-and-drop. Persist to localStorage.

4. **Home dashboard** -- The app opens to the favorites dashboard. Each favorite shows the next 2-3 arrivals inline, no tap required. Tap a favorite to expand to full station detail. "Last updated X seconds ago" indicator.

5. **Backend API** -- Feed polling, protobuf parsing, JSON API for arrivals by station. Health endpoint. Same-origin serving of PWA assets (no CORS needed).

6. **PWA shell** -- Installable via manifest. Offline fallback showing last-known data. Service Worker caching of static assets.

7. **GTFS static data pipeline** -- Script to download, parse, and pre-process `stops.txt`, `routes.txt`, and `transfers.txt` into optimized JSON. Run periodically (weekly cron) or manually when MTA updates schedules.

**Milestones:**
- Backend serves arrival data for all stations via REST endpoint.
- Frontend displays arrivals with search, favorites, and auto-refresh.
- PWA installable on iOS and Android.

### Phase 2: Smart Commute -- Transfer Analysis, Trip Planning, Commute Presets

**Goal:** Help commuters answer "should I transfer?" and "what is the fastest way to get to my destination right now?"

**Features:**

1. **Commute configuration** -- Define named commutes (origin station + destination station). Select preferred lines. Save up to 10 commutes.

2. **Transfer analysis engine** -- For a given origin/destination pair:
   - Identify all direct routes (single line, no transfer).
   - Identify transfer routes using `transfers.txt` data.
   - For each route option, compute estimated total time using current real-time arrivals + scheduled inter-station travel times.
   - Rank by total estimated arrival time at destination.
   - Highlight when a transfer route is faster than waiting for the next direct train.

3. **Commute dashboard card** -- On the home screen, each saved commute shows: best direct route arrival, best transfer route arrival (if faster), time difference, and a clear "Transfer saves X min" badge when applicable.

4. **Transfer detail view** -- Expanding a transfer recommendation shows: which line to board, where to transfer, expected wait at transfer station, which line to board after transfer, estimated arrival at destination. Updates in real-time as train positions change.

5. **Express/local awareness** -- Detect express vs local service by analyzing stop patterns in the GTFS-RT feed. Factor into transfer recommendations (e.g., "take the local one stop, transfer to the express").

6. **Confidence display for B Division** -- Since B Division (lettered lines) uses Bluetooth tracking with 80-95% accuracy, display a visual confidence indicator. Arrivals from A Division lines (numbered, ATS-tracked) get a solid indicator. B Division arrivals get a softer/dashed indicator. Tooltip explains the difference.

**Milestones:**
- Transfer engine computes multi-leg routes from real-time data.
- Commute cards on home screen show direct vs transfer comparison.
- Express/local detection works for Manhattan trunk lines.

### Phase 3: Alerts and Notifications -- Service Alerts, Push Notifications, Disruption Routing

**Goal:** Proactively inform commuters about disruptions to their specific stations and lines, and help them respond.

**Features:**

1. **Alert ingestion and simplification** -- Parse the MTA subway alerts GTFS-RT feed. Simplify the notoriously confusing MTA alert language into plain English (e.g., "Northbound F trains are skipping Bergen St due to signal problems" instead of "Due to signal problems, northbound [F] trains are running express from Jay St-MetroTech to 7 Av"). Tag each alert with severity (info/warning/severe), affected lines, affected stations, and affected directions.

2. **Filtered alert feed** -- Show only alerts relevant to the user's favorites and commutes. Badge count on the alerts tab. Alerts sorted by severity then recency. Full text expandable.

3. **Alert banners on station and commute views** -- When an alert affects a station or commute the user is viewing, show an inline banner with the simplified text. Color-coded by severity (yellow for delays, red for suspended service).

4. **Web Push notifications** -- Opt-in push notifications for:
   - New severe alerts affecting favorites (service suspended, major delays).
   - Status changes for existing alerts (delay resolved, service restored).
   - Configurable quiet hours (no notifications between midnight and 5 AM by default).

5. **Push subscription management** -- Frontend registers a PushSubscription via the Push API and sends it to the backend along with the user's favorite station/line/direction tuples. Backend stores subscriptions in a lightweight SQLite database. When a new alert matches, the backend sends a Web Push message.

6. **Trip replacement period awareness** -- Use the NYCT `trip_replacement_period` extension to detect cancelled trips. If a scheduled trip is absent from the feed within the replacement window, show it as "Cancelled" rather than silently omitting it.

**Milestones:**
- Alerts feed parsed and simplified into plain language.
- Filtered alerts displayed in app, scoped to user's favorites.
- Web Push notifications delivered for severe alerts.

### Phase 4: Polish -- Offline, Accessibility, Performance

**Goal:** Production-quality app that is fast, accessible, and reliable even underground with no signal.

**Features:**

1. **Offline mode** -- Cache the last successful arrival data per station. When offline, show cached data with a clear "Last updated X minutes ago -- you are offline" banner. Station search and favorites work fully offline (static data cached in Service Worker). Stale data fades visually after 2 minutes, grays out after 5 minutes.

2. **Accessibility audit and fixes** -- WCAG 2.1 AA compliance. Semantic HTML (proper heading hierarchy, landmark regions, ARIA labels). Screen reader announcements for arrival updates (aria-live regions). Keyboard navigation for all interactive elements. Focus management on screen transitions. Minimum 4.5:1 contrast ratios. Touch targets minimum 44x44px. Reduced motion support (prefers-reduced-motion).

3. **Performance optimization** -- Target: Lighthouse performance score 95+. First Contentful Paint under 1.5 seconds on 3G. Bundle splitting: route-based code splitting so the initial load is only the home dashboard. Image optimization: SVG line bullets, no raster images. API response compression (gzip/brotli).

4. **Background refresh** -- Use the Background Sync API to queue data refreshes when the device regains connectivity. Use the Periodic Background Sync API (where supported) to refresh favorite arrivals every few minutes even when the app is not open.

5. **Stale data detection** -- Monitor `VehiclePosition.timestamp` to detect frozen predictions (train not moving). Display a visual indicator when arrival predictions may be stale. Per the API research: predictions are not updated when a train is not moving.

6. **Error handling and resilience** -- Graceful degradation when individual MTA feeds are down (other feeds still work). Retry logic with exponential backoff for failed fetches. Circuit breaker pattern: after 3 consecutive failures on a feed, back off for 60 seconds before retrying. User-visible feed health indicator.

**Milestones:**
- Lighthouse scores: Performance 95+, Accessibility 100, Best Practices 100, PWA 100.
- Full offline functionality with cached data.
- Screen reader tested (VoiceOver on iOS, TalkBack on Android).

### Phase 5: Intelligence -- Predictive Detection, Trip Tracking, Commute Learning

**Goal:** Transform the app from a data display into a predictive, context-aware commute companion that learns and anticipates.

**Features:**

1. **Predictive delay detection** -- Detect delays before the MTA announces them by analyzing `VehiclePosition` data across successive 30-second polls. When a train is stopped between stations for longer than its historical inter-station time, or when multiple trains on a line are moving significantly slower than normal, trigger a synthetic early-warning alert: "Trains on the 2/3 are moving 40% slower than normal south of 14th St." This gives users a 5-10 minute early-warning advantage over official MTA alerts.

   Backend implementation:
   - Track each `tripId`'s position across consecutive polls.
   - Compute actual inter-station traversal times and compare against baselines from GTFS static `stop_times.txt`.
   - When a train's actual traversal time exceeds 1.5x the scheduled time, flag the segment.
   - When 2+ trains on the same line show slowdowns, escalate to a line-level early warning.
   - Expose synthetic alerts via the same `/api/alerts` endpoint with a `source: "predicted"` tag so the frontend can display them distinctly (e.g., amber dotted border vs solid for official MTA alerts).

2. **Live trip tracker with ETA sharing** -- Tap "I'm on this train" from a station detail or arrival row. The app locks onto that specific `tripId` in the GTFS-RT feed and enters trip tracking mode:
   - Shows a stop-by-stop progress view with the current position highlighted.
   - Counts down stops and minutes to the user's destination.
   - Updates in real-time as the backend polls new feed data.
   - Generates a shareable URL (e.g., `mtamyway.com/trip/abc123`) that anyone can open to see the user's live position and ETA on a simple read-only page.

   Implementation:
   - Frontend sends `tripId` + destination `stopId` to `GET /api/trip/:tripId`.
   - Backend returns the trip's current `stop_time_update` entries, filtered from destination onward.
   - The share page is a lightweight static page that polls the same endpoint.
   - Trip data is ephemeral (in-memory, no persistence needed) -- it only exists while the trip is in the GTFS-RT feed.

3. **Time-aware context switching** -- The app learns which favorites the user taps at which times and auto-surfaces the most relevant ones. Entirely client-side using localStorage.

   Implementation:
   - On each favorite tap, append `{favoriteId, dayOfWeek, hour}` to a localStorage array (capped at 500 entries, FIFO).
   - On app open, compute a frequency score for each favorite at the current `dayOfWeek + hour` (±1 hour window).
   - Re-sort the favorites list by score, with manual sort order as tiebreaker.
   - After 2 weeks of usage data, the sorting becomes meaningful.
   - A "pinned" flag on favorites overrides the auto-sort for stations the user always wants first.

   Data model addition (in `UserPreferences`):
   ```typescript
   interface FavoriteTapEvent {
     favoriteId: string;
     dayOfWeek: number;   // 0-6
     hour: number;        // 0-23
   }

   // Added to UserPreferences
   tapHistory: FavoriteTapEvent[];  // Max 500, FIFO
   ```

   Paired with a morning briefing push notification (Phase 3 push infrastructure):
   - At a configurable time (default 7:00 AM weekdays), send a push summarizing the status of the user's most-used morning favorites: "Your usual F train is running normally" or "Heads up: delays on the F this morning, consider the G to the A."

4. **Smart underground pre-fetch** -- When the app detects the user is approaching a station (via `navigator.geolocation.watchPosition`), it aggressively pre-fetches and caches arrival data for every station along the user's configured commute routes.

   Implementation:
   - Build a geofence of ~200m radius around each station using coordinates from GTFS static data.
   - When the user's position enters a geofence, trigger a batch fetch of arrivals for all stations on their commute routes and cache via the Service Worker Cache API.
   - While offline underground, the app serves cached data with a "Last updated X min ago" indicator.
   - Timer-based countdown: using cached arrival times + scheduled inter-station travel times from `stop_times.txt`, compute estimated countdowns that update locally without network access. These are labeled "estimated" and refresh to live data when connectivity returns.
   - Geolocation is only active when the app is in the foreground (standard browser behavior for PWAs). This aligns with the natural usage pattern: the user opens the app as they approach the station.
   - Battery-conscious: use `watchPosition` with `{ enableHighAccuracy: false }` and stop watching once underground (no GPS signal = API returns error, stop polling).

5. **Commute journal with anomaly detection** -- Automatically log every commute and build a personal travel history. Does not require the app to be always on.

   Trip detection strategy (no background process needed):
   - **Primary:** When the user uses "I'm on this train" (feature #2), the trip is explicitly tracked. Log `{origin, destination, departureTime, arrivalTime, line, actualDuration}` when the trip ends.
   - **Inferred:** When the app is opened at station A at time T1 and later opened at station B at time T2 (where B is a downstream station on the same line), infer a trip occurred. Log it with `source: "inferred"`.
   - **Manual:** "Start commute" / "Arrived" buttons in the commute view for explicit logging without full trip tracking.

   Data model (localStorage):
   ```typescript
   interface TripRecord {
     id: string;
     date: string;               // ISO date
     origin: StationRef;
     destination: StationRef;
     line: string;
     departureTime: number;      // POSIX
     arrivalTime: number;        // POSIX
     actualDurationMinutes: number;
     source: "tracked" | "inferred" | "manual";
   }

   interface CommuteStats {
     commuteId: string;
     averageDurationMinutes: number;
     medianDurationMinutes: number;
     stdDevMinutes: number;
     totalTrips: number;
     tripsThisWeek: number;
     trend: number;              // % change vs prior 4-week average
     records: TripRecord[];      // Last 90 days, capped at 500
   }
   ```

   Anomaly detection:
   - Compare current trip duration against the rolling average for that commute + day-of-week + time window.
   - If current duration exceeds `mean + 1.5 * stdDev`, show an inline banner: "This trip is running 6 minutes longer than usual."
   - Weekly digest (push notification): "Your average commute this week was 36 min (up 8% from last week). Tuesday was the slowest day."
   - Monthly trend graph in a "My Commute" screen showing duration over time, with delay events overlaid.

**Milestones:**
- Predictive delay warnings firing 5-10 minutes before official MTA alerts for detectable slowdowns.
- Live trip tracking with shareable ETA link.
- Context-aware favorite sorting active after 2 weeks of usage.
- Offline countdown working underground with cached data.
- Commute journal logging trips and surfacing anomalies after 2 weeks of data.

### Phase 6: Awareness -- Accessibility, Walking Intelligence, Live Visualization

**Goal:** Make the app aware of the physical world — elevator outages, weather, walking alternatives, and train positions — so it gives smarter, more humane recommendations.

**Features:**

1. **Elevator and escalator status with accessible rerouting** -- Integrate the MTA Equipment API to show real-time elevator and escalator outages on station detail views. A red badge on stations with broken elevators: "Elevator out of service since 6:14 AM." In an "Accessible mode" toggle (persisted in settings), the transfer engine excludes stations where elevators are currently broken and reroutes through accessible alternatives. The station search also shows an ADA badge and flags stations with current equipment outages.

   Implementation:
   - Poll the MTA Equipment API every 5 minutes (equipment status changes slowly).
   - Parse outage data and index by station.
   - New backend route: `GET /api/equipment/:stationId` and bulk `GET /api/equipment`.
   - Inject equipment status into the `StationArrivals` response as a new `equipment` field.
   - In the transfer engine, when accessible mode is on, set the weight of stations with broken elevators to `Infinity` (effectively removing them from the graph).
   - Frontend: ADA badge on station cards, equipment outage banner on station detail, accessible mode toggle in settings.

   Data model addition:
   ```typescript
   interface EquipmentStatus {
     stationId: string;
     type: "elevator" | "escalator";
     description: string;         // "Elevator to mezzanine"
     isActive: boolean;           // true = working, false = out of service
     outOfServiceSince?: number;  // POSIX timestamp
     estimatedReturn?: string;    // MTA's estimate, often vague
     ada: boolean;                // Is this the station's only ADA-accessible path?
   }

   // Added to Settings
   accessibleMode: boolean;       // Default: false
   ```

2. **"Should I just walk?" -- walking vs transit for short trips** -- For commutes of 1-3 stops, show a persistent walking comparison alongside transit options. Compute walking time from station coordinates using Haversine distance at 4.5 km/h walking speed. Display as a card on the commute view: "Walk 11 min vs wait 6 min + ride 2 min (arrive same time)."

   During delays, this comparison becomes decisive. When the wait time at the origin exceeds the walking time to the destination, automatically promote the walking option: "F running 10 min late. Walk to Church Av in 12 min instead of waiting 14 min."

   Implementation:
   - Compute walking distance between origin and destination station coordinates (already in GTFS static data).
   - Walking time = distance / 4.5 km/h, rounded up.
   - Show comparison when walking time < 20 minutes AND the transit trip is 3 or fewer stops.
   - During delays (wait time > walking time), surface prominently with a walking icon.
   - No new API calls — purely derived from existing station coordinates and real-time arrival data.

3. **OMNY fare cap tracker** -- Track rides toward OMNY's 12-ride weekly free cap (Monday to Sunday). Auto-logged from trip tracking: each time the commute journal records a trip departure (from trip tracker or inferred trip detection), increment the weekly tap count. No manual button needed.

   Display: a persistent subtle indicator in the header or settings: "9/12 rides this week — 3 more until free rides." When close to the cap (10+ rides), nudge: "Take one more round trip and tomorrow's commute is free." Weekly reset every Monday at midnight.

   Track monthly spend: rides × $2.90 (or current fare), compared against the old 30-day unlimited pass ($132) to show whether OMNY or a pass would have been cheaper for the user's actual usage pattern.

   Implementation — entirely client-side:
   ```typescript
   interface FareTracking {
     weeklyRides: number;
     weekStartDate: string;        // ISO date of Monday
     monthlyRides: number;
     monthStartDate: string;       // ISO date of 1st
     rideLog: RideLogEntry[];      // Last 90 days
     currentFare: number;          // Default $2.90, user-configurable
   }

   interface RideLogEntry {
     date: string;                 // ISO date
     time: number;                 // POSIX timestamp
     stationId: string;
     source: "tracked" | "inferred";
   }
   ```
   - Auto-log: when the commute journal records a trip with `source: "tracked"` or `source: "inferred"`, also append a `RideLogEntry`.
   - Weekly count resets when current date's Monday differs from `weekStartDate`.
   - No backend, no OMNY API integration — just counting from trip data already being collected.

4. **Live train position diagram** -- A schematic line diagram (not a geographic map) showing actual train positions as dots on a linear station-to-station representation. Derived from `VehiclePosition` data already being polled by the backend.

   The diagram shows:
   - All trains on a selected line as colored dots on a horizontal/vertical line of station nodes.
   - Dot position interpolated between stations using `current_stop_sequence` and `current_status` (INCOMING_AT, STOPPED_AT, IN_TRANSIT_TO).
   - Train spacing at a glance: evenly spaced = healthy, clustered = bunching, gap = missing train.
   - The user's next train highlighted (pulsing dot).
   - Tap a dot to see its trip details (destination, assigned status, delay).

   Implementation:
   - New backend route: `GET /api/positions/:lineId` returning all `VehiclePosition` entries for a given route.
   - Frontend: SVG rendering of a line diagram. Station nodes as circles, train positions as colored dots interpolated along the path segments between stations.
   - Station ordering from GTFS static `stop_times.txt` (stop sequence per route).
   - Update every 30 seconds (matching feed poll cycle).
   - Accessible: screen reader announces train count and spacing summary ("8 trains on the F line, evenly spaced, next train 2 stops away").

5. **System-wide health dashboard** -- A single screen showing all subway lines with a status indicator, derived from existing alert data and the Phase 5 predictive delay detector.

   ```
   +------------------------------------------+
   |  System Health          NYC Subway: 88%   |
   |------------------------------------------|
   |                                           |
   |  NORMAL                                   |
   |  (1) (4) (5) (6) (7) (A) (C) (E)        |
   |  (G) (J) (L) (N) (Q) (R) (W) (Z)        |
   |                                           |
   |  MINOR DELAYS                             |
   |  (2)  Slow north of 14th St               |
   |  (B)  Running local in Manhattan           |
   |                                           |
   |  SIGNIFICANT DELAYS                       |
   |  (F)  8-12 min delays, signal problems    |
   |                                           |
   |  SUSPENDED                                |
   |  (D)  No svc btwn 36 St and Stillwell Av  |
   |                                           |
   |  Updated 8s ago                           |
   |                                           |
   |  [Home]  [Search]  [Commute]  [Alerts]   |
   +------------------------------------------+
   ```

   Implementation:
   - Aggregate per-line status from: official MTA alerts (severity mapping), Phase 5 predictive delay alerts, and the absence of alerts (= normal).
   - Status tiers: Normal (green), Minor Delays (yellow), Significant Delays (orange), Suspended (red).
   - Overall health percentage: `(lines at normal / total lines) * 100`.
   - One-line summary per affected line, derived from the simplified alert text (Phase 3).
   - Tap any line bullet to jump to that line's detail view (arrivals + position diagram).
   - No new API calls or backend changes — purely an aggregation view of existing alert data served by `GET /api/alerts`.

6. **"Your Subway Year" annual summary** -- A personalized year-in-review generated from the commute journal (Phase 5) and fare tracker data. Renders as a shareable card.

   Statistics computed:
   - Total trips taken
   - Total hours underground
   - Total distance traveled (sum of inter-station distances from GTFS static data)
   - Most-used station, most-used line
   - Most-delayed line (from anomaly data)
   - Longest single commute, shortest single commute
   - Best day of the week (fastest average), worst day
   - Longest on-time streak
   - OMNY spend (from fare tracker)
   - Carbon saved vs driving: `(total_miles × 374g CO2 saved per passenger-mile) / 1000 = kg CO2 saved` (EPA: avg car emits 404g/mi, subway emits ~30g/passenger-mi, delta = 374g/mi)
   - Rides after fare cap (free rides taken)

   Implementation:
   - Entirely client-side — computed from `journalStore` (TripRecord[]) and `fareTracking` (RideLogEntry[]) in localStorage.
   - Render as a styled HTML component, export to PNG via `html2canvas` or canvas API for sharing.
   - Available year-round via a "My Stats" screen (not just at year-end), with configurable time window (this month, this quarter, this year, all time).
   - Share button uses the Web Share API (`navigator.share()`) to post the image natively on mobile.
   - No backend involvement.

**Milestones:**
- Elevator/escalator outages displayed on station views; accessible rerouting avoids broken stations.
- Walking comparison surfaces automatically for short trips and during delays.
- OMNY fare cap tracker counting rides from auto-logged trip data.
- Live train position diagram rendering for all lines from VehiclePosition data.
- System health dashboard showing all-line status at a glance.
- Annual summary generating shareable cards from journal data.

---

## 5. UI/UX Design

### 5.1 Key Screens

**Screen 1: Home Dashboard (Favorites)**

The default screen. No splash, no map, no tutorial. Just data.

```
+------------------------------------------+
|  MTA My Way                    [alerts 2] |
|------------------------------------------|
|                                           |
|  YOUR STATIONS                            |
|                                           |
|  +--------------------------------------+ |
|  | Times Sq-42 St          Uptown  (1)  | |
|  |   1  Van Cortlandt Pk    2 min  ---- | |
|  |   2  Wakefield-241 St    5 min  ==== | |
|  |   3  Harlem-148 St       8 min  ==== | |
|  +--------------------------------------+ |
|                                           |
|  +--------------------------------------+ |
|  | Bergen St                Dwntn  (F)  | |
|  |   F  Coney Island        4 min  ---- | |
|  |   G  Church Av            7 min  ---- | |
|  +--------------------------------------+ |
|                                           |
|  YOUR COMMUTES                            |
|                                           |
|  +--------------------------------------+ |
|  | Work: Bergen St -> Rockefeller Ctr   | |
|  |   Best: F express     22 min         | |
|  |   Transfer via Jay St  19 min  -3!   | |
|  +--------------------------------------+ |
|                                           |
|  Updated 12s ago                          |
|                                           |
|  [Home]  [Search]  [Commute]  [Alerts]   |
+------------------------------------------+
```

Design notes:
- Arrival times show minutes-away as the primary number, large and bold.
- Confidence shown via line style: solid line = high confidence, dashed = medium, dotted = low.
- Line bullets use official MTA colors and are large enough to tap (44px diameter).
- The "-3!" badge on transfer routes instantly communicates "transfer saves 3 minutes."
- Pull-to-refresh to force update.

**Screen 2: Station Detail**

Reached by tapping a favorite or from search.

```
+------------------------------------------+
|  < Back       Times Sq-42 St    [+fav]   |
|------------------------------------------|
|                                           |
|  !! Delays on (1)(2)(3) -- signal issue  |
|                                           |
|  UPTOWN / BRONX-BOUND                    |
|  ----------------------------------------|
|  (1)  Van Cortlandt Pk      2 min   ==== |
|  (2)  Wakefield-241 St      5 min   ==== |
|  (3)  Harlem-148 St         8 min   ==== |
|  (1)  Van Cortlandt Pk     14 min   ---- |
|  (7)  Flushing-Main St      3 min   ==== |
|                                           |
|  DOWNTOWN / BROOKLYN-BOUND                |
|  ----------------------------------------|
|  (1)  South Ferry            1 min   ==== |
|  (2)  Flatbush Av            4 min   ==== |
|  (3)  New Lots Av            6 min   ---- |
|  (7)  34 St-Hudson Yards     2 min   ==== |
|                                           |
|  N Q R W  at this complex                 |
|  Tap to view >>                           |
|                                           |
|  [Home]  [Search]  [Commute]  [Alerts]   |
+------------------------------------------+
```

Design notes:
- Alert banner at top when relevant, color-coded (yellow for delays, red for suspensions).
- Direction labels use compass-aware naming: "Uptown / Bronx-bound" not just "Northbound."
- Multi-complex stations (like Times Square serving 1/2/3/7 and N/Q/R/W) show a link to the other platform group.
- Assigned trips (solid bar) vs unassigned (dashed bar) for at-a-glance confidence.

**Screen 3: Commute Planner**

For configuring and viewing commute analysis.

```
+------------------------------------------+
|  Commute Planner                          |
|------------------------------------------|
|                                           |
|  FROM: Bergen St (F)(G)                   |
|  TO:   Rockefeller Center (B)(D)(F)(M)   |
|                                           |
|  ROUTES RIGHT NOW                         |
|  ----------------------------------------|
|                                           |
|  RECOMMENDED                              |
|  +--------------------------------------+ |
|  | Transfer at Jay St-MetroTech         | |
|  | F(2 min) -> Jay St -> A(4 min wait)  | |
|  | Total: ~19 min | Arrive: 8:21 AM     | |
|  | 3 min faster than direct              | |
|  +--------------------------------------+ |
|                                           |
|  DIRECT                                   |
|  +--------------------------------------+ |
|  | F to Rockefeller Center              | |
|  | Next F: 4 min | Total: ~22 min       | |
|  | Arrive: 8:24 AM                       | |
|  +--------------------------------------+ |
|                                           |
|  ALSO POSSIBLE                            |
|  +--------------------------------------+ |
|  | G to Atlantic Av -> D to Rock Ctr    | |
|  | Next G: 7 min | Total: ~28 min       | |
|  +--------------------------------------+ |
|                                           |
|  [Home]  [Search]  [Commute]  [Alerts]   |
+------------------------------------------+
```

**Screen 4: Alerts**

```
+------------------------------------------+
|  Alerts                   [filter: mine] |
|------------------------------------------|
|                                           |
|  ACTIVE - YOUR LINES                      |
|                                           |
|  [RED] Service Suspended                  |
|  A trains suspended Inwood-207 St to      |
|  Dyckman St due to FDNY activity.         |
|  Use (1) as alternative.                  |
|  Since 7:42 AM                            |
|                                           |
|  [YLW] Delays                             |
|  Southbound (F) trains running 8-12       |
|  minutes late due to signal problems      |
|  near Jay St-MetroTech.                   |
|  Since 7:55 AM                            |
|                                           |
|  PLANNED WORK (upcoming)                  |
|                                           |
|  [GRY] Weekend - Mar 22-23                |
|  No (G) service Church Av to              |
|  Hoyt-Schermerhorn. Free shuttle bus.     |
|                                           |
|  [filter: all lines]                      |
|                                           |
|  [Home]  [Search]  [Commute]  [Alerts]   |
+------------------------------------------+
```

**Screen 5: Live Trip Tracker** (Phase 5)

Entered by tapping "I'm on this train" from a station detail arrival row.

```
+------------------------------------------+
|  Live Trip            [Share ETA]        |
|------------------------------------------|
|                                           |
|  ON THE (F) TO Coney Island              |
|                                           |
|  * Bergen St            BOARDED  8:02    |
|  |                                       |
|  * Carroll St           PASSED   8:04    |
|  |                                       |
|  O Smith-9 Sts          NEXT     ~1 min  |
|  |                                       |
|  o 4 Av-9 St                     ~3 min  |
|  o 7 Av                          ~5 min  |
|  o 15 St-Prospect Park           ~7 min  |
|  o Fort Hamilton Pkwy            ~9 min  |
|  > Church Av            DEST    ~11 min  |
|                                           |
|  ETA: 8:13 AM                            |
|  Avg for this commute: 11 min            |
|                                           |
|  [Stop tracking]                          |
|                                           |
|  [Home]  [Search]  [Commute]  [Alerts]   |
+------------------------------------------+
```

Design notes:
- Stop-by-stop vertical timeline with clear status markers (* = passed, O = next, o = upcoming, > = destination).
- "Share ETA" generates a URL for a lightweight read-only page.
- Destination ETA is the hero number, large and bold.
- If underground with cached data, show "Estimated" label on times.

**Screen 6: My Commute Journal** (Phase 5)

Accessible from the Commute tab.

```
+------------------------------------------+
|  My Commute                               |
|------------------------------------------|
|                                           |
|  THIS WEEK                                |
|  Avg: 34 min | Trips: 8 | Trend: -3%    |
|                                           |
|  +---------+---------+---------+          |
|  |         .  *      |         |          |
|  |    *  .      *    |  Duration (min)    |
|  |  .              * |         |          |
|  +---------+---------+---------+          |
|  Mon  Tue  Wed  Thu  Fri                  |
|                                           |
|  RECENT TRIPS                             |
|                                           |
|  Today 8:02 AM  Bergen -> Church Av       |
|    F  |  11 min  |  normal                |
|                                           |
|  Today 6:14 PM  Church Av -> Bergen       |
|    F  |  12 min  |  +1 min vs avg         |
|                                           |
|  Yesterday 8:11 AM  Bergen -> Church Av   |
|    F  |  18 min  |  +7 min !! delay       |
|                                           |
|  [Home]  [Search]  [Commute]  [Alerts]   |
+------------------------------------------+
```

### 5.2 Mobile Interaction Patterns

- **Pull-to-refresh**: On home dashboard and station detail. Triggers immediate API fetch. Optional haptic feedback on iOS.
- **Bottom navigation bar**: 4 tabs (Home, Search, Commute, Alerts). Bottom placement is critical -- thumbs reach the bottom of a phone, not the top. Fixed position, does not scroll away.
- **Swipe on favorites**: Swipe left to delete, swipe right to edit (lines/direction). Follows iOS/Android conventions.
- **Tap-to-expand**: Favorites on the home screen show condensed (2-3 arrivals). Tap to expand to full station detail.
- **Long-press on line bullet**: Shows line info tooltip (line name, division, express/local).
- **"I'm on this train" tap**: On any arrival row, tap to enter live trip tracking mode (Phase 5).
- **Shake to refresh** (optional, Phase 4): For the true power user.

### 5.3 Accessibility

- **WCAG 2.1 AA** minimum compliance target.
- **Color is never the only indicator**: Line colors are supplemented with the line letter/number in all contexts. Alert severity uses icons (triangle for warning, octagon for severe) in addition to color.
- **aria-live regions**: Arrival time updates are announced to screen readers via `aria-live="polite"` regions. New alerts use `aria-live="assertive"`.
- **Focus management**: When navigating between screens, focus moves to the screen heading. Modals trap focus. Closing a modal returns focus to the trigger element.
- **Touch targets**: Minimum 44x44px for all interactive elements. Line bullets, favorite cards, navigation tabs, and buttons all meet this minimum.
- **Text sizing**: Respects the user's system font size preference. All text uses `rem` units. Tested at 200% zoom.
- **Contrast**: All text meets 4.5:1 contrast ratio against its background. Large text (18px+) meets 3:1. Tested in both light and dark themes.
- **Reduced motion**: Respects `prefers-reduced-motion`. Pull-to-refresh uses a simple indicator instead of animation. Screen transitions are instant instead of animated.

### 5.4 Design System

**Colors:**

```
Primary Background:    #FFFFFF (light) / #121212 (dark)
Surface:               #F5F5F5 (light) / #1E1E1E (dark)
Primary Text:          #1A1A1A (light) / #E8E8E8 (dark)
Secondary Text:        #666666 (light) / #999999 (dark)
Accent:                #0039A6 (MTA Blue -- used sparingly for interactive elements)

Alert Colors:
  Severe (suspended):  #EE352E (MTA Red)
  Warning (delays):    #FCCC0A (MTA Yellow, with dark text)
  Info (planned work): #808183 (MTA Gray)

Line Colors:           Official MTA palette from routes.txt (route_color field)
  1/2/3:  #EE352E     A/C/E:  #0039A6     N/Q/R/W: #FCCC0A
  4/5/6:  #00933C     B/D/F/M: #FF6319    J/Z:     #996633
  7:      #B933AD     G:      #6CBE45     L:       #A7A9AC
  S:      #808183     SIR:    #1D2F6F
```

**Typography:**

```
Font Family:           system-ui, -apple-system, sans-serif (native system font)
  Rationale: Zero loading cost, familiar to users, excellent legibility on mobile.

Heading (station name): 20px / 1.2 line-height / 700 weight
Arrival time (minutes): 24px / 1.0 line-height / 800 weight (the most important number)
Body text:              16px / 1.4 line-height / 400 weight
Caption (updated ago):  14px / 1.3 line-height / 400 weight
Alert headline:         16px / 1.3 line-height / 600 weight
```

**Spacing:**

```
Base unit:    4px
Card padding: 16px (4 units)
Card gap:     12px (3 units)
Section gap:  24px (6 units)
Screen margin: 16px horizontal
Bottom nav:   56px tall (includes safe area inset)
```

**Line bullets:**

- Circular, 32px diameter (44px tap target via padding).
- Official MTA background color, white text (or dark text for yellow lines).
- Font: bold, 16px, centered.

---

## 6. API Integration Details

### 6.1 Endpoints to Use

**Real-time arrivals (poll all 8 in parallel every 30 seconds):**

| Feed | URL | Lines |
|------|-----|-------|
| A Division | `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct/gtfs` | 1,2,3,4,5,6,7,S |
| ACE | `.../nyct/gtfs-ace` | A,C,E,H,FS |
| BDFM | `.../nyct/gtfs-bdfm` | B,D,F,M |
| G | `.../nyct/gtfs-g` | G |
| JZ | `.../nyct/gtfs-jz` | J,Z |
| L | `.../nyct/gtfs-l` | L |
| NQRW | `.../nyct/gtfs-nqrw` | N,Q,R,W |
| SIR | `.../nyct/gtfs-si` | SIR |

**Service alerts:**
- `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys/subway-alerts`
- Poll every 60 seconds (alerts have a 10-minute freshness window per MTA docs).

**Static data (downloaded periodically, not polled):**
- `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip` -- base schedule
- `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_supplemented.zip` -- with 7-day service changes

### 6.2 Protobuf Parsing Strategy

Use `gtfs-realtime-bindings` npm package for base GTFS-RT parsing plus a custom-compiled NYCT extension for the subway-specific fields.

**Steps:**
1. Obtain `nyct-subway.proto` from MTA developer resources.
2. Use `protobufjs` to compile both `gtfs-realtime.proto` and `nyct-subway.proto` into a single JavaScript module at build time.
3. Parse the binary response using the compiled module.
4. Extract NYCT extensions from the decoded message:
   - `NyctTripDescriptor.direction` -- NORTH or SOUTH enum
   - `NyctTripDescriptor.is_assigned` -- boolean
   - `NyctTripDescriptor.train_id` -- internal MTA identifier
   - `NyctStopTimeUpdate.scheduled_track` / `actual_track` -- for reroute detection
   - `NyctFeedHeader.trip_replacement_period` -- for cancelled trip detection

**Parsing code structure:**
```
src/server/feeds/
  parser.ts         -- Generic GTFS-RT + NYCT extension parser
  poller.ts         -- Timed fetch of all feeds in parallel
  transformer.ts    -- Converts parsed protobuf to our StationArrivals model
  alerts-parser.ts  -- Alert-specific parsing and simplification
```

### 6.3 Caching and Polling Strategy

**Backend polling:**
- All 8 subway feeds fetched in parallel every 30 seconds (matching MTA update frequency).
- Alerts feed fetched every 60 seconds.
- Each feed response cached in memory with a 30-second TTL.
- If a fetch fails, the previous successful response is served until it is 5 minutes old, after which it is marked stale.
- Circuit breaker: after 3 consecutive failures on a single feed, pause that feed's polling for 60 seconds.

**Frontend caching:**
- The frontend polls the backend API every 30 seconds (configurable in settings, minimum 15 seconds).
- Last successful response per station is cached in memory and in localStorage.
- When offline, localStorage cache is served with a visual staleness indicator.

**HTTP caching headers from backend:**
- `Cache-Control: public, max-age=15` -- Allow CDN/browser to serve slightly stale data.
- `ETag` based on the MTA feed timestamp -- enables conditional requests (304 Not Modified).

### 6.4 Handling A Division vs B Division Accuracy

The API research documents a critical accuracy difference:
- **A Division** (numbered lines): ATS tracking, continuous position updates, reliable predictions.
- **B Division** (lettered lines): Bluetooth beacons, station-entry/exit only, estimated inter-station times, 80-95% accuracy.
- **L line**: CBTC tracking, best accuracy of all.

**Strategy:**
1. Tag every arrival with its division in the backend (route metadata maps route_id to division).
2. Assign a confidence level: A Division + assigned = "high", B Division + assigned = "medium", any + unassigned = "low".
3. Display confidence visually (solid/dashed/dotted indicators).
4. For transfer calculations involving B Division lines, add a configurable buffer (default: +2 minutes) to estimated arrival times to account for prediction uncertainty.
5. When `is_assigned` is false, show the arrival with reduced visual emphasis and optionally hide it (user setting: "Show unassigned trips").
6. When `actual_track` differs from `scheduled_track`, mark that arrival as "rerouted" and reduce its confidence to "low" regardless of division.

---

## 7. Technology Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| **Frontend framework** | React | 19.x | Component model fits the UI, massive ecosystem, team familiarity |
| **Build tool** | Vite | 6.x | Fast HMR, optimized production builds, PWA plugin support |
| **PWA** | vite-plugin-pwa | 1.x | Workbox-based Service Worker generation, manifest management |
| **State management** | Zustand | 5.x | Minimal boilerplate, localStorage persistence middleware, 1.1kB |
| **Styling** | Tailwind CSS | 4.x | Utility-first, small bundle, design token enforcement |
| **Routing** | React Router | 7.x | Standard, supports lazy loading for code splitting |
| **Backend framework** | Hono | 4.x | Lightweight (14kB), TypeScript-native, serves both API and static assets |
| **Backend runtime** | Node.js | 22 LTS | Long-term support, best protobuf ecosystem |
| **Protobuf parsing** | protobufjs | 7.x | Compiles .proto files to JS, handles extensions |
| **GTFS-RT bindings** | gtfs-realtime-bindings | latest | Official MobilityData protobuf definitions |
| **Push notifications** | web-push (npm) | 3.x | VAPID-based Web Push for Node.js |
| **Database (push subs)** | SQLite via better-sqlite3 | latest | Lightweight, no external service, sufficient for subscription storage |
| **Testing** | Vitest | 2.x | Vite-native, fast, compatible with React Testing Library |
| **E2E testing** | Playwright | latest | Cross-browser, mobile viewport testing |
| **Linting** | ESLint + Biome | latest | Fast formatting (Biome), thorough linting (ESLint) |
| **Type checking** | TypeScript | 5.x | End-to-end type safety, shared types between frontend/backend |
| **Share card rendering** | html2canvas | 1.x | Render annual summary as shareable PNG image |
| **Containerization** | Docker | latest | Consistent builds, deployment portability |

---

## 8. Project Structure

Follows the established pattern for apexalgo-iad services: application source in the repo root, container build in `containers/`, Kubernetes manifests in `cluster-configuration/`.

```
mta-my-way/                              # Application source (this repo)
|-- docs/
|   |-- plan/
|   |   |-- plan.md                     # This document
|   |-- research/
|   |   |-- mta-api-research.md
|   |   |-- mta-app-competitive-analysis.md
|   |-- notes/
|
|-- packages/
|   |-- shared/                         # Shared TypeScript types and utilities
|   |   |-- src/
|   |   |   |-- types/
|   |   |   |   |-- arrivals.ts         # StationArrivals, ArrivalTime, etc.
|   |   |   |   |-- favorites.ts        # Favorite, Commute, Settings, FavoriteTapEvent
|   |   |   |   |-- stations.ts         # Station, Route, TransferConnection
|   |   |   |   |-- alerts.ts           # StationAlert (including synthetic predicted alerts)
|   |   |   |   |-- trips.ts            # TripRecord, CommuteStats (Phase 5)
|   |   |   |   |-- equipment.ts       # Phase 6: EquipmentStatus
|   |   |   |   |-- fare.ts            # Phase 6: FareTracking, RideLogEntry
|   |   |   |   |-- positions.ts       # Phase 6: TrainPosition for live diagram
|   |   |   |   |-- index.ts
|   |   |   |-- constants/
|   |   |   |   |-- feeds.ts            # Feed URLs, polling intervals
|   |   |   |   |-- lines.ts            # Line metadata (color, division, etc.)
|   |   |   |-- utils/
|   |   |       |-- time.ts             # Time formatting, minutes-away calc
|   |   |       |-- confidence.ts       # Confidence scoring logic
|   |   |       |-- walking.ts          # Phase 6: Haversine distance, walking time calc
|   |   |       |-- carbon.ts           # Phase 6: CO2 savings computation
|   |   |-- package.json
|   |   |-- tsconfig.json
|   |
|   |-- server/                         # Backend API (Hono)
|   |   |-- src/
|   |   |   |-- app.ts                  # Hono app setup, routes, middleware, static asset serving
|   |   |   |-- index.ts               # Entry point
|   |   |   |-- feeds/
|   |   |   |   |-- poller.ts           # Timed parallel fetch of MTA feeds
|   |   |   |   |-- parser.ts           # Protobuf -> structured objects
|   |   |   |   |-- transformer.ts      # Raw parsed data -> StationArrivals
|   |   |   |   |-- alerts-parser.ts    # Alert parsing and simplification
|   |   |   |   |-- cache.ts            # In-memory cache with TTL
|   |   |   |   |-- delay-detector.ts   # Phase 5: predictive delay detection from position diffs
|   |   |   |   |-- equipment-poller.ts # Phase 6: MTA Equipment API polling
|   |   |   |-- routes/
|   |   |   |   |-- arrivals.ts         # GET /api/arrivals/:stationId
|   |   |   |   |-- stations.ts         # GET /api/stations, GET /api/stations/:id
|   |   |   |   |-- alerts.ts           # GET /api/alerts, GET /api/alerts/:lineId
|   |   |   |   |-- commute.ts          # POST /api/commute/analyze
|   |   |   |   |-- push.ts             # POST /api/push/subscribe, DELETE /api/push/unsubscribe
|   |   |   |   |-- trip.ts             # Phase 5: GET /api/trip/:tripId (live trip tracking)
|   |   |   |   |-- equipment.ts        # Phase 6: GET /api/equipment/:stationId
|   |   |   |   |-- positions.ts        # Phase 6: GET /api/positions/:lineId
|   |   |   |   |-- health.ts           # GET /api/health
|   |   |   |-- transfer/
|   |   |   |   |-- engine.ts           # Transfer route computation
|   |   |   |   |-- graph.ts            # Station graph from transfers.txt
|   |   |   |   |-- travel-times.ts     # Scheduled inter-station travel times
|   |   |   |-- push/
|   |   |   |   |-- sender.ts           # Web Push message sending
|   |   |   |   |-- subscriptions.ts    # SQLite subscription storage
|   |   |   |   |-- matcher.ts          # Match alerts to subscriptions
|   |   |   |-- static/
|   |   |   |   |-- loader.ts           # Load pre-processed GTFS static JSON
|   |   |   |-- proto/
|   |   |       |-- gtfs-realtime.proto
|   |   |       |-- nyct-subway.proto
|   |   |       |-- compiled.js         # protobufjs compiled output
|   |   |-- scripts/
|   |   |   |-- process-gtfs.ts         # Download and process GTFS static data
|   |   |   |-- compile-proto.ts        # Compile .proto files to JS
|   |   |-- data/
|   |   |   |-- stations.json           # Pre-processed station index
|   |   |   |-- routes.json             # Pre-processed route index
|   |   |   |-- transfers.json          # Pre-processed transfer graph
|   |   |   |-- travel-times.json       # Inter-station travel times
|   |   |-- package.json
|   |   |-- tsconfig.json
|   |
|   |-- web/                            # Frontend PWA
|       |-- public/
|       |   |-- manifest.json           # PWA manifest
|       |   |-- icons/                  # App icons (192, 512, maskable)
|       |   |-- favicon.svg
|       |-- src/
|       |   |-- main.tsx                # React entry point
|       |   |-- App.tsx                 # Root component, router setup
|       |   |-- sw.ts                   # Service Worker (for vite-plugin-pwa)
|       |   |-- components/
|       |   |   |-- layout/
|       |   |   |   |-- BottomNav.tsx
|       |   |   |   |-- Header.tsx
|       |   |   |   |-- Screen.tsx      # Screen wrapper with transitions
|       |   |   |-- arrivals/
|       |   |   |   |-- ArrivalRow.tsx
|       |   |   |   |-- ArrivalList.tsx
|       |   |   |   |-- ConfidenceBar.tsx
|       |   |   |   |-- LineBullet.tsx
|       |   |   |-- favorites/
|       |   |   |   |-- FavoriteCard.tsx
|       |   |   |   |-- FavoritesList.tsx
|       |   |   |   |-- FavoriteEditor.tsx
|       |   |   |-- commute/
|       |   |   |   |-- CommuteCard.tsx
|       |   |   |   |-- CommuteEditor.tsx
|       |   |   |   |-- TransferDetail.tsx
|       |   |   |   |-- RouteComparison.tsx
|       |   |   |-- trip/                     # Phase 5
|       |   |   |   |-- TripTracker.tsx       # Live stop-by-stop progress view
|       |   |   |   |-- TripSharePage.tsx     # Lightweight read-only shared ETA page
|       |   |   |   |-- StopProgress.tsx      # Individual stop row in trip timeline
|       |   |   |-- journal/                  # Phase 5
|       |   |   |   |-- CommuteJournal.tsx    # Trip history list and stats
|       |   |   |   |-- TripChart.tsx         # Duration-over-time sparkline
|       |   |   |   |-- AnomalyBanner.tsx     # "This trip is running longer than usual"
|       |   |   |-- equipment/                # Phase 6
|       |   |   |   |-- EquipmentBadge.tsx    # Elevator/escalator status indicator
|       |   |   |   |-- EquipmentBanner.tsx   # Outage banner on station detail
|       |   |   |-- positions/                # Phase 6
|       |   |   |   |-- TrainDiagram.tsx      # SVG line diagram with train dots
|       |   |   |   |-- TrainDot.tsx          # Individual train position marker
|       |   |   |-- health/                   # Phase 6
|       |   |   |   |-- SystemHealth.tsx      # All-line status grid
|       |   |   |   |-- LineStatus.tsx        # Per-line status row
|       |   |   |-- stats/                    # Phase 6
|       |   |   |   |-- SubwayYear.tsx        # Annual summary card
|       |   |   |   |-- ShareCard.tsx         # Canvas-rendered shareable image
|       |   |   |   |-- FareTracker.tsx       # OMNY cap progress display
|       |   |   |-- walking/                  # Phase 6
|       |   |   |   |-- WalkComparison.tsx    # Walk vs transit side-by-side
|       |   |   |-- alerts/
|       |   |   |   |-- AlertBanner.tsx
|       |   |   |   |-- AlertCard.tsx
|       |   |   |   |-- AlertList.tsx
|       |   |   |-- search/
|       |   |   |   |-- StationSearch.tsx
|       |   |   |   |-- SearchResults.tsx
|       |   |   |-- common/
|       |   |       |-- PullToRefresh.tsx
|       |   |       |-- OfflineBanner.tsx
|       |   |       |-- LoadingSpinner.tsx
|       |   |       |-- ErrorBoundary.tsx
|       |   |-- screens/
|       |   |   |-- HomeScreen.tsx
|       |   |   |-- StationScreen.tsx
|       |   |   |-- CommuteScreen.tsx
|       |   |   |-- AlertsScreen.tsx
|       |   |   |-- SettingsScreen.tsx
|       |   |   |-- TripScreen.tsx      # Phase 5: live trip tracking view
|       |   |   |-- JournalScreen.tsx   # Phase 5: commute history and stats
|       |   |   |-- HealthScreen.tsx    # Phase 6: system-wide health dashboard
|       |   |   |-- StatsScreen.tsx     # Phase 6: annual summary + fare tracking
|       |   |-- hooks/
|       |   |   |-- useArrivals.ts      # Fetch and auto-refresh arrivals
|       |   |   |-- useFavorites.ts     # Read/write favorites from store
|       |   |   |-- useAlerts.ts        # Fetch and filter alerts
|       |   |   |-- useCommute.ts       # Commute analysis fetch
|       |   |   |-- useOnlineStatus.ts  # Navigator.onLine monitoring
|       |   |   |-- usePushNotifications.ts
|       |   |   |-- useTripTracker.ts   # Phase 5: lock onto tripId, poll progress
|       |   |   |-- useGeofence.ts      # Phase 5: station proximity detection
|       |   |   |-- useContextSort.ts   # Phase 5: time-aware favorite re-sorting
|       |   |   |-- useEquipment.ts     # Phase 6: fetch equipment status
|       |   |   |-- usePositions.ts     # Phase 6: fetch train positions for diagram
|       |   |   |-- useWalkComparison.ts # Phase 6: walk vs transit math
|       |   |-- stores/
|       |   |   |-- favoritesStore.ts   # Zustand store for favorites (+ tapHistory)
|       |   |   |-- settingsStore.ts    # Zustand store for settings
|       |   |   |-- arrivalsStore.ts    # Zustand store for cached arrivals
|       |   |   |-- journalStore.ts     # Phase 5: trip records + commute stats
|       |   |   |-- fareStore.ts        # Phase 6: OMNY ride tracking + fare cap
|       |   |-- lib/
|       |   |   |-- api.ts              # API client (fetch wrapper)
|       |   |   |-- push.ts            # Push subscription management
|       |   |   |-- offline.ts          # Offline data management
|       |   |   |-- prefetch.ts        # Phase 5: aggressive cache on station approach
|       |   |   |-- context.ts         # Phase 5: time-aware scoring for favorites
|       |   |   |-- share.ts           # Phase 6: html2canvas card export + Web Share API
|       |   |-- styles/
|       |       |-- globals.css         # Tailwind imports, base styles
|       |-- index.html
|       |-- vite.config.ts
|       |-- tailwind.config.ts
|       |-- package.json
|       |-- tsconfig.json
|
|-- Dockerfile                           # Multi-stage: build web + server, single runtime image
|-- .github/
|   |-- workflows/
|       |-- ci.yml                      # Lint, type-check, test, build
|       |-- build-push.yml             # Build container image, push to registry
|
|-- package.json                        # Workspace root (npm workspaces)
|-- tsconfig.base.json                  # Shared TypeScript config
|-- .gitignore
|-- README.md

# In the ardenone-cluster repo (GitOps manifests):
cluster-configuration/apexalgo-iad/mta-my-way/
|-- namespace.yaml                      # Namespace definition
|-- deployment.yaml                     # Single-container Deployment
|-- service.yaml                        # ClusterIP Service (port 3000)
|-- ingress.yaml                        # Cloudflare Tunnel route config
|-- pvc.yaml                            # PersistentVolumeClaim for SQLite push subscription DB
|-- kustomization.yaml                  # Kustomize overlay
```

**Dockerfile strategy (multi-stage):**
```
Stage 1 (build-web):    Install deps, run `vite build` -> produces /app/packages/web/dist/
Stage 2 (build-server): Install deps, compile TypeScript -> produces /app/packages/server/dist/
Stage 3 (runtime):      Copy web dist + server dist into slim Node.js 22 image
                         Hono serves /api/* from server code, /* from web dist
```

---

## 9. Deployment Strategy

### 9.1 Hosting

**Single container on apexalgo-iad (us-east-1):**
- The container runs as a Kubernetes Deployment in the `mta-my-way` namespace on the existing apexalgo-iad cluster.
- Hono serves both the API (`/api/*`) and static PWA assets (`/*`) from a single process on port 3000.
- A PersistentVolumeClaim provides durable storage for the SQLite push subscription database.
- No additional hosting services needed -- the cluster infrastructure already exists.

**Public access via Cloudflare Tunnel:**
- The apexalgo-iad cluster already has an active Cloudflare Tunnel.
- Add a DNS route (e.g., `mtamyway.com` or a subdomain) pointing to the mta-my-way Service through the tunnel.
- Cloudflare handles TLS termination, DDoS protection, and edge caching automatically.

### 9.2 CI/CD

**GitHub Actions pipeline:**

```
On push to main:
  1. Lint (ESLint + Biome)
  2. Type check (tsc --noEmit)
  3. Unit tests (Vitest)
  4. Build container image (multi-stage Dockerfile)
  5. Push image to container registry (GHCR)
  6. ArgoCD detects new image tag and syncs the Deployment
```

ArgoCD handles the actual deployment -- no kubectl apply from CI. The GitHub Actions pipeline only builds and pushes the image. ArgoCD watches the image tag (or the manifests repo) and rolls out the update automatically.

### 9.3 Caching

- **Static PWA assets:** Hono serves with long-lived cache headers (`Cache-Control: public, max-age=31536000, immutable`) since Vite produces content-hashed filenames. Cloudflare Tunnel caches these at the edge.
- **API responses:** Short TTL (`Cache-Control: public, max-age=15`) to allow edge caching while keeping data fresh. ETag based on MTA feed timestamp for conditional requests.
- **GTFS static data:** Aggressive caching (`Cache-Control: public, max-age=86400, stale-while-revalidate=604800`) since station/route data changes only a few times per year.

### 9.4 Domain

- Custom domain (e.g., `mtamyway.com`) configured in Cloudflare, routed through the existing tunnel to the mta-my-way Service.
- Single origin -- no separate API subdomain needed since frontend and backend are the same container.

### 9.5 Monitoring

- **Health checks:** Kubernetes liveness and readiness probes on `GET /api/health`. The health endpoint reports per-feed status (last successful fetch, age, error count).
- **Error tracking:** Sentry (free tier, 5,000 events/month). Integrated into both frontend and backend.
- **Feed health:** A simple status page at `/status` (Phase 4) shows MTA feed health publicly.
- **Cluster-level:** Existing apexalgo-iad monitoring infrastructure (if any) covers pod restarts, resource usage, etc.

---

## 10. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| MTA feed outage | Medium | High | Cache last-good response per feed; serve stale data with indicator; independent feed polling means partial outage only affects some lines |
| B Division prediction inaccuracy | Certain | Medium | Confidence indicator; +2 min buffer in transfer calculations; user education via tooltip |
| CORS issues with MTA feeds | N/A | N/A | Non-issue: frontend and API are same-origin (single container). Backend proxies all MTA requests |
| Protobuf parsing of NYCT extensions | Medium | Medium | Use protobufjs with pre-compiled proto files; fall back to base GTFS-RT fields if extension parsing fails |
| Push notification delivery | Medium | Medium | Web Push is best-effort; critical alerts also shown in-app; do not rely on push as the sole notification channel |
| Station complex mapping (multi-stop_id stations) | Medium | Medium | Pre-process `stops.txt` to map all stop_ids within a complex; use parent_station field |
| Feed rate limiting | Low | High | No known rate limits on GTFS-RT feeds, but implement backoff; 30-second polling is well within reasonable usage |
| Safari PWA limitations | Medium | Low | Safari supports Service Workers and Web App Manifest; push notifications on iOS require iOS 16.4+; test on Safari specifically |

---

## 11. Open Questions for Implementation

1. **Station complex mapping:** Some large stations (Times Square, Atlantic Ave-Barclays Center) have multiple parent station IDs serving different line groups. The pre-processing script needs to build a complex-level grouping. The MTA provides some complex data but it is not in GTFS format -- this may require a manually curated mapping file for the ~20 largest complexes.

2. **Transfer walking times:** The `transfers.txt` file provides `min_transfer_time` for some transfers, but not all. For missing values, a default of 3 minutes (180 seconds) is reasonable. A future enhancement could use crowdsourced or manually measured times.

3. **Alert simplification:** Rewriting MTA alert text into plain language is a non-trivial NLP task. Phase 3 can start with regex-based pattern matching for common alert formats (e.g., extracting affected stations from "running express from X to Y" patterns). A more sophisticated approach using an LLM API could be a future enhancement.

4. **Push notification opt-in UX:** Browsers require explicit user permission for push notifications. The app should not request permission on first visit -- instead, show the notification option in settings and prompt only when the user actively enables it. This avoids the "notification permission fatigue" that causes users to deny permission reflexively.

5. **Historical travel times vs scheduled:** The transfer engine needs inter-station travel times. The scheduled times from `stop_times.txt` are a starting point, but actual travel times vary by time of day and direction. Phase 2 can use scheduled times; a future enhancement could track actual observed travel times and use historical averages.

---

### Critical Files for Implementation

- `docs/research/mta-api-research.md` - Definitive reference for all MTA feed endpoints, protobuf structures, NYCT extensions, and known limitations that the backend must handle
- `docs/research/mta-app-competitive-analysis.md` - Competitive gaps and user pain points that drive every UX decision in the plan
- `docs/plan/plan.md` - This document
- `docs/notes/` - Implementation notes, decisions, and open question resolutions during development
- `Dockerfile` - Multi-stage build producing the single container image
- `cluster-configuration/apexalgo-iad/mta-my-way/` (in ardenone-cluster repo) - Kubernetes manifests for ArgoCD deployment
