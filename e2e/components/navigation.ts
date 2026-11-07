import type { Locator, Page } from "@playwright/test";

export type Destination = "Home 3D" | "Devices" | "Telemetry";

// Top nav on desktop, bottom rail on handheld. Only the visible one is used.
export class Navigation {
  constructor(private readonly page: Page) {}

  private link(name: Destination): Locator {
    return this.page.getByRole("link", { name, exact: true }).filter({ visible: true });
  }

  async goTo(name: Destination) {
    await this.link(name).click();
  }

  currentDestination(): Locator {
    return this.page.locator('[aria-current="page"]').filter({ visible: true });
  }
}
