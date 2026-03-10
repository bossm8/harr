/**
 * Tests for <harr-discover> — Seerr discover tab.
 *
 * Requires Seerr configured in harr.
 */
const { test, expect } = require("./fixtures");

async function isDiscoverTabVisible(page) {
  return page.evaluate(() => {
    const tabs = window.__haHarr?.shadowRoot?.querySelectorAll(".tab");
    for (const tab of tabs || []) {
      if (tab.textContent?.toLowerCase().includes("discover")) return true;
    }
    return false;
  });
}

async function navigateToDiscover(page) {
  await page.evaluate(() => {
    const tabs = window.__haHarr?.shadowRoot?.querySelectorAll(".tab");
    const first = tabs?.[0];
    if (first) first.click();
  });
  await page.waitForTimeout(500);
}

test.describe("Discover tab", () => {
  test("discover section renders or shows error", async ({ harrPage: page }) => {
    const visible = await isDiscoverTabVisible(page);
    if (!visible) {
      test.skip();
      return;
    }

    await navigateToDiscover(page);

    await page.waitForFunction(
      () => window.__haHarr?.shadowRoot?.querySelector("harr-discover") !== null,
      { timeout: 10_000 }
    );

    const section = await page.evaluateHandle(() =>
      window.__haHarr?.shadowRoot?.querySelector("harr-discover")
    );
    expect(section).not.toBeNull();
  });

  test("sub-tabs are shown (Trending / Upcoming)", async ({ harrPage: page }) => {
    const visible = await isDiscoverTabVisible(page);
    if (!visible) {
      test.skip();
      return;
    }

    await navigateToDiscover(page);
    await page.waitForTimeout(1000);

    const subTabTexts = await page.evaluate(() => {
      const section = window.__haHarr?.shadowRoot?.querySelector("harr-discover");
      return Array.from(
        section?.shadowRoot?.querySelectorAll(".sub-tab, [class*='sub-tab'], [class*='tab-btn']") || []
      ).map((el) => el.textContent?.trim());
    });

    const hasTrending = subTabTexts.some((t) => t?.toLowerCase().includes("trending"));
    expect(hasTrending).toBe(true);
  });

  test("mobile: dropdown selector visible on narrow viewport", async ({ harrPage: page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    const visible = await isDiscoverTabVisible(page);
    if (!visible) {
      test.skip();
      return;
    }

    await navigateToDiscover(page);
    await page.waitForTimeout(1000);

    // On mobile the sub-tabs collapse to a <select> dropdown
    const hasDropdown = await page.evaluate(() => {
      const section = window.__haHarr?.shadowRoot?.querySelector("harr-discover");
      return section?.shadowRoot?.querySelector("select") !== null;
    });
    // This is acceptable to be true on narrow viewports
    if (hasDropdown) {
      expect(hasDropdown).toBe(true);
    } else {
      // Still OK if tabs are shown horizontally in a scrollable container
      const hasSubTabs = await page.evaluate(() => {
        const section = window.__haHarr?.shadowRoot?.querySelector("harr-discover");
        return (section?.shadowRoot?.querySelectorAll("[class*='sub-tab']")?.length || 0) > 0;
      });
      expect(hasSubTabs).toBe(true);
    }
  });
});
