# Ready-frontier and verdict gate report — 2026-09-05

Dispatch `mtamyway-38f4e2a1`, child 4 of the split of `mtamyway-93fd2f78`. This is the
parent's done-when executed as a check, not assumed. Everything below was re-derived
from the live store on **2026-09-05 00:05–00:25 UTC**; nothing is carried forward from
the 2026-09-03/04 passes.

**GATE RESULT: PASS — both halves.** No failure bead is filed, because neither half
failed. Two beads in the frontier carry remediated premises and are called out in
§1.3 so they can be closed on evidence rather than re-derived.

## Method

- **Ready frontier**: `bead list --ready --limit 999999 --json` (30 beads), then every
  bead's full description read individually. Cross-checked by an independent derivation
  straight off the live store (`sqlite3 'file:.beads/beads.db?mode=ro'`): open +
  unassigned + not manually blocked + no blocker outside `closed`. The two methods
  return the identical 30 IDs — no sampling, no truncation (the CLI's default 100-row
  cap is bypassed with an explicit limit).
- **Umbrella verdicts**: child 2's authoritative list is
  `docs/notes/2026-09-04-migration-umbrella-verdict-audit.md` §2 (18 beads). Each of
  the 18 was read live from the store (CLI and DB both) and its `notes` field searched
  for the verdict. The list itself was then re-derived rather than trusted: all 297
  beads carrying the 2026-08-14 migration stamp were enumerated, every one that blocks
  ≥2 others extracted, and the 18 subtracted (§2.2).
- **Live-world evidence for the two stale premises**: recent
  `mta-my-way-build` Argo runs in `iad-ci` (read-only kubectl) and
  `packages/web/src/screens/HomeScreen.tsx` at HEAD.

Store snapshot at check time: **1044 beads** — 955 closed, 87 open, 1 in_progress
(this dispatch), 1 deferred; 9 open beads manually blocked; 48 open+unassigned waiting
on unsatisfied dependencies; **30 ready**.

## 1. Half (a) — the ready frontier names only mta-my-way functionality

**Verdict: PASS. 30/30 classified real functionality, 0 noise, 0 fail.**

Class basis: a bead is *functionality* when its subject is this product or its
delivery — product code, product tests, product test infrastructure, this repo's CI
template, or this product's own deployment/routing. It is *noise* when it belongs to
one of the seven classes the 2026-09-03 sweep closed on (agent-environment probes,
existence micro-verifies, probe reporting artifacts, read-only recon micro-steps,
already-shipped codebase searches, phantom targets, machine starvation alerts).
**None of the 30 is in any noise class.**

### 1.1 The 30, individually

