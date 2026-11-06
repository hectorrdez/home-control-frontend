import type { Page } from "@playwright/test";
import { Header } from "../components/header";
import { Navigation } from "../components/navigation";

// The "/telemetry" screen. Composes shared components; holds only its own region and list locators.
export class TelemetryPage {
  readonly header: Header;
  readonly navigation: Navigation;

  constructor(private readonly page: Page) {
    this.header = new Header(page);
    this.navigation = new Navigation(page);
  }

  // `query` selects a mock scenario, e.g. "?mock=empty".
  async open(query = "") {
    await this.page.goto(`/telemetry${query}`);
  }

  kpi(title: string) {
    return this.page.getByRole("region", { name: title, exact: true });
  }

  feedItems() {
    return this.page.getByRole("list", { name: "Event feed items" }).getByRole("listitem");
  }

  gauge(label: string) {
    return this.page.getByRole("img", { name: new RegExp(`^${label}:`) });
  }
}
