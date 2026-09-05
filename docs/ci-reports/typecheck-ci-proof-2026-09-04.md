# mta-my-way-build typecheck proof on CI — blocked, no run submitted, 2026-09-04

Bead: `mtamyway-ceac46ec` (the CI half of umbrella `mtamyway-692a6a56`'s
done-when). Depends on the local-green child `mtamyway-c9c3995f`.

> **Final verdict (23:50Z, addendum 3 at the bottom): PROVEN.** On the current
> pushed `origin/main` head `9e40601`, two pipeline runs record `lint`
> Succeeded, `typecheck` Succeeded, and entry into step group [2] `test`.
> The title above describes only the first dispatch's state.

## Addendum — later the same evening

This report is the first half of the story; read it together with
[`typecheck-ci-run-gate-2026-09-04.md`](./typecheck-ci-run-gate-2026-09-04.md),
which continues it after `mtamyway-be5712ba`'s 13 fixes landed as `3445221`:
the residual is now **24** across 6 files, six further CI runs between 21:44Z
and 21:50Z all corroborate `lint` Succeeded / `typecheck` Failed exit 2, and
`mtamyway-c9c3995f` was closed-while-false a **second** time and reopened
again. Nothing below has been superseded — only the error count has moved.

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

## Addendum 3 — the transition is proven; bead `mtamyway-ceac46ec` closed green (23:50Z)

All three conditions from the list above are now met, and the observed runs
already existed — no run was burned to produce them.

### The gate opened first

`mtamyway-c9c3995f` re-verified **true** at ~23:35Z on its third attempt and
closed at 23:39:54Z, this time measuring the way CI sees the tree: `git
archive` of pushed `origin/main` `b34e747` (`0.0.381`) extracted to a scratch
dir with `node_modules` copied in → `npm run typecheck` exit **0** and
`npx tsc --build --force` exit **0**, plus a positive control (an injected
TS2322 into a shipped source file flips the read to exit 1, proving the
harness detects errors rather than merely exiting zero). It re-ran clean at
`fc92ac9` after concurrent workers advanced the head. Details:
[`typecheck-local-green-verify-2026-09-04.md`](./typecheck-local-green-verify-2026-09-04.md).
The three fixture-fix children are all landed and pushed: `3445221`
(`be5712ba`, 13), `dabc1bc` (`78ec5d0c`, 16), `c0b41cf` (`2a94b4e5`, 8).

### Template re-confirmed from the live object

`kubectl --server=http://traefik-iad-ci:8001 get workflowtemplate
mta-my-way-build -n argo-workflows` — created 2026-08-26T19:58:27Z,
resourceVersion 74694127, entrypoint `build`:

```
[0] resolve-version
[1] lint  ∥  typecheck
[2] test
[3] docker-build
[4] update-declarative-config
```

Unchanged from the correction above: `lint` and `typecheck` are two parallel
pods, so the done-when's "lint node exits 0 and the run reaches the step after
it" is satisfied only when **both** group-[1] pods exit 0 and the run enters
group [2].

### The proof — two runs on the current pushed head

`origin/main` head `9e4060108903e59c4450bdb67040cafd0b7ebcd2` (`0.0.384`)
pushed two runs via the argo-events sensor (`mta-my-way-sensor` → trigger
`mta-my-way-build`). Both `resolve-version` pods publish the same sha output
parameter, pinning each run to that commit:

| Run | Created (Z) | Finished (Z) | `resolve-version` | `lint` | `typecheck` | `test` | Run phase |
|---|---|---|---|---|---|---|---|
| `mta-my-way-build-hdr42` | 23:34:02 | 23:46:46 | Succeeded | **Succeeded** | **Succeeded** | Failed (`main: Error (exit code 1)`) | Failed |
| `mta-my-way-build-5jwrm` | 23:34:25 | 23:48:09 | Succeeded | **Succeeded** | **Succeeded** | Failed (pod deadline) | Failed |

**Both runs record a green `lint` node, a green `typecheck` node, and a
transition into step group [2] `test`** — the exact fact this bead exists to
observe. That the runs' overall phase is Failed is the *test* group failing
after the transition, which this bead's constraints explicitly put out of
scope: acceptance is that the run *reaches* the step after lint, and
`docker-build` was never touched to manufacture anything.

Three further runs corroborate the same node shape on the two immediately
preceding heads, so the green is a property of the tree and not of one
accidental commit:

| Run | sha | Version | `lint` / `typecheck` | Entered `test` |
|---|---|---|---|---|
| `mta-my-way-build-kp4nt` | `b34e747` | 0.0.381 | Succeeded / Succeeded | yes (23:07:08 → 23:21:49) |
| `mta-my-way-build-9tgwl` | `b34e747` | 0.0.381 | Succeeded / Succeeded | yes (23:07:23 → 23:21:52) |
| `mta-my-way-build-x6qg4` | `58976ad` | 0.0.383 | Succeeded / Succeeded | yes (23:31:18 → 23:46:43) |

For contrast, `mta-my-way-build-zjb94` on head `59bacc5` (`0.0.379`, 22:35Z)
still shows `typecheck` **Failed, exit 2** — and `59bacc5` already contains
`3445221` and `dabc1bc`, so the only `packages/` delta between that failing
head and the green heads is `c0b41cf`'s two fixture files (`HomeScreen.test.tsx`,
`FavoritesList.test.tsx`, `git diff --stat 59bacc5 b34e747 -- packages/`).
A same-day A/B on the same pipeline that isolates the final fix commit as the
one flipping CI's typecheck green.

### Why no fresh run was submitted

The local-green child's verified close carries an explicit handoff:
*`mtamyway-ceac46ec` needs no new run submitted for the typecheck half — `kp4nt`
and `9tgwl` already are that run on the then-current origin/main head with the
group [1] → group [2] transition recorded.* Two further runs (`hdr42`,
`5jwrm`) then landed on the *newest* pushed head, so submitting another would
re-measure a tree CI had measured twice within the preceding fifteen minutes.
The residual risk a fresh run would retire — that the pushed tree had drifted
since the measured commit — is bounded instead by diff: `9e40601` and its
intermediate commits touch only `VERSION` and these reports, no file under
`packages/`.

### Residual — the test group, not typecheck

`hdr42` failed `test` with `main: Error (exit code 1)`; `5jwrm`, `x6qg4`,
`kp4nt` and `9tgwl` with `Pod was active on the node longer than the specified
deadline`. Both are test-step problems with a separate owner — classified in
[`test-step-monitor-2026-09-04.md`](./test-step-monitor-2026-09-04.md), which
remains the open CI work. Nothing in this addendum claims the pipeline is green
end to end.

### Postscript — the push of this report was measured too

Publishing the addendum above (commit `baab390`) triggered the sensor as every
push does, and the resulting runs were watched through the transition as well.
`packages/` is empty in `git diff 9e40601..origin/main`, so the tree is
typecheck-identical. On head `4492b5c` (`0.0.386`, the auto-bump on top of this
report):

| Run | Created (Z) | `resolve-version` | `lint` | `typecheck` | `test` |
|---|---|---|---|---|---|
| `mta-my-way-build-h697t` | 23:54:48 | Succeeded | **Succeeded** | **Succeeded** | entered, Running at 00:03Z |
| `mta-my-way-build-zgj2l` | 23:55:12 | Succeeded | **Succeeded** | **Succeeded** | entered, Running at 00:03Z |

Seven `mta-my-way-build` runs across four heads on the day now record the
green group-[1] → `test` transition.
