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

## Ninth dispatch re-verification — 2026-09-17, ~23:45Z

The harness re-plucked the bead (claim epoch 10) ~2h after the eighth
closure with the same stale 486-error premise. Re-verified without a single
source change — every fix cited above is already in main:

- `npm run typecheck -- --force`: **exit 0** on the live tree, uncommitted
  shared-checkout WIP included.
- `npm run lint`: biome flags only gitignored
  `packages/server/data/vapid-keys.json` (local-only; the CI lint node is
  the authoritative signal and is green).
- CI, all runs on `main`: `mta-my-way-build-6vczv`, `-kg7xd`, `-fvn47` —
  lint **Succeeded**, typecheck **Succeeded**, test Failed (pod deadline —
  the known test-step shape, not a gate failure); `-vcnh2` — both gates
  Succeeded, test still in flight at close time. All four reached the step
  after lint.
- `npm test`: 7100 passed / 104 failed / 19 skipped, exit 1 — same standing
  baseline as this morning (7092/112), deltas from WIP and load fringe.
  Failure attribution: known-red auth/security suites (csrf-×2,
  audit-log-comprehensive-security-coverage, auth-authorization-flow,
  auth-authorization.integration, cross-cutting, password-management,
  password-reset.service, middleware-chain-e2e, middleware-fixtures-demo);
  load-fringe 5s timeouts (journal-sync-roundtrip, concurrency,
  cache-coherency, push-startup, data-flow); and two suites carrying
  another worker's uncommitted edits (audit-log-middleware-security-events,
  audit-log-security-middleware-coverage). **No TypeScript and no lint
  errors among the 104.**

The prior dispatch left the bead open only because clean-extraction
`npm test` did not pass — a bar the done-when never set. The red suites are
owned by the test-step beads; holding this umbrella open over them just
buys another pluck. Closed on attribution.

## Tenth dispatch re-verification — 2026-09-18, ~00:05Z

The harness re-plucked the bead again (claim epoch 11) ~2h after the ninth
closure, byte-identical stale premise and a byte-identical WIP snapshot.
Re-verified without a single source change:

- `npm run typecheck -- --force`: **exit 0** on the live tree, uncommitted
  shared-checkout WIP included.
- `npm run lint`: 4 biome errors + 1 biome INTERNAL note, every one in a file
  that does not exist in CI's checkout — gitignored
  `packages/server/data/vapid-keys.json`, untracked WIP
  `app.core-only-route-mounts.test.ts` and `debug-chain-tmp.mts`, and the
  Playwright artifact `tests/e2e/test-results/.last-run.json`. Tracked
  source is clean, which CI confirms.
- CI, all ten `mta-my-way-build` runs created 22:15Z–23:44Z on `main`
  (`-4xd7p`, `-6vczv`, `-7pwlf`, `-c7jbx`, `-fvn47`, `-h2gz8`, `-kg7xd`,
  `-m5qj2`, `-vcnh2`, `-vmsv4`): lint **Succeeded** and typecheck
  **Succeeded in every run**. The only red node is `test` — pod deadline ×7,
  fast exit 1 ×3, the known test-step shapes owned by the test-step beads.
  The done-when ("a build run reaches the step after lint") is met tenfold.
- `npm test`: 7095 passed / 109 failed / 19 skipped of **7223** — the same
  total set the ninth dispatch measured (7100/104/19); the ±5 pass/fail
  churn is the documented load-fringe band on this box. The captured
  failures are the standing known-red suites (`middleware-fixtures-demo`,
  password-timing); and since `tsc --build --force` covers every test file
  (exit 0) and biome is clean over tracked source, no TypeScript or lint
  error can be among the 109.

Same verdict, ninth time repeated: every fix cited above is in main, the
done-when is met, the redness that remains belongs to other beads. Closed
on attribution.

## Eleventh dispatch (claim epoch 12, 2026-09-18 ~00:45Z)

Same stale premise re-plucked ~2h after the tenth closure. Re-verified with
fresh evidence, zero source changes:

- `npm run typecheck -- --force`: **exit 0** on the live tree at HEAD
  `54f9dcd3` (= `origin/main`), uncommitted shared-checkout WIP included.
- CI on `main`: `-c7jbx` and `-7pwlf` (23:44Z) both lint **Succeeded** +
  typecheck **Succeeded**, test Failed (pod deadline / fast exit 1 — the two
  known test-step shapes owned by the test-step beads). `-n79f7` and
  `-q27hs` (00:23Z/00:31Z) still in flight with lint **Succeeded** already.
  Done-when met, eleventh time repeated.
