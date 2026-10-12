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
    globals: true,
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      // Without this vitest suppresses the report whenever the run has any
      // failing test, even failures from files outside coverage scope —
      // the full-suite report was silently never emitted until this was set.
      reportOnFailure: true,
      // First-party product source only. The default include would also pull
      // in code no vitest suite can meaningfully cover: scripts/*.mjs are
      // standalone CLI tools vitest never imports, src/proto/compiled.js is
      // generated protobuf output, src/test/** holds shared test fixtures and
      // helpers, and src/benchmarks/** is a manual benchmark harness.
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/**/*.d.ts",
        "src/proto/**",
        "src/test/**",
        "src/benchmarks/**",
      ],
    },
  },
});
