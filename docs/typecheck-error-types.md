# TypeScript Error Type Analysis

Generated from: `docs/typecheck-raw-output.txt`  
Date: 2026-08-30

## Summary

**Total Errors: 447**

## Error Type Breakdown

| Error Code | Count | Description | Example Location |
|------------|-------|-------------|------------------|
| **TS2322** | 116 | Type not assignable to target type | `packages/server/src/middleware/dynamic-rbac-cache.ts(525,3)` |
| **TS2739** | 87 | Type missing required properties | `packages/web/src/components/alerts/AlertCard.test.tsx(67,25)` |
| **TS2345** | 65 | Argument not assignable to parameter type | `packages/server/src/middleware/http-request-smuggling.ts(297,41)` |
| **TS2741** | 58 | Property missing in type but required | `packages/web/src/components/arrivals/ArrivalRow.test.tsx(79,26)` |
| **TS2532** | 49 | Object is possibly 'undefined' | `packages/server/src/middleware/dynamic-rbac-cache.ts(734,7)` |
| **TS6133** | 42 | Declared but value never read | `packages/web/src/components/alerts/AlertCard.test.tsx(15,26)` |
| **TS18048** | 26 | Variable possibly 'undefined' | `packages/server/src/middleware/cookie-security.ts(524,18)` |
| **TS2339** | 17 | Property does not exist on type | `packages/server/src/middleware/cookie-security.ts(461,5)` |
| **TS4104** | 16 | Readonly type cannot be assigned to mutable type | `packages/web/src/components/alerts/AlertList.test.tsx(250,25)` |
| **TS2769** | 3 | No overload matches this call | `packages/server/src/app.ts(3104,42)` |
| **TS7006** | 2 | Parameter implicitly has 'any' type | `packages/web/src/hooks/useAlerts.test.ts(126,38)` |
| **TS2304** | 2 | Cannot find name | `packages/web/src/lib/backgroundSync.test.ts(13,40)` |
| **TS2786** | 1 | Cannot be used as JSX component | `packages/web/src/components/common/ErrorBoundary.test.tsx(293,12)` |
| **TS2559** | 1 | Type has no properties in common with type | `packages/web/src/lib/backgroundSync.test.ts(11,7)` |
| **TS2556** | 1 | Spread argument must be tuple or rest parameter | `packages/web/src/hooks/useAlerts.test.ts(104,66)` |
| **TS2554** | 1 | Expected N arguments, but got M | `packages/web/src/hooks/useTripTracker.test.ts(276,53)` |
| **TS2488** | 1 | Type must have '[Symbol.iterator]()' method | `packages/web/src/components/common/ErrorBoundary.test.tsx(193,13)` |
| **TS2367** | 1 | Comparison appears unintentional (no overlap) | `packages/web/src/hooks/useAlerts.ts(209,44)` |
| **TS2352** | 1 | Type conversion may be a mistake | `packages/web/src/hooks/useTripTracker.test.ts(261,8)` |
| **TS2305** | 1 | Module has no exported member | `packages/web/src/lib/apiEnhanced.test.ts(11,10)` |

## Error Categories

### High Priority (Test-Related Type Mismatches) - 310 errors
- **TS2322** (116): Type assignment errors in test mocks
- **TS2739** (87): Missing properties in test fixtures
- **TS2345** (65): Argument type mismatches in test calls
- **TS2741** (58): Missing required properties in mock objects

### Medium Priority (Null/Undefined Safety) - 75 errors
- **TS2532** (49): Object possibly 'undefined'
- **TS18048** (26): Variable possibly 'undefined'

### Low Priority (Code Cleanup) - 42 errors
- **TS6133** (42): Unused variable declarations

### Other Issues - 20 errors
- **TS2339** (17): Property does not exist
- **TS4104** (16): Readonly to mutable assignment
- **TS2769** (3): Function overload mismatches
- Various other type errors (11)

## Common Error Patterns

### 1. Test Fixture Incomplete Type Definitions
The majority of errors (TS2322, TS2739, TS2741) stem from test mocks and fixtures not matching updated type definitions. This suggests type definitions have been updated but test fixtures haven't been synchronized.

**Example:**
```typescript
// Test fixture missing required properties
const alert = {
  id: string,
  severity: "severe",
  // Missing: source, cause, effect
};
```

### 2. Null/Undefined Handling
Many errors (TS2532, TS18048) indicate missing null checks before object property access.

**Example:**
```typescript
// Before: Missing null check
const value = obj.property.nestedValue;

// After: Add null check
const value = obj.property?.nestedValue;
```

### 3. Unused Variables
Test imports and variables declared but never used (TS6133) - cleanup candidates.

## Recommendations

1. **Immediate Priority:** Fix test fixture type definitions (310 errors)
   - Update test mocks to include all required properties
   - Use proper type assertions or `as const` for test data
   
2. **Short-term:** Add null safety checks (75 errors)
   - Use optional chaining (`?.`) for nested property access
   - Add type guards where needed
   
3. **Code Cleanup:** Remove unused imports and variables (42 errors)
   - Clean up test file imports
   - Remove unused variables
   
4. **Type Safety:** Address readonly mutability issues (16 errors)
   - Use `ReadonlyArray` consistently
   - Avoid readonly to mutable conversions

## Files with Most Errors

1. **Test files** - Majority of errors are in `.test.tsx` and `.test.ts` files
2. **packages/server/src/middleware/** - Server middleware type safety issues
3. **packages/web/src/components/** - React component type mismatches
4. **packages/web/src/hooks/** - Custom hook type errors
5. **packages/web/src/lib/** - Library utility type issues
