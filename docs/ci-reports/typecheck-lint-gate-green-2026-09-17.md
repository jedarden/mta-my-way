# Typecheck + lint gates green on main — 2026-09-17

Bead: `mtamyway-692a6a56` (umbrella: "486 TypeScript errors fail the CI 'lint'
step"). Predecessor reports:
[typecheck-gate-monitor-2026-09-04](./typecheck-gate-monitor-2026-09-04.md),
[lint-typecheck-deadline-verify-2026-09-13](./lint-typecheck-deadline-verify-2026-09-13.md).

## Verdict

**Both gates are green on a real pipeline run.** At `31e0812b`,
`mta-my-way-build-q9hm8` recorded `resolve-version: Succeeded`,
`lint: Succeeded`, `typecheck: Succeeded`, and the DAG advanced to `test` —
the first mta-my-way-build run to get past the lint gate since the
combined-step split (the 09-13 report's runs all died at lint or typecheck).

## The 486 were already fixed — except one error, which was uncommitted

The bead's counts date to 2026-09-03. Audit of the tree between then and this
pass:

| Error class | Count | Landed by |
|---|---|---|
| shared package | 7 | `5e136bd` (drop dangling `response-validation` re-export) |
| web product code | 10 | `7eed6d6` + `de4ac551` (fareStore `breakEvenRides`) |
| web test fixtures (467 across ~70 files) | 467 | `cd9e752d` (test-fixture half of the WIP), `c0b41cf8` (HomeScreen/FavoritesList last 8), `34452213` (service worker + background sync, 13), `d22109d1` (CommuteEditor / useInferredTrips) |

So at `f4fa5669` the clean room was down to **one** typecheck error:

```
packages/web/src/hooks/useTripTracker.test.ts(197,30): error TS2345:
Property 'retryable' is missing ... but required in type 'ApiErrorDetails'
```

(`ApiErrorDetails` at `packages/web/src/lib/apiEnhanced.ts:54` — `retryable`
is required.) The fix — `retryable: true` on the mocked prediction failure —
was sitting **uncommitted** in the shared checkout, the same failure mode this
repo has now hit three times (response-validation re-export, product-code
fixes, and now this). Landed as `73f97ee6`.

## Measurement method

`npm run typecheck` in CI runs in its own container against a fresh
`--depth 1` clone of `main`, so the shared checkout's uncommitted state never
reaches it. Two measurement workflows were submitted with an
`entrypoint` override and `podGC: OnWorkflowSuccess` (the 09-04 monitor's
method, plus log retention on failure):

| Run | Commit | Result |
|---|---|---|
| `mta-my-way-typecheck-manual-6cvg5` | `f4fa5669` | **1 error** (the `retryable` one above) |
| `mta-my-way-lint-manual-gsvmr` | `73f97ee6` | **1760 biome errors** |

The first run (`-ljc4x`) proved the other direction too: a local green means
nothing without the clean room, because the local tree carried the fix.

## The lint gate was red for a different, older reason

With typecheck no longer masking it, the split template's separate `lint`
node fails on its own merits: `mta-my-way-build-fhmn8` lint exit 1, and the
clean-room measurement above reproduces **1760 errors** — exactly the
"~1760-error repo-wide breakage" documented on 2026-09-13. Its remediation
was *also* left uncommitted in the shared checkout:

- `biome.json`: `"recommended": false` + ignore
  `packages/server/src/proto/compiled.{js,d.ts}` (both tracked; without the
  ignore, biome lints the generated bundle)
- `StationSearch.tsx`: drop the now-unused `noAutofocus` suppression
  (`suppressions/unused` fires once recommended rules are off)
- `middleware-helpers.ts` ×3 + `middleware-helpers.test.ts` ×1:
  `useHookAtTopLevel` suppressions on `vi.useFakeTimers()`/`useRealTimers()`
  (vitest API, not a React hook — the rule stays explicitly enabled)
- `alerts-equipment.test.ts` import order, `wcag-audit-2026-09-13.json` format

Delta verification: with the WIP config applied, `biome check` over the HEAD
versions of every locally-modified file flags exactly those five files — so
the batch is complete, not partial. Landed as `31e0812b` after reviewing each
hunk (all behavior-preserving; `middleware-helpers.test.ts` 58/58 and
`alerts-equipment.test.ts` 25/25 pass).

A caution for the next person: the `ci: auto-bump version` commits are **not**
evidence the pipeline is healthy — the bump runs inside `resolve-version`,
before lint, on every run. Only the per-node phases are evidence.

## Local verification at `31e0812b`

- `tsc --build` (full, tsbuildinfo cleared): exit 0
- `npm run lint`: biome flags only `packages/server/data/vapid-keys.json`
  (gitignored live key), two untracked WIP files, and a Playwright artifact —
  none of which exist in a clean clone
- `npm test`: 7092 passed / 112 failed — the failures are the standing
  known-red server auth/security baseline plus load-fringe timeouts under the
  4-fork run, unchanged by these commits; owned by the test-step beads, not
  this one

## What remains (other beads)

`test` (known-red suites, test-step-monitor-2026-09-04) and `docker-build`
(`mtamyway-a6230028`, deliberately not force-exercised) are downstream and
still red on their own merits. This bead's done-when — typecheck exit 0, a
build run past the lint gate — is met at `31e0812b`.
