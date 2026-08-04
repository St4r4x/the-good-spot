import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Playwright doesn't auto-load .env files; load test credentials explicitly
// before the config (and the spec files that read process.env) evaluate.
if (existsSync(".env.test.local")) process.loadEnvFile(".env.test.local");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