| # | Bead | Pri | Class | Basis |
|---|---|---|---|---|
| 1 | `mtamyway-692a6a56` | p0 | FUNCTIONALITY (stale premise) | CI health for this repo's build template. Premise is stale — see §1.3.1 |
| 2 | `mtamyway-0b817825` | p1 | FUNCTIONALITY | Product milestone: commission the deployed core/stateful split as one end-to-end gate |
| 3 | `mtamyway-2970d148` | p2 | FUNCTIONALITY | Product test infra — JWT/auth test helpers; untracked implementation already in the checkout (§1.4) |
| 4 | `mtamyway-4c6efda4` | p2 | FUNCTIONALITY | Product test infra — reusable test configuration helpers; untracked WIP (§1.4) |
| 5 | `mtamyway-32132ab9` | p2 | FUNCTIONALITY | Product test infra — response status validation helpers; untracked WIP (§1.4) |
| 6 | `mtamyway-7bd2a141` | p2 | FUNCTIONALITY (infra-scoped) | Enumerate this product's public/stateful IngressRoute rules into a table |
| 7 | `mtamyway-d26515d5` | p2 | FUNCTIONALITY (infra-scoped) | Live curl verification of those routes; final child of umbrella `mtamyway-6895e35e`. Topic-overlaps #6 — flagged for the future dedup pass |
| 8 | `mtamyway-93ca8a55` | p2 | FUNCTIONALITY | Split the CI `lint`/`typecheck` steps in the build template; complementary to #1, not a duplicate |
| 9 | `mtamyway-7ed5c96b` | p2 | FUNCTIONALITY (stale premise) | Rules-of-hooks defect in HomeScreen — not present at HEAD (§1.3.2) |
| 10 | `mtamyway-4662b6c7` | p2 | FUNCTIONALITY (infra-scoped) | Fresh dated evidence pass against this product's public entrypoint; a deliverable, not an env probe |
| 11 | `mtamyway-2ac3d9ec` | p2 | FUNCTIONALITY | Render TransferEngine `recommendationDetails` in the web UI |
| 12 | `mtamyway-10f37574` | p2 | FUNCTIONALITY | Wire station-based alert filtering — the one residual Phase 3 code gap |
| 13 | `mtamyway-e6b04735` | p2 | FUNCTIONALITY | Enforce the Lighthouse 95+ criterion (un-orphan `lighthouserc.json`) |
| 14 | `mtamyway-be0b57b0` | p2 | FUNCTIONALITY | Make predicted delays reach TripScreen (endpoints + `useTripTracker`) |
| 15 | `mtamyway-5b3b50ec` | p2 | FUNCTIONALITY | Send `accessibleMode` to `/api/commute/analyze` |
| 16 | `mtamyway-65ebaacf` | p3 | FUNCTIONALITY | Unit tests for OnboardingFlow |
| 17 | `mtamyway-da8ae733` | p3 | FUNCTIONALITY | Unit tests for StationSearch |
| 18 | `mtamyway-0c95d894` | p3 | FUNCTIONALITY | Unit tests for TransitMap/MapScreen |
| 19 | `mtamyway-aff8a0b9` | p3 | FUNCTIONALITY | Multi-transfer route alternatives in TransferEngine |
| 20 | `mtamyway-b8cc6b3c` | p3 | FUNCTIONALITY | Feed TransferEngine from vehicle positions |
| 21 | `mtamyway-cf7b1dfa` | p3 | FUNCTIONALITY | Web unit tests for useCommute/TransferDetail/RouteComparison/CommuteEditor |
| 22 | `mtamyway-c85324d8` | p3 | FUNCTIONALITY | Wire or delete LazyImage + apiCache dead code |
| 23 | `mtamyway-1d4f3a61` | p3 | FUNCTIONALITY | Serve precompressed .gz/.br assets |
| 24 | `mtamyway-c838eeab` | p3 | FUNCTIONALITY | Measure WCAG compliance (axe-core) instead of asserting it |
| 25 | `mtamyway-b9c31091` | p3 | FUNCTIONALITY | Restore ContextIndicator |
| 26 | `mtamyway-7cfe4ad3` | p3 | FUNCTIONALITY | Tests for useContextAware/contextStore |
| 27 | `mtamyway-7e547a37` | p3 | FUNCTIONALITY | Consume server `/api/trips` + `/api/journal` from the frontend |
| 28 | `mtamyway-e761f085` | p3 | FUNCTIONALITY | In-app navigation for HealthScreen and the line diagram |
| 29 | `mtamyway-b5fb50e4` | p3 | FUNCTIONALITY | Ground the OMNY fare-cap estimator in real fare data |
| 30 | `mtamyway-7f3277bb` | p3 | FUNCTIONALITY | Dedicated tests for FreshnessFooter/FreshnessDetail |

#11–#30 are the 20 umbrella-gap filings of child 3 (`mtamyway-719e28da`, label
`umbrella-gaps`); each was checked to name a concrete code-level gap with file
citations and a verifiable scope, which is what makes it functionality rather than
noise.

### 1.2 Composition

