import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Worker node:test and Playwright suites run separately in CI.
    include: ["src/**/*.{test,spec}.{js,jsx,ts,tsx}"],
    restoreMocks: true,
  },
});
