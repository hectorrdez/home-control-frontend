import { expect, test } from "@playwright/test";
import { TelemetryPage } from "../pages/telemetry";

// Feature 113: live recharts cards on /telemetry, driven by the mock house (VITE_API_MODE=mock).
const WIDGET_KEY = "hc.telemetry.widgets.v1";

test.describe("telemetry live charts", () => {
  test("shows a chart card per numeric sensor", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open();

    await expect(telemetry.chartCard("Living room temperature")).toBeVisible();
    await expect(telemetry.chartCard("Kitchen humidity")).toBeVisible();
    await expect(telemetry.chartCard("House power")).toBeVisible();
    await expect(telemetry.chartCard("PM2.5")).toBeVisible();
  });

  test("a temperature card keeps updating while the mock stream drifts", async ({ page }) => {
    test.setTimeout(90_000);
    const telemetry = new TelemetryPage(page);
    await telemetry.open();

    const card = telemetry.chartCard("Living room temperature");
    const before = await card.innerText();
    await expect.poll(() => card.innerText(), { timeout: 60_000 }).not.toBe(before);
  });

  test("a widget hidden in localStorage is not rendered after reload", async ({ page }) => {
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

    await expect(telemetry.chartCard("Kitchen humidity")).toBeVisible();
    await expect(telemetry.chartCard("Living room temperature")).toHaveCount(0);

    await page.reload();
    await expect(telemetry.chartCard("Kitchen humidity")).toBeVisible();
    await expect(telemetry.chartCard("Living room temperature")).toHaveCount(0);
  });

  test("the empty house shows no charts", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open("?mock=empty");

    await expect(page.getByText("NO SENSORS")).toBeVisible();
    await expect(page.getByRole("region", { name: "Living room temperature", exact: true })).toHaveCount(0);
  });
});