21 product code/test beads, 3 product test-infrastructure beads, 3 infra-scoped
deployment/routing beads for this product's own entrypoint, 2 CI-template beads
(#1, #8), 1 product milestone gate. Zero beads name agent environment, tooling
availability, or directory existence.

### 1.3 Two beads carry remediated premises (recorded, not gate-failing)

Both remain mta-my-way functionality — the criterion is that the frontier name only
mta-my-way functionality, and both do. They are recorded here so the next claimant
closes them on evidence instead of re-deriving the work.

1. **`mtamyway-692a6a56` (p0)** — its title ("486 TypeScript errors fail the CI
   `lint` step on every mta-my-way-build run") no longer describes reality. Live
   `mta-my-way-build` runs in `iad-ci` on 2026-09-04 23:53Z → 2026-09-05 00:11Z
   (`qntjn`, `zgj2l`, `48t59`, `98lfn`, `dxq68`) record **`typecheck: Succeeded`** and
   **`lint: Succeeded`** on every run; the step that fails is **`test`**. The bead is
   still the right home for CI-red work, but its premise and title are stale — the
   live defect is the test step, not typecheck. Re-scope or close on this evidence.
2. **`mtamyway-7ed5c96b`** — the named defect (early return before hooks in
   `HomeScreen.tsx`) is not present at HEAD. The file now splits the onboarding case
   into a hook-free `OnboardingScreen` (`HomeScreen.tsx:53`) with the hooks living in
   `HomeDashboard` (`:76`); the file's last commit is `cd9e752`. The untracked
   `packages/web/src/screens/HomeScreen.onboarding.test.tsx` in the shared checkout is
   the in-flight test half of the same fix. Close on the code evidence or re-scope to
   landing that test.

### 1.4 Untracked implementations behind three frontier beads

`packages/shared/src/testing/{jwt-helpers,config-helpers}.ts` (+ tests) and
`packages/shared/src/utils/response-validation.ts` sit untracked in the shared
checkout, matching frontier beads #3/#4/#5. Completeness was not audited for this
gate — a claimant on any of the three should reconcile against the tree before
re-deriving, and must not sweep the files into an unrelated commit.

## 2. Half (b) — every migration-stamped umbrella carries a verdict, not an artifact

**Verdict: PASS. 18/18 beads on child 2's list carry a dated VERDICT note.**

### 2.1 The 18, read live

| Bead | Variant | VERDICT | GAP-MAP | CROSS-REF |
|---|---|---|---|---|
| `mtamyway-ebf9e352` | Genesis | 2026-09-03 | ✓ | n/a (unique) |
| `mtamyway-0c690a01` | Close-genesis | 2026-09-03 | ✓ | n/a (unique) |
| `mtamyway-90fed08c` / `mtamyway-fef94e93` | Phase 1 hyphen / em-dash | 2026-09-03, SUBSTANTIALLY COMPLETE | ✓ / ✓ | ✓ / ✓ |
| `mtamyway-e840fa30` / `mtamyway-acbbe299` | Phase 2 hyphen / em-dash | 2026-09-03, SUBSTANTIALLY COMPLETE | ✓ / ✓ | ✓ / ✓ |
| `mtamyway-928fdc40` / `mtamyway-0ff80be3` | Phase 3 hyphen / em-dash | 2026-09-03 INCOMPLETE, superseded same-day by the STATUS UPDATE to SUBSTANTIALLY COMPLETE at HEAD | ✓ / ✓ | ✓ / ✓ |
| `mtamyway-ac0f50d2` / `mtamyway-7c5078f4` | Phase 4 hyphen / em-dash | 2026-09-03, SUBSTANTIALLY COMPLETE | ✓ / ✓ | ✓ / ✓ |
| `mtamyway-01f9c1d6` / `mtamyway-9fdc754d` | Phase 5 hyphen / em-dash | 2026-09-03, SUBSTANTIALLY COMPLETE | ✓ / ✓ | ✓ / ✓ |
| `mtamyway-86637a5a` / `mtamyway-e3eed85e` | Phase 6 hyphen / em-dash | 2026-09-03, SUBSTANTIALLY COMPLETE | ✓ / ✓ | ✓ / ✓ |
| `mtamyway-b6029855` / `mtamyway-989dcdb1` | Phase 7 hyphen / em-dash | 2026-09-03, COMPLETE | ✓ / ✓ | ✓ / ✓ |
| `mtamyway-3811670f` / `mtamyway-bfb98985` | Cross-cutting hyphen / em-dash | 2026-09-04 (child 2), SUBSTANTIALLY COMPLETE | ✓ / ✓ | ✓ / ✓ |

Count: **18 of 18 on child 2's list carry a verdict (18/18)**; every verdict is dated,
names its verdict level, and cites code paths rather than asserting completion. The
16 duplicate variants cross-reference their twins; the two genesis roll-ups carry
ADDENDUM/UPDATE paragraphs instead, which is correct for unique beads. The Phase 3
INCOMPLETE verdicts are superseded in the same note thread by a dated update, so the
stale level cannot be quoted forward. Gaps named by the verdicts are annotated with
tracking bead IDs (GAP-MAP, child 3) on all 18.

Two further migration-stamped beads carry verdict text but are outside the 18:
`mtamyway-d4dc2b32` (a third Phase 5 variant, VERDICT + GAP-MAP, 2026-09-03/04) and
`mtamyway-16644ce7` (an in-work "- Verdict: ✅ MATCHES" on a test-expectation check,
not an umbrella verdict).

### 2.2 Re-derivation of the list itself

Child 2's list was not trusted — it was re-derived from the live store:

- **297 beads** carry the 2026-08-14 migration stamp (`closed_at` starting 2026-08-14).
- **All 18** of child 2's list are among them (no bead on the list fails to be
  migration-stamped).
- **20** of the 297 carry `VERDICT` in `notes` — the 18, plus the two above.
- Subtracting the 18 from the stamped beads that block ≥2 others leaves **8**:
  `23bd6b77`, `2b854825`, `39c12c34`, `3b80818e`, `4a61f86d` (all five are on child
  2's §8.2 feature-container list), plus **`5df462ac`**, **`c3fc3167`**, and
  **`fc989fa5`**, which child 2's §8 enumeration did not list. Each was read:
  `5df462ac` ("Extract health.e2e.ts test expectations") and `c3fc3167` ("Diagnose
  current webServer startup behavior") are single-file read-and-document recon
  micro-steps, and `fc989fa5` ("Shared types package: all TypeScript interfaces") is
  the real Phase 1 types-package task. **None is an umbrella** — all three are closed
  migration artifacts of ordinary work items whose closure is not load-bearing for
  any phase claim, so none requires a verdict and none affects the frontier.

This is a bookkeeping gap in child 2's §8 completeness list (3 of the 58
non-umbrella ≥2-blockers went unlisted), not a verdict-coverage gap. Recorded here so
the next auditor does not re-open the question.

## 3. Gate lines

```
Half (a) ready frontier:    PASS — 30/30 real mta-my-way functionality, 0 noise, 0 fail
Half (b) umbrella verdicts: PASS — 18/18 carry a dated VERDICT note (list length 18)
Failure bead:               none filed — neither half failed
```

## 4. Build/test state at check time (context, not a gate half)

CI is authoritative here: the shared checkout carries concurrent workers' uncommitted
and untracked WIP, so a local `npm test`/`npm run typecheck` would measure the tree,
not HEAD. Live `mta-my-way-build` runs on this HEAD (2026-09-04 23:53Z → 2026-09-05
00:11Z) record `lint: Succeeded`, `typecheck: Succeeded`, `test: Failed` — the known
pre-existing red test set (95 failures classified in
`docs/ci-reports/test-step-monitor-2026-09-04.md`), not a regression from this sweep.
Locally, `npx eslint .` exits 0 repo-wide; `npx biome check .` reports exactly one
error, the **gitignored** live `packages/server/data/vapid-keys.json` (formatting a
private-key file) — a known artifact of this checkout, never to be reformatted or
committed to make lint green.
