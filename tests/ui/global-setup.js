/**
 * Playwright global setup — runs once before all tests.
 *
 * Handles both scenarios transparently:
 *
 *   Fresh HA (CI)   → HA redirects to /onboarding.
 *                     Fills the "Create Account" form and clicks through any
 *                     remaining onboarding steps (location, analytics, …).
 *
 *   Existing HA     → HA redirects to /auth/authorize.
 *                     Fills the standard login form.
 *
 * In both cases the resulting authenticated browser state is saved to
 * .auth.json so every test starts already logged in.
 */
const { chromium } = require("@playwright/test");

const HA_URL = process.env.HA_URL || "http://home-assistant:8123";
const HA_USER = process.env.HA_USER || "admin";
const HA_PASS = process.env.HA_PASS || "admin";

module.exports = async function globalSetup() {
  const browser = await chromium.launch({ args: ["--no-proxy-server"] });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Retry navigation until HA's HTTP server is up.
  // HA is started in the background; npm ci + playwright install provide
  // some buffer, but we poll to handle slow runners.
  for (let i = 0; i < 90; i++) {
    try {
      const resp = await page.goto(HA_URL, {
        timeout: 5_000,
        waitUntil: "domcontentloaded",
      });
      if (resp && resp.status() < 500) break;
    } catch {
      // Connection refused — HA still starting
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }

  // Wait for HA's SPA to client-side-navigate to either onboarding or auth.
  await page.waitForURL(
    (url) =>
      url.pathname.startsWith("/onboarding") ||
      url.pathname.startsWith("/auth"),
    { timeout: 60_000 }
  );

  // On a fresh HA install the SPA visits /auth/authorize briefly as an
  // intermediate step before redirecting to /onboarding.  Give it up to 15 s
  // to complete that redirect so we don't mis-classify a fresh install as an
  // existing one and then try (and fail) to log in with invalid credentials.
  if (!page.url().includes("/onboarding")) {
    await page
      .waitForURL((url) => url.pathname.startsWith("/onboarding"), {
        timeout: 15_000,
      })
      .catch(() => {}); // URL stayed at /auth — existing install, that's fine
  }

  if (page.url().includes("/onboarding")) {
    // ── Fresh install: drive the onboarding wizard ─────────────────────────

    // "Create my smart home" welcome screen.
    await page.getByRole("button", { name: "Create my smart home" }).click();

    // "Create account" form.
    await page.getByRole("textbox", { name: "Name*", exact: true }).fill("Admin");
    await page.getByRole("textbox", { name: "Password*", exact: true }).fill(HA_PASS);
    await page.getByRole("textbox", { name: "Confirm password*" }).fill(HA_PASS);
    await page.getByRole("button", { name: "Create account" }).click();

    // Click through remaining steps (location, analytics, finish, …) dynamically.
    // Each iteration waits to see if we've left onboarding; if not, it waits
    // for the next forward button and clicks it.
    for (let step = 0; step < 10; step++) {
      const done = await page
        .waitForURL(
          (url) =>
            !url.pathname.startsWith("/onboarding") &&
            !url.pathname.startsWith("/auth"),
          { timeout: 5_000 }
        )
        .then(() => true)
        .catch(() => false);
      if (done) break;

      const btn = page.getByRole("button", { name: /next|finish|done/i }).first();
      await btn.waitFor({ state: "visible", timeout: 10_000 });
      await btn.click();
    }
  }

  await page.goto(HA_URL)

  // ── Standard login form ──────────────────────────────
  await page.waitForURL("**/auth/authorize**", { timeout: 15_000 });
  // Use attribute selectors — stable and work inside HA's shadow DOM.
  // Avoid getByLabel(/password/i) which also matches "Show password".
  await page.locator('input[name="username"]').fill(HA_USER);
  await page.locator('input[type="password"]').fill(HA_PASS);
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), {
    timeout: 15_000,
  });

  await context.storageState({ path: ".auth.json" });
  await browser.close();
};
