# CI node-shape contract — lint and typecheck stay separate templates

**Date:** 2026-09-13 (bead mtamyway-8312f9b3, last child of umbrella
mtamyway-93ca8a55)

## The contract

In every Argo WorkflowTemplate that runs this repo's checks, **lint and
typecheck must be separate `WorkflowTemplate` step templates, so each check
reports under its own node name**, each with its own
`activeDeadlineSeconds: 600`. They run as parallel siblings in the same step
group — neither depends on the other, and neither may absorb the other's
command.

This holds for both templates that build this repo, both defined in
`jedarden/declarative-config` under `k8s/iad-ci/argo-workflows/`:

| Template (file) | `metadata.name` | lint | typecheck | step shape |
|---|---|---|---|---|
| `mta-my-way-workflowtemplate.yml` | `mta-my-way-build` | own template, 600s | own template, 600s | parallel siblings, after `resolve-version`, before `test` |
| `mta-my-way-ci-workflowtemplate.yml` | `mta-my-way-ci` | own template, 600s | own template, 600s | parallel siblings, after `checkout` + `install-dependencies`, alongside `test` |

If a future edit merges them back into one step (or gives one template both
commands), a failure can no longer be attributed to the right check, and a
300s-vs-600s mistake re-exposes the timeout failure mode below.

## The incident (why the contract exists)

Before `2f07e984`, `mta-my-way-build` ran a single combined `lint` step
containing both commands. A **typecheck** failure inside that step surfaced as
**"lint failed (exit 2)"** — the investigation went to the wrong check (lint
was clean; typecheck had the errors). The exit code was the tell that the
label was wrong: `tsc` exits 2, Biome/ESLint exit 1, so a "lint" node failing
with exit 2 was never lint.

Two commits in declarative-config fixed it:

- **`2f07e984`** (2026-09-03) — *fix(ci): split mta-my-way-build
  lint/typecheck into separate templates (mtamyway-93ca8a55)*. Lint and
  typecheck became parallel sibling steps, each with its own template,
  matching the shape `mta-my-way-ci-workflowtemplate.yml` already used.
- **`e8668ab3`** (2026-09-03) — *fix(ci): raise mta-my-way-build
  lint/typecheck deadlines to 600s (mtamyway-93ca8a55)*. Each split pod now
  pays its own clone + `npm ci`, and the combined pod had already been
  brushing the old 300s ceiling (three of five runs died on the deadline
  rather than reporting a real result). 600s matches
  `mta-my-way-ci-workflowtemplate.yml`; the workflow-level cap was rebased to
  11520s (7680s of per-step deadlines × attempts, +50%).

Verification children of the umbrella confirmed the split end to end on
2026-09-13: live template shape (mtamyway-19fb7de1), node attribution on a
real failed run — `typecheck` node Failed "Error (exit code 2)" while `lint`
reported separately "Error (exit code 1)" on workflow
`mta-my-way-build-tg6nh` (mtamyway-585c2f84) — and 600s deadlines holding with
wide margin across 14 retained runs, worst case 189s (mtamyway-35ab3150,
report in `docs/ci-reports/lint-typecheck-deadline-verify-2026-09-13.md`).

## Parity status (2026-09-13, read-only check)

Both files **still model the same shape — no drift**:

- `mta-my-way-ci-workflowtemplate.yml`: last modified `20c36e6f` (2026-08-11,
  image pinning) — untouched since before the split; the split was done to
  match *its* shape.
- `mta-my-way-workflowtemplate.yml`: `2f07e984` + `e8668ab3` are ancestors of
  origin/main; later commits (`062e55d5`, `9a5f66f7`) touched only the test
  step.
- Live objects in `argo-workflows` on iad-ci (credential-free read-only
  endpoint) match the manifests: both templates expose `lint` and `typecheck`
  as separate templates with `activeDeadlineSeconds: 600`, parallel siblings
  in the entrypoint's step list.

Non-shape differences, deliberate and **not** drift: `mta-my-way-ci` uses
`node:22-alpine` with a shared workspace volume (one `checkout` +
`install-dependencies`, reused by every step), while `mta-my-way-build` uses
`node:22-slim` and each check template clones and `npm ci`s for itself — that
per-pod cost is exactly why `e8668ab3` raised the build template's deadlines.
Cosmetic only: the ci file's header comment still cites bead `bf-3sv3`
(pre-bead-rs era).

## How to verify node attribution on a run

Read-only; the credential-free endpoint suffices for all of it.

```bash
# 1. Template shape (manifest == live, no drift): lint and typecheck must
#    appear as separate templates, each with activeDeadlineSeconds: 600.
kubectl --server=http://traefik-iad-ci:8001 get workflowtemplate \
  mta-my-way-build -n argo-workflows -o json | jq -r '
  .spec.templates[] | select(.name == "lint" or .name == "typecheck") |
  "\(.name): deadline=\(.activeDeadlineSeconds)"'
# expect exactly two lines:
#   lint: deadline=600
#   typecheck: deadline=600

# 2. On a run: each check must report under its own node name with its own
#    phase/exit code.
kubectl --server=http://traefik-iad-ci:8001 get workflow <run-name> \
  -n argo-workflows -o json | jq -r '
  .status.nodes[] | select(.displayName == "lint" or .displayName == "typecheck") |
  "\(.displayName): \(.phase) \(.message)"'
# attribution is correct when the two names are distinct and the exit codes
# differ in the expected direction: lint → exit 1, typecheck → exit 2.
```

Failure signatures:

| Node name | Message | Meaning |
|---|---|---|
| `typecheck` | `Error (exit code 2)` | Real type errors — working as intended |
| `lint` | `Error (exit code 1)` | Real lint errors — working as intended |
| `lint` | `Error (exit code 2)` | **Contract regression** — typecheck is running inside the lint node again; re-check the template shape before debugging lint |
| either | deadline Exceeded | Deadline too low for the per-pod clone + `npm ci` cost — compare against the 600s rationale in `e8668ab3`, don't just re-raise |

Note the manifests sync through the GitHub mirror with a 15–30 min ArgoCD lag
(`argo-workflows-ns-iad-ci` app) — verify against the live object, not the
manifest alone, before concluding drift.
