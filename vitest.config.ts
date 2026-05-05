import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    poolOptions: { forks: { maxForks: 4 } },
    env: {
      TEST_MODE: "true",
    },
    setupFiles: [],
  },
});
