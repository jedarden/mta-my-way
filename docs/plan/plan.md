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

8. **Station complex mapping** -- The GTFS processing script also builds `complexes.json` by combining the MTA's published "Station Complexes" CSV (from the MTA open data portal) with the `parent_station` field in `stops.txt`. Output: `{complexId, stations[], name, allLines[], allStopIds[]}`. A `complex-overrides.json` handles ~5 edge cases where MTA data is incomplete (e.g., Fulton St / Broadway-Nassau). In the app, searching or favoriting any station in a complex shows all lines across the entire complex. This is foundational — it affects search, favorites, transfers, and every station-level display.

9. **GPS-powered onboarding** -- First-time users see a "60-second setup" flow instead of an empty dashboard. Request location via `navigator.geolocation`, find the 3 nearest stations, present as pre-filled favorite cards: "We found these stations near you. Keep the ones you use." Swipe to remove. Then one follow-up: "Where do you commute to?" with type-ahead. Auto-creates the first commute. If GPS is denied, falls back to station search with a prominent "Add your first station" card. Stores an `onboardingComplete` flag in localStorage; subsequent opens skip to the dashboard.

**Milestones:**
- Backend serves arrival data for all stations via REST endpoint.
- Frontend displays arrivals with search, favorites, and auto-refresh.
- Station complex mapping resolves all multi-parent-station complexes.
- First-time onboarding flow produces a usable dashboard in under 60 seconds.
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

1. **Alert ingestion and simplification** -- Parse the MTA subway alerts GTFS-RT feed. Simplify the notoriously confusing MTA alert language into plain English. Tag each alert with severity (info/warning/severe), affected lines, affected stations, and affected directions.

   **Simplification strategy — template-based rewriter:** MTA alert text follows ~15 recurring formulaic patterns. A pattern library (`alert-patterns.json`) maps each pattern to a regex with named capture groups and a plain-English template:

   | MTA Pattern | Regex captures | Plain English template |
   |---|---|---|
   | "Due to {cause}, {dir} [{lines}] trains are running express from {A} to {B}" | cause, dir, lines, A, B | "{Dir} {lines} trains skipping {skipped stations} due to {cause}" |
   | "[{lines}] service has been suspended between {A} and {B}" | lines, A, B | "{Lines} suspended {A} to {B}" |
   | "{dir} [{lines}] trains are running with delays" | dir, lines | "{Dir} {lines} trains delayed" |
   | "Service is resumed" | — | "{Lines} service restored" |
   | "[{lines}] trains are running on the {track} track from {A} to {B}" | lines, track, A, B | "{Lines} rerouted to {track} track {A} to {B}" |

   The extracted structured data (affected lines, stations, direction, cause) is also used to filter alerts to the user's favorites. When no pattern matches, fall back to the raw MTA text with a "raw alert" visual indicator. The pattern library is a standalone testable JSON file, growable over time — add a new pattern when an unmatched format appears in production logs. Start with the 10 most common patterns; the long tail can be added incrementally.

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

### Phase 7: Trust & Resilience -- Shuttle Info, Data Transparency

**Goal:** Build user trust through data transparency and provide critical fallback information when the system breaks down.

**Features:**

1. **Shuttle bus replacement info** -- When subway service is suspended and replaced by shuttle buses, the app shows where to catch the shuttle. The MTA alert says "use shuttle bus" but never tells you WHERE the bus stops.

   When an alert with `effect: NO_SERVICE` matches a known suspension segment, inject shuttle bus information into the alert display:

   ```
   +--------------------------------------+
   |  [RED] Service Suspended             |
   |  F suspended Church Av to Jay St     |
   |                                      |
   |  SHUTTLE BUS                         |
   |  Stops at:                           |
   |  · Church Av (SW corner McDonald Av) |
   |  · Fort Hamilton Pkwy (E side)       |
   |  · Jay St-MetroTech (Willoughby St)  |
   |  Runs every 8-12 min                 |
   +--------------------------------------+
   ```

   Implementation:
   - A curated static JSON lookup keyed by `{lineId, fromStopId, toStopId}` mapping to shuttle bus stop descriptions and approximate locations.
   - The MTA tends to suspend the same segments repeatedly — there are roughly 30-40 common suspension patterns across the system (overnight planned work, weekend construction, recurring problem areas).
   - Start with the 10 most frequently suspended segments and grow incrementally.
   - When an alert with `effect: NO_SERVICE` is parsed, check the affected stop range against the lookup. If matched, attach shuttle info to the `StationAlert` response.
   - Community contribution: a "Report shuttle stop" feature could let users add or correct shuttle bus locations, stored in the SQLite DB and reviewed before promotion to the static lookup.

   Data model:
   ```typescript
   interface ShuttleBusInfo {
     lineId: string;
     fromStopId: string;
     toStopId: string;
     stops: ShuttleStop[];
     frequencyMinutes: string;     // e.g., "8-12"
     lastVerified: string;         // ISO date
   }

   interface ShuttleStop {
     nearStationId: string;
     description: string;          // "SW corner of McDonald Ave & Church Ave"
     lat?: number;
     lon?: number;
   }
   ```

