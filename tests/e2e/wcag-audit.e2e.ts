/**
 * WCAG 2.x automated audit (axe-core) across every routed screen.
 *
 * Phase 4's accessibility work (skip link, landmarks, LiveAnnouncer, FocusTrap,
 * 44px touch targets, 390 aria-* attributes) was asserted, never measured: the
 * only machine reading was the Lighthouse accessibility *score* for the single
 * start URL, which is not a violation list. This spec produces the missing
 * measurement — axe-core run per route, in light and dark color schemes, with
 * the violations written to a machine-readable report.
 *
 * Run (from tests/e2e/):
 *
 *   npx playwright test wcag-audit.e2e.ts --project="Mobile Chrome"
 *
 * The nix-store Chromium must be reachable: Playwright's own download cannot
 * launch on this host, so export CHROME_PATH exactly as `npm run lighthouse`
 * does (see docs/notes/lighthouse-acceptance-baseline.md).
 *
 * Scope and limits, so the recorded result is read honestly:
 *   - Rules: axe's WCAG 2 A/AA/2.1 A/AA/2.2 AA tagged rules. axe-core covers
 *     roughly a third of WCAG success criteria; a clean report is not
 *     conformance, and untested criteria (cognitive, keyboard traps beyond
 *     axe's reach, screen-reader semantics) still need manual review.
 *   - Color scheme: audited in light AND dark (globals.css gates dark styles
 *     behind prefers-color-scheme, so emulation is the only way to reach them).
 *   - State: an anonymous visitor with the server's static GTFS data and real
 *     alerts but no live train feeds, no saved commutes, and no auth. Screens
 *     are measured in the state a first-time visitor actually sees.
 *   - Browser: Mobile Chrome (Pixel 5) only — the app is mobile-first and
 *     contrast/layout results differ per engine, so the measurement fixes one.
 *
 * One route cannot be measured by a plain deep link, and that shadow is a
 * finding in its own right (recorded in docs/notes/wcag-audit-baseline.md):
 *   - /stats is served as the rollup-plugin-visualizer's stats.html once the
 *     precaching service worker is in control, because the visualizer's build
 *     artifact lands in the workbox precache manifest.
 * It is audited via client-side navigation so the actual React screen is what
 * gets measured, and additionally as the artifact page a
 * service-worker-controlled visit really receives. (/health has the same
 * shadow — the server readiness probe owns the path, so a deep link returns
 * API JSON, not the SPA; moving the probe to /healthz is tracked separately in
 * mtamyway-3117ec7a. Client-side navigation measures the screen under both
 * orderings, so it is the form used here.)
 *
 * axe-core is resolved from the installed tree rather than declared directly:
 * it arrives as a transitive dep of the root's direct devDependency
 * @lhci/cli -> lighthouse, so npm always installs it (pinned in
 * package-lock.json). Promote it to a direct devDependency of this workspace
 * if lighthouse ever drops it; resolution here fails loudly if it is absent.
 *
 * Report: tests/e2e/test-results/wcag-audit.json by default (Playwright's own
 * output dir, already gitignored), override with WCAG_AUDIT_OUT. Enforcement
 * is opt-in via WCAG_AUDIT_ENFORCE=1 — by default the spec records violations
 * without failing, because the fixes are tracked as their own beads; flip it
 * once those land and the audit becomes the gate.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, expect, test } from "@playwright/test";

const require = createRequire(import.meta.url);
/** This spec is transpiled to ESM, so derive the directory from import.meta.url. */
const HERE = dirname(fileURLToPath(import.meta.url));

function resolveAxeSource(): string {
  const candidate = resolve(require.resolve("axe-core"), "..", "axe.min.js");
  if (!existsSync(candidate)) {
    throw new Error(
      `axe-core is not installed (looked for ${candidate}). Run \`npm install\` at the repo root — ` +
        `axe-core is installed transitively via @lhci/cli -> lighthouse.`
    );
  }
  return candidate;
}

const AXE_SOURCE = resolveAxeSource();

const REPORT_PATH =
  process.env["WCAG_AUDIT_OUT"] ?? resolve(HERE, "test-results", "wcag-audit.json");

/** WCAG success criteria axe can automate, at A and AA. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * How each route is reached. `direct` is a plain deep link — what a fresh
 * visit serves. `client` boots the SPA at / first and then navigates, for the
 * routes a deep link cannot reach. `firstRun` leaves the onboarding flag
 * unset: HomeScreen renders the first-run OnboardingFlow *instead of* the
 * Screen shell (no <main>), so that state is audited once here and every other
 * route measures the steady-state app with onboarding already completed.
 */
type Navigation = "direct" | "client" | "firstRun";

