import { expect, test } from "@playwright/test";
import { Header } from "../components/header";
import { HistoryPage } from "../pages/history";

// Feature 141: the history page reads the mock event log (seeded with 130 rows on the first visit).
test.describe("history page", () => {
  test("the nav opens HISTORY, shows 100 rows, LOAD MORE adds the rest and then hides", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "History", exact: true }).first().click();
    await expect(page).toHaveURL(/\/history$/);

    const history = new HistoryPage(page);
    await expect(history.rows()).toHaveCount(100);
    await history.loadMore().click();
    await expect(history.rows()).toHaveCount(130);
    await expect(history.loadMore()).toBeHidden();
  });

  test("a type filter goes into the URL and survives a reload", async ({ page }) => {
    const history = new HistoryPage(page);
    await history.open();
    await history.pill("ALERTS").click();
    await expect(page).toHaveURL(/types=alert%2Calert_acked|types=alert,alert_acked/);
    await expect(history.rows().first()).toBeVisible();
    await expect(history.rows().filter({ hasNotText: /ALERT|ACKNOWLEDGED/ })).toHaveCount(0);

    await page.reload();
    await expect(history.pill("ALERTS")).toHaveAttribute("aria-pressed", "true");
  });

  test("an inverted date range shows the error and sends no request", async ({ page }) => {
    const history = new HistoryPage(page);
    await history.open();
    await history.fromInput().fill("2026-11-05");
    await history.toInput().fill("2026-11-01");
    await expect(page.getByRole("alert")).toHaveText("FROM MUST BE BEFORE TO");
  });

  test("a backend without the event log shows HISTORY NOT AVAILABLE", async ({ page }) => {
    const history = new HistoryPage(page);
    await history.open("?mock=no-events");
    await expect(page.getByRole("status").filter({ hasText: "HISTORY NOT AVAILABLE ON THIS SERVER" })).toBeVisible();
    await expect(new Header(page).haStatus()).toBeVisible();
  });
});
