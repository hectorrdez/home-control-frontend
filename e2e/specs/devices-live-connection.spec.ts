import { expect, test } from "@playwright/test";
import { DevicesPage } from "../pages/devices";
import { TelemetryPage } from "../pages/telemetry";

// Feature 126: the mock "device-flap" scenario drops the Desk plug device (switch + power sensor) at 1.5 s and
// restores it at 4 s. The row and the event feed must follow without a reload.
test.use({ viewport: { width: 1280, height: 800 } });

test("a device going offline and back updates its row and the feed without reloading", async ({ page }) => {
  const devices = new DevicesPage(page);
  await devices.open("?mock=device-flap");
  await expect(devices.rowState("Desk plug", "ON")).toBeVisible();

  await expect(devices.rowState("Desk plug", "OFFLINE")).toBeVisible({ timeout: 10_000 });
  await expect(devices.rowState("Desk plug", "ON")).toBeVisible({ timeout: 10_000 });
  expect(page.url()).toMatch(/\/devices\?mock=device-flap$/);

  const telemetry = new TelemetryPage(page);
  await telemetry.navigation.goTo("Telemetry");
  await telemetry.openEvents();
  await expect(telemetry.feedItemsWith("Desk outlet disconnected")).toHaveCount(1);
  await expect(telemetry.feedItemsWith("Desk outlet reconnected")).toHaveCount(1);
});
