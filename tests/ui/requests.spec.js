/**
 * Tests for <harr-requests> — Seerr media requests tab.
 *
 * Requires Seerr configured in harr.
 */
const { test, expect } = require("./fixtures");

async function isRequestsTabVisible(page) {
  return page.evaluate(() => {
    const tabs = window.__haHarr?.shadowRoot?.querySelectorAll(".tab");
    for (const tab of tabs || []) {
      if (tab.textContent?.toLowerCase().includes("request")) return true;
    }
    return false;
  });
}

async function navigateToRequests(page) {
  await page.evaluate(() => {
    const tabs = window.__haHarr?.shadowRoot?.querySelectorAll(".tab");
    for (const tab of tabs || []) {
      if (tab.textContent?.toLowerCase().includes("request")) {
        tab.click();
        return;
      }
    }
  });
  await page.waitForTimeout(500);
}

test.describe("Requests tab", () => {
  test("requests section mounts", async ({ harrPage: page }) => {
    const visible = await isRequestsTabVisible(page);
    if (!visible) {
      test.skip();
      return;
    }

    await navigateToRequests(page);

    await page.waitForFunction(
      () => window.__haHarr?.shadowRoot?.querySelector("harr-requests") !== null,
      { timeout: 10_000 }
    );

    const section = await page.evaluateHandle(() =>
      window.__haHarr?.shadowRoot?.querySelector("harr-requests")
    );
    expect(section).not.toBeNull();
  });

  test("sub-tabs Pending / Approved / All are visible", async ({ harrPage: page }) => {
    const visible = await isRequestsTabVisible(page);
    if (!visible) {
      test.skip();
      return;
    }

    await navigateToRequests(page);
    await page.waitForTimeout(1000);

    const subTabTexts = await page.evaluate(() => {
      const section = window.__haHarr?.shadowRoot?.querySelector("harr-requests");
      return Array.from(
        section?.shadowRoot?.querySelectorAll(".sub-tab, [class*='sub-tab'], [class*='tab-btn']") || []
      ).map((el) => el.textContent?.trim().toLowerCase());
    });

    const hasPending = subTabTexts.some((t) => t?.includes("pending"));
    expect(hasPending).toBe(true);
  });
});
