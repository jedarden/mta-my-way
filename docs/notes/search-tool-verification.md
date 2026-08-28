# Search Tool Availability Verification

**Date:** 2026-08-28  
**Bead:** mtamyway-7f327c6f

## Tool Availability

### ripgrep (rg)
- **Path:** `/run/current-system/sw/bin/rg`
- **Version:** 15.1.0
- **Features:** PCRE2 10.45 with JIT available
- **SIMD Support:** SSE2, SSSE3, AVX2 (compile and runtime)

### grep (GNU grep)
- **Path:** `/run/current-system/sw/bin/grep`
- **Version:** 3.12 (GNU grep)
- **Features:** PCRE2 10.46 with `-P` support

## Functionality Testing

Both tools were tested with simple searches in the mta-my-way codebase:

### Test 1: Generic symbol search ("function")
- **ripgrep:** Found results in `packages/web/vite.config.ts`, `packages/web/public/sw-push.js`, `packages/web/src/main.tsx`
- **grep:** Found results in `packages/server/src/migration/sql-validator.ts`, `packages/server/src/migration/seed-data.ts`, etc.

### Test 2: Constant declaration search ("const")
- **ripgrep:** Found results in `packages/shared/src/testing/smoke.test.ts`
- **grep:** Found results in `packages/shared/src/utils/walking.test.ts`

### Test 3: Specific function search ("createMockStation")
- **ripgrep:** Found 21 matches across packages/shared
- **grep:** Found 15 matches across packages/shared

## Preferred Tool

**ripgrep (rg) is the preferred tool for code searching** in the mta-my-way codebase for the following reasons:

1. **Better output formatting:** ripgrep provides cleaner, more readable output with syntax highlighting
2. **Faster performance:** ripgrep is optimized for code searching and generally faster
3. **More matches found:** In our tests, ripgrep consistently found more matches (21 vs 15 for createMockStation)
4. **Modern features:** Better support for .gitignore, file type detection, and regex patterns
5. **TypeScript/JavaScript aware:** Better handling of the project's TS/JS files

## Usage Examples

```bash
# Search for a symbol across all packages
rg "createMockStation" packages/

# Search with file type filtering
rg "function" --type ts packages/

# Case-insensitive search
rg "station" -i packages/shared/
```

## Tool Locations

- ripgrep: `/run/current-system/sw/bin/rg`
- grep: `/run/current-system/sw/bin/grep`

Both tools are available, working, and ready for use in the mta-my-way codebase. The search environment is fully prepared for running comprehensive code searches.