2. **Data freshness indicator per line** -- Show exactly how old each line's data is, building user trust through transparency.

   Display on station detail views as a subtle footer: "1/2/3: 8s ago · B/D/F/M: 43s ago". When data for a specific feed is getting stale (>45s since last successful poll), show a warning tint on affected arrivals. When a feed is fully stale (>90s), gray out those arrivals and show "(data may be outdated)".

   This is especially important given the A Division vs B Division accuracy gap — A Division feeds (numbered lines, ATS-tracked) update more reliably than B Division feeds (lettered lines, Bluetooth beacons). Making this visible helps users calibrate their own trust in the numbers.

   Implementation:
   - The backend already tracks per-feed poll timestamps. The `StationArrivals` interface already has a `feedAge` field.
   - Add a per-arrival `feedName` field so the frontend knows which feed each arrival came from.
   - Frontend renders feed age as a compact footer. Color-code: green (<15s), neutral (15-45s), amber (45-90s), red (>90s).
   - On the station detail view, a tap on the freshness indicator expands to show per-feed details: which feed, when last polled, current status.
   - On the system health dashboard (Phase 6), include a "Data Health" section showing all 8 feed statuses with age and error counts.

   Data model addition (to ArrivalTime):
   ```typescript
   // Added to ArrivalTime
   feedName: string;              // e.g., "gtfs-bdfm", "gtfs-ace"
   feedAge: number;               // Seconds since this feed was last successfully polled
   ```

**Milestones:**
- Shuttle bus info displayed for the 10 most common service suspension segments.
- Data freshness visible on all station detail views with color-coded staleness.

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
| **Input validation** | Zod | 3.x | Schema validation for API inputs and store migration safety |
| **Share card rendering** | html2canvas | 1.x | Render annual summary as shareable PNG image |
| **Containerization** | Docker | latest | Consistent builds, deployment portability |

---

## 8. Project Structure

Follows the established pattern for apexalgo-iad services: application source in the repo root, container build in `containers/`, Kubernetes manifests in `cluster-configuration/`.

**Note:** The project structure below is the original planned layout. The actual shipped structure is flatter — core server logic is at `packages/server/src/` (poller.ts, parser.ts, transformer.ts, cache.ts, alerts-poller.ts, delay-detector.ts, etc.), with `endpoints/` (health.ts, metrics.ts) and `routes/` (password-reset.routes.ts, metrics.ts) as separate directories. No separate `feeds/` subdirectory exists in the shipped version.

