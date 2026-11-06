import { expect, test } from "@playwright/test";
import { DeviceCard, Toasts } from "../components/device-card";
import { HomePage } from "../pages/home";
import { TelemetryPage } from "../pages/telemetry";

// Feature 115: cleaned display names + inline aliases (mock mode, VITE_API_MODE=mock).
test.describe("display names", () => {
  test("renaming a device with Enter shows the alias and it survives reload", async ({ page }) => {
    const home = new HomePage(page);
    await home.open();
    await new DeviceCard(page, "Kitchen ceiling").rename("Cocina techo");

    const renamed = new DeviceCard(page, "Cocina techo");
    await expect(renamed.card()).toBeVisible();

    await page.reload();
    await expect(new DeviceCard(page, "Cocina techo").card()).toBeVisible();
  });

  test("Escape cancels a rename and returns focus to the pencil", async ({ page }) => {
    const home = new HomePage(page);
    await home.open();
    const kitchen = new DeviceCard(page, "Kitchen ceiling");
    await kitchen.startRename().click();
    await kitchen.nameInput().fill("No aplicar");
    await kitchen.nameInput().press("Escape");

    await expect(kitchen.card()).toBeVisible();
    await expect(kitchen.startRename()).toBeFocused();
  });

  test("an empty name resets the alias to the cleaned name", async ({ page }) => {
    const home = new HomePage(page);
    await home.open();
    await new DeviceCard(page, "Kitchen ceiling").rename("Cocina techo");
    await new DeviceCard(page, "Cocina techo").rename("");

    await expect(new DeviceCard(page, "Kitchen ceiling").card()).toBeVisible();
  });

  test("renaming a sensor chart card updates its title", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open();
    await page.getByRole("button", { name: "Rename Living room temperature" }).click();
    await page.getByRole("textbox", { name: "Name for sensor.living_room_temperature" }).fill("Salon temperatura");
    await page.getByRole("textbox", { name: "Name for sensor.living_room_temperature" }).press("Enter");

    await expect(telemetry.chartCard("Salon temperatura")).toBeVisible();
  });

  test("a failed save rolls back and shows a toast", async ({ page }) => {
    const home = new HomePage(page);
    await home.open("?mock=alias-error");
    const kitchen = new DeviceCard(page, "Kitchen ceiling");
    await kitchen.rename("Cocina techo");

    await expect(new Toasts(page).region()).toContainText("Could not rename Kitchen ceiling");
    await expect(kitchen.card()).toBeVisible();
  });

  test("raw HA names render cleaned, with the raw name as tooltip", async ({ page }) => {
    const telemetry = new TelemetryPage(page);
    await telemetry.open("?mock=raw-names");

    await expect(telemetry.chartCard("Velocidad de descarga")).toBeVisible();
    await expect(page.getByTitle("RT-AC65P Velocidad de descarga (sensor.rt_ac65p_download_speed)")).toBeVisible();
  });
});
