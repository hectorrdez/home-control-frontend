import { expect, test } from "@playwright/test";
import { TelemetryPage } from "../pages/telemetry";

// Feature 114: edit mode on the live charts grid (mock house, VITE_API_MODE=mock). Layout persists in localStorage.
const HUMIDITY = "Kitchen humidity";

test.describe("telemetry dashboard editor", () => {
  test("EDIT shows the edit bars, DONE hides them, and a reload starts in view mode", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open();

    await expect(telemetry.editBar(HUMIDITY)).toHaveCount(0);
    await telemetry.editButton().click();
    await expect(telemetry.editButton()).toHaveText("DONE");
    await expect(telemetry.editBar(HUMIDITY)).toBeVisible();

    await telemetry.editButton().click();
    await expect(telemetry.editButton()).toHaveText("EDIT");
    await expect(telemetry.editBar(HUMIDITY)).toHaveCount(0);

    await telemetry.editButton().click();
    await expect(telemetry.editBar(HUMIDITY)).toBeVisible();
    await page.reload();
    await expect(telemetry.editButton()).toHaveText("EDIT");
    await expect(telemetry.editBar(HUMIDITY)).toHaveCount(0);
  });

  test("hiding a chart in edit mode removes it and the CHARTS panel restores it", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open();

    await telemetry.editButton().click();
    await telemetry.hideChart(HUMIDITY).click();
    await expect(telemetry.chartCard(HUMIDITY)).toHaveCount(0);

    await telemetry.openChartsPanel();
    await expect(telemetry.chartToggle(HUMIDITY)).not.toBeChecked();
    await telemetry.chartToggle(HUMIDITY).click();
    await expect(telemetry.chartToggle(HUMIDITY)).toBeChecked();
    await expect(telemetry.chartCard(HUMIDITY)).toBeVisible();
  });

  test("move down swaps the first two charts, persists across reload, and disables move up on the first card", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open();
    await expect.poll(() => telemetry.chartOrder()).toHaveLength(16);
    const before = await telemetry.chartOrder();
    const [first, second] = before;

    await telemetry.editButton().click();
    await telemetry.moveDown(first).click();
    await expect.poll(() => telemetry.chartOrder()).toEqual([second, first, ...before.slice(2)]);
    await expect(telemetry.moveUp(second)).toBeDisabled();

    await page.reload();
    await expect.poll(() => telemetry.chartOrder()).toEqual([second, first, ...before.slice(2)]);
    await telemetry.editButton().click();
    await expect(telemetry.moveUp(second)).toBeDisabled();
  });

  test("chart type and wide changes persist across reload", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open();

    await telemetry.editButton().click();
    await telemetry.chartType(HUMIDITY, "LINE").click();
    await telemetry.wideToggle(HUMIDITY).click();
    await expect(telemetry.chartType(HUMIDITY, "LINE")).toHaveAttribute("aria-pressed", "true");

    await page.reload();
    await telemetry.editButton().click();
    await expect(telemetry.chartType(HUMIDITY, "LINE")).toHaveAttribute("aria-pressed", "true");
    await expect(telemetry.chartType(HUMIDITY, "GAUGE")).toHaveAttribute("aria-pressed", "false");
    await expect(telemetry.wideToggle(HUMIDITY)).toHaveAttribute("aria-pressed", "true");
  });

  test("RESET LAYOUT cancel keeps the changes, confirm restores the defaults", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open();
    await expect.poll(() => telemetry.chartOrder()).toHaveLength(16);

    // State that RESET LAYOUT must not touch: an alias (115), a fixed panel (125) and a CHARTS filter (118).
    await page.getByRole("button", { name: "Rename Living room temperature" }).click();
    const input = page.getByRole("textbox", { name: "Name for sensor.living_room_temperature" });
    await input.fill("Salon temperatura");
    await input.press("Enter");
    await expect(telemetry.chartCard("Salon temperatura")).toBeVisible();
    await telemetry.openChartsPanel();
    await telemetry.fixedPanelToggle("HVAC filter life").click();
    await telemetry.chartFilter("Zones", "OFFICE").click();
    await expect(telemetry.chartFilter("Zones", "OFFICE")).toHaveAttribute("aria-pressed", "true");
    const filteredToggles = await telemetry.chartToggles().count();
    await page.keyboard.press("Escape");
    await expect(telemetry.gauge("HVAC filter life")).toBeVisible();
    const initial = await telemetry.chartOrder();

    await telemetry.editButton().click();
    await telemetry.moveDown(initial[0]).click();
    await telemetry.hideChart(HUMIDITY).click();
    await expect(telemetry.chartCard(HUMIDITY)).toHaveCount(0);
    const changed = await telemetry.chartOrder();

    await telemetry.resetLayout().click();
    await telemetry.cancelReset().click();
    await expect(telemetry.chartCard(HUMIDITY)).toHaveCount(0);
    await expect.poll(() => telemetry.chartOrder()).toEqual(changed);

    await telemetry.resetLayout().click();
    await telemetry.confirmReset().click();
    await expect.poll(() => telemetry.chartOrder()).toEqual(initial);
    await expect(telemetry.chartType(HUMIDITY, "GAUGE")).toHaveAttribute("aria-pressed", "true");
    await expect(telemetry.wideToggle(HUMIDITY)).toHaveAttribute("aria-pressed", "false");

    // Alias, fixed panel and filter are unchanged.
    await expect(telemetry.chartCard("Salon temperatura")).toBeVisible();
    await expect(telemetry.chartCard("Living room temperature")).toHaveCount(0);
    await expect(telemetry.gauge("HVAC filter life")).toBeVisible();
    await telemetry.openChartsPanel();
    await expect(telemetry.fixedPanelToggle("HVAC filter life")).toBeChecked();
    await expect(telemetry.chartFilter("Zones", "OFFICE")).toHaveAttribute("aria-pressed", "true");
    await expect(telemetry.chartToggles()).toHaveCount(filteredToggles);
  });

  test("controls use the alias (display name) for chart cards, edit bars and the CHARTS panel", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open();
    await page.getByRole("button", { name: "Rename Living room temperature" }).click();
    const input = page.getByRole("textbox", { name: "Name for sensor.living_room_temperature" });
    await input.fill("Salon temperatura");
    await input.press("Enter");
    await expect(telemetry.chartCard("Salon temperatura")).toBeVisible();

    await telemetry.editButton().click();
    await expect(telemetry.editBar("Salon temperatura")).toBeVisible();
    await expect(telemetry.moveDown("Salon temperatura")).toBeVisible();
    await expect(page.getByRole("button", { name: "Move Living room temperature down", exact: true })).toHaveCount(0);

    await telemetry.hideChart("Salon temperatura").click();
    await expect(telemetry.chartCard("Salon temperatura")).toHaveCount(0);
    await telemetry.openChartsPanel();
    await expect(telemetry.chartToggle("Salon temperatura")).not.toBeChecked();
  });

  test("DONE cancels a pending RESET LAYOUT confirmation", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open();

    await telemetry.editButton().click();
    await telemetry.resetLayout().click();
    await expect(telemetry.confirmReset()).toBeVisible();

    await telemetry.editButton().click();
    await expect(telemetry.editButton()).toHaveText("EDIT");
    await telemetry.editButton().click();
    await expect(telemetry.resetLayout()).toBeVisible();
    await expect(telemetry.confirmReset()).toHaveCount(0);
    await expect(telemetry.cancelReset()).toHaveCount(0);
  });

  test("a saved kind the sensor does not offer leaves no chart type pill selected", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open();
    // Humidity is a % sensor: LINE/AREA/GAUGE are offered, a saved BAR is not.
    await expect.poll(async () => (await telemetry.savedWidgets()).length).toBeGreaterThan(0);
    const widgets = await telemetry.savedWidgets();
    await telemetry.setSavedWidgets(
      widgets.map((w) => (w.entityId === "sensor.kitchen_humidity" ? { ...w, kind: "bar" } : w)),
    );
    await page.reload();

    await telemetry.editButton().click();
    await expect(telemetry.chartType(HUMIDITY, "LINE")).toBeVisible();
    await expect(telemetry.chartType(HUMIDITY, "BAR")).toHaveCount(0);
    await expect(telemetry.pressedChartTypes(HUMIDITY)).toHaveCount(0);

    // Picking an offered kind fixes it.
    await telemetry.chartType(HUMIDITY, "AREA").click();
    await expect(telemetry.pressedChartTypes(HUMIDITY)).toHaveCount(1);
    await expect(telemetry.chartType(HUMIDITY, "AREA")).toHaveAttribute("aria-pressed", "true");
  });

  test("a removed sensor is dropped and a new sensor is appended on the next load", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open();
    await expect.poll(() => telemetry.chartOrder()).toHaveLength(16);

    // Simulate a saved layout made before the living-room sensor existed, plus one for a sensor that is gone.
    const widgets = await telemetry.savedWidgets();
    await telemetry.setSavedWidgets([
      ...widgets.filter((w) => w.entityId !== "sensor.living_room_temperature"),
      { id: "widget.sensor.gone", entityId: "sensor.gone", kind: "line", visible: true, order: 99 },
    ]);
    await page.reload();

    await expect.poll(() => telemetry.chartOrder()).toHaveLength(16);
    expect((await telemetry.chartOrder()).at(-1)).toBe("Living room temperature");
    await expect(page.getByRole("region", { name: "gone", exact: true })).toHaveCount(0);
  });

  test("an empty house offers no EDIT button", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open("?mock=empty");
    await expect(telemetry.editButton()).toHaveCount(0);
  });
});