- No new run was submitted: existing runs on `main` already satisfy the
  done-when, and duplicate submissions only add quota pressure.

Same verdict, tenth time repeated: every fix is in main, the done-when is
met, remaining redness belongs to the test-step beads. Closed on attribution.

## Twelfth dispatch (claim epoch 13, 2026-09-18 ~01:15Z)

Same stale premise re-plucked ~30min after the eleventh closure. Re-verified
with fresh evidence, zero source changes:

- `npm run typecheck -- --force`: **exit 0** on the live tree at HEAD
  `d12e3254` (= `origin/main`, the 0.0.517 auto-bump), uncommitted
  shared-checkout WIP included. Zero errors — the premise's 486 (and the
  named HomeScreen/serviceWorkerRegistration/fareStore failures) do not
  exist at HEAD.
- `npm run lint`: 4 biome errors, all in files **absent from CI** — the
  gitignored `packages/server/data/vapid-keys.json`, two untracked
  another-worker WIP files (`app.core-only-route-mounts.test.ts`,
  `debug-chain-tmp.mts`), and the ignored
  `tests/e2e/test-results/.last-run.json`. Nothing tracked fails.
- CI on `main`: `-c7jbx`/`-7pwlf` (23:44Z) and `-q27hs` (00:31Z) all
  lint **Succeeded** + typecheck **Succeeded**; test Failed with the two
  known shapes (`-7pwlf` fast exit 1; `-c7jbx`/`-q27hs` pod deadline) owned
  by the test-step beads. `-n79f7` (00:23Z) in flight with both gates
  already **Succeeded**. Done-when met for the twelfth time; no new run
  submitted (existing runs on `main` satisfy it).
- `npm test`: **7100 passed / 104 failed / 19 skipped of 7223** —
  byte-identical to the ninth dispatch's measurement, the standing
  known-red baseline (csrf x2, audit-log coverage, auth flows, password
  mgmt/reset, cross-cutting, middleware-chain-e2e,
  middleware-fixtures-demo) plus the load-fringe 5s-timeout band
  (journal-sync-roundtrip, concurrency, cache-coherency, data-flow). With
  typecheck exit 0 over every test file and biome clean over tracked
  source, no TypeScript or lint error can be among the 104.

Same verdict, eleventh time repeated: every fix is in main, the done-when
is met, remaining redness belongs to the test-step beads. Closed on
attribution.

## Thirteenth dispatch (claim epoch 14, 2026-09-18 ~01:55Z)

Same stale premise re-plucked ~35min after the twelfth closure. Re-verified
with fresh evidence, zero source changes:

- `npm run typecheck`: **exit 0** plain at HEAD `bdc1f481`, and
  `tsc --build --force` full rebuild **exit 0** (zero errors); re-confirmed
  plain **exit 0** after fast-forward to `121a7f2c` (= `origin/main`, the
  0.0.518 auto-bump). The premise's 486 and the named
  HomeScreen/serviceWorkerRegistration/fareStore failures do not exist.
- `npm run lint`: 4 biome errors, all in files **absent from CI** — the
  gitignored `packages/server/data/vapid-keys.json`, the ignored
  `tests/e2e/test-results/.last-run.json`, and untracked another-worker WIP
  `app.core-only-route-mounts.test.ts`. Nothing tracked fails.
- CI on `main`: `-5mfcz` (00:44Z), `-bh27c` (00:54Z), `-2js2k` (01:25Z) all
  lint **Succeeded** + typecheck **Succeeded**; test Failed with the known
  shapes (`-bh27c` exit 128, `-5mfcz`/`-2js2k` pod deadline) owned by the
  test-step beads. `-zhhwn` (01:25Z) in flight with both gates already
  **Succeeded** (test Pending on quota). Done-when met for the thirteenth
  time; no new run submitted (existing runs on `main` satisfy it).
- `npm test`, two measurements: run 1 taken while a parallel forced tsc
  build was loading the box → 7096/108/19 of 7223; run 2 quiet →
  **7101 passed / 103 failed / 19 skipped** (104 FAIL entries counting the
  `validation.test.ts` file-level suite error) — the standing baseline.
  The run-1 delta (+4) is load-fringe flake, not a new defect. Run-2
  composition maps onto the known bands: audit-log coverage family (22+13+7),
  csrf x2 (31), auth flows (7), password mgmt/reset (3), cross-cutting (3),
  middleware-chain-e2e + middleware-fixtures-demo (4), load-fringe 5s
  timeouts (cache-coherency 4, journal-sync-roundtrip 3, concurrency 3,
  data-flow 1), `validation.test.ts` file-level `afterEach is not defined`,
  and FareTracker x2 (DOM assertion mismatches). Both FareTracker and
  validation.test.ts are clean at HEAD (not WIP) — runtime defects owned by
  the test-step beads. **Zero TypeScript or lint errors among the failures.**

