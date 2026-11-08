import { expect, test } from "@playwright/test";
import { AlertBanner } from "../components/alert-banner";
import { TelemetryPage } from "../pages/telemetry";

// Feature 139: server-side alerts. The mock "remote-ack" scenario fires the same timeline as "alerts" and another
// device acks the HIGH alert 2 s later, so the banner must leave by itself.
test("a HIGH alert acked on another device disappears from this panel", async ({ page }) => {
  const telemetry = new TelemetryPage(page);
  const banner = new AlertBanner(page);

  await telemetry.open("?mock=remote-ack");
  const dialog = banner.dialog("HIGH ALERT: Front door");
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeHidden({ timeout: 3000 });
});

// Feature 139: a backend without /api/alerts keeps the 129 local engine (MEDIUM toast still raised).
test("without /api/alerts the local engine still raises the MEDIUM toast", async ({ page }) => {
  const telemetry = new TelemetryPage(page);
  await telemetry.open("?mock=alerts-local");
  await expect(page.getByText(/Desk outlet power: DISCONNECTS/)).toBeVisible({ timeout: 5000 });
});
