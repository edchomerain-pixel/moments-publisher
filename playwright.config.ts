import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  use: { baseURL: "http://127.0.0.1:4173" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        launchOptions: { executablePath: process.env.CHROMIUM_PATH },
      },
    },
    { name: "webkit", use: { ...devices["iPhone 13"] } },
  ],
  webServer: {
    command: "npm run preview -- --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
});
