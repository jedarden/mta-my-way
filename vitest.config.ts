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
    maxForks: 4,
    env: {
      TEST_MODE: "true",
    },
    setupFiles: [],
    // Global hooks for all test projects to ensure proper isolation
    poolOptions: {
      forks: {
        singleFork: false, // Run tests in parallel for speed
        minForks: 1,
        maxForks: 4,
      },
    },
    // Ensure proper test isolation across all projects
    sequence: {
      shuffle: false, // Run tests in order for reproducibility
      concurrent: true, // Allow concurrent test execution
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
          pool: "forks",
          maxForks: 4,
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
          pool: "forks",
          maxForks: 4,
          resolve: {
            alias: {
              "virtual:pwa-register": path.resolve(
                __dirname,
                "./packages/web/src/test/mocks/pwa-register.ts"
              ),
            },
          },
        },
      },
      {
        // Server package - uses node environment
        test: {
          environment: "node",
          include: ["packages/server/src/**/*.test.ts"],
          pool: "forks",
          maxForks: 4,
          setupFiles: ["./packages/server/src/test/setup.ts"],
        },
      },
      {
        // Shared package - uses node environment (no setup file needed)
        test: {
          environment: "node",
          include: ["packages/shared/src/**/*.test.ts"],
          globals: true,
          pool: "forks",
          maxForks: 4,
          setupFiles: [],
        },
      },
    ],
  },
});
