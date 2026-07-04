# Investigation: Query Param Rejection Test

## Task
Verify that `/api/health?extra=param` correctly returns 400 with an error property, ensuring the sanitization middleware doesn't interfere with validation.

## Findings

### Architecture is Working Correctly

The input sanitization middleware and validation layer work together properly:

1. **inputSanitization middleware** (`packages/server/src/middleware/input-sanitization.ts`)
   - Preserves ALL query parameter keys
   - Only sanitizes VALUES (prevents XSS, SQL injection, command injection, path traversal)
   - Stores sanitized params via `c.set("sanitizedQuery", ...)`

2. **validateQuery function** (`packages/server/src/middleware/validation.ts`)
   - Prefers `sanitizedQuery` over raw query params (defense in depth)
   - Falls back to raw params if sanitization hasn't run
   - Uses Zod's `.strict()` to reject unknown keys

3. **Health endpoint** (`packages/server/src/app.ts`)
   - Uses `emptyQuerySchema = z.object({}).strict()`
   - Zod's strict mode rejects any unknown parameters

### Flow for `/api/health?extra=param`:

1. Request arrives with query params `{ extra: "param" }`
2. inputSanitization middleware sanitizes value `"param"` and stores `{ extra: "param" }`
3. Health endpoint calls `validateQuery(c, emptyQuerySchema)`
4. validateQuery retrieves sanitized query params (still has `extra: "param"`)
5. Zod's `emptyQuerySchema.strict()` rejects unknown key `extra`
6. Returns 400 with:
   ```json
   {
     "error": "validation failed",
     "details": [
       {
         "field": "",
         "message": "Unrecognized key: \"extra\""
       }
     ]
   }
   ```

### Key Implementation Detail

The `sanitizeParams` function in `packages/server/src/middleware/sanitization.ts` (lines 503-528) iterates over ALL entries in the params object:

```typescript
for (const [key, value] of Object.entries(params)) {
  const sanitizedKey = sanitizeStringSimple(key, {...});
  sanitized[sanitizedKey] = sanitizeStringSimple(value, options);
}
```

This means unknown parameters are PRESERVED, not stripped. The sanitization layer prevents injection attacks, while the validation layer (Zod) enforces schema compliance.

### Test Results

✅ **Unit test** (`packages/server/src/app.test.ts`): PASSING
✅ **E2E test** (`tests/e2e/health.e2e.ts`): PASSING (all 30 tests passed)

## Conclusion

No changes needed. The architecture correctly implements defense in depth:
- Sanitization layer prevents injection attacks
- Validation layer rejects unknown parameters
- Tests verify the behavior across multiple browsers (chromium, firefox, webkit, mobile)

The concern that "sanitization strips unknown params" was unfounded - sanitization preserves all keys and only sanitizes values.
