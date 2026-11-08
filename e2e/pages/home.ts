import type { Page } from "@playwright/test";
import { DeviceDeck } from "../components/device-deck";
import { Header } from "../components/header";
import { Navigation } from "../components/navigation";

// The "/" screen. Composes shared components; holds no locators of its own.
export class HomePage {
  readonly header: Header;
  readonly navigation: Navigation;
  readonly deck: DeviceDeck;

  constructor(private readonly page: Page) {
    this.header = new Header(page);
    this.navigation = new Navigation(page);
    this.deck = new DeviceDeck(page);
  }

  // Feature 143: a device card in the Home panel (by display name), and its MODES menu.
  deviceCard(name: string) {
    return this.page.getByRole("article", { name, exact: true });
  }

  modesButton(name: string) {
    return this.deviceCard(name).getByRole("button", { name: "MODES", exact: true });
  }

  modesMenuItem(label: string) {
    return this.page.getByRole("menuitem", { name: label, exact: true });
  }

  // `query` selects a mock scenario, e.g. "?mock=empty".
  async open(query = "") {
    await this.page.goto(`/${query}`);
  }
}
