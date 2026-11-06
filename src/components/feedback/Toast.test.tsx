import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./Toast";

function Trigger({ text }: { text: string }) {
  const toast = useToast();
  return <button onClick={() => toast.show(text)}>notify</button>;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Toast", () => {
  it("shows an error toast in the status region when show is called", () => {
    render(
      <ToastProvider>
        <Trigger text="Could not rename Kitchen" />
      </ToastProvider>,
    );
    expect(screen.queryByText("Could not rename Kitchen")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "notify" }));
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toContain("Could not rename Kitchen");
  });

  it("dismisses a toast after 4 seconds", () => {
    // The provider uses window.setTimeout: capture the 4 s dismiss callback and run it instead of waiting.
    const timers = vi.spyOn(window, "setTimeout");
    render(
      <ToastProvider>
        <Trigger text="first" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "notify" }));
    const dismiss = timers.mock.calls.find(([, delay]) => delay === 4000)?.[0] as () => void;
    expect(dismiss).toBeTypeOf("function");
    expect(screen.getByText("first")).toBeTruthy();

    act(() => dismiss());
    expect(screen.queryByText("first")).toBeNull();
  });

  it("throws when useToast is used outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Trigger text="x" />)).toThrow("useToast must be used inside ToastProvider");
  });
});
