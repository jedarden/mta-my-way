# Typecheck Error Catalog

**Generated:** 2026-08-27  
**Command:** `npm run typecheck` (tsc --build)  
**Exit Code:** 1 (expected - errors found)

## Summary

| Metric | Count |
|--------|-------|
| **Total Errors** | **703** |
| **Files Affected** | 49 |
| **Packages** | 2 (server, web) |

## Error Breakdown by Type

| Error Code | Description | Count | % |
|------------|-------------|-------|---|
| TS2739 | Missing properties in object type | 201 | 28.6% |
| TS2345 | Type not assignable (argument mismatch) | 134 | 19.1% |
| TS2322 | Type not assignable (variable mismatch) | 111 | 15.8% |
| TS6133 | Variable declared but never used | 51 | 7.3% |
| TS2532 | Object is possibly 'undefined' | 76 | 10.8% |
| TS2741 | Missing property in object literal | 42 | 6.0% |
| TS4104 | Readonly type to mutable assignment | 14 | 2.0% |
| TS2339 | Property does not exist on type | 13 | 1.8% |
| TS18048 | Value possibly 'undefined'/'null' | 29 | 4.1% |
| TS2552 | Cannot find name | 5 | 0.7% |
| TS2451 | Cannot redeclare block-scoped variable | 4 | 0.6% |
| TS2556 | Spread argument type error | 1 | 0.1% |
| TS7006 | Parameter implicitly has 'any' type | 4 | 0.6% |
| TS2488 | Type must have iterator method | 2 | 0.3% |
| TS2786 | Not a valid JSX component | 1 | 0.1% |
| TS2367 | Comparison appears unintentional | 1 | 0.1% |
| TS2352 | Type conversion may be mistake | 1 | 0.1% |
| TS2554 | Expected 1 arguments, but got 3 | 1 | 0.1% |
| TS2305 | Module has no exported member | 1 | 0.1% |
| TS2304 | Cannot find name | 3 | 0.4% |
| TS2740 | Type missing properties from Promise | 1 | 0.1% |

## Affected Files

### Server Package (packages/server/src/)

| File | Error Count |
|------|--------------|
| `app.ts` | 13 |
| `middleware/cookie-security.ts` | 2 |
| `middleware/dynamic-rbac-cache.ts` | 2 |
| `middleware/enhanced-authentication.ts` | 1 |
| `middleware/enhanced-jwt-security.ts` | 1 |
| `middleware/http-request-smuggling.ts` | 1 |
| `middleware/http-response-splitting.ts` | 1 |
| `middleware/security-headers.ts` | 7 |
| `middleware/subresource-integrity.ts` | 1 |
| `migration/cli.ts` | 1 |
| `migration/migration.ts` | 1 |
| `migration/validation.ts` | 3 |
| `push/briefing.ts` | 3 |
| `push/index.ts` | 2 |
| `trip-tracking.ts` | 2 |

**Server Subtotal:** 40 errors

### Web Package (packages/web/src/)

| Directory | Files | Error Count |
|-----------|-------|-------------|
| `components/alerts/` | 3 files | 74 |
| `components/arrivals/` | 3 files | 103 |
| `components/common/` | 2 files | 5 |
| `components/equipment/` | 1 file | 29 |
| `components/favorites/` | 1 file | 42 |
| `components/health/` | 2 files | 56 |
| `components/layout/` | 1 file | 1 |
| `components/trip/` | 1 file | 4 |
| `hooks/` | 22 test files + 1 ts file | 244 |
| `lib/` | 7 files | 48 |
| `screens/` | 1 file | 12 |
| `stores/` | 1 file | 1 |

**Web Subtotal:** 663 errors

## Error Categories

### 1. Test Fixtures Missing Required Properties (TS2739, TS2741) - ~43%

Most test files use incomplete mock objects that don't match updated type definitions. Common issues:
- Missing `updatedAt`, `source`, `cause`, `effect` in `StationAlert`
- Missing `feedName` in `ArrivalTime`
- Missing `stationId`, `isActive` in `EquipmentStatus`
- Missing properties in `LineHealthStatus`, `FeedHealthInfo`, `ShuttleBusInfo`
- Missing `lines`, `direction`, `sortOrder` in `Favorite`

### 2. Unused Variables (TS6133) - 7.3%

Imported test utilities and variables declared but never used:
- `waitFor`, `afterEach`, `act` from test libraries
- `container` DOM elements
- `result` variables from hook returns
- Mock helper functions

### 3. Type Assignment Issues (TS2345, TS2322) - ~35%

- Missing properties in mock state objects for Zustand stores
- Incomplete `TripData`, `LineDiagramData`, `InterpolatedTrainPosition` objects
- Type mismatches in hook return values
- Store state objects missing methods (e.g., `FavoritesState` missing `addFavorite`, `updateFavorite`, etc.)

### 4. Null/Undefined Safety (TS2532, TS18048) - ~15%

- Array/object access without null checks
- Optional property access without validation
- `undefined` passed where non-nullable expected

### 5. Other Issues - ~5%

- Missing `toJSON` method in GeolocationPosition mocks
- Readonly array literals assigned to mutable arrays
- Module import errors (vitest `act` not found)
- Duplicate variable declarations (`CORE_ONLY`)
- Property access on non-existent types

## Priority Recommendations

### High Priority (Blocking Type Safety)

1. **Update test fixture factories** - Create proper mock builders that include all required properties
2. **Fix store mock objects** - Ensure Zustand store mocks include all methods
3. **Add null guards** - Proper optional chaining and null checks

### Medium Priority

4. **Remove unused imports** - Clean up test file imports
5. **Fix duplicate declarations** - Resolve `CORE_ONLY` redeclaration issues
6. **Update type definitions** - Ensure types match runtime expectations

### Low Priority

7. **Fix readonly array assignments** - Use proper typing for test arrays
8. **Update module imports** - Fix `vitest` imports
9. **Add missing properties** - Update incomplete interface implementations

## Exit Code

**Expected and confirmed:** Exit code 1 (TypeScript compilation with errors)

---

*This catalog represents a complete snapshot of all typecheck errors as of 2026-08-27*
