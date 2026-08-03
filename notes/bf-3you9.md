# Server-Side Context Implementation Audit

## Executive Summary

This audit documents the complete server-side context implementation for the MTA My Way application. The context-aware switching feature (Phase 5) is implemented across multiple layers including database, service layer, API routes, and metrics.

**Status**: The feature is DISABLED and unused by the frontend (confirmed in Child 1 bead bf-2s0ga).

## 1. Core Service Implementation

### File: `packages/server/src/context-service.ts` (617 lines)

**Purpose**: Core context detection and management service

**Key Exports**:
- `initContextService(database, stationData)` - Initialize service
- `getCurrentContext()` - Get current context state  
- `getContextSettings()` - Get context settings
- `updateContextSettings(settings)` - Update settings
- `detectAndUpdateContext(params)` - Detect and update context
- `detectAndUpdateContextWithOwner(params, ownerId)` - Owner-scoped detection
- `getContextByOwner(ownerId)` - Get context for specific owner
- `getContextTransitions(limit)` - Get recent transitions
- `getContextTransitionsByOwner(ownerId, limit)` - Get owner's transitions
- `getContextTransitionsForOwner(ownerId, requestingOwnerId, limit)` - Ownership-checked
- `detectContextFromRequest(params)` - Detect from API request
- `setManualContext(context)` - Set manual override
- `clearManualOverride()` - Clear override
- `clearManualOverrideForOwner(ownerId)` - Owner-scoped clear
- `getContextSummary()` - Get full API response
- `deleteContextsByOwner(ownerId)` - Delete all contexts for owner
- `getCurrentContextUIHints()` - Get UI hints
- `getCurrentContextLabel()` - Get display label
- `getCurrentContextIcon()` - Get icon name

**Internal Functions**:
- `loadCurrentContext()` - Load from database
- `saveContextState(state, ownerId)` - Save to database
- `recordContextTransition(from, to, params)` - Record transition
- `haversineDistance(lat1, lon1, lat2, lon2)` - Calculate distance

**Constants**:
- `DEFAULT_OWNER_ID = "anonymous"` - Default owner for legacy/unauthenticated data
- `DEFAULT_CONTEXT` - Default context state object

**Context Types**: `'commuting' | 'planning' | 'reviewing' | 'idle' | 'at_station'`
**Confidence Levels**: `'low' | 'medium' | 'high'`
**Trigger Types**: `'location' | 'time' | 'pattern' | 'activity' | 'manual'`

## 2. Database Schema

### Migration: `packages/server/src/migration/migrations/016-add-trips-table.ts`

**Table: `user_context`**
```sql
CREATE TABLE IF NOT EXISTS user_context (
  id TEXT PRIMARY KEY,
  context TEXT NOT NULL CHECK(context IN ('commuting', 'planning', 'reviewing', 'idle', 'at_station')),
  confidence TEXT NOT NULL CHECK(confidence IN ('low', 'medium', 'high')),
  factors_json TEXT NOT NULL,
  detected_at INTEGER NOT NULL,
  is_manual_override INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)
```

**Table: `context_transitions`**
```sql
CREATE TABLE IF NOT EXISTS context_transitions (
  id TEXT PRIMARY KEY,
  from_context TEXT NOT NULL,
  to_context TEXT NOT NULL,
  triggered_at INTEGER NOT NULL,
  trigger TEXT NOT NULL CHECK(trigger IN ('location', 'time', 'pattern', 'activity', 'manual')),
  factors_json TEXT
)
```

**Indexes**:
- `idx_context_detected_at ON user_context(detected_at)`
- `idx_context_transitions_triggered_at ON context_transitions(triggered_at)`

### Migration: `packages/server/src/migration/migrations/017-add-resource-ownership.ts`

**Adds ownership support**:
- `ALTER TABLE user_context ADD COLUMN owner_id TEXT`
- `CREATE INDEX idx_user_context_owner_id ON user_context(owner_id)`

**Data Retention**:
- Keeps last 100 context states (auto-deletes older)
- Keeps last 1000 transitions (auto-deletes older)

## 3. API Routes

### File: `packages/server/src/app.ts`

