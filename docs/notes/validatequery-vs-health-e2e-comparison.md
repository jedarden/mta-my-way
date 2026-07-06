# validateQuery Output vs. health.e2e.ts Test Expectations — Comparison

## Overview

Point-by-point comparison of what `validateQuery` actually returns when rejecting unexpected query parameters versus what the `"rejects unexpected query parameters"` test in `health.e2e.ts` asserts.

**Source docs:**
- [validateQuery rejection response shape](./validate-query-rejection-response.md)
- [health.e2e.ts test assertions](./health-e2e-query-rejection-test-assertions.md)

## Scenario

A client sends `GET /api/health?extra=param`. The `/api/health` route calls `validateQuery(c, emptyQuerySchema)` where `emptyQuerySchema = z.object({}).strict()`. The `extra` key is not in the schema, so validation fails.

## 1. HTTP Status Code

| Aspect | validateQuery | Test Assertion | Match? |
|--------|--------------|---------------|--------|
| Code | `400` (`c.json(errorResponse, 400)` at `validation.ts:186`) | `expect(response.status()).toBe(400)` (`health.e2e.ts:72`) | **MATCH** |

No mismatch. The test expects 400 and `validateQuery` returns 400.

## 2. Response Body: `error` Property

| Aspect | validateQuery | Test Assertion | Match? |
|--------|--------------|---------------|--------|
| Property exists | Yes — `error: "validation failed"` at `validation.ts:178` | `expect(body).toHaveProperty("error")` (`health.e2e.ts:75`) | **MATCH** |
| Property value | `"validation failed"` (string literal) | Not checked — only existence tested | **GAP** |

The test confirms `error` exists but does **not** verify its value is `"validation failed"`. Any response body with an `error` key (even `{ error: true }` or `{ error: "something else" }`) would pass this assertion.

**Impact:** Low for `health.e2e.ts` specifically. The only code path returning 400 from `/api/health` is `validateQuery`, which hard-codes `error: "validation failed"`. A different error value would require a code change in `validation.ts`. However, the test would also pass if a middleware or future code change added a different 400 response with an `error` key but a different value.

> **Covered elsewhere:** `api-validation.e2e.ts:20` tests the same scenario (`/api/health?extra=param`) and asserts `expect(body.error).toBe("validation failed")` — an exact match. So the `error` value **is** verified at the E2E level, just not in `health.e2e.ts`.

## 3. Response Body: `details` Property

| Aspect | validateQuery | Test Assertion | Match? |
|--------|--------------|---------------|--------|
| Property exists | Yes — `details: [{ field: string, message: string }]` at `validation.ts:179` | Not checked | **GAP** |

The test does not verify the `details` array exists at all. For the `?extra=param` case, the actual response includes:

```json
{
  "error": "validation failed",
  "details": [
    {
      "field": "",
      "message": "Unrecognized key(s) in object: 'extra'"
    }
  ]
}
```

Note: The `field` is an empty string because `unrecognized_keys` issues in Zod have an empty path — the rejected key is not part of the schema's expected path. The `message` is Zod's default for unrecognized keys, which includes the key name.

> **Doc inconsistency:** The companion doc [validate-query-rejection-response.md](./validate-query-rejection-response.md) shows the message as `"Unrecognized key: \"extra\""`, while this doc originally showed `"Unrecognized key(s) in object: 'extra'"`. The actual message is Zod v4's runtime default (passed through `formatZodError`'s fallback at `validation.ts:76`), which is version-dependent. No unit test in `validation.test.ts` covers the `unrecognized_keys` case, so neither form has been verified against the running code. The exact message is not asserted by the E2E test, so this inconsistency has no test impact.

**Impact:** Negligible for E2E. The `details` array is for developer debugging and UI display, not for the health endpoint's contract. Checking it in E2E would couple the test to Zod's error message format.

> **Covered elsewhere:** `api-validation.e2e.ts:21-22` tests the same scenario and asserts `expect(body).toHaveProperty("details")` and `expect(Array.isArray(body.details)).toBe(true)`. The `details` array presence and type **are** verified at the E2E level, just not in `health.e2e.ts`. However, neither E2E test asserts on the content of individual `details` entries (field names or message text).

