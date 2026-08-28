# env_parse Module Location Analysis

## Date: 2026-08-28

## Current Shared Crate Structure

### Directory Layout
```
packages/shared/src/
├── index.ts              # Main entry point, exports all public APIs
├── utils/                # Utility functions
│   ├── env.ts           # Environment variable parsing (ALREADY EXISTS)
│   ├── time.ts          # Time formatting and calculation
│   ├── confidence.ts    # Confidence scoring utilities
│   ├── freshness.ts     # Data freshness checking
│   ├── walking.ts       # Walking distance/time calculation
│   ├── carbon.ts        # Carbon savings calculation
│   ├── patterns.ts      # Time bucket and pattern utilities
│   ├── context.ts       # Context-aware detection
│   ├── retry.ts         # Retry with exponential backoff
│   └── security.ts      # Security utilities
├── types/               # TypeScript type definitions
├── constants/           # Constant values (feeds, lines)
├── schemas/            # Zod validation schemas
└── observability/       # Logging, tracing, OpenTelemetry
```

### Current env.ts Content
The file **already exists** at `packages/shared/src/utils/env.ts` and contains:
- `parseEnvBool()` - Parse string environment variable as boolean

It is properly exported in `src/index.ts` at line 335:
```typescript
// Environment variable parsing utilities
export { parseEnvBool } from "./utils/env.js";
```

## Decision

### Location: `packages/shared/src/utils/env.ts`

**DO NOT create a new file.** Add new env_parse functionality to the existing `env.ts` file.

### Rationale

1. **File Already Exists**: `env.ts` is already established for environment parsing utilities
2. **Follows Established Pattern**: All utilities are grouped in single files by domain (time.ts, confidence.ts, etc.)
3. **Cleaner Export Structure**: Single export line in index.ts rather than multiple tiny files
4. **Consistency**: Matches the pattern used for all other utilities in the crate

## Module Organization Pattern

### Export Pattern in index.ts
```typescript
// ====== Section Header (with === separators) =======

// Brief description
export {
  functionName,
  anotherFunction,
  type TypeName,
} from "./module/path.js";
```

### Key Conventions
1. **Named exports only** - No default exports
2. **File organization by domain** - Related functions in single files
3. **Test files alongside source** - `function.test.ts` next to `function.ts`
4. **Type exports grouped separately** - Types listed in dedicated section
5. **Use `.js` extensions** - Even for TypeScript imports

## Adding New env_parse Functions

### Steps:
1. Add new functions to `packages/shared/src/utils/env.ts`
2. Export them in `src/index.ts` under "Environment variable parsing utilities"
3. Create/add to `packages/shared/src/utils/env.test.ts`
4. Run `npm test` to verify

### Example Addition:
```typescript
// In packages/shared/src/utils/env.ts
export function parseEnvInt(value: string | undefined, defaultValue: number): number {
  // implementation
}

export function parseEnvString(value: string | undefined, defaultValue: string): string {
  // implementation
}
```

```typescript
// In packages/shared/src/index.ts
// Environment variable parsing utilities
export {
  parseEnvBool,
  parseEnvInt,
  parseEnvString,
} from "./utils/env.js";
```

## Acceptance Criteria Met

- ✅ **Location identified**: `packages/shared/src/utils/env.ts`
- ✅ **Current module structure documented**: See directory layout above
- ✅ **Decision on file path made**: Add to existing `env.ts`, do not create new file
- ✅ **lib.rs (index.ts) module pattern understood**: Named exports, .js extensions, domain grouping
