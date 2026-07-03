# validateQuery Rejection Response Shape

## Source

- **Function:** `validateQuery<T>(c: Context, schema: ZodSchema<T>): T | Response`
- **File:** `packages/server/src/middleware/validation.ts:167`
- **Import:** `packages/server/src/middleware/index.ts:9`

## Rejection Behavior

When query parameters fail Zod schema validation (including rejection of unexpected parameters via `.strict()`), `validateQuery` returns a Hono `Response` object. The caller pattern is:

```ts
const query = validateQuery(c, schema);
if (query instanceof Response) return query;
```

### HTTP Status Code

**400 Bad Request** (`c.json(errorResponse, 400)` at line 186)

### Response Body Shape

```ts
interface ValidationErrorResponse {
  error: "validation failed";          // string literal
  details: ValidationErrorDetail[];   // array of detail objects
}

interface ValidationErrorDetail {
  field: string;   // dot-joined Zod path, e.g. "limit" or "items[2].name"
  message: string; // human-readable error message
}
```

Defined at `validation.ts:23-26`.

### Example: Unexpected Query Parameter Rejection

Routes that accept no query parameters use `emptyQuerySchema` (`z.object({}).strict()`) defined in `packages/shared/src/schemas/params.ts:171`. When a client sends any query parameter to these routes, the response is:

```json
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "error": "validation failed",
  "details": [
    {
      "field": "unexpected-param",
      "message": "Unrecognized key(s) in object: 'unexpected-param'"
    }
  ]
}
```

The `details` array always contains at least one entry. Each entry has exactly two properties: `field` (string) and `message` (string).

### detail.message Content

The message varies by Zod error code (formatted by `formatZodError` at `validation.ts:28-78`):

| Zod Error Code | Message Format |
|---|---|
| `invalid_enum_value` | `"Must be one of: <options>"` |
| `too_small` (string) | `"String must be at least N character(s)"` |
| `too_small` (array) | `"Array must contain at least N item(s)"` |
| `too_small` (number) | `"Number must be at least N"` |
| `too_big` (string) | `"String must be at most N character(s)"` |
| `too_big` (array) | `"Array must contain at most N item(s)"` |
| `too_big` (number) | `"Number must be at most N"` |
| unrecognized keys (strict) | `"Unrecognized key(s) in object: 'key-name'"` |
| all others | `"Invalid value"` (or Zod's default message) |

### Usage Sites in app.ts

`validateQuery` is called in the following routes (file: `packages/server/src/app.ts`):

| Line | Schema | Notes |
|------|--------|-------|
| 963 | `emptyQuerySchema` | No query params allowed |
| 1067 | `emptyQuerySchema` | No query params allowed |
| 1173 | `emptyQuerySchema` | No query params allowed |
| 1259 | `emptyQuerySchema` | No query params allowed |
| 1268 | `stationSearchQuerySchema` | Allows `q`, `limit` |
| 1338 | `emptyQuerySchema` | No query params allowed |
| 1365 | `emptyQuerySchema` | No query params allowed |
| 1456 | `alertsQuerySchema` | Allows `limit`, `feed` |
| 1515 | `equipmentQuerySchema` | Allows `limit` |
| 1860 | `positionsQuerySchema` | Allows `limit` |
| 1891 | `emptyQuerySchema` | No query params allowed |
| 2083 | `tripQuerySchema` | Allows `limit`, `date` |
| 2198 | `commuteIdQuerySchema` | Allows `commuteId` |
| 2242 | `emptyQuerySchema` | No query params allowed |
| 2273 | `emptyQuerySchema` | No query params allowed |
