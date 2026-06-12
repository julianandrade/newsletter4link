import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  testMatch: ["**/*.spec.ts"],
  // The specs share one seeded database; parallel workers interleave writes
  // (e.g. one spec's unapproved draft changes another spec's page state).
  workers: 1,
  timeout: 120_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  // In CI the production build is started automatically (the app must already
  // be built); locally an existing dev server on :3000 is reused instead.
  webServer: {
    command: "npm run start",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Surface server-side errors (API route crashes, render failures) in the
    // Playwright output instead of swallowing them.
    stdout: "pipe",
    stderr: "pipe",
  },
});
