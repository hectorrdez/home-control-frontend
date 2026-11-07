import { expect, test } from "@playwright/test";
import { TelemetryPage } from "../pages/telemetry";

// Feature 111: telemetry view driven by the mock house (VITE_API_MODE=mock).
test.describe("telemetry view", () => {
  test("shows the KPI cards with fixture values and the sensor gauges", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open();

    await expect(page.getByRole("heading", { name: "Telemetry & sensors" })).toBeVisible();
    await expect(telemetry.kpi("Climate mean")).toBeVisible();
    await expect(telemetry.kpi("Air quality")).toContainText("612");
    await expect(telemetry.kpi("Air quality")).toContainText("GOOD");
    await expect(telemetry.kpi("Power")).toContainText("1.24");
    await expect(telemetry.kpi("Nodes")).toContainText("26/26");
    // Feature 125: battery gauges start hidden; turn this one on from the CHARTS panel first.
    await telemetry.openChartsPanel();
    await telemetry.fixedPanelToggle("HVAC filter life").click();
    await page.keyboard.press("Escape");
    await expect(telemetry.gauge("HVAC filter life")).toBeVisible();
    await expect(page.getByRole("region", { name: "Climate history" })).toBeVisible();
  });

  test("a live state change appears at the top of the event feed", async ({ page }) => {
    test.setTimeout(90_000);
    const telemetry = new TelemetryPage(page);
    await telemetry.open();
    await telemetry.openEvents();

    // The mock flips binary_sensor.entry_motion on each 5 s stream tick (50% chance), so a change is expected within a few ticks.
    await expect(telemetry.feedItems().first()).toContainText("Entry motion", { timeout: 80_000 });
  });

  test("the event drawer closes with its button, by clicking outside, and with Escape", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open();
    const drawer = page.getByRole("complementary", { name: "Live event feed" });

    await telemetry.openEvents();
    await expect(drawer).toBeVisible();
    await page.getByRole("button", { name: "Close Live event feed" }).click();
    await expect(drawer).toBeHidden();

    await telemetry.openEvents();
    await expect(drawer).toBeVisible();
    await page.mouse.click(20, 300);
    await expect(drawer).toBeHidden();

    await telemetry.openEvents();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("shows the empty state when the house has no sensors", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open("?mock=empty");

    await expect(page.getByText("NO SENSORS")).toBeVisible();
  });
});
