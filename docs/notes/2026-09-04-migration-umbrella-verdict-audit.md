# Migration-stamped umbrella verdict audit — 2026-09-04

Dispatch `mtamyway-fb0f741b`, child 2 of the split of `mtamyway-93fd2f78`
(child 1 = `mtamyway-5b77a98f`).

The parent bead claimed **18 phase/umbrella beads closed, 17 of them stamped
`closed_at` 2026-08-14** — the bf→bead-rs migration timestamp, not a completion
date — and recorded that a 2026-09-03 pass had already written VERDICT notes on
16 phase-shaped beads, leaving a 16-vs-18 discrepancy unreconciled.

This audit enumerates every bead carrying the 2026-08-14 stamp, identifies which
of them are umbrellas, reconciles the counts, and closes the verdict gap.

---

## 1. Method

- **Closure timestamp** is not exposed by `bead list`. It lives in the durable
  checkpoint journal (`.beads/checkpoint/forensic.jsonl`, latest record per
  issue wins) and in the live store (`beads.db`, read as
  `sqlite3 'file:.beads/beads.db?mode=ro'`). Both sources agree on all 18.
- **297 beads** carry `closed_at` starting `2026-08-14`. Almost all are ordinary
  work items that happened to be closed by the migration; being stamped is not
  by itself evidence of being an umbrella.
- **Umbrella identification** used three independent signals, since filtering on
  a `Phase N` title pattern is exactly the mistake that lost the two
  Cross-Cutting beads:
  1. **Dependency fan-out from the genesis.** `mtamyway-ebf9e352` blocks
     exactly 9 beads. Nine is the top of the umbrella graph.
  2. **Title shape.** `Phase N`, `Genesis`, `Cross-Cutting`.
  3. **Plan-shaped description** (`## Goal` / `## Key Decisions` /
     `## Acceptance Criteria` referencing the plan) plus `feature` issue type.

## 2. The reconciliation

**All 18 umbrellas carry the 2026-08-14 migration stamp — not 17.** The
parent's "17 of them" was an undercount, not an overcount.

The 16-vs-18 gap resolves to exactly two beads, and both are the ones a
title-shaped search cannot find:

| # | Bead | Variant | Type | Verdict |
|---|---|---|---|---|
| 1 | `mtamyway-ebf9e352` | Genesis | genesis | verdicted 2026-09-03 |
| 2 | `mtamyway-0c690a01` | Close-genesis | chore | verdicted 2026-09-03 |
| 3–4 | `mtamyway-90fed08c` / `mtamyway-fef94e93` | Phase 1 hyphen / em-dash | task / feature | verdicted 2026-09-03 |
| 5–6 | `mtamyway-e840fa30` / `mtamyway-acbbe299` | Phase 2 hyphen / em-dash | task / feature | verdicted 2026-09-03 |
| 7–8 | `mtamyway-928fdc40` / `mtamyway-0ff80be3` | Phase 3 hyphen / em-dash | task / feature | verdicted 2026-09-03 (INCOMPLETE) |
| 9–10 | `mtamyway-ac0f50d2` / `mtamyway-7c5078f4` | Phase 4 hyphen / em-dash | task / feature | verdicted 2026-09-03 |
| 11–12 | `mtamyway-01f9c1d6` / `mtamyway-9fdc754d` | Phase 5 hyphen / em-dash | task / feature | verdicted 2026-09-03 |
| 13–14 | `mtamyway-86637a5a` / `mtamyway-e3eed85e` | Phase 6 hyphen / em-dash | task / feature | verdicted 2026-09-03 |
| 15–16 | `mtamyway-b6029855` / `mtamyway-989dcdb1` | Phase 7 hyphen / em-dash | task / feature | verdicted 2026-09-03 (COMPLETE) |
| 17 | **`mtamyway-3811670f`** | **Cross-cutting hyphen** | task | **verdicted 2026-09-04, this audit** |
| 18 | **`mtamyway-bfb98985`** | **Cross-Cutting em-dash** | feature | **verdicted 2026-09-04, this audit** |

The plan text was duplicated into two parallel bead sets (7 hyphen-typed
`task`s that hang off the genesis dependency graph, and 7 em-dash-typed
`feature`s that duplicate the same plan prose), and the same duplication
produced **two** Cross-Cutting umbrellas. The 2026-09-03 pass enumerated by
`Phase N` title and so found 16; the two Cross-Cutting beads have no phase
number in their titles and were missed.

Verdict tally after this audit, over all 18:
COMPLETE ×2 (Phase 7 pair), SUBSTANTIALLY COMPLETE ×12 (Phases 1, 2, 4, 5, 6
pairs + Cross-Cutting pair), INCOMPLETE ×2 (Phase 3 pair), plus the two
genesis roll-ups. The two genesis beads are unique, not a duplicate pair, so
they correctly carry no `CROSS-REF`.

## 3. Verdicts written by this audit

Both were verified criteria-by-criteria against the code on 2026-09-04 and the
note written to each bead. Summary here; full citations in the bead notes.

### `mtamyway-bfb98985` — Cross-Cutting: Testing, Security, Migration, Observability — **SUBSTANTIALLY COMPLETE**

The detailed twin; carries the authoritative verification for both. Its eight
acceptance criteria all resolve to real code:

1. **Feed snapshot fixtures, 8 feeds + alerts** — `packages/shared/src/constants/feeds.ts:45`
   defines exactly 8 `SUBWAY_FEEDS`; `packages/server/src/test/fixtures/feeds/`
   holds `synthetic-gtfs{,-ace,-bdfm,-g,-jz,-l,-nqrw,-si}.bin` plus
   `synthetic-alerts.bin` and 6 `edge-*.bin`.
