import { expect, test } from "@playwright/test";
import { Navigation } from "../components/navigation";

test.describe("desktop shell", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("navigates between Home 3D and Telemetry with aria-current following", async ({ page }) => {
    const nav = new Navigation(page);
    await page.goto("/");
    await expect(nav.currentDestination()).toHaveText("Home 3D");

    await nav.goTo("Telemetry");
    await expect(page).toHaveURL(/\/telemetry$/);
    await expect(nav.currentDestination()).toHaveText("Telemetry");

    await nav.goTo("Home 3D");
    await expect(page).toHaveURL(/\/$/);
    await expect(nav.currentDestination()).toHaveText("Home 3D");
  });

  test("home renders the device panel and house view regions", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("region", { name: "Device panel" })).toBeVisible();
    await expect(page.getByRole("region", { name: "House view" })).toBeVisible();
  });
});

test.describe("handheld shell", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("shows the bottom rail and navigation works", async ({ page }) => {
    const nav = new Navigation(page);
    await page.goto("/");
    await expect(page.getByRole("navigation", { name: "Bottom navigation" })).toBeVisible();

    await nav.goTo("Telemetry");
    await expect(page).toHaveURL(/\/telemetry$/);
    await expect(nav.currentDestination()).toHaveText("Telemetry");
  });
});
