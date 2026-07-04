# Integration Test Failure Audit (bf-11k5o)

**Date:** 2026-07-04
**Scope:** `packages/server/src/integration/*.test.ts`
**Result:** 37/37 suites failed — 0 tests executed

---

## Blocking Issue: All 37 Suites Fail Before Any Test Runs

### Error
```
ReferenceError: afterEach is not defined
 ❯ packages/server/src/test/setup.ts:45:1
```

### Root Cause
`packages/server/src/test/setup.ts:9` — `afterEach` is used on line 45 but not imported:

```typescript
// Line 9 (current)
import { beforeEach, vi } from "vitest";

// Should be
import { beforeEach, afterEach, vi } from "vitest";
```

**Impact:** The `afterEach` callback (which calls `vi.restoreAllMocks()` and `vi.clearAllTimers()`) never runs. Even if `afterEach` were imported, mocks and timers would not be cleaned up. This single missing import blocks ALL 37 test suites — no tests can execute until this is fixed.

**Effort:** 1 line change — trivial.

---

## Category 1: Shared Mutable State — API Key Registry

Once the blocking import is fixed, tests will likely expose state leakage from module-level registries.

### `api-key-management.ts` — No reset functions exist

| Variable | Line | Type | Reset? |
|----------|------|------|--------|
| `API_KEY_REGISTRY` | 121 | `Map<string, ApiKey>` | ❌ No reset |
| `API_KEY_LAST_USED` | 126 | `Map<string, number>` | ❌ No reset |
| `API_KEY_DESCRIPTIONS` | 131 | `Map<string, string>` | ❌ No reset |

**Impact:** `test-helpers.ts:createTestApiKey()` calls `registerApiKey()` + `registerApiKeyWithMetadata()` which populate these Maps. Keys created in one test file persist into the next — authentication tests may find unexpected keys, count assertions may be wrong, and key-uniqueness checks may fail.

**Affected tests (likely):** `authorization.test.ts`, `security-middleware.test.ts`, `api.test.ts`, `cross-user-access.test.ts`, `user-workflows.test.ts`

### `authentication.ts` — Partial reset coverage

| Variable | Line | Type | Reset? |
|----------|------|------|--------|
| `apiKeys` | 544 | `Map<string, ApiKey>` | ❌ No reset |
| `sessions` | 545 | `Map<string, AuthSession>` | ❌ No reset |
| `auditLog` | 546 | `AuditLogEntry[]` | ❌ No reset |
| `refreshTokens` | 549 | `Map<string, RefreshToken>` | ❌ No reset |
| `deviceFingerprints` | 550 | `Map<string, DeviceFingerprint>` | ❌ No reset |
| `oauthProviders` | 551 | `Map<string, OAuthProvider>` | ❌ No reset |
| `oauthStates` | 552 | `Map<string, OAuthState>` | ❌ No reset |
| `totpConfigs` | 553 | `Map<string, TotpConfig>` | ❌ No reset |
| `authFailuresByIp` | 588 | `Map<string, {count,resetAt}>` | ✅ `resetAuthFailureTracking()` in setup.ts |
| `suspiciousIps` | 593 | `Map<string, {score,lastActivity}>` | ✅ `resetSuspiciousActivityTracking()` in setup.ts |

**Impact:** 8 of 10 module-level Maps in authentication.ts have no reset function. Sessions and refresh tokens will leak between test files. The `apiKeys` Map (line 544) is separate from `API_KEY_REGISTRY` in api-key-management.ts — both need clearing.

**Effort:** Medium — need to add reset/clear export functions for each Map, then call them in setup.ts `beforeEach`.

---

## Category 2: Shared Mutable State — Audit Log

| Variable | File | Line | Type | Reset? |
|----------|------|------|------|--------|
| `AUDIT_LOG` | `audit-log.ts` | 142 | `AuditEvent[]` | ⚠️ Partial: `clearAuditLog()` clears array |
| `eventIdCounter` | `audit-log.ts` | 147 | `number` | ❌ Not reset by `clearAuditLog()` |

**Impact:** `clearAuditLog()` exists but doesn't reset `eventIdCounter`. IDs will keep incrementing across tests, making ID-based assertions non-deterministic. More importantly, `clearAuditLog()` is NOT called in `setup.ts` `beforeEach` — so audit events from earlier test files accumulate into later ones.

**Also:** `authentication.ts:546` has a *separate* `auditLog` array with no reset function at all. This is a second audit log that also accumulates.

**Affected tests:** `audit-log-security-events.test.ts`, `authorization.test.ts`, `security-middleware.test.ts`

**Effort:** Low — add `clearAuditLog()` call to setup.ts and add counter reset to `clearAuditLog()`.

---

## Category 3: Shared Mutable State — Rate Limiter

| Variable | File | Line | Type | Reset? |
|----------|------|------|------|--------|
| `buckets` | `rate-limiter.ts` | 20 | `Map<string, TokenBucket>` | ✅ `resetRateLimiter()` in setup.ts |
| `testMode` | `rate-limiter.ts` | 23 | `boolean` | ✅ Set in setup.ts |
| `rateLimitStore` | `auth-rate-limit.ts` | 157 | `Map<string, RateLimitEntry>` | ✅ `_clearAllRateLimits()` in setup.ts |
| `apiKeyRateLimitStore` | `auth-rate-limit.ts` | 162 | `Map<string, RateLimitEntry>` | ✅ `_clearAllRateLimits()` in setup.ts |
| `trustedIps` | `auth-rate-limit.ts` | 168 | `Set<string>` | ❌ Not reset |
| `unbannedIps` | `auth-rate-limit.ts` | 177 | `Set<string>` | ❌ Not reset |

