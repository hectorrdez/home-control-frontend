import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DropdownFloating from "./DropdownFloating";

type Rect = { top: number; bottom: number; left: number; width: number; height: number };

// jsdom has no layout: the trigger and the portaled panel get rects from this table.
let triggerRect: Rect;
let panelRect: Rect;

beforeEach(() => {
  triggerRect = { top: 100, bottom: 120, left: 50, width: 80, height: 20 };
  panelRect = { top: 0, bottom: 0, left: 0, width: 150, height: 100 };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const r = this.classList.contains("fixed") ? panelRect : triggerRect;
    return { ...r, x: r.left, y: r.top, right: r.left + r.width, toJSON: () => ({}) } as DOMRect;
  });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderMenu(items: Parameters<typeof DropdownFloating>[0]["items"], className?: string) {
  return render(
    <DropdownFloating items={items} className={className}>
      <span>Open menu</span>
    </DropdownFloating>,
  );
}

function hover(clientX = 60, clientY = 110) {
  const trigger = screen.getByText("Open menu").parentElement!;
  fireEvent.mouseEnter(trigger, { clientX, clientY });
  return trigger;
}

const panel = () => document.querySelector<HTMLElement>(".fixed.z-50");

describe("DropdownFloating", () => {
  it("stays closed until the trigger is hovered", () => {
    renderMenu([{ label: "Rename" }]);
    expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
    hover();
    expect(screen.getByRole("button", { name: "Rename" })).toBeTruthy();
  });

  it("opens below the trigger when there is room under the cursor", () => {
    renderMenu([{ label: "Rename" }]);
    hover(60, 110);
    expect(panel()!.style.top).toBe("124px");
    expect(panel()!.style.left).toBe("50px");
  });

  it("flips above the trigger when the cursor is near the bottom of the viewport", () => {
    triggerRect = { top: 400, bottom: 420, left: 50, width: 80, height: 20 };
    renderMenu([{ label: "Rename" }]);
    hover(60, 760);
    expect(panel()!.style.top).toBe("296px");
  });

  it("pushes the panel left when it would overflow the right edge", () => {
    triggerRect = { top: 100, bottom: 120, left: 1000, width: 80, height: 20 };
    renderMenu([{ label: "Rename" }]);
    hover(1005, 110);
    expect(panel()!.style.left).toBe(`${1024 - 150 - 4}px`);
  });

  it("clamps to the bottom edge when the panel is taller than the room below", () => {
    triggerRect = { top: 700, bottom: 720, left: 50, width: 80, height: 20 };
    panelRect = { top: 0, bottom: 0, left: 0, width: 150, height: 100 };
    renderMenu([{ label: "Rename" }]);
    hover(60, 0);
    expect(panel()!.style.top).toBe(`${768 - 100 - 4}px`);
  });

  it("clamps to the top and left margins", () => {
    triggerRect = { top: 0, bottom: 0, left: -50, width: 80, height: 0 };
    renderMenu([{ label: "Rename" }]);
    hover(-40, 0);
    expect(panel()!.style.top).toBe("4px");
    expect(panel()!.style.left).toBe("4px");
  });

  it("keeps the panel open while the pointer moves from trigger to panel", () => {
    vi.useFakeTimers();
    const { unmount } = renderMenu([{ label: "Rename" }]);
    const trigger = hover();
    fireEvent.mouseLeave(trigger);
    fireEvent.mouseEnter(panel()!);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByRole("button", { name: "Rename" })).toBeTruthy();
    unmount();
  });

  it("closes after the trigger and panel are both left", () => {
    vi.useFakeTimers();
    renderMenu([{ label: "Rename" }]);
    const trigger = hover();
    fireEvent.mouseLeave(trigger);
    fireEvent.mouseEnter(panel()!);
    fireEvent.mouseLeave(panel()!);
    act(() => {
      vi.advanceTimersByTime(130);
    });
    expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
  });

  it("cancels a pending close when the trigger is re-entered", () => {
    vi.useFakeTimers();
    renderMenu([{ label: "Rename" }]);
    const trigger = hover();
    fireEvent.mouseLeave(trigger);
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByRole("button", { name: "Rename" })).toBeTruthy();
  });

  it("clears a pending close on unmount without errors", () => {
    vi.useFakeTimers();
    const { unmount } = renderMenu([{ label: "Rename" }]);
    fireEvent.mouseLeave(hover());
    unmount();
    expect(() => vi.advanceTimersByTime(200)).not.toThrow();
  });

  it("renders the optional className on the panel and the item icons", () => {
    renderMenu([{ label: "Delete", icon: <svg data-testid="icon" /> }], "custom-panel");
    hover();
    expect(panel()!.classList.contains("custom-panel")).toBe(true);
    expect(screen.getByTestId("icon")).toBeTruthy();
  });

  it("calls onClick for an enabled item and ignores disabled ones", () => {
    const onDelete = vi.fn();
    const onLocked = vi.fn();
    renderMenu([
      { label: "Delete", onClick: onDelete },
      { label: "Locked", onClick: onLocked, disabled: true },
    ]);
    hover();

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledOnce();

    const locked = screen.getByRole("button", { name: "Locked" }) as HTMLButtonElement;
    expect(locked.disabled).toBe(true);
    fireEvent.click(locked);
    expect(onLocked).not.toHaveBeenCalled();
  });
});
