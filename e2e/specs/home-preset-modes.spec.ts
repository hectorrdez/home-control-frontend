import { expect, test } from "@playwright/test";
import { DeviceDetailPage } from "../pages/device-detail";
import { HomePage } from "../pages/home";

// Feature 143: a cover with a saved position gets MODES on the Home 3D panel; picking it runs the position.
test.describe("MODES on Home 3D (1280x800)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("save HALF on the device page, then run it from MODES on Home", async ({ page }) => {
    const detail = new DeviceDetailPage(page);
    const home = new HomePage(page);

    await detail.open("/devices/cover.salon_blind", "?mock=cover-presets");
    await detail.presetName().fill("HALF");
    await detail.setPresetPercent(50);
    await detail.savePresetButton().click();
    await expect(detail.savedPositions().getByText("50%")).toBeVisible();

    await detail.navigation.goTo("Home 3D");
    await expect(home.modesButton("Salon blind")).toBeVisible();
    await home.modesButton("Salon blind").click();
    await home.modesMenuItem("HALF 50%").click();
    await expect(home.deviceCard("Salon blind").getByText("50% OPEN (EST.)")).toBeVisible({ timeout: 10_000 });
  });

  test("a cover without saved positions shows no MODES", async ({ page }) => {
    const home = new HomePage(page);
    await home.open("?mock=cover-presets");
    await expect(home.deviceCard("Bedroom blinds")).toBeVisible();
    await expect(home.modesButton("Bedroom blinds")).toHaveCount(0);
  });
});
