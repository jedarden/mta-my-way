# Search Tools Verification

**Date:** 2026-08-28  
**Purpose:** Verify search tool availability before running full codebase searches

## Tool Versions

### ripgrep (rg)
- **Version:** 15.1.0
- **Features:** +pcre2
- **SIMD (compile):** +SSE2, -SSSE3, -AVX2
- **SIMD (runtime):** +SSE2, +SSSE3, +AVX2
- **PCRE2:** 10.45 (JIT available)
- **Location:** `/run/current-system/sw/bin/rg`

### grep
- **Version:** GNU grep 3.12
- **License:** GPLv3+
- **PCRE2:** 10.46 (2025-08-27)
- **Location:** `/run/current-system/sw/bin/grep`

## Functionality Testing

Both tools were tested with searches in the `packages/` directory:

### Test 1: Search for "function" keyword
- **ripgrep:** Found 20+ files across packages/web and packages/server
- **grep:** Found 20+ files across packages/server
- **Result:** ✅ Both tools working correctly

### Test 2: Search for "interface.*Station" pattern
- **ripgrep:** Found 10 files (web components and shared types)
- **grep:** Found 11 files (shared types and dist files)
- **Result:** ✅ Both tools working correctly

### Test 3: Search for "const createMockStation"
- **ripgrep:** Not found (exit code 1)
- **grep:** Not found (exit code 1)
- **Result:** ✅ Both tools correctly reporting no matches

## Tool Comparison

### ripgrep (rg)
**Advantages:**
- Faster for large codebases
- Better TypeScript/JavaScript file detection via `--type ts` and `--type js`
- Cleaner regex syntax
- Built-in file type filtering
- More modern and maintainable
- Better for interactive use

**Usage:**
```bash
rg "pattern" packages/ --type ts --type js -l    # List matching files
rg "pattern" packages/ --type ts -A 5 -B 2     # Show context
```

### grep
**Advantages:**
- Available on virtually all Unix systems
- More portable scripts
- Familiar to all developers
- Better for shell pipelines

**Usage:**
```bash
grep -r "pattern" packages/ --include="*.ts" --include="*.js" -l
grep -r "pattern" packages/ --include="*.ts" -A 5 -B 2
```

## Recommendation

**Preferred tool for full codebase search:** **ripgrep (rg)**

**Reasons:**
1. Significantly faster for large codebases
2. Better TypeScript/JavaScript support with built-in type detection
3. More developer-friendly interface and output
4. Actively maintained with modern features

**When to use grep:**
- Writing portable shell scripts
- Maximum compatibility is required
- Simple, one-off searches

## Example Search Patterns

### Find all usages of a symbol
```bash
rg "createMockStation" packages/ --type ts -l
```

### Find interface definitions
```bash
rg "^interface.*Station" packages/ --type ts
```

### Find all exports
```bash
rg "^export" packages/ --type ts -l
```

### Search with context
```bash
rg "function.*Station" packages/ --type ts -A 3 -B 1
```
