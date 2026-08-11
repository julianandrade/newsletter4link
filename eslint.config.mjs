/**
 * The lint gate, which this project did not have.
 *
 * `npm run lint` was `next lint` from the day the repo was scaffolded, and eslint itself was
 * never installed: `next lint` used to offer to install it on first run and nobody accepted.
 * In Next 16 that command is gone and its argument is read as a directory, so the script
 * answered "no such directory: ...\lint". Nothing was linting, and nothing said so.
 *
 * Flat config, because eslint 9 and above take no `.eslintrc`. `eslint-config-next` v16
 * exports flat config arrays directly, so there is no FlatCompat wrapper here.
 */

import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
/**
 * A direct dependency, not a borrowed one.
 *
 * `eslint-config-next` depends on this package and registers its plugin for TS files, but a
 * flat config can only use a rule whose plugin is declared in the same block, so the block
 * below has to import it. Declared in package.json rather than reached for through
 * node_modules, because a transitive dependency is free to disappear in a minor release.
 */
import tseslint from "typescript-eslint";

const config = [
  {
    /**
     * Ignored before anything else, because a flat config's `ignores` in a block of its own
     * is global rather than per-set.
     *
     * `.claude/` is a copy of another repository, common-ai-configs, and has held a nested
     * checkout: vitest scanning it is what produced sixty phantom failures once, and eslint
     * would report on a codebase nobody here can fix. The rest is generated, vendored or
     * not source.
     */
    ignores: [
      ".next/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      ".playwright-mcp/**",
      ".claude/**",
      ".impeccable/**",
      "docs/**",
      "public/**",
      "next-env.d.ts",
    ],
  },

  // Next's own recommended set, plus the Core Web Vitals rules. It carries the react,
  // react-hooks, jsx-a11y and import plugins, so nothing else is added here.
  ...nextCoreWebVitals,

  {
    /**
     * The project's own adjustments, each one a decision rather than a silencing.
     *
     * Everything Next reports as a warning stays a warning: the gate in CI fails on errors
     * only. A gate introduced on a codebase of two hundred files either starts that way or
     * starts turned off, and a lint nobody can pass is the state this repo was already in.
     */
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      /**
       * An unused import or variable is worth catching, and `tsc --noEmit` does not report
       * it: the project deliberately runs without `noUnusedLocals` so a work in progress
       * still type-checks. A leading underscore is the escape hatch, for a parameter that
       * has to exist to reach the one after it.
       */
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  {
    /**
     * The React Compiler rules, reported and not enforced.
     *
     * `eslint-plugin-react-hooks` v7 ships the compiler's rules next to the two classic
     * ones, and on this codebase they produce 55 errors: 43 of them are
     * `set-state-in-effect`, which is every screen that loads its data in a `useEffect` and
     * calls a setter with the answer. That is the shape of every list and detail page here,
     * so it is one decision to revisit rather than 43 defects, and it is not a decision to
     * take inside a commit that installs the linter.
     *
     * Warnings rather than off, so the list stays visible and countable, and so the number
     * going down is progress somebody can see. `rules-of-hooks` and `exhaustive-deps`, the
     * two rules that catch real crashes and real stale closures, are untouched: the first
     * stays an error.
     *
     * When the compiler is adopted, the way through this is one screen at a time, and this
     * block gets shorter each time.
     *
     * The four paths are where React code lives today, listed rather than globbed to `**`
     * on purpose: the exemption covers the debt that exists, so a hook written somewhere
     * else reports an error and gets looked at rather than inheriting it.
     */
    files: [
      "app/**/*.tsx",
      "components/**/*.tsx",
      "hooks/**/*.{ts,tsx}",
      "lib/auth/hooks.ts",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
];

export default config;
