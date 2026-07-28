# npm audit fix Failed - 2026-07-28

## Task
Attempt non-breaking npm audit fix for child bf-3vcka (depends on baseline bf-3tl94).

## Baseline (from docs/notes/npm-audit-baseline-2026-07-26.md)
- **Critical: 2**
- **High: 22**
- **Total: 41**

## npm audit fix Attempt (non-breaking)

### Command
```bash
npm audit fix
```

### Result
**FAILED** - ERESOLVE dependency conflict

```
npm error ERESOLVE unable to resolve dependency tree

While resolving: @mta-my-way/server@0.0.1
Found: protobufjs@7.6.5
  protobufjs@"^7.5.4" from @mta-my-way/server@0.0.1

Could not resolve dependency:
  peer protobufjs@"^8.7.1" from protobufjs-cli@2.6.1
    dev protobufjs-cli@"^2.0.0" from @mta-my-way/server@0.0.1

Fix the upstream dependency conflict, or retry
this command with --force or --legacy-peer-deps
```

### After State (unchanged)
- **Critical: 2**
- **High: 22**
- **Total: 41**

## Resolved Advisories
**None** - npm audit fix failed to apply any changes due to dependency conflict.

## Remaining Vulnerabilities
All 41 vulnerabilities remain unfixed:
- **Critical (2):**
  - vitest <3.2.6: Arbitrary file read/execution via Vitest UI server (GHSA-5xrq-8626-4rwp)
  - Follow-up critical in @vitest/coverage-v8

- **High (22):**
  - @babel/plugin-transform-modules-systemjs (GHSA-fv7c-fp4j-7gwp)
  - @grpc/grpc-js (GHSA-5375-pq7m-f5r2, GHSA-99f4-grh7-6pcq)
  - serialize-javascript (GHSA-5c6j-r48x-rmvq, GHSA-qj8w-gfj5-8c6v)
  - tmp (GHSA-ph9p-34f9-6g65)
  - undici (7 high-severity advisories)
  - vite (4 high-severity advisories)
  - ws (2 high-severity advisories)
  - react-router (13 high-severity advisories including XSS, DoS, CSRF, open redirect)

## Root Cause
The existing dependency conflict between `protobufjs@7.6.5` and `protobufjs-cli@2.6.1` (which requires `protobufjs@^8.7.1`) prevents npm from applying any safe fixes.

## Next Steps
A sibling bead will document the breaking changes required via `npm audit fix --force` for future reference, including the protobufjs peer dependency resolution.
