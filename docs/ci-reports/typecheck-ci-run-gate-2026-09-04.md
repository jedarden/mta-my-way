# CI run gate for the typecheck fix — 2026-09-04

Bead: `mtamyway-ceac46ec` (CI half of umbrella `mtamyway-692a6a56`)
Companion to `typecheck-gate-monitor-2026-09-04.md` and `test-step-monitor-2026-09-04.md`.

## Addendum — later the same day: residual is now 24, not 37

`mtamyway-be5712ba`'s fix landed as `3445221` while this report was being
written. Re-measuring pushed `origin/main` (@ 61b1587, same node_modules
snapshot, same `git archive` method) gives **exit 2 with 24 errors across 6
files** — exactly the 13 service-worker/background-sync errors gone, **zero new
error files**. Four CI runs between 21:48Z and 21:50Z corroborate: all four show
`lint` Succeeded and `typecheck` Failed exit code 2.

So the table below is now one third cleared. Remaining owners: `mtamyway-78ec5d0c`
(16: useAlerts 9, useTripTracker 4, useGeolocation 2, useErrorHandler 1) and
`mtamyway-2a94b4e5` (8: HomeScreen 4, FavoritesList 4). Everything else in this
report — no run until the verify child measures 0 on pushed main, and observe the
`typecheck` node, not just `lint` — still stands.

## Addendum 2 — same evening: the verify child was closed while false a second time

`mtamyway-c9c3995f` was closed again (rev 5, no close reason recorded, notes
still carrying the reopen text) after the addendum above recorded its reopen.
It is still false: re-measuring pushed `origin/main` @ **f9aba39** (0.0.375,
same `git archive` + copied-node_modules method) gives **exit 2 with 24 errors,
line-for-line identical** to the 24-residual inventory below — same files, same
line:col, same codes. `3445221`'s 13-error clearance holds; the two open fix
children (`mtamyway-78ec5d0c` 16, `mtamyway-2a94b4e5` 8) still own everything
that is left. Reopened again.

CI corroborates more strongly than before: **six** mta-my-way-build runs between
21:44Z and 21:50Z (`fs94t`, `bhz8b`, `vhkvs`, `4pqbb`, `q857s`, `cj98m`) — every
one `resolve-version` Succeeded, `lint` Succeeded, `typecheck` **Failed exit
code 2**. None reached `test` or `docker-build`. No further run was submitted:
a seventh run of a tree proven red six times over adds nothing.

Go criteria below are unchanged and remain the gate for `mtamyway-ceac46ec`.

## Bottom line

**No mta-my-way-build run was submitted.** The bead forbids burning CI runs on a
tree that is not clean, and pushed `origin/main` is not clean: typecheck still
exits 2 on it, in this measurement with **37 errors across the same 8 fixture
files the fixture-fix chain owns**. Lint, by contrast, is already green on that
exact tree.

The residual 37 errors are owned by three **open, unassigned** chain children
whose per-bead counts match this measurement exactly. The chain's verify child
`mtamyway-c9c3995f` was closed with its acceptance unmet (and with its own
blocker `mtamyway-2a94b4e5` still open) — the same premature-close shape that
hit its predecessor `mtamyway-c6439d68`. It has been reopened so the gate is
honest again.

## How this was measured

On an isolated checkout of exactly what CI clones — `git archive origin/main`
(4932030, content-identical to cd9e752 plus the VERSION auto-bump) extracted to
`~/scratch/mtamyway-origin-verify2`, with a copy of node_modules so no file from
the shared working tree can leak into the result:

```
npx tsc --build --force   → exit 2, 37 errors
npm run lint              → exit 0 (biome + eslint clean, 636 files)
```

The 37-error set is reproducible: an independent first checkout
(`mtamyway-origin-verify`, node_modules symlinked rather than copied) produced a
byte-identical error list.

### Caveat: the absolute count is node_modules-dependent

Both of those checkouts copied the same underlying `node_modules`, so that A/B
does **not** establish that 37 is the number CI's `npm ci` would print — only
that this environment is self-consistent. A separate same-day measurement at the
same commit (`cd9e752`) read **90 errors across 25 files**, the gap being almost
entirely `TS2304 "Cannot find name 'global'/'process'"` — a Node-globals class
driven by which `@types/node`/`vitest` versions the snapshot carries
(`packages/web/tsconfig.json` pins no `"node"` types, so it is fully at the
mercy of transitive types). The shared checkout's `node_modules` was installed
from an *uncommitted* `package-lock.json`, so it already diverges from CI's
install.

The claims that survive that caveat, and which this report rests on:

- `npx tsc --build --force` **exits 2** on pushed `origin/main` here, and two
  real CI runs at the same commit failed the `typecheck` node with exit code 2.
