/**
 * Tests for <harr-calendar> — Radarr + Sonarr release calendar.
 *
 * Requires at least Radarr or Sonarr configured in harr.
 */
const { test, expect } = require("./fixtures");

async function isCalendarTabVisible(page) {
  return page.evaluate(() => {
    const tabs = window.__haHarr?.shadowRoot?.querySelectorAll(".tab");
    for (const tab of tabs || []) {
      if (tab.textContent?.toLowerCase().includes("calendar")) return true;
    }
    return false;
  });
}

async function navigateToCalendar(page) {
  await page.evaluate(() => {
    const tabs = window.__haHarr?.shadowRoot?.querySelectorAll(".tab");
    for (const tab of tabs || []) {
      if (tab.textContent?.toLowerCase().includes("calendar")) {
        tab.click();
        return;
      }
    }
  });
  await page.waitForTimeout(800);
}

test.describe("Calendar tab", () => {
  test("calendar renders a monthly grid", async ({ harrPage: page }) => {
    const visible = await isCalendarTabVisible(page);
    if (!visible) {
      test.skip();
      return;
    }

    await navigateToCalendar(page);

    await page.waitForFunction(
      () => window.__haHarr?.shadowRoot?.querySelector("harr-calendar") !== null,
      { timeout: 10_000 }
    );

    // A calendar grid with day cells should be present
    const hasCells = await page.evaluate(() => {
      const section = window.__haHarr?.shadowRoot?.querySelector("harr-calendar");
      const cells = section?.shadowRoot?.querySelectorAll(".cal-day");
      return (cells?.length || 0) >= 28; // At least 4 weeks
    });
    expect(hasCells).toBe(true);
  });

  test("previous/next month buttons navigate months", async ({ harrPage: page }) => {
    const visible = await isCalendarTabVisible(page);
    if (!visible) {
      test.skip();
      return;
    }

    await navigateToCalendar(page);
    await page.waitForTimeout(1000);

    // Get current month heading
    const initialMonth = await page.evaluate(() => {
      const section = window.__haHarr?.shadowRoot?.querySelector("harr-calendar");
      return section?.shadowRoot?.querySelector(".month-label")?.textContent?.trim();
    });

    // Click next month
    await page.evaluate(() => {
      const section = window.__haHarr?.shadowRoot?.querySelector("harr-calendar");
      const nextBtn = section?.shadowRoot?.querySelector("button[class*='next'], button:last-of-type");
      nextBtn?.click();
    });
    await page.waitForTimeout(300);

    const nextMonth = await page.evaluate(() => {
      const section = window.__haHarr?.shadowRoot?.querySelector("harr-calendar");
      return section?.shadowRoot?.querySelector(".month-label")?.textContent?.trim();
    });

    expect(nextMonth).not.toEqual(initialMonth);
  });

  test("filter buttons toggle release types", async ({ harrPage: page }) => {
    const visible = await isCalendarTabVisible(page);
    if (!visible) {
      test.skip();
      return;
    }

    await navigateToCalendar(page);
    await page.waitForTimeout(1000);

    // Filter buttons should be present
    const filterCount = await page.evaluate(() => {
      const section = window.__haHarr?.shadowRoot?.querySelector("harr-calendar");
      return (
        section?.shadowRoot?.querySelectorAll(".filter-btn, [class*='filter']")?.length || 0
      );
    });
    expect(filterCount).toBeGreaterThan(0);
  });
});
