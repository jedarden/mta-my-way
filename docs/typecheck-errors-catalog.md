# TypeScript Errors Catalog
**Generated:** 2026-08-27
**Command:** `npm run typecheck` (tsc --build)
**Exit Code:** 0 ⚠️ (Expected 1, but passed - may be configured to not fail)

## Summary
- **Total Errors:** 703 errors across 54 files
- **Most Common Error Types:**
  1. TS2322 (Type not assignable): ~190 errors
  2. TS2739 (Missing properties): ~140 errors
  3. TS2345 (Type not assignable): ~85 errors
  4. TS2532 (Object possibly undefined): ~90 errors
  5. TS6133 (Unused variable): ~40 errors

---

## Error Counts by Type

| Error Code | Count | Description |
|------------|-------|-------------|
| TS2322 | 190 | Type 'X' is not assignable to type 'Y' |
| TS2739 | 140 | Type is missing properties from type |
| TS2345 | 85 | Argument of type 'X' is not assignable to parameter of type 'Y' |
| TS2532 | 90 | Object is possibly 'undefined' |
| TS6133 | 40 | Variable is declared but its value is never read |
| TS4104 | 15 | readonly array cannot be assigned to mutable type |
| TS2339 | 12 | Property does not exist on type |
| TS18048 | 8 | Value is possibly 'undefined' |
| TS2451 | 4 | Cannot redeclare block-scoped variable |
| TS2552 | 4 | Cannot find name |
| TS2741 | 4 | Property is missing from type |
| TS2488 | 1 | Type must have a '[Symbol.iterator]()' method |
| TS2786 | 1 | Cannot be used as a JSX component |
| TS7006 | 1 | Parameter implicitly has an 'any' type |
| TS2367 | 1 | Comparison appears to be unintentional |
| TS2554 | 1 | Expected N arguments, but got M |
| TS2352 | 1 | Conversion of type may be a mistake |
| TS2304 | 3 | Cannot find name |
| TS2305 | 1 | Module has no exported member |

---

## Affected Files by Package

### packages/server/src/ (16 errors)
- `app.ts` - 13 errors (TS6133:1, TS2451:4, TS2345:3, TS2552:4)
- `middleware/cookie-security.ts` - 2 errors (TS2339:1, TS18048:1)
- `middleware/dynamic-rbac-cache.ts` - 2 errors (TS2322:1, TS2532:1)
- `middleware/enhanced-authentication.ts` - 1 error (TS2322:1)
- `middleware/enhanced-jwt-security.ts` - 1 error (TS2322:1)
- `middleware/http-request-smuggling.ts` - 1 error (TS2345:1)
- `middleware/http-response-splitting.ts` - 1 error (TS2345:1)
- `middleware/security-headers.ts` - 5 errors (TS18048:3, TS2322:2)
- `middleware/subresource-integrity.ts` - 1 error (TS2322:1)
- `migration/cli.ts` - 1 error (TS2322:1)
- `migration/migration.ts` - 1 error (TS2339:1)
- `migration/validation.ts` - 3 errors (TS2339:1, TS2345:1, TS18046:1)
- `push/briefing.ts` - 3 errors (TS2339:2, TS2488:1)
- `push/index.ts` - 2 errors (TS2339:1, TS2345:1)
- `trip-tracking.ts` - 2 errors (TS6133:1, TS2740:1)

### packages/web/src/components/alerts/ (176 errors)
- `AlertBanner.test.tsx` - 58 errors (mostly TS2322, TS2532 - StationAlert type mismatches)
- `AlertCard.test.tsx` - 60 errors (mostly TS2739 - missing source/cause/effect props)
- `AlertList.test.tsx` - 26 errors (TS2322, TS2739, TS4104 - missing props)
- `ShuttleInfo.test.tsx` - 32 errors (TS2739 - missing lineId/fromStopId/toStopId)

