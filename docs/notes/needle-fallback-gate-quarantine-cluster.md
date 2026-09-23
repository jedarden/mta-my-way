# Root cause: the degraded-window-failure / quarantine-round:3 cluster (mtamyway-ae915f0c)

Investigated 2026-09-23. Deliverable of `mtamyway-ae915f0c` (investigate child of
`mtamyway-19ee4b82` root-cause-blocker; siblings: `mtamyway-4b6d02a2` fix,
`mtamyway-5baaf2e8` verify-and-release).

## Summary

The shared signature across the quarantined cohort is produced by **NEEDLE's
fallback verification gate, which is unwinnable in this workspace by
construction**. Since needle 0.6.2 (wired 2026-09-17), every dispatch here is
verified by running `npm test` inside a bare `git archive HEAD` extraction.
That extraction contains no `node_modules` (gitignored, and the fallback runs
no install step), mta-my-way's test script is `"vitest run"`, so the verifier
deterministically fails with `sh: line 1: vitest: command not found` (exit
127) **regardless of bead content**. Every failure increments the bead's
failure-count; five failures trigger quarantine; quarantine expiry re-admits
the bead into the same unwinnable gate, producing the round 1→2→3 cycling.
Because the gate always fails, the workspace is permanently gate-degraded, so
every penalty is also stamped with a `degraded-window-failure:<pre-count>`
marker (N-T22) — and the restoration that would undo those markers never
arrives, because restoration requires a clean verification, which the broken
gate can never produce.

None of the cohort beads is individually broken. The uniform label
progression is one infrastructure defect seen from thirteen different angles.

## Causal chain (each step evidenced below)

