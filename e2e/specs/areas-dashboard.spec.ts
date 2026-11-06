import { expect, test } from "@playwright/test";
import { HomePage } from "../pages/home";

// Feature 103: device panel driven by the mock house (VITE_API_MODE=mock).
test.describe("device panel", () => {
  test("shows the summary, every device and the room chips by default", async ({ page }) => {
    const home = new HomePage(page);
    await home.open();

    await expect(page.getByText("ALL SYSTEMS SYNCHRONIZED")).toBeVisible();
    await expect(home.deck.domainPill("ALL")).toContainText("26");
    await expect(home.deck.modules()).toHaveCount(26);
    await expect(page.getByRole("group", { name: "Rooms" }).getByRole("button")).toHaveCount(6);
  });

  test("the LIGHTS pill shows only lights with a matching count", async ({ page }) => {
    const home = new HomePage(page);
    await home.open();

    await home.deck.selectDomain("LIGHTS");

    await expect(home.deck.domainPill("LIGHTS")).toHaveAttribute("aria-pressed", "true");
    await expect(home.deck.domainPill("LIGHTS")).toContainText("4");
    await expect(home.deck.modules()).toHaveCount(4);
    await expect(home.deck.modules().first()).toHaveAccessibleName(/Kitchen ceiling|Living room ceiling|Bedroom lamp|Office desk light/);
  });

  test("a room chip filters the deck to that room", async ({ page }) => {
    const home = new HomePage(page);
    await home.open();

    await home.deck.selectRoom("KITCHEN");

    await expect(home.deck.modules()).toHaveCount(3);
    await expect(page.getByRole("article", { name: "Kitchen ceiling" })).toBeVisible();
    await expect(page.getByRole("article", { name: "Living room ceiling" })).toHaveCount(0);
  });

  test("shows the empty state when the house has no devices", async ({ page }) => {
    const home = new HomePage(page);
    await home.open("?mock=empty");

    await expect(home.deck.panel().getByText("NO DEVICES", { exact: true })).toBeVisible();
    await expect(home.deck.modules()).toHaveCount(0);
  });

  test("shows an error with Retry when devices cannot load", async ({ page }) => {
    const home = new HomePage(page);
    await home.open("?mock=error");

    await expect(home.deck.panel().getByRole("alert")).toContainText("Could not load devices.");
    await expect(home.deck.retryButton()).toBeVisible();
  });

  test("shows the loading skeleton before the slow house arrives", async ({ page }) => {
    const home = new HomePage(page);
    await home.open("?mock=slow");

    await expect(home.deck.panel()).toHaveAttribute("aria-busy", "true");
    await expect(home.deck.modules()).toHaveCount(0);
    await expect(home.deck.modules().first()).toBeVisible({ timeout: 10_000 });
  });
});
