# MTA My Way - Shared Package Structure

**Generated:** 2026-08-28  
**Package:** `@mta-my-way/shared`  
**Version:** 0.0.1

## Overview

The shared package is a TypeScript library that contains common types, constants, utilities, and validation schemas used by both the server and web packages in the MTA My Way monorepo.

## Directory Structure

```
packages/shared/
├── src/
│   ├── index.ts                    # Main entry point - re-exports all public APIs
│   ├── constants/                 # MTA and configuration constants
│   │   ├── feeds.ts              # GTFS-RT feed URLs and configurations
│   │   ├── lines.ts              # Subway line metadata
│   │   ├── feeds.test.ts
│   │   └── lines.test.ts
│   ├── types/                      # TypeScript type definitions
│   │   ├── alerts.ts             # Service alert types
│   │   ├── arrivals.ts           # Real-time arrival types
│   │   ├── commute.ts            # Commute analysis types
│   │   ├── context.ts            # Context-aware detection types
│   │   ├── delays.ts             # Delay prediction types
│   │   ├── equipment.ts          # Equipment status types
│   │   ├── fare.ts               # Fare tracking types
│   │   ├── favorites.ts          # User preferences and favorites
│   │   ├── positions.ts          # Train position types
│   │   ├── push.ts               # Web Push notification types
│   │   ├── stations.ts           # GTFS static data types
│   │   └── trips.ts              # Trip tracking types
│   ├── schemas/                    # Zod validation schemas
│   │   ├── index.ts              # Schema registry
│   │   ├── auth.ts               # Authentication schemas
│   │   ├── commute.ts            # Commute-related schemas
│   │   ├── context.ts            # Context detection schemas
│   │   ├── params.ts              # Request parameter schemas
│   │   ├── predictions.ts        # Prediction-related schemas
│   │   ├── push.ts               # Push notification schemas
│   │   └── trips.ts              # Trip tracking schemas
│   ├── utils/                      # Utility functions
│   │   ├── carbon.ts             # Carbon savings calculation
│   │   ├── confidence.ts         # Confidence scoring
│   │   ├── context.ts            # Context detection utilities
│   │   ├── env.ts                # Environment variable parsing
│   │   ├── freshness.ts          # Data freshness utilities
│   │   ├── patterns.ts           # Time bucket and pattern utilities
│   │   ├── retry.ts              # Retry with exponential backoff
│   │   ├── security.ts           # Security utilities
│   │   ├── time.ts               # Time formatting and calculation
│   │   └── walking.ts            # Walking distance and time calculation
│   ├── observability/             # Logging and tracing
│   │   ├── logger.ts             # Structured JSON logger
│   │   ├── otel.ts               # OpenTelemetry configuration
│   │   └── tracing.ts            # Distributed tracing (W3C tracecontext)
│   └── testing/                   # Test utilities and helpers
│       ├── index.ts
│       ├── observability-helpers.ts
│       ├── security-helpers.ts
│       ├── test-helpers.ts
│       └── smoke.test.ts
├── dist/                          # Compiled JavaScript output
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Module Inventory

### **constants/** (2 modules)
- `feeds.ts` - MTA GTFS-RT feed URLs, polling intervals, cache TTLs
- `lines.ts` - Subway line metadata, colors, and division information

### **types/** (11 modules)
- `alerts.ts` - Service alerts, severity levels, shuttle information
- `arrivals.ts` - Real-time arrivals, confidence levels, time buckets
- `commute.ts` - Transfer routes, walking options, service patterns
- `context.ts` - User context detection and confidence
- `delays.ts` - Delay patterns, predictions, weather factors
- `equipment.ts` - Elevator/escalator status
- `fare.ts` - Fare tracking, ride logs, caps
- `favorites.ts` - User favorites, commute configuration
- `positions.ts` - Train positions, interpolated locations
- `push.ts` - Web Push notification types
- `stations.ts` - GTFS static data (stations, routes, transfers)
- `trips.ts` - Trip tracking, commute journal, live state

### **schemas/** (8 modules)
- `index.ts` - Schema registry with all validation schemas
- `auth.ts` - Password policies, reset/confirm flows
- `commute.ts` - Commute analysis and optimization
- `context.ts` - Context detection and overrides
- `params.ts` - Common request parameters (pagination, IDs, dates)
- `predictions.ts` - Arrival prediction schemas
- `push.ts` - Push notification subscription management
- `trips.ts` - Trip creation and update schemas

### **utils/** (10 modules)
- `carbon.ts` - CO₂ savings calculations and formatting
- `confidence.ts` - Confidence scoring for arrival predictions
- `context.ts` - Context-aware detection utilities
- `env.ts` - Environment variable parsing (boolean flags)
- `freshness.ts` - Data age and freshness indicators
- `patterns.ts` - Time buckets and day categories
- `retry.ts` - Exponential backoff retry logic
- `security.ts` - Security-related utilities
- `time.ts` - Time formatting, durations, ISO dates
- `walking.ts` - Haversine distance, walking time calculations

### **observability/** (3 modules)
- `logger.ts` - Structured JSON logging with log levels
- `otel.ts` - OpenTelemetry SDK configuration
- `tracing.ts` - W3C tracecontext distributed tracing

### **testing/** (4 modules)
- `index.ts` - Test utility exports
- `observability-helpers.ts` - Mock tracing and logging for tests
- `security-helpers.ts` - Test authentication and security
- `test-helpers.ts` - Common test fixtures and utilities

## Public API Organization

The main entry point (`src/index.ts`) re-exports modules in logical sections:

1. **Types** - All TypeScript type definitions from `types/`
2. **Validation Schemas** - All Zod schemas from `schemas/`
3. **Constants** - MTA feed and line metadata from `constants/`
4. **Utilities** - Helper functions from `utils/`
5. **Observability** - Logging and tracing from `observability/`

## Package Configuration

```json
{
  "name": "@mta-my-way/shared",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts"
}
```

**Special exports for testing:**
- `./testing/security-helpers` - Security test utilities
- `./testing/observability-helpers` - Observability test mocks
- `./testing/test-helpers` - General test utilities

## Dependencies

**Runtime:**
- `@opentelemetry/api` - OpenTelemetry tracing API
- `zod` - Schema validation

**Development:**
- `vitest` - Test runner
- `typescript` - Type checking

## Build Process

```bash
npm run build      # Compile TypeScript to dist/
npm run typecheck  # Type check without emitting
npm test          # Run all tests with vitest
```

## Usage Pattern

```typescript
// Server and web packages import from shared
import type { Station, ArrivalTime } from "@mta-my-way/shared";
import { calculateMinutesAway, getLineMetadata } from "@mta-my-way/shared";
import { tripCreateRequestSchema } from "@mta-my-way/shared";

// Test files import test utilities
import { mockLogger } from "@mta-my-way/shared/testing/observability-helpers";
```

## Key Characteristics

- **Zero runtime dependencies** (only type-level deps: Zod, OpenTelemetry API)
- **Pure TypeScript** - no runtime side effects
- **Comprehensive test coverage** - every module has `.test.ts`
- **Tree-shakeable** - ES modules with `sideEffects: false`
- **Type-safe exports** - separate `types` field in package.json
- **Testing utilities** - isolated exports for test helpers

## File Count Summary

- **Source files (.ts):** 47 files
- **Test files (.test.ts):** 33 files  
- **Total modules:** 15 directories + main index
- **Exported types:** ~80+ TypeScript types
- **Exported utilities:** ~60+ functions
- **Validation schemas:** ~30+ Zod schemas
