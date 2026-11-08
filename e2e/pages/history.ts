import type { Page } from "@playwright/test";

// Feature 141: the /history page (filters live in the URL query).
export class HistoryPage {
  constructor(private readonly page: Page) {}

  async open(query = "") {
    await this.page.goto(`/history${query}`);
  }

  rows() {
    return this.page.getByRole("list", { name: "Event history" }).getByRole("listitem");
  }

  pill(label: string) {
    return this.page.getByRole("group", { name: "Event types" }).getByRole("button", { name: label, exact: true });
  }

  deviceSelect() {
    return this.page.getByRole("combobox", { name: "Device" });
  }

  fromInput() {
    return this.page.getByLabel("From", { exact: true });
  }

  toInput() {
    return this.page.getByLabel("To", { exact: true });
  }

  loadMore() {
    return this.page.getByRole("button", { name: "LOAD MORE", exact: true });
  }
}
