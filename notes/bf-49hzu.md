# bf-49hzu — Typecheck Analysis: FAIL with 810 errors

**Status**: ❌ **FAIL** (exit code 1)

## Executive Summary

Typecheck execution from child 1 (bf-5htiu) resulted in **810 TypeScript errors** across **95 files** in the monorepo. This is a significant type safety regression that needs to be addressed before the codebase is considered production-ready.

## Command and Exit Code

```bash
npm run typecheck  # → tsc --build
```

- **Exit Code**: `1` (failure)
- **TypeScript Version**: 5.9.3
- **Output Lines**: 1,085
- **Source**: `notes/bf-5htiu-typecheck-output.txt`

## Error Distribution by Package

| Package | Errors | Percentage |
|---------|--------|------------|
| `packages/web` | 484 | 59.8% |
| `packages/server` | 289 | 35.7% |
| `packages/shared` | 37 | 4.6% |

**Total**: 810 errors across 3 packages

## Error Distribution by TypeScript Error Code

| Code | Count | Meaning |
|------|-------|---------|
| TS2322 | 140 | Type X is not assignable to type Y |
| TS6133 | 110 | Declared but its value is never read |
| TS2345 | 97 | Argument type not assignable to parameter type |
| TS2739 | 87 | Type missing properties from another type |
| TS2532 | 74 | Object is possibly 'undefined' |
| TS2741 | 59 | Property missing in type but required |
| TS2304 | 46 | Cannot find name |
| TS18048 | 44 | Value is possibly 'undefined' |
| TS2339 | 41 | Property does not exist on type |
| TS18046 | 34 | Value is of type 'unknown' |

**Top 10 error codes account for 732 errors (90.4%)**

## Worst-Offending Files (Top 20)

| Errors | File | Package |
|--------|------|---------|
| 43 | `packages/server/src/middleware/rbac.ts` | server |
| 42 | `packages/web/src/hooks/useContextSort.test.ts` | web |
| 39 | `packages/web/src/components/health/LineStatusTile.test.tsx` | web |
| 35 | `packages/web/src/components/favorites/FavoritesList.test.tsx` | web |
| 35 | `packages/web/src/components/arrivals/ArrivalList.test.tsx` | web |
| 35 | `packages/web/src/components/alerts/AlertCard.test.tsx` | web |
| 35 | `packages/server/src/middleware/captcha.ts` | server |
| 32 | `packages/server/src/middleware/authentication.ts` | server |
| 28 | `packages/web/src/components/arrivals/ArrivalRow.test.tsx` | web |
| 24 | `packages/web/src/components/equipment/EquipmentBanner.test.tsx` | web |

## Error Categories and Patterns

### 1. **Test Fixture Issues** (~40% of errors)
The majority of `packages/web` errors are in test files, clustering around:
- Mock objects missing newly-required fields (e.g., `Favorite.sortOrder`)
- Incomplete state objects (missing full `SettingsState`, store hook return shapes)
- Type mismatches in React Testing Library mocks

**Impact**: These are mechanical and batch-fixable per-file.

### 2. **Strict Null Checks** (~15% of errors)
- `TS2532`: Object is possibly 'undefined'
- `TS18048`: Value is possibly 'undefined'

Common in:
- `packages/server/src/middleware/` files
- `packages/server/src/delay-predictor.ts`
- `packages/server/src/equipment-poller.ts`

### 3. **Unused Declarations** (~14% of errors)
- `TS6133`: Declared but its value is never read
- `TS6196`: Declared but never used

Widespread across all packages, particularly in middleware files.

### 4. **API/Type Mismatches** (~12% of errors)
Real type incompatibilities requiring fixes:
- `packages/server/src/middleware/authentication.ts`: Calling non-existent `SubtleCrypto.timingSafeEqual`
- `packages/server/src/middleware/csrf-protection.ts`: Importing `generateCsrfToken` not exported
- `packages/server/src/middleware/index.ts`: Duplicate re-exports
- `packages/server/src/middleware/authorization.ts`: Export conflicts

### 5. **Missing Properties** (~10% of errors)
- `TS2741`: Property missing in type but required
- `TS2739`: Type missing properties from another type

Common in interface implementations and object literals.

## Specific Notable Issues

### Critical (Blocking Production)
1. **`packages/server/src/app.ts:1195`**: Health endpoint response shape mismatch — `delayDetector` object structure is incompatible
2. **`packages/server/src/middleware/authentication.ts`**: Security-relevant code with type errors (crypto API misuse)
3. **`packages/server/src/delay-predictor.ts:685`**: Undefined `DelaySeverity` type reference

### High Priority (Affects Core Functionality)
1. **`packages/web/src/screens/HomeScreen.test.tsx`**: Home screen test failures (14 errors)
2. **Test coverage**: Majority of web component tests have type errors, masking potential runtime issues
3. **Middleware type safety**: Server middleware layer has 100+ errors across authentication, RBAC, captcha

### Medium Priority (Developer Experience)
1. **Unused imports**: 110 instances cluttering code
2. **Test fixtures**: Systematic fixture updates needed for consistency
3. **API layer**: Type mismatches in API integration code

## Recommended Fix Priority

### Phase 1: Critical Path Blocking (Immediate)
1. Fix `app.ts` health endpoint response type
2. Resolve `authentication.ts` crypto API issues
3. Fix undefined `DelaySeverity` reference
4. Address middleware export conflicts

### Phase 2: Test Hygiene (Week 1)
1. Update all test fixtures with required fields
2. Fix React Testing Library mock types
3. Systematic unused import cleanup
4. Update `packages/web` test files (largest bucket)

### Phase 3: Server Type Safety (Week 2)
1. Fix middleware layer type errors (RBAC, captcha, validation)
2. Address delay detector/predictor null safety
3. Fix equipment poller null checks
4. Clean up server-side unused declarations

### Phase 4: Shared Package (Week 2)
1. Fix `testing/observability-helpers.ts` (16 errors)
2. Fix `testing/test-helpers.ts` (9 errors)
3. Update test helpers for strict null safety

## Files Affected Summary

- **Total files**: 95
- **Test files**: ~65% (majority in `packages/web`)
- **Production code**: ~35% (concentrated in `packages/server/src/middleware/`)

## Next Steps

1. ❌ **Typecheck does NOT pass** — cannot close verification bead
2. Create focused fix beads for Phase 1 critical issues
3. Batch-create Phase 2/3 beads for systematic cleanup
4. Re-run typecheck after each phase to validate progress

## Related Artifacts

- Full typecheck output: `notes/bf-5htiu-typecheck-output.txt`
- Child 1 execution notes: `notes/bf-5htiu.md`
- Parent verification bead: `bf-1ic7x`

---

**Conclusion**: The typecheck failure is significant but highly tractable. Most errors are mechanical (test fixtures, unused imports) and can be fixed systematically. The critical path blockers are few and can be addressed quickly.
