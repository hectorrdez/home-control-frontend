import type { Locator, Page } from "@playwright/test";

// Feature 119: layout facts of the "/" screen that the no-scroll spec asserts on.
export class HomeLayout {
  constructor(private readonly page: Page) {}

  // The device list is the only scroll container on "/".
  deviceList(): Locator {
    return this.page.getByRole("list", { name: "Devices" });
  }

  async documentScrollHeight(): Promise<number> {
    return this.page.evaluate(() => document.documentElement.scrollHeight);
  }

  async viewportHeight(): Promise<number> {
    return this.page.evaluate(() => window.innerHeight);
  }

  async listScrollMetrics(): Promise<{ scrollHeight: number; clientHeight: number }> {
    return this.deviceList().evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
  }
}
