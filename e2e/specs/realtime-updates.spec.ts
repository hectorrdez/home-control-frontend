import { expect, test } from "@playwright/test";
import { Header } from "../components/header";

// Feature 105: the stream (mock in Playwright) keeps the panel live and the header reports reconnects.
test.describe("realtime updates", () => {
  test("a stream drift changes a sensor value on screen without reloading", async ({ page }) => {
    await page.goto("/");
    const panel = page.getByRole("main");
    await expect(panel).toContainText("°C");
    const before = await panel.innerText();

    // The mock drifts temperature sensors every 5 s; the panel must update in place.
    await expect
      .poll(async () => panel.innerText(), { timeout: 20_000, intervals: [500] })
      .not.toBe(before);
  });

  test("a dropped stream shows RECONNECTING and recovers to ONLINE", async ({ page }) => {
    const header = new Header(page);
    await page.goto("/?mock=stream-drop");
    await expect(header.haStatus()).toHaveText("ONLINE // HA 2026.4.1");

    const chip = page.getByRole("status", { name: "Live updates" });
    await expect(chip).toHaveText("RECONNECTING", { timeout: 10_000 });
    await expect(chip).toHaveCount(0, { timeout: 10_000 });
    await expect(header.haStatus()).toHaveText("ONLINE // HA 2026.4.1");
  });
});
