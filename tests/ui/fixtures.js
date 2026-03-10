/**
 * Shared Playwright fixtures and helpers for Harr UI tests.
 *
 * Usage:
 *   const { test, expect } = require("./fixtures");
 *
 * Authentication is handled once in global-setup.js and stored in .auth.json.
 * The `harrPage` fixture simply navigates to the Harr panel — no per-test login.
 * The exported `loginToHA` helper is kept for manual/debugging use.
 */
const { test: base, expect } = require("@playwright/test");

const HA_URL = process.env.HA_URL || "http://home-assistant:8123";
const HA_TOKEN = process.env.HA_TOKEN || "";
const HA_USER = process.env.HA_USER || "admin";
const HA_PASS = process.env.HA_PASS || "admin";

/**
 * Log in to Home Assistant.
 *
 * If HA_TOKEN is set, inject it directly into localStorage (fast path).
 * Otherwise fill in the UI login form using HA_USER / HA_PASS.
 */
async function loginToHA(page) {
  if (HA_TOKEN) {
    // Navigate first so localStorage is available for this origin
    await page.goto(HA_URL);
    await page.evaluate(({ token, hassUrl }) => {
      // Structure expected by home-assistant-js-websocket
      localStorage.setItem(
        "hassTokens",
        JSON.stringify({
          access_token: token,
          token_type: "Bearer",
          expires_in: 1800,
          hassUrl,
          clientId: `${hassUrl}/`,
          expires: Date.now() + 1800000,
          refresh_token: "",
        })
      );
    }, { token: HA_TOKEN, hassUrl: HA_URL });
    await page.reload();
    // Wait until HA frontend is ready (auth page means token was rejected)
    await page.waitForFunction(
      () => !window.location.pathname.startsWith("/auth"),
      { timeout: 10_000 }
    );
  } else {
    // UI login flow — works with any HA version
    await page.goto(HA_URL);
    // HA redirects unauthenticated requests to /auth/authorize
    await page.waitForURL("**/auth/authorize**", { timeout: 10_000 });
    await page.fill('input[name="username"]', HA_USER);
    await page.fill('input[name="password"]', HA_PASS);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 15_000 });
  }
}

/**
 * Walk the full shadow DOM tree to find an element by tag name.
 * Used inside page.evaluate() — must be a plain serialisable function string.
 */
const FIND_ELEMENT_SCRIPT = `
  (function findDeep(root, tag) {
    const el = root.querySelector(tag);
    if (el) return el;
    for (const child of root.querySelectorAll("*")) {
      if (child.shadowRoot) {
        const found = findDeep(child.shadowRoot, tag);
        if (found) return found;
      }
    }
    return null;
  })(document, "ha-harr")
`;

/**
 * Navigate to the Harr panel and cache the ha-harr element on window.__haHarr.
 *
 * HA renders panels inside nested shadow roots, so document.querySelector("ha-harr")
 * won't work in page.evaluate(). Caching the reference on window lets every spec
 * file do window.__haHarr?.shadowRoot?.querySelector(...) reliably.
 */
async function navigateToHarr(page) {
  await page.goto(`${HA_URL}/harr`);
  // Playwright's waitForSelector pierces shadow DOM automatically
  await page.waitForSelector("ha-harr", { timeout: 15_000 });
  // Walk the shadow DOM to find ha-harr and cache it for page.evaluate() calls
  await page.evaluate(`window.__haHarr = ${FIND_ELEMENT_SCRIPT}`);
}

/**
 * Evaluate a selector inside the shadow DOM of ha-harr.
 */
async function harrShadow(page, selector) {
  return page.evaluateHandle(
    (sel) => window.__haHarr?.shadowRoot?.querySelector(sel),
    selector
  );
}

const test = base.extend({
  /**
   * `harrPage` fixture: navigates to the Harr panel.
   * Auth is pre-loaded from global-setup.js via storageState — no login needed.
   */
  harrPage: async ({ page }, use) => {
    await navigateToHarr(page);
    await use(page);
  },
});

module.exports = { test, expect, loginToHA, navigateToHarr, harrShadow, HA_URL };