const ROUTES: { name: string; path: string; nav?: Navigation }[] = [
  { name: "Onboarding (first run)", path: "/", nav: "firstRun" },
  { name: "Home", path: "/" },
  { name: "Search", path: "/search" },
  { name: "Commute", path: "/commute" },
  { name: "Alerts", path: "/alerts" },
  { name: "Map", path: "/map" },
  {
    name: "Health (client-side nav — deep link serves the API readiness probe)",
    path: "/health",
    nav: "client",
  },
  { name: "Station", path: "/station/101" }, // Van Cortlandt Park-242 St (static data)
  { name: "Line Diagram", path: "/line/1" },
  { name: "Trip", path: "/trip/audit-no-such-trip" }, // not-found state
  { name: "Journal", path: "/journal" },
  {
    name: "Stats (client-side nav — deep link serves the precached bundle visualizer)",
    path: "/stats",
    nav: "client",
  },
  { name: "Stats as a service-worker-controlled visit really reaches it", path: "/stats" },
  { name: "Settings", path: "/settings" },
  { name: "Password Reset Request", path: "/reset-password" },
  { name: "Password Reset Confirm", path: "/reset-password/confirm" },
];

/**
 * favoritesStore persists to localStorage under this key (zustand `persist`),
 * and HomeScreen dispatches on `state.onboardingComplete`.
 */
const ONBOARDING_STORAGE_KEY = "mta-favorites";

const COLOR_SCHEMES = ["light", "dark"] as const;
type ColorScheme = (typeof COLOR_SCHEMES)[number];

/** Trimmed axe violation, small enough to keep the whole report in git. */
interface RecordedViolation {
  id: string;
  impact: string | null;
  help: string;
  wcagTags: string[];
  nodes: { target: string[]; html: string; failureSummary: string | null }[];
}

interface RouteResult {
  name: string;
  path: string;
  colorScheme: ColorScheme;
  url: string;
  violations: RecordedViolation[];
  violationCount: number;
  nodeCount: number;
  incompleteCount: number;
  /** Rules axe could not decide (needs human review), deduped. */
  incompleteRuleIds: string[];
  passCount: number;
  inapplicableCount: number;
  axeVersion: string;
}

interface AuditReport {
  generatedAt: string;
  axeVersion: string;
  tags: string[];
  browser: string;
  routes: RouteResult[];
  totals: { violations: number; nodes: number; incomplete: number };
}

// The spec writes one report file, so the routes run inside a single test.
test.describe.configure({ mode: "serial" });

test("axe-core WCAG audit across all routed screens", async ({ page }, testInfo) => {
  // 16 route states x 2 color schemes, each with a settle window — far past
  // the default 30s test timeout.
  test.setTimeout(5 * 60_000);
  const axeVersion = await getAxeVersion();
  const routes: RouteResult[] = [];

  // Complete onboarding before the app boots so every route after the first-run
  // entry renders the steady-state screen rather than the first-run tour.
  // Added once: addInitScript accumulates for the life of the page.
  let onboardingSeeded = false;

  for (const route of ROUTES) {
    for (const colorScheme of COLOR_SCHEMES) {
      if (route.nav !== "firstRun" && !onboardingSeeded) {
        await page.addInitScript(completeOnboardingInitScript, ONBOARDING_STORAGE_KEY);
        onboardingSeeded = true;
      }
      routes.push(
        await auditRoute(
          page,
          route.name,
          route.path,
          colorScheme,
          axeVersion,
          route.nav ?? "direct"
        )
      );
    }
  }

  const report: AuditReport = {
    generatedAt: new Date().toISOString(),
    axeVersion,
    tags: WCAG_TAGS,
    browser: `${testInfo.project.name} (Pixel 5)`,
    routes,
    totals: {
      violations: routes.reduce((sum, r) => sum + r.violationCount, 0),
      nodes: routes.reduce((sum, r) => sum + r.nodeCount, 0),
      incomplete: routes.reduce((sum, r) => sum + r.incompleteCount, 0),
    },
  };

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

  // Attach so the HTML report carries the measurement, not just a pass/fail.
  await testInfo.attach("wcag-audit.json", {
    body: readFileSync(REPORT_PATH),
    contentType: "application/json",
  });

  const withViolations = routes.filter((r) => r.violationCount > 0);
  console.log(
    `\nWCAG audit: ${report.totals.violations} violations (${report.totals.nodes} nodes) ` +
      `across ${routes.length} route/scheme runs — ${withViolations.length} runs affected.\n` +
      `Report: ${REPORT_PATH}`
  );
  for (const r of withViolations) {
    console.log(`  ${r.colorScheme} ${r.name}: ${r.violations.map((v) => v.id).join(", ")}`);
  }

  if (process.env["WCAG_AUDIT_ENFORCE"] === "1") {
    expect(withViolations, "WCAG violations remain — see the attached report").toEqual([]);
  }
});

