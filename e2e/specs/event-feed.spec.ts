import { expect, test } from "@playwright/test";
import { Header } from "../components/header";
import { TelemetryPage } from "../pages/telemetry";

// Feature 140: the event feed is seeded from the server event log (mock: GET /api/events over localStorage) and the
// header reports a lost Home Assistant link (ha_link frames).
test.describe("event feed from the server log", () => {
  test("a logged server row shows in the feed with the client name after a reload", async ({ page }) => {
    // The mock keeps its event log in localStorage; seed one action row written by another device.
    await page.addInitScript(() => {
      try {
        if (localStorage.getItem("hc.mock.events.v1")) return;
        const row = {
          id: "900",
          ts: new Date().toISOString(),
          type: "action",
          source: "api",
          entityId: "light.office_desk",
          level: null,
          clientId: null,
          clientName: "Kitchen tablet",
          payload: { action: "turn_on", ok: true },
        };
        localStorage.setItem("hc.mock.events.v1", JSON.stringify([row]));
      } catch {
        // Storage blocked: the test then fails on the feed assertion below.
      }
    });

    const telemetry = new TelemetryPage(page);
    await telemetry.open();
    await telemetry.openEvents();
    await expect(telemetry.feedItemsWith("turn on by Kitchen tablet")).toHaveCount(1);
  });

  test("HA LINK LOST shows while the backend has no Home Assistant link, then clears", async ({ page }) => {
    const header = new Header(page);
    await page.goto("/?mock=ha-link-drop");
    await expect(header.haStatus()).toHaveText("HA LINK LOST", { timeout: 5_000 });
    await expect(header.haStatus()).toHaveText(/ONLINE \/\/ HA/, { timeout: 10_000 });
  });
});
