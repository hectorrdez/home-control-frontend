import { expect, test } from "@playwright/test";
import { TelemetryPage } from "../pages/telemetry";

// Feature 112: climate history and power bars on /telemetry, driven by the mock house (VITE_API_MODE=mock).
test.describe("telemetry history", () => {
  test("switching the range tab changes the climate summary", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open();

    await expect(telemetry.climateChart("All rooms")).toBeVisible();
    await telemetry.rangeTab("24H").click();
    await expect(telemetry.rangeTab("24H")).toHaveAttribute("aria-pressed", "true");
    const before = await telemetry.climateSummary().innerText();

    await telemetry.rangeTab("6H").click();
    await expect(telemetry.rangeTab("6H")).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => telemetry.climateSummary().innerText()).not.toBe(before);
  });

  test("selecting a room changes the chart label", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open();

    await telemetry.roomChip("Kitchen").click();

    await expect(telemetry.roomChip("Kitchen")).toHaveAttribute("aria-pressed", "true");
    await expect(telemetry.climateChart("Kitchen")).toBeVisible();
    await expect(telemetry.climateChart("All rooms")).toHaveCount(0);
  });

  test("the power bars show under the climate chart", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open();

    await expect(page.getByRole("img", { name: /House power hourly average watts over 24 hours/ })).toBeVisible();
  });

  // Feature 131: ALL ROOMS draws one line per room plus the total mean; one room draws one line.
  test("ALL ROOMS lists every room and the total mean in the legend", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open();
    await expect(telemetry.climateChart("All rooms")).toBeVisible();

    const rooms = await page.getByRole("group", { name: "Rooms" }).getByRole("button").allInnerTexts();
    const roomNames = rooms.filter((name) => name !== "ALL ROOMS");
    await expect(telemetry.chartLegend()).toHaveCount(roomNames.length + 1);
    for (const name of roomNames) {
      await expect(telemetry.chartLegend().filter({ hasText: name })).toHaveCount(1);
    }
    await expect(telemetry.chartLegend().filter({ hasText: "TOTAL MEAN" })).toHaveCount(1);
    // Rendered curves: one per room + total mean + humidity.
    await expect(telemetry.climateCurves("All rooms", "room-line")).toHaveCount(roomNames.length);
    await expect(telemetry.climateCurves("All rooms", "mean-line")).toHaveCount(1);
    await expect(telemetry.climateCurves("All rooms", "humidity-line")).toHaveCount(1);
  });

  test("selecting one room drops the legend and shows that room's chart", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open();
    await telemetry.roomChip("Kitchen").click();

    await expect(telemetry.climateChart("Kitchen")).toBeVisible();
    await expect(telemetry.chartLegend()).toHaveCount(0);
    // Room temperature area + humidity line only.
    await expect(telemetry.climateCurves("Kitchen", "humidity-line")).toHaveCount(1);
    // The area draws a fill and a stroke path, both tagged; it just has to be there.
    await expect(telemetry.climateCurves("Kitchen", "temp-area").first()).toBeAttached();
    await expect(telemetry.climateCurves("Kitchen", "room-line")).toHaveCount(0);
    await expect(telemetry.climateCurves("Kitchen", "mean-line")).toHaveCount(0);
  });

  for (const [label, width, height] of [["360px", 360, 800], ["768px", 768, 900], ["desktop", 1440, 900]] as const) {
    test(`at ${label} the card title does not overlap the room or range selectors`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      const telemetry = new TelemetryPage(page);
      await telemetry.open();
      await expect(telemetry.climateChart("All rooms")).toBeVisible();

      const title = await telemetry.climateTitle().boundingBox();
      expect(title).not.toBeNull();
      const selectors = page.getByRole("group", { name: /^(Rooms|Range)$/ }).getByRole("button");
      const count = await selectors.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const box = await selectors.nth(i).boundingBox();
        expect(box).not.toBeNull();
        const overlaps =
          box!.x < title!.x + title!.width &&
          box!.x + box!.width > title!.x &&
          box!.y < title!.y + title!.height &&
          box!.y + box!.height > title!.y;
        expect(overlaps).toBe(false);
      }
    });
  }

  test("a backend without the history endpoint shows HISTORY NOT AVAILABLE", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open("?mock=no-history");

    await expect(telemetry.historyNotAvailable().first()).toBeVisible();
    await expect(telemetry.climateChart("All rooms")).toHaveCount(0);
    // The live chart cards keep working without history.
    await expect(telemetry.chartCard("Living room temperature")).toBeVisible();
  });
});
