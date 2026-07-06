# validateQuery Verification Findings — Consolidated Summary

**Bead:** bf-1qrdl
**Parent:** bf-2k6t7
**Date:** 2026-07-06

## Overview

Consolidated findings from child beads investigating `validateQuery` failure behavior and E2E test coverage. No mismatches found — test expectations align with actual behavior across all tests.

---

## 1. validateQuery Failure Response (from bf-2i9lz)

### Function signature
```ts
validateQuery<T>(c: Context, schema: ZodSchema<T>): T | Response
```
**Location:** `packages/server/src/middleware/validation.ts:167-189`

### HTTP Status Code
**400 Bad Request** (set via `c.json(errorResponse, 400)` at line 186)

### Response Body Shape
```typescript
interface ValidationErrorResponse {
  error: "validation failed";          // string literal
  details: ValidationErrorDetail[];   // array of detail objects
}

interface ValidationErrorDetail {
  field: string;   // dot-joined Zod path, e.g. "limit" or "items[2].name"
  message: string; // human-readable error message
}
```
**Defined at:** `validation.ts:23-26`

### Example: Unexpected Query Parameter
Request: `GET /api/health?extra=param`
Response:
```json
{
  "error": "validation failed",
  "details": [
    {
      "field": "extra",
      "message": "Unrecognized key(s) in object: 'extra'"
    }
  ]
}
```

### Message Format by Zod Error Code
| Zod Error Code | Message Format |
|---|---|
| `invalid_enum_value` | `"Must be one of: <options>"` |
| `too_small` (string) | `"String must be at least N character(s)"` |
| `too_small` (array) | `"Array must contain at least N item(s)"` |
| `too_small` (number) | `"Number must be at least N"` |
| `too_big` (string) | `"String must be at most N character(s)"` |
| `too_big` (array) | `"Array must contain at most N item(s)"` |
| `too_big` (number) | `"Number must be at most N"` |
| `unrecognized_keys` (strict) | `"Unrecognized key(s) in object: 'key-name'"` |
| all others | Zod's default message |

---

## 2. health.e2e.ts Test Expectations (from bf-29gra)

### Test: "rejects unexpected query parameters"
**File:** `tests/e2e/health.e2e.ts:70-76`
**Scenario:** `GET /api/health?extra=param`

### Assertions
| Line | Assertion | Expected |
|------|-----------|----------|
| 72 | `expect(response.status()).toBe(400)` | HTTP 400 |
| 75 | `expect(body).toHaveProperty("error")` | Has `error` key |

### What's NOT checked
- ❌ `error` value (not checked against `"validation failed"`)
- ❌ `details` array existence
- ❌ `details` entry content (field names, message text)

### Match Status vs. validateQuery
| Aspect | validateQuery | Test Assertion | Match? |
|--------|--------------|---------------|--------|
| 400 status | Returns 400 | Expects 400 | ✅ **MATCH** |
| `error` property | Has `"validation failed"` | Checks existence only | ⚠️ **GAP** (value not checked) |
| `details` property | Has `details[]` | Not checked | ⚠️ **GAP** |

**Assessment:** The test is appropriately scoped as a minimal smoke check. Gaps are covered by `api-validation.e2e.ts`.

---

## 3. api-validation.e2e.ts Test Expectations (from bf-2w07g)

### Test: "health endpoint rejects unexpected query parameters"
**File:** `tests/e2e/api-validation.e2e.ts:12-21`
**Scenario:** `GET /api/health?extra=param` (same as health.e2e.ts)

### Assertions
| Line | Assertion | Expected |
|------|-----------|----------|
| 14 | `expect(response.status()).toBe(400)` | HTTP 400 |
| 17 | `expect(body).toHaveProperty("error")` | Has `error` key |
| 18 | `expect(body.error).toBe("validation failed")` | Exact value match |
| 19 | `expect(body).toHaveProperty("details")` | Has `details` key |
| 20 | `expect(Array.isArray(body.details)).toBe(true)` | `details` is array |

