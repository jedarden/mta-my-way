# WCAG audit baseline (axe-core, all routed screens)

Measured record for Phase 4's "accessibility is broadly implemented but WCAG
compliance is asserted and never measured" gap (bead `mtamyway-c838eeab`). The
Lighthouse accessibility **score** (`docs/notes/lighthouse-acceptance-baseline.md`,
98/100 on `/`) is a single-URL summary, not a violation list. This is the
violation list, per route, reproducible.

## How to run

```bash
# 1. Build the web app — the server serves packages/web/dist
(cd packages/web && npx vite build)        # or: npm run build --workspace @mta-my-way/web

# 2. Start the API server, which also serves the SPA
TEST_MODE=true npx tsx packages/server/src/index.ts &

# 3. Measure (from tests/e2e/)
cd tests/e2e
CHROME_PATH=/nix/store/53p8msmqxpi829zdrw6qkvaamidxy9cj-chromium-151.0.7922.173/bin/chromium \
  npx playwright test wcag-audit.e2e.ts --project="Mobile Chrome"
```

The report lands in `tests/e2e/test-results/wcag-audit.json` (override with
`WCAG_AUDIT_OUT`). `CHROME_PATH` is required on this host: Playwright's own
Chromium download cannot launch here (`libglib-2.0.so.0` is not on its library
path), the same constraint `npm run lighthouse` documents, and now handled by
`tests/e2e/playwright.config.ts` via `use.launchOptions.executablePath`.

Add `WCAG_AUDIT_ENFORCE=1` to fail the run on any violation. It is off by
default while the recorded violations are unfixed; flipping it turns the audit
into the gate.

## What is measured

Every route `App.tsx` registers, in light **and** dark (`globals.css` gates dark
styles behind `prefers-color-scheme`, so emulation is the only way to reach
them), with axe-core 4.13.0's WCAG 2/2.1/2.2 A+AA tagged rules, on Mobile Chrome
(Pixel 5), at 2026-09-05, commit `a5fc516`.

State under audit: anonymous visitor, onboarding completed (the first-run tour
is audited separately), server static GTFS data + real alerts, **no live train
feeds** (the MTA feeds return 403 from this host), no saved commutes, no auth.
That is the state a first-time visitor with a degraded feed sees.

`/health` and `/stats` are audited via client-side navigation because a deep
link to each is shadowed before the SPA can render (findings 2 and 3 below).

## Recorded result

**4 violations · 39 nodes · across 32 route/scheme runs.** Machine-readable
record: `docs/notes/wcag-audit-2026-09-05.json`.

| Rule | WCAG | Impact | Where (scheme) | Nodes | Element |
| --- | --- | --- | --- | --- | --- |
| `nested-interactive` | 2.1.1, 4.1.2 | serious | Map (light + dark) | 1 + 1 | `svg.touch-none[role="img"]` — the transit-map SVG carries `role="img"` while its station buttons are focusable descendants. Interactive controls must not be nested. |
| `color-contrast` | 1.4.3 | serious | Health (light) | 36 | see breakdown |
| `color-contrast` | 1.4.3 | serious | Health (dark) | 1 | see breakdown |

Health contrast breakdown, by distinct failure:

| Foreground | Background | Ratio | Nodes | Element |
| --- | --- | --- | --- | --- |
| `#d08700` (`text-yellow-600`) | `#ffffff` | 2.93 : 1 | 27 | "Minor" severity label — `LineStatusTile.tsx:76`, `HealthSummary.tsx:16` |
| `#fb2c36` (`text-red-500`) | `#ffffff` | 3.80 : 1 | 8 | "Never polled" — `DataHealth.tsx:60` |
| `#e7000b` (`text-red-600`) | `#fb2c36` (red bar) | **1.25 : 1** | 1 (light) | service-level percentage overlay — `HealthSummary.tsx` |
| `#ff6467` (`text-red-400`) | `#fb2c36` (red bar) | **1.31 : 1** | 1 (dark) | same overlay in dark scheme |

Everything else is clean: the other 13 routes, both schemes, including the
first-run onboarding flow, produced zero violations. The Phase 4 shell work
(skip link, landmarks, live regions, labelled icon buttons) held up under
measurement.

