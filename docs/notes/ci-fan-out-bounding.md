# Bounding mta-my-way CI run fan-out (2026-09-21)

Owns the workflow fan-out / scheduling half of the 2026-09-20 iad-ci incident
(eight `mta-my-way-build` workflows Running at once, test pods quota-forbidden
on `argo-workflows-budget`). Substantive test failures remain owned by
mtamyway-976cd42f; this note and bead mtamyway-1a4ef354 own only fan-out and
scheduling. Bead: `mtamyway-1a4ef354`.

## Root causes

1. **Bump-commit re-trigger.** `resolve-version` pushes `ci: auto-bump version
   to X.Y.Z` with the org Git Identity (`jedarden`), so the sensor's existing
   author filter (`head_commit.author.name != "Argo Workflows CI"`) never
   matched bump pushes and each one started a full duplicate pipeline run of a
   VERSION-only diff — re-running every gate against an identical tree and
   re-pushing the same image tag. Every real push cost two full runs.
   Live proof (push → run created):

   | bump commit | version | pushed (UTC)   | run created           | Δ      |
   |-------------|---------|----------------|-----------------------|--------|
   | `64414183`  | 0.0.654 | 11:06:14       | `x2tjs` 11:06:29      | 15 s   |
   | `2d7fd6fb`  | 0.0.655 | 13:05:55       | `dsg67` 13:06:11      | 16 s   |
   | `1fbbfeae`  | 0.0.656 | 13:12:25       | `l89xq` 13:12:37      | 12 s   |

2. **Unbounded concurrent real pushes.** No serialization existed between
   runs, so bursts of fleet pushes (bead-close commits) overlapped without
   bound; eight simultaneous runs against a 3500m/5Gi requests quota is
   self-starvation — a single run's test pod (1000m/2Gi request) cannot
   schedule.

3. **Adjacent, recorded here but not owned by this fix:** the sensor's
   workflow submission is not retried on argo-server API timeout, so a push
   can be silently lost. On 2026-09-21 the pushes `05de4fe9` (webhook
   13:55:02Z, event `ba460ec2…`) and `0fdf3e16` (webhook 14:05:19Z, event
   `41c024fe…`) were both received by the EventSource and published to the
   bus, but the sensor's submits failed with `rpc error: code = InvalidArgument
   … (get workflowtemplates.argoproj.io mta-my-way-build)` / request-timeout;
   the first produced no workflow at all, the second produced
   `mta-my-way-build-xdfmv`, which the controller never admitted (phase=None,
   0 nodes — the known phase-None zombie class). Needs its own bead if the
   fleet wants retry-on-timeout semantics; not changed here because retries
   would add submissions and this bead bounds them first.

## Fix (GitOps only)

`jedarden/declarative-config`, both pushed and ArgoCD-synced 2026-09-21:

- **`c44cfd20`** — `k8s/iad-ci/argo-events/mta-my-way-sensor.yml`: data filter
  `body.head_commit.message notMatches '^ci: (auto-bump version|initialize
  VERSION)'`. Bump commits no longer trigger; any other head-commit message on
  `refs/heads/main` still triggers; author filter retained. Live Sensor CRD
  verified carrying the filter 15:32Z and 16:03Z.
- **`c44cfd20` + `61c07622`** — `k8s/iad-ci/argo-workflows/mta-my-way-workflowtemplate.yml`:
  `spec.synchronization.mutexes: [{name: mta-my-way-build}]` (list form,
  matching every other mutex-using template in that directory; Argo Workflows
  v4.0.11). One run executes at a time; later runs wait on the mutex and
  create zero pods while waiting, so waiting is free. Live WorkflowTemplate
  verified carrying the mutex 16:03Z.

Why a mutex rather than cancel-in-progress: cancel-in-progress (kill the
older run the moment a newer push lands) needs a watcher Deployment and is
deliberately not built. The mutex already guarantees the newest push's run
completes a full, correctly attributed check of its commit; staleness of
older waiters is bounded by the workflow-level `activeDeadlineSeconds: 10620`
backstop, which ticks while a run waits, so a burst deeper than the queue can
drain prunes its own oldest waiters instead of queueing forever.

Bound math: one admitted run requests at most ~1000m/2Gi at any moment (worst
concurrent step pair is lint ∥ typecheck at 500m/1Gi each; test and wcag run
sequentially at 1000m/2Gi), comfortably inside `argo-workflows-budget`
(3500m/5Gi) even alongside other tenants. No gate is skipped or masked: the
DAG (resolve-version → lint ∥ typecheck → test → wcag-audit → docker-build →
update-declarative-config) and every per-step deadline are unchanged by both
commits (insertions-only diffs).

## State at the moment of the fix (2026-09-21 16:08Z, per-run GETs)

All pre-date the mutex (stored templates pre-sync), hold no mutex, and
together hold almost no quota (namespace-wide: 4 pods, 300m/3500m CPU,
640Mi/5Gi). Backstop reaping lags hours under load — that enforcement lag is
mtamyway-976cd42f's infra bucket, not this bead's.

| run       | created (UTC) | true phase | pod state |
|-----------|---------------|------------|-----------|
| `cjdlz`   | 04:58:50      | Running    | `lint` pod Running since 06:02:40Z — 10 h past its own 600 s deadline and the 10620 s workflow backstop |
| `m2cst`   | 10:45:28      | Running    | no pod |
| `8djhl`   | 11:26:13      | Running    | no pod |
| `x2tjs`   | 11:06:29      | Running    | no pod (bump 0.0.654 child) |
| `bnd8l`   | 11:45:21      | Running    | no pod |
| `znsml`   | 12:14:06      | Running    | no pod |
| `8gmxs`   | 12:22:35      | Running    | no pod |
| `fsdkh`   | 12:35:24      | Running    | no pod |
| `dsg67`   | 13:06:11      | Running    | no pod (bump 0.0.655 child) |
| `zgpwr`   | 13:10:26      | Running    | no pod |
| `l89xq`   | 13:12:37      | Running    | no pod (bump 0.0.656 child) |
| `r4g5h`   | 13:23:55      | Running    | no conditions |
| `xxz2d`   | 13:36:03      | Running    | no conditions |
| `xdfmv`   | 14:05:23      | **phase=None** | 0 nodes — submitted, never admitted (lost-submission case above) |

Trigger census label lists corroborate: Pending 0 / Running 13 / Succeeded 0 /
Failed 0, and phase-None members are invisible to all of them (xdfmv counted
nowhere).

## Relation to other beads

- **mtamyway-976cd42f** — owns the substantive test failures (known-red
  auth/security suites) and the controller enforcement-lag infra class: the
  hollow Running zombies above, `cjdlz`'s 10 h lint pod, backstop/deadline
  kills landing hours late, and phase-None zombies like `xdfmv`. This bead
  removes mta-my-way's own contribution to that starvation (double-triggered
  and overlapping runs) but does not fix the controller lag.
- **mtamyway-24945b8b** — "verify automatic push triggering / close
  migration": the witness push of this file (first real push after the filter
  landed) re-verifies push→run auto-trigger end to end; outcome recorded on
  the bead. No `.github/workflows/` exists in this repo (Argo-only CI).