### packages/web/src/components/arrivals/ (88 errors)
- `ArrivalList.test.tsx` - 64 errors (TS2322 - missing feedName property)
- `ArrivalRow.test.tsx` - 24 errors (TS2741 - missing feedName property)

### packages/web/src/components/common/ (2 errors)
- `DataState.test.tsx` - 1 error (TS6133)
- `ErrorBoundary.test.tsx` - 2 errors (TS2488, TS2786)

### packages/web/src/components/equipment/ (33 errors)
- `EquipmentBanner.test.tsx` - 33 errors (TS2739: missing stationId/isActive, TS4104: readonly arrays)

### packages/web/src/components/favorites/ (40 errors)
- `FavoritesList.test.tsx` - 40 errors (TS2322, TS2532 - Favorite type mismatches)

### packages/web/src/components/health/ (43 errors)
- `DataHealth.test.tsx` - 23 errors (TS2322, TS2739, TS4104 - FeedHealthInfo type issues)
- `LineStatusTile.test.tsx` - 20 errors (TS2741, TS6133 - missing updatedAt property)

### packages/web/src/components/layout/ (1 error)
- `Screen.test.tsx` - 1 error (TS6133)

### packages/web/src/components/trip/ (4 errors)
- `TripTracker.test.tsx` - 4 errors (TS2532)

### packages/web/src/hooks/ (237 errors)
- `useAlerts.test.ts` - 9 errors
- `useAlerts.ts` - 1 error (TS2367)
- `useArrivals.test.ts` - 1 error (TS6133)
- `useContextSort.test.ts` - 39 errors (TS2322, TS2532)
- `useEquipment.test.ts` - 1 error (TS2345)
- `useErrorHandler.test.ts` - 1 error (TS2345)
- `useGeofence.test.ts` - 1 error (TS2532)
- `useGeolocation.test.ts` - 2 errors (TS6133, TS2345)
- `useInferredTrips.test.ts` - 7 errors (TS2345, TS6133)
- `useIntersectionObserver.test.ts` - 1 error (TS6133)
- `useMorningBriefing.test.ts` - 19 errors (TS2345, TS2532)
- `useOfflineCountdown.test.ts` - 5 errors (TS2532, TS6133)
- `usePositions.test.ts` - 23 errors (TS2345, TS2532, TS2339)
- `usePrefetch.test.ts` - 6 errors (TS6133, TS2345)
- `usePushNotifications.test.ts` - 3 errors (TS6133)
- `useStaleness.test.ts` - 1 error (TS6133)
- `useTripTracker.test.ts` - 25 errors (TS2345, TS2322, TS2554, TS2352)
- `useTripTracker.ts` - 3 errors (TS2345)

### packages/web/src/lib/ (29 errors)
- `api.test.ts` - 12 errors (TS18048, TS2532, TS2345)
- `apiCached.test.ts` - 1 error (TS2345)
- `apiEnhanced.test.ts` - 10 errors (TS2305, TS6133, TS18048, TS2345)
- `backgroundSync.test.ts` - 10 errors (TS2559, TS2304, TS2339, TS18048, TS2532)
- `backgroundSync.ts` - 3 errors (TS2304, TS2339)
- `prefetch.ts` - 2 errors (TS2339)
- `serviceWorkerRegistration.test.ts` - 6 errors (TS2339)

### packages/web/src/screens/ (14 errors)
- `HomeScreen.test.tsx` - 14 errors (TS6133, TS2345, TS2322)

### packages/web/src/stores/ (1 error)
- `fareStore.ts` - 1 error (TS6133)

---

## Key Issues by Category

### 1. Missing Properties in Test Fixtures (~400 errors)
**Pattern:** Test objects missing required properties after type definitions were updated

