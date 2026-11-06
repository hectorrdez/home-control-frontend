import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Stepper from "./Stepper";

afterEach(cleanup);

const base = { label: "Target temperature", value: 21, min: 7, max: 35, step: 0.5, unit: " °C" };

describe("Stepper", () => {
  it("shows the value with one decimal and its unit", () => {
    render(<Stepper {...base} onChange={vi.fn()} />);
    expect(screen.getByText("21.0 °C")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Target temperature" })).toBeTruthy();
  });

  it("steps up and down by the step size", () => {
    const onChange = vi.fn();
    render(<Stepper {...base} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Increase Target temperature" }));
    expect(onChange).toHaveBeenLastCalledWith(21.5);
    fireEvent.click(screen.getByRole("button", { name: "Decrease Target temperature" }));
    expect(onChange).toHaveBeenLastCalledWith(20.5);
  });

  it("clamps the next value to the range", () => {
    const onChange = vi.fn();
    render(<Stepper {...base} value={34.8} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Increase Target temperature" }));
    expect(onChange).toHaveBeenLastCalledWith(35);
  });

  it("disables the buttons at the bounds", () => {
    const { rerender } = render(<Stepper {...base} value={7} onChange={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Decrease Target temperature" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Increase Target temperature" }) as HTMLButtonElement).disabled).toBe(false);

    rerender(<Stepper {...base} value={35} onChange={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Increase Target temperature" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
