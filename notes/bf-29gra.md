# validateQuery vs health.e2e.ts Comparison

## Task: Verify health.e2e.ts query rejection test matches validateQuery output

## Test Under Review
Location: `tests/e2e/health.e2e.ts:71-77`

```typescript
test("rejects unexpected query parameters", async ({ request }) => {
  const response = await request.get("/api/health?extra=param");
  expect(response.status()).toBe(400);

  const body = await response.json();
  expect(body).toHaveProperty("error");
});
```

## validateQuery Response Structure

### Type Definition (validation.ts:23-26)
```typescript
interface ValidationErrorResponse {
  error: "validation failed";
  details: ValidationErrorDetail[];
}
```

### Actual Response (validation.ts:177-186)
```typescript
const errorResponse: ValidationErrorResponse = {
  error: "validation failed",
  details: formatZodError(result.error),
};
return c.json(errorResponse, 400);
```

### ValidationErrorDetail Type (validation.ts:18-21)
```typescript
interface ValidationErrorDetail {
  field: string;
  message: string;
}
```

### Example Response for unrecognized query param
```json
{
  "error": "validation failed",
  "details": [
    { "field": "extra", "message": "Unrecognized key" }
  ]
}
```

## Comparison Results

### 1. 400 Status Code ✅ MATCHES
- **Test expects**: `expect(response.status()).toBe(400)`
- **validateQuery returns**: `return c.json(errorResponse, 400)`
- **Verdict**: Exact match

### 2. "error" Property ✅ MATCHES (existence only)
- **Test checks**: `expect(body).toHaveProperty("error")`
- **validateQuery returns**: `{ error: "validation failed", details: [...] }`
- **Verdict**: Property exists, test passes
- **Note**: Test does NOT verify the value is "validation failed"

### 3. Missing Assertions

The test does NOT validate:
- **error value**: Should be exactly "validation failed"
- **details array**: Should be present and be an array
- **details content**: Should have at least one entry with field and message

## Test Specificity Assessment

The test is **minimal but correct**. It verifies:
- ✅ Wrong query params trigger 400 status
- ✅ Response body has an error property

It does NOT verify:
- ❌ The specific error message ("validation failed")
- ❌ The details array structure
- ❌ The specific field/error in details

### Recommendation
The current test is sufficient as a **smoke test** for query validation behavior. For full coverage, consider adding:

```typescript
expect(body.error).toBe("validation failed");
expect(body.details).toBeInstanceOf(Array);
expect(body.details).toHaveLength(1);
expect(body.details[0]).toHaveProperty("field");
expect(body.details[0]).toHaveProperty("message");
expect(body.details[0].field).toBe("extra");
```

However, since this is an E2E test and the validation middleware is unit-tested elsewhere, the current minimal test is acceptable. The critical behavior (400 on bad input, error property exists) is verified.

## Conclusion
✅ **Test matches validateQuery output** for the asserted properties (400 status, error property exists). The test is intentionally minimal and focuses on the happy path of error handling rather than exhaustive validation of the error response schema.
