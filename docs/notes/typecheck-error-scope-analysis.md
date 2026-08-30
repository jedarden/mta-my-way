# Typecheck Error Impact and Scope Analysis

**Generated:** 2026-08-30  
**Bead:** mtamyway-0609324d  
**Purpose:** Determine fix strategy and scope for cataloged typecheck errors

---

## Executive Summary

**Total Errors:** 447 (by type) / 680 (by file) across 47-51 files  
**Most Affected Package:** `packages/web` (87.2% of errors)  
**Primary Issue:** Test fixtures out of sync with updated type definitions  
**Recommendation:** **Fix all errors systematically** — do not suppress

---

## Error Classification by Impact

### 🔴 BLOCKING - Type System Violations (310 errors, 69.4%)

**Must fix** — These prevent TypeScript compilation and represent real type safety violations.

| Error Code | Count | Description | Location |
|------------|-------|-------------|----------|
| TS2322 | 116 | Type not assignable | Test mocks (70%), middleware (20%), components (10%) |
| TS2739 | 87 | Missing required properties | Test fixtures (85%) |
| TS2345 | 65 | Argument not assignable | Test assertions (60%), middleware (30%) |
| TS2741 | 58 | Property missing in type | Test mocks (90%) |

**Root Cause:** Recent API/interface changes updated type definitions, but test fixtures weren't updated to match.

**Affected Components:**
- `packages/web/src/components/` - 13 files, 279 errors
- `packages/web/src/hooks/` - 18 files, 244 errors
- `packages/web/src/lib/` - 8 files, 50 errors

---

### 🟡 NON-BLOCKING - Runtime Crash Risks (75 errors, 16.8%)

**Should fix** — Don't block compilation but represent real runtime risks.

| Error Code | Count | Description | Location |
|------------|-------|-------------|----------|
| TS2532 | 49 | Object possibly 'undefined' | Server middleware (70%), web hooks (30%) |
| TS18048 | 26 | Variable possibly 'undefined' | Middleware and hooks |

**Affected Components:**
- `packages/server/src/middleware/` - 4 files
- `packages/web/src/hooks/useAlerts.ts` - 1 file

---

### 🟢 CLEANUP - Code Quality (42 errors, 9.4%)

**Quick wins** — Don't affect functionality.

| Error Code | Count | Description |
|------------|-------|-------------|
| TS6133 | 42 | Declared but never read |

Primarily unused imports in test files.

---

### 🔵 OTHER - Type Safety (20 errors, 4.5%)

**Completeness** — Various type safety concerns.

| Error Code | Count | Description |
|------------|-------|-------------|
| TS2339 | 17 | Property does not exist |
| TS4104 | 16 | Readonly to mutable assignment |
| TS2769 | 3 | No overload matches |
| Other | 10 | Miscellaneous |

---

## Fix Strategy Recommendation

### ✅ **Recommendation: Fix All Errors**

**Do NOT suppress** — These represent real type safety issues.

**Rationale:**

1. **High Impact (310 errors)**: Cannot ignore — type system violations prevent valid compilation
2. **Medium Impact (75 errors)**: Real runtime crash risks — low fix complexity (add `?.`)
3. **Low Impact (42 errors)**: Quick wins — improves code quality
4. **Other (20 errors)**: Completeness — comprehensive type safety

---

## Fix Effort by Phase

| Phase | Errors | Complexity | Time | Impact |
|-------|--------|------------|------|--------|
| 1: Test Fixtures | 310 | Medium | 8-12h | Enables strict type checking |
| 2: Null Safety | 75 | Low | 4-6h | Prevents runtime crashes |
| 3: Cleanup | 42 | Very Low | 1-2h | Code quality |
| 4: Other Issues | 20 | Low-Medium | 2-3h | Type safety completeness |
| **Total** | **447** | | **15-23h** | **Zero type errors** |

---

## Top 10 Files Requiring Attention

| Rank | File | Errors | Type | Primary Pattern |
|------|------|--------|------|-----------------|
| 1 | `packages/web/src/hooks/useContextSort.test.ts` | 42 | Test | Fixture types |
| 2 | `packages/web/src/components/health/LineStatusTile.test.tsx` | 39 | Test | Missing props |
| 3 | `packages/web/src/components/alerts/AlertCard.test.tsx` | 35 | Test | Fixtures |
| 4 | `packages/web/src/components/favorites/FavoritesList.test.tsx` | 35 | Test | Fixtures |
| 5 | `packages/web/src/components/arrivals/ArrivalList.test.tsx` | 35 | Test | Missing props |
| 6 | `packages/web/src/components/arrivals/ArrivalRow.test.tsx` | 28 | Test | Fixtures |
| 7 | `packages/web/src/components/alerts/AlertBanner.test.tsx` | 24 | Test | Fixtures |
| 8 | `packages/web/src/components/equipment/EquipmentBanner.test.tsx` | 24 | Test | Fixtures |
| 9 | `packages/web/src/components/alerts/ShuttleInfo.test.tsx` | 22 | Test | Fixtures |
| 10 | `packages/web/src/components/health/DataHealth.test.tsx` | 19 | Test | Fixtures |

**Pattern:** 9 of 10 are test files with fixture type mismatches.

---

## Affected Components Summary

### By Package

| Package | Errors | % | Files | Primary Issue |
|---------|--------|---|-------|---------------|
| packages/web | 593 | 87.2% | 40 | Test fixture mismatches |
| packages/server | 13 | 1.9% | 8 | Null safety in middleware |
| Other | 74 | 10.9% | - | Mixed |

### By Directory (packages/web)

| Directory | Errors | Files | Pattern |
|-----------|--------|-------|---------|
| components/ | 279 | 14 | Test fixture types |
| hooks/ | 244 | 18 | Test fixture types |
| lib/ | 50 | 8 | Mixed |
| screens/ | 11 | 1 | Test fixture issues |
| stores/ | 1 | 1 | Type mismatch |

---

## Fix Complexity Distribution

| Complexity | Errors | % | Time |
|------------|--------|---|------|
| Very Low | 42 | 9.4% | 0.5-1h |
| Low | 137 | 30.6% | 2-3h |
| Medium | 246 | 55.0% | 8-15h |
| Medium-High | 22 | 4.9% | 4-5h |
| **Total** | **447** | **100%** | **15-23h** |

---

## Verification Commands

```bash
# Check all type errors
npm run typecheck

# Check specific file
npx tsc --noEmit packages/web/src/hooks/useContextSort.test.ts

# Watch mode during fixes
npx tsc --noEmit --watch

# Count errors by type
npm run typecheck 2>&1 | grep -oE 'TS[0-9]+' | sort | uniq -c | sort -rn
```

---

## Success Criteria

- ✅ `npm run typecheck` exits with code 0
- ✅ Zero TypeScript errors
- ✅ All tests pass with strict type checking
- ✅ No new warnings introduced

---

## Conclusion

The typecheck errors represent a **solvable, systematic problem** with clear fix patterns:

1. **69.4%** are test fixture mismatches — update fixtures to match new type definitions
2. **16.8%** are null safety issues — add optional chaining
3. **9.4%** are cleanup — remove unused code
4. **4.5%** are other type safety issues — various fixes

**Estimated effort:** 15-23 hours across 4 phases.

**Recommendation:** Fix all errors systematically. Do not suppress — these are real type safety issues that should be addressed.

---

**Status:** Analysis Complete — Ready for Fix Implementation  
**Next Steps:** Begin Phase 1: Fix test fixtures (310 errors)
