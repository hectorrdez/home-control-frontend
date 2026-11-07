import type { Locator, Page } from "@playwright/test";

// The 109 header. Owns the HA status line (feature 102).
export class Header {
  constructor(private readonly page: Page) {}

  haStatus(): Locator {
    return this.page.getByRole("status", { name: "Home Assistant status" });
  }

  // Feature 129: the one-time control that unlocks the alert sound for the session.
  enableAlertSound() {
    return this.page.getByRole("button", { name: "ENABLE ALERT SOUND" });
  }
}
