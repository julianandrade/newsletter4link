import next from "eslint-config-next";

/**
 * Flat ESLint config for Next.js 16 (the `next lint` command was removed in
 * Next 16, so CI runs ESLint directly).
 *
 * Philosophy: keep correctness/Next-specific rules as errors, but downgrade
 * the noisier stylistic/TypeScript rules to warnings so the existing codebase
 * lints clean and CI can treat lint errors as blocking. Tighten these to
 * "error" incrementally as the code is cleaned up.
 */
export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "prisma/migrations/**",
      "prisma/legacy/**",
      "next-env.d.ts",
      "**/*.config.{js,mjs,ts}",
    ],
  },
  ...next,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-require-imports": "warn",
      "react/no-unescaped-entities": "warn",
      "prefer-const": "warn",
      // react-hooks rules (incl. the React Compiler rules from
      // eslint-plugin-react-hooks v6) intentionally stay at their default
      // ERROR severity: the codebase was refactored to satisfy them and CI
      // blocks regressions.
    },
  },
];
