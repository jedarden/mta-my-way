# Shared Package Structure

**Generated:** 2026-08-28  
**Path:** `/packages/shared/src/`

## Overview

The `@mta-my-way/shared` package provides shared TypeScript types, constants, validation schemas, utilities, and observability tools for the MTA My Way application. This package is imported by both the server and web packages to ensure type consistency and code reuse across the monorepo.

**Total Files:** 65  
**Total Directories:** 7

---

## Directory Structure

```
src/
├── constants/          # MTA GTFS-RT feed and line metadata
├── observability/      # Logging, tracing, and OpenTelemetry
├── schemas/            # Zod validation schemas for API inputs
├── testing/            # Test helpers and utilities
├── types/              # TypeScript type definitions
├── utils/              # Utility functions
└── index.ts            # Main export barrel
```

---

## Module Breakdown

### 1. Constants (`constants/`)

**Purpose:** Static data for MTA feeds and subway lines

| File | Purpose |
|------|---------|
| `feeds.ts` | MTA GTFS-RT feed configuration, polling intervals, cache TTLs |
| `feeds.test.ts` | Tests for feed configuration |
| `lines.ts` | NYC Subway line metadata (colors, divisions, routes) |
| `lines.test.ts` | Tests for line metadata |

**Key Exports:**
- `MTA_FEED_BASE_URL`, `MTA_ALERTS_FEED_URL`, `GTFS_STATIC_BASE_URL`
- `SUBWAY_FEEDS`, `LINE_TO_FEED`, `getFeedForLine()`
- `LINE_METADATA`, `getLineMetadata()`, `getLineColor()`
- `POLLING_INTERVALS`, `CACHE_TTLS`

---

### 2. Observability (`observability/`)

**Purpose:** Structured logging, distributed tracing, and OpenTelemetry integration

| File | Purpose |
|------|---------|
| `logger.ts` | Structured JSON logger with log levels |
| `logger.test.ts` | Logger tests |
| `otel.ts` | OpenTelemetry configuration and setup |
| `otel.test.ts` | OpenTelemetry tests |
| `tracing.ts` | W3C tracecontext distributed tracing |
| `tracing.test.ts` | Tracing tests |

**Key Exports:**
- `createLogger()`, `log` - Structured logging
- `tracer`, `withChildSpan()`, `getCurrentTraceId()` - Distributed tracing
- `resolveOtelConfig()`, `detectOtlpProtocol()` - OpenTelemetry setup
- Type exports: `LogLevel`, `LogEntry`, `Logger`, `OtelConfig`, `Span`

---

### 3. Schemas (`schemas/`)

**Purpose:** Zod validation schemas for API request/response validation

| File | Purpose |
|------|---------|
| `auth.ts` | Authentication and password schemas |
| `commute.ts` | Commute analysis request schemas |
| `context.ts` | Context-aware detection schemas |
| `params.ts` | Common route parameter and query schemas |
| `predictions.ts` | Delay prediction schemas |
| `push.ts` | Web Push notification schemas |
| `trips.ts` | Trip tracking and journal schemas |
| `*.test.ts` | Corresponding test files |
| `index.ts` | Barrel export for all schemas |

**Key Exports:**
- Password: `passwordPolicySchema`, `passwordChangeSchema`, `passwordResetRequestSchema`
- Params: `stationIdParamSchema`, `lineIdParamSchema`, `tripIdParamSchema`, `complexIdParamSchema`
- Queries: `alertsQuerySchema`, `positionsQuerySchema`, `delayPatternsQuerySchema`
- Requests: `tripCreateRequestSchema`, `commuteAnalyzeRequestSchema`, `contextDetectRequestSchema`
- Push: `pushSubscribeRequestSchema`, `pushUnsubscribeRequestSchema`, `pushUpdateRequestSchema`

---

### 4. Testing (`testing/`)

**Purpose:** Comprehensive test helpers for mocking, assertions, and observability testing

| File | Lines | Purpose |
|------|-------|---------|
| `test-helpers.ts` | 522 | Mock data generators, fixtures, assertions |
| `security-helpers.ts` | 527 | Security testing (auth, CSRF, rate limiting, input validation) |
| `observability-helpers.ts` | 840 | Logging, metrics, tracing, performance monitoring |
| `index.ts` | - | Barrel exports |
| `README.md` | 1611 | Comprehensive documentation |
| `TEST_HELPERS_AUDIT.md` | - | Audit of test helper coverage |
| `smoke.test.ts` | - | Infrastructure smoke tests |

**Key Exports:**
- **Mock Generators:** `createMockStation()`, `createMockArrival()`, `createMockAlert()`, `createMockFavorite()`
- **Test Fixtures:** `createTestFixture()` - Complete mock data suite
- **Assertions:** `assertHasProperties()`, `assertIsRecent()`, `assertApiResponse()`, `assertIsSorted()`
- **Security:** `createMockApiKey()`, `createMockAuthToken()`, `MALICIOUS_INPUTS`, `ROLES`
- **Observability:** `createMockLogger()`, `createMockMetricsRegistry()`, `createMockTracer()`
- **Performance:** `createPerformanceMonitor()`, `measureExecutionTime()`, `assertCompletesWithin()`

---

### 5. Types (`types/`)

**Purpose:** TypeScript type definitions for all domain models