**Affected Types:**
- `StationAlert` - missing `source`, `cause`, `effect` (60 errors in AlertCard.test.tsx)
- `ShuttleBusInfo` - missing `lineId`, `fromStopId`, `toStopId` (32 errors)
- `ArrivalTime` - missing `feedName` (88 errors across arrival tests)
- `EquipmentStatus` - missing `stationId`, `isActive` (33 errors)
- `Favorite` - missing `lines`, `direction`, `sortOrder` (40 errors)
- `FeedHealthInfo` - missing 6+ properties (23 errors)
- `LineHealthStatus` - missing `updatedAt` (20 errors)
- `TripData` - missing 6+ properties (25 errors)
- `LineDiagramData` - missing `routeId`, `routeColor`, `computedAt` (23 errors)
- `InterpolatedTrainPosition` - missing `routeId`, `destination`, `isExpress` (9 errors)

**Fix Required:** Update test fixtures to include all required properties

---

### 2. Possibly Undefined Values (~100 errors)
**Pattern:** Not handling undefined/null values from arrays or optional properties

**Common Locations:**
- `packages/web/src/hooks/` - Array access without bounds checking
- `packages/web/src/lib/api*.test.ts` - Mock call args not validated
- `packages/web/src/components/` - Object property access on optional fields

**Fix Required:** Add proper null checks and type guards

---

### 3. Unused Variables (~40 errors)
**Pattern:** Variables declared but never used (mostly in tests)

**Examples:**
- `waitFor` imported from test helpers but not called
- `container` destructured from render but never referenced
- `result` variable assigned but never read

**Fix Required:** Remove unused imports/variables or prefix with `_`

---

### 4. Readonly Array Assignments (~15 errors)
**Pattern:** Trying to assign readonly test arrays to mutable parameters

**Locations:**
- `AlertList.test.tsx` - 6 errors
- `DataHealth.test.tsx` - 2 errors
- `EquipmentBanner.test.tsx` - 5 errors

**Fix Required:** Either use `as Mutable<>` cast or change parameter types

---

### 5. Server-Side Issues (16 errors)
**Critical Issues:**
- `app.ts` - Variable redeclaration (`CORE_ONLY` declared 4 times)
- `app.ts` - Missing `preferencesRoutes` (should be `buildPreferencesRoutes`)
- Various middleware - Type mismatches and missing properties

---

### 6. Missing Dependencies (7 errors)
**Locations:**
- `backgroundSync.test.ts` - `SyncRegistration` not found (3 errors)
- `apiEnhanced.test.ts` - `act` not exported from 'vitest'
- `serviceWorkerRegistration.test.ts` - Mock properties don't exist

---

## Recommended Fix Priority

### P0 - Blocking Issues (Fix First)
1. **Variable Redeclaration** (`TS2451`): `packages/server/src/app.ts` - `CORE_ONLY` declared 4 times
2. **Missing Name** (`TS2552`): `packages/server/src/app.ts` - `preferencesRoutes` should be `buildPreferencesRoutes`
3. **Missing Dependencies**: `SyncRegistration`, `act` from vitest

### P1 - High Volume Test Fixtures
1. Update `StationAlert` fixtures (60 errors)
2. Update `ArrivalTime` fixtures with `feedName` (88 errors)
3. Update `Favorite` fixtures (40 errors)
4. Update `ShuttleBusInfo` fixtures (32 errors)

### P2 - Type Safety Issues
1. Add null checks for array/object access (~100 errors)
2. Fix readonly array assignments (~15 errors)
3. Remove unused variables (~40 errors)

### P3 - Library/API Integration
1. Fix background sync type issues
2. Fix service worker registration mocks
3. Fix trip tracker state updates

---

## Notes
- **Exit code 0 unexpected:** The typecheck passed despite 703 errors. Check `tsconfig.json` for `"noEmitOnError": false` or similar settings.
- **Test fixture bulk:** Most errors are in test files where fixture objects need to be updated to match tightened type definitions.
- **Source files relatively clean:** Only 16 errors in `packages/server/src/` non-test files.