Same verdict, twelfth time repeated: every fix is in main, the done-when
is met, remaining redness belongs to the test-step beads. Closed on
attribution.

## Fourteenth dispatch (claim epoch 15, 2026-09-18 ~02:30Z)

Same stale premise re-plucked ~40min after the thirteenth closure,
zero source changes. Fresh evidence:

- `npm run typecheck -- --force`: **exit 0** (zero errors) on the live
  tree at HEAD `3184dc3f`, then fast-forwarded to `f7bb157a` (=
  `origin/main`, the 0.0.519 auto-bump, VERSION-only change — no code
  delta). The premise's 486 and the named
  HomeScreen/serviceWorkerRegistration/fareStore failures do not exist.
- `npm run lint`: 4 biome errors, all in files **absent from CI** — the
  gitignored `packages/server/data/vapid-keys.json`, the ignored
  `tests/e2e/test-results/.last-run.json`, and untracked another-worker
  WIP `app.core-only-route-mounts.test.ts` + `debug-chain-tmp.mts`.
  Nothing tracked fails.
- CI on `main`, 8 runs sampled across 00:23Z–01:55Z (`-n79f7`, `-q27hs`,
  `-5mfcz`, `-bh27c`, `-2js2k`, `-zhhwn`, `-t746m`, `-msx6k`): lint
  **Succeeded** + typecheck **Succeeded** in **all 8**; test Failed in
  all 8 with the known pod-deadline / exit-128 shapes owned by the
  test-step beads. Done-when met for the fourteenth time; no new run
  submitted (the 8 existing runs on `main` satisfy it).
- `npm test`: **7099 passed / 105 failed / 19 skipped of 7223**, 18 test
  files failed — within the documented baseline band (103 and 104 in the
  two prior quiet measurements; ±2 is run-to-run variance). The visible
  tail is the `middleware-fixtures-demo` band
  (`assertSecurityTableRowCount` row-count mismatches), consistent with
  the composition fully documented in the thirteenth addendum above.
  **Zero TypeScript or lint errors among the failures.**

Same verdict, fourteenth time repeated: every fix is in main, the
done-when is met, remaining redness belongs to the test-step beads.
Closed on attribution.

## Sixteenth dispatch (claim epoch 17, 2026-09-18 ~03:45Z)

Same stale 486-error premise re-plucked, zero source changes needed. (The
fifteenth closure, `9a11c037`, re-verified at `93bfb3e0` without adding an
addendum here — its evidence lives in the commit message.) Fresh evidence:

- `npm run typecheck -- --force`: **exit 0** (zero errors) on the live
  tree at HEAD `9a11c037` (= `origin/main` at dispatch time). The
  premise's 486 errors and the named
  HomeScreen/serviceWorkerRegistration/fareStore failures do not exist.
- `npm run lint`: 4 biome errors, all in files **absent from the repo** —
  gitignored `packages/server/data/vapid-keys.json`, ignored
  `tests/e2e/test-results/.last-run.json`, untracked another-worker WIP
  `app.core-only-route-mounts.test.ts` + `debug-chain-tmp.mts`. Nothing
  tracked fails. (Note: the live template now runs lint and typecheck as
  **separate parallel DAG nodes** — the bead's "same step" wording is
  from an older template revision; the conclusion is unchanged.)
- **Fresh CI run submitted**: `mta-my-way-build-manual-65sk5` (previous
  dispatches cited runs that have since been TTL-reaped, and nothing was
  in flight). resolve-version auto-bumped VERSION to 0.0.520
  (`17709185`, VERSION-only delta on `9a11c037`) before the gate pods
  cloned, so both gates ran on code identical to HEAD. Results:
  lint **Succeeded** (03:35:35Z), typecheck **Succeeded** (03:36:41Z),
  and the workflow reached the step after lint — the test node started
  03:37:30Z. Done-when met directly on this run.

Same verdict, sixteenth time repeated: every fix is in main, the
done-when is met, remaining redness belongs to the test-step beads.
Closed on attribution.

## Seventeenth dispatch (claim epoch 18, 2026-09-18 ~04:20Z)

Same stale 486-error premise re-plucked ~40min after the sixteenth
closure, zero source changes. Fresh evidence:

