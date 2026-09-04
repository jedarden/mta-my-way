# mta-my-way-build typecheck proof on CI — blocked, no run submitted, 2026-09-04

Bead: `mtamyway-ceac46ec` (the CI half of umbrella `mtamyway-692a6a56`'s
done-when). Depends on the local-green child `mtamyway-c9c3995f`.

## Verdict

**The typecheck fix is not proven on CI, and this bead could not go green.**
The pushed `origin/main` tree still fails `npm run typecheck`, so submitting a
fresh run would have violated this bead's own constraint — *"do not burn CI
runs on a tree that is not clean."* No new run was submitted. The tree's red
state is instead established from two CI runs that already fired on the exact
commit in question, plus a clean-room local reproduction.

`mtamyway-c9c3995f` (local green) is closed but its acceptance criteria are
**not met**: it closed at 21:20Z with all three of its fixture-fix blockers
still open. It has been reopened.

## CI already measured this tree — twice

Commit `4932030` (`0.0.372`, `VERSION` bump on top of `cd9e752`) is the current
`origin/main` head. Pushing it triggered two `mta-my-way-build` runs; both
resolve to the same SHA via `resolve-version`'s output parameter:

| Run | Started | Phase | `resolve-version` sha |
|---|---|---|---|
| `mta-my-way-build-pk259` | 21:11:18Z | **Failed** (21:15:55Z) | `49320305ea…` |
| `mta-my-way-build-gmflx` | 21:11:32Z | **Failed** (21:15:57Z) | `49320305ea…` |

Per-node, both runs are identical and are the shape this bead was written to
detect:

```
resolve-version   Succeeded
lint              Succeeded      ← npm run lint is green
typecheck         Failed         main: Error (exit code 2)   ← npm run typecheck
[1]               Failed         → test / docker-build unreachable
```

`lint` passes and `typecheck` fails, in the same step group, so the run never
transitions into `test`. That is the residual-failure branch of this bead's
acceptance criteria, and the residuals are returned to the fixture-fix chain
below.

## Correction to the bead's premise: lint and typecheck are separate pods

The bead describes a single lint node that "runs both `npm run lint` and
`npm run typecheck`". The live `mta-my-way-build` WorkflowTemplate in `iad-ci`
(confirmed as the live object, not ArgoCD Application status — created
2026-08-26, entrypoint `build`, templates `resolve-version`, `lint`,
`typecheck`, `test`, `docker-build`, `update-declarative-config`) runs them as
**two parallel pods in step group [1]**:

```
[0] resolve-version
[1] lint  ∥  typecheck        ← each a fresh --depth 1 clone + npm ci
[2] test
[3] docker-build
[4] update-declarative-config
```

Consequence for the done-when: "the lint node exits 0 and the run reaches the
step after it" can only be satisfied when **both** pods in group [1] exit 0 —
the run cannot enter group [2] (`test`) otherwise. Each step clones `main`
itself, so the shared checkout's uncommitted state never reaches CI; a green
reading requires the fixes to be committed and pushed, not merely present
locally.

## Clean-room reproduction — 37 errors

Replicated CI's view locally: `git clone --depth 1 --branch main` of
`origin/main` (`4932030`) with the workspace `node_modules` copied in, then
`npx tsc --build --force`. Exit 2, **37 errors across 8 files** — the same
residual set `cd9e752`'s commit message predicted it would leave behind.

| File | Errors |
|---|---|
| `packages/web/src/hooks/useAlerts.test.ts` | 9 |
| `packages/web/src/lib/serviceWorkerRegistration.test.ts` | 7 |
| `packages/web/src/lib/backgroundSync.test.ts` | 6 |
| `packages/web/src/screens/HomeScreen.test.tsx` | 4 |
| `packages/web/src/hooks/useTripTracker.test.ts` | 4 |
| `packages/web/src/components/favorites/FavoritesList.test.tsx` | 4 |
| `packages/web/src/hooks/useGeolocation.test.ts` | 2 |
| `packages/web/src/hooks/useErrorHandler.test.ts` | 1 |
| **Total** | **37** |

CI's own error count was not captured — `podGC: OnPodCompletion` deletes the
pods the moment they finish, and these runs predate this dispatch. Both runs
independently record the exit-2 failure, which is the fact that matters here;
the 37 above is the clean-room figure for the same commit.

## Where the residuals live — returned to the fixture-fix chain

The chain `mtamyway-9cecf8b1` → `mtamyway-be5712ba` → `mtamyway-78ec5d0c` →
`mtamyway-2a94b4e5` tiles these 37 exactly, and its three fix children are all
**still open**:

| Bead | Scope | Clean-room errors | Status |
|---|---|---|---|
| `mtamyway-be5712ba` | service-worker + background-sync fixtures | 13 (7 + 6) | open |
| `mtamyway-78ec5d0c` | 4 hook test files | 16 (9 + 4 + 2 + 1) | open |
| `mtamyway-2a94b4e5` | HomeScreen + FavoritesList fixtures | 8 (4 + 4) | open |

`mtamyway-9cecf8b1` (land the reviewed WIP) is closed and legitimately so:
`cd9e752` took the clean clone from 467 errors to these 37.

**`mtamyway-be5712ba`'s 13 fixes are already written and sitting uncommitted**
in the shared checkout. The working tree — with `backgroundSync.test.ts` and
`serviceWorkerRegistration.test.ts` modified but uncommitted — measures 24
errors, and the 13 that disappear are precisely the two files in that bead's
scope. Landing those two files with explicit paths would clear a third of the
residual immediately; the remaining 24 have no local fix and need new work.

## Why the verifier closed green

`mtamyway-c9c3995f` closed at 21:20:08Z with empty notes, eleven minutes after
`pk259`/`gmflx` had failed typecheck on the very commit it verified. Its own
description names the hazard: the chain's earlier terminal verify child
`mtamyway-c6439d68` was closed while its upstream blockers were open. This is
that same failure a second time. A clean-room read of the pushed tree — the
bead's own stated method — returns 37 errors, not zero.

**Reopened as of 21:47Z** so the gate is real again. It should be re-verified
only after the three fix children land, and only measured on a fresh clone of
pushed `origin/main` — the shared checkout is not a valid measurement surface
for this, because its untracked and modified files are exactly what CI does not
see.

## What this bead needs before it can go green

1. The three fixture-fix children close, each with its errors actually
   committed and pushed.
2. `mtamyway-c9c3995f` re-verifies zero errors on a clean clone of pushed
   `origin/main`.
3. Only then: submit one `mta-my-way-build` run, confirm the live template
   first, and observe **both** the `lint` and `typecheck` pods exit 0 and the
   run enter `test`. Workflow name, phase, and the step transition recorded
   here. Never force `docker-build` or any later step to manufacture the
   transition.
