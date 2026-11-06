import { expect, test } from "@playwright/test";
import { DeviceCard, Toasts } from "../components/device-card";
import { HomePage } from "../pages/home";

// Feature 117: the mock answers an action with the state from before the change and streams the new state
// later (?mock=slow waits 1.5 s). The control must show a loader meanwhile and move to ON exactly once.
declare global {
  interface Window {
    __checkedStates?: string[];
  }
}

test.describe("device action feedback", () => {
  test("a toggle shows the loader and moves to ON once, without flickering back to OFF", async ({ page }) => {
    const home = new HomePage(page);
    await home.open("?mock=slow");
    const kitchen = new DeviceCard(page, "Kitchen ceiling");
    await expect(kitchen.power()).toHaveAttribute("aria-checked", "false");

    // Record every aria-checked value the switch takes from here on.
    await kitchen.power().evaluate((element: Element) => {
      const states = [element.getAttribute("aria-checked") ?? ""];
      window.__checkedStates = states;
      new MutationObserver(() => states.push(element.getAttribute("aria-checked") ?? "")).observe(element, {
        attributes: true,
        attributeFilter: ["aria-checked"],
      });
    });

    await kitchen.power().click();

    await expect(kitchen.powerSpinner()).toBeVisible();
    await expect(kitchen.power()).toHaveAttribute("aria-busy", "true");
    await expect(kitchen.power()).toHaveAttribute("aria-checked", "true");
    await expect(kitchen.powerSpinner()).toHaveCount(0);
    await expect(kitchen.power()).not.toHaveAttribute("aria-busy");
    await expect(kitchen.card()).toHaveAttribute("data-feedback", "success");

    const states = await page.evaluate(() => window.__checkedStates);
    expect(states).toEqual(["false", "true"]);
  });

  test("a failed action drops the loader, rolls back and shows the error highlight with the toast", async ({ page }) => {
    const home = new HomePage(page);
    await home.open("?mock=action-error");
    const kitchen = new DeviceCard(page, "Kitchen ceiling");
    await expect(kitchen.power()).toHaveAttribute("aria-checked", "false");

    await kitchen.power().click();

    await expect(new Toasts(page).region().getByText("Could not update Kitchen ceiling")).toBeVisible();
    await expect(kitchen.power()).toHaveAttribute("aria-checked", "false");
    await expect(kitchen.spinner()).toHaveCount(0);
    await expect(kitchen.card()).toHaveAttribute("data-feedback", "error");
  });
});
