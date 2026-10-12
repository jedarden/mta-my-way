import fs from "fs";
import path from "path";
import { defineConfig } from "vitest/config";

// Custom plugin to handle virtual:pwa-register module
function virtualPwaRegisterPlugin() {
  return {
    name: "virtual-pwa-register",
    resolveId(id: string) {
      if (id === "virtual:pwa-register") {
        return path.resolve(__dirname, "./packages/web/src/test/mocks/pwa-register.ts");
      }
      return null;
    },
    load(id: string) {
      if (id.includes("pwa-register.ts")) {
        return fs.readFileSync(id, "utf-8");
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [virtualPwaRegisterPlugin()],
  test: {
    pool: "forks",
    // Vitest 4 removed poolOptions; maxWorkers is the active worker limit.
    // Keeping this at four prevents large integration runs from exhausting
    // the shared test host and timing out otherwise fast cleanup hooks.
    maxWorkers: 4,
    env: {
      TEST_MODE: "true",
    },
    setupFiles: [],
    // Ensure proper test isolation across all projects
    //
    // sequence.concurrent MUST stay false (the vitest default): with it enabled,
    // tests inside a file run in parallel and vitest defers afterEach hooks until
    // the whole concurrent batch finishes. That ships every after-each cleanup —
    // including @testing-library/react auto-cleanup — too late, so rendered DOM
    // leaks into subsequent tests ("Found multiple elements with the role ...").
    //
    // The per-package configs never set this flag, which is why the same test
    // file passed under packages/web but failed from this root config.
    sequence: {
      shuffle: false, // Run tests in order for reproducibility
      concurrent: false,
    },
    // Timeout for hooks to avoid hanging tests
    hookTimeout: 10000,
    testTimeout: 10000,
    resolve: {
      alias: {
        "virtual:pwa-register": path.resolve(
          __dirname,
          "./packages/web/src/test/mocks/pwa-register.ts"
        ),
      },
    },
    projects: [
      {
        // Root-level tests - uses node environment
        test: {
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/e2e/**/*.e2e.ts"],
          setupFiles: [],
        },
      },
      {
        // Web package - uses jsdom environment for React component testing
        test: {
          environment: "jsdom",
          include: ["packages/web/src/**/*.test.ts", "packages/web/src/**/*.test.tsx"],
          globals: true,
          setupFiles: ["./packages/web/src/test/setup.ts"],
          resolve: {
            alias: {
              "virtual:pwa-register": path.resolve(
                __dirname,
                "./packages/web/src/test/mocks/pwa-register.ts"
              ),
              // Mirrors the alias in packages/web/vite.config.ts
              // (mtamyway-9b7b2a4f): tests must exercise the router shim that
              // ships, not the react-router-dom the specifier used to resolve to.
              "react-router-dom": path.resolve(
                __dirname,
                "./packages/web/src/shims/react-router-dom.tsx"
              ),
            },
          },
        },
      },
      {
        // Server package - uses node environment
        test: {
          environment: "node",
          // Inline projects use Vitest's 5s default unless set here; password
          // hashing tests exceed it under the resource-limited CI runner.
          testTimeout: 10000,
          include: ["packages/server/src/**/*.test.ts"],
          setupFiles: ["./packages/server/src/test/setup.ts"],
        },
      },
      {
        // Shared package - uses node environment (no setup file needed)
        test: {
          environment: "node",
          include: ["packages/shared/src/**/*.test.ts"],
          globals: true,
          setupFiles: [],
        },
      },
    ],
  },
});
