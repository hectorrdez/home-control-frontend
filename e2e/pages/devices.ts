import type { Locator, Page } from "@playwright/test";
import { Header } from "../components/header";
import { Navigation } from "../components/navigation";

// The "/devices" list (feature 121). Composes shared components; holds only its own region and list locators.
export class DevicesPage {
  readonly header: Header;
  readonly navigation: Navigation;

  constructor(private readonly page: Page) {
    this.header = new Header(page);
    this.navigation = new Navigation(page);
  }

  // `query` selects a mock scenario, e.g. "?mock=empty".
  async open(query = "") {
    await this.page.goto(`/devices${query}`);
  }

  search(): Locator {
    return this.page.getByRole("searchbox", { name: "Search devices" });
  }

  rows(): Locator {
    return this.page.getByRole("list", { name: "Devices" }).getByRole("link");
  }

  row(name: string): Locator {
    return this.page.getByRole("list", { name: "Devices" }).getByRole("link", { name, exact: true });
  }

  // The status text inside a row (e.g. "OFFLINE", "ON"); scoped to the row so two rows never collide.
  rowState(name: string, state: string): Locator {
    return this.row(name).getByText(state, { exact: true });
  }

  shown(): Locator {
    return this.page.getByRole("status", { name: "Devices shown" });
  }

  // Pill inside its group; pills of Areas and Types carry a count suffix, e.g. "KITCHEN 3".
  pill(group: string, label: string | RegExp): Locator {
    return this.page.getByRole("group", { name: group, exact: true }).getByRole("button", { name: label });
  }

  clear(): Locator {
    return this.page.getByRole("button", { name: "CLEAR", exact: true });
  }

  filters(): Locator {
    return this.page.getByRole("complementary", { name: "Device search and filters" });
  }

  list(): Locator {
    return this.page.getByRole("region", { name: "Device list" });
  }
}
