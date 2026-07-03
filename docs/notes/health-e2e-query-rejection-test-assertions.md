# health.e2e.ts — "rejects unexpected query parameters" Test Assertions

## Source

- **File:** `tests/e2e/health.e2e.ts`
- **Test:** lines 70–76
- **Test name:** `"rejects unexpected query parameters"`

## Test Code

```ts
test("rejects unexpected query parameters", async ({ request }) => {
  const response = await request.get("/api/health?extra=param");
  expect(response.status()).toBe(400);

  const body = await response.json();
  expect(body).toHaveProperty("error");
});
```

## Assertions (line-by-line)

### Line 72 — Status code

```
expect(response.status()).toBe(400);
```

| Property | Expected Value |
|----------|---------------|
| **HTTP status code** | `400` (Bad Request) |

The test sends `GET /api/health?extra=param` — a query string with an unexpected parameter — and asserts the server responds with a `400` status.

### Line 75 — Response body has `error` property

```
expect(body).toHaveProperty("error");
```

| Property | Expected Value |
|----------|---------------|
| **`body.error`** | Must exist (any truthy value) |

The test only checks that the `error` key exists on the JSON response body. It does **not** assert on the exact value of `error` (e.g., `"validation failed"`), nor does it check for the `details` array that `validateQuery` actually returns.

## What the test does NOT assert

Based on the [`validateQuery` rejection response shape](./validate-query-rejection-response.md), the actual server response for this request is:

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

The test is intentionally minimal — it only verifies:

1. The server rejects the request (400 status)
2. The response body contains an `error` property

It does not verify:
- The value of `error` (not checked against `"validation failed"`)
- The presence or shape of the `details` array
- The specific field name or message in `details`

## Relationship to validateQuery

The `/api/health` route uses `emptyQuerySchema` (`z.object({}).strict()`) to reject all query parameters. When `extra=param` is sent, `validateQuery` returns a 400 response via the rejection path documented in [`validate-query-rejection-response.md`](./validate-query-rejection-response.md).
