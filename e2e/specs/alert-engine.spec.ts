import { expect, test } from "@playwright/test";
import { AlertBanner } from "../components/alert-banner";
import { Header } from "../components/header";
import { Navigation } from "../components/navigation";
import { Toast } from "../components/toast";
import { DeviceDetailPage } from "../pages/device-detail";
import { TelemetryPage } from "../pages/telemetry";

// Feature 129: the mock "alerts" scenario seeds three rules and fires them at 1.5 s (MEDIUM), 4 s (HIGH), 6 s (LOW).
test("MEDIUM opens the device, HIGH jumps to Home 3D with the banner, LOW only lands in the feed", async ({ page }) => {
  const telemetry = new TelemetryPage(page);
  const header = new Header(page);
  const navigation = new Navigation(page);
  const toast = new Toast(page);
  const banner = new AlertBanner(page);

  await telemetry.open("?mock=alerts");
  await header.enableAlertSound().click();

  // MEDIUM: a toast on any page; clicking it opens the device detail.
  await toast.action(/Desk outlet power: DISCONNECTS/).click();
  await expect(page).toHaveURL(/\/devices\/office~desk_plug$/);
  await expect(new DeviceDetailPage(page).title()).toBeVisible();

  // HIGH: the app goes to Home 3D and the red alert banner waits for DISMISS (focused).
  const dialog = banner.dialog("HIGH ALERT: Front door");
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(banner.dismissButton()).toBeFocused();
  await expect(dialog).toContainText("Front door unlocked");

  await banner.dismissButton().click();
  await expect(dialog).toBeHidden();

  // LOW: no toast and no banner; the event feed shows it flagged as an alert.
  await navigation.goTo("Telemetry");
  await telemetry.openEvents();
  await expect(telemetry.feedItemsWith("ALERT LOW")).toHaveCount(1);
  await expect(telemetry.feedItemsWith("ALERT LOW")).toContainText("BECOMES OFF");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});
