# API Validation E2E vs validateQuery Response Structure

**Task:** Verify api-validation.e2e.ts query rejection tests match validateQuery output
**Bead:** bf-2w07g
**Date:** 2026-07-06

## validateQuery Response Structure (Source: validate-query-rejection-response.md)

When query validation fails, `validateQuery` returns:

- **HTTP Status Code:** 400
- **Response Body:**
  ```typescript
  {
    error: "validation failed";     // string literal
    details: Array<{               // always present, array of detail objects
      field: string;               // dot-joined Zod path
      message: string;             // human-readable error message
    }>;
  }
  ```

## Comparison Results

### ✅ Test 1: health endpoint (lines 12-21)

**Status: FULL MATCH**

```typescript
test("health endpoint rejects unexpected query parameters", async ({ request }) => {
  const response = await request.get("/api/health?extra=param");
  expect(response.status()).toBe(400);                    // ✓ matches

  const body = await response.json();
  expect(body).toHaveProperty("error");                   // ✓ matches
  expect(body.error).toBe("validation failed");          // ✓ matches
  expect(body).toHaveProperty("details");                 // ✓ matches
  expect(Array.isArray(body.details)).toBe(true);        // ✓ matches
});
```

**All expectations confirmed:**
- HTTP 400 status code
- `error` property exists
- `error === "validation failed"`
- `details` property exists
- `details` is an array

---

### ⚠️ Test 2: metrics endpoint (lines 23-30)

**Status: PARTIAL MATCH - Missing details validation**

```typescript
test("metrics endpoint rejects unexpected query parameters", async ({ request }) => {
  const response = await request.get("/api/metrics?debug=true");
  expect(response.status()).toBe(400);                    // ✓ matches

  const body = await response.json();
  expect(body).toHaveProperty("error");                   // ✓ matches
  expect(body.error).toBe("validation failed");          // ✓ matches
  // ⚠️ Missing: expect(body).toHaveProperty("details");
  // ⚠️ Missing: expect(Array.isArray(body.details)).toBe(true);
});
```

**Verified expectations:**
- HTTP 400 status code ✓
- `error` property exists ✓
- `error === "validation failed"` ✓

**Missing expectations:**
- `details` property existence
- `details` is an array

---

### ⚠️ Test 3: stations list endpoint (lines 32-39)

**Status: PARTIAL MATCH - Missing details validation**

```typescript
test("stations list endpoint rejects unexpected query parameters", async ({ request }) => {
  const response = await request.get("/api/stations?format=csv");
  expect(response.status()).toBe(400);                    // ✓ matches

  const body = await response.json();
  expect(body).toHaveProperty("error");                   // ✓ matches
  expect(body.error).toBe("validation failed");          // ✓ matches
  // ⚠️ Missing: expect(body).toHaveProperty("details");
  // ⚠️ Missing: expect(Array.isArray(body.details)).toBe(true);
});
```

**Verified expectations:**
- HTTP 400 status code ✓
- `error` property exists ✓
- `error === "validation failed"` ✓

**Missing expectations:**
- `details` property existence
- `details` is an array

---

## Summary

| Test | Status Code | Error Property | Error Value | Details Property | Details Array |
|------|-------------|----------------|-------------|------------------|---------------|
| health endpoint | ✅ | ✅ | ✅ | ✅ | ✅ |
| metrics endpoint | ✅ | ✅ | ✅ | ❌ Missing | ❌ Missing |
| stations list | ✅ | ✅ | ✅ | ❌ Missing | ❌ Missing |

## Recommendations

To achieve consistency and full coverage of the validateQuery response structure, the metrics and stations list endpoint tests should be updated to include the same `details` validation as the health endpoint test:

```typescript
expect(body).toHaveProperty("details");
expect(Array.isArray(body.details)).toBe(true);
```

This ensures all three tests validate the complete response shape returned by validateQuery.
