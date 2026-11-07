import type { Locator, Page } from "@playwright/test";

// The 103 device panel: summary, domain filter pills, room chips and the device deck.
export class DeviceDeck {
  constructor(private readonly page: Page) {}

  panel(): Locator {
    return this.page.getByRole("region", { name: "Device panel" });
  }

  modules(): Locator {
    return this.page.getByRole("list", { name: "Devices" }).getByRole("article");
  }

  async selectDomain(label: "ALL" | "LIGHTS" | "CLIMATE" | "SECURITY" | "PLUGS") {
    await this.page
      .getByRole("group", { name: "Device filters" })
      .getByRole("button", { name: new RegExp(`^${label}`) })
      .click();
  }

  async selectRoom(label: string) {
    await this.page.getByRole("group", { name: "Rooms" }).getByRole("button", { name: label, exact: true }).click();
  }

  domainPill(label: "ALL" | "LIGHTS" | "CLIMATE" | "SECURITY" | "PLUGS"): Locator {
    return this.page
      .getByRole("group", { name: "Device filters" })
      .getByRole("button", { name: new RegExp(`^${label}`) });
  }

  // Feature 120: the message shown when the filtered list has no controllable device.
  emptyState(): Locator {
    return this.panel().getByRole("status");
  }

  retryButton(): Locator {
    return this.panel().getByRole("button", { name: "RETRY" });
  }
}