| File | Purpose |
|------|---------|
| `alerts.ts` | Service alert and line health types |
| `arrivals.ts` | Real-time arrival and confidence types |
| `commute.ts` | Commute analysis and routing types |
| `context.ts` | Context-aware detection types |
| `delays.ts` | Delay prediction and pattern types |
| `equipment.ts` | Station equipment status types |
| `fare.ts` | Fare tracking and cap types |
| `favorites.ts` | User favorites and preferences types |
| `positions.ts` | Train position and line diagram types |
| `push.ts` | Web Push notification types |
| `stations.ts` | GTFS static data (stations, routes, transfers) |
| `trips.ts` | Trip tracking and journal types |

**Key Type Categories:**
- **Real-time:** `ArrivalTime`, `StationArrivals`, `TrainPosition`, `LinePositions`
- **Static:** `Station`, `Route`, `StationComplex`, `TransferGraph`, `TravelTime`
- **User:** `Favorite`, `Commute`, `UserPreferences`, `TripRecord`
- **Analysis:** `DelayPattern`, `DelayPrediction`, `CommuteAnalysis`, `TransferRoute`
- **System:** `StationAlert`, `LineHealthStatus`, `SystemHealth`, `EquipmentStatus`

---

### 6. Utils (`utils/`)

**Purpose:** Utility functions for calculations, formatting, and data processing

| File | Purpose |
|------|---------|
| `carbon.ts` | Carbon savings calculation and formatting |
| `confidence.ts` | Confidence scoring for arrival predictions |
| `context.ts` | Context-aware detection logic |
| `env.ts` | Environment variable parsing |
| `freshness.ts` | Data freshness level calculation |
| `patterns.ts` | Time bucket and day category utilities |
| `retry.ts` | Exponential backoff retry logic |
| `security.ts` | Security utilities |
| `time.ts` | Time formatting and calculation |
| `walking.ts` | Walking distance and time calculation |
| `*.test.ts` | Corresponding test files |

**Key Exports:**
- **Time:** `calculateMinutesAway()`, `formatTime()`, `formatTimeAgo()`, `getTodayISO()`
- **Confidence:** `calculateConfidence()`, `getConfidenceDescription()`, `isConfidenceAcceptable()`
- **Freshness:** `getFreshnessLevel()`, `formatFeedAge()`
- **Walking:** `haversineDistance()`, `walkingTime()`, `walkingTimeBetweenStations()`
- **Carbon:** `calculateCO2SavingsKg()`, `formatCarbonSavings()`, `getEnvironmentalEquivalents()`
- **Patterns:** `getTimeBucket()`, `getDayCategory()`, `getCurrentTimeBucket()`
- **Context:** `detectContext()`, `getContextUIHints()`, `calculateTapFrequency()`
- **Retry:** `retry()`, `retryWithBackoff()`, `createRetryFetch()`

---

## Main Export Barrel (`index.ts`)

The main `index.ts` file exports all public APIs from the shared package, organized by category:

1. **Types** - All domain types (arrivals, stations, alerts, trips, etc.)
2. **Validation Schemas** - All Zod schemas for API validation
3. **Constants** - Feed URLs, line metadata, polling intervals
4. **Utilities** - Time, confidence, walking, carbon, patterns, retry
5. **Observability** - Logger, tracer, OpenTelemetry configuration

---

## File Statistics

| Category | Implementation Files | Test Files | Total |
|----------|---------------------|------------|-------|
| Constants | 2 | 2 | 4 |
| Observability | 3 | 3 | 6 |
| Schemas | 7 | 7 | 14 |
| Testing | 3 | 1 | 4 |
| Types | 12 | 0 | 12 |
| Utils | 10 | 10 | 20 |
| **Total** | **37** | **23** | **65** |

---

## Module Organization Pattern

The shared package follows a consistent organizational pattern:

1. **Domain co-location** - Each domain has its own directory (types, utils, schemas)
2. **Test pairing** - Every implementation file has a corresponding `.test.ts` file
3. **Barrel exports** - Each directory has an `index.ts` for clean imports
4. **Type-only exports** - Types are exported separately from implementations
5. **Clear separation** - Validation (schemas), types (TypeScript), and logic (utils) are separate

---

## Import Patterns

### From Server/Web Packages

```typescript
// Types
import type { Station, ArrivalTime, TripRecord } from "@mta-my-way/shared";

// Validation schemas
import { stationIdParamSchema, tripCreateRequestSchema } from "@mta-my-way/shared";

// Utilities
import { calculateMinutesAway, getFreshnessLevel } from "@mta-my-way/shared";

// Observability
import { createLogger, tracer } from "@mta-my-way/shared";

// Constants
import { MTA_FEED_BASE_URL, LINE_METADATA } from "@mta-my-way/shared";
```

### Within Shared Package

```typescript
// Internal imports use relative paths
import type { Station } from "../types/stations.js";
import { calculateMinutesAway } from "../utils/time.js";
```

---

## Key Architectural Decisions

1. **TypeScript-first** - Strong typing throughout with exported type definitions
2. **Zod for validation** - Runtime validation schemas that map to TypeScript types
3. **Test doubles included** - Comprehensive mock generators and test helpers
4. **Observability built-in** - Structured logging and distributed tracing from day one
5. **No external dependencies** - Utilities are pure functions where possible
6. **Domain-driven** - Organization follows business domains (stations, arrivals, alerts)

---

## Related Documentation

- [Test Helpers README](./src/testing/README.md) - Comprehensive test helper documentation
- [Test Helpers Audit](./src/testing/TEST_HELPERS_AUDIT.md) - Coverage analysis
- [Project README](../../README.md) - Overall project documentation
