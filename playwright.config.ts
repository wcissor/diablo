import { defineConfig, devices } from "@playwright/test";
import { DEMO_STATE } from "./e2e/helpers";

/**
 * End-to-end tests run against the production build:
 *   npm run build && npm run test:e2e
 * The web server starts automatically (or reuses one already on the port).
 * Browsers: `npx playwright install chromium` once, on any OS.
 *
 * The workspace needs a session: the `setup` project signs in through the
 * demo route once and every spec reuses that cookie (storageState). Specs
 * about signing in start signed out.
 */
const PORT = Number(process.env.PORT ?? 3100);

export default defineConfig({
  testDir: "e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    // Demo mode is a build-time flag: the test server builds with it (production never does).
    command: `npx next build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: true,
    timeout: 240_000,
    env: {
      NEXT_PUBLIC_DEMO_MODE: "1",
      // A throwaway secret for the local test server only; production sets its own.
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-only-secret-never-used-in-production-000",
      // Google stays unconfigured in tests: no network, and the disabled state is covered.
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      // No model provider in tests: live runs show their honest "needs a key" state and make no calls.
      ANTHROPIC_API_KEY: "",
      ANTHROPIC_WORKSPACE_ID: "",
      GEMINI_API_KEY: "",
      DIABLO_LLM: "",
    },
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: DEMO_STATE },
    },
  ],
});
