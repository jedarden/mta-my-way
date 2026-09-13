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
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.d.ts"],
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
