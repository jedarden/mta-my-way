# Typecheck local-green verified on pushed origin/main — 2026-09-04

Bead: `mtamyway-c9c3995f` (local-green half of umbrella `mtamyway-692a6a56`'s
done-when). Third verification attempt; the first two closed green while the
tree was still red. Companion to
[`typecheck-ci-proof-2026-09-04.md`](./typecheck-ci-proof-2026-09-04.md),
[`typecheck-ci-run-gate-2026-09-04.md`](./typecheck-ci-run-gate-2026-09-04.md)
and [`typecheck-gate-monitor-2026-09-04.md`](./typecheck-gate-monitor-2026-09-04.md).

## Verdict

**True this time.** `npm run typecheck` exits **0** on a clean checkout of
pushed `origin/main` (`b34e747`, `0.0.381`), with zero errors across
`packages/web` and `packages/shared`. CI independently corroborates it: two
`mta-my-way-build` runs on that exact SHA record `typecheck: Succeeded`, the
gate that had failed exit 2 on every prior run. No new error class appeared —
there are no errors at all to classify.

Downstream of the gate the pipeline is **not** green: both runs then failed in
group [2] `test` with *"Pod was active on the node longer than the specified
deadline"* — a pod deadline, not a compile error. That is outside this bead's
scope (typecheck only) and belongs to the test-step work tracked in
[`test-step-monitor-2026-09-04.md`](./test-step-monitor-2026-09-04.md). Recorded
here so nobody reads "typecheck green" as "pipeline green".

## Prerequisites — the chain is actually landed

All four chain beads are closed, and the shared checkout's residual-inventory
commits are reachable from pushed `origin/main`:

| Bead | Scope | Landed as |
|---|---|---|
| `mtamyway-9cecf8b1` | land WIP + factories helper | `cd9e752` (earlier) |
| `mtamyway-be5712ba` | 13 errors, service-worker/background-sync | `3445221` |
| `mtamyway-78ec5d0c` | 16 errors, 4 hook files | `dabc1bc` |
| `mtamyway-2a94b4e5` | 8 errors, HomeScreen + FavoritesList | `c0b41cf` |

Current `origin/main` is `b34e747` = `c0b41cf` + a `VERSION` auto-bump only
(`git diff` between them touches `VERSION` alone), so the measurement surface
and the fix surface are the same tree.

## Local measurement — clean room, not the shared checkout

Method, per the established pattern for this repo: `git archive b34e747 |
tar -x` into a scratch directory, copy `node_modules` in (`cp -a`, root plus
the three workspace copies — never a symlink), then `npm run typecheck` with
no `tsbuildinfo` present. `git archive` of a SHA is exactly the content CI
clones, so the shared checkout's uncommitted files — the reason every earlier
green reading on this repo failed to reach CI — cannot contaminate it.

| Check | Result |
|---|---|
| `npm run typecheck` (clean tree, no buildinfo) | **exit 0** |
| `npx tsc --build --force` (full rebuild) | **exit 0** |
| `error TS` occurrences in combined output | **0** |
| Untracked/modified files under `packages/` | none (archive extract) |

### Positive control

Because this bead has twice recorded a false green, the harness was proved to
detect errors rather than merely to exit 0. Same clean room, three runs:

| Step | Result |
|---|---|
| baseline `npm run typecheck` | exit 0 |
| inject `const __posctl: number = "…"`, re-run | exit 1, `error TS2322: Type 'string' is not assignable to type 'number.'` |
| restore the file, re-run | exit 0 |

The toolchain compiles, the exit code moves, and the injected error is named.
A zero here is a real zero.

## CI corroboration — a natural A/B on the same step

Four `mta-my-way-build` runs bracket the landing of the last fix. Each run's
`resolve-version` pod publishes the SHA it cloned, so the comparison is on the
step, not on inference:

| Run | SHA | `version` | `lint` | `typecheck` | entered `test` |
|---|---|---|---|---|---|
| `mta-my-way-build-r4d8z` | `11d8817` | 0.0.380 | Succeeded | **Failed** (exit 2) | no |
| `mta-my-way-build-kx75z` | `11d8817` | 0.0.380 | Succeeded | **Failed** (exit 2) | no |
| `mta-my-way-build-kp4nt` | `b34e747` | 0.0.381 | Succeeded | **Succeeded** | yes — failed on deadline |
| `mta-my-way-build-9tgwl` | `b34e747` | 0.0.381 | Succeeded | **Succeeded** | yes — failed on deadline |

`11d8817` is the auto-bump that precedes `c0b41cf`; `b34e747` is the auto-bump
that follows it. Same template, same step group, one commit of fixture typing
between them, and the gate flips from exit 2 to Succeeded on both sides of the
pair. Per the template's shape documented in
[`typecheck-ci-proof-2026-09-04.md`](./typecheck-ci-proof-2026-09-04.md), the
run only reaches group [2] once **both** pods in group [1] exit 0 — and both
runs did reach it, which is the transition `mtamyway-ceac46ec` was written to
observe.

## Handoff to the CI-verification child

`mtamyway-ceac46ec` needs no new run submitted to prove the typecheck half:
`kp4nt` and `9tgwl` already are that run, on the current `origin/main` head,
with the step transition recorded above. What remains open on that bead is the
`test` group, which is a separate failure with a separate owner.

## Why the first two closes were wrong

Both predecessors measured a surface CI never sees. The 21:20Z close recorded
green from the shared checkout's working tree, which carried uncommitted
fixture fixes; the 23:14Z reopen note corrected the method but the same
premature-close pattern then repeated with no close reason recorded. This
attempt measures only `git archive` of a pushed SHA, and records the CI runs
on that same SHA alongside it so the local reading is not the sole evidence.
