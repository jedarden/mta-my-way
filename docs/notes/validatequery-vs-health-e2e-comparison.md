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
| Property exists | Yes — `error: "validation failed"` at `validation.ts:177` | `expect(body).toHaveProperty("error")` (`health.e2e.ts:75`) | **MATCH** |
| Property value | `"validation failed"` (string literal) | Not checked — only existence tested | **GAP** |

The test confirms `error` exists but does **not** verify its value is `"validation failed"`. Any response body with an `error` key (even `{ error: true }` or `{ error: "something else" }`) would pass this assertion.

**Impact:** Low. The only code path returning 400 from `/api/health` is `validateQuery`, which hard-codes `error: "validation failed"`. A different error value would require a code change in `validation.ts`. However, the test would also pass if a middleware or future code change added a different 400 response with an `error` key but a different value.

## 3. Response Body: `details` Property

| Aspect | validateQuery | Test Assertion | Match? |
|--------|--------------|---------------|--------|
| Property exists | Yes — `details: [{ field: string, message: string }]` at `validation.ts:178` | Not checked | **GAP** |

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

**Impact:** Negligible for E2E. The `details` array is for developer debugging and UI display, not for the health endpoint's contract. Checking it in E2E would couple the test to Zod's error message format.

## 4. Response Body: Content-Type Header

| Aspect | validateQuery | Test Assertion | Match? |
|--------|--------------|---------------|--------|
| Content-Type | `application/json` (set by `c.json()`) | Not explicitly checked | **NOT CHECKED** |

`c.json()` in Hono sets `Content-Type: application/json` automatically. The test doesn't assert on it, but `response.json()` would throw if the content type were wrong.

## 5. Test Specificity Assessment

### What the test checks (sufficient)
1. **400 status** — Confirms the server rejects unexpected query parameters. This is the critical assertion.
2. **`error` property exists** — Confirms the response body is a structured error, not an HTML error page or empty body.

### What the test does NOT check (acceptable gaps)
1. **`error` value** — Not checking `"validation failed"` means the test would still pass if the error message changed. This is acceptable because:
   - The value is an implementation detail of the validation layer
   - The E2E test's purpose is to verify the endpoint rejects unexpected params, not to lock in the exact error message
   - Unit tests on `validateQuery` itself (in `validation.test.ts`) should cover the exact response shape

2. **`details` array** — Not checking `details` avoids coupling the E2E test to Zod's error format. The `details` structure is already validated in:
   - `validation.test.ts` — unit tests on `formatZodError` and `validateQuery`/`validateBody`/`validateParams`
   - The TypeScript interfaces at `validation.ts:23-26`

3. **Specific field/message content** — Same rationale as above. The exact message text ("Unrecognized key(s) in object: 'extra'") is Zod-generated and could change across Zod versions.

### What could be added (optional)
- **`error` value assertion**: `expect(body.error).toBe("validation failed")` — one extra line, low coupling, high confidence. This would confirm the rejection comes from the validation layer specifically, not from some other middleware returning a 400 with a generic `error` key.

### Verdict: Test is appropriately scoped

The test serves its purpose as an E2E smoke check: it confirms the endpoint rejects unexpected query parameters with a 400 status and a structured JSON error. Checking the full response shape in E2E would be brittle (coupling to Zod message formats) and redundant (already covered by unit tests). Adding `expect(body.error).toBe("validation failed")` would be a small improvement for confidence, but not strictly necessary.

## Summary

| Check | Result |
|-------|--------|
| 400 status code | **MATCH** |
| `error` property exists | **MATCH** |
| `error` value = `"validation failed"` | **GAP** — not checked (acceptable for E2E) |
| `details` array presence/shape | **GAP** — not checked (acceptable, covered by unit tests) |
| Test specificity | **Appropriate** — minimal E2E smoke test, detailed validation covered by unit tests in `validation.test.ts` |
