# CI sensor: beads-only pushes skip the build

## What

`mta-my-way-sensor` (cluster `iad-ci`, namespace `argo-events`) no longer starts
`mta-my-way-build` when a push to `refs/heads/main` changes only paths under
`.beads/`. The gate is a Lua `script` filter on the `mta-my-way-push` event
dependency, evaluated after the existing data filters.

## Why

bead-rs publishes a git checkpoint on every bead mutation and fleet workers
close beads constantly: on 2026-09-23 `origin/main` took 99
`chore(beads): ...` checkpoint commits in 24 h. Each one cleared the sensor's
older filters (author `Argo Workflows CI` plus `^ci:` message prefixes,
mtamyway-1a4ef354), so every checkpoint push queued a full ~13–15 min build.
Runs serialize on `Mutex/mta-my-way-build`, so by 2026-09-23 the queue held
117 Pending runs behind 1 Running and a push's verdict arrived roughly a day
late.

## How

Manifest: `k8s/iad-ci/argo-events/mta-my-way-sensor.yml` in
`jedarden/declarative-config` (fix commit `468fc5a4`), synced by the ArgoCD
Application `argo-events-ns-iad-ci` (argocd namespace, rs-manager cluster).
Argo Events v1.9.10 runs `EventDependencyFilter.script` (a Lua chunk) after
the data filters; the script:

- returns true (build) unless the payload is a table with a non-empty
  `commits` array — a missing or malformed payload never suppresses a build;
- returns true when `#commits >= 2048` (GitHub caps push payloads at that
  boundary, so a later commit could carry a real path) and when a supplied
  `body.size` is non-numeric or greater than `#commits` (possible truncation
  signal);
- walks every commit's `added`, `modified`, and `removed` arrays and returns
  true on the first path that does not start `.beads/`, on any non-string
  path, and when the walk saw no changed paths at all.

The only way a push is skipped is that every changed path of every commit in
the payload is under `.beads/`. A mixed push — a docs edit plus a checkpoint,
say — always builds: the skip decision is made on changed paths, never on the
head commit's message (checkpoint commits carry arbitrary close messages).

## Failure modes to keep in mind

- Data-filter comparators are `=` / `!=` against Go regexps (`type: string`).
  There is no `notMatches`; an unknown comparator makes the controller reject
  the whole Sensor and the pod freezes on the old spec (that froze this sensor
  2026-09-21..10-11, mtamyway-1a4ef354). Put new matching logic in the Lua
  script, not in an invented comparator.
- The script fails open on purpose: the worst case of a bug here is the old
  behavior (an extra build), never a silently missed build.
- Workflow objects are TTL-GC'd in `argo-workflows`; absence from the workflow
  list is not evidence a build did not run. The sensor pod log is the
  decision record: `not interested in dependency mta-my-way-push (didn't pass
  filter)` vs `Triggering actions after receiving dependency mta-my-way-push`.

## Tracking

- Bead mtamyway-bc6ca875 — this change (probe evidence lives on the bead).
- Bead mtamyway-1a4ef354 — the earlier author/message filters.
- Draining the accumulated queue and bounding its depth is a separate bead,
  out of scope here.
