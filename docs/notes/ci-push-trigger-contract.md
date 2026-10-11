# CI push-trigger contract for mta-my-way (2026-10-11)

Which pushes to `main` start an `mta-my-way-build` workflow, and which are
skipped without one. Owns the changed-path half of the 2026-09-23 sensor-noise
incident (99 checkpoint pushes/day, each starting a full ~13-15 min build and
queueing behind the Mutex). The fan-out/scheduling half (serialization, quota,
backlog) is `ci-fan-out-bounding.md`. Bead: `mtamyway-bc6ca875`.

## Pipeline

```
Forgejo push (git.ardenone.com/jedarden/mta-my-way)
  → GitHub push mirror (sync_on_commit)
  → GitHub webhook
  → EventSource github-webhooks / mta-my-way
  → Sensor mta-my-way-sensor
      (declarative-config k8s/iad-ci/argo-events/mta-my-way-sensor.yml,
       ArgoCD Application argo-events-ns-iad-ci)
  → Workflow mta-my-way-build-* from template mta-my-way-build (Mutex-serialized)
```

Delivery latency is 5 s–289 s, and a delivery occasionally never arrives at
all — that is the mirror/webhook path, not the filter (see "Reading why didn't
my push build" below).

## Filter chain (all must pass, ANDed)

| # | Filter | Passes when |
|---|--------|-------------|
| 1 | `headers.X-Github-Event == push` | a push event |
| 2 | `body.ref == refs/heads/main` | main only |
| 3 | `body.head_commit.author.name != Argo Workflows CI` | not the CI author identity |
| 4 | `body.head_commit.message !~ ^ci: (auto-bump version\|initialize VERSION)` | not a resolve-version bump |
| 5 | Lua `filters.script` | at least one changed path outside `.beads/` |

Filter 4 landed 2026-09-21 (mtamyway-1a4ef354): bump commits are authored by
the org Git Identity (`jedarden`), so the author filter alone never matched
them and every real push cost two full runs. Comparator semantics for string
filters (argo-events v1.9.10 `pkg/sensors/dependencies/filter.go`): a
`type: string` value is a Go regexp and `!=` passes only when it does NOT
match; `^` anchors to the start of the whole message. Strings accept only
`=`, `!=` or empty — there is no `notMatches` comparator; the controller
rejects the Sensor over it (frozen pod on the pre-filter spec
2026-09-21..10-11, mtamyway-1a4ef354).

Filter 5 landed 2026-10-11 (this bead, declarative-config `468fc5a4`).

## Script semantics (filter 5)

A data filter cannot express "some changed path is outside `.beads/`" across
every commit and every added/modified/removed array in a push, so filter 5 is
a Lua script. The push is skipped **only** when it visibly changes at least
one path and EVERY added/modified/removed path across ALL commits in the push
starts with `.beads/`. It fires — fail-open — whenever the payload is
missing, malformed, or possibly truncated:

- `event.body` or `body.commits` not a table, or zero commits
- 2048 or more commits (GitHub truncates push payloads at that boundary; a
  later commit may carry a non-`.beads/` path we cannot see)
- `body.size` present but not a number, or larger than the commit count
- any commit or path of an unexpected type
- zero visible changed paths (no evidence the push was beads-only)

## Live verification (2026-10-11; sensor rolled onto the script 19:55:16Z)

Probes were two commit pairs pushed to main and reverted immediately.

| Push | Changed paths | Sensor decision | Workflow |
|------|---------------|-----------------|----------|
| `4961d462` (+`.beads/.needle-path-filter-probe-mtamyway-bc6ca875`) | .beads/ only | filtered 19:56:00.506Z | none |
| `d0a397b2` (adds .beads/ AND docs/ probe files) | mixed | triggered 19:58:06.327Z | `mta-my-way-build-mv6sx` 19:58:11Z |
| `af0056e0` (removes both probe files) | mixed | triggered 20:01:24.608Z | `mta-my-way-build-8bt8r` 20:01:27Z |
| `2ba5dc4d` / `369b264d` / `9efa7073` (checkpoint pointers) | .beads/ only | filtered 20:02:59Z / 20:03:14Z / 20:18:47Z | none |
| auto-bumps `45cb5927` / `dca2a254` / `db9dcbb9` | VERSION only | filtered (filter 4) | none |
| `ba7844e8` (server test) / `d24d9519` (server integration) | packages/ | triggered 20:14:48Z / 20:33:07Z | `8hn8p` / `nplrd` |
| `40ffccf2` (checkpoint pointer) | .beads/ only | no workflow 22:31:21→22:43:31Z; the next workflow (`ptl98` 22:43:31Z) matches the 22:41:19Z code push `03993544` | none |

Tally over the first hours post-rollout: every push carrying a non-`.beads/`
path fired, every `.beads/`-only push and every auto-bump was filtered — zero
misfires either direction.

## Reading "why didn't my push build?"

Sensor pod logs (namespace `argo-events`, pods `mta-my-way-sensor-sensor-*`):

- skipped by a filter: `not interested in dependency mta-my-way-push (didn't pass filter)`
- fired: `Triggering actions after receiving dependency mta-my-way-push`,
  then `Successfully processed trigger 'mta-my-way-build'`

If neither line appears for a push, the delivery never arrived (mirror or
webhook path) — that is a delivery problem, not a filter decision.
