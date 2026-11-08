import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Preset } from "@/api/types";
import PresetModesMenu from "./PresetModesMenu";

const presets: Preset[] = [
  { id: "a", entityId: "cover.salon_blind", name: "SHUT", percent: 0, createdAt: "2026-11-08T10:00:00Z" },
  { id: "b", entityId: "cover.salon_blind", name: "HALF", percent: 50, createdAt: "2026-11-08T10:00:00Z" },
];

function renderMenu(onApply = vi.fn(), disabled = false) {
  render(<PresetModesMenu presets={presets} disabled={disabled} busy={false} onApply={onApply} />);
  return onApply;
}

afterEach(cleanup);

describe("PresetModesMenu (feature 143)", () => {
  it("opens a role=menu with one menuitem per preset, in the given order", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "MODES" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["SHUT 0%", "HALF 50%"]);
  });

  it("picking an item applies that preset and closes the menu", () => {
    const onApply = renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "MODES" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "HALF 50%" }));
    expect(onApply).toHaveBeenCalledWith(presets[1]);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("arrow keys move focus between items", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "MODES" }));
    const menu = screen.getByRole("menu");
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "SHUT 0%" }));
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "HALF 50%" }));
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "SHUT 0%" }));
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "HALF 50%" }));
  });

  it("Esc closes the menu and returns focus to MODES", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "MODES" });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("a click outside closes the menu", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "MODES" }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("is disabled when the cover is not usable", () => {
    renderMenu(vi.fn(), true);
    expect((screen.getByRole("button", { name: "MODES" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
