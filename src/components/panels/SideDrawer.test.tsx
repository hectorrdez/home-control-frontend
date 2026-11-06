import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SideDrawer from "./SideDrawer";

describe("SideDrawer", () => {
  afterEach(cleanup);

  it("keeps children out of the DOM and hides the panel while closed", () => {
    render(
      <SideDrawer side="left" title="Charts" open={false} onClose={() => undefined}>
        <p>secret content</p>
      </SideDrawer>,
    );
    const aside = screen.getByLabelText("Charts");
    expect(aside.getAttribute("aria-hidden")).toBe("true");
    expect(aside.className).toContain("-translate-x-full");
    expect(aside.className).toContain("invisible");
    expect(screen.queryByText("secret content")).toBeNull();
    expect(document.querySelector('[aria-hidden="true"].fixed.inset-x-0')).toBeNull();
  });

  it("renders children, a backdrop and the close button when open (left side)", () => {
    const onClose = vi.fn();
    const { container } = render(
      <SideDrawer side="left" title="Charts" open onClose={onClose}>
        <p>panel body</p>
      </SideDrawer>,
    );
    const aside = screen.getByRole("complementary", { name: "Charts" });
    expect(aside.getAttribute("aria-hidden")).toBe("false");
    expect(aside.className).toContain("translate-x-0");
    expect(aside.className).toContain("left-0");
    expect(screen.getByText("panel body")).toBeTruthy();
    expect(screen.getByText("Charts")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close Charts" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    const backdrop = container.querySelector(".fixed.inset-x-0") as HTMLElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("uses the right edge when side is right", () => {
    render(
      <SideDrawer side="right" title="Live event feed" open onClose={() => undefined}>
        <p>feed</p>
      </SideDrawer>,
    );
    const aside = screen.getByRole("complementary", { name: "Live event feed" });
    expect(aside.className).toContain("right-0");
    expect(aside.className).toContain("border-l");
  });

  it("hides the right-side panel with a translate-x-full offset", () => {
    render(
      <SideDrawer side="right" title="Live event feed" open={false} onClose={() => undefined}>
        <p>feed</p>
      </SideDrawer>,
    );
    expect(screen.getByLabelText("Live event feed").className).toContain("translate-x-full");
  });

  it("closes on Escape only while open, and stops listening after unmount", () => {
    const onClose = vi.fn();
    const { rerender, unmount } = render(
      <SideDrawer side="left" title="Charts" open={false} onClose={onClose}>
        <p>x</p>
      </SideDrawer>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    rerender(
      <SideDrawer side="left" title="Charts" open onClose={onClose}>
        <p>x</p>
      </SideDrawer>,
    );
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("removes the key listener when the drawer closes", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <SideDrawer side="left" title="Charts" open onClose={onClose}>
        <p>x</p>
      </SideDrawer>,
    );
    rerender(
      <SideDrawer side="left" title="Charts" open={false} onClose={onClose}>
        <p>x</p>
      </SideDrawer>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("mounts children only after opening", () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>open</button>
          <SideDrawer side="left" title="Charts" open={open} onClose={() => setOpen(false)}>
            <p>lazy child</p>
          </SideDrawer>
        </>
      );
    }
    render(<Host />);
    expect(screen.queryByText("lazy child")).toBeNull();
    fireEvent.click(screen.getByText("open"));
    expect(screen.getByText("lazy child")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close Charts" }));
    expect(screen.queryByText("lazy child")).toBeNull();
  });
});
