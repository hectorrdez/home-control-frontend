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

  // Feed items whose text contains `text` (e.g. "Desk outlet disconnected").
  feedItemsWith(text: string) {
    return this.feedItems().filter({ hasText: text });
  }

  gauge(label: string) {
    return this.page.getByRole("region", { name: "Levels" }).getByRole("img", { name: new RegExp(`^${label}:`) });
  }

  // One live chart card per numeric sensor, named by the sensor's friendly name.
  chartCard(sensorName: string) {
    return this.page.getByRole("region", { name: sensorName, exact: true });
  }

  // Feature 114: edit mode on the live charts grid.
  editButton() {
    return this.page.getByRole("button", { name: /^(EDIT|DONE)$/ });
  }

  editBar(label: string) {
    return this.page.getByRole("group", { name: `Edit ${label}`, exact: true });
  }

  moveUp(label: string) {
    return this.page.getByRole("button", { name: `Move ${label} up`, exact: true });
  }

  moveDown(label: string) {
    return this.page.getByRole("button", { name: `Move ${label} down`, exact: true });
  }

  hideChart(label: string) {
    return this.page.getByRole("button", { name: `Hide ${label}`, exact: true });
  }

  chartType(label: string, kind: string) {
    return this.page
      .getByRole("group", { name: `Chart type for ${label}`, exact: true })
      .getByRole("button", { name: kind, exact: true });
  }

  wideToggle(label: string) {
    return this.page.getByRole("button", { name: `Wide ${label}`, exact: true });
  }

  // Saved chart layout (localStorage, feature 113/114). Read/replace the widget list for seeding edge cases.
  async savedWidgets(): Promise<Array<Record<string, unknown>>> {
    return this.page.evaluate(() => JSON.parse(window.localStorage.getItem("hc.telemetry.widgets.v1") ?? "{}").widgets ?? []);
  }

  async setSavedWidgets(widgets: Array<Record<string, unknown>>) {
    await this.page.evaluate(
      (list) => window.localStorage.setItem("hc.telemetry.widgets.v1", JSON.stringify({ version: 1, widgets: list })),
      widgets,
    );
  }

  // Chart type pills that are pressed for a sensor (should be none when the saved kind is not offered).
  pressedChartTypes(label: string) {
    return this.page.getByRole("group", { name: `Chart type for ${label}`, exact: true }).getByRole("button", { pressed: true });
  }

  resetLayout() {
    return this.page.getByRole("button", { name: "RESET LAYOUT", exact: true });
  }

  confirmReset() {
    return this.page.getByRole("button", { name: "CONFIRM RESET", exact: true });
  }

  cancelReset() {
    return this.page.getByRole("button", { name: "CANCEL", exact: true });
  }

  // Accessible names of the chart cards inside the "Live charts" list, in DOM order.
  async chartOrder(): Promise<string[]> {
    const items = this.page.getByRole("list", { name: "Live charts", exact: true }).getByRole("region");
    return items.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
  }

  // Feature 112/144: the climate history charts (named "<room> temperature, <range>: ..." and "<room> humidity, ...").
  climateChart(room: string, metric: "temperature" | "humidity" = "temperature") {
    // The range label (e.g. "24H:") tells these apart from the live sensor charts, which share the "<name> temperature" shape.
    return this.page.getByRole("img", { name: new RegExp(`^${room} ${metric}, (6H|24H|7D|30D):`) });
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

  // Feature 131: ALL ROOMS legend (one entry per room plus TOTAL MEAN) and the card title above the selectors.
  chartLegend() {
    return this.page.getByRole("list", { name: "Chart legend" }).getByRole("listitem");
  }

  // Drawn curves of the climate chart (SVG paths have no accessible name, so they carry a data-testid).
  climateCurves(room: string, kind: "room-line" | "mean-line" | "humidity-line" | "humidity-room-line" | "temp-area") {
    const metric = kind.startsWith("humidity") ? "humidity" : "temperature";
    return this.climateChart(room, metric).getByTestId(`climate-${kind}`);
  }

  climateTitle() {
    return this.page.getByRole("heading", { name: "CLIMATE HISTORY", exact: true });
  }

  historyNotAvailable() {
    return this.page.getByText("HISTORY NOT AVAILABLE");
  }
}
