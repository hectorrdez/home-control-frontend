import { expect, test, type Page } from "@playwright/test";
import { Header } from "../components/header";

const STATUS_URL = "**/api/ha/status";

async function routeStatus(page: Page, status: number, body: unknown) {
  await page.route(STATUS_URL, (route) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    }),
  );
}

test.describe("header HA status", () => {
  test("shows ONLINE with the HA version when the backend reports online", async ({ page }) => {
    await routeStatus(page, 200, {
      data: [{ online: true, message: "ok", version: "2026.4.1" }],
    });
    const header = new Header(page);

    await page.goto("/");

    await expect(header.haStatus()).toHaveText("ONLINE // HA 2026.4.1");
  });

  test("shows OFFLINE when the HA link is unreachable (503)", async ({ page }) => {
    await routeStatus(page, 503, { error: { code: "ha_unreachable" } });
    const header = new Header(page);

    await page.goto("/");

    await expect(header.haStatus()).toHaveText("OFFLINE");
  });

  test("shows UNAUTHORIZED when the API token is rejected (401)", async ({ page }) => {
    await routeStatus(page, 401, { error: "unauthorized" });
    const header = new Header(page);

    await page.goto("/");

    await expect(header.haStatus()).toHaveText("UNAUTHORIZED");
  });
});
