# TypeScript Typecheck Errors Report

**Generated:** 2026-08-27
**Command:** `npm run typecheck` (tsc --build)
**Exit Code:** 1 (as expected - errors present)
**Total Errors:** 702

## Error Summary by Type

| Error Code | Count | Description |
|------------|-------|-------------|
| TS2322 | 120 | Type 'X' is not assignable to type 'Y' |
| TS2739 | 87 | Type is missing properties from type |
| TS2345 | 70 | Argument of type 'X' is not assignable to parameter of type 'Y' |
| TS2741 | 58 | Property is missing in type but required in type |
| TS2532 | 49 | Object is possibly 'undefined' or 'null' |
| TS6133 | 44 | Variable is declared but its value is never read |
| TS18048 | 29 | Variable is possibly 'undefined' or 'null' |
| TS2339 | 22 | Property does not exist on type |
| TS4104 | 16 | Type is 'readonly' and cannot be assigned to mutable type |
| TS2552 | 4 | Cannot find name |
| TS2451 | 4 | Cannot redeclare block-scoped variable |
| TS7006 | 2 | Parameter implicitly has 'any' type |
| TS2488 | 2 | Type must have a '[Symbol.iterator]()' method |
| TS2304 | 2 | Cannot find name |
| TS2786 | 1 | Cannot be used as a JSX component |
| TS2740 | 1 | Type is missing properties |
| TS2559 | 1 | Type has no properties in common with type |
| TS2556 | 1 | A spread argument must either have a tuple type or be passed to a rest parameter |
| TS2554 | 1 | Expected N arguments, but got M |
| TS2367 | 1 | This comparison appears to be unintentional because the types have no overlap |
| TS2352 | 1 | Conversion of type may be a mistake |
| TS2305 | 1 | Module has no exported member |
| TS18046 | 1 | Variable is of type 'unknown' |

## Affected Files Summary

**Total Files with Errors:** 59

### Packages with Highest Error Counts

#### packages/web/src/hooks/useContextSort.test.ts (42 errors)
- Pattern: Type incompatibility with `never` type arrays
- Issues: Test fixtures not matching expected types

#### packages/web/src/components/health/LineStatusTile.test.tsx (39 errors)
- Pattern: Missing `updatedAt` property in `LineHealthStatus` test fixtures
- Issues: Incomplete test mock objects

#### packages/web/src/components/favorites/FavoritesList.test.tsx (35 errors)
- Pattern: Missing required properties (`lines`, `direction`, `sortOrder`) in `Favorite` type
- Issues: Test fixtures using old type definition

#### packages/web/src/components/arrivals/ArrivalList.test.tsx (35 errors)
- Pattern: Missing `feedName` property in `ArrivalTime` type
- Issues: Test fixtures not updated with new required field

#### packages/web/src/components/alerts/AlertCard.test.tsx (35 errors)
- Pattern: Missing `source`, `cause`, `effect` properties in `StationAlert` type
- Issues: Alert test fixtures incomplete

#### packages/web/src/components/arrivals/ArrivalRow.test.tsx (28 errors)
- Pattern: Missing `feedName` property
- Issues: Arrival test fixtures incomplete

#### packages/web/src/components/equipment/EquipmentBanner.test.tsx (24 errors)
- Pattern: Missing `stationId`, `isActive` properties and readonly array assignments
- Issues: Equipment status test fixtures incomplete

#### packages/web/src/components/alerts/AlertBanner.test.tsx (24 errors)
- Pattern: Type 'undefined' not assignable to `StationAlert`
- Issues: Alert handling needs null checks

#### packages/web/src/components/alerts/ShuttleInfo.test.tsx (22 errors)
- Pattern: Missing `lineId`, `fromStopId`, `toStopId` in `ShuttleBusInfo`
- Issues: Shuttle info test fixtures incomplete

#### packages/web/src/components/health/DataHealth.test.tsx (19 errors)
- Pattern: Missing multiple properties in `FeedHealthInfo` type
- Issues: Feed health test fixtures incomplete

## Error Categories

### 1. Missing Required Properties in Test Fixtures (~300+ errors)
The largest category of errors is incomplete test fixtures that don't match updated type definitions:

- **ArrivalTime**: Missing `feedName` property
- **StationAlert**: Missing `source`, `cause`, `effect` properties  
- **Favorite**: Missing `lines`, `direction`, `sortOrder` properties
- **LineHealthStatus**: Missing `updatedAt` property
- **ShuttleBusInfo**: Missing `lineId`, `fromStopId`, `toStopId` properties
- **FeedHealthInfo**: Missing `lastPollAt`, `consecutiveFailures`, `entityCount`, `lastError`, `errorCount24h` properties
- **EquipmentStatus**: Missing `stationId`, `isActive` properties

