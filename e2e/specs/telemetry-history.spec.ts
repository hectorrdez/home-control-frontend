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

  test("a backend without the history endpoint shows HISTORY NOT AVAILABLE", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open("?mock=no-history");

    await expect(telemetry.historyNotAvailable().first()).toBeVisible();
    await expect(telemetry.climateChart("All rooms")).toHaveCount(0);
    // The live chart cards keep working without history.
    await expect(telemetry.chartCard("Living room temperature")).toBeVisible();
  });
});
