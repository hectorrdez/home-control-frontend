import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { BottomRail, TopNav } from "./Navigation";

afterEach(cleanup);

describe("TopNav", () => {
  it("lists Devices between Home 3D and Telemetry (feature 121)", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <TopNav />
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation", { name: "Main" });
    const labels = within(nav).getAllByRole("link").map((link) => link.textContent);
    expect(labels).toEqual(["Home 3D", "Devices", "Telemetry", "History"]);
    expect(within(nav).getByRole("link", { name: "Devices" }).getAttribute("href")).toBe("/devices");
  });

  it("keeps Devices active on a device detail path", () => {
    render(
      <MemoryRouter initialEntries={["/devices/light.living_room_ceiling"]}>
        <TopNav />
      </MemoryRouter>,
    );
    const devices = screen.getByRole("link", { name: "Devices" });
    expect(devices.getAttribute("aria-current")).toBe("page");
    expect(devices.className).toContain("bg-primary-container");
    expect(screen.getByRole("link", { name: "Home 3D" }).getAttribute("aria-current")).toBeNull();
  });

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
  it("includes the Devices destination and keeps it active on a detail path", () => {
    render(
      <MemoryRouter initialEntries={["/devices/lock.front_door"]}>
        <BottomRail />
      </MemoryRouter>,
    );
    const rail = screen.getByRole("navigation", { name: "Bottom navigation" });
    expect(within(rail).getAllByRole("link").map((link) => link.textContent)).toEqual(["Home 3D", "Devices", "Telemetry", "History"]);
    expect(within(rail).getByRole("link", { name: "Devices" }).className).toContain("text-primary-container");
  });

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
