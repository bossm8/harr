/**
 * Tests for <harr-downloads> — qBittorrent + SABnzbd downloads tab.
 *
 * Requires at least one download client configured in harr.
 * Tests gracefully skip if neither is configured.
 */
const { test, expect } = require("./fixtures");

async function isDownloadsTabVisible(page) {
  return page.evaluate(() => {
    const tabs = window.__haHarr?.shadowRoot?.querySelectorAll(".tab");
    for (const tab of tabs || []) {
      if (tab.textContent?.toLowerCase().includes("download")) return true;
    }
    return false;
  });
}

async function navigateToDownloads(page) {
  await page.evaluate(() => {
    const tabs = window.__haHarr?.shadowRoot?.querySelectorAll(".tab");
    for (const tab of tabs || []) {
      if (tab.textContent?.toLowerCase().includes("download")) {
        tab.click();
        return;
      }
    }
  });
  await page.waitForTimeout(500);
}

test.describe("Downloads tab", () => {
  test("downloads tab renders when a client is configured", async ({ harrPage: page }) => {
    const visible = await isDownloadsTabVisible(page);
    if (!visible) {
      test.skip();
      return;
    }

    await navigateToDownloads(page);

    await page.waitForFunction(
      () => window.__haHarr?.shadowRoot?.querySelector("harr-downloads") !== null,
      { timeout: 10_000 }
    );

    const section = await page.evaluateHandle(() =>
      window.__haHarr?.shadowRoot?.querySelector("harr-downloads")
    );
    expect(section).not.toBeNull();
  });

  test("sub-tabs (qBittorrent / SABnzbd) are visible", async ({ harrPage: page }) => {
    const visible = await isDownloadsTabVisible(page);
    if (!visible) {
      test.skip();
      return;
    }

    await navigateToDownloads(page);
    await page.waitForTimeout(1000);

    const subTabs = await page.evaluate(() => {
      const section = window.__haHarr?.shadowRoot?.querySelector("harr-downloads");
      return Array.from(section?.shadowRoot?.querySelectorAll(".sub-tab, [class*='sub-tab']") || []).map(
        (el) => el.textContent?.trim()
      );
    });

    // At least one sub-tab should exist
    expect(subTabs.length).toBeGreaterThan(0);
  });

  test("auto-refresh updates the download list", async ({ harrPage: page }) => {
    const visible = await isDownloadsTabVisible(page);
    if (!visible) {
      test.skip();
      return;
    }

    await navigateToDownloads(page);
    await page.waitForTimeout(1000);

    // Intercept API calls to verify polling happens
    let fetchCount = 0;
    page.on("request", (req) => {
      if (req.url().includes("/api/harr/qbittorrent") || req.url().includes("/api/harr/sabnzbd")) {
        fetchCount++;
      }
    });

    // Wait a bit over the 5-second refresh interval
    await page.waitForTimeout(6000);
    expect(fetchCount).toBeGreaterThan(0);
  });
});
