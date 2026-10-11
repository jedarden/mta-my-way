/**
 * Agentation wiring tests for the PWA entry point.
 *
 * The workspace agentation rule requires every HTML entry point to mount
 * the visual-feedback toolbar, and the failure mode it warns about is
 * structural: /agentation.js imports bare react specifiers, so an import
 * map that is missing, duplicated, or ordered after the first module
 * script kills the module silently while the page still renders. These
 * tests lock that structure for packages/web/index.html — map count and
 * position, the esm.sh pins, the post-paint loader, and the mount
 * self-check. The live mounting half is covered by the browser check
 * against a built app (docs/notes/agentation-wiring.md).
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * packages/web/, resolved from the process working directory: vitest runs
 * this suite under jsdom, where import.meta.url is the jsdom origin rather
 * than a file:// URL, so it cannot be used to locate files on disk. The
 * suite is invocable from the repo root (npx vitest run <path>) or from the
 * package directory (npm test -w packages/web), hence the upward walk.
 */
function webRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    const candidate = resolve(dir, "packages/web");
    if (existsSync(resolve(candidate, "index.html"))) return candidate;
    dir = resolve(dir, "..");
  }
  return process.cwd();
}

const root = webRoot();
const indexHtml = readFileSync(resolve(root, "index.html"), "utf8");
const toolbarModule = readFileSync(resolve(root, "public/agentation.js"), "utf8");

describe("Agentation wiring in packages/web/index.html", () => {
  it("has exactly one import map, before the first module script", () => {
    const mapCount = indexHtml.split('<script type="importmap">').length - 1;
    expect(mapCount).toBe(1);

    const mapIndex = indexHtml.indexOf('<script type="importmap">');
    const firstModuleIndex = indexHtml.indexOf('<script type="module"');
    expect(firstModuleIndex).toBeGreaterThan(-1);
    expect(mapIndex).toBeGreaterThanOrEqual(0);
    expect(mapIndex).toBeLessThan(firstModuleIndex);
  });

  it("pins react and react-dom through the import map", () => {
    // react (module) + react/jsx-runtime both resolve to the react pin;
    // react-dom and react-dom/client to the react-dom pin.
    expect(indexHtml.match(/https:\/\/esm\.sh\/react@18\.3\.1/g)?.length).toBeGreaterThanOrEqual(2);
    expect(
      indexHtml.match(/https:\/\/esm\.sh\/react-dom@18\.3\.1/g)?.length
    ).toBeGreaterThanOrEqual(2);
    expect(indexHtml).toContain("https://esm.sh/react-dom@18.3.1/client");
    expect(indexHtml).toContain("https://esm.sh/react@18.3.1/jsx-runtime");
  });

  it("loads /agentation.js from a post-paint gate, not a parse-time module tag", () => {
    // A parse-time module tag would start the toolbar's fetches before the
    // first painted frame, which Lantern charges to FCP (the same critical
    // chain the app-graph boot gate exists to protect), so the loader must
    // be a classic script that dynamic-imports after the rAF+setTimeout
    // gate fires.
    expect(indexHtml).not.toContain('<script type="module" src="/agentation.js">');
    expect(indexHtml).toContain('import("/agentation.js")');

    const loaderIndex = indexHtml.indexOf('import("/agentation.js")');
    const gateIndex = indexHtml.indexOf("requestAnimationFrame");
    expect(gateIndex).toBeGreaterThan(-1);
    expect(gateIndex).toBeLessThan(loaderIndex);
  });

  it("chains the toolbar import after the app graph resolves, not alongside it", () => {
    // Both post-paint gates open in the same frame, so gate-ordering alone
    // still starts the toolbar's esm.sh fetches inside the app graph's boot
    // window — measured LCP 3.4s vs 2.1s under LHCI simulated throttling
    // (bandwidth competition with the app chunks). The boot script must
    // publish its import promise and the loader must await it.
    const bootPublish = indexHtml.indexOf('__appGraphReady = import("/src/main.tsx")');
    const loaderAwait = indexHtml.indexOf("window.__appGraphReady || Promise.resolve()");
    expect(bootPublish).toBeGreaterThan(-1);
    expect(loaderAwait).toBeGreaterThan(bootPublish);
  });

  it("waits for the app's fetch cascade to go quiet before fetching the toolbar", () => {
    // The initial screen is a lazy() chunk whose fetch begins only after
    // main.tsx executes, so chaining at graph-resolution time still shares
    // the boot window with it. The loader must observe resource-timing
    // silence (with a hard cap) before importing the toolbar.
    expect(indexHtml).toContain('getEntriesByType("resource")');
    expect(indexHtml).toContain("quietMs >= 600");
    expect(indexHtml).toContain("performance.now() - started > 4000");
  });

  it("ships the mount self-check for #agentation-root", () => {
    expect(indexHtml).toContain('getElementById("agentation-root")');
    expect(indexHtml).toContain("Agentation did not mount");
  });
});

describe("Agentation toolbar module (public/agentation.js)", () => {
  it("mounts the toolbar into #agentation-root", () => {
    expect(toolbarModule).toContain('mount.id = "agentation-root"');
    expect(toolbarModule).toContain("createRoot(mount).render");
  });

  it("pins the agentation version it fetches from esm.sh", () => {
    const pin = toolbarModule.match(/https:\/\/esm\.sh\/agentation@(\d+\.\d+\.\d+)/);
    expect(pin).not.toBeNull();
    // The vendored module is generated against the installed devDependency;
    // a bump of one must be mirrored in the other.
    const pkg = JSON.parse(readFileSync(resolve(root, "../../package.json"), "utf8")) as {
      devDependencies: Record<string, string>;
    };
    expect(pkg.devDependencies["agentation"]).toContain(`^${pin?.[1]}`);
  });
});
