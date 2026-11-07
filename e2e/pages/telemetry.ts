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

  async openEvents() {
    await this.page.getByRole("button", { name: /^EVENTS/ }).click();
  }

  async openChartsPanel() {
    await this.page.getByRole("button", { name: "CHARTS", exact: true }).click();
  }

  chartToggle(label: string) {
    return this.page.getByRole("switch", { name: `Show ${label}`, exact: true });
  }

  // Feature 118: CHARTS side panel search and filters.
  chartSearch() {
    return this.page.getByRole("searchbox", { name: "Search charts" });
  }

  // Zone/category pill inside its group; pills carry a count suffix, e.g. "POWER 3".
  chartFilter(group: string, label: string) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return this.page
      .getByRole("group", { name: group, exact: true })
      .getByRole("button", { name: new RegExp(`^${escaped}( \\d+)?$`) });
  }

  // Feature 125: "Fixed panels" group in the CHARTS panel (KPI, gauge and history panels).
  fixedPanelToggle(label: string) {
    return this.page.getByRole("list", { name: "Fixed panel toggles" }).getByRole("switch", { name: `Show ${label}`, exact: true });
  }

  chartToggles() {
    return this.page.getByRole("list", { name: "Chart toggles" }).getByRole("switch");
  }

  chartsShown() {
    return this.page.getByRole("status", { name: "Charts shown" });
  }

  chartsClear() {
    return this.page.getByRole("button", { name: "CLEAR", exact: true });
  }

  chartsNone() {
    return this.page.getByRole("button", { name: "NONE", exact: true });
  }

  noMatches() {
    return this.page.getByText("NO MATCHES", { exact: true });
  }

  feedItems() {
    return this.page.getByRole("list", { name: "Event feed items" }).getByRole("listitem");
  }

  gauge(label: string) {
    return this.page.getByRole("region", { name: "Levels" }).getByRole("img", { name: new RegExp(`^${label}:`) });
  }

  // One live chart card per numeric sensor, named by the sensor's friendly name.
  chartCard(sensorName: string) {
    return this.page.getByRole("region", { name: sensorName, exact: true });
  }

  // Feature 112: the climate history chart (named "<room> climate, <range>: ...").
  climateChart(room: string) {
    return this.page.getByRole("img", { name: new RegExp(`^${room} climate,`) });
  }

  rangeTab(label: string) {
    return this.page.getByRole("group", { name: "Range" }).getByRole("button", { name: label, exact: true });
  }

  roomChip(name: string) {
    return this.page.getByRole("group", { name: "Rooms" }).getByRole("button", { name, exact: true });
  }

  climateSummary() {
    return this.page.getByText(/TEMP VARIANCE/).first();
  }

  historyNotAvailable() {
    return this.page.getByText("HISTORY NOT AVAILABLE");
  }
}