/**
 * Runs in the page before app boot (addInitScript): flip the persisted
 * favorites-store flag that HomeScreen dispatches on, preserving whatever else
 * the store and its schema migrations had stored.
 */
function completeOnboardingInitScript(key: string): void {
  let stored: { state?: Record<string, unknown>; version?: number } = {};
  try {
    stored = JSON.parse(localStorage.getItem(key) ?? "{}");
  } catch {
    stored = {};
  }
  localStorage.setItem(
    key,
    JSON.stringify({
      ...stored,
      state: { ...(stored.state ?? {}), onboardingComplete: true },
      version: stored.version ?? 0,
    })
  );
}

/**
 * Drop the app state a previous route left behind — service worker, precache,
 * storage — so each route is measured the way its own fresh visit reaches it,
 * not layered on the previous screen's state.
 */
async function resetPageState(page: Page): Promise<void> {
  await page
    .evaluate(async () => {
      const registrations = (await navigator.serviceWorker?.getRegistrations()) ?? [];
      await Promise.all(registrations.map((r) => r.unregister()));
      const cacheNames = (await caches?.keys()) ?? [];
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
      localStorage.clear();
      sessionStorage.clear();
    })
    .catch(() => undefined);
  await page.context().clearCookies();
}

function auditRoute(
  page: Page,
  name: string,
  path: string,
  colorScheme: ColorScheme,
  axeVersion: string,
  nav: Navigation
): Promise<RouteResult> {
  return test.step(`${colorScheme} ${path}${nav === "direct" ? "" : ` (${nav})`}`, async () => {
    await resetPageState(page);
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });

    if (nav === "client") {
      // Deep links to these paths are shadowed (see the ROUTES comment), so
      // boot the shell first and navigate the way in-app controls would.
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.locator("main#main-content").waitFor({ state: "attached", timeout: 20_000 });
      await page.evaluate((to) => {
        history.pushState({}, "", to);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, path);
    } else {
      await page.goto(path, { waitUntil: "domcontentloaded" });
    }

    // Wait for the app to mount (the Screen shell renders <main>, though two
    // screens roll their own <main> without the shell's id), and for the
    // first-run tour the body is all there is. Then let the lazy screen chunk
    // and its data settle before measuring.
    const mountPoint = nav === "firstRun" ? page.locator("body") : page.locator("main");
    await mountPoint.waitFor({ state: "attached", timeout: 20_000 });
    // Screens that poll (map, arrivals) never reach networkidle, so settle is
    // "network quiet or 5s, whichever comes first", plus one paint of margin.
    await Promise.race([
      page.waitForLoadState("networkidle"),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
    await page.waitForTimeout(1_500);

    await page.addScriptTag({ path: AXE_SOURCE });

    const result = await page.evaluate(
      async ({ tags }) => {
        const axe = (window as unknown as { axe: AxeRuntime }).axe;
        const raw = await axe.run(document, { runOnly: { type: "tag", values: tags } });
        return {
          violations: raw.violations.map((v) => ({
            id: v.id,
            impact: v.impact ?? null,
            help: v.help,
            wcagTags: v.tags.filter((t) => t.startsWith("wcag")),
            nodes: v.nodes.map((n) => ({
              target: n.target,
              html: n.html,
              failureSummary: n.failureSummary ?? null,
            })),
          })),
          incompleteCount: raw.incomplete.length,
          incompleteRuleIds: [...new Set(raw.incomplete.map((v) => v.id))],
          passCount: raw.passes.length,
          inapplicableCount: raw.inapplicable.length,
        };
      },
      { tags: WCAG_TAGS }
    );

    const violations: RecordedViolation[] = result.violations;
    return {
      name,
      path,
      colorScheme,
      url: page.url(),
      violations,
      violationCount: violations.length,
      nodeCount: violations.reduce((sum, v) => sum + v.nodes.length, 0),
      incompleteCount: result.incompleteCount,
      incompleteRuleIds: result.incompleteRuleIds,
      passCount: result.passCount,
      inapplicableCount: result.inapplicableCount,
      axeVersion,
    };
  });
}

interface AxeRuntime {
  version: string;
  run(
    context: Document,
    options: { runOnly: { type: "tag"; values: string[] } }
  ): Promise<{
    violations: {
      id: string;
      impact: string | null;
      help: string;
      tags: string[];
      nodes: { target: string[]; html: string; failureSummary: string | null }[];
    }[];
    incomplete: { id: string }[];
    passes: unknown[];
    inapplicable: unknown[];
  }>;
}

async function getAxeVersion(): Promise<string> {
  const packageJson = resolve(dirname(AXE_SOURCE), "package.json");
  return JSON.parse(readFileSync(packageJson, "utf8")).version as string;
}
