import { expect, test, type Page } from "@playwright/test";
import { AlertBanner } from "../components/alert-banner";
import { TelemetryPage } from "../pages/telemetry";

// Feature 145: OS notifications for server alerts while the panel is not visible. The Notification API is replaced
// by a spy before the app loads; the page visibility and focus are fixed per test.
interface SentNotification {
  title: string;
  tag: string;
  requireInteraction: boolean;
}

async function spyNotifications(page: Page, pageVisible: boolean) {
  await page.context().grantPermissions(["notifications"]);
  await page.addInitScript((visible: boolean) => {
    const sent: SentNotification[] = [];
    (window as unknown as { __sent: SentNotification[] }).__sent = sent;
    class Spy {
      static permission = "granted";
      static requestPermission() {
        return Promise.resolve("granted");
      }
      constructor(title: string, options: { tag?: string; requireInteraction?: boolean } = {}) {
        sent.push({ title, tag: options.tag ?? "", requireInteraction: options.requireInteraction === true });
      }
      close() {}
    }
    Object.defineProperty(window, "Notification", { value: Spy, configurable: true });
    Object.defineProperty(document, "visibilityState", { get: () => (visible ? "visible" : "hidden"), configurable: true });
    Object.defineProperty(document, "hasFocus", { value: () => visible, configurable: true });
  }, pageVisible);
}

function sent(page: Page): Promise<SentNotification[]> {
  return page.evaluate(() => (window as unknown as { __sent: SentNotification[] }).__sent);
}

test("a HIGH alert on a hidden panel raises an OS notification tagged with the alert", async ({ page }) => {
  await spyNotifications(page, false);
  const telemetry = new TelemetryPage(page);
  await telemetry.open("?mock=alerts");

  await page.waitForFunction(() =>
    (window as unknown as { __sent: SentNotification[] }).__sent.some((n) => n.title === "HOME CONTROL • HIGH"),
  );
  const high = (await sent(page)).find((n) => n.title === "HOME CONTROL • HIGH");
  expect(high?.tag).toBeTruthy();
  expect(high?.requireInteraction).toBe(true);
});

test("a HIGH alert on a visible panel only shows the in-page banner, no OS notification", async ({ page }) => {
  await spyNotifications(page, true);
  const telemetry = new TelemetryPage(page);
  const banner = new AlertBanner(page);
  await telemetry.open("?mock=alerts");

  await expect(banner.dialog("HIGH ALERT: Front door")).toBeVisible({ timeout: 10_000 });
  expect((await sent(page)).filter((n) => n.title.startsWith("HOME CONTROL"))).toEqual([]);
});