**Impact:** `trustedIps` and `unbannedIps` leak. If one test adds a trusted IP, subsequent tests may bypass rate limiting unexpectedly. Low practical impact since rate limiting is disabled in test mode, but still a correctness issue.

**Effort:** Low — add clear calls for these two Sets in setup.ts or add to `_clearAllRateLimits()`.

---

## Category 4: Shared Mutable State — CSRF / Captcha / AuthZ

| Variable | File | Line | Type | Reset? |
|----------|------|------|------|--------|
| `tokenStore` | `csrf-protection.ts` | 98 | `Map<string, CsrfTokenData>` | ❌ No reset |
| `failedCaptchaAttempts` | `captcha.ts` | 128 | `Map<string, {count,resetAt}>` | ❌ No reset |
| `captchaConfigs` | `captcha.ts` | 133 | `Map<string, CaptchaConfig>` | ❌ No reset |
| `defaultCaptchaConfig` | `captcha.ts` | 138 | `CaptchaConfig \| null` | ❌ No reset |
| `accessPatterns` | `authorization-security.ts` | 309 | `Map<string, AccessPattern>` | ❌ No reset |

**Impact:** CSRF tokens created in one test will be valid in subsequent tests (test may get wrong token or unexpected success). Captcha state leakage is unlikely to cause visible failures since captcha is typically mocked, but is a correctness gap. Access patterns from one test file could influence anomaly detection in another.

**Affected tests:** `csrf-cross-component.test.ts`, `security-middleware.test.ts`, `authorization.test.ts`

**Effort:** Low-Medium — need reset functions and setup.ts integration.

---

## Category 5: Token Encryption State

| Variable | File | Line | Type | Reset? |
|----------|------|------|------|--------|
| `encryptionConfig` | `token-encryption.ts` | 69 | `{masterKey,...} \| null` | Set once in setup.ts |
| `oldKeys` | `token-encryption.ts` | 78 | `Map<number, CryptoKey>` | ❌ No reset |

**Impact:** Encryption config is set once globally in setup.ts (good). But `oldKeys` Map used for key rotation will accumulate if any test exercises rotation. Low practical impact for current tests.

**Effort:** Low — add `oldKeys.clear()` to setup.ts if key rotation tests are added.

---

## Category 6: Test Helpers — API Key Leak in `createTestApiKey()`

`test-helpers.ts:353-381`: `createTestApiKey()` generates unique keys via `crypto.randomUUID()` + `Math.random()` and registers them in module-level Maps via `registerApiKey()` + `registerApiKeyWithMetadata()`. These are never cleaned up.

**Impact:** Each test that calls `createTestApiKey()` (or the convenience wrappers `createTestAdminCredentials()`, `createTestUserCredentials()`, `createTestReadCredentials()`) adds permanent entries to the API key registry. Over 37 test files, this could accumulate hundreds of orphaned keys.

**Effort:** Medium — need a cleanup function that unregisters keys, or refactor to use a per-test database-backed approach.

---

## Prioritized Fix List

### Priority 1: Critical (blocks all tests)
| # | Fix | Files | Effort |
|---|-----|-------|--------|
| 1 | Add `afterEach` to vitest import | `setup.ts:9` | 1 min |

### Priority 2: High (state leakage causes test flakiness)
| # | Fix | Files | Effort |
|---|-----|-------|--------|
| 2 | Add reset functions for `authentication.ts` Maps (`apiKeys`, `sessions`, `auditLog`, `refreshTokens`, `deviceFingerprints`, `oauth*`, `totpConfigs`) | `authentication.ts`, `setup.ts` | 30 min |
| 3 | Add reset functions for `api-key-management.ts` Maps (`API_KEY_REGISTRY`, `API_KEY_LAST_USED`, `API_KEY_DESCRIPTIONS`) | `api-key-management.ts`, `setup.ts` | 15 min |
| 4 | Call `clearAuditLog()` in `setup.ts` `beforeEach` + fix `clearAuditLog()` to reset `eventIdCounter` | `audit-log.ts`, `setup.ts` | 10 min |

### Priority 3: Medium (correctness gaps, may cause intermittent failures)
| # | Fix | Files | Effort |
|---|-----|-------|--------|
| 5 | Add reset function for CSRF `tokenStore` + call in setup.ts | `csrf-protection.ts`, `setup.ts` | 15 min |
| 6 | Clear `trustedIps` and `unbannedIps` Sets in `_clearAllRateLimits()` or setup.ts | `auth-rate-limit.ts` | 5 min |
| 7 | Add reset function for `captcha.ts` Maps + call in setup.ts | `captcha.ts`, `setup.ts` | 15 min |
| 8 | Add reset function for `authorization-security.ts` `accessPatterns` + call in setup.ts | `authorization-security.ts`, `setup.ts` | 15 min |

### Priority 4: Low (edge cases, unlikely to cause visible failures)
| # | Fix | Files | Effort |
|---|-----|-------|--------|
| 9 | Add `oldKeys.clear()` for token encryption key rotation state | `token-encryption.ts`, `setup.ts` | 5 min |
| 10 | Refactor `createTestApiKey()` in test-helpers to clean up after tests | `test-helpers.ts` | 20 min |

**Total estimated effort:** ~2 hours

---

## Summary

- **37/37 suites fail** — all from a single missing import (`afterEach`)
- **0 tests actually executed** — so no real code bugs are exposed yet
- **~20 module-level mutable state variables** lack reset functions or aren't called in `beforeEach`
- **5 modules** have complete reset coverage (rate-limiter, auth-rate-limit partial, auth-failure/suspicious tracking)
- **7 modules** have no reset functions at all
- After fixing the import, **re-run the full suite** to expose actual test-level failures beneath the state leakage
