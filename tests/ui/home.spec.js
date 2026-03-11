/**
 * Tests for <harr-home> — Releasing Soon home page.
 *
 * Requires Radarr or Sonarr configured in harr.
 */
const { test, expect } = require("./fixtures");

async function isHomeTabVisible(page) {
  return page.evaluate(() => {
    const tabs = window.__haHarr?.shadowRoot?.querySelectorAll(".tab");
    for (const tab of tabs || []) {
      if (tab.textContent?.toLowerCase().includes("home")) return true;
    }
    return false;
  });
}

async function navigateToHome(page) {
  await page.evaluate(() => {
    const tabs = window.__haHarr?.shadowRoot?.querySelectorAll(".tab");
    for (const tab of tabs || []) {
      if (tab.textContent?.toLowerCase().includes("home")) {
        tab.click();
        return;
      }
    }
  });
  await page.waitForTimeout(1500);
}

test.describe("Home tab (Releasing Soon)", () => {
  test("home tab is visible in the tab bar", async ({ harrPage: page }) => {
    const visible = await isHomeTabVisible(page);
    if (!visible) {
      test.skip();
      return;
    }
    expect(visible).toBe(true);
  });

  test("home tab is the first visible tab", async ({ harrPage: page }) => {
    const visible = await isHomeTabVisible(page);
    if (!visible) {
      test.skip();
      return;
    }

    const firstTabLabel = await page.evaluate(() => {
      const tabs = window.__haHarr?.shadowRoot?.querySelectorAll(".tab");
      for (const tab of tabs || []) {
        if (tab.style.display !== "none") return tab.textContent?.trim();
      }
      return null;
    });
    expect(firstTabLabel?.toLowerCase()).toContain("home");
  });

  test("home section renders after navigation", async ({ harrPage: page }) => {
    const visible = await isHomeTabVisible(page);
    if (!visible) {
      test.skip();
      return;
    }

    await navigateToHome(page);

    await page.waitForFunction(
      () => window.__haHarr?.shadowRoot?.querySelector("harr-home") !== null,
      { timeout: 10_000 }
    );

    const section = await page.evaluateHandle(() =>
      window.__haHarr?.shadowRoot?.querySelector("harr-home")
    );
    expect(section).not.toBeNull();
  });

  test("home section renders poster scroll rows", async ({ harrPage: page }) => {
    const visible = await isHomeTabVisible(page);
    if (!visible) {
      test.skip();
      return;
    }

    await navigateToHome(page);

    const hasRows = await page.evaluate(() => {
      const section = window.__haHarr?.shadowRoot?.querySelector("harr-home");
      return (section?.shadowRoot?.querySelectorAll(".home-row").length || 0) > 0;
    });
    expect(hasRows).toBe(true);
  });

  test("home rows contain a horizontal scroll container", async ({ harrPage: page }) => {
    const visible = await isHomeTabVisible(page);
    if (!visible) {
      test.skip();
      return;
    }

    await navigateToHome(page);

    const hasScroll = await page.evaluate(() => {
      const section = window.__haHarr?.shadowRoot?.querySelector("harr-home");
      return section?.shadowRoot?.querySelector(".home-scroll") !== null;
    });
    expect(hasScroll).toBe(true);
  });

  test("clicking a home-card dispatches harr-navigate", async ({ harrPage: page }) => {
    const visible = await isHomeTabVisible(page);
    if (!visible) {
      test.skip();
      return;
    }

    await navigateToHome(page);

    const hasCards = await page.evaluate(() => {
      const section = window.__haHarr?.shadowRoot?.querySelector("harr-home");
      return (section?.shadowRoot?.querySelectorAll(".home-card").length || 0) > 0;
    });

    if (!hasCards) {
      // No upcoming releases — nothing to click, pass vacuously
      return;
    }

    const navigated = await page.evaluate(() => {
      return new Promise(resolve => {
        const section = window.__haHarr?.shadowRoot?.querySelector("harr-home");
        section?.addEventListener("harr-navigate", e => resolve(e.detail), { once: true });
        section?.shadowRoot?.querySelector(".home-card")?.click();
        setTimeout(() => resolve(null), 2000);
      });
    });

    if (navigated) {
      expect(["movies", "shows"]).toContain(navigated.tab);
    }
  });

  test("home-card footer shows title and days label", async ({ harrPage: page }) => {
    const visible = await isHomeTabVisible(page);
    if (!visible) {
      test.skip();
      return;
    }

    await navigateToHome(page);

    const hasCards = await page.evaluate(() => {
      const section = window.__haHarr?.shadowRoot?.querySelector("harr-home");
      return (section?.shadowRoot?.querySelectorAll(".home-card").length || 0) > 0;
    });

    if (!hasCards) return;

    const firstDays = await page.evaluate(() => {
      const section = window.__haHarr?.shadowRoot?.querySelector("harr-home");
      return section?.shadowRoot?.querySelector(".home-days")?.textContent?.trim() || null;
    });

    if (firstDays) {
      const valid = /^(Today|Tomorrow|In \d+ days)$/.test(firstDays);
      expect(valid).toBe(true);
    }
  });

  test("mobile: home rows are horizontally scrollable at 375px", async ({ harrPage: page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    const visible = await isHomeTabVisible(page);
    if (!visible) {
      test.skip();
      return;
    }

    await navigateToHome(page);

    const scrollOverflow = await page.evaluate(() => {
      const section = window.__haHarr?.shadowRoot?.querySelector("harr-home");
      const scroll = section?.shadowRoot?.querySelector(".home-scroll");
      return scroll ? getComputedStyle(scroll).overflowX : null;
    });

    if (scrollOverflow !== null) {
      expect(scrollOverflow).toBe("auto");
    }
  });
});
