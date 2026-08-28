# env_parse Module Location Analysis

## Task Scope
Determine the correct location for the new env_parse module within the shared crate.

## Current Shared Crate Structure

### Directory Layout
```
packages/shared/src/
├── index.ts              # Main export file (barrel export)
├── utils/                # Utility functions
│   ├── env.ts           # Environment variable parsing (EXISTS)
│   ├── time.ts          # Time formatting/calculation
│   ├── confidence.ts    # Confidence scoring
│   ├── freshness.ts     # Data freshness utilities
│   ├── walking.ts       # Walking distance/time
│   ├── carbon.ts        # Carbon savings calculation
│   ├── patterns.ts      # Time bucket/pattern utilities
│   ├── context.ts       # Context-aware detection
│   ├── retry.ts         # Retry with exponential backoff
│   └── security.ts      # Security utilities
├── schemas/             # Zod validation schemas
├── types/               # TypeScript type definitions
├── constants/           # MTA feed/line metadata
└── observability/       # Logging/tracing
```

### Module Organization Pattern (from index.ts)
- **Types**: Exported first (lines 14-141)
- **Validation Schemas**: Zod schemas (lines 144-188)
- **Constants**: Feed configs, line metadata (lines 190-222)
- **Utilities**: Grouped by category (lines 225-335)
- **Observability**: Logger, tracing, OpenTelemetry (lines 337-388)

### Existing env.ts Module
**Location**: `packages/shared/src/utils/env.ts`

**Current exports**:
- `parseEnvBool()` - Parses string env vars as boolean

**Exported in index.ts** (line 335):
```typescript
export { parseEnvBool } from "./utils/env.js";
```

## Decision

### ✅ Recommended Location: `packages/shared/src/utils/env.ts`

**Rationale**:
1. **Already exists** - `env.ts` file is present and actively exported
2. **Consistent pattern** - All utilities grouped by category in `utils/` directory
3. **Clear purpose** - File name matches function (environment parsing)
4. **Follows conventions** - All other utilities follow same flat structure (no subdirectories)
5. **Barrel export** - Already included in `index.ts` exports

### Alternative: `packages/shared/src/utils/env_parse.ts`
**Not recommended** - Would create unnecessary separation when environment parsing utilities belong together

### Alternative: `packages/shared/src/env/parse.ts`
**Not recommended** - Over-engineering; no other utilities use subdirectory structure

## Implementation Pattern

To add new environment parsing functions:

1. **Add to `packages/shared/src/utils/env.ts`**:
```typescript
export function parseEnvNumber(value: string | undefined): number | undefined {
  // implementation
}
```

2. **Export in `packages/shared/src/index.ts`** (around line 335):
```typescript
export {
  parseEnvBool,
  parseEnvNumber,  // Add new functions here
} from "./utils/env.js";
```

## Module Structure Understanding

The shared crate uses a **flat barrel export pattern**:
- Each utility has its own file in `src/utils/`
- `index.ts` re-exports everything for clean imports
- Related functions grouped in same file
- No subdirectories unless category grows very large

## Conclusion

**Location**: `packages/shared/src/utils/env.ts`

**Next Steps**:
1. Add new parsing functions to existing `env.ts` file
2. Update `index.ts` exports to include new functions
3. Follow JSDoc pattern established by `parseEnvBool`
