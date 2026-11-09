import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Entity } from "@/api/types";
import { tileIconsSetting } from "@/features/devices/tileIcons";
import TileIconPicker from "./TileIconPicker";

// Feature 155: the detail-page picker saves the icon through the synced setting and shows the saved one on the next load.
vi.mock("@/features/names/useEntityName", () => ({
  useEntityName: () => ({ displayName: (e: { name: string }) => e.name }),
}));

const CACHE_KEY = "hc.setting.devices.icons";

const lamp: Entity = {
  entityId: "light.kitchen_ceiling",
  domain: "light",
  name: "Kitchen ceiling",
  state: "off",
  attributes: {},
  area: "kitchen",
  lastChanged: "2026-11-06T10:00:00.000Z",
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  tileIconsSetting.forget();
});

describe("TileIconPicker (155)", () => {
  it("marks the domain default as the current icon when nothing was picked", () => {
    render(<TileIconPicker entity={lamp} />);
    expect(screen.getByRole("button", { name: "Use Lightbulb icon" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Use Fan icon" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("saves the picked icon under the setting key and shows it again after a reload", () => {
    const { unmount } = render(<TileIconPicker entity={lamp} />);
    fireEvent.click(screen.getByRole("button", { name: "Use Fan icon" }));

    expect(screen.getByRole("button", { name: "Use Fan icon" }).getAttribute("aria-pressed")).toBe("true");
    const stored = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "{}").value;
    expect(stored).toEqual({ v: 1, icons: { "light.kitchen_ceiling": "Fan" } });

    unmount();
    tileIconsSetting.forget(); // reload: memory dropped, the cache is read again
    render(<TileIconPicker entity={lamp} />);
    expect(screen.getByRole("button", { name: "Use Fan icon" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the pick scoped to its own entity", () => {
    render(<TileIconPicker entity={lamp} />);
    fireEvent.click(screen.getByRole("button", { name: "Use Tv icon" }));
    const other: Entity = { ...lamp, entityId: "light.hall", name: "Hall" };
    render(<TileIconPicker entity={other} />);
    expect(screen.getByRole("group", { name: "Tile icon for Hall" }).querySelector('[aria-pressed="true"]')?.getAttribute("aria-label")).toBe(
      "Use Lightbulb icon",
    );
  });
});