## 4. Response Body: Content-Type Header

| Aspect | validateQuery | Test Assertion | Match? |
|--------|--------------|---------------|--------|
| Content-Type | `application/json` (set by `c.json()`) | Not explicitly checked | **NOT CHECKED** |

`c.json()` in Hono sets `Content-Type: application/json` automatically. The test doesn't assert on it, but `response.json()` would throw if the response body were not valid JSON.

## 5. Test Specificity Assessment

### What the test checks (sufficient)
1. **400 status** — Confirms the server rejects unexpected query parameters. This is the critical assertion.
2. **`error` property exists** — Confirms the response body is a structured error, not an HTML error page or empty body.

### What the test does NOT check (acceptable gaps in health.e2e.ts)
1. **`error` value** — Not checking `"validation failed"` means the test would still pass if the error message changed. This is acceptable for `health.e2e.ts` because:
   - The value is an implementation detail of the validation layer
   - The E2E test's purpose is to verify the endpoint rejects unexpected params, not to lock in the exact error message
   - `api-validation.e2e.ts:20` **does** check `expect(body.error).toBe("validation failed")` for the same scenario, so the exact value is covered elsewhere

2. **`details` array** — Not checking `details` avoids coupling this particular test to Zod's error format. The `details` structure is defined by:
   - The TypeScript interfaces at `validation.ts:23-26` (compile-time shape guarantee)
   - `api-validation.e2e.ts:21-22` — checks `details` property exists and is an array for the same `/api/health?extra=param` scenario
   - `validation.test.ts` — unit tests on `validateQuery`/`validateBody`/`validateParams` verify 400 status and `error` property (using `.toContain("validation")`), but **do not assert on `details`** — no unit test checks `details` array existence, field names, or message content. The `formatZodError` function itself is tested only indirectly through the validate functions, never in isolation.

3. **Specific field/message content** — Neither `health.e2e.ts` nor `api-validation.e2e.ts` asserts on the content of individual `details` entries (field names or message text). This is acceptable because the exact message text is Zod-generated and could change across Zod versions.

### What could be added (optional)
- **`error` value assertion in health.e2e.ts**: `expect(body.error).toBe("validation failed")` — one extra line, low coupling, high confidence. Already present in `api-validation.e2e.ts`, so adding it here would be redundant but self-contained.
- **`details` content assertion**: Checking `body.details[0].field` or `body.details[0].message` would couple the test to Zod's error format. Not recommended for E2E.

### Broader test coverage matrix

| Assertion | health.e2e.ts | api-validation.e2e.ts | validation.test.ts |
|-----------|:---:|:---:|:---:|
| 400 status | ✓ | ✓ | ✓ (via `.toBe(400)`) |
| `error` property exists | ✓ | ✓ | ✓ (via `.toBeTruthy()` / `.toContain`) |
| `error` = `"validation failed"` | ✗ | ✓ | ✗ (uses `.toContain("validation")`) |
| `details` property exists | ✗ | ✓ | ✗ |
| `details` is array | ✗ | ✓ | ✗ |
| `details` entry content | ✗ | ✗ | ✗ |

### Verdict: Tests are appropriately scoped

`health.e2e.ts` serves its purpose as a minimal E2E smoke check: it confirms the endpoint rejects unexpected query parameters with a 400 status and a structured JSON error. The gaps (error value, details array) are covered by `api-validation.e2e.ts`, which explicitly tests Zod schema enforcement across multiple endpoints including health. Unit tests in `validation.test.ts` verify 400 status and `error` property but do not assert on `details` at runtime — the `details` shape is enforced only by TypeScript interfaces at compile time, and by the `api-validation.e2e.ts` E2E checks for presence/type. No test in the suite asserts on `details` entry content (field names or message text), which is appropriate since those are Zod-generated.

## 6. Assessment: Test Specificity vs. validateQuery Response Shape

### Question 1: Is omitting `details` assertions appropriate for a health endpoint smoke test?

**Answer: Yes.**

