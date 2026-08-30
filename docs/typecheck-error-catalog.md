# TypeScript Error Catalog

Generated: 2026-08-30  
Source Data: `docs/typecheck-raw-output.txt`

## Exit Status

**Exit Code: 1** (TypeScript compilation failed with errors)

## Executive Summary

| Metric | Value |
|--------|-------|
| **Total Unique Files Affected** | 47 |
| **Total Error Types** | 19 distinct error codes |
| **Total Errors (by Type)** | 447 |
| **Total Errors (by File)** | 680 |
| **Most Affected File** | `packages/web/src/hooks/useContextSort.test.ts` (42 errors) |
| **Most Common Error** | TS2322 - Type not assignable (116 occurrences) |

> **Note on Error Count Discrepancy:** The two analysis methods show different totals (447 vs 680 errors). This may result from:
> - Different counting methodologies in the source analysis
> - Multi-line or compound errors being counted differently
> - Some errors appearing in multiple categorizations
> 
> The conservative count (447) represents unique error instances by type, while 680 may represent individual file-level occurrences.

---

## Error Type Breakdown

### High-Frequency Errors (50+ occurrences)

| Error Code | Count | Severity | Description | Primary Location |
|------------|-------|----------|-------------|------------------|
| **TS2322** | 116 | High | Type not assignable to target type | Test mocks, middleware |
| **TS2739** | 87 | High | Type missing required properties | Test fixtures |
| **TS2345** | 65 | High | Argument not assignable to parameter | Test calls, middleware |
| **TS2741** | 58 | High | Property missing in type but required | Mock objects |

### Medium-Frequency Errors (15-49 occurrences)

| Error Code | Count | Severity | Description | Primary Location |
|------------|-------|----------|-------------|------------------|
| **TS2532** | 49 | Medium | Object is possibly 'undefined' | Middleware, hooks |
| **TS6133** | 42 | Low | Declared but value never read | Test files |
| **TS18048** | 26 | Medium | Variable possibly 'undefined' | Middleware |
| **TS2339** | 17 | Medium | Property does not exist on type | Middleware |
| **TS4104** | 16 | Medium | Readonly type to mutable type | Test files |

### Low-Frequency Errors (1-14 occurrences)

| Error Code | Count | Severity | Description | Location |
|------------|-------|----------|-------------|----------|
| **TS2769** | 3 | Medium | No overload matches this call | Server app |
| **TS7006** | 2 | Low | Parameter implicitly has 'any' type | Test hooks |
| **TS2304** | 2 | Medium | Cannot find name | Test lib |
| **TS2786** | 1 | Medium | Cannot be used as JSX component | Test component |
| **TS2559** | 1 | Medium | Type has no properties in common | Test lib |
| **TS2556** | 1 | Low | Spread argument must be tuple | Test hook |
| **TS2554** | 1 | Low | Expected N arguments, but got M | Test hook |
| **TS2488** | 1 | Medium | Type must have iterator method | Test component |
| **TS2367** | 1 | Low | Comparison appears unintentional | Hook |
| **TS2352** | 1 | Low | Type conversion may be a mistake | Test hook |
| **TS2305** | 1 | Medium | Module has no exported member | Test lib |

---

## Error Categories by Priority

### 🔴 High Priority: Test-Related Type Mismatches (310 errors)

These errors indicate test fixtures and mocks are out of sync with updated type definitions.

| Error Code | Count | Pattern |
|------------|-------|---------|
| TS2322 | 116 | Type assignment errors in test mocks |
| TS2739 | 87 | Missing properties in test fixtures |
| TS2345 | 65 | Argument type mismatches in test calls |
| TS2741 | 58 | Missing required properties in mock objects |

**Impact:** Tests cannot run with strict type checking enabled.  
**Fix Strategy:** Update all test fixtures to include required properties and use proper type assertions.

---

### 🟡 Medium Priority: Null/Undefined Safety (75 errors)

Missing null checks before object property access.

| Error Code | Count | Pattern |
|------------|-------|---------|
| TS2532 | 49 | Object possibly 'undefined' |
| TS18048 | 26 | Variable possibly 'undefined' |

**Impact:** Runtime errors if null/undefined values encountered.  
**Fix Strategy:** Add optional chaining (`?.`) and type guards.

---

### 🟢 Low Priority: Code Cleanup (42 errors)

Unused declarations that don't affect functionality.

| Error Code | Count | Pattern |
|------------|-------|---------|
| TS6133 | 42 | Unused variable declarations |

**Impact:** Code cleanliness only.  
**Fix Strategy:** Remove unused imports and variables.

---

### 🔵 Other Issues (20 errors)

Various type safety concerns.

| Error Code | Count | Severity |
|------------|-------|----------|
| TS2339 | 17 | Property does not exist |
| TS4104 | 16 | Readonly to mutable assignment |
| TS2769 | 3 | Function overload mismatches |
| Other | 11 | Miscellaneous type errors |

---

## Affected Files Analysis

