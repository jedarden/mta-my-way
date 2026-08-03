# Audit Results: /api/context Routes Unused in Frontend

## Audit Performed
- **Date:** 2026-08-03
- **Scope:** packages/web/src (206 TypeScript files)
- **Bead:** bf-2s0ga

## Search Patterns Tested

### 1. Direct API Path Searches
- `'/api/context'` (single quote) → **0 matches**
- `"/api/context"` (double quote) → **0 matches**

### 2. Service Module References
- `context-service` (imports or usage) → **0 matches**

### 3. HTTP Client References
- `fetch.*context` → **0 matches**
- `axios.*context` → **0 matches**

### 4. Server Imports
- `from.*server.*context` or `import.*context.*server` → **0 matches**

### 5. Broader Context References
- Generic "context" word usage found only in:
  - Error display contexts (ApiErrorDisplay)
  - Tracing contexts (tracing.ts)
  - React rendering contexts
  - Test contexts
  - **No API endpoint references**

## contextStore.ts Verification

**File:** packages/web/src/stores/contextStore.ts

**Key Findings:**
- **Purely client-side implementation** ✅
- Uses Zustand with localStorage persistence
- Imports `detectContext` from `@mta-my-way/shared` (client-side logic)
- Uses `window.__mta_tap_history` bridge for tap data (no server calls)
- **No fetch() or axios() calls**
- **No server API dependencies**

**Code Evidence:**
```typescript
// Line 18: Client-side detection from shared package
import { DEFAULT_CONTEXT_STATE, detectContext } from "@mta-my-way/shared";

// Line 58: localStorage persistence only
storage: createJSONStorage(() => localStorage),

// Lines 86-91: Pure client-side detection
const tapHistory = window.__mta_tap_history ?? [];
const newContext = detectContext({
  ...params,
  tapHistory,
  manualOverride: settings.manualOverride,
});
```

## Conclusion

**✅ CONFIRMED:** The server-side `/api/context` feature is **completely unused** in the frontend.

- 0 direct API calls found
- 0 service imports found
- 0 HTTP client references to context endpoints found
- contextStore.ts is 100% client-side
- All 206 TypeScript files in packages/web/src checked

**Next Step:** Proceed with child bead to remove unused server-side context routes.
