import { expect, test } from "@playwright/test";
import { DeviceCard } from "../components/device-card";

// Feature 106: the 3D house stage on `/` (mock house). needs WebGL (headless Chromium provides it).
test.describe("3D house view", () => {
  test("/ shows the house view with a 3D canvas", async ({ page }) => {
    await page.goto("/");
    const view = page.getByRole("region", { name: "House view" });
    await expect(view.locator("canvas")).toBeVisible({ timeout: 15_000 });
  });

  test("selecting the Kitchen chip marks it and filters the device panel", async ({ page }) => {
    await page.goto("/");
    const kitchen = page.getByRole("button", { name: "KITCHEN", exact: true });
    await kitchen.click();
    await expect(kitchen).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("region", { name: "House view" }).getByRole("list")).toContainText("Kitchen:");
  });

  test("toggling a kitchen light updates the room status text", async ({ page }) => {
    await page.goto("/");
    const status = page.getByRole("region", { name: "House view" }).getByRole("list");
    await expect(status).toContainText("Kitchen:");

    await new DeviceCard(page, "Kitchen ceiling").power().click();

    await expect(status).toContainText("Kitchen: lights on");
  });

  test("/telemetry does not load the three.js chunk, / does", async ({ page }) => {
    const urls: string[] = [];
    page.on("request", (request) => urls.push(request.url()));

    await page.goto("/telemetry");
    await page.waitForLoadState("networkidle");
    expect(urls.filter((u) => /\/three[\/.]|three\.module/.test(u))).toHaveLength(0);

    urls.length = 0;
    await page.goto("/");
    await expect(page.getByRole("region", { name: "House view" })).toBeVisible();
    await expect.poll(() => urls.some((u) => /\/three[\/.]|three\.module/.test(u))).toBe(true);
  });
});
