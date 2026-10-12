import { defineConfig } from "vitest/config";

export default defineConfig({
  pool: "forks",
  poolOptions: {
    forks: {
      singleFork: false,
      minForks: 1,
      maxForks: 4,
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "json-summary"],
      // The suite carries known-red tests outside any single coverage pass's
      // scope; without this vitest suppresses the report entirely whenever a
      // run has failures, which made coverage silently unmeasurable.
      reportOnFailure: true,
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/**/*.d.ts",
        // Shared test fixtures and helpers, not product source.
        "src/test/**",
      ],
    },
  },
  resolve: {
    alias: {
      "virtual:pwa-register": "/src/test/mocks/pwa-register.ts",
      // Mirrors the alias in vite.config.ts (mtamyway-9b7b2a4f): tests must
      // exercise the router shim that ships, not the react-router-dom the
      // specifier used to resolve to.
      "react-router-dom": new URL("./src/shims/react-router-dom.tsx", import.meta.url).pathname,
    },
  },
});
