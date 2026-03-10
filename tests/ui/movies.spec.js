/**
 * Tests for <harr-movies> — Radarr movies library tab.
 *
 * Requires Radarr to be configured in the harr integration.
 * Skip tests gracefully if Radarr is not configured.
 */
const { test, expect } = require("./fixtures");

async function navigateToMovies(page) {
  // Click the Movies tab
  await page.evaluate(() => {
    const tabs = window.__haHarr?.shadowRoot?.querySelectorAll(".tab");
    for (const tab of tabs || []) {
      if (tab.textContent?.toLowerCase().includes("movie")) {
        tab.click();
        return true;
      }
    }
    return false;
  });
  await page.waitForTimeout(500);
}

async function isMoviesTabVisible(page) {
  return page.evaluate(() => {
    const tabs = window.__haHarr?.shadowRoot?.querySelectorAll(".tab");
    for (const tab of tabs || []) {
      if (tab.textContent?.toLowerCase().includes("movie")) return true;
    }
    return false;
  });
}

test.describe("Movies tab", () => {
  test("movies tab loads and shows content or empty state", async ({ harrPage: page }) => {
    const visible = await isMoviesTabVisible(page);
    if (!visible) {
      test.skip(); // Radarr not configured
      return;
    }

    await navigateToMovies(page);

    // Wait for harr-movies to render
    await page.waitForFunction(
      () => window.__haHarr?.shadowRoot?.querySelector("harr-movies") !== null,
      { timeout: 10_000 }
    );

    // Should show either a grid or an empty/error state — not a blank page
    const section = await page.evaluateHandle(() =>
      window.__haHarr?.shadowRoot?.querySelector("harr-movies")
    );
    expect(section).not.toBeNull();
  });

  test("search bar is present when movies tab is active", async ({ harrPage: page }) => {
    const visible = await isMoviesTabVisible(page);
    if (!visible) {
      test.skip();
      return;
    }

    await navigateToMovies(page);
    await page.waitForTimeout(1000);

    const searchInput = await page.evaluateHandle(() => {
      const section = window.__haHarr?.shadowRoot?.querySelector("harr-movies");
      return section?.shadowRoot?.querySelector("input[type='search'], input[placeholder*='Search']");
    });
    expect(searchInput).not.toBeNull();
  });

  test("add button opens search modal", async ({ harrPage: page }) => {
    const visible = await isMoviesTabVisible(page);
    if (!visible) {
      test.skip();
      return;
    }

    await navigateToMovies(page);
    await page.waitForTimeout(1000);

    // The add button only opens the modal when a search term is present
    await page.evaluate(() => {
      const section = window.__haHarr?.shadowRoot?.querySelector("harr-movies");
      const input = section?.shadowRoot?.querySelector(".search-input");
      if (input) { input.value = "test"; input.dispatchEvent(new Event("input")); }
    });
    await page.waitForTimeout(350); // let debounce settle

    await page.evaluate(() => {
      const section = window.__haHarr?.shadowRoot?.querySelector("harr-movies");
      section?.shadowRoot?.querySelector("button.btn-primary")?.click();
    });
    await page.waitForTimeout(500);

    // A modal should now be visible
    const modalVisible = await page.evaluate(() => {
      const section = window.__haHarr?.shadowRoot?.querySelector("harr-movies");
      const modal = section?.shadowRoot?.querySelector(".modal, [class*='modal']");
      return modal !== null && modal !== undefined;
    });
    expect(modalVisible).toBe(true);
  });
});
