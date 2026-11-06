import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Slider from "./Slider";

afterEach(cleanup);

const props = {
  label: "INTENSITY",
  value: 50,
  min: 0,
  max: 100,
  unit: "%",
  hue: "primary" as const,
};

describe("Slider", () => {
  it("shows the label and the value with its unit", () => {
    render(<Slider {...props} onCommit={vi.fn()} />);
    expect(screen.getByRole("slider", { name: /INTENSITY/ }).getAttribute("aria-valuetext")).toBe("50%");
    expect(screen.getByText("50%")).toBeTruthy();
  });

  it("previews the draft while dragging and commits on pointer release", () => {
    const onCommit = vi.fn();
    render(<Slider {...props} onCommit={onCommit} />);
    const slider = screen.getByRole("slider");

    fireEvent.change(slider, { target: { value: "70" } });
    expect(screen.getByText("70%")).toBeTruthy();
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.pointerUp(slider);
    expect(onCommit).toHaveBeenCalledWith(70);
  });

  it("commits on key release and on blur", () => {
    const onCommit = vi.fn();
    render(<Slider {...props} onCommit={onCommit} />);
    const slider = screen.getByRole("slider");

    fireEvent.change(slider, { target: { value: "30" } });
    fireEvent.keyUp(slider, { key: "ArrowLeft" });
    expect(onCommit).toHaveBeenLastCalledWith(30);

    fireEvent.change(slider, { target: { value: "20" } });
    fireEvent.blur(slider);
    expect(onCommit).toHaveBeenLastCalledWith(20);
  });

  it("does not commit when nothing changed", () => {
    const onCommit = vi.fn();
    render(<Slider {...props} onCommit={onCommit} />);
    const slider = screen.getByRole("slider");

    fireEvent.pointerUp(slider);
    fireEvent.change(slider, { target: { value: "50" } });
    fireEvent.pointerUp(slider);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("uses the hue accent and the given step", () => {
    render(<Slider {...props} hue="secondary" step={5} onCommit={vi.fn()} />);
    const slider = screen.getByRole("slider") as HTMLInputElement;
    expect(slider.className).toContain("accent-secondary");
    expect(slider.step).toBe("5");
  });

  it("defaults the step to 1", () => {
    render(<Slider {...props} hue="tertiary" onCommit={vi.fn()} />);
    expect((screen.getByRole("slider") as HTMLInputElement).step).toBe("1");
  });
});
