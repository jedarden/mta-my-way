# validateQuery 400 Status Code Comparison — validateQuery vs health.e2e.ts

## Conclusion: MATCH

The HTTP 400 status code returned by `validateQuery` matches the assertion in the health.e2e.ts test exactly.

## Source Side — validateQuery

- **File:** `packages/server/src/middleware/validation.ts:186`
- **Code:** `return c.json(errorResponse, 400);`
- **Documented in:** [`validate-query-rejection-response.md`](./validate-query-rejection-response.md) — "HTTP Status Code" section

The function returns a Hono `Response` with status code `400` whenever Zod validation fails, including when unexpected query parameters are rejected via `.strict()`.

## Test Side — health.e2e.ts

- **File:** `tests/e2e/health.e2e.ts:72`
- **Code:** `expect(response.status()).toBe(400);`
- **Documented in:** [`health-e2e-query-rejection-test-assertions.md`](./health-e2e-query-rejection-test-assertions.md) — "Line 72 — Status code" section

The test sends `GET /api/health?extra=param` (an unexpected query parameter) and asserts the server responds with HTTP 400.

## Verification

| Aspect | validateQuery (source) | health.e2e.ts (test) | Match? |
|--------|----------------------|---------------------|--------|
| Status code | `400` (line 186 of `validation.ts`) | `400` (line 72 of `health.e2e.ts`) | **Yes** |
| Trigger | Zod validation failure on query params | Unexpected `extra` param via `emptyQuerySchema` | **Consistent** |

The `/api/health` route uses `emptyQuerySchema` (`z.object({}).strict()`), so sending `extra=param` triggers the rejection path in `validateQuery`, which returns 400. The test asserts exactly that.
