import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Spinner from "./Spinner";

afterEach(cleanup);

describe("Spinner (117)", () => {
  it("is decorative: hidden from assistive tech, spins, and stops under reduced motion", () => {
    render(<Spinner />);
    const spinner = screen.getByTestId("spinner");
    expect(spinner.getAttribute("aria-hidden")).toBe("true");
    expect(spinner.className).toContain("animate-spin");
    expect(spinner.className).toContain("motion-reduce:animate-none");
  });

  it("uses the medium size by default, with a caller class", () => {
    render(<Spinner className="text-error" />);
    const spinner = screen.getByTestId("spinner");
    expect(spinner.className).toContain("h-4 w-4");
    expect(spinner.className).toContain("text-error");
  });

  it("uses the small size on request", () => {
    render(<Spinner size="sm" />);
    expect(screen.getByTestId("spinner").className).toContain("h-3 w-3");
  });
});