**Reasoning:**
- The health.e2e.ts test is a smoke test, not a contract test. Its purpose is to verify that the endpoint rejects unexpected query parameters with a 400 status and a structured JSON error response.
- The `details` array is an implementation detail of the validation layer (specifically the `formatZodError` function at `validation.ts:28-78`). The exact message text is Zod-generated and could change across Zod versions.
- Checking the content of `details` entries would couple the test to Zod's error message format, which is not stable or part of the API contract.
- Coverage exists elsewhere: `api-validation.e2e.ts:21-22` checks that `details` exists and is an array for the same `/api/health?extra=param` scenario. This provides E2E coverage of the `details` structure without coupling to specific message content.
- The TypeScript interfaces at `validation.ts:23-26` guarantee the `details` shape at compile time.

**Conclusion:** Omitting `details` assertions from health.e2e.ts is appropriate for a health endpoint smoke test. The test correctly focuses on the critical behavior (400 status + structured error) without coupling to implementation details.

### Question 2: Should the `error` value be pinned to `"validation failed"`?

**Answer: Optional, but not strictly necessary for health.e2e.ts.**

**Reasoning:**
- Current test only checks that `error` exists (`expect(body).toHaveProperty("error")`), which means it would pass even if the error value changed to something else (e.g., `{ error: true }` or `{ error: "something else" }`).
- The value `"validation failed"` is an implementation detail of the validation layer, hard-coded at `validation.ts:178`. A change to this value would require a code change in `validation.ts`, making it unlikely to change unnoticed.
- Coverage exists elsewhere: `api-validation.e2e.ts:20` explicitly asserts `expect(body.error).toBe("validation failed")` for the same scenario, providing E2E coverage of the exact value.
- Adding `expect(body.error).toBe("validation failed")` to health.e2e.ts would be a one-line addition with low coupling and high confidence, but it would duplicate coverage already present in api-validation.e2e.ts.

**Conclusion:** The `error` value should ideally be pinned for completeness, but health.e2e.ts can function without it given that api-validation.e2e.ts provides this coverage. If health.e2e.ts is intended to be self-contained for monitoring the health endpoint specifically, adding the assertion would improve test isolation.

### Question 3: Are any assertions redundant?

**Answer: No.**

**Reasoning:**
- **400 status assertion (`expect(response.status()).toBe(400)`):** Critical. Confirms the server rejects unexpected query parameters. This is the primary purpose of the test.
- **`error` property assertion (`expect(body).toHaveProperty("error")`):** Critical. Confirms the response body is a structured error, not an HTML error page or empty body. Distinguishes between different 400 response types.
- **No redundant assertions:** Each assertion checks a distinct aspect of the response. The 400 status checks HTTP behavior; the `error` property checks response structure.

**No overlap with other tests:** The health.e2e.ts test and api-validation.e2e.ts test both exercise the same `/api/health?extra=param` scenario, but they serve different purposes:
- health.e2e.ts: Verifies the health endpoint's query parameter rejection as part of health endpoint monitoring.
- api-validation.e2e.ts: Verifies Zod schema enforcement across multiple endpoints including health, with more detailed assertions.

**Conclusion:** No assertions are redundant. Each serves a distinct purpose in verifying the response's HTTP behavior and structure.

### Overall Verdict

The health.e2e.ts test is appropriately scoped as a minimal smoke check. It confirms:
1. The endpoint rejects unexpected query parameters with HTTP 400
2. The response is a structured JSON error (not HTML or empty)

The gaps (error value, details array) are intentional and covered by other tests in the suite. The test achieves its purpose without coupling to implementation details.

## Summary

| Check | health.e2e.ts | api-validation.e2e.ts | Overall |
|-------|:---:|:---:|:---:|
| 400 status code | **MATCH** | **MATCH** | ✅ |
| `error` property exists | **MATCH** | **MATCH** | ✅ |
| `error` value = `"validation failed"` | **GAP** | **MATCH** | ✅ |
| `details` array presence/type | **GAP** | **MATCH** | ✅ |
| `details` entry content (field/message) | **GAP** | **GAP** | Acceptable — Zod-generated |
| Test specificity | **Appropriate** (smoke test) | **Thorough** (schema enforcement) | ✅ |
