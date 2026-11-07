import type { Locator, Page } from "@playwright/test";
import { DeviceCard } from "../components/device-card";
import { Header } from "../components/header";
import { Navigation } from "../components/navigation";

// The "/devices/:entityId" page (feature 122). Composes shared components; holds only its own regions.
export class DeviceDetailPage {
  readonly header: Header;
  readonly navigation: Navigation;

  constructor(private readonly page: Page) {
    this.header = new Header(page);
    this.navigation = new Navigation(page);
  }

  // `path` is the URL path, e.g. "/devices/light.office_desk"; `query` selects a mock scenario, e.g. "?mock=no-history".
  async open(path: string, query = "") {
    await this.page.goto(`${path}${query}`);
  }

  title(): Locator {
    return this.page.getByRole("heading", { level: 1 });
  }

  backLink(): Locator {
    return this.page.getByRole("link", { name: /back to devices/i });
  }

  state(): Locator {
    return this.page.getByRole("region", { name: "State" });
  }

  // The live state text, e.g. "ON" or "OFF" for a light.
  stateText(): Locator {
    return this.state().getByText(/^(ON|OFF)$/);
  }

  // The switch of a device, by its display name (the same control as on the /devices card).
  power(name: string): Locator {
    return new DeviceCard(this.page, name).power();
  }

  history(): Locator {
    return this.page.getByRole("region", { name: "History" }).getByRole("img");
  }

  range(label: string): Locator {
    return this.page.getByRole("group", { name: "Range" }).getByRole("button", { name: label, exact: true });
  }

  notFound(): Locator {
    return this.page.getByText("DEVICE NOT FOUND");
  }

  historyNotAvailable(): Locator {
    return this.page.getByText("HISTORY NOT AVAILABLE");
  }

  toast(text: string): Locator {
    return this.page.getByRole("status").filter({ hasText: text });
  }
}
