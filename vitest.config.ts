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
  pool: "forks",
  poolOptions: {
    forks: {
      singleFork: false,
      minForks: 1,
      maxForks: 4,
    },
  },
  test: {
    env: {
      TEST_MODE: "true",
    },
    setupFiles: [],
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
            },
          },
        },
      },
      {
        // Server package - uses node environment
        test: {
          environment: "node",
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