### Rules axe could not decide

14 runs reported `color-contrast` results axe could not verify (background
image/gradient or overlapping elements it cannot resolve) — recorded per route
in the JSON as `incompleteRuleIds`. These need human review and are **not**
counted as violations.

## Findings outside axe's rule set

The harness surfaced three structural problems that no axe rule catches:

1. **`MapScreen` and `StatsScreen` bypass the `Screen` shell.**
   `MapScreen.tsx:310` and `StatsScreen.tsx:595` render their own `<main>`
   without `id="main-content"`, so the skip link in `Screen.tsx` has no target
   on those screens and the shell's route-change focus management never fires
   there. (Found because the audit's mount wait had to accept a bare `<main>`
   to proceed.)
2. **`/stats` deep link renders the bundle visualizer.** After the service
   worker registers, a visit to `/stats` shows rollup-plugin-visualizer's
   `stats.html` ("Rollup Visualizer" treemap) instead of the app: the
   visualizer output lands in `dist/`, `workbox.globPatterns` precaches every
   `**/*.html`, and the precached artifact shadows the SPA route. Verified: a
   fresh visit renders "Your Subway Year"; a visit after `sw.js` is in control
   renders the treemap.
3. **`/health` deep link returns API JSON.** The server registers `/health` as
   its readiness endpoint, so the SPA's Health screen is unreachable by URL —
   it only renders after an in-app navigation.

## Fix beads

Filed from this measurement:

| Bead | Fix | Status |
| --- | --- | --- |
| `mtamyway-652eba9a` | Map: stop nesting interactive station buttons inside `role="img"` | closed — landed as `c8ad403` |
| `mtamyway-1f9a93a3` | Health: raise status-text and percentage-overlay contrast to 4.5:1 | open — fix in the working tree, see [`wcag-contrast-fix-2026-09-05.md`](wcag-contrast-fix-2026-09-05.md) |
| `mtamyway-73fe299f` | Map/Stats: use the `Screen` shell so the skip link and focus management apply | open — fix in the working tree |
| `mtamyway-0a2dc600` | Build: keep the visualizer artifact out of `dist/` and the precache | closed — landed as `318ca7b` |
| `mtamyway-3117ec7a` | Routing: separate the SPA `/health` route from the API readiness endpoint | open — `/healthz` probe in the working tree |
| `mtamyway-f7b528cd` | Flip `WCAG_AUDIT_ENFORCE=1` once the violations are fixed; promote `axe-core` to a direct devDependency | open |

## Re-verification

**2026-09-06T02:10Z, tree at `c937b9b` + uncommitted fixes:** 0 violations,
0 nodes, 32 route/scheme runs, 15 runs reporting `color-contrast` as
*incomplete*, `/health` 26 passes per scheme — exit 0, 1.2 min. The run
reproduces [`wcag-contrast-fix-2026-09-05.md`](wcag-contrast-fix-2026-09-05.md)'s
16:50Z re-measurement point for point.

Read that 0 honestly: the working tree carried uncommitted fixes for
`mtamyway-1f9a93a3` (contrast), `mtamyway-73fe299f` (Screen shell) and
`mtamyway-3117ec7a` (`/healthz`) when it was taken. At the committed `c937b9b`
the Health `color-contrast` findings above are expected to reproduce (the map
`nested-interactive` is already fixed at that commit by `c8ad403`); that
expectation is derived from which fixes are present, not separately measured.
Re-run the commands above against a clean checkout to confirm.

## Limits of this measurement

- axe-core automates roughly a third of WCAG success criteria. A clean run is
  not conformance: keyboard traps, focus order quality, screen-reader
  semantics, and cognitive criteria still need manual review.
- One browser (Mobile Chrome), one viewport, one auth state, one data state.
  Screens' data-heavy states (live arrivals, saved commutes) were **not**
  exercised — the feed outage means arrival rows never rendered, so defects in
  those rows (e.g. `ArrivalRow.tsx:126`'s `text-red-500` on white, 3.8:1) are
  latent rather than recorded. Fix the token at the component, not the node.
- Routes are audited in their empty/error states where the screen needs user
  data; states behind auth are unmeasured.
