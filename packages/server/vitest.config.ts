import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    pool: "forks",
    poolOptions: { forks: { maxForks: 4 } },
    setupFiles: ["./src/test/setup.ts"],
  },
});
