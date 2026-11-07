import type { Locator, Page } from "@playwright/test";

// The HIGH alert banner (feature 129): an alertdialog that stays until dismissed.
export class AlertBanner {
  constructor(private readonly page: Page) {}

  dialog(name: string): Locator {
    return this.page.getByRole("alertdialog", { name });
  }

  dismissButton(): Locator {
    return this.page.getByRole("button", { name: "DISMISS" });
  }
}