1. **2026-08-29** — mta-my-way commit `4401ba25` ("drop verification hook that
   does not exist on any host") removed the `verification:` block from
   `.needle.yaml`, deliberately ending an earlier quarantine wave caused by a
   nonexistent hook. Side effect: the workspace became **gate-less** in
   NEEDLE's terms (no `gates:`, no `verification:`).
2. **2026-09-15 → 09-17** — NEEDLE gained the fallback gate:
   `54241f8e` (fallback-gate core: language detection + verifier selection,
   09-15) and `4657aa60` ("wire fallback verification gate", 09-16 21:04 -0400
   = 09-17 01:04Z). Shipped to workers as **needle 0.6.2**.
3. **The fallback gate cannot pass here.** `select_verifier` picks `npm test`
   from `package.json` and runs it in `extract_clean_workspace` — a
   `git archive HEAD | tar -x` of committed state. `node_modules` is not
   committed and no install step runs (no `npm ci`/`npm install` anywhere in
   `src/dispatch/extraction.rs` or the fallback path).
4. **2026-09-17 17:50:22Z** — first `gate:fallback_node` failure recorded in
   this workspace (`mtamyway-a982bc46`, needle 0.6.2). Version boundary is
   exact: every `verified_success` outcome in this store came from 0.6.1;
   every `gate:fallback_node` failure came from ≥ 0.6.2.
5. **Failure counts cross the quarantine threshold (5)**. Some counts were
   already elevated from pre-0.6.2 declines (`decomposed:split_template`,
   `timeout` indeterminates — a separate, older regime); the rest accumulated
   from the unwinnable gate. Quarantine fires at `failure-count:5`
   (`outcome.quarantine_after_failures`), with 2h→4h→8h backoff per round.
6. **The workspace goes gate-degraded** — both degradation paths trip on the
   same defect: the N-T22 fingerprint path (one identical failure signature
   dominating across many distinct beads) and the execution-error path
   (3 consecutive `git archive HEAD` failures on 2026-09-19 09:13Z, when
   `~/scratch` was out of space: `needle-outcome-fallback-mtamyway-f500153a-*:
   No space left on device (os error 28)`). While degraded,
   `increment_failure_count` stamps every penalty
   `degraded-window-failure:<pre-count>` — **first marker 2026-09-17
   21:07:57Z, last 2026-09-22 06:30:54Z, 37 markers across 13 beads, peaking
   09-21 with 29 markers across 9 beads**.
7. **The designed recovery never fires.** `undo_degraded_window_penalties`
   (N-T22) resets marked beads to their pre-window counts and drops their
   quarantine labels — but only when a clean verification restores the
   workspace. An unwinnable gate makes restoration unreachable, so the
   provisional penalties become permanent and the round 1→2→3 cycling
   continues. This is a deadlock, not a leak: the marker machinery worked;
   its recovery precondition is unsatisfiable while the gate is broken.
8. **Result** — 9 open beads at `quarantine-round:3` with
   `quarantine:failure-count` 5–6, near-identical quarantine timestamps, and
   (for 7 of the 9) the `degraded-window-failure:0..4` progression.

## Evidence

**E1 — Outcome version boundary (attempt_outcomes table, beads.db).** In
2026-09-16..09-19: 155 outcomes, 132 `work_failure reason=gate:fallback_node`.
Store-wide, `verified_success` → needle ≤ 0.6.1 only (57 × 0.6.1, 1 × 0.6.0);
`gate:fallback_node` → 0.6.2–0.6.7 only. First fallback_node failure
09-17T17:50:22Z (`mtamyway-a982bc46`, needle 0.6.2); most recent at close time
15:09:09Z on 09-23 — this investigation's own dispatch (see E4).

**E2 — Daily histogram (attempt_outcomes, this workspace).**

| day (UTC) | outcomes | gate:fallback_node |
|---|---|---|
| 09-16 (pre-wiring) | 10 | 0 |
| 09-17 (0.6.2 rolls out) | 21 | 13 |
| 09-18 | 66 | 64 |
| 09-19 | 58 | 55 |
| 09-20 | 51 | 50 |
| 09-21 | 53 | 50 |
| 09-22 | 80 | 79 |
| 09-23 | 57 | 57 (incl. this investigation's own dispatch) |

**E3 — The failures penalize real work.** The evidence refs on the failed
outcomes are distinct, genuinely landed commits — e.g. `dcfe438a` (clean-room
CI measurement), `c732f675` (docs-only), `af1494cd`, `ebbfe383`, `3ba5bfdc`.
Workers completed and committed work; the verifier, not the work, failed.

**E4 — Live gate-health state.**
`~/.needle/state/gate-health/96c977accde8.json`
(`sha256("/home/coding/mta-my-way")[:12]`), read 2026-09-23:
`"degraded": true`, `degraded_gate: "fallback_node"`,
`degraded_fingerprint: "51702ee4c8fb"`, summary
"fallback verifier 'npm test' exited … sh: line …: vitest: command not found";
plus `consecutive_errors: 3`, `last_error_at 2026-09-19T09:13:27Z` with the
ENOSPC extraction failure quoted above; `fingerprint_window` at close time
holds 9ad0760f ×5 (09-23T13:23Z→14:33Z, the epoch re-verification loop) plus
**`mtamyway-ae915f0c` — this investigation's own dispatch at 15:09:09Z**,
same fingerprint `51702ee4c8fb`: the window is still open today, and this
bead's own verification failed in the identical way it documents.

**E5 — Direct reproduction (2026-09-23).** `git archive HEAD | tar -x` into a
scratch dir: no `node_modules`; `npm test` (script `vitest run`) →
`sh: line 1: vitest: command not found`, **exit 127** — byte-identical to the
degraded_summary in E4.

**E6 — Event timeline (events table).**

- 09-16 23:06Z — `mtamyway-2ccad2ac` round:1 (count 5 from split_template
  declines, pre-window regime).
- 09-17 09:17Z — `mtamyway-16a9001f` round:1 (same regime).
- 09-17 **17:11:52–17:12:00Z** — mass sweep quarantines b0a95d6e, a982bc46,
  74824cd8, 4cc4e913, 66dafa45, 83ac6d44 at round:1 within 8 seconds, each with a
  **zero-duration `quarantine-until`** (label value ≈ application instant —
  the threshold had been crossed ~2h earlier and the sweep applied the
  already-expired windows; 74824cd8/b0a95d6e's expired labels were removed 10s
  later). This antedates the first fallback_node failure by 39 minutes: the
  sweep's counts came from the pre-0.6.2 decline regime.
- 09-17 17:50:22Z — first `gate:fallback_node` failure (0.6.2).
- 09-17 21:07:57Z — first `degraded-window-failure` marker (a982bc46).
- 09-21 01:31→14:06Z — the marker wave: all seven marked cluster beads fail
  repeatedly in the still-degraded window (each failure adds the next
  `degraded-window-failure:<pre-count>`).
- 09-21 13:02→14:06Z — round:2 quarantines as counts hit 5; 74824cd8 and
  b0a95d6e re-fail at pre-count 5 (`degraded-window-failure:5`,
  `quarantine:failure-count:6`).
- 09-21 15:08→20:01Z — round:3 quarantines: 976cd42f 15:08, then
  4cc4e913/66dafa45/83ac6d44 within 17:51:45–:47, b0a95d6e/74824cd8 within
  18:24:35–:36, ac9ad05e 20:01.
- After 09-21 19:00Z the cluster goes quiet (still quarantined) — only
  `mtamyway-3944486f` was dispatched again (4 outcomes, 09-22, all fallback_node
  or timeout) before the degraded-workspace dispatch skip took hold for
  ordinary pluck.

## Cohort roster (state at 2026-09-23)

**The 9 at quarantine-round:3:** 976cd42f (fix CI until green — cf 40),
4cc4e913 (lint-step monitor — cf 39), ac9ad05e (stale assignees), 66dafa45
(DB connection), 83ac6d44 (commit screenshots), 74824cd8 (favorites sync),
b0a95d6e (stateless/stateful split), 2ccad2ac (Pulse log-dump alert),
16a9001f (GTFS 403 repro). 2ccad2ac and 16a9001f carry **no** degraded-window
markers — their counts are entirely pre-window declines; the other seven
carry `degraded-window-failure:0..4` (or `:5` for the two that re-entered the
window already at count 5).

**Milder beads named by the task** — 07689b17 (dw 0,1,2; quarantine expired
09-19), a982bc46 (dw:2; round:1, expired 09-17), 8fd8f402 (dw 0,1,2; expired
09-20), 3944486f (dw:0; expired 09-22). Same mechanism, same fingerprint, but
**none progressed to round:3** — their counts stayed under the threshold and
dispatch into the workspace stopped after 09-22. No dependency changes made by
this investigation; they need the same gate fix, nothing more.

**Adjacent:** 9ad0760f (DNS epoch monitor, cf 132, dw:0) is still dispatched
by its epoch loop and is the sole bead still failing at the gate daily (E4) —
it both demonstrates the window is open and keeps it open. 1a4ef354 closed
09-21 carrying dw:0 (closed over the window; marker left in place).

## Design gaps identified (for mtamyway-4b6d02a2)

- **G1 (root defect):** the fallback verifier runs in a bare committed-state
  extraction with no dependency install, so any workspace whose verifier needs
  `node_modules` has an unwinnable gate. Fix directions: declare a real
  `gates:`/`verification:` command in `.needle.yaml` that works from committed
  state (install step included), or teach the fallback extraction to provide
  dependencies (link the workspace's `node_modules` / capped `npm ci
  --prefer-offline`), or make `select_verifier` fall back to the clean-tree
  check when the selected verifier cannot be assumed runnable.
- **G2 (N-T22 deadlock):** restoration — the only path that undoes
  degraded-window penalties — requires a clean verification, which an
  unwinnable gate can never produce. Provisional penalties become permanent.
- **G3:** gate-degradation does not hard-block re-dispatch of
  quarantine-expired beads, so the cohort burned through rounds 1→2→3 inside
  the window.
- **G4 (secondary):** the 09-19 `~/scratch` ENOSPC stacked the execution-error
  degradation path onto the same state file; disk is healthy again at close
  time (78% on `/`, `~/scratch` emptied) but neither path ever cleared the
  state.
- **G5 (cosmetic):** the 09-17 mass sweep applied round:1 `quarantine-until`
  labels already past (threshold crossed ~2h before the sweep ran).

**Recovery shape:** fix the gate first (G1); the first clean verification then
clears the state file and the restoration sweep (`undo_degraded_window_penalties`)
automatically returns all 13 marked beads to pre-window counts and drops their
quarantine labels — no manual bead surgery required. Clearing the state file
alone would not help: failures would continue and counts rebuild.

## Scope notes

- `mtamyway-976cd42f` ("Fix CI failures and iterate until pipeline is green")
  is unbounded on its own and **cannot** be satisfied from inside this
  workspace: its dispatch gate is the broken thing. Recommend rescoping it to
  the gate repair (or closing it on the G1 fix bead).
- The mechanism is generic: any gate-less NEEDLE workspace whose verifier
  needs uncommitted dependencies hits the same unwinnable gate, and any
  workspace hits the execution-error path when `~/scratch` fills. This doc
  covers this workspace's cluster only.
- Dispatch-gate machinery referenced: `NEEDLE/src/gate_health.rs`
  (degradation, threshold 3, restore + undo),
  `NEEDLE/src/outcome/fallback_verification.rs` (fallback gate, verdict vs
  execution-error split), `NEEDLE/src/validation/fallback.rs`
  (`select_verifier`, `npm test` for Node), `NEEDLE/src/outcome/mod.rs`
  (`increment_failure_count` marking, quarantine, reset-on-success).

## Close-time re-verification (2026-09-23, mtamyway-ae915f0c)

Every load-bearing claim above was re-verified live at close time, not
carried forward from the earlier draft:

- **Roster** — exactly 9 open beads carry `quarantine-round:3`, all at
  `quarantine:failure-count` 5–6; 5 carry `degraded-window-failure:0..4`, 2
  carry `:5`, and 2ccad2ac/16a9001f carry none. All 18 beads named in this
  doc (cohort, milder four, 9ad0760f, 1a4ef354, the 19ee4b82 family) matched
  their described state.
- **Outcomes** — version boundary exact: `verified_success` = 0.6.0/0.6.1
  only (58 total store-wide), `gate:fallback_node` = 0.6.2–0.6.7 only (371
  total); first failure a982bc46 09-17T17:50:22Z on 0.6.2. Daily histogram
  reproduced; E1's 155/132 corresponds to the 09-16..09-19 window.
- **Markers** — exactly 37 `degraded-window-failure:*` label additions across
  13 beads, first 09-17T21:07:57Z (a982bc46), last 09-22T06:30:54Z, peaking
  09-21 with 29 markers across 9 beads — all as stated.
- **Timeline** — every round:1/2/3 event timestamp quoted in E6 reproduced
  from the events table, including the 17:11:52–:59Z sweep (six beads, the
  text now lists all six) and its 39-minute antedating of the first
  fallback_node failure.
- **State file** — `96c977accde8.json` matches E4: `degraded: true`,
  `degraded_gate: fallback_node`, `consecutive_errors: 3`, ENOSPC
  `last_error_at 2026-09-19T09:13:27Z`; fingerprint window at close time
  includes this investigation's own failing dispatch (15:09:09Z).
- **Reproduction** — E5 re-run at close time in a fresh `mktemp -d`:
  `git archive HEAD | tar -x` → no `node_modules`, `npm test` →
  `sh: line 1: vitest: command not found`, exit 127, byte-identical to the
  stored degraded_summary.
- **Source** — `default_quarantine_after_failures() -> 5`
  (`NEEDLE/src/config/mod.rs`), `DEGRADATION_THRESHOLD: u32 = 3`
  (`gate_health.rs`), `NODE_COMMAND = "npm test"` (`validation/fallback.rs`),
  zero `npm ci`/`npm install`/`node_modules` hits in the extraction/fallback
  path, and `undo_degraded_window_penalties` reachable only from
  `restore_degraded_workspace`, which is called only after "all validation
  gates passed" (`outcome/mod.rs` ~line 2470/3815/3904) — the G2 deadlock
  read directly off the call graph.
- **E3 refs** — all five named commits (dcfe438a, c732f675, af1494cd,
  ebbfe383, 3ba5bfdc) appear in `evidence_refs_json` of fallback-failure
  outcomes and resolve to real landed commits.

Fix belongs to `mtamyway-4b6d02a2`; this bead's deliverable is the
identification and this evidence.
