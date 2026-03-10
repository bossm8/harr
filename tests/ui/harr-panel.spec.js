/**
 * Tests for harr-panel.js — tab navigation and panel rendering.
 *
 * Requires the HA devcontainer to be running at http://localhost:8123
 * with the harr integration configured.
 */
const { test, expect, HA_URL } = require("./fixtures");

test.describe("Harr Panel — tab navigation", () => {
  test("panel mounts and shows at least one tab", async ({ harrPage: page }) => {
    // The root custom element must be present
    const panel = await page.$("ha-harr");
    expect(panel).not.toBeNull();

    // At least one tab button must be visible
    const tab = await page.evaluateHandle(() =>
      window.__haHarr?.shadowRoot?.querySelector(".tab")
    );
    expect(tab).not.toBeNull();
  });

  test("clicking a tab switches the active section", async ({ harrPage: page }) => {
    // Get all tab buttons and click the second one
    const tabs = await page.evaluateHandle(() =>
      Array.from(
        window.__haHarr?.shadowRoot?.querySelectorAll(".tab") || []
      )
    );

    const tabCount = await page.evaluate(
      (t) => t.length,
      tabs
    );

    if (tabCount > 1) {
      // Click the second tab
      await page.evaluate((t) => t[1].click(), tabs);
      await page.waitForTimeout(300);

      const activeClass = await page.evaluate(
        (t) => t[1].classList.contains("active"),
        tabs
      );
      expect(activeClass).toBe(true);
    }
  });

  test("browser back button returns to previous page", async ({ page }) => {
    // Establish a history entry at HA root before navigating to the panel
    await page.goto(HA_URL);
    await page.goto(`${HA_URL}/harr`);
    await page.waitForSelector("ha-harr", { timeout: 15_000 });

    await page.goBack();
    await page.waitForTimeout(500);
    // Should be back on HA (not about:blank or a crash page)
    expect(page.url()).toContain(new URL(HA_URL).host);
  });
});

test.describe("Harr Panel — mobile layout", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("renders on mobile viewport without overflow", async ({ harrPage: page }) => {
    const panel = await page.$("ha-harr");
    expect(panel).not.toBeNull();

    // Check there's no horizontal scroll
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const clientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5); // 5px tolerance
  });
});