```
mta-my-way/                              # Application source (this repo)
|-- docs/
|   |-- plan/
|   |   |-- plan.md                     # This document
|   |-- research/
|   |   |-- mta-api-research.md
|   |   |-- mta-app-competitive-analysis.md
|   |-- notes/
|   |-- observability.md                # OpenTelemetry + Prometheus + Pino logging
|   |-- authorization-audit.md          # Auth framework documentation
|
|-- packages/
|   |-- shared/                         # Shared TypeScript types and utilities
|   |-- server/                         # Backend API (Hono)
|   |   |-- src/
|   |   |   |-- app.ts                  # Hono app setup, routes, middleware
|   |   |   |-- index.ts               # Entry point
|   |   |   |-- poller.ts               # MTA feed polling (parallel, 30s interval)
|   |   |   |-- parser.ts               # Protobuf parsing
|   |   |   |-- transformer.ts          # GTFS-RT → StationArrivals transform
|   |   |   |-- alerts-parser.ts        # Alert parsing and simplification
|   |   |   |-- alerts-poller.ts        # Alert feed polling
|   |   |   |-- cache.ts                # In-memory cache with TTL
|   |   |   |-- delay-detector.ts       # Predictive delay detection
|   |   |   |-- delay-predictor.ts      # Delay prediction engine
|   |   |   |-- equipment-poller.ts      # MTA Equipment API polling
|   |   |   |-- shuttle-matcher.ts      # NO_SERVICE alerts → shuttle lookup
|   |   |   |-- trip-tracking.ts        # Trip lookup and tracking
|   |   |   |-- trip-lookup.ts          # Trip query service
|   |   |   |-- context-service.ts      # Context detection and switching
|   |   |   |-- transfer/                # Transfer analysis
|   |   |   |   |-- engine.ts           # Route computation
|   |   |   |   |-- graph.ts            # Station graph
|   |   |   |   |-- travel-times.ts     # Inter-station times
|   |   |   |-- security/               # Authorization framework (shipped)
|   |   |   |   |-- security-db.ts      # API keys, sessions, OAuth, TOTP MFA
|   |   |   |   |-- cross-cutting.test.ts
|   |   |   |-- observability/          # Logging, metrics, tracing
|   |   |   |   |-- logger.ts           # Pino structured logging
|   |   |   |   |-- metrics.ts          # Prometheus metrics
|   |   |   |   |-- tracing.ts          # OTLP tracing
|   |   |   |   -- middleware.ts        # Observability middleware
|   |   |   |-- middleware/             # Hono middleware
|   |   |   |   |-- auth-middleware.ts  # Auth/context middleware
|   |   |   |   -- csrf-middleware.ts   # CSRF protection
|   |   |   |-- services/               # Business logic services
|   |   |   |   |-- push-service.ts    # Web Push notifications
|   |   |   |-- endpoints/              # Endpoint handlers
|   |   |   |   |-- health.ts           # GET /health, /api/health
|   |   |   |   |-- metrics.ts          # GET /metrics (Prometheus)
|   |   |   |-- routes/                 # Route handlers
|   |   |   |   |-- password-reset.routes.ts  # Credential reset flow (enabled)
|   |   |   |   |-- metrics.ts         # /api/metrics endpoint
|   |   |   |-- migration/              # Database migrations
|   |   |   |-- proto/                  # Protobuf definitions
|   |   |   |-- scripts/               # Build and processing scripts
|   |   |   |-- test/                   # Fixtures and test utilities
|   |   |   |-- data/                   # Static JSON data
|   |   |   |   |-- stations.json
|   |   |   |   |-- complexes.json
|   |   |   |   |-- routes.json
|   |   |   |   |-- transfers.json
|   |   |   |   |-- travel-times.json
|   |   |   |   |-- alert-patterns.json
|   |   |   |   |-- shuttle-stops.json
|   |   |-- package.json
|   |   |-- tsconfig.json
|   |
|   |-- web/                            # Frontend PWA
|       |-- src/
|       |   |-- main.tsx
|       |   |-- App.tsx
|       |   |-- screens/
|       |   |   |-- HomeScreen.tsx
|       |   |   |-- StationScreen.tsx
|       |   |   |-- CommuteScreen.tsx
|       |   |   |-- AlertsScreen.tsx
|       |   |   |-- SettingsScreen.tsx
|       |   |   |-- TripScreen.tsx
|       |   |   |-- JournalScreen.tsx
|       |   |   |-- HealthScreen.tsx
|       |   |   |-- StatsScreen.tsx
|       |   |   |-- MapScreen.tsx              # SHIPPED: Interactive SVG map
|       |   |   |-- LineDiagramScreen.tsx      # SHIPPED: Schematic line diagram
|       |   |   |-- PasswordResetRequestScreen.tsx   # SHIPPED
|       |   |   |-- PasswordResetConfirmScreen.tsx   # SHIPPED
|       |   |-- components/             # UI components (arrivals, favorites, commute, etc.)
|       |   |-- hooks/                  # React hooks
|       |   |-- stores/                 # Zustand stores
|       |   |-- lib/                    # Utilities (API client, tracing, etc.)
|       |   |-- styles/                 # Tailwind + global styles
|       |-- vite.config.ts
|       |-- tailwind.config.ts
|       |-- package.json
|       |-- tsconfig.json
|
|-- Dockerfile                           # Multi-stage: build web + server, single runtime image
|-- package.json                        # Workspace root (npm workspaces)
|-- tsconfig.base.json                  # Shared TypeScript config
|-- README.md

# In the jedarden/declarative-config repo (GitOps via ArgoCD):
k8s/apexalgo-iad/mta-my-way/
|-- namespace.yaml                      # Namespace definition
|-- deployment.yaml                     # Single-container Deployment
|-- service.yaml                        # ClusterIP Service (port 3000)
|-- ingressroute.yaml                   # Traefik IngressRoute (Cloudflare Tunnel backend)
|-- pvc.yaml                            # PersistentVolumeClaim for SQLite DB (if needed)
|-- sealedsecret-template.yaml          # Template for SealedSecret (VAPID keys, etc.)
|-- application.yaml                    # ArgoCD Application manifest
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

**Argo Workflows + ArgoCD (GitOps):**

CI/CD is handled entirely through Argo Workflows on the `iad-ci` cluster and ArgoCD deployment. GitHub Actions are **disabled by policy** across all repos in this workspace.

**Container Build (Argo WorkflowTemplate):**
- WorkflowTemplate: `mta-my-way-build` in `jedarden/declarative-config` (k8s/iad-ci/argo-workflows/)
- Location: `jedarden/declarative-config` repo (not `mta-my-way` repo)
- Triggers: On push to main branch (automatic via Git push hook)
- Steps:
  1. Lint (Biome + ESLint)
  2. Type check (TypeScript)
  3. Unit tests (Vitest)
  4. Build container image (multi-stage Dockerfile)
  5. Push image to container registry (`ronaldraygun/mta-my-way`)

**Deployment (ArgoCD):**
- ArgoCD Application: `mta-my-way-apexalgo-iad` defined in `jedarden/declarative-config` (k8s/apexalgo-iad/mta-my-way/application.yaml)
- ArgoCD watches the manifests repo (`jedarden/declarative-config`) and syncs changes to the `apexalgo-iad` cluster
- All cluster changes go through `jedarden/declarative-config` — no direct `kubectl apply` or live mutation
- The Deployment references the built container image tag; ArgoCD rolls out updates automatically

**Manifest Location:**
- Repository: `jedarden/declarative-config`
- Path: `k8s/apexalgo-iad/mta-my-way/`
- Files: namespace.yaml, deployment.yaml, service.yaml, ingressroute.yaml, pvc.yaml, sealedsecret-template.yaml, application.yaml

**Status and Logs:**
```bash
# List recent workflow runs
kubectl --kubeconfig=/home/coding/.kube/iad-ci.kubeconfig \
  get workflows -n argo-workflows --sort-by=.metadata.creationTimestamp | tail -20

