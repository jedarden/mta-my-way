# Lint Findings — 2026-07-04

## Current Status: CLEAN ✅

As of commit `5547a77`, the project passes lint with zero errors (567 files checked).

## History of Errors and Fixes

### CI Workflow Run (captured 2026-07-04T01:40Z)

**Result:** 3 biome formatting errors, 0 eslint errors

Errors captured via debug workflow (podGC override to `OnWorkflowCompletion`) and saved to `docs/research/lint-logs-2026-07-04.txt`.

| # | File | Rule | Issue |
|---|------|------|-------|
| 1 | `tests/e2e/test-results/.last-run.json` | `format` | Missing trailing newline (auto-generated file) |
| 2 | `packages/server/src/integration/test-helpers.ts` | `format` | Multi-line function params should collapse to single line |
| 3 | `packages/server/src/middleware/token-encryption.ts` | `format` | Multi-line function params should collapse to single line |

All 3 were fixed in commit `5547a77`.

### Earlier Runs (2026-07-03)

Two separate local runs and one CI run showed more errors:

- **CI debug workflow:** 4 errors (package.json workspace formatting, organizeImports in migration files, function param line breaks)
- **Local run:** 5 errors (all in test files — cross-cutting.test.ts, app.test.ts, auto-generated JSON)
- **CI build workflow:** ESLint OOM crash (exit code 134) due to 2Gi memory limit — resolved by using a debug workflow with `OnWorkflowCompletion` podGC

See `docs/notes/lint-findings-2026-07-03.md` and `docs/ci-logs/lint-oom-2026-07-03.md` for details.

## Lint Log Files

| File | Source | Errors |
|------|--------|--------|
| `docs/research/lint-logs-2026-07-04.txt` | Debug workflow pod | 3 (all fixed) |
| `docs/notes/lint-output-2026-07-03.txt` | Local run | 5 |
| `docs/notes/lint-logs.txt` | CI workflow pod | 4 |
| `docs/notes/lint-findings-2026-07-03.md` | Analysis summary | 5 documented |
| `docs/ci-logs/lint-oom-2026-07-03.md` | CI build OOM crash | N/A (ESLint OOM) |
| `docs/ci-reports/lint-debug-bf-uytr9.md` | Debug workflow report | 0 (already clean) |

## Remaining Warnings (non-blocking)

- **ESLint:** Deprecation warning about `.eslintignore` — should migrate to `ignores` in `eslint.config.js`
- **Auto-generated files:** `test-results/` and `tests/e2e/test-results/` are playwright output — should be gitignored or added to biome ignore config
