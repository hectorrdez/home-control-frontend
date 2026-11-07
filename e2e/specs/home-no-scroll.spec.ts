import { expect, test } from "@playwright/test";
import { HomeLayout } from "../pages/home-layout";
import { HomePage } from "../pages/home";
import { TelemetryPage } from "../pages/telemetry";

// Feature 119: "/" never scrolls the document; only the device list does. "/telemetry" keeps page scroll.
const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "short desktop", width: 1280, height: 600 },
];

for (const viewport of VIEWPORTS) {
  test.describe(`home at ${viewport.name} ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const query of ["", "?mock=many-devices"]) {
      test(`the document does not scroll vertically (${query || "default house"})`, async ({ page }) => {
        const home = new HomePage(page);
        const layout = new HomeLayout(page);
        await home.open(query);
        await expect(home.deck.modules().first()).toBeVisible();

        expect(await layout.documentScrollHeight()).toBeLessThanOrEqual(await layout.viewportHeight());
      });
    }

    test("the device list scrolls inside its own container", async ({ page }) => {
      const home = new HomePage(page);
      const layout = new HomeLayout(page);
      // Feature 120: 9 cards may fit; the many-devices house overflows the list deterministically.
      await home.open("?mock=many-devices");
      await expect(layout.deviceList()).toBeVisible();

      const metrics = await layout.listScrollMetrics();
      expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
      await layout.deviceList().evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      expect(await layout.deviceList().evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    });
  });
}

test("/telemetry still scrolls the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  const telemetry = new TelemetryPage(page);
  await telemetry.open();
  await expect(page.getByRole("main")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(true);
});