# Check ArgoCD application status
curl -sk https://argocd-ro-ardenone-manager-ts.ardenone.com:8444/api/v1/applications/mta-my-way-apexalgo-iad
```

### 9.3 Caching

- **Static PWA assets:** Hono serves with long-lived cache headers (`Cache-Control: public, max-age=31536000, immutable`) since Vite produces content-hashed filenames. Cloudflare Tunnel caches these at the edge.
- **API responses:** Short TTL (`Cache-Control: public, max-age=15`) to allow edge caching while keeping data fresh. ETag based on MTA feed timestamp for conditional requests.
- **GTFS static data:** Aggressive caching (`Cache-Control: public, max-age=86400, stale-while-revalidate=604800`) since station/route data changes only a few times per year.

### 9.4 Domain

- Custom domain (e.g., `mtamyway.com`) configured in Cloudflare, routed through the existing tunnel to the mta-my-way Service.
- Single origin -- no separate API subdomain needed since frontend and backend are the same container.

### 9.5 Monitoring

- **Health checks:** Kubernetes liveness and readiness probes on `GET /health` (or `GET /api/health`). The health endpoint reports per-feed status (last successful fetch, age, error count), uptime, memory usage, and active connections.
- **Structured logging:** Pino-based JSON logging with contextual metadata (see `docs/observability.md`). Log levels: debug, info, warn, error. Logs written to stdout for Kubernetes log aggregation.
- **Metrics:** Prometheus metrics exposed at `GET /metrics` (HTTP requests, cache hits/misses, feed poll duration, push notifications, trips, commute analysis, station search, delay predictions, context detections, alerts, equipment outages).
- **Distributed tracing:** OpenTelemetry (OTLP gRPC) for request tracing and performance debugging (see `packages/server/src/observability/tracing.ts`).
- **Feed health:** A status page at `/status` renders health endpoint data as a human-readable HTML dashboard showing all feed statuses, error counts, and staleness indicators.
- **Cluster-level:** Existing apexalgo-iad monitoring infrastructure (if any) covers pod restarts, resource usage, etc.

**Note:** No Sentry integration exists. Error tracking is handled through structured logging and Prometheus metrics.

---

## 10. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| MTA feed outage | Medium | High | Cache last-good response per feed; serve stale data with indicator; independent feed polling means partial outage only affects some lines |
| B Division prediction inaccuracy | Certain | Medium | Confidence indicator; +2 min buffer in transfer calculations; user education via tooltip |
| CORS issues with MTA feeds | N/A | N/A | Non-issue: frontend and API are same-origin (single container). Backend proxies all MTA requests |
| Protobuf parsing of NYCT extensions | Medium | Medium | Use protobufjs with pre-compiled proto files; fall back to base GTFS-RT fields if extension parsing fails |
| Push notification delivery | Medium | Medium | Web Push is best-effort; critical alerts also shown in-app; do not rely on push as the sole notification channel |
| Station complex mapping (multi-stop_id stations) | Resolved | — | Phase 1 feature #8: MTA Station Complexes CSV + GTFS parent_station + manual overrides → `complexes.json` |
| localStorage schema corruption between deploys | Medium | High | Zustand versioned migrations with backup snapshots; failed migration restores from backup, never blank slate (Section 14) |
| API abuse / DDoS on public endpoint | Medium | High | Defense in depth: Cloudflare WAF rate limiting + Hono token bucket + Zod input validation (Section 12) |
| Alert simplification misses unknown patterns | Medium | Low | Graceful fallback: unmatched alerts shown as raw text with "raw alert" indicator; pattern library grows over time (Phase 3) |
| Feed rate limiting | Low | High | No known rate limits on GTFS-RT feeds, but implement backoff; 30-second polling is well within reasonable usage |
| Safari PWA limitations | Medium | Low | Safari supports Service Workers and Web App Manifest; push notifications on iOS require iOS 16.4+; test on Safari specifically |

---

## 11. Testing Strategy

### 11.1 Feed Snapshot Testing

Record actual MTA GTFS-RT binary responses as test fixtures (one per feed, capturing edge cases: empty feeds, unassigned trips, stale VehiclePositions, NYCT extensions, cancelled trips within replacement periods). All feed parsing and transformation tests run against these recorded snapshots — never against live MTA feeds.

Fixture location: `packages/server/test/fixtures/feeds/`

### 11.2 Test Layers

**Unit tests (Vitest):**
- Feed parser: protobuf → structured objects against snapshot fixtures.
- Transformer: structured objects → `StationArrivals` model.
- Alert simplifier: raw MTA text → pattern match → plain English. Test every pattern in `alert-patterns.json` with fixture inputs.
- Transfer engine: route computation with known station graph inputs.
- Confidence scoring: division + assigned status → confidence level.
- Delay detector: position diffs across mock poll sequences.
- Zustand stores: migration functions tested with fixtures of each old schema shape. FIFO capping on tapHistory and TripRecord arrays.
- Utility functions: walking time, carbon calculation, time formatting.

**Integration tests (Vitest):**
- API routes tested against an in-memory Hono instance with the poller replaced by fixture data.
- Validate response shapes against shared TypeScript interfaces using Zod schemas.
- Push subscription lifecycle: subscribe, match alert, verify notification payload.

**E2E tests (Playwright):**
- Critical user flows on mobile viewports (iPhone SE 375px, Pixel 5 393px):
  1. Onboarding → add favorite → view arrivals.
  2. Search station → see detail → configure commute.
  3. View alert → verify simplification matches expected text.
  4. Offline mode: disconnect network → verify cached data displayed with banner.
  5. PWA install prompt fires on supported browsers.
- Mock backend serves fixture data via a lightweight Hono instance in the test harness.

### 11.3 CI Integration

All three layers run in the Argo Workflows CI pipeline (`mta-my-way-build` WorkflowTemplate in `jedarden/declarative-config`). E2E tests run against a preview build (not production). Tests must pass before container image build proceeds. GitHub Actions are disabled by policy.

---

## 12. Security

### 12.1 Network Layer (Cloudflare)

- Cloudflare Tunnel provides TLS termination and DDoS protection automatically.
- Cloudflare WAF rate-limiting rule on the tunnel: 100 requests/minute per IP for `/api/*` paths. Returns 429 with a `Retry-After` header.
- Cloudflare Bot Management (free tier) filters automated abuse.

### 12.2 Application Layer (Hono)

- **Rate limiting:** Hono middleware with an in-memory token bucket as a second defense layer. 60 requests/minute per IP for API routes. Single-container deployment means single-process state suffices — no Redis needed.
- **Input validation:** Zod schemas on all API inputs. Push subscription payloads, commute analysis requests, and report submissions are validated before processing. Invalid payloads return 400 with a structured error.
- **CSP headers:** Strict Content-Security-Policy on all HTML responses: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'`. Prevents XSS.
- **Security headers:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.

### 12.3 Data Privacy

- **No PII stored server-side.** Favorites, commute journal, fare tracking, tap history — all localStorage, never sent to the backend.
- **Push subscriptions** are keyed by a SHA-256 hash of the subscription endpoint. No user identity, email, or device ID is stored.
- **Trip share links** expire when the `tripId` disappears from the GTFS-RT feed (trip completes). Explicit TTL of 24 hours enforced server-side.
- **Geolocation** is only used client-side for onboarding, nearest station, and pre-fetch. Coordinates are never sent to the backend.

---

## 13. Error and Empty States

Every data-displaying component wraps its content in a `<DataState>` wrapper that handles all possible states. No component is allowed to render only the happy path.

### 13.1 State Machine

Each data source (arrivals, alerts, commute analysis, equipment, positions) tracks its state as one of:

| State | UI Treatment |
|-------|-------------|
| `loading` | Skeleton placeholders (animated shimmer, shaped like the expected content). Never a spinner. |
| `loaded` | Normal content display. |
| `empty` | Contextual guidance. E.g., no arrivals: "No trains scheduled at this hour — overnight service resumes at 5 AM." No favorites: "Add your first station" with search shortcut. |
| `error` | Plain-language explanation + retry button. "Couldn't load arrivals. Check your connection." Never shows stack traces or error codes. |
| `stale` | Cached data displayed normally, with an amber banner: "Updated 4 min ago — refreshing..." Data items fade visually after 2 min, gray out after 5 min. |
| `offline` | Cached data displayed with a persistent "You're offline" chip at the top. Search and favorites work fully (static data cached by Service Worker). |

### 13.2 Shared Component

```typescript
<DataState
  state={arrivalsQuery.state}
  loadingSkeleton={<ArrivalsSkeleton />}
  emptyMessage="No trains scheduled right now"
  emptyAction={{ label: "View schedule", href: "/schedule" }}
  errorRetry={() => arrivalsQuery.refetch()}
>
  <ArrivalsList arrivals={arrivalsQuery.data} />
</DataState>
```

This is enforced by convention — every screen-level data component uses `<DataState>`. PR reviews flag direct data rendering without it.

---

## 14. Data Migration Strategy

### 14.1 Versioned Migrations via Zustand Persist

Each Zustand store that persists to localStorage uses the built-in `version` and `migrate` options:

```typescript
persist(storeCreator, {
  name: 'mta-favorites',
  version: 3,
  migrate: (persisted, version) => {
    let state = persisted;
    if (version < 2) state = migrateV1toV2(state);
    if (version < 3) state = migrateV2toV3(state);
    return state;
  },
})
```

Each migration is a pure function: `(oldState) → newState`. Migrations are colocated with their stores in a `migrations/` subdirectory and unit-tested with fixtures of the old schema shape.

### 14.2 Safety Net

Before running any migration, the persist middleware snapshots the current store to a backup key: `localStorage.setItem('_mta_backup_favorites_v2', ...)`. If the migration throws:
1. Restore from backup — user keeps their old data with old behavior.
2. Log the failure to the error logger (Pino structured logging).
3. Set a `migrationFailed` flag that surfaces a non-blocking banner: "Some settings may need to be reconfigured."

The user never sees a blank slate from a failed migration.

### 14.3 Stores and Versions

| Store | Key | Current Version | Contains |
|-------|-----|----------------|----------|
| `favoritesStore` | `mta-favorites` | 1 | Favorites, commutes, settings, tapHistory |
| `arrivalsStore` | `mta-arrivals` | 1 | Cached arrivals per station |
| `journalStore` | `mta-journal` | 1 | TripRecord[], CommuteStats |
| `fareStore` | `mta-fare` | 1 | FareTracking, RideLogEntry[] |
| `settingsStore` | `mta-settings` | 1 | Theme, refresh interval, accessible mode, etc. |

---

## 15. Observability

### 15.1 Structured Feed Pipeline Logging

Every feed poll logs a single structured JSON line to stdout (captured by Kubernetes logging):

```json
{"ts":"2026-03-20T12:00:30Z","feed":"gtfs-bdfm","status":"ok","latencyMs":45,"entities":312,"parseErrors":0}
```

Failed polls log the error:

```json
{"ts":"2026-03-20T12:00:30Z","feed":"gtfs-ace","status":"error","error":"ETIMEDOUT","consecutiveFailures":2}
```

### 15.2 Rich Health Endpoint

`GET /api/health` returns a comprehensive observability payload:

```json
{
  "status": "healthy",
  "uptime": 86400,
  "feeds": {
    "gtfs": {"lastPoll": "8s ago", "latencyMs": 32, "entities": 485, "errors24h": 0, "status": "ok"},
    "gtfs-bdfm": {"lastPoll": "12s ago", "latencyMs": 45, "entities": 312, "errors24h": 0, "status": "ok"},
    "gtfs-ace": {"lastPoll": "28s ago", "latencyMs": 62, "entities": 198, "errors24h": 3, "status": "degraded"}
  },
  "alerts": {"active": 4, "predicted": 1, "simplificationMatchRate": 0.87},
  "pushSubscriptions": 847,
  "cacheHitRate": 0.94,
  "memoryMb": 128
}
```

### 15.3 Alerting

- **Kubernetes readiness probe** calls `GET /health`. Returns 503 when 3+ feeds have been failing for >5 minutes, triggering pod restart.
- **Liveness probe** is a simple TCP check on port 3000.
- The `/status` page renders the health endpoint as a human-readable dashboard.
- **Structured logging** captures backend errors (parsing failures, unhandled exceptions) and frontend errors (rendering crashes, API call failures) via Pino JSON logs, aggregated by Kubernetes log infrastructure.
- **Prometheus metrics** expose error rates, latency distributions, and feed health for alerting rules (e.g., high error rate, high latency, feed staleness, low push notification success rate, high memory usage).
- **OpenTelemetry tracing** provides distributed request traces for performance debugging and error root cause analysis.

**Note:** No Sentry integration exists. All error tracking and alerting is handled through the observability stack documented in `docs/observability.md`.

---

## 16. Open Questions for Implementation

*Note: Station complex mapping (resolved in Phase 1, feature #8) and alert simplification (resolved in Phase 3, feature #1) have been moved from open questions into their respective phases.*

### Original Open Questions

1. **Transfer walking times:** The `transfers.txt` file provides `min_transfer_time` for some transfers, but not all. For missing values, a default of 3 minutes (180 seconds) is reasonable. A future enhancement could use crowdsourced or manually measured times.

2. **Push notification opt-in UX:** Browsers require explicit user permission for push notifications. The app should not request permission on first visit -- instead, show the notification option in settings and prompt only when the user actively enables it. This avoids the "notification permission fatigue" that causes users to deny permission reflexively.

3. **Historical travel times vs scheduled:** The transfer engine needs inter-station travel times. The scheduled times from `stop_times.txt` are a starting point, but actual travel times vary by time of day and direction. Phase 2 can use scheduled times; a future enhancement could track actual observed travel times and use historical averages.

### Shipped Architecture Deviations

The following shipped features represent deliberate deviations from the original plan:

4. **Auth framework shipped despite "no accounts" promise:** The original plan (Section 1, Section 12.3) explicitly stated "no ads, no accounts, no subscriptions" and promised no server-side PII. However, the codebase ships a comprehensive authentication and authorization framework including:
   - API key authentication (PBKDF2 hashing, 600k iterations, scope-based)
   - Session management (IP binding, device tracking, CSRF tokens, sliding expiration)
   - OAuth 2.0 with PKCE flow (Google/GitHub providers)
   - TOTP MFA with backup codes
   - Credential-reset flow with email delivery (enabled via `/api/password-reset/*` routes and `PasswordReset*Screen` components)
   - Full authorization middleware suite (requireResourceAccess, requireAdmin, requireWrite, requireMfa, validateDataAccess, auditLogAccess)

   **Status:** Most auth routes are disabled in `app.ts` (commented out or behind feature flags). Only the credential-reset flow is fully enabled. The framework exists for future use but is not active in the current configuration. See `docs/authorization-audit.md` for a comprehensive security analysis.

   **Rationale:** The auth framework was implemented for extensibility and potential future features (user accounts, saved commutes sync across devices, etc.), but the core app remains usable without authentication per the original vision.

5. **Map screens shipped despite "not a map explorer" claim:** The original plan (Section 1) explicitly stated "It is not a trip planner for tourists. It is not a map explorer." However, the shipped app includes:
   - `MapScreen.tsx`: Interactive SVG transit map with pan/zoom, real-time pulsing train positions, line filtering, and tap-to-detail modal
   - `LineDiagramScreen.tsx`: Schematic line diagram showing train positions as dots on a linear station-to-station representation
   - README explicitly advertises "Interactive transit map" as a feature

   **Status:** These screens are fully implemented and accessible. They provide value beyond the original "commuter tool" scope by offering system-wide visualization and line-level health at a glance.

   **Rationale:** While the core use case remains the favorites-first home screen, the map features enhance situational awareness (e.g., "Why is my F train delayed? Show me the whole line") and provide entry points for new users who want to explore the system before committing to favorites.

---

### Critical Files for Implementation

- `docs/research/mta-api-research.md` - Definitive reference for all MTA feed endpoints, protobuf structures, NYCT extensions, and known limitations that the backend must handle
- `docs/research/mta-app-competitive-analysis.md` - Competitive gaps and user pain points that drive every UX decision in the plan
- `docs/plan/plan.md` - This document
- `docs/notes/` - Implementation notes, decisions, and open question resolutions during development
- `Dockerfile` - Multi-stage build producing the single container image
- `k8s/apexalgo-iad/mta-my-way/` (in `jedarden/declarative-config`) - Kubernetes manifests for ArgoCD deployment (corrected 2026-07-20; see Section 9.2 which already had the right path — this list entry was stale)

---

## ADR-001: 2026-07-20 — Decouple the Core Read Path from Persistent-Volume-Backed State

### Context

While auditing the live deployed artifact on 2026-07-20, `mtamyway.com` was found to be unreachable (`DNS_PROBE_FINISHED_NXDOMAIN`, confirmed independently from a phone on cellular/WiFi, outside this server's Tailscale network). Read-only `kubectl` against `apexalgo-iad` (`kubectl --server=http://traefik-apexalgo-iad:8001 get pods -n mta-my-way`) showed the single `mta-my-way` pod stuck `0/1 ContainerCreating` for over 9 hours, with 292 repeated `FailedMount` events:

```
MountVolume.SetUp failed for volume "pvc-55bd460e-...": applyFSGroup failed for vol ...:
readdirent /var/lib/kubelet/pods/.../volumes/kubernetes.io~csi/pvc-.../mount: input/output error
```

This is a Rackspace Spot Cinder CSI-layer I/O error on the `mta-my-way-data` PVC (`sata` storage class, correctly configured per workspace policy — the storage class itself is not the problem). No open bead tracked this; `deployments/prometheus/alerts.yml` has no rule for `FailedMount`/pod-not-ready conditions, only `up{job="mta-my-way"} == 0`, which a pod that never starts scraping won't reliably trigger. It went undetected for 9+ hours until this audit.

The deeper issue this exposes is architectural, not just an infra hiccup: `k8s/apexalgo-iad/mta-my-way/deployment.yaml` runs `replicas: 1` with `strategy: Recreate`, one container, one required `volumeMount` at `/data` backing two SQLite databases (`DATABASE_PATH` for push subscriptions, `ALERT_HISTORY_PATH` for alert history — see `packages/server/src/push/subscriptions.ts`). Because the volumeMount is required in the pod spec, kubelet cannot start the container at all when the mount fails — which means the app cannot serve *any* traffic, including the fully in-memory, zero-persistence-required paths (`/api/arrivals/*`, `/api/stations`, `/api/routes`, `/api/alerts`, `/api/commute/analyze`, and all static PWA assets) that make up the entire stated value proposition (plan.md Section 1: "open and see your data in under three seconds"). The plan's own Risk table (Section 10) already treats push notifications as best-effort ("do not rely on push as the sole notification channel"), but the deployment topology doesn't reflect that: a storage fault in the least-critical subsystem (push/password-reset) currently takes the most-critical one (real-time arrivals) down with it. This is also the second known PVC-related incident for this app (see closed bead `bf-15tr`, a Cinder minimum-size issue) — the failure mode recurs.

### Decision

Split the container's responsibilities along the fault line the plan already implies:

1. A stateless **core** path — GTFS-RT polling, the arrivals/stations/routes/alerts/commute-analysis endpoints, and static PWA asset serving — with zero filesystem dependency beyond the read-only, image-baked GTFS JSON in `packages/server/data/`. No PVC, no `volumeMounts`. It schedules and becomes `Ready` on any node regardless of Cinder/CSI health, and because there's no single-writer state, it can run `replicas: 2+` with a standard `RollingUpdate` strategy instead of the current `Recreate`.
2. A **stateful** subsystem for anything requiring durable writes (push subscriptions, alert history, and the dormant auth/session/password-reset tables) that keeps the existing PVC + `Recreate` + `replicas: 1` shape, but is now allowed to be unavailable without taking the core down.

Wire them as an optional dependency: the core process calls the stateful subsystem over its internal ClusterIP Service with a short timeout and circuit breaker. If it's unreachable, push/auth/password-reset endpoints degrade to `503` and `/api/health` reports that subsystem `degraded` — everything else keeps working exactly as it does today when feeds are healthy. As an incremental first step (deployable before the full manifest split), make the `better-sqlite3` opens in `packages/server/src/push/subscriptions.ts` (and the alert-history equivalent) lazy/best-effort rather than a startup-blocking call in `index.ts`, so an unwritable or corrupt `/data` doesn't crash process startup even in cases where the mount technically succeeds but the filesystem underneath is bad.

### Alternatives Considered

1. **Do nothing, wait for Rackspace Spot volume auto-recovery.** Rejected — this is the second known PVC incident for this app, and passive waiting leaves the entire commuter-facing product down for an unbounded window on every future storage blip.
2. **Move to networked/replicated storage for the stateful data** (e.g., Litestream streaming SQLite to B2, as already used elsewhere in this fleet) so a single Cinder volume is never a hard dependency. Worth doing for the stateful subsystem regardless, but doesn't by itself remove the SPOF: today's single container still refuses to start serving arrivals if its own `/data` mount fails, so this only helps combined with the split below.
3. **Increase replica count to 2+ without decoupling storage.** Rejected — SQLite is single-writer and the PVC is `ReadWriteOnce`; two replicas on different nodes can't share it.
4. **Full microservice split into separate repos/images.** Rejected as overkill for this app's size; a two-Deployment split within the same repo/image (e.g. a `CORE_ONLY` env var selecting which routes/pollers to mount) gets most of the resilience benefit for a fraction of the operational overhead of alternative 4's full split.

### Consequences

- **Positive:** A future Cinder/CSI mount failure degrades push notifications and password reset only; the "check your train" core experience stays up.
- **Positive:** Unlocks horizontal scaling and zero-downtime `RollingUpdate` deploys for the core path, which today takes a forced `Recreate` downtime window on every single push-to-main deploy, independent of PVC health.
- **Negative:** One more moving part — an internal call from core to the stateful subsystem, plus its own Service/Deployment manifest set in `declarative-config` — instead of one container doing everything.
- **Neutral:** Does not fix the underlying Rackspace Spot Cinder I/O error itself; that's an infra-layer fault tracked separately. This decision is about not letting that class of fault take the whole product down.
- **Follow-up work** (filed as beads, see `.beads/` in this repo): pin the deployed image off `:latest`, add alerting for `FailedMount`/pod-not-ready conditions, make the SQLite opens lazy as the incremental first step, and — once the core path can no longer be dragged down by it — actually finish wiring the mostly-built-but-disabled OAuth/session framework (see `docs/authorization-audit.md`) to ship opt-in cross-device favorites sync, since it becomes safer to depend on once a fault in it can't take the whole app down anymore.
