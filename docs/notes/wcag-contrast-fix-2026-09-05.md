# WCAG color-contrast fix on /health — re-measured 2026-09-05

Bead `mtamyway-1f9a93a3`. Baseline and method are in
[`wcag-audit-baseline.md`](wcag-audit-baseline.md); this note records what the
fix changed and what the re-measurement says. Run the audit the same way the
baseline doc describes.

## Result

**0 violations (0 nodes) across 32 route/scheme runs** — the audit's whole
catalogue is empty, including the 36 light + 1 dark `/health` `color-contrast`
nodes this bead was filed against and the 2 `nested-interactive` map nodes
already fixed by `c8ad403`. `WCAG_AUDIT_ENFORCE=1` is now safe to flip.

Re-measured independently at 16:50Z the same day against a fresh
`vite build` of this tree: same result — 0 violations, 0 nodes, 32 runs,
`/health` 26 passes in each scheme (report not kept; the run is reproducible
from the commands above). 15 runs still report `color-contrast` as
*incomplete* — axe unable to decide, not a violation — same shape as the
baseline's 14.

Re-confirmed 2026-09-06T02:10Z (tree at `c937b9b`, fixes uncommitted in the
working tree): identical — 0 violations, 0 nodes, 32 runs, 15 incomplete,
`/health` 26 passes per scheme. See the baseline's re-verification section.

## What was actually wrong

The task description assumed the percentage overlay sat on top of a filled red
bar. It did not. Two separate defects produced the four measured failures:

1. **The progress "bar" was never a stroke.** `HealthSummary` applied
   `bg-red-500` (and friends) to an SVG `<circle>`. On an SVG shape,
   `background-color` paints the element's **whole bounding box**, so the
   component rendered a solid red square behind the glyph — that square is the
   `#fb2c36` background axe measured, at 1.25:1 light / 1.31:1 dark. Fix:
   `stroke-red-500` / `stroke-green-500` / …, which draws the arc the class
   name always claimed to draw. Verified in the built page: the circle's
   computed `background-color` is now transparent.

2. **Light-mode status text tokens were a step too light.** Measured against
   white and against `#F5F5F5` (what `surface` is *meant* to be), and against
   the `bg-red-500/10` chip under the CNCL badge:

   | token | on white | was |
   | --- | --- | --- |
   | `green-600` → `green-700` | 4.94 | 3.22 |
   | `yellow-600` → `yellow-800` | 6.87 | 2.93 |
   | `amber-600` → `amber-700` | 5.05 | 3.19 |
   | `orange-600` → `orange-700` | 5.23 | 3.59 |
   | `red-500`/`red-600` → `red-700` | 6.42 | 3.82 / 4.76 |

   `red-600` passed on white (4.76) but is 4.37 on `#F5F5F5` and 4.13 on the
   badge chip, so it was bumped with the rest rather than left at the edge.
   Dark-mode `-400` tokens were already 5.7:1+ on `#121212` / `#1E1E1E` and are
   unchanged. `yellow-700` (4.92 on white) was skipped for `yellow-800`: its
   margin on the tinted tiles is under 0.2:1.

Files: `LineStatusTile.tsx`, `HealthSummary.tsx`, `DataHealth.tsx`,
`ArrivalRow.tsx` (the two `text-red-500` "stale" notices the audit could not
render, plus the CNCL badge), `OnboardingFlow.tsx` (geolocation error text),
and `getFreshnessTextColor` in `packages/shared/src/utils/freshness.ts`, whose
`green`/`amber`/`red` levels are the same defect on the same screen and did not
fire in the baseline only because all 8 feeds were down in the audited state.

## Latent, not fixed here

- **`button { background: none }` in `globals.css` is unlayered**, so it beats
  every layered Tailwind `bg-*` utility. Every `<button>` in the app renders
  transparent: `LineStatusTile`'s `bg-yellow-50` / `bg-orange-50` / `bg-red-50`
  tile tints are invisible (axe measured those labels on white, not on the
  tint). The tokens chosen here pass on both white and the tints, so the fix
  holds when this is repaired — but repairing it turns on every button
  background in the app at once and needs its own bead.
- **`tailwind.config.ts` is dead.** Tailwind v4 ignores a JS config unless CSS
  declares `@config`, and `globals.css` does not. `bg-surface`,
  `text-text-primary`, `text-border`, `dark:bg-dark-surface` and the rest of
  the custom palette emit nothing, which is why the audited backgrounds were
  plain white/`#121212`. This is a much larger cosmetic defect than contrast;
  the `HealthSummary` track ring was switched to real `neutral-200` /
  `neutral-800` tokens only because its old `text-border` rendered near-black.
- **WCAG 1.4.11 (non-text contrast) is unmet by the progress arc** —
  `green-500` on white is 2.22:1 against the 3:1 a graphical object wants. The
  arc duplicates information the adjacent text states, and axe does not check
  it, so it was left at the existing `-500` visual weight.
- `RecommendationWhy.tsx` pairs `text-red-600` with `bg-red-500/10` (4.13:1) —
  the same shape as the CNCL badge, in a component another worker has in
  flight, so it is recorded rather than edited here.
