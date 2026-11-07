import type { Locator, Page } from "@playwright/test";

// The app toast region (feature 104; alert toasts 129). Clickable toasts are buttons.
export class Toast {
  constructor(private readonly page: Page) {}

  // A toast whose text contains `text`; alert toasts open their device when clicked.
  action(text: RegExp): Locator {
    return this.page.getByRole("button", { name: text });
  }
}
