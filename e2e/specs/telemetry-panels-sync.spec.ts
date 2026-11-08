import { expect, test } from "@playwright/test";
import { TelemetryPage } from "../pages/telemetry";

// Feature 136: the telemetry fixed-panel visibility is the shared setting telemetry.panels (mock house, VITE_API_MODE=mock).
const PANELS_KEY = "hc.telemetry.panels.v1";

test.describe("telemetry fixed panels sync", () => {
  test("a fixed panel hidden in localStorage before sync is imported once", async ({ page }) => {
    await page.addInitScript(
      ([key, payload]) => {
        if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, payload);
      },
      [PANELS_KEY, JSON.stringify({ v: 1, hidden: ["kpi:air"], seen: [] })],
    );
    const telemetry = new TelemetryPage(page);
    await telemetry.open();
    await expect(telemetry.kpi("Climate mean")).toBeVisible();
    await expect(telemetry.kpi("Air quality")).toHaveCount(0);
  });

  test("a fixed panel hidden and shown in the CHARTS panel keeps its state after a reload", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open();
    await telemetry.openChartsPanel();
    await telemetry.fixedPanelToggle("Air quality").click();
    await expect(telemetry.fixedPanelToggle("Air quality")).not.toBeChecked();
    await expect(telemetry.kpi("Air quality")).toHaveCount(0);

    await page.reload();
    await expect(telemetry.kpi("Climate mean")).toBeVisible();
    await expect(telemetry.kpi("Air quality")).toHaveCount(0);

    await telemetry.openChartsPanel();
    await telemetry.fixedPanelToggle("Air quality").click();
    await expect(telemetry.fixedPanelToggle("Air quality")).toBeChecked();
    await page.reload();
    await expect(telemetry.kpi("Air quality")).toBeVisible();
  });
});
