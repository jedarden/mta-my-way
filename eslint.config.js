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
      "**/proto/**",
      "**/test/fixtures/feeds/*.bin",
      "tests/**",
      "*.lcov",
      "*.tmp",
      "*.temp",
      "packages/web/tailwind.config.ts",
      "packages/web/vite.config.ts",
      "packages/web/vitest.config.ts",
      "packages/server/vitest.config.ts",
      "packages/shared/vitest.config.ts",
      "packages/web/public/**",
    ],
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.js", "vitest.config.ts"],
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
  },
  {
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "**/test-helpers.ts",
      "**/test/**/*.ts",
    ],
    languageOptions: {
      parserOptions: {
        projectService: false,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/consistent-type-imports": "off",
      "@typescript-eslint/no-this-alias": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
      "no-useless-escape": "off",
      "no-constant-binary-expression": "off",
    },
  }
);
