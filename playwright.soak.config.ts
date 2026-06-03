import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e-soak",
  timeout: 11 * 60_000,
  outputDir: "output/playwright/soak-results",
  reporter: [["list"]],
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 15_000,
  },
});