- `npm run lint` **exits 0** on the same tree.
- The residual work is confined to the 8 test-fixture files mapped below; the
  per-file counts match the three chain children's own scoping (13 + 16 + 8).

Treat 37 as *this environment's* figure, not as an acceptance criterion. Whoever
closes the verify child should re-derive it in their own checkout.

## Corroborating CI evidence (runs that already happened)

Rather than submit a new run to relearn this, the two most recent
mta-my-way-build runs at 21:11Z already carry the per-node answer:

| Workflow | resolve-version | lint | typecheck | phase |
|---|---|---|---|---|
| `mta-my-way-build-pk259` | Succeeded | **Succeeded** | **Failed — `main: Error (exit code 2)`** | Failed |
| `mta-my-way-build-gmflx` | Succeeded | **Succeeded** | **Failed — `main: Error (exit code 2)`** | Failed |

Both runs stopped at the `typecheck` node; neither reached `test` or
`docker-build`. (podGC deletes pods on completion, so no step logs survive —
the local error list below is the detail those exit-2 nodes would have printed.)

## Template sync verification

Checked the live object, not the Application status, as required:

- Live `workflowtemplate mta-my-way-build` (resourceVersion 74694127) compared
  semantically against `k8s/iad-ci/argo-workflows/mta-my-way-workflowtemplate.yml`
  on declarative-config `main` (893a880c): **`spec` identical**. Metadata differs
  only by ArgoCD's own `argocd.argoproj.io/instance` label. The template is synced.

### Note: the step layout changed under this bead's premise

The bead reads "that node runs both npm run lint and npm run typecheck". The
live template splits them: `resolve-version → lint → typecheck → test →
docker-build → update-declarative-config`. Consequences for whoever runs the
real verification:

- A green `lint` node no longer says anything about typecheck — the typecheck
  node is now its own gate.
- Acceptance "lint exits 0 and the run transitions into the step after it" is
  therefore necessary but weak. Record the `typecheck` node's outcome too: the
  umbrella is not done until that node is green, and this run is the proof.

## Residual 37 errors, with owners

Measured on pushed `origin/main` @ 4932030. Every file is a test fixture; no
product-code error remains (that half landed in 7eed6d6).

| # | File | Owner bead |
|---|---|---|
| 9 | `packages/web/src/hooks/useAlerts.test.ts` | `mtamyway-78ec5d0c` |
| 4 | `packages/web/src/hooks/useTripTracker.test.ts` | `mtamyway-78ec5d0c` |
| 2 | `packages/web/src/hooks/useGeolocation.test.ts` | `mtamyway-78ec5d0c` |
| 1 | `packages/web/src/hooks/useErrorHandler.test.ts` | `mtamyway-78ec5d0c` |
| 7 | `packages/web/src/lib/serviceWorkerRegistration.test.ts` | `mtamyway-be5712ba` |
| 6 | `packages/web/src/lib/backgroundSync.test.ts` | `mtamyway-be5712ba` |
| 4 | `packages/web/src/screens/HomeScreen.test.tsx` | `mtamyway-2a94b4e5` |
| 4 | `packages/web/src/components/favorites/FavoritesList.test.tsx` | `mtamyway-2a94b4e5` |
| | | **37 = 16 + 13 + 8** |

Error classes, for whoever picks these up:

