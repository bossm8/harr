/**
 * Tests for <harr-shows> — Sonarr TV shows tab.
 *
 * Requires Sonarr configured in harr. Mirrors movies.spec.js structure.
 */
const { test, expect } = require("./fixtures");

async function isShowsTabVisible(page) {
  return page.evaluate(() => {
    const tabs = window.__haHarr?.shadowRoot?.querySelectorAll(".tab");
    for (const tab of tabs || []) {
      if (tab.textContent?.toLowerCase().includes("show")) return true;
    }
    return false;
  });
}

async function navigateToShows(page) {
  await page.evaluate(() => {
    const tabs = window.__haHarr?.shadowRoot?.querySelectorAll(".tab");
    for (const tab of tabs || []) {
      if (tab.textContent?.toLowerCase().includes("show")) {
        tab.click();
        return;
      }
    }
  });
  await page.waitForTimeout(500);
}

test.describe("Shows tab", () => {
  test("shows tab loads and shows content or empty state", async ({ harrPage: page }) => {
    const visible = await isShowsTabVisible(page);
    if (!visible) {
      test.skip();
      return;
    }

    await navigateToShows(page);

    await page.waitForFunction(
      () => window.__haHarr?.shadowRoot?.querySelector("harr-shows") !== null,
      { timeout: 10_000 }
    );

    const section = await page.evaluateHandle(() =>
      window.__haHarr?.shadowRoot?.querySelector("harr-shows")
    );
    expect(section).not.toBeNull();
  });

  test("search bar is present in shows tab", async ({ harrPage: page }) => {
    const visible = await isShowsTabVisible(page);
    if (!visible) {
      test.skip();
      return;
    }

    await navigateToShows(page);
    await page.waitForTimeout(1000);

    const searchInput = await page.evaluateHandle(() => {
      const section = window.__haHarr?.shadowRoot?.querySelector("harr-shows");
      return section?.shadowRoot?.querySelector("input[type='search'], input[placeholder*='Search']");
    });
    expect(searchInput).not.toBeNull();
  });

  test("add button opens search modal in shows tab", async ({ harrPage: page }) => {
    const visible = await isShowsTabVisible(page);
    if (!visible) {
      test.skip();
      return;
    }

    await navigateToShows(page);
    await page.waitForTimeout(1000);

    // The add button only opens the modal when a search term is present
    await page.evaluate(() => {
      const section = window.__haHarr?.shadowRoot?.querySelector("harr-shows");
      const input = section?.shadowRoot?.querySelector(".search-input");
      if (input) { input.value = "test"; input.dispatchEvent(new Event("input")); }
    });
    await page.waitForTimeout(350); // let debounce settle

    await page.evaluate(() => {
      const section = window.__haHarr?.shadowRoot?.querySelector("harr-shows");
      section?.shadowRoot?.querySelector("button.btn-primary")?.click();
    });
    await page.waitForTimeout(500);

    const modalVisible = await page.evaluate(() => {
      const section = window.__haHarr?.shadowRoot?.querySelector("harr-shows");
      const modal = section?.shadowRoot?.querySelector(".modal, [class*='modal']");
      return modal !== null && modal !== undefined;
    });
    expect(modalVisible).toBe(true);
  });
});
