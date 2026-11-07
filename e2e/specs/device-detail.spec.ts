import { expect, test } from "@playwright/test";
import { DeviceDetailPage } from "../pages/device-detail";
import { DevicesPage } from "../pages/devices";

// Feature 122: the /devices/:entityId page over the mock house.
test.describe("device detail on a tablet (1280x800)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("from the list, a device opens its page, the switch flips the state, and BACK returns to the list", async ({ page }) => {
    const devices = new DevicesPage(page);
    await devices.open();
    await devices.row("Office desk light").click();

    const detail = new DeviceDetailPage(page);
    await expect(page).toHaveURL(/\/devices\/light\.office_desk$/);
    await expect(detail.title()).toBeVisible();
    await expect(detail.stateText()).toHaveText("ON");

    await detail.power("Office desk light").click();
    await expect(detail.stateText()).toHaveText("OFF");

    await detail.backLink().click();
    await expect(page).toHaveURL(/\/devices$/);
    await expect(devices.rows()).toHaveCount(26);
  });

  test("a deep link to a numeric sensor shows its history, and 7D changes the range", async ({ page }) => {
    const detail = new DeviceDetailPage(page);
    await detail.open("/devices/sensor.house_power");
    await expect(detail.history()).toBeVisible();
    await expect(detail.history()).toHaveAttribute("aria-label", /24H/);

    await detail.range("7D").click();
    await expect(detail.history()).toHaveAttribute("aria-label", /7D/);
  });

  test("an unknown device shows DEVICE NOT FOUND, keeps its URL, and the back link works", async ({ page }) => {
    const detail = new DeviceDetailPage(page);
    await detail.open("/devices/light.does_not_exist");
    await expect(detail.notFound()).toBeVisible();
    await expect(page).toHaveURL(/\/devices\/light\.does_not_exist$/);

    await detail.backLink().click();
    await expect(page).toHaveURL(/\/devices$/);
  });

  test("a history endpoint that is missing shows HISTORY NOT AVAILABLE", async ({ page }) => {
    const detail = new DeviceDetailPage(page);
    await detail.open("/devices/sensor.house_power", "?mock=no-history");
    await expect(detail.historyNotAvailable()).toBeVisible();
  });

  test("a failed action rolls the switch back and shows the error toast", async ({ page }) => {
    const detail = new DeviceDetailPage(page);
    await detail.open("/devices/light.office_desk", "?mock=action-error");
    await expect(detail.stateText()).toHaveText("ON");

    await detail.power("Office desk light").click();
    await expect(detail.toast("Could not update Office desk light")).toBeVisible();
    await expect(detail.stateText()).toHaveText("ON");
  });
});
