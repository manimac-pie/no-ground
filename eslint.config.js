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
    // The renderer only reads the game state; the game update owns it (CLEANUP.md item 14).
    // Catches `state.x = …` and `state.player.x = …`, not writes through other names.
    files: ["src/render/**/*.js"],
    rules: {
      "no-restricted-syntax": ["error",
        ...["AssignmentExpression[left", "UpdateExpression[argument"].flatMap((node) => [
          { selector: `${node}.object.name='state']`, message: "render/ only reads the game state." },
          { selector: `${node}.object.object.name='state']`, message: "render/ only reads the game state." },
        ]),
      ],
    },
  },
  {
    files: ["*.config.js"],
    languageOptions: { globals: globals.node },
  },
];
