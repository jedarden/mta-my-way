import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    poolOptions: { forks: { maxForks: 4 } },
  },
  workspace: ["packages/web", "packages/server", "packages/shared"],
});
