import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ZoneDot } from "./ZoneDot";
import { zoneColorToken } from "./zoneColors";

describe("ZoneDot", () => {
  it("is decorative and colored with the area's zone token", () => {
    const { container } = render(<ZoneDot areaId="kitchen" className="extra" />);
    const dot = container.firstElementChild as HTMLElement;
    const token = zoneColorToken("kitchen");
    expect(dot.getAttribute("aria-hidden")).toBe("true");
    expect(dot.dataset.zoneToken).toBe(token);
    expect(dot.style.backgroundColor).toBe(`var(--color-${token})`);
    expect(dot.className).toContain("extra");
  });
});
