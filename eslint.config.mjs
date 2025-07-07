import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Ignore built files and type declarations
  {
    ignores: ["dist/**", "**/*.d.ts"],
  },

  // Base recommended configs
  eslint.configs.recommended,
  tseslint.configs.recommended,

  // Global settings for source files
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Settings for test files
  {
    files: [
      "tests/**/*.{ts,tsx}",
      "tests/**/*.{test,spec}.{ts,tsx}",
      "**/__tests__/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "eslint-comments/no-unused-disable": "off",
      "no-control-regex": "off",
      "no-console": "off",
    },
  },
);