- `TS2345`/`TS2322` — fixture objects still shaped against old hook APIs
  (`FavoritesState` gained `onboardingComplete`/`addFavorite`/`togglePin`/
  `recordTap`/`completeOnboarding`; `GeolocationPosition` needs `toJSON`;
  `useTripTracker`'s `TripData` no longer takes `null`/3-arg calls).
- `TS2339` — `serviceWorkerRegistration.test.ts` drives a mock harness through
  `mockReset`/`_mockOptions`/`triggerOnRegistered`/`triggerOnRegisterError`/
  `triggerOnOfflineReady`/`triggerOnNeedRefresh`, none of which exist on the
  committed helper's return type. The uncommitted `packages/shared/src/testing`
  WIP does **not** provide them (verified: applying it leaves the count at 37),
  so this needs a real fix in either the helper or the test.
- `TS2304`/`TS2416`/`TS2540` — `backgroundSync.test.ts` still references the
  nonexistent `SyncRegistration` global and assigns the read-only `sync`.
- `TS2532`/`TS18048`/`TS6133`/`TS7006`/`TS2556`/`TS2352` — `noUncheckedIndexedAccess`
  fallout and dead locals left by the old shapes.

Full line-level list is reproduced at the end of this file.

### Do not read the shared checkout's count as progress

The shared checkout currently measures **24**, not 37 — but the 13-error
difference is *not* work already done. Landing the uncommitted testing-helper
WIP into a clean clone leaves the count at 37 (verified above), so the shared
tree's lower number comes from uncommitted state that never reached `main`.
The committed tree is what CI clones: measure there, not in the shared checkout.

## Go criteria before the run is submitted

1. `mtamyway-be5712ba` (13), `mtamyway-78ec5d0c` (16) and `mtamyway-2a94b4e5` (8)
   land their fixes on `main` — in chain order, they block each other.
2. `mtamyway-c9c3995f` (reopened) re-measures typecheck to **exit 0 on a clean
   checkout of pushed `origin/main`** — not on the shared working tree — and
   records it in `docs/ci-reports/`.
3. Only then submit one mta-my-way-build run and observe: `lint` node green,
   transition into `typecheck`, and (the real target) `typecheck` green. Acceptance
   for `mtamyway-ceac46ec` remains the lint node plus the transition, but the
   evidence should record the typecheck node's phase either way.

Never force `docker-build` or any later step to make a bead pass.

## Line-level residual list (origin/main @ 4932030)

```
components/favorites/FavoritesList.test.tsx(295,13)  TS6133 'user' declared but never read
components/favorites/FavoritesList.test.tsx(349,36)  TS2322 Favorite | undefined not assignable to Favorite
components/favorites/FavoritesList.test.tsx(371,13)  TS6133 'container' declared but never read
components/favorites/FavoritesList.test.tsx(372,36)  TS2322 ad-hoc object not assignable to Favorite
hooks/useAlerts.test.ts(93,1)     TS6133 'actualUseSettingsStore' declared but never read
hooks/useAlerts.test.ts(104,66)   TS2556 spread argument must have a tuple type or rest parameter
hooks/useAlerts.test.ts(126,38)   TS7006 parameter 'selector' implicitly has an 'any' type
hooks/useAlerts.test.ts(215,12)   TS2532 object is possibly undefined
hooks/useAlerts.test.ts(216,12)   TS2532 object is possibly undefined
hooks/useAlerts.test.ts(248,34)   TS2345 fixture object not assignable to FavoritesState
hooks/useAlerts.test.ts(290,12)   TS2532 object is possibly undefined
hooks/useAlerts.test.ts(483,12)   TS2532 object is possibly undefined
hooks/useAlerts.test.ts(539,11)   TS6133 'result' declared but never read
hooks/useErrorHandler.test.ts(203,13) TS2322 (value: void | PromiseLike<void>) => void not assignable to (value: unknown) => void
hooks/useGeolocation.test.ts(166,27) TS2345 fixture object not assignable to GeolocationPosition
hooks/useGeolocation.test.ts(490,27) TS2345 fixture object not assignable to GeolocationPosition
hooks/useTripTracker.test.ts(224,13) TS6133 'result' declared but never read
hooks/useTripTracker.test.ts(260,20) TS2322 null not assignable to string
hooks/useTripTracker.test.ts(279,8)  TS2352 conversion of Error to { status: number } may be a mistake
hooks/useTripTracker.test.ts(294,53) TS2554 expected 1 arguments, but got 3
lib/backgroundSync.test.ts(12,3)   TS2416 property 'sync' not assignable to base Partial<ServiceWorkerRegistration>
lib/backgroundSync.test.ts(13,40)  TS2304 cannot find name 'SyncRegistration'
lib/backgroundSync.test.ts(155,43) TS2540 cannot assign to 'sync' because it is read-only
lib/backgroundSync.test.ts(202,27) TS18048 'addCall' is possibly undefined
lib/backgroundSync.test.ts(220,27) TS18048 'addCall' is possibly undefined
lib/backgroundSync.test.ts(465,30) TS2532 object is possibly undefined
lib/serviceWorkerRegistration.test.ts(20,31)  TS2339 'mockReset' does not exist
lib/serviceWorkerRegistration.test.ts(42,40)  TS2339 '_mockOptions' does not exist
lib/serviceWorkerRegistration.test.ts(43,40)  TS2339 '_mockOptions' does not exist
lib/serviceWorkerRegistration.test.ts(65,33)  TS2339 'triggerOnRegistered' does not exist
lib/serviceWorkerRegistration.test.ts(79,33)  TS2339 'triggerOnRegisterError' does not exist
lib/serviceWorkerRegistration.test.ts(95,33)  TS2339 'triggerOnOfflineReady' does not exist
lib/serviceWorkerRegistration.test.ts(114,35) TS2339 'triggerOnNeedRefresh' does not exist
screens/HomeScreen.test.tsx(279,61) TS2345 fixture object not assignable to useFavorites return
screens/HomeScreen.test.tsx(314,36) TS2345 fixture object not assignable to FavoritesState
screens/HomeScreen.test.tsx(361,47) TS2345 fixture object not assignable to useFavorites return
screens/HomeScreen.test.tsx(527,61) TS2345 fixture object not assignable to useFavorites return
```
