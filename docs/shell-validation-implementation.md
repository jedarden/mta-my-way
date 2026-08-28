# SHELL Validation Implementation

## Location
`packages/server/src/security-startup.ts` lines 81-88

## Exact Implementation

```typescript
// -------------------------------------------------------------------------
// SHELL validation
// -------------------------------------------------------------------------
const shell = process.env["SHELL"];
if (!shell || shell.trim() === "") {
  const message = "SHELL is not set. This may cause issues with shell operations and debugging.";

  result.warnings.push(message);
}
```

## Implementation Details

### Check Conditions
- `!shell` - Checks if SHELL environment variable is undefined/null
- `shell.trim() === ""` - Checks if SHELL is set but empty/whitespace only
- Both conditions use OR (`||`) - triggers if either condition is true

### Message Text
```
"SHELL is not set. This may cause issues with shell operations and debugging."
```

### Result Handling
- Message is pushed to `result.warnings` array
- **result.passed is NOT modified** - The SHELL validation is a warning, not a fatal error

### Severity Level
- **Warning only** - Unlike ALLOWED_HOSTS which can cause `result.passed = false` in production
- Does not fail startup in any environment (development or production)
- Logged via `logger.warn()` when warnings array is non-empty (line 108)

## Context
The SHELL validation is part of the `validateSecurityConfiguration()` function which performs fail-fast security checks at server startup. SHELL is marked as "optional but recommended for debugging" in the function documentation (line 31).
