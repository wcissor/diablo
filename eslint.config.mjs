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
    // The marketing site is its own Next.js project with its own lint config.
    "site/**",
    // The developer's local course (untracked): not part of the app.
    "learn/**",
    // The intro reel is its own Remotion project.
    "reel/**",
  ]),
]);

export default eslintConfig;
