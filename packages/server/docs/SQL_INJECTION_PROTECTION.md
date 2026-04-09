# SQL Injection Protection

This document describes the SQL injection protection mechanisms in place for the MTA My Way application.

## Overview

The application uses **parameterized queries** throughout as the primary defense against SQL injection attacks. The `better-sqlite3` library's prepared statements with `?` placeholders ensure that user input is always treated as data, never as executable SQL.

## Protection Layers

### 1. Parameterized Queries (Primary Defense)

All database queries use prepared statements with `?` placeholders:

```typescript
// ✅ SAFE - Parameterized query
db.prepare("SELECT * FROM trips WHERE id = ?").get(tripId);

// ❌ UNSAFE - Never do this
db.prepare(`SELECT * FROM trips WHERE id = '${tripId}'`).get();
```

**Files using parameterized queries:**
- `trip-tracking.ts` - All trip queries
- `context-service.ts` - All context queries
- `push/subscriptions.ts` - All subscription queries
- `migration/migration.ts` - All migration queries

### 2. SQL Identifier Validation

When dynamic SQL identifiers (table/column names) are needed, they are validated:

```typescript
import { validateTableName, validateColumnName } from './migration/sql-validator.js';

// Only allows alphanumeric strings starting with letter or underscore
const safeTableName = validateTableName(userInput); // Throws if invalid
```

**Validation rules:**
- Must start with letter (a-z, A-Z) or underscore (_)
- Can contain letters, digits (0-9), and underscores
- Maximum 128 characters
- Cannot be a SQL reserved keyword
- No SQL comments (`--`, `/* */`)
- No statement separators (`;`)
- No quotes (`'`, `"`, `` ` ``)
- No square brackets (`[`, `]`)
- No whitespace

### 3. Input Sanitization Middleware

The `inputSanitization()` middleware applies to all API routes (`/api/*`):

```typescript
app.use("/api/*", inputSanitization());
```

**Sanitization includes:**
- Strips HTML tags
- Removes SQL injection patterns (`OR 1=1`, `UNION SELECT`, etc.)
- Removes command injection patterns (`;`, `|`, `&`, backticks)
- Removes path traversal patterns (`../`)
- Normalizes whitespace
- Enforces maximum length limits

### 4. Zod Schema Validation

All API endpoints use Zod schemas for request validation:

```typescript
const params = validateParams(c, stationIdParamsSchema);
const query = validateQuery(c, tripQuerySchema);
const body = await validateBody(c, tripCreateRequestSchema);
```

This provides:
- Type safety
- Format validation (UUIDs, dates, enums)
- Length constraints
- Required field enforcement

### 5. Path Parameter Sanitization

Path parameters are sanitized before use:

```typescript
function sanitizePathParams(params: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    const sanitizedKey = sanitizeStringSimple(key, { /* options */ });
    sanitized[sanitizedKey] = sanitizeStringSimple(value, { /* options */ });
  }
  return sanitized;
}
```

## Safe Dynamic Query Construction

When building dynamic WHERE clauses, only hardcoded condition strings are used:

```typescript
// ✅ SAFE - Conditions are hardcoded, values are parameterized
const conditions: string[] = ["1=1"];
const sqlParams: unknown[] = [];

if (startDate) {
  conditions.push("date >= ?");
  sqlParams.push(startDate);
}

const rows = db
  .prepare(`SELECT * FROM trips WHERE ${conditions.join(" AND ")} LIMIT ? OFFSET ?`)
  .all(...sqlParams);
```

## Schema Migrations

Schema migrations use `db.exec()` for DDL statements, but these are **hardcoded strings** with no user input:

```typescript
// ✅ SAFE - Hardcoded schema definition
db.exec(`
  CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    origin_station_id TEXT NOT NULL,
    ...
  )
`);
```

## Testing

Comprehensive test coverage ensures protections work:

- `sql-validator.test.ts` - 32 tests for identifier validation
- `input-sanitization.test.ts` - Tests for sanitization middleware
- `validation.test.ts` - Tests for request validation
- Integration tests for all database operations

## Best Practices

1. **Always use parameterized queries** for values
2. **Validate identifiers** when dynamic table/column names are needed
3. **Use Zod schemas** for request validation
4. **Never concatenate** user input into SQL strings
5. **Use `db.exec()` only** for hardcoded schema statements

## References

- [OWASP SQL Injection](https://owasp.org/www-community/attacks/SQL_Injection)
- [better-sqlite3 Documentation](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)
- [SQLite Prepared Statements](https://www.sqlite.org/c3ref/stmt.html)
