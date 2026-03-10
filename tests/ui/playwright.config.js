// @ts-check
const { defineConfig, devices } = require("@playwright/test");

// Bypass the Squid MITM proxy in the devcontainer — HA is internal/local
// and must be reached directly, not via the proxy.
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;

module.exports = defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.js",
  timeout: 30_000,
  retries: 1,
  reporter: [["list"], ["html"]],
  // Log in once before all tests; auth state is saved to .auth.json
  globalSetup: "./global-setup.js",
  use: {
    baseURL: process.env.HA_URL || "http://home-assistant:8123",
    // Reuse the authenticated session produced by global setup
    storageState: ".auth.json",
    // Headless by default; use --headed flag or set PWDEBUG=1 for debugging
    headless: true,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      // Force Chromium — only Chromium is installed; iPhone 13 profile
      // provides the right viewport + UA without needing WebKit.
      use: { ...devices["iPhone 13"], browserName: "chromium" },
    },
  ],
});
