# Lint/typecheck 600s deadlines hold on real runs — 2026-09-13

Bead: `mtamyway-35ab3150` (verification child of umbrella `mtamyway-93ca8a55`,
sibling of `mtamyway-585c2f84`). Template change under test: declarative-config
`e8668ab3` (2026-09-03 23:21:35Z) split the pre-submit pod and raised
`activeDeadlineSeconds` 300s → 600s, because the pre-split combined pod brushed
the 300s ceiling (three deadline deaths on 2026-09-03).

## Verdict

**The 600s deadline holds with wide margin. Zero deadline hits.** Across every
`mta-my-way-build` workflow the cluster still retains (14 runs with node
detail, 16:48–17:56Z on 2026-09-13 — 7 pushes × 2 auto-fired runs), no lint or
typecheck node exceeded one third of the ceiling and no node message anywhere
contains deadline/ignored text.

- **typecheck**: 115–189s, max = **31.5%** of budget (189s on `zgt49`)
- **lint**: 79–145s, max = **24.2%** of budget (145s on `zgt49`)

Every failure recorded in the window is a step failing **on its own merits**
(exit codes, not deadlines). No further raise is indicated — the old 300s
ceiling was the real constraint (observed max 189s is 63% of 300s, so the
pre-split combined pod plausibly exceeded it, and the split also removes the
sharing).

## Evidence — per-node durations (all retained runs)

| Workflow | Created (UTC) | typecheck | lint | typecheck phase | lint phase |
|---|---|---|---|---|---|
| `mta-my-way-build-xgxct` | 09-13 16:48:54 | 139s | 107s | Succeeded | Failed (exit 1) |
| `mta-my-way-build-l5t4w` | 09-13 16:49:08 | 129s | 107s | Succeeded | Failed (exit 1) |
| `mta-my-way-build-x22bq` | 09-13 16:55:48 | 136s | 104s | Failed (exit 2) | Failed (exit 1) |
| `mta-my-way-build-7dbjg` | 09-13 16:56:05 | 128s | 103s | Failed (exit 2) | Failed (exit 1) |
| `mta-my-way-build-gxbbl` | 09-13 17:07:52 | 142s | 114s | Failed (exit 2) | Failed (exit 1) |
| `mta-my-way-build-tg6nh` | 09-13 17:08:08 | 123s | 114s | Failed (exit 2) | Failed (exit 1) |
| `mta-my-way-build-w5zvl` | 09-13 17:37:02 | 144s | 112s | Failed (exit 2) | Failed (exit 1) |
| `mta-my-way-build-g8rm7` | 09-13 17:37:17 | 137s | 110s | Failed (exit 2) | Failed (exit 1) |
| `mta-my-way-build-smbwf` | 09-13 17:47:50 | 134s | 83s | Failed (exit 2) | Failed (exit 1) |
| `mta-my-way-build-zgt49` | 09-13 17:48:09 | **189s** | **145s** | Failed (exit 2) | Failed (exit 1) |
| `mta-my-way-build-bhf5b` | 09-13 17:53:56 | 175s | 79s | Failed (exit 2) | Failed (exit 1) |
| `mta-my-way-build-qvhc8` | 09-13 17:54:14 | 115s | 122s | Failed (exit 2) | Failed (exit 1) |
| `mta-my-way-build-wfv96` | 09-13 17:55:38 | 177s | 82s | Failed (exit 2) | Failed (exit 1) |
| `mta-my-way-build-stw98` | 09-13 17:55:59 | 125s | 128s | Failed (exit 2) | Failed (exit 1) |

All node messages in the window are `main: Error (exit code N)` or the
workflow-level `child '…' failed`; the deadline-text scan (`deadline|ignored`,
case-insensitive) over **every node of every retained run** returns zero rows.
A 16:44Z pair had already been reaped by the workflow TTL by the time node
detail was pulled (retention window ≈ 70 min at current churn). Those two are
covered by the deadline-text scan — it ran over all 16 workflows then retained,
including them, and returned zero rows — but their per-node durations were not
captured. 14 runs with full duration evidence clear the ≥5-run bar regardless.

## The deadline actually live in-cluster

Verified against the live `workflowtemplate mta-my-way-build` object (not the
ArgoCD app, per the known sync-lag failure mode):

| Step | activeDeadlineSeconds |
|---|---|
| resolve-version | 300 |
| lint | **600** |
| typecheck | **600** |
| test | 600 |
| docker-build | 1800 |
| update-declarative-config | 180 |

All sampled runs are ≥ 2026-09-13 16:48Z, comfortably after `e8668ab3`
(2026-09-03), so the numbers above measure the raised deadline.

## Failure attribution in the window (context, not this bead's scope)

- **lint exit 1 on every run** — the repo-wide biome breakage that landed on
  main ≥ 2026-09-13 (~1760 errors at HEAD, dominated by generated
  `proto/compiled.js`; documented in the lint-baseline memory). Even the two
  oldest runs, where typecheck still `Succeeded`, fail lint the same way.
- **typecheck exit 2 starting 16:55:48Z** — a regression introduced by a push
  between the 16:49 and 16:55 pairs (the 16:48/16:49 pair still typechecks
  green). Not diagnosed here; failures are genuine compile errors, not
  deadline kills.
- Because lint fails first, `docker-build` remains unreachable in every run —
  consistent with the 2026-09-04 finding.

## Method

```bash
kubectl --server=http://traefik-iad-ci:8001 get workflows -n argo-workflows -o json \
  | jq '[.items[] | select(.metadata.name | startswith("mta-my-way-build"))]
        | .[] | . as $wf | [.status.nodes[]?
        | select(.displayName == "lint" or .displayName == "typecheck")
        | {wf: $wf.metadata.name, step: .displayName, phase: .phase,
           dur_s: ((.finishedAt|fromdateiso8601)-(.startedAt|fromdateiso8601)),
           msg: .message}]'
```

plus a `deadline|ignored` message scan over all nodes, and
`get workflowtemplate mta-my-way-build -o json | jq '[.spec.templates[] |
{name, deadline: .activeDeadlineSeconds}]'` for the live deadline values.