2. **Unit / integration / E2E layers in CI** — colocated unit tests,
   `packages/server/src/integration/`, `tests/e2e/*.e2e.ts`, run by the
   `mta-my-way-ci` / `mta-my-way-build` Argo WorkflowTemplates. Qualified: see §5.
3. **Rate limiting, both layers** — application layer live at
   `packages/server/src/app.ts:617` (`/api/*`) and `:620` (`/auth/*`) via
   `middleware/rate-limiter.ts` + `auth-rate-limit.ts`. The Cloudflare WAF half
   is outside this repo and not verifiable from here.
4. **CSP on all HTML responses** — `middleware/security-headers.ts` wired at
   `app.ts:437`; asserted in `security-headers.test.ts` and `app.test.ts:948`.
5. **Zod on all API endpoints** — `middleware/validation.ts`, wired globally at
   `app.ts:495` and per-route (`app.ts:1112, 1361, 1396, 1421, 1474, 1501`).
6. **Zustand versioned persist with backup migration** —
   `packages/web/src/stores/migration.ts` (`createSafeMigration`, `backupState`,
   `restoreFromBackup`, `clearBackup`), with `version: STORE_VERSION` + `migrate:`
   on six stores.
7. **`/api/health` per-feed observability** — `app.ts:1110` returns per-feed
   status, circuit state, timestamps, plus alerts, push-db readiness, memory,
   cache hit-rate.
8. **Structured JSON logging on every feed poll** —
   `observability/logger.ts:156` `JSON.stringify` per entry; `poller.ts` imports
   the logger at `:36` and logs poll complete / retry / circuit-open / fetch
   success / fetch failure.

"Substantially" rather than "completely" for two reasons: the Cloudflare WAF
layer cannot be confirmed from inside the repo, and the CI claim is qualified by
the known-red auth/security suites (§5).

### `mtamyway-3811670f` — Cross-cutting: Testing, security, data migration, observability — **SUBSTANTIALLY COMPLETE, by roll-up**

The hyphen twin and a pure rollup: its own close reason already records that
every constituent sub-task beneath it was closed before the migration, and that
the bead itself had been stuck in a 2 681-failure retry loop from a dead
`ANTHROPIC_BASE_URL` (fixed 2026-07-02) — an agent-infrastructure failure, not
unfinished work. Its scope is identical to the twin's, so the twin's note is
authoritative for both. The one term only this title names, **data migration**,
is covered by `packages/server/src/migration/` (`seeding.ts`,
`sql-validator.ts`) and `packages/web/src/stores/migration.ts`.

## 4. Cross-referencing added

Before this audit **no** duplicate pair referenced its twin — each of the 14
phase notes was written as if the other did not exist, and 13 of the 7 pairs
were byte-identical. A dated `CROSS-REF` line now appears on all 16 duplicate
beads (14 phase + 2 Cross-Cutting) naming its twin and stating that the
existing VERDICT applies to both. Anyone landing on either variant now sees
that the phase was already verified and does not repeat the work.

## 5. Qualification on the "passing in CI" criterion

Twelve server-side auth/security integration test files fail at HEAD
(2026-09-04, ~75 tests) because commit `e05c4a0` (lazy SQLite init) also dropped
the *security* half of the startup wiring from
`packages/server/src/index.ts` — `setSecurityDb`, `initApiKeyRegistryFromDb`,
`loadRateLimitDataFromDb`, `initPasswordManagementFromDb`,
`initNotificationsFromDb`, `startSessionCleanup`, `runMigrations`. This is a
pre-existing regression, recorded here so the Cross-Cutting verdict's CI claim
is read correctly: the layers exist and are wired into CI, but a subset is red
at the time of writing. It is not a gap in the phase's structure and predates
this audit.

## 6. Material finding outside the 18: the ninth child is still open

Enumerating from the genesis rather than from titles surfaced something the
parent's count could not show. `mtamyway-ebf9e352` blocks **nine** beads, not
eight. The ninth is:

> **`mtamyway-15d23707` — "Deploy to apexalgo-iad and verify production health" — still OPEN, P1.**

It is *not* migration-stamped (it was never closed at all), which is why it
appears in neither the parent's 18 nor the 2026-09-03 pass. But it is
structurally an umbrella child of the genesis and its scope is "the final step
to close out the genesis bead". So the genesis VERDICT's roll-up is incomplete
in a second way: it adjudicated the seven phases and Cross-Cutting while
passing over the deployment child.

The open bead is not stale. Live check against
`apexalgo-iad` on 2026-09-04:

```
mta-my-way-core-6bd9f88b54-4wgms      0/1  CrashLoopBackOff  45 restarts
mta-my-way-core-7fbcbdb69c-m5rfk      0/1  ImagePullBackOff
mta-my-way-core-9b48f8bdc-dmcqk       0/1  CrashLoopBackOff  100 restarts
mta-my-way-stateful-5fb9bfb7dc-vxt9n  0/1  ImagePullBackOff
```

Deployments: retired monolith `mta-my-way` still present and pinned to
`0.0.82` (the tag the 2026-08-21 triage already established was never pushed);
`mta-my-way-core` / `mta-my-way-stateful` pinned to `0.0.289`. The core
container exits 1 roughly one second after start.

This audit does not fix the deployment — that belongs to `mtamyway-15d23707`
and to whoever picks up the §5 startup-wiring regression. It is recorded here
because a verdict-coverage audit that reported "all 18 umbrellas adjudicated"
while production is down would be repeating the exact mistake the parent bead
was filed to correct: treating a tidy roll-up as evidence.