### High Impact Files (20+ errors) - 10 files

| Rank | Errors | File | Primary Package | Primary Error Types |
|------|--------|------|-----------------|---------------------|
| 1 | 42 | `packages/web/src/hooks/useContextSort.test.ts` | web | TS2322, TS2739 |
| 2 | 39 | `packages/web/src/components/health/LineStatusTile.test.tsx` | web | TS2322, TS2741 |
| 3 | 35 | `packages/web/src/components/favorites/FavoritesList.test.tsx` | web | TS2322, TS2739 |
| 4 | 35 | `packages/web/src/components/arrivals/ArrivalList.test.tsx` | web | TS2741, TS2322 |
| 5 | 35 | `packages/web/src/components/alerts/AlertCard.test.tsx` | web | TS2739, TS2322 |
| 6 | 28 | `packages/web/src/components/arrivals/ArrivalRow.test.tsx` | web | TS2741, TS2322 |
| 7 | 24 | `packages/web/src/components/equipment/EquipmentBanner.test.tsx` | web | TS2322, TS2739 |
| 8 | 24 | `packages/web/src/components/alerts/AlertBanner.test.tsx` | web | TS2322, TS2741 |
| 9 | 22 | `packages/web/src/components/alerts/ShuttleInfo.test.tsx` | web | TS2322, TS2739 |
| 10 | 19 | `packages/web/src/components/health/DataHealth.test.tsx` | web | TS2322, TS2741 |

**Subtotal:** 283 errors (41.6% of total by file count)

---

### Medium Impact Files (10-19 errors) - 7 files

| Rank | Errors | File |
|------|--------|------|
| 11 | 17 | `packages/web/src/lib/api.test.ts` |
| 12 | 17 | `packages/web/src/hooks/useTripTracker.test.ts` |
| 13 | 16 | `packages/web/src/hooks/usePositions.test.ts` |
| 14 | 15 | `packages/web/src/hooks/useMorningBriefing.test.ts` |
| 15 | 13 | `packages/web/src/components/alerts/AlertList.test.tsx` |
| 16 | 12 | `packages/web/src/lib/apiEnhanced.test.ts` |
| 17 | 11 | `packages/web/src/screens/HomeScreen.test.tsx` |

**Subtotal:** 101 errors (14.9% of total by file count)

---

### Low Impact Files (1-9 errors) - 30 files

30 files with 1-9 errors each, totaling 296 errors (43.5% of total by file count).

**Notable files:**
- `packages/web/src/lib/backgroundSync.test.ts` (8 errors)
- `packages/web/src/lib/serviceWorkerRegistration.test.ts` (7 errors)
- `packages/web/src/hooks/useInferredTrips.test.ts` (7 errors)
- `packages/web/src/hooks/useOfflineCountdown.test.ts` (6 errors)
- `packages/web/src/hooks/usePrefetch.test.ts` (5 errors)
- `packages/web/src/hooks/usePushNotifications.test.ts` (5 errors)

---

## Breakdown by Package

### packages/web/src (593 errors, 87.2% of total)

| Directory | Files | Total Errors | Percentage |
|-----------|-------|--------------|------------|
| `components/` | 13 | 279 | 41.0% |
| `hooks/` | 18 | 244 | 35.9% |
| `lib/` | 8 | 50 | 7.4% |
| `screens/` | 1 | 11 | 1.6% |
| `stores/` | 1 | 1 | 0.1% |

**Top web files:**
1. `hooks/useContextSort.test.ts` - 42 errors
2. `components/health/LineStatusTile.test.tsx` - 39 errors
3. `components/favorites/FavoritesList.test.tsx` - 35 errors
4. `components/arrivals/ArrivalList.test.tsx` - 35 errors
5. `components/alerts/AlertCard.test.tsx` - 35 errors

---

### packages/server/src (13 errors, 1.9% of total)

| Directory | Files | Total Errors |
|-----------|-------|--------------|
| `middleware/` | 7 | 10 |
| (root) | 1 | 3 |

**Server files affected:**
- `packages/server/src/app.ts` (3 errors)
- `packages/server/src/middleware/dynamic-rbac-cache.ts` (2 errors)
- `packages/server/src/middleware/cookie-security.ts` (2 errors)
- `packages/server/src/middleware/enhanced-authentication.ts` (1 error)
- `packages/server/src/middleware/enhanced-jwt-security.ts` (1 error)
- `packages/server/src/middleware/http-request-smuggling.ts` (1 error)
- `packages/server/src/middleware/http-response-splitting.ts` (1 error)
- `packages/server/src/middleware/security-headers.ts` (1 error)

---

## Common Error Patterns

### Pattern 1: Test Fixture Incomplete Type Definitions (310 errors)

**Symptoms:** TS2322, TS2739, TS2741 in test files

**Root Cause:** Test mocks and fixtures don't match updated type definitions after recent API/interface changes.

