# mta-my-way-build test step — monitor pass, 2026-09-04

Bead: `mtamyway-8654ee92`. Argo workflow:
[`mta-my-way-test-only-grxzw`](https://argo-ci.ardenone.com/workflows/argo-workflows/mta-my-way-test-only-grxzw)
(`workflowTemplateRef: mta-my-way-build`, `entrypoint: test`), submitted 17:34 UTC.

## Verdict

The test step **runs to completion inside its 600s deadline and does not time
out** — but it **does not pass**: 95 tests fail across 23 suites.

| Metric | Value |
|---|---|
| Test files | **23 failed** / 230 passed / 1 skipped (254) |
| Tests | **95 failed** / 6397 passed / 18 skipped (6510) |
| vitest duration | **489.20s** (transform 34.8s, setup 56.2s, import 117.0s, tests 1548.3s, environment 131.7s) |
| Main container wall time | **556.5s of the 600s deadline** (17:35:45 → 17:45:01 UTC) |
| Container exit | `exit status 1` — vitest's own "tests failed" code, **not** a deadline kill |

Argo's executor logged `msg="sub-process exited" error="exit status 1"`; no
deadline wording appears anywhere in the run. The workflow *node* shows 656s,
but that includes pod scheduling and the init/wait containers — the main
container itself started at 17:35:45 and finished at 17:45:01, leaving ~44s of
deadline headroom.

Comparison with the 2026-09-04 clean-room baseline (128 failures / 82 failing
suites / 4725 passing): the `@mta-my-way/shared` dist build added to the test
step eliminated the entire module-load failure class (68 suites), and the suite
has since grown from 4871 to 6510 tests. **The 600s timeout was never the
problem and is not the problem now.**

## The build workflow still does not reach this step

Run `mta-my-way-build-gmpwz` (16:52 UTC), which is the full pipeline against the
same commit:

| Step | Result |
|---|---|
| resolve-version | Succeeded |
| lint | Succeeded (3m37s) |
| typecheck | **Failed, exit 2** (3m11s) |
| test | **never reached** |

So the acceptance criterion "workflow reaches the test step" is met only via the
standalone `entrypoint: test` override, not by the build pipeline. Typecheck
remains the gate — tracked in bead `mtamyway-692a6a56` (P0, open).

## What the 95 failures are

Classification of all 23 failing suites. Classes overlap where one suite
carries both a timeout and an assertion failure.

### A. Known-red auth/security suites — 12 suites, 58 failing tests

Exactly the set documented as red since commit `e05c4a0` dropped the security
half of the startup wiring (`setSecurityDb`, `initApiKeyRegistryFromDb`,
`loadRateLimitDataFromDb`, `initPasswordManagementFromDb`,
`initNotificationsFromDb`, `startSessionCleanup`, `runMigrations`):

`integration/{csrf-state-changing-operations, audit-log-security-middleware-coverage,
csrf-cross-component, auth-authorization-flow, audit-log-middleware-security-events,
middleware-chain-e2e, audit-log-comprehensive-security-coverage}`,
`middleware/{security-middleware-integration, auth-authorization.integration,
enhanced-jwt-security}`, `public-api-health`,
`test/fixtures/middleware-fixtures-demo`.

Signatures: `expected 200 to be 403` (×11), `expected 404 to be 200` (×6),
`expected 400 to be 401` (×3), `Expected 5 rows in 'security_api_key_registry',
but found 0`, `expected undefined to be 'integration_user'`.

Not regressions. No bead covered the re-wiring as of this pass; per the
known-red note, re-wire under the same lazy-init `!CORE_ONLY` gate the push
wiring uses.

`audit-log-comprehensive-security-coverage` additionally fails at module load:
`Cannot find module './request-id.js' imported from
/src/packages/server/src/integration/audit-log-comprehensive-security-coverage.test.ts`
— the module lives at `packages/server/src/middleware/request-id.ts`. The import
at that file's line 60 is simply wrong, independent of the wiring problem.

### B. Per-test 5s timeouts under CI CPU limits — 7 suites, 12 failing tests

`Error: Test timed out in 5000ms` in: `integration/cache-coherency`,
`integration/concurrency`, `integration/data-flow`,
`middleware/auth-authorization.integration`, `middleware/password-management`
(timing-safe comparison), `security/cross-cutting` (SSRF), plus one more block
inside the known-red set.

These are wall-clock-sensitive tests measured against a 1000m CPU request /
3500m limit shared with sibling pods. They are not assertion failures — raise
`testTimeout` for them or move them out of the shared-CI path.

### C. CI-environment artifacts — 2 suites

Not code defects; the test container is `node:22-slim` cloning into `/src`:

- `tests/shell-binary.test.ts:47` — `execSync("sh --version")` expects
  `GNU bash` / `Free Software Foundation`, but Debian's `/bin/sh` is **dash**:
  `sh: 0: Illegal option --`. The test only passes where `/bin/sh` is bash.
- `packages/server/src/shell-execution.test.ts` — `expected '/src\n' to contain
  '/mta-my-way'`: the test asserts the repository checkout path, which is
  `/src` in CI and `…/mta-my-way` on a developer box.

### D. Genuine small defect — 1 suite

`packages/server/src/middleware/validation.test.ts:25` —
`ReferenceError: afterEach is not defined`. The file uses `afterEach` without
importing it from `vitest`. Fails the whole file at load (2 tests). Cheapest
single fix on this list.

### E. Other — 4 suites

- `packages/web/src/lib/prefetch.test.ts:93` — `expected "vi.fn()" to be called
  at least once` on `mockCacheInstance.put` after `prefetchStation`.
- `packages/server/src/security-startup.test.ts` — `expected [ Array(1) ] to
  have a length of +0` from `validateSecurityConfiguration`.
- `packages/server/src/services/password-reset.service.test.ts` — SES provider
  branch, `expected false to be true`.
- `integration/cache-coherency` and `integration/data-flow` also carry
  non-timeout assertion failures alongside their class-B timeouts.

## Bottom line

The test step is reachable and comfortably inside its 600s budget: 556.5s wall
against 489.2s of vitest, with vitest exiting 1 on genuine failures rather than
being killed. Passing this step requires the security-startup re-wiring
(A), the `validation.test.ts` import (D), and a decision on the
CI-environment-assertions in (C); (B) needs either a `testTimeout` bump or
lighter tests. Typecheck must also go green for the build pipeline to reach the
step at all (`mtamyway-692a6a56`).

Raw evidence: condensed setup + all 97 failure detail blocks retained at
`/tmp/mta-test-monitor/test-step-evidence-2026-09-04.log` (transient); the
workflow itself persists in Argo for 2h (TTL 7200s).

## Addendum — re-check ~18:25 UTC, same day

Re-verified against the live cluster rather than the notes above; **nothing
changed**:

- `mta-my-way-test-only-grxzw` is still queryable inside its TTL and its Pod
  node reads exactly as reported — phase `Failed`, message `main: Error
  (exit code 1)`, 656.0s node wall (main container ~556.5s of the 600s
  deadline).
- Two further full build runs, `mta-my-way-build-d9kcs` (18:17:10Z) and
  `mta-my-way-build-7xfrz` (18:17:25Z), both ended `typecheck` → **Failed,
  exit 2** at 18:20:53Z with `lint` Succeeded, so the pipeline **still never
  reaches the test step** ~90 minutes after `gmpwz`. `mtamyway-692a6a56`
  remains the gate.
- No test-fixing commit landed in between; the only advance on `main` is the
  CI version auto-bump `0.0.368`.

The classification above therefore still stands as the current state of the
suite, and every failure class is owned by an existing open bead rather than
by this monitoring task.
