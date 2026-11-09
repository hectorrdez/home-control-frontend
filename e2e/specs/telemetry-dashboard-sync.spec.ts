import { expect, test } from "@playwright/test";
import { TelemetryPage } from "../pages/telemetry";

// Feature 135: the telemetry chart layout is the shared setting telemetry.widgets (mock house, VITE_API_MODE=mock).
const LIVING = "Living room temperature";
const HUMIDITY = "Kitchen humidity";
const WIDGET_KEY = "hc.telemetry.widgets.v1";

test.describe("telemetry dashboard layout sync", () => {
  test("a layout saved in localStorage before sync is imported once", async ({ page }) => {
    await page.addInitScript(
      ([key, payload]) => {
        if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, payload);
      },
      [
        WIDGET_KEY,
        JSON.stringify({
          version: 1,
          widgets: [
            { id: "widget.sensor.living_room_temperature", entityId: "sensor.living_room_temperature", kind: "area", visible: false, order: 0 },
          ],
        }),
      ],
    );
    const telemetry = new TelemetryPage(page);
    await telemetry.open();
    await expect(telemetry.chartCard(HUMIDITY)).toBeVisible();
    await expect(telemetry.chartCard(LIVING)).toHaveCount(0);
  });

  test("another device hiding the first chart removes it live, without a reload", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open("?mock=remote-settings");
    await telemetry.openChartsPanel();
    const first = telemetry.chartToggles().first();
    const label = (await first.getAttribute("aria-label"))?.replace(/^Show /, "") ?? "";
    expect(label).not.toBe("");
    await expect(first).not.toBeChecked({ timeout: 3000 });
    await expect(telemetry.chartCard(label)).toHaveCount(0);
  });

  test("a chart hidden in the CHARTS panel stays hidden after a reload", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open();
    await telemetry.openChartsPanel();
    await telemetry.chartToggle(HUMIDITY).click();
    await expect(telemetry.chartToggle(HUMIDITY)).not.toBeChecked();
    await expect(telemetry.chartCard(HUMIDITY)).toHaveCount(0);

    await page.reload();
    await expect(telemetry.chartCard(LIVING)).toBeVisible();
    await expect(telemetry.chartCard(HUMIDITY)).toHaveCount(0);
  });
});
