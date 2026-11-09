import { expect, test } from "@playwright/test";
import { DeviceDetailPage } from "../pages/device-detail";

// Feature 142: a calibrated cover saves a named position on its device page and applies it from the list.
test.describe("saved positions on a tablet (1280x800)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("save HALF at 50 %, reject a duplicate, apply it, then delete it", async ({ page }) => {
    const detail = new DeviceDetailPage(page);
    await detail.open("/devices/cover.salon_blind", "?mock=cover-presets");
    await expect(detail.title()).toHaveText("Salon blind");
    await expect(page.getByRole("heading", { name: "SAVED POSITIONS" })).toBeVisible();

    await detail.presetName().fill("HALF");
    await detail.setPresetPercent(50);
    await detail.savePresetButton().click();
    await expect(detail.savedPositions().getByText("50%")).toBeVisible();

    // Names are unique per cover, case-insensitive.
    await detail.presetName().fill("half");
    await detail.savePresetButton().click();
    await expect(page.getByRole("alert")).toHaveText("NAME ALREADY USED");

    // Applying the saved 50 % moves the calibrated cover (4 s per leg, so about 2 s here).
    await page.getByRole("button", { name: "Apply HALF 50%" }).click();
    await expect(page.getByText("50% OPEN (EST.)")).toBeVisible({ timeout: 10_000 });

    await detail.savedPositions().getByRole("button", { name: "DELETE", exact: true }).click();
    await page.getByRole("button", { name: "YES", exact: true }).click();
    await expect(page.getByText("NO SAVED POSITIONS")).toBeVisible();
  });
});
