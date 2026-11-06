import { expect, type Locator, type Page } from "@playwright/test";

// One device module of the 104 device panel, addressed by its entity name.
export class DeviceCard {
  constructor(
    private readonly page: Page,
    private readonly name: string,
  ) {}

  card(): Locator {
    return this.page.getByRole("article", { name: this.name, exact: true });
  }

  text(): Locator {
    return this.card().locator("p").first();
  }

  power(): Locator {
    return this.page.getByRole("switch", { name: `${this.name} power`, exact: true });
  }

  intensity(): Locator {
    return this.card().getByRole("slider", { name: /^INTENSITY/ });
  }

  increaseSetpoint(): Locator {
    return this.card().getByRole("button", { name: "Increase Target temperature" });
  }

  setpointText(): Locator {
    return this.card().getByText(/TARGET SETPOINT/);
  }

  shut(): Locator {
    return this.card().getByRole("button", { name: "SHUT (0%)" });
  }

  full(): Locator {
    return this.card().getByRole("button", { name: "FULL (100%)" });
  }

  lockSwitch(): Locator {
    return this.page.getByRole("switch", { name: `${this.name} locked`, exact: true });
  }

  // Feature 115: inline rename (pencil -> textbox).
  startRename(): Locator {
    return this.page.getByRole("button", { name: `Rename ${this.name}`, exact: true });
  }

  nameInput(): Locator {
    return this.card().getByRole("textbox");
  }

  async rename(name: string): Promise<void> {
    await this.startRename().click();
    await this.nameInput().fill(name);
    await this.nameInput().press("Enter");
    // The editor stays open (SENDING) until the save settles; wait so a following rename starts clean.
    await expect(this.page.getByRole("textbox", { name: /^Name for / })).toBeHidden();
  }

  // Feature 117: the loader inside the control that sent the action (decorative; aria-busy carries the state).
  spinner(): Locator {
    return this.card().getByTestId("spinner");
  }

  powerSpinner(): Locator {
    return this.power().getByTestId("spinner");
  }

  confirmUnlock(): Locator {
    return this.card().getByRole("button", { name: "CONFIRM UNLOCK" });
  }
}

// The toast region (role="status") shared by every action error.
export class Toasts {
  constructor(private readonly page: Page) {}

  region(): Locator {
    return this.page.getByRole("status").filter({ hasText: /./ }).last();
  }
}
