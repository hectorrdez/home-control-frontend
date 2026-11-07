import { expect, test } from "@playwright/test";
import { DeviceCard } from "../components/device-card";
import { HomePage } from "../pages/home";

// Feature 120: the Home device panel lists only interactive devices (read-only sensors leave the panel).
test.describe("interactive device sidebar", () => {
  test("the default house shows only the 9 controllable devices", async ({ page }) => {
    const home = new HomePage(page);
    await home.open();

    await expect(home.deck.modules()).toHaveCount(9);
    await expect(home.deck.domainPill("ALL")).toContainText("9");

    for (const name of ["Living room temperature", "Entry motion", "House power", "Desk outlet power", "CO2"]) {
      await expect(page.getByRole("article", { name, exact: true })).toHaveCount(0);
    }
    for (const name of ["Thermostat", "Front door", "Dawn", "Bedroom blinds", "Desk outlet"]) {
      await expect(page.getByRole("article", { name, exact: true })).toBeVisible();
    }
  });

  test("CLIMATE, SECURITY and PLUGS each show one controllable device", async ({ page }) => {
    const home = new HomePage(page);
    await home.open();

    await home.deck.selectDomain("CLIMATE");
    await expect(home.deck.modules()).toHaveCount(1);
    await expect(page.getByRole("article", { name: "Thermostat", exact: true })).toBeVisible();

    await home.deck.selectDomain("SECURITY");
    await expect(home.deck.modules()).toHaveCount(1);
    await expect(page.getByRole("article", { name: "Front door", exact: true })).toBeVisible();

    await home.deck.selectDomain("PLUGS");
    await expect(home.deck.modules()).toHaveCount(1);
    await expect(page.getByRole("article", { name: "Desk outlet", exact: true })).toBeVisible();
  });

  test("a control on a visible device still works", async ({ page }) => {
    const home = new HomePage(page);
    await home.open();

    const kitchen = new DeviceCard(page, "Kitchen ceiling");
    await expect(kitchen.power()).toHaveAttribute("aria-checked", "false");
    await kitchen.power().click();
    await expect(kitchen.power()).toHaveAttribute("aria-checked", "true");
  });
});
