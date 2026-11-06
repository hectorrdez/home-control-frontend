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

  test("the charts side panel hides and restores a chart", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open();

    await expect(telemetry.chartCard("Kitchen humidity")).toBeVisible();
    await telemetry.openChartsPanel();
    await telemetry.chartToggle("Kitchen humidity").click();
    await expect(telemetry.chartCard("Kitchen humidity")).toHaveCount(0);
    await telemetry.chartToggle("Kitchen humidity").click();
    await expect(telemetry.chartCard("Kitchen humidity")).toBeVisible();
  });

  test("the charts panel searches and filters, and filters reset on reload", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open();
    await telemetry.openChartsPanel();
    await expect(telemetry.chartsShown()).toHaveText("16 OF 16");

    await telemetry.chartSearch().fill("kitchen");
    await expect(telemetry.chartToggles()).toHaveCount(2);
    await telemetry.chartsClear().click();
    await expect(telemetry.chartsShown()).toHaveText("16 OF 16");
    await expect(telemetry.chartSearch()).toHaveValue("");

    await telemetry.chartFilter("Categories", "POWER").click();
    await telemetry.chartFilter("Zones", "OFFICE").click();
    await expect(telemetry.chartToggles()).toHaveCount(1);
    await expect(telemetry.chartToggle("Desk outlet power")).toBeVisible();

    await telemetry.chartToggle("Desk outlet power").click();
    await telemetry.chartFilter("Visibility", "OFF").click();
    await expect(telemetry.chartToggle("Desk outlet power")).toBeVisible();
    await telemetry.chartFilter("Visibility", "ON").click();
    await expect(telemetry.noMatches()).toBeVisible();

    await page.reload();
    await telemetry.openChartsPanel();
    await expect(telemetry.chartsShown()).toHaveText("16 OF 16");
    await expect(telemetry.chartsClear()).toBeDisabled();
    await expect(telemetry.chartToggle("Desk outlet power")).not.toBeChecked();

    await telemetry.chartFilter("Categories", "CO2").click();
    await telemetry.chartsNone().click();
    await expect(telemetry.chartToggle("CO2")).not.toBeChecked();
    await telemetry.chartsClear().click();
    await expect(telemetry.chartToggle("CO2")).not.toBeChecked();
    await expect(telemetry.chartToggle("Kitchen humidity")).toBeChecked();
  });

  test("the empty house shows no charts", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open("?mock=empty");

    await expect(page.getByText("NO SENSORS")).toBeVisible();
    await expect(page.getByRole("region", { name: "Living room temperature", exact: true })).toHaveCount(0);
  });
});
