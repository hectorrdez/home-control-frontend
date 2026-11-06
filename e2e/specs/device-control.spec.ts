import { expect, test } from "@playwright/test";
import { DeviceCard, Toasts } from "../components/device-card";
import { HomePage } from "../pages/home";

// Feature 104: device controls against the mock house (VITE_API_MODE=mock).
test.describe("device control", () => {
  test("toggling a light updates the module to ON", async ({ page }) => {
    const home = new HomePage(page);
    await home.open();
    const kitchen = new DeviceCard(page, "Kitchen ceiling");
    await expect(kitchen.text()).toHaveText("OFF");

    await kitchen.power().click();

    await expect(kitchen.power()).toHaveAttribute("aria-checked", "true");
    await expect(kitchen.text()).toHaveText("ON");
  });

  test("moving the intensity slider sends one action on release and the value persists", async ({ page }) => {
    const home = new HomePage(page);
    await home.open();
    const lamp = new DeviceCard(page, "Bedroom lamp");
    await expect(lamp.intensity()).toHaveAttribute("aria-valuetext", "47%");

    await lamp.intensity().focus();
    await lamp.intensity().press("ArrowRight");
    await lamp.intensity().press("ArrowRight");
    await lamp.intensity().press("ArrowRight");

    await expect(lamp.card().getByText("SENDING")).toHaveCount(0); // the server confirmed the action
    await expect(lamp.intensity()).toHaveAttribute("aria-valuetext", "50%");
  });

  test("the thermostat raises the setpoint by one step and stops at the maximum", async ({ page }) => {
    const home = new HomePage(page);
    await home.open();
    const thermostat = new DeviceCard(page, "Thermostat");
    await expect(thermostat.setpointText()).toContainText("TARGET SETPOINT 21.0 °C");

    await thermostat.increaseSetpoint().click();
    await expect(thermostat.setpointText()).toContainText("TARGET SETPOINT 21.5 °C");

    while (await thermostat.increaseSetpoint().isEnabled()) await thermostat.increaseSetpoint().click();
    await expect(thermostat.increaseSetpoint()).toBeDisabled();
    await expect(thermostat.setpointText()).toContainText("TARGET SETPOINT 28.0 °C");
  });

  test("SHUT sets the blinds to 0%", async ({ page }) => {
    const home = new HomePage(page);
    await home.open();
    const blinds = new DeviceCard(page, "Bedroom blinds");
    await expect(blinds.text()).toHaveText("70% OPEN");

    await blinds.shut().click();

    await expect(blinds.text()).toHaveText("0% OPEN");
  });

  test("unlocking asks for confirmation before it is sent", async ({ page }) => {
    const home = new HomePage(page);
    await home.open();
    const door = new DeviceCard(page, "Front door");
    await expect(door.lockSwitch()).toHaveAttribute("aria-checked", "true");

    await door.lockSwitch().click();
    await expect(door.confirmUnlock()).toBeVisible();
    await expect(door.lockSwitch()).toHaveCount(0);

    await door.confirmUnlock().click();
    await expect(door.text()).toHaveText("UNLOCKED");
  });

  test("a failed action rolls back and shows an error toast", async ({ page }) => {
    const home = new HomePage(page);
    await home.open("?mock=action-error");
    const kitchen = new DeviceCard(page, "Kitchen ceiling");
    await expect(kitchen.power()).toHaveAttribute("aria-checked", "false");

    await kitchen.power().click();

    await expect(new Toasts(page).region().getByText("Could not update Kitchen ceiling")).toBeVisible();
    await expect(kitchen.power()).toHaveAttribute("aria-checked", "false");
    await expect(kitchen.text()).toHaveText("OFF");
  });
});
