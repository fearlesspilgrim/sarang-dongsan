import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4177",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "on-first-retry",
  },
  webServer: {
    command: "python3 -m http.server 4177",
    port: 4177,
    reuseExistingServer: true,
  },
  projects: [
    {
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