All routes are under `/api/context/*` and have:
- `requireSameOrigin()` middleware applied
- CSRF protection excluded (line 500: `// "/api/context"`)
- Owner-scoped access control

#### Route 1: `GET /api/context` (lines 2304-2346)
**Purpose**: Get current context and UI hints
**Auth**: Optional (uses `ownerId = auth?.keyId || "anonymous"`)
**Response**: `{ current, settings, uiHints, label, icon, recentTransitions }`
**Access**: 
- Admins see global context
- Regular users see their own context or default

#### Route 2: `GET /api/context/owner/:ownerId` (lines 2349-2381)
**Purpose**: Get context for specific owner with ownership check
**Auth**: `requireOwnershipOrAdmin("context")` 
**Response**: `{ current, settings, uiHints, label, icon, recentTransitions }`
**Access**: Only owner or admin

#### Route 3: `POST /api/context/detect` (lines 2384-2434)
**Purpose**: Detect context from request parameters
**Auth**: `requireResourceAccess("context", "create")` + `requirePermission("predictions:create")`
**Request Schema**: `contextDetectRequestSchema`
**Body**: `{ latitude?, longitude?, currentScreen?, screenTime?, recentActions? }`
**Response**: `{ context }`
**Uses**: `detectContextFromRequest()` + `detectAndUpdateContextWithOwner()`

#### Route 4: `POST /api/context/override` (lines 2437-2471)
**Purpose**: Set manual context override
**Auth**: `requireResourceAccess("context", "update")` + `requirePermission("predictions:create")` + `auditLogAccess("context", "update")`
**Request Schema**: `contextOverrideRequestSchema`
**Body**: `{ context }`
**Response**: `{ success: true, context }`

#### Route 5: `POST /api/context/clear` (lines 2474-2495)
**Purpose**: Clear manual context override
**Auth**: `requireResourceAccess("context", "update")` + `requirePermission("predictions:create")` + `auditLogAccess("context", "update")`
**Request Schema**: `contextClearRequestSchema`
**Response**: `{ success: true, context }`

#### Route 6: `PATCH /api/context/settings` (lines 2498-2516)
**Purpose**: Update context settings (admin only)
**Auth**: `requireRole("admin")` + `requireAdmin()` + `auditLogAccess("context", "update")`
**Request Schema**: `contextSettingsUpdateRequestSchema`
**Response**: `{ success: true, settings }`

## 4. Request/Response Schemas

### From `@mta-my-way/shared` package (imported in app.ts lines 44-46):

- `contextClearRequestSchema` - Validation for `/api/context/clear`
- `contextDetectRequestSchema` - Validation for `/api/context/detect`
- `contextOverrideRequestSchema` - Validation for `/api/context/override`
- `contextSettingsUpdateRequestSchema` - Validation for `/api/context/settings`

## 5. Metrics Integration

### File: `packages/server/src/observability/metrics.ts`

**Metrics Counters**:
```typescript
export const contextDetections = metrics.counter(
  "context_detections_total",
  "Total context detections"
);
export const contextTransitions = metrics.counter(
  "context_transitions_total", 
  "Total context state transitions"
);
export const contextOverrides = metrics.counter(
  "context_overrides_total",
  "Total manual context overrides"
);
```

### File: `packages/server/src/middleware/metrics.ts`

**Metric Recording Functions**:
- `recordContextDetection(context: string, confidence: string)`
- `recordContextTransition(fromContext: string, toContext: string)`
- `recordContextOverride(context: string)`

## 6. Initialization & Dependencies

### File: `packages/server/src/index.ts`

**Initialization** (line 25):
```typescript
import { initContextService } from "./context-service.js";
```

**Called during server startup** with database and station data.

### Files that import/use context-service.ts:

1. **packages/server/src/index.ts** - Imports and calls `initContextService()`
2. **packages/server/src/app.ts** - Imports 12+ functions for API routes
3. **packages/server/src/context-service.ts** - The service itself
4. **packages/server/src/index.test.ts** - Tests
5. **packages/server/src/integration/test-helpers.ts** - Test helpers

### Shared Utility Functions Used:

From `@mta-my-way/shared` package (imported in context-service.ts):
- `detectContext()` - Context detection logic
- `getContextIcon()` - Get icon for context
- `getContextLabel()` - Get display label
- `getContextUIHints()` - Get UI hints
- `shouldTriggerUIRefresh()` - Check if UI should refresh

## 7. No Scheduled Jobs or Background Services

**Finding**: No scheduled jobs or background services depend on these tables.

The context system is:
- Request-driven (only updates via API calls)
- No cron jobs or schedulers reference context tables
- No background workers poll or process context data

## 8. Security & Access Control

### RBAC Permissions Required:
- `predictions:create` - For detect, override, clear operations
- `commutes:create` - Not directly used but mentioned in app.ts
- Admin role - For settings updates

### Ownership Model:
- All context data is scoped to `ownerId`
- `ownerId = auth?.keyId || "anonymous"` 
- Admins can see all contexts, regular users only their own
- Migration 017 added `owner_id` column with index

### Audit Logging:
- `auditLogAccess("context", "update")` on override and clear operations
- No audit on detect or read operations

## 9. Complete Removal Scope (Path A)

If removing the feature entirely, these items would be deleted:

### Code Files:
1. `packages/server/src/context-service.ts` (617 lines)
2. Context-related imports and functions in `packages/server/src/app.ts` (~220 lines)
3. `initContextService()` call in `packages/server/src/index.ts`

### Database Migrations:
1. `packages/server/src/migration/migrations/016-add-trips-table.ts` - Context table DDL
2. `packages/server/src/migration/migrations/017-add-resource-ownership.ts` - Owner ID additions

**Note**: Migration 016 also creates `trips` and `commute_stats` tables which ARE used by the journal feature. Would need to split this migration.

### Database Tables & Indexes:
1. `user_context` table
2. `context_transitions` table
3. `idx_context_detected_at` index
4. `idx_context_transitions_triggered_at` index
5. `idx_user_context_owner_id` index

### API Routes:
All 6 routes under `/api/context/*`

### Metrics:
1. `context_detections_total` counter
2. `context_transitions_total` counter  
3. `context_overrides_total` counter
4. `recordContextDetection()` function
5. `recordContextTransition()` function
6. `recordContextOverride()` function

### Shared Utilities:
From `@mta-my-way/shared` package:
- `detectContext()` function
- `getContextIcon()` function
- `getContextLabel()` function
- `getContextUIHints()` function
- `shouldTriggerUIRefresh()` function
- Related type definitions

### Validation Schemas:
From `@mta-my-way/shared` package:
- `contextClearRequestSchema`
- `contextDetectRequestSchema`
- `contextOverrideRequestSchema`
- `contextSettingsUpdateRequestSchema`

## 10. Documentation Scope (Path B)

If keeping the code but documenting as unused:

### Documentation Updates Needed:
1. Add `@deprecated` tags to all context-service exports
2. Add comments to `/api/context/*` routes explaining they're disabled
3. Document that CSRF exclusion was intentional (line 500 in app.ts)
4. Add architecture decision record (ADR) explaining Phase 5 context feature was built but not integrated

### Runtime Impact:
- Zero runtime impact if feature remains unused
- No scheduled jobs or background services
- No frontend integration (confirmed in bead bf-2s0ga)
- Database tables remain but unused

### Maintenance Burden:
- Migration files add complexity to schema changes
- Service code (~617 lines) must be maintained
- API routes must pass security reviews
- Metrics add noise to monitoring

## Summary Statistics

- **Total Lines of Code**: ~1,000+ (including comments, types, tests)
- **Database Tables**: 2 (user_context, context_transitions)
- **API Routes**: 6 (all under `/api/context/*`)
- **Metrics Counters**: 3
- **Migration Files**: 2 (016, 017)
- **Dependencies**: 5+ utility functions from shared package
- **Security Permissions**: 2 (`predictions:create`, admin role)
- **Background Jobs**: 0

---

**Audit Completed**: 2026-08-03  
**Bead ID**: bf-3you9  
**Confirmation**: Feature is unused by frontend (see bead bf-2s0ga)
