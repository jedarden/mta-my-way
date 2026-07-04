# Integration Test Audit — bf-11k5o

**Date:** 2026-07-04  
**Scope:** `packages/server/src/integration/*.test.ts` (37 files)  
**Run:** `npx vitest run --reporter=verbose packages/server/src/integration/`  
**Result:** 37 failed, 0 passed, 0 tests actually executed

---

## 1. BLOCKER: Setup File Import Bug

**ALL 37 test suites fail before collecting a single test.**

### Error

```
ReferenceError: afterEach is not defined
 ❯ packages/server/src/test/setup.ts:45:1
```

### Root Cause

`packages/server/src/test/setup.ts` line 9 imports `beforeEach` from `vitest` but uses `afterEach` on line 45 **without importing it**:

```ts
// Line 9 — imports beforeEach but NOT afterEach
import { beforeEach, vi } from "vitest";

// Line 45 — unresolvable reference
afterEach(() => {
```

The vitest config has `globals: true`, but **setup files are not test files** — they run in module scope before the test context is established. All vitest globals must be explicitly imported in setup files.

### Fix

Add `afterEach` to the import on line 9:

```ts
import { afterEach, beforeEach, vi } from "vitest";
```

**Effort:** 1 line, <1 minute. This must be fixed before any other test failures can be observed.

---

## 2. Failure Categories (Predicted — post-fix analysis)

Since no tests actually ran, the categories below are based on **static code analysis** of the 37 test files. These are issues that will likely manifest once the setup blocker is resolved.

### Category A: Missing Test Isolation — API Key Registry Leak

**Risk: HIGH — likely causes flaky cross-test pollution**

Multiple tests call `registerApiKey()` in `beforeEach` but never revoke or clear those keys in `afterEach`. The API key registry is a module-level `Map` that grows unboundedly across test suites (tests run in forked pools, but keys persist within a file).

**Affected files:**

| File | registerApiKey calls | Cleanup? |
|------|---------------------|----------|
| `cross-user-access.test.ts:55,71,87` | 3 per test (in beforeEach) | ❌ No afterEach at all |
| `authorization.test.ts:78,98,458` | 2 in beforeAll, 1 inline | Partial (clears audit log only) |
| `password-reset.test.ts:623` | 1 inline | ❌ No key cleanup |
| `api.test.ts:165,166` | Uses `createTestAdminCredentials`/`createTestUserCredentials` (which call `registerApiKey`) | ❌ No key cleanup |
| `commute.test.ts:209` | Uses `createTestUserCredentials` | ❌ No key cleanup |
| `workflows.test.ts:180` | Uses `createTestUserCredentials` | ❌ No key cleanup |
| `cache-coherency.test.ts:135` | Uses `createTestUserCredentials` | ❌ No key cleanup |
| `data-flow.test.ts:177` | Uses `createTestUserCredentials` | ❌ No key cleanup |
| `cache.test.ts:132` | Uses `createTestUserCredentials` | ❌ No key cleanup |
| `security-middleware.test.ts:80` | Uses `createTestUserCredentials` | ❌ No key cleanup |
| `csrf-cross-component.test.ts:94` | Uses both user + admin credentials | ❌ No key cleanup |
| `concurrency.test.ts:149,150` | Uses both user + admin credentials | ❌ No key cleanup |
| `commute-analysis.test.ts:96` | Uses `createTestUserCredentials` | ❌ No key cleanup |
| `middleware-chain.test.ts` | Uses user/admin/read credentials in beforeEach | ❌ No key cleanup |

**Files needing changes in test-helpers.ts:** `createTestApiKey()` and its wrappers (`createTestAdminCredentials`, `createTestUserCredentials`, `createTestReadCredentials`) should return cleanup metadata or the test-helpers should export a `clearAllApiKeys()` function.

**Estimated effort:** Medium (1-2 hours) — add `clearAllApiKeys` to `test-helpers.ts`, add afterEach hooks to ~14 files.

---

### Category B: Missing Test Isolation — No Module State Reset

**Risk: HIGH — cache/alerts singletons carry state across tests**

The `resetAllModuleState()` function exists in `test-helpers.ts:427` and resets cache, alerts, and other module-level singletons. **Zero test files call it.** Tests that modify `cache.ts` state (arrivals, positions, feed states) via `updateArrivals()`, `recordFeedSuccess()`, etc. leave that state for subsequent tests in the same file.

**Affected files (tests that touch cache/alerts state):**
- `cache.test.ts` — directly modifies arrivals, positions
- `cache-coherency.test.ts` — reads/writes cache state
- `feed-pipeline.test.ts` — calls `updateArrivals()`, `recordFeedSuccess()`
- `data-flow.test.ts` — exercises cache through API
- `alerts-equipment.test.ts` — exercises alerts poller
- `positions-api.test.ts` — reads/writes positions cache
- `transfer-engine.test.ts` — reads cache state
- `workflows.test.ts` — exercises full data flow

**Estimated effort:** Low (30 min) — add `await resetAllModuleState()` to beforeEach or afterEach in affected files.

---

### Category C: Missing afterEach Hooks

**Risk: MEDIUM — resource leaks and state accumulation**

Two files have **zero** afterEach/afterAll hooks:

1. **`cross-user-access.test.ts`** — registers 3 API keys per test in beforeEach, creates in-memory databases, calls `initTripTracking` and `initPushDatabase` but never cleans up. The in-memory databases get GC'd but the module-level `initTripTracking` state persists.

