# bf-5htiu — Execute `npm run typecheck` and capture output

Child 1 of bf-1ic7x split. Observation only — **no code changes were made**.

## Command

```
npm run typecheck    # → tsc --build
```

- Run at: 2026-07-30, working tree at commit `4714f92` (plus the pre-existing
  uncommitted modifications listed in `git status` at the time: `.beads/issues.jsonl`,
  `.needle-predispatch-sha`, `package-lock.json`, `packages/{server,shared,web}/package.json`,
  `packages/server/src/middleware/cookie-security.ts`,
  `packages/shared/src/observability/tracing.ts`, `packages/shared/tsconfig.json`).
- TypeScript version: **5.9.3**
- **Exit code: 1** (failure)

## Result summary

- **810 errors** across **95 files**, 1085 lines of output total.
- No other build/diagnostic messages were emitted — the only non-error output was the
  npm script banner. `tsc --build` produced no "project is out of date"/skip notices.

Full captured stdout+stderr: [`notes/bf-5htiu-typecheck-output.txt`](./bf-5htiu-typecheck-output.txt)
(`.txt` rather than `.log` because `*.log` is gitignored.)

### Errors by package

| Package | Errors |
| --- | ---: |
| `packages/web` | 484 |
| `packages/server` | 289 |
| `packages/shared` | 37 |

### Errors by TS code

| Code | Count | Meaning |
| --- | ---: | --- |
| TS2322 | 140 | Type X is not assignable to type Y |
| TS6133 | 110 | Declared but its value is never read |
| TS2345 | 97 | Argument type not assignable to parameter type |
| TS2739 | 87 | Type missing properties from another type |
| TS2532 | 74 | Object is possibly 'undefined' |
| TS2741 | 59 | Property missing in type but required |
| TS2304 | 46 | Cannot find name |
| TS18048 | 44 | Value is possibly 'undefined' |
| TS2339 | 41 | Property does not exist on type |
| TS18046 | 34 | Value is of type 'unknown' |
| TS4104 | 16 | readonly array assigned to mutable array type |
| TS2783 | 12 | Property specified more than once (overwritten) |
| TS2683 | 6 | `this` implicitly has type 'any' |
| TS2300 | 6 | Duplicate identifier |
| TS2353 | 5 | Object literal may only specify known properties |
| TS2484 | 4 | Export declaration conflicts with exported declaration |
| TS7006 | 3 | Parameter implicitly has an 'any' type |
| TS6196 | 3 | Declared but never used |
| TS2769 | 3 | No overload matches this call |
| TS2551 | 3 | Property does not exist (did you mean…) |
| TS2352 | 3 | Unsafe conversion between types |
| TS6192 | 2 | All imports in import declaration are unused |
| TS2554 | 2 | Wrong number of arguments |
| TS2488 | 2 | Type must have a `[Symbol.iterator]()` method |
| TS2305 | 2 | Module has no exported member |

(Remaining codes appear once each; see the full log.)

### Worst-offending files (top 20)

| Count | File |
| ---: | --- |
| 43 | `packages/server/src/middleware/rbac.ts` |
| 42 | `packages/web/src/hooks/useContextSort.test.ts` |
| 39 | `packages/web/src/components/health/LineStatusTile.test.tsx` |
| 35 | `packages/web/src/components/favorites/FavoritesList.test.tsx` |
| 35 | `packages/web/src/components/arrivals/ArrivalList.test.tsx` |
| 35 | `packages/web/src/components/alerts/AlertCard.test.tsx` |
| 35 | `packages/server/src/middleware/captcha.ts` |
| 32 | `packages/server/src/middleware/authentication.ts` |
| 28 | `packages/web/src/components/arrivals/ArrivalRow.test.tsx` |
| 24 | `packages/web/src/components/equipment/EquipmentBanner.test.tsx` |
| 24 | `packages/web/src/components/alerts/AlertBanner.test.tsx` |
| 22 | `packages/web/src/components/alerts/ShuttleInfo.test.tsx` |
| 20 | `packages/server/src/middleware/suspicious-activity-notifications.ts` |
| 19 | `packages/web/src/components/health/DataHealth.test.tsx` |
| 17 | `packages/web/src/lib/api.test.ts` |
| 17 | `packages/web/src/hooks/useTripTracker.test.ts` |
| 16 | `packages/web/src/hooks/usePositions.test.ts` |
| 16 | `packages/shared/src/testing/observability-helpers.ts` |
| 15 | `packages/web/src/hooks/useMorningBriefing.test.ts` |
| 14 | `packages/web/src/screens/HomeScreen.test.tsx` |

## Observations for follow-up beads

- The majority of `packages/web` errors are in **test files**, and cluster around test
  fixtures/mocks that are missing newly-required fields (`TS2739`/`TS2741`/`TS2322`,
  e.g. `Favorite.sortOrder`, full `SettingsState`, full store-hook return shapes).
  These look mechanical and batch-fixable per-file.
- `packages/server` errors are dominated by strict-null (`TS2532`/`TS18048`),
  unused declarations (`TS6133`), and a handful of real API/type mismatches
  (e.g. `authentication.ts` calling non-existent `SubtleCrypto.timingSafeEqual`,
  `ApiKey.metadata` not on the type, `csrf-protection.ts` importing a
  `generateCsrfToken` that `authentication.js` does not export,
  `middleware/index.ts` duplicate re-exports, `authorization.ts` export conflicts).
- `packages/shared` is the smallest bucket (37), concentrated in
  `testing/observability-helpers.ts` and `testing/test-helpers.ts`.