### 2. Null/Undefined Safety Issues (~80 errors)
TypeScript's strict null checks catching potential runtime errors:

- **TS2532** (49): Object is possibly 'undefined'
- **TS18048** (29): Variable is possibly 'undefined' or 'null'

### 3. Type Assignability Issues (~200 errors)
Type incompatibilities between expected and actual types:

- **TS2322** (120): Type 'X' is not assignable to type 'Y'
- **TS2739** (87): Type is missing properties
- **TS2345** (70): Argument type not assignable to parameter

### 4. Unused Variables (44 errors)
Code cleanup issues - variables declared but never used:

- **TS6133** (44): Variable is declared but its value is never read

### 5. Readonly Type Mutations (16 errors)
Attempting to assign readonly arrays to mutable types:

- **TS4104** (16): Type is 'readonly' and cannot be assigned to mutable type

### 6. Server-Side Issues (~40 errors)
Backend-specific errors in packages/server:

- **packages/server/src/app.ts** (12 errors):
  - Duplicate `CORE_ONLY` variable declarations (4x TS2451)
  - Type mismatches in route mounting (3x TS2345)
  - Missing `preferencesRoutes` references (4x TS2552)

- **packages/server/src/push/** (5 errors): Promise handling issues
- **packages/server/src/middleware/** (14 errors): Various type safety issues
- **packages/server/src/migration/** (7 errors): Type compatibility issues

### 7. Missing Type Definitions and Imports (7 errors)
- **TS2304** (2): Cannot find name (`SyncRegistration`)
- **TS2305** (1): Module has no exported member ('act' from 'vitest')

## Key Issues Requiring Attention

### High Priority
1. **CORE_ONLY Redeclarations** (4x): Duplicate variable declarations in app.ts lines 1994, 2159, 2927, 3043
2. **preferencesRoutes Missing** (4x): Undefined references in app.ts lines 3101, 3104, 3107, 3110
3. **SyncRegistration Missing** (2x): Type definition missing in backgroundSync
4. **Type System Changes**: Many test fixtures need updates to match new required properties

### Medium Priority
5. **Null Safety**: ~80 null/undefined checks needed
6. **Test Fixture Updates**: ~300+ test mocks need property additions
7. **Promise Handling**: Fix async/await issues in push notification code

### Low Priority  
8. **Unused Variables**: 44 cleanup items (mostly in tests)
9. **Readonly Arrays**: 16 assignments need `.slice()` or mutability changes
10. **Import Cleanup**: 1 bad import ('act' from 'vitest')

## Files by Package

### packages/web/src (57 files, ~640 errors)
- **hooks/**: 13 test files, ~200 errors
- **components/**: 17 test files, ~280 errors
- **screens/**: 1 test file, 11 errors
- **lib/**: 6 test files, ~60 errors
- **stores/**: 1 source file, 1 error

### packages/server/src (11 files, ~62 errors)
- **app.ts**: 12 errors
- **middleware/**: 6 files, ~30 errors
- **push/**: 2 files, 5 errors
- **migration/**: 3 files, 7 errors
- **trip-tracking.ts**: 2 errors

## Recommendations

### Immediate Actions
1. Fix duplicate `CORE_ONLY` declarations in app.ts
2. Restore missing `preferencesRoutes` or remove references
3. Add `SyncRegistration` type definition
4. Remove invalid 'act' import from vitest

### Short-term Fixes
5. Update test fixture generators to include new required properties
6. Add null/undefined guards where appropriate
7. Fix Promise handling in push notification code

### Long-term Cleanup
8. Remove unused variables and imports
9. Consider making some test properties optional if appropriate
10. Update test utilities to generate complete fixture objects

## Detailed Error List

A complete line-by-line listing of all 702 errors is available in:
`/home/coding/.claude/projects/-home-coding-mta-my-way/94b04dcc-918d-493f-b272-3f4f5070eaf7/tool-results/bqbhcw3tq.txt`

---

**Next Steps:**
1. Prioritize server-side fixes (app.ts CORE_ONLY and preferencesRoutes)
2. Batch update test fixtures for common type requirements
3. Add missing type definitions (SyncRegistration)
4. Incrementally fix null safety issues
