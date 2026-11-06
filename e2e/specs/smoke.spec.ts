import { expect, test } from "@playwright/test";

test("home route shows the Home 3D heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Home 3D" })).toBeVisible();
});

test("telemetry route shows the Telemetry heading", async ({ page }) => {
  await page.goto("/telemetry");
  await expect(page.getByRole("heading", { name: "Telemetry" })).toBeVisible();
});

test("unknown path redirects to home", async ({ page }) => {
  await page.goto("/nope");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Home 3D" })).toBeVisible();
});
