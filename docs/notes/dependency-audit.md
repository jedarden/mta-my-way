# Dependency vulnerability triage

Owning bead: `mtamyway-e4815278`. Re-check procedure at the bottom; the
machine-readable accepted-findings baseline is
[`docs/security/audit-baseline.json`](../security/audit-baseline.json), enforced
by `npm run audit:check`.

## 2026-10-24 triage

`docs/ci-lint-logs.txt` and `docs/ci-logs/lint-oom-2026-07-03.md` recorded
**41 vulnerabilities (1 low, 21 moderate, 17 high, 2 critical)** from
`npm audit` during `npm ci` on 2026-07-03/04. The live inventory on
2026-10-24 (before this triage) was **70 (3 low, 25 moderate, 39 high,
3 critical)** across 70 distinct packages — the counts had grown ~70% in the
~3.5 months with no owner.

### Remediated (70 → 36 findings)

Every fix below was verified by `npm run typecheck` (the only errors after the
bumps were in another worker's untracked WIP test file, out of scope), the
password-reset suites (86/86 against nodemailer 10), the parser suites (32/32
against protobufjs 7.6.6), and a direct smoke of the csv-parse v7 sync API.

| Change | Findings closed | Notes |
|---|---|---|
| Within-range lockfile bumps (zod, hono, react-router(-dom), @grpc/grpc-js, undici, protobufjs, express/proxy-addr/body-parser, nanoid, ws, postcss, picomatch, brace-expansion, fast-uri, js-yaml, lodash, markdown-it, linkify-it, browserslist, source-map-js, serialize-javascript, @babel/core, @babel/plugin-transform-modules-systemjs, vite, @humanfs/node, @opentelemetry/propagator-b3, @rollup/plugin-terser, workbox-build) | 26 | lockfile-only, no API changes; the flagged express/proxy-addr/nanoid/ws tree sits under @lhci/cli, happy-dom and vite, i.e. dev tooling, but the in-range bumps are free so they were applied anyway |
| `zod ^4.3.6 → ^4.6.7` (server + shared) | 1 | GHSA-mrhx-c7xc-m3w5 memory exhaustion; floor raised to the fixed version |
| `@hono/node-server 1.19.11 → 1.19.17` (exact pin preserved) | 1 | serveStatic path traversal/bypass (GHSA-92pp-h63x-v22m, GHSA-frvp-7c67-39w9) |
| `nodemailer ^8.0.7 → ^10.2.1`; dropped `@types/nodemailer` (v10 ships its own `nodemailer.d.ts`; `@types` stops at 8.x) | 1 (15 advisories) | CRLF injection, SSRF/file-read bypasses, IDN allow-list bypass, TLS-validation issues; only consumer is `password-reset.service.ts` (`createTransport`/`sendMail` are unchanged across 8→10); 86/86 password-reset tests pass |
| `csv-parse ^6.2.1 → ^7.0.3` | 1 | prototype replacement via columns path; only consumer is the offline `packages/server/scripts/process-gtfs.mjs`; sync API unchanged |

### Accepted with rationale (36 remaining, baselined)

| Cluster | Count | Why accepted now |
|---|---|---|
| `lhci` (@lhci/cli, lighthouse, puppeteer-core, basic-ftp, tmp, uuid, inquirer, …) | 16 | `@lhci/cli` is a root devDependency used only for Lighthouse CI runs; nothing ships from it. npm's suggested "fix" for most of these is a *downgrade* to `@lhci/cli@0.1.0` (a 2019 version), which is not a remediation. Re-evaluate on a real `@lhci/cli` release that moves off puppeteer 24/basic-ftp. |
| `otel` (@opentelemetry/* server telemetry) | 14 | Runtime deps, but every fix sits behind the OpenTelemetry JS major migration: exporters 0.57 → 0.300.x, sdk-trace 1.29 → 2.x, resources → 3.x. Severity is mostly moderate (worst: propagator-jaeger malformed-header DoS). This is the **top follow-up** — see below. |
| `vitest` (vitest, tinypool, @vitest/coverage-v8, @vitest/mocker) | 4 | Dev test-runner. The criticals (tinypool prototype-pollution RCE, mocker path traversal) require executing an attacker-crafted vitest config; tests here only run first-party specs. Fix is the vitest 4 → 5 major migration. |
| `devtest` (happy-dom, protobufjs-cli) | 2 | happy-dom is the vitest DOM environment (its code-execution advisory needs attacker-controlled page scripts inside a test). protobufjs-cli is manual codegen over the repo's own checked-in `.proto` files (the advisories need attacker-crafted schema names); every fixing version demands a `protobufjs@^8` peer. Runtime protobufjs stays on ^7.6.6 (clean since 7.6.5), so accepting the cli advisory keeps the protobufjs 8 migration out of the runtime tree. |

### Follow-ups (proposals, not yet admitted work)

1. **OpenTelemetry JS major migration** (clears 14 findings incl. the jaeger
   propagator DoS): exporters 0.57 → 0.300.x, sdk-trace-node/resources/instrumentation
   to the 2.x/3.x line. Largest single win left on the board.
2. **vitest 5 migration** (clears 4 findings incl. both criticals): test-runner
   only, can be scheduled any time the full suite has a green baseline.
3. **protobufjs 8 + regenerated proto code** (clears protobufjs-cli): regenerate
   `src/proto/compiled.js` with pbjs 2.7.x and bump runtime protobufjs to ^8 in
   one change; needs a feed-pollution smoke against live GTFS-RT data.

## Re-check procedure (monthly, and after any dependency change)

```bash
npm run audit:check        # exits 1 on any finding outside the accepted baseline
```

- **New finding appears** → triage it here (remediate or add a justified
  baseline entry), then regenerate the baseline with
  `node scripts/audit-snapshot.mjs --update`, fill in the `cluster`/`reason`
  fields, and commit both together with the dependency change.
- **This replaces treating the CI `npm ci` output as the record**: the counts in
  CI logs are ephemeral and had already drifted 41 → 70 before anyone looked.
  The baseline file is the durable record of what was counted, what was fixed,
  and what is deliberately accepted.
- Cadence: run at least monthly (first Monday) and always before adding a new
  runtime dependency.
