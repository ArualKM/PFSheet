import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Nested build output + agent worktrees (a full repo copy + its .next) must never be linted —
    // the root-relative ".next/**" above misses e.g. .claude/worktrees/<id>/.next/.
    "**/.next/**",
    ".claude/**",
  ]),
]);

export default eslintConfig;
