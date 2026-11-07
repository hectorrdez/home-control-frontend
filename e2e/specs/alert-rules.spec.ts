import { expect, test } from "@playwright/test";
import { DeviceDetailPage } from "../pages/device-detail";

// Feature 128: a device's alert rules are added, re-levelled and deleted from its device page (mock API).
test("add an alert rule, change its level, then delete it", async ({ page }) => {
  const detail = new DeviceDetailPage(page);
  await detail.open("/devices/light.office_desk");
  await expect(detail.title()).toBeVisible();

  const alerts = detail.alerts();
  await expect(alerts.getByText("NO ALERTS")).toBeVisible();

  await alerts.getByRole("button", { name: "ADD ALERT" }).click();
  await alerts.getByRole("combobox", { name: "Trigger" }).selectOption("disconnects");
  await alerts.getByRole("group", { name: "Level" }).getByRole("button", { name: "HIGH", exact: true }).click();
  await alerts.getByRole("button", { name: "SAVE ALERT" }).click();

  const row = alerts.getByRole("listitem").filter({ hasText: "DISCONNECTS" });
  const levels = row.getByRole("group", { name: "Level for DISCONNECTS" });
  await expect(levels.getByRole("button", { name: "HIGH", exact: true })).toHaveAttribute("aria-pressed", "true");

  await levels.getByRole("button", { name: "LOW", exact: true }).click();
  await expect(levels.getByRole("button", { name: "LOW", exact: true })).toHaveAttribute("aria-pressed", "true");

  await row.getByRole("button", { name: "DELETE" }).click();
  await expect(alerts.getByText("NO ALERTS")).toBeVisible();
});