2. **`observability.test.ts`** — creates a new Hono app via `createApp()` in each beforeEach but never cleans up module state (tracers, metric registries). After many tests, Prometheus metrics accumulate counter values.

**`feed-pipeline.test.ts`** has only 1 afterEach (for arrivals) but has a nested describe block that creates apps without cleanup.

**Estimated effort:** Low (30 min) — add afterEach hooks to the 2 files missing them entirely.

---

### Category D: Database Not Closed in Some Tests

**Risk: LOW — SQLite handles this via GC, but could leak file descriptors under high concurrency**

Files that import `closeDatabase` from test-helpers and use it correctly:
- `csrf-cross-component.test.ts` ✅
- `commute-workflow.test.ts` ✅
- `commute.test.ts` ✅
- `positions-api.test.ts` ✅
- `trip-lookup-api.test.ts` ✅
- `trip-tracking.test.ts` ✅
- `concurrency.test.ts` ✅
- `security-middleware.test.ts` ✅

Files that create databases but DON'T import or call `closeDatabase`:
- `cross-user-access.test.ts` — creates `createTripTrackingDatabase()` in beforeEach, never closes
- `push-subscriptions.test.ts` — may create push databases
- `push-briefing.test.ts` — may create push databases

Note: All databases are `:memory:` so OS file descriptor leak risk is low. But close is still good practice.

**Estimated effort:** Low (15 min)

---

### Category E: Port Binding Conflicts

**Risk: NONE**

No integration tests bind to actual ports. All tests use Hono's `app.request()` method (in-memory HTTP simulation). No `listen()` calls, no `createServer()`, no port allocation.

---

### Category F: Timing / Ordering Dependencies

**Risk: LOW-MEDIUM — some tests may be order-sensitive within a file**

- `commute-analysis.test.ts` and `commute-workflow.test.ts` both insert trips and then query commute stats. If tests within these files share the same in-memory database instance (singleton via `initTripTracking`), commute stats from earlier tests could leak.
- `feed-pipeline.test.ts` tests `recordFeedSuccess` and `getLastGoodParsed` — these store references to ParsedFeed objects. If a prior test stored a feed, `getAllParsedFeeds()` could return stale entries.
- The `pool: "forks"` config with `maxForks: 4` means up to 4 test files run in parallel. Since they each get their own process, module-level state is isolated **between files** but not **between tests within a file**.

**Estimated effort:** Low (15 min) — add `resetAllModuleState` calls where needed.

---

## 3. Prioritized Fix List

| Priority | Category | Description | Files Affected | Effort |
|----------|----------|-------------|----------------|--------|
| **P0** | Blocker | Add `afterEach` import to setup.ts | `test/setup.ts:9` | <1 min |
| **P1** | Isolation (A) | Add `clearAllApiKeys()` to test-helpers.ts + afterEach hooks | `test-helpers.ts` + ~14 test files | 1-2 hrs |
| **P1** | Isolation (B) | Call `resetAllModuleState()` in beforeEach of cache/alerts tests | ~8 test files | 30 min |
| **P2** | Isolation (C) | Add afterEach hooks to files with zero cleanup | `cross-user-access.test.ts`, `observability.test.ts` | 30 min |
| **P3** | Cleanup (D) | Add `closeDatabase()` calls where missing | 2-3 test files | 15 min |
| **P3** | Ordering (F) | Verify inter-test independence after P0-P2 fixes | All files | 15 min |

**Total estimated effort:** ~3-4 hours

---

## 4. Files Requiring Changes

### `packages/server/src/test/setup.ts`
- **Line 9:** Add `afterEach` to vitest import (P0 blocker)

### `packages/server/src/integration/test-helpers.ts`
- **Add:** `clearAllApiKeys()` function that resets the API key registry
- **Existing:** `resetAllModuleState()` already exists but is never called by any test
- **Add:** Export a `clearApiKeysForTesting()` wrapper if the authentication module doesn't already expose one

### Test files needing afterEach API key cleanup (~14 files):
`api.test.ts`, `authorization.test.ts`, `cache.test.ts`, `cache-coherency.test.ts`, `commute.test.ts`, `commute-analysis.test.ts`, `concurrency.test.ts`, `csrf-cross-component.test.ts`, `data-flow.test.ts`, `middleware-chain.test.ts`, `password-reset.test.ts`, `security-middleware.test.ts`, `workflows.test.ts`, `cross-user-access.test.ts`

### Test files needing `resetAllModuleState()` calls (~8 files):
`cache.test.ts`, `cache-coherency.test.ts`, `feed-pipeline.test.ts`, `data-flow.test.ts`, `alerts-equipment.test.ts`, `positions-api.test.ts`, `transfer-engine.test.ts`, `workflows.test.ts`

---

## 5. Raw Test Output (truncated)

All 37 suites fail identically:

```
ReferenceError: afterEach is not defined
 ❯ packages/server/src/test/setup.ts:45:1
     43| 
     44| // Restore mocks after each test
     45| afterEach(() => {
       | ^
     46|   vi.restoreAllMocks();
     47|   vi.clearAllTimers();

 Test Files  37 failed (37)
      Tests  no tests
   Duration  2.23s
```

Full output saved to `/tmp/integration-test-output.txt`.