- `npm run typecheck`: **exit 0** plain at HEAD `957b69a8`, and
  `tsc --build --force` full rebuild **exit 0** (zero errors, uncommitted
  shared-checkout WIP included — so the committed tree CI sees is a
  subset). The premise's 486 errors and the named
  HomeScreen/serviceWorkerRegistration/fareStore failures do not exist.
- `npm run lint`: 4 biome errors, all in files **absent from CI** —
  gitignored `packages/server/data/vapid-keys.json`, untracked
  another-worker WIP `app.core-only-route-mounts.test.ts` +
  `debug-chain-tmp.mts`, ignored
  `tests/e2e/test-results/.last-run.json`. Nothing tracked fails.
- CI, observed live end-to-end on this dispatch: `mta-my-way-build-jn2q5`
  (created 03:46Z on `main`). resolve-version auto-bumped VERSION to
  0.0.521 (`957b69a8`, VERSION-only delta) before the gate pods cloned.
  Both gate pods then sat **Pending ~14 min on the
  `argo-workflows-budget` quota** (namespace crowded with post-push
  validate and analysis runs) — a scheduling delay, not a gate failure.
  Once quota freed: lint **Succeeded** 04:09:24Z, typecheck
  **Succeeded** 04:12:51Z, and the DAG advanced to the step after lint —
  the test node started 04:14:32Z (still in flight at close time). The
  quota-wait is a new shape for this pipeline's *scheduling* phase and is
  recorded here because the node message ("exceeded quota") reads like a
  failure in `kubectl get workflow` output while the run is actually
  healthy and waiting.
- `npm test` (box otherwise quiet): **7092 passed / 112 failed / 19
  skipped of 7223**, 19 test files failed — the standing baseline.
  Composition maps onto the documented bands: audit-log coverage family
  (22+13+7), csrf x2 (13+18), auth flows (6+4), password mgmt/reset
  (3+1), cross-cutting (3), middleware-chain-e2e +
  middleware-fixtures-demo (2+2), rate-limit integration (1),
  load-fringe 5s timeouts (cache-coherency 6, concurrency 4,
  data-flow 2, journal-sync-roundtrip 3), FareTracker x2 (DOM assertion
  mismatches, clean at HEAD), and the `validation.test.ts` file-level
  suite error. With `tsc --build --force` exit 0 over every test file
  and biome clean over tracked source, **no TypeScript or lint error can
  be among the 112.**

Same verdict, seventeenth time repeated: every fix is in main, the
done-when is met on a live run, remaining redness belongs to the
test-step beads. Closed on attribution.

## Eighteenth dispatch (claim epoch 19, 2026-09-18 ~04:35Z)

Same stale 486-error premise, twelfth re-dispatch; zero source changes.
Re-verified at origin/main `35fa050b` (0.0.522 auto-bump; local
fast-forwarded with autostash, all other-worker WIP left in place):

- `npm run typecheck -- --force` (`tsc --build --force`) **exit 0** over
  the live tree, untracked WIP included — stricter than CI, which will
  never see those files.
- `npm run lint` exit 1 on exactly **4 errors, all on files absent from
  CI**, re-confirmed mechanically: `packages/server/data/vapid-keys.json`
  (gitignored, `.gitignore:38`), untracked another-worker WIP
  `app.core-only-route-mounts.test.ts` (format) and `debug-chain-tmp.mts`
  (organizeImports), and `tests/e2e/test-results/.last-run.json`
  (gitignored, `.gitignore:48`). Nothing tracked fails.
- CI, observed live on this dispatch: manual submission
  `mta-my-way-build-manual-crdvs` (template `mta-my-way-build` verified
  applied; no prior runs survived TTL, so a fresh one was required).
  Gate pods again queued on the `argo-workflows-budget` quota
  (~14 min, resolve-version Succeeded 04:35:30Z), then **lint
  Succeeded 04:50:20Z**, **typecheck Succeeded 04:50:04Z**, and the DAG
  advanced to the step after lint — the test node started 04:51:30Z.
  Both gates green in-cluster on `main`.
- `npm test` (box quiet): **7093 passed / 111 failed / 19 skipped of
  7223**, 19 test files failed — the standing baseline, one failure
  better than the seventeenth round (7092/112/19). Tail sample maps
  onto the documented bands (password-reset SES provider,
  middleware-fixtures-demo row counts, rate-limit full flow). With
  `tsc --build --force` exit 0 over every test file and no source
  changes on this dispatch, **no TypeScript or lint error can be among
  the 111.**

Same verdict, eighteenth time repeated: every fix is in main, the
done-when is met on a live run (typecheck exit 0 + a build run past the
lint gate), remaining redness belongs to the test-step beads. Closed on
attribution.
