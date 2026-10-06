// eslint.config.js
import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/"] },
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
    },
    rules: {
      // Draw functions share signatures like (ctx, ..., COLORS) even when one doesn't use every argument.
      "no-unused-vars": ["error", { args: "none" }],
      // `try { localStorage... } catch {}` is deliberate: storage can be blocked, and the game carries on.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["*.config.js"],
    languageOptions: { globals: globals.node },
  },
];