**Example:**
```typescript
// ❌ Before: Missing required properties
const mockAlert = {
  id: "123",
  severity: "severe",
  // Missing: source, cause, effect, createdAt, etc.
};

// ✅ After: Complete fixture
const mockAlert = {
  id: "123",
  severity: "severe" as const,
  source: "mta",
  cause: "delay",
  effect: ["delays"],
  createdAt: new Date().toISOString(),
  // ... all required properties
};
```

**Affected:** 35+ test files across components, hooks, and lib directories.

---

### Pattern 2: Null/Undefined Handling (75 errors)

**Symptoms:** TS2532, TS18048 in middleware and hooks

**Root Cause:** Missing null checks before object property access.

**Example:**
```typescript
// ❌ Before: No null check
const value = obj.property.nestedValue;

// ✅ After: Optional chaining
const value = obj.property?.nestedValue;

// ✅ Or: Type guard
if (obj?.property) {
  const value = obj.property.nestedValue;
}
```

**Affected:**
- `packages/server/src/middleware/dynamic-rbac-cache.ts`
- `packages/server/src/middleware/cookie-security.ts`
- `packages/web/src/hooks/useAlerts.ts`

---

### Pattern 3: Readonly Type Mutability (16 errors)

**Symptoms:** TS4104 in test files

**Root Cause:** Attempting to assign readonly arrays/objects to mutable types.

**Example:**
```typescript
// ❌ Before: Readonly to mutable
const readonlyData = [] as const;
const mutableData: string[] = readonlyData;

// ✅ After: Spread or type assertion
const mutableData = [...readonlyData];
// or
const mutableData = readonlyData as unknown as string[];
```

**Affected:** Test files using readonly fixtures.

---

## Recommended Fix Strategy

### Phase 1: High Priority - Test Fixtures (310 errors)

**Estimated Effort:** 8-12 hours  
**Impact:** Enables strict type checking for all tests

1. Update all test fixtures to include required properties
2. Use `as const` for literal type fixtures
3. Create shared test fixture utilities
4. Run typecheck after each major component

**Order of attack:**
1. Start with high-impact files (20+ errors) - 10 files
2. Move to medium-impact files (10-19 errors) - 7 files
3. Finish with low-impact files - 30 files

---

### Phase 2: Medium Priority - Null Safety (75 errors)

**Estimated Effort:** 4-6 hours  
**Impact:** Prevents runtime null/undefined errors

1. Add optional chaining (`?.`) to middleware property access
2. Add type guards for critical paths
3. Update hook return types to reflect nullable states

**Focus files:**
- `packages/server/src/middleware/dynamic-rbac-cache.ts`
- `packages/server/src/middleware/cookie-security.ts`
- `packages/web/src/hooks/useAlerts.ts`

---

### Phase 3: Low Priority - Code Cleanup (42 errors)

**Estimated Effort:** 1-2 hours  
**Impact:** Code quality only

1. Remove unused imports across all test files
2. Remove unused variable declarations
3. Clean up unused type parameters

---

### Phase 4: Other Issues (20 errors)

**Estimated Effort:** 2-3 hours  
**Impact:** Type safety completeness

1. Fix readonly mutability issues (16 errors)
2. Address function overload mismatches (3 errors)
3. Fix remaining miscellaneous errors (1 error)

---

## Summary Statistics

### Distribution by Severity

| Severity | Error Count | Percentage |
|----------|-------------|------------|
| High | 310 | 69.4% |
| Medium | 95 | 21.3% |
| Low | 42 | 9.4% |
| **Total** | **447** | **100%** |

### Distribution by File Type

| File Type | Count | Percentage |
|-----------|-------|------------|
| Test files (`.test.ts`, `.test.tsx`) | ~40 | 85.1% |
| Source files (`.ts`, `.tsx`) | ~7 | 14.9% |

### Distribution by Package

| Package | Error Count | Percentage |
|---------|-------------|------------|
| `packages/web` | 593 | 87.2% |
| `packages/server` | 13 | 1.9% |
| Uncategorized/Other | 74 | 10.9% |

### Top 5 Error Codes

| Rank | Error Code | Count | Percentage |
|------|------------|-------|------------|
| 1 | TS2322 | 116 | 25.9% |
| 2 | TS2739 | 87 | 19.5% |
| 3 | TS2345 | 65 | 14.5% |
| 4 | TS2741 | 58 | 13.0% |
| 5 | TS2532 | 49 | 11.0% |

**Cumulative:** 375 errors (83.9% of total)

---

## Verification Commands

```bash
# Check type errors
npm run typecheck

# Check specific file
npx tsc --noEmit packages/web/src/hooks/useContextSort.test.ts

# Watch mode during fixes
npx tsc --noEmit --watch
```

---

## Next Steps

1. ✅ **Complete catalog** (this document)
2. ⏳ **Fix test fixtures** (Phase 1)
3. ⏳ **Add null safety** (Phase 2)
4. ⏳ **Code cleanup** (Phase 3)
5. ⏳ **Final verification** (Phase 4)

**Expected Outcome:** Zero TypeScript errors, strict type checking enabled across all packages.
