import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { BottomRail, TopNav } from "./Navigation";

afterEach(cleanup);

describe("TopNav", () => {
  it("links to the home and telemetry routes and marks the active one", () => {
    render(
      <MemoryRouter initialEntries={["/telemetry"]}>
        <TopNav />
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation", { name: "Main" });
    const home = within(nav).getByRole("link", { name: "Home 3D" });
    const telemetry = within(nav).getByRole("link", { name: "Telemetry" });

    expect(home.getAttribute("href")).toBe("/");
    expect(telemetry.getAttribute("href")).toBe("/telemetry");
    expect(telemetry.className).toContain("bg-primary-container");
    expect(home.className).not.toContain("bg-primary-container");
  });

  it("marks home as active on the root path", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <TopNav />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Home 3D" }).className).toContain("bg-primary-container");
  });
});

describe("BottomRail", () => {
  it("renders the same destinations for small screens", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <BottomRail />
      </MemoryRouter>,
    );
    const rail = screen.getByRole("navigation", { name: "Bottom navigation" });
    expect(within(rail).getByRole("link", { name: "Telemetry" }).getAttribute("href")).toBe("/telemetry");
    expect(within(rail).getByRole("link", { name: "Home 3D" }).className).toContain("text-primary-container");
  });

  it("uses the muted colour for inactive links", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <BottomRail />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Telemetry" }).className).toContain("text-on-surface-variant");
  });
});
