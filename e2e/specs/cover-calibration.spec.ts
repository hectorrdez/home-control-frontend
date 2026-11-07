import { expect, test } from "@playwright/test";
import { DeviceDetailPage } from "../pages/device-detail";

// Feature 127: a cover without position feedback is calibrated from its device page, then moved to a percentage.
test.describe("cover calibration on a tablet (1280x800)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("calibrate the cover, then move it to 50 %", async ({ page }) => {
    const detail = new DeviceDetailPage(page);
    await detail.open("/devices/cover.salon_blind", "?mock=cover-calibration");
    await expect(detail.title()).toHaveText("Salon blind");

    // Before calibration the cover only has SHUT / STOP / OPEN.
    await expect(detail.coverSlider()).toHaveCount(0);
    await detail.calibrate().click();
    await detail.calibrationPanel().getByRole("button", { name: "START", exact: true }).click();
    await detail.finishMeasuredLeg(); // step 1: the cover closes
    await detail.finishMeasuredLeg(); // step 2: the cover opens
    await detail.calibrationPanel().getByRole("button", { name: "SAVE", exact: true }).click();
    await expect(detail.calibrationPanel().getByText(/^CALIBRATED \/\/ CLOSE/)).toBeVisible();

    // A calibrated cover reports an unknown position: only the ends can be sent until it has moved to one.
    await expect(page.getByText("POSITION UNKNOWN: move to an end first")).toBeVisible();
    await detail.coverPresetButton("SHUT (0%)").click();
    await expect(page.getByText("0% OPEN (EST.)")).toBeVisible({ timeout: 10_000 });

    // From a known position the slider moves to 50 %.
    await detail.coverSlider().fill("50");
    await detail.coverSlider().press("Tab");
    await expect(page.getByText("50% OPEN (EST.)")).toBeVisible({ timeout: 10_000 });
  });
});
