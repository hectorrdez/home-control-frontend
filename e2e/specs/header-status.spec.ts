import { expect, test } from "@playwright/test";
import { Header } from "../components/header";

// Header HA status line, driven by the mock scenarios (Playwright runs with VITE_API_MODE=mock).
test.describe("header HA status", () => {
  test("shows ONLINE with the HA version by default", async ({ page }) => {
    const header = new Header(page);
    await page.goto("/");
    await expect(header.haStatus()).toHaveText("ONLINE // HA 2026.4.1");
  });

  test("shows OFFLINE when HA reports offline", async ({ page }) => {
    const header = new Header(page);
    await page.goto("/?mock=offline");
    await expect(header.haStatus()).toHaveText("OFFLINE");
  });

  test("shows UNAUTHORIZED when the API token is rejected", async ({ page }) => {
    const header = new Header(page);
    await page.goto("/?mock=unauthorized");
    await expect(header.haStatus()).toHaveText("UNAUTHORIZED");
  });
});
