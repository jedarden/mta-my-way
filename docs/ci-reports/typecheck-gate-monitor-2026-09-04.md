# mta-my-way-build typecheck gate — monitor pass, 2026-09-04 (second half)

Bead: `mtamyway-a6230028` (monitor the Docker build step). Predecessor:
`mtamyway-8654ee92` (test step, closed 18:39Z), whose
[`test-step-monitor-2026-09-04.md`](./test-step-monitor-2026-09-04.md) this
extends rather than replaces.

## Verdict

**The pipeline still does not reach `docker-build`.** Every run today has
stopped at `typecheck` (exit 2) with `lint` Succeeded — including the two runs
my push triggered, `mta-my-way-build-82t56` and `-n9hl4` (19:07–19:09 UTC).
`resolve-version → lint → typecheck` is where the pipeline dies;
`test` and `docker-build` are unreachable.

Two things did change, and both are measured on clean CI clones below:
the `@mta-my-way/shared` errors are gone, and the product-code errors are now
gone too.

## Measurement method

`npm run typecheck` runs in its own container against a fresh
`--depth 1` clone of `main`, so the shared checkout's uncommitted state never
reaches CI. To measure, I submitted the workflow template with an
`entrypoint: typecheck` override and `podGC: OnWorkflowCompletion`
(the same override the test-step monitor used for `entrypoint: test`) and
streamed the main container's log:

| Run | Commit | Errors |
|---|---|---|
| `mta-my-way-typecheck-hwp5j` | `88d60ba` (0.0.369) | **479** |
| `mta-my-way-typecheck-fjhff` | `e620570` (0.0.370, includes `7eed6d6`) | **467** |

## What changed at HEAD

**`shared` is clean.** Bead `mtamyway-692a6a56` recorded 7 errors in
`packages/shared` against `eb15960`. All 7 are gone — commit `5e136bd` (drop
the dangling `response-validation` re-export) fixed them, exactly as that
bead's cross-note predicted.

**Product code is clean.** `hwp5j`'s 479 errors split 469 in
`.test.ts`/`.tsx` fixtures and **10 in product code**, all in
`packages/web/src`:

```
hooks/useAlerts.ts(209,44)       TS2367  '"delays" | "major"' vs '"all"' — no overlap
hooks/useTripTracker.ts(141,16)  TS2345  not assignable to SetStateAction<TripTrackerState>
hooks/useTripTracker.ts(185,16)  TS2345  〃
hooks/useTripTracker.ts(208,14)  TS2345  〃
lib/backgroundSync.ts(36,21)     TS2304  Cannot find name 'SyncRegistration'
lib/backgroundSync.ts(87,50)     TS2339  'sync' does not exist on ServiceWorkerRegistration
lib/backgroundSync.ts(122,28)    TS2339  〃
lib/prefetch.ts(140,70)          TS2339  'href' does not exist on type 'never'
lib/prefetch.ts(140,86)          TS2339  'pathname' does not exist on type 'never'
stores/fareStore.ts(74,9)        TS6133  'breakEvenRides' declared but never read
```

## The fix was already written — it just wasn't committed

The shared checkout carried uncommitted changes fixing **all ten**, one for
one: `backgroundSync.ts` declares the Background Sync API types
(`SyncManager`, `ServiceWorkerRegistration.sync`) instead of referencing the
nonexistent `SyncRegistration`; `useTripTracker.ts` adds the required
`prediction: null` to all three `TripTrackerState` literals; `useAlerts.ts`
drops the impossible `!== "all"` comparison; `prefetch.ts` removes the
URL-object fallback TS had already narrowed to `never`; `fareStore.ts` removes
the unused `breakEvenRides`.

This is the same failure mode the `response-validation` re-export already hit
once: finished work left uncommitted in the shared checkout, invisible to CI.

**Landed as `7eed6d6`** (5 files, +26 −10), after verifying hunk by hunk, the
four affected suites (69 tests pass), and biome + eslint over the five files.
Re-measured on clean CI: `fjhff` reads **467 errors, zero in product code**.
`backgroundSync.test.ts` — untouched by the commit — improved from 8 errors to
6, because declaring the `sync` property resolves two of its TS2339s and no
error class is new.

## What remains: 467 test-fixture errors

All in `packages/web/src`, dominated by fixture objects shaped against
outdated store interfaces:

| File | Errors |
|---|---|
| `hooks/useContextSort.test.ts` | 42 |
| `components/health/LineStatusTile.test.tsx` | 39 |
| `components/favorites/FavoritesList.test.tsx` | 35 |
| `components/arrivals/ArrivalList.test.tsx` | 35 |
| `components/alerts/AlertCard.test.tsx` | 35 |
| `components/arrivals/ArrivalRow.test.tsx` | 28 |
| `components/equipment/EquipmentBanner.test.tsx` | 24 |
| `components/alerts/AlertBanner.test.tsx` | 24 |
| `components/alerts/ShuttleInfo.test.tsx` | 22 |
| `components/health/DataHealth.test.tsx` | 19 |

**The checkout's remaining uncommitted WIP covers most of this but is not
complete.** Running `tsc --build --force` on the working tree as it stands
yields **109** errors across 13 files, not zero — the WIP clears 370 of 479 and
leaves the rest. Worth knowing before picking this up:

- **70 of the 109 sit in six files the WIP never touched** —
  `useTripTracker.test.ts` (17), `usePositions.test.ts` (16),
  `useMorningBriefing.test.ts` (15), `useAlerts.test.ts` (9),
  `serviceWorkerRegistration.test.ts` (7), `backgroundSync.test.ts` (6).
  Committing the WIP as-is would leave those red.
- `serviceWorkerRegistration.test.ts` is untouched but already fails at HEAD
  (`mockReset`/`_mockOptions`/`triggerOn*` on a non-mock) — same class, and
  independent of anything I landed.
- The untracked `packages/web/src/test/factories.ts` helper has 2 errors of its
  own: it imports `../../stores/favoritesStore`, which resolves outside
  `src/`. It should be `../stores/…`. It is untracked, so CI does not see it —
  but it would add errors if committed as-is.

## Why the Docker build step was not exercised directly

`docker-build` is reachable via an `entrypoint` override, and it would have
built and pushed `ronaldraygun/mta-my-way:<version>` from a tree that fails
typecheck and fails 95 tests. `update-declarative-config` then retargets the
deployment at that tag. Deliberately publishing a known-red image is worse
than leaving the step unmonitored, so it was not done.

## Bottom line for `mtamyway-a6230028`

The acceptance criteria (workflow reaches `docker-build`, build succeeds,
workflow Succeeded) are not met and cannot be met until two upstream gates go
green: typecheck (467 test-fixture errors, `mtamyway-692a6a56`) and test
(95 failures in 23 suites, classified in the predecessor report). **The bead is
left open.**

Raw logs (transient): `/tmp/mta-typecheck-hwp5j.log`,
`/tmp/mta-typecheck-fjhff.log`, `/tmp/local-tsc.log`. The workflows persist in
Argo for 2h (TTL 7200s).
