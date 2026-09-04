# Noise-bead sweep — reconstruction, reconciliation, and open-frontier classification

**Date:** 2026-09-04 · **Bead:** mtamyway-5b77a98f (child 1 of mtamyway-93fd2f78's split)
**Snapshot:** 1010 beads in the store; 80 non-closed (68 open, 9 blocked, 2 in progress, 1 deferred).

## 1. Reconstructed noise definition

The parent claimed "165 of 995 beads are noise" but never recorded the definition. It is
recoverable: the 2026-09-03 sweep wrote its per-bead classification basis into every close
reason, and `.beads/checkpoint/forensic.jsonl` preserves all 344 of them (16 distinct texts).
The definition the sweep actually used is **broader** than "directory exists / binary in PATH":

| # | Category | Evidence (distinct close-reason texts) | Count |
|---|---|---|---|
| A | **Agent-environment probes** — verifying the agent's own surroundings rather than the product: shell/pwd/PATH/SHELL env, tool availability (bead CLI, ripgrep, grep, typecheck command), WebSearch/tool inventory, agent system-prompt location, NixOS system profiles and `/run/current-system`, environment permissions and paths | 7 reason texts | 225 |
| B | **Micro-verify no-ops** — directory/file existence-permission checks, directory navigation and listing steps | 2 reason texts | 57 |
| C | **Reporting artifacts of probes** — a second bead whose only deliverable is restating a probe's output | 1 reason text | 22 |
| D | **Read-only reconnaissance micro-steps** — "identify the test framework / config" with no downstream artifact | 1 reason text | 11 |
| E | **Already-shipped micro-steps** — codebase-search beads whose target already exists (SHELL validation in `security-startup.ts`; `parseEnvBool` in `packages/shared/src/utils/env.ts`; `createMockStation` in `packages/shared/src/testing/test-helpers.ts`) | 3 reason texts | 24 |
| F | **Phantom targets** — beads naming modules in a language this repo does not use (Rust `env_parse.rs`/`lib.rs` in a TypeScript monorepo) | 1 reason text | 4 |
| G | **Machine-generated starvation alerts** — empty Pluck payloads and stale scanner artifacts, regenerable by definition | 1 reason text | 1 |
| | **Total sweep-tagged closures** | | **344** |

All 344 closed on **2026-09-03**. Creation dates cluster at 2026-08-28 (227) and 2026-08-29
(101) — the starvation wave; mtamyway-3039b9d0's own note corroborates it ("the old dependency
chain decomposed into 60+ shell/path/Rust-file discovery beads in this TypeScript repo").

## 2. Reconciliation of the parent's "165" claim

| Quantity | Value |
|---|---|
| Noise beads the parent claimed | 165 |
| Closures tagged `noise sweep mtamyway-93fd2f78` | **344** (all 2026-09-03) |
| Title-shaped noise beads (regex: Check/Verify/Locate/Confirm/Ensure/Test + directory/binary/path/exist/permission/invocation/installed/available/shell) | 113, **0 open** |
| — of those, closed under the sweep's tag | 80 |
| — of those, closed earlier **as successful work** | 33 (e.g. "Bead CLI verified: bead 0.2.1 installed and functional", "Directory existence verified — packages/server/ accessible with proper permissions") |
| Minimum total noise closures across all passes | **377** (344 tagged + 33 earlier) |
| Residual noise closed by the 2026-09-04 pass (this bead) | 1 (mtamyway-73dbf5ad, category G) |
| Noise beads remaining open | **0** |

The 165 was an estimate written at 2026-09-03T22:13Z, before the sweep's own closures landed
(23:07–23:14Z and later). The durable record supersedes it: the sweep closed 344, not 165.

## 3. Classification of every non-closed bead (80 of 80)

Basis per category: a bead is **functionality** when it prescribes a code, test, manifest,
verdict, or documentation deliverable about mta-my-way (or, for the sweep/tracker groups,
about the work-tracking process itself); it is **noise** when its entire deliverable is
confirming an environmental precondition or restating a probe/scanner artifact. Borderline
titles were decided on the *body*: "Verify session middleware is configured and functional"
(mtamyway-d624b0f7) verifies application behaviour, not the agent's environment —
functionality. "Confirm no `.github/workflows/` directory exists" inside the CI-migration bead
(mtamyway-24945b8b) is a real workspace-policy check — functionality.

| Bead | Status | Category | Title |
|---|---|---|---|
| mtamyway-2c9a321e | open | APP-BUG | Stabilize integration test suite |
| mtamyway-3039b9d0 | deferred | APP-BUG | Implement circuit breaker for core to stateful calls |
| mtamyway-46d1f2f0 | open | APP-BUG | Harden security middleware edge cases and add missing coverage |
| mtamyway-53d4970c | open | APP-BUG | Integrate observability stack end-to-end with API request lifecycle |
| mtamyway-66dafa45 | open | APP-BUG | Investigate root cause of database connection not being open at runtime |
| mtamyway-69cac937 | in_progress | APP-BUG | Restore push notification startup wiring deleted by e05c4a0/3bb893c — VAPID 503s and no notific |
| mtamyway-78b32eae | open | APP-BUG | Stabilize E2E suite in CI |
| mtamyway-7ed5c96b | open | APP-BUG | Fix rules-of-hooks violation in HomeScreen.tsx — early return before hooks crashes when onboard |
| mtamyway-8a1380e4 | open | APP-BUG | Fix data and workflow integration tests |
| mtamyway-91011884 | open | APP-BUG | Fix remaining integration tests and validate full suite |
| mtamyway-a982bc46 | open | APP-BUG | Add cleanupAllState to integration test beforeEach hooks |
| mtamyway-b21236e4 | open | APP-BUG | Add database lifecycle health check to prevent closed-db requests at the HTTP layer |
| mtamyway-bd17781f | open | APP-BUG | Verify test isolation by running each integration test file individually |
| mtamyway-cad0c1a6 | open | APP-BUG | Add data migration validation, seed tooling, and rollback safety |
| mtamyway-d2c54c27 | open | APP-BUG | Fix test infrastructure isolation in helpers and setup |
| mtamyway-d624b0f7 | open | APP-BUG | Verify session middleware is properly configured and functional |
| mtamyway-e3ede646 | open | APP-BUG | Fix beforeAll state leakage in delay predictor tests |
| mtamyway-ee10b029 | open | APP-BUG | Fix security and auth integration tests |
| mtamyway-f50852ae | open | APP-BUG | Add db.open guards to push/subscriptions.ts database operations |
| mtamyway-07689b17 | open | CI-DEPLOY | Trigger and validate lint and test steps in Argo workflow |
| mtamyway-0b817825 | open | CI-DEPLOY | Commission the deployed core/stateful split as one end-to-end product gate |
| mtamyway-15d23707 | open | CI-DEPLOY | Deploy to apexalgo-iad and verify production health |
| mtamyway-24945b8b | open | CI-DEPLOY | Verify automatic push triggering and close migration |
| mtamyway-4cc4e913 | open | CI-DEPLOY | Monitor and validate lint step completion |
| mtamyway-622f4cd7 | open | CI-DEPLOY | Validate public API health and route isolation |
| mtamyway-6895e35e | open | CI-DEPLOY | Validate IngressRoute traffic split configuration |
| mtamyway-692a6a56 | open | CI-DEPLOY | 486 TypeScript errors fail the CI 'lint' step on every mta-my-way-build run |
| mtamyway-7bd2a141 | open | CI-DEPLOY | Audit IngressRoute manifests and map route rules to backend services |
| mtamyway-8654ee92 | open | CI-DEPLOY | Monitor test step in Argo workflow and validate all tests pass |
| mtamyway-93ca8a55 | open | CI-DEPLOY | Split the CI 'lint' step so a typecheck failure does not report as a lint failure |
| mtamyway-976cd42f | open | CI-DEPLOY | Fix CI failures and iterate until pipeline is green |
| mtamyway-9e2b3639 | open | CI-DEPLOY | Monitor test step execution and capture output |
| mtamyway-a6230028 | open | CI-DEPLOY | Monitor Docker build step and verify workflow completes successfully |
| mtamyway-b0a95d6e | open | CI-DEPLOY | Split mta-my-way into stateless core + stateful subsystem deployments |
| mtamyway-d26515d5 | open | CI-DEPLOY | Add live routing verification and document IngressRoute rules and service mappings |
| mtamyway-e4b179ef | open | CI-DEPLOY | VERSION is 0.0.349 with no release and no tag ever cut |
| mtamyway-ebffc00e | open | CI-DEPLOY | Migrate CI from GitHub Actions to Argo Workflows |
| mtamyway-00c48bc3 | open | DOCS | Fix README Preview claim: docs/ contains no screenshots |
| mtamyway-28eb7937 | open | DOCS | Document the middleware testing module structure |
| mtamyway-665d0c00 | open | DOCS | Document test helpers and fixtures |
| mtamyway-83ac6d44 | open | DOCS | Commit updated screenshots to git |
| mtamyway-be590525 | open | DOCS | Document HTTP, async, and performance testing utilities |
| mtamyway-fee677b8 | open | DOCS | Verify README Preview section accuracy |
| mtamyway-74824cd8 | open | FEATURE | Ship cross-device favorites sync using the existing (disabled) OAuth/session framework |
| mtamyway-73dbf5ad | open | NOISE-G | [Pulse] [test] {"level":"error","message":"Failed to record trip","timestamp":"2026-07-04T21:34 |
| mtamyway-38f4e2a1 | open | SWEEP-PROCESS | Run the final ready-frontier and verdict gate and record the report |
| mtamyway-5b77a98f | in_progress | SWEEP-PROCESS | Audit and finish the noise-bead sweep across the open frontier |
| mtamyway-719e28da | open | SWEEP-PROCESS | File actionable beads for every gap named in an umbrella verdict |
| mtamyway-93fd2f78 | open | SWEEP-PROCESS | 165 of 995 mta-my-way beads are noise, and 17 phase umbrellas closed on the migration timestamp |
| mtamyway-b00f5929 | open | SWEEP-PROCESS | Commit and push the noise-sweep and verdict checkpoint state |
| mtamyway-fb0f741b | open | SWEEP-PROCESS | Audit verdict coverage on every migration-stamped phase umbrella |
| mtamyway-02ad69cb | open | TEST-COVERAGE | Create mock request/response helpers for middleware chain testing |
| mtamyway-06ba9304 | open | TEST-COVERAGE | Add user fixtures, audit log assertions, and base test suite |
| mtamyway-15b4f683 | open | TEST-COVERAGE | Testing: complete test coverage and e2e suite |
| mtamyway-168e8dcf | open | TEST-COVERAGE | Set up integration test infrastructure for middleware testing |
| mtamyway-19f5e2b7 | open | TEST-COVERAGE | Write rate limiting and security headers middleware integration tests |
| mtamyway-2970d148 | open | TEST-COVERAGE | Implement JWT token generation and authentication test helpers |
| mtamyway-32132ab9 | open | TEST-COVERAGE | Implement response status validation helpers |
| mtamyway-4c6efda4 | open | TEST-COVERAGE | Create reusable test configuration helpers |
| mtamyway-59e0fa88 | open | TEST-COVERAGE | Add reusable middleware test configuration helpers |
| mtamyway-5f736ad7 | open | TEST-COVERAGE | Add performance assertions to API health tests |
| mtamyway-5f913fe0 | open | TEST-COVERAGE | Add middleware-scoped setup and teardown helpers |
| mtamyway-61431137 | open | TEST-COVERAGE | Improve unit test coverage to 80% |
| mtamyway-6dddd2cc | open | TEST-COVERAGE | Set up base test utilities and helpers in shared package |
| mtamyway-79964aa5 | open | TEST-COVERAGE | Set up API health test framework |
| mtamyway-8fd8f402 | open | TEST-COVERAGE | Write cross-cutting integration tests for middleware chain |
| mtamyway-9e569dec | open | TEST-COVERAGE | Implement base setup and teardown helper functions |
| mtamyway-9e9955a9 | open | TEST-COVERAGE | Add common test pattern utilities |
| mtamyway-a40f9151 | open | TEST-COVERAGE | Write authentication and authorization middleware integration tests |
| mtamyway-bfa33c5f | open | TEST-COVERAGE | Create public API health test suite |
| mtamyway-c44d0489 | open | TEST-COVERAGE | Add arrivals endpoint health tests |
| mtamyway-dc6c8443 | open | TEST-COVERAGE | Write audit logging middleware integration tests |
| mtamyway-ea01c2d1 | open | TEST-COVERAGE | Add alerts endpoint health tests |
| mtamyway-f2cac498 | open | TEST-COVERAGE | Add reusable endpoint test configuration |
| mtamyway-fc69fdc0 | open | TEST-COVERAGE | Add stations endpoint health tests |
| mtamyway-ff565c21 | open | TEST-COVERAGE | Implement response structure validation helpers |
| mtamyway-5ef5c63a | open | TRACKER-HYGIENE | Report corrections and verify Pluck visibility |
| mtamyway-ac9ad05e | open | TRACKER-HYGIENE | Clear stale assignees and closed-dependency blockers |
| mtamyway-ec9e6de3 | open | TRACKER-HYGIENE | Fix mislabeled or stuck beads blocking Pluck visibility |
| mtamyway-f500153a | open | TRACKER-HYGIENE | Fix incorrectly deferred and blocked bead labels |

Category keys: **NOISE-G** = residual machine-generated artifact (closed by this pass);
**SWEEP-PROCESS** = this umbrella's own split (parent + children 1–5); **TRACKER-HYGIENE** =
Pluck-visibility/assignee repairs (note: their `bf-*` dependency audits predate the bead-rs
migration and no longer resolve — re-derive, don't replay); **CI-DEPLOY**, **APP-BUG**,
**TEST-COVERAGE**, **DOCS**, **FEATURE** = mta-my-way functionality.

Known duplication inside functionality (flagged for a future dedup pass, not closed here):
the middleware-testing helper cluster (mtamyway-168e8dcf, 02ad69cb, 9e569dec, 9e9955a9,
4c6efda4, 59e0fa88, 5f913fe0, 6dddd2cc) overlaps heavily, as do the CI step-monitors
(8654ee92, 9e2b3639) and the integration-test fix beads (2c9a321e, 8a1380e4, 91011884,
ee10b029). Deduplication is a different operation from a noise sweep and was deliberately
not performed under its name.

## 4. The residual closure

**mtamyway-73dbf5ad** — `[Pulse] [test] {"level":"error","message":"Failed to record trip",…}`.
Machine-generated Pulse finding (2026-08-14) quoting a 2026-07-04 log line, `File: (unknown)`.
The stack it captured ends at `Database.prepare` inside `recordTrip`
(packages/server/src/trip-tracking.ts:76 at the time) throwing "The database connection is not
open". Current tree: `recordTrip` guards `!db?.open` and logs + returns null instead — that
crash cannot recur at that site. The live question ("why is the connection closed at all") is
tracked by mtamyway-66dafa45, and the HTTP-layer fail-fast by mtamyway-b21236e4. Category G:
stale and regenerable; the defect itself remains tracked. Closed naming this sweep.

## 5. Method

Evidence: `bead list --json --limit 999999` (the default limit of 100 silently truncates —
per-status counts under that limit were wrong); `.beads/checkpoint/forensic.jsonl` for close
reasons (close reasons appear in neither `bead list` nor `bead show` output and there are no
close events in `.beads/events.jsonl`); the working tree for the already-shipped and
already-guarded claims. Every one of the 80 non-closed beads is mapped exactly once
(coverage-asserted in the generating script).