### Additional tests (same pattern)
- **Metrics endpoint** (lines 23-30): Same 4 assertions for `/api/metrics?debug=true`
- **Stations list** (lines 32-39): Same 4 assertions for `/api/stations?format=csv`
- **Station search empty query** (lines 43-54): Also checks `body.details[0].field === "q"`

### Match Status vs. validateQuery
| Aspect | validateQuery | Test Assertion | Match? |
|--------|--------------|---------------|--------|
| 400 status | Returns 400 | Expects 400 | ✅ **MATCH** |
| `error` property | Has `"validation failed"` | Checks existence | ✅ **MATCH** |
| `error` value | `"validation failed"` | Exacts match | ✅ **MATCH** |
| `details` property | Has `details[]` | Checks existence | ✅ **MATCH** |
| `details` type | Array of objects | Checks isArray | ✅ **MATCH** |

**Assessment:** Fully aligned with validateQuery behavior. No mismatches.

---

## 4. Coverage Matrix

| Assertion | health.e2e.ts | api-validation.e2e.ts | validation.test.ts (unit) |
|-----------|:---:|:---:|:---:|
| 400 status | ✅ | ✅ | ✅ (via `.toBe(400)`) |
| `error` property exists | ✅ | ✅ | ✅ (via `.toBeTruthy()`/`.toContain`) |
| `error` = `"validation failed"` | ❌ | ✅ | ⚠️ (uses `.toContain("validation")`, not exact) |
| `details` property exists | ❌ | ✅ | ❌ |
| `details` is array | ❌ | ✅ | ❌ |
| `details` entry content (field/message) | ❌ | ⚠️ (only for station search field name) | ❌ |

---

## 5. Mismatches: NONE

### Status: ✅ No mismatches found

All test expectations align with `validateQuery`'s actual behavior:

- **HTTP 400 status** — asserted by both E2E tests and unit tests
- **`error` property** — existence checked by all, exact value `"validation failed"` checked by api-validation.e2e.ts
- **`details` property** — existence and array type checked by api-validation.e2e.ts

### Intentional Gaps (not mismatches)
The following are **intentionally not checked** and not considered mismatches:

1. **`details` entry content (message text)** — Not asserted in any test because message text is Zod-generated and version-dependent. Appropriate to avoid coupling tests to Zod's error message format.

2. **`error` value in health.e2e.ts** — Not checked because api-validation.e2e.ts covers this, making health.e2e.ts function as a minimal smoke check rather than a contract test.

---

## 6. Recommendations

### No action required
All test expectations match the actual behavior of `validateQuery`. The test suite provides:
- **Smoke testing** via health.e2e.ts (minimal assertions, fast feedback)
- **Schema enforcement verification** via api-validation.e2e.ts (thorough assertions)
- **Unit-level coverage** via validation.test.ts (400 status, error property)

### Optional enhancements (low priority)
If stronger isolation is desired for health.e2e.ts:
```ts
// Add one line for completeness (redundant with api-validation.e2e.ts)
expect(body.error).toBe("validation failed");
```

This would make health.e2e.ts fully self-contained for monitoring the health endpoint, but is not strictly necessary given existing coverage.

---

## Sources

- [validate-query-rejection-response.md](../docs/notes/validate-query-rejection-response.md) — validateQuery failure behavior (bf-2i9lz)
- [health-e2e-query-rejection-test-assertions.md](../docs/notes/health-e2e-query-rejection-test-assertions.md) — health.e2e.ts expectations (bf-29gra)
- [validatequery-vs-health-e2e-comparison.md](../docs/notes/validatequery-vs-health-e2e-comparison.md) — detailed comparison (bf-29gra)
- [api-validation.e2e.ts](../tests/e2e/api-validation.e2e.ts) — test source code
