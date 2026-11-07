import { expect, test } from "@playwright/test";
import { DevicesPage } from "../pages/devices";
import { HomePage } from "../pages/home";

// Features 121/123: the /devices list over the mock house (20 devices: 9 interactive, 11 read-only).
test.describe("devices list on a tablet (1280x800)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Home reaches the list through the nav; search, kind filter and clear work", async ({ page }) => {
    const home = new HomePage(page);
    await home.open();
    await home.navigation.goTo("Devices");

    const devices = new DevicesPage(page);
    await expect(page).toHaveURL(/\/devices$/);
    await expect(home.navigation.currentDestination()).toHaveText("Devices");
    await expect(devices.shown()).toHaveText("20 OF 20");

    await devices.search().fill("front door");
    await expect(devices.rows()).toHaveCount(1);
    await expect(devices.row("Front door")).toHaveAttribute("href", "/devices/lock.front_door");
    await expect(devices.shown()).toHaveText("1 OF 20");

    await devices.clear().click();
    await devices.pill("Kind", "READ-ONLY").click();
    await expect(devices.rows()).toHaveCount(11);
    await devices.clear().click();
    await expect(devices.shown()).toHaveText("20 OF 20");

    await devices.search().fill("office_desk_power");
    await expect(devices.rows()).toHaveCount(1);
    await expect(devices.row("Desk plug")).toHaveAttribute("href", "/devices/office~desk_plug");
    await devices.clear().click();
  });

  test("the page does not scroll sideways and the filters sit left of the list", async ({ page }) => {
    const devices = new DevicesPage(page);
    await devices.open();
    await expect(devices.rows()).toHaveCount(20);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    const filters = await devices.filters().boundingBox();
    const list = await devices.list().boundingBox();
    expect(filters && list).toBeTruthy();
    expect(filters!.x + filters!.width).toBeLessThanOrEqual(list!.x);
  });

  test("raw HA names collapse to one row per device, cleaned, with no Battery row", async ({ page }) => {
    const devices = new DevicesPage(page);
    await devices.open("?mock=raw-names");
    await expect(devices.rows()).toHaveCount(24);
    await expect(devices.row("Encerrado en el patio")).toHaveCount(1);
    await expect(devices.rows().filter({ hasText: /Batería|Battery/ })).toHaveCount(0);
  });

  test("the Home 3D All devices link opens the list", async ({ page }) => {
    const home = new HomePage(page);
    await home.open();
    await page.getByRole("link", { name: "All devices", exact: true }).click();
    await expect(page).toHaveURL(/\/devices$/);
    await expect(new DevicesPage(page).rows()).toHaveCount(20);
  });
});

test.describe("devices list on a phone (390x844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the bottom rail reaches the list and rows stack in one column", async ({ page }) => {
    const home = new HomePage(page);
    await home.open();
    await home.navigation.goTo("Devices");

    const devices = new DevicesPage(page);
    await expect(devices.rows()).toHaveCount(20);
    await expect(home.navigation.currentDestination()).toHaveText("Devices");

    const first = await devices.rows().nth(0).boundingBox();
    const second = await devices.rows().nth(1).boundingBox();
    expect(first && second).toBeTruthy();
    expect(Math.abs(first!.x - second!.x)).toBeLessThan(1);
    expect(second!.y).toBeGreaterThan(first!.y);
  });
});

test.describe("devices list states", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("an empty house shows NO DEVICES", async ({ page }) => {
    const devices = new DevicesPage(page);
    await devices.open("?mock=empty");
    await expect(page.getByRole("status").filter({ hasText: "NO DEVICES" })).toBeVisible();
    await expect(devices.rows()).toHaveCount(0);
  });

  test("a failed load shows ERROR and RETRY", async ({ page }) => {
    const devices = new DevicesPage(page);
    await devices.open("?mock=error");
    const alert = page.getByRole("alert");
    await expect(alert.getByText("Could not load devices.")).toBeVisible();
    await expect(alert.getByText("ERROR", { exact: true })).toBeVisible();
    await expect(alert.getByRole("button", { name: "RETRY", exact: true })).toBeVisible();
  });
});
