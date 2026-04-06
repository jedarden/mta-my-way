import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "**/dist/**",
      "*.tsbuildinfo",
      "coverage/",
      "**/coverage/**",
      "node_modules/",
      ".beads/",
      "**/tsconfig.json",
      "**/tsconfig.*.json",
      "**/scripts/**",
      "**/*.mjs",
      "**/proto/**/*.ts",
      "**/proto/**/*.d.ts",
      "**/test/fixtures/feeds/*.bin",
      "tests/**",
      "*.lcov",
      "*.tmp",
      "*.temp",
      "packages/web/tailwind.config.ts",
      "packages/web/vite.config.ts",
      "packages/web/vitest.config.ts",
      "packages/web/public/**",
    ],
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.js"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  }
);
