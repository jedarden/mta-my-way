# Lint Findings — 2026-07-03

## Result: FAILED (5 errors — all biome formatting/organize-imports, zero eslint errors)

All 5 errors are auto-fixable via `npm run lint:fix` (or `biome check --write .`).
None are logic bugs — purely formatting style mismatches.

## Errors by File

### 1. `packages/server/src/security/cross-cutting.test.ts` — 4 errors

| # | Rule | Line | Issue |
|---|------|------|-------|
| 1 | `organizeImports` | 25-34 | Import names not alphabetically sorted within `../middleware/authentication.js` import |
| 2 | `organizeImports` | 36-37 | Named imports from `../middleware/index.js` and `../middleware/password-management.js` not sorted |
| 3 | `format` | 164-166 | `app.request()` call spans 3 lines; biome wants it collapsed to 1 line |
| 4 | `format` | 242-245 | `maliciousPaths` array spans 4 lines; biome wants it collapsed to 1 line |
| 5 | `format` | 679 | `console.log()` template literal too long for single line; biome wants it wrapped |

### 2. `packages/server/src/app.test.ts` — 1 error

| # | Rule | Line | Issue |
|---|------|------|-------|
| 1 | `format` | 505 | `.toContain(parsed.data.feeds[0].status)` needs wrapping to next line |

### 3. Auto-generated files — 2 errors (should be gitignored)

| File | Rule | Issue |
|------|------|-------|
| `tests/e2e/test-results/.last-run.json` | `format` | Missing trailing newline |
| `test-results/.last-run.json` | `format` | Missing trailing newline |

These are playwright/test runner output files and should not be committed. They can be ignored for lint purposes or added to biome ignore.

## Fix Strategy

1. Run `npm run lint:fix` to auto-fix all 5 errors
2. Verify `test-results/` and `tests/e2e/test-results/` are in `.gitignore` and biome ignore config
3. Run `npm run lint` again to confirm clean
