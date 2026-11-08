import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ZoneDot } from "./ZoneDot";
import { ZoneColorsProvider } from "./ZoneColorsContext";
import { ZONE_TOKENS, zoneColorToken } from "./zoneColors";

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
// Feature 147: inside ZoneColorsProvider the dot uses the assigned token (sorted position), not the hash.
describe("ZoneDot assignment (feature 147)", () => {
  it("uses the assigned token inside ZoneColorsProvider", () => {
    const { container } = render(
      <ZoneColorsProvider areaIds={["office", "kitchen"]}>
        <ZoneDot areaId="office" />
      </ZoneColorsProvider>,
    );
    expect((container.firstElementChild as HTMLElement).dataset.zoneToken).toBe(ZONE_TOKENS[1]);
  });

  it("renders no dot for an entity without area", () => {
    const { container } = render(<ZoneDot areaId={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("an explicit token overrides the area", () => {
    const { container } = render(<ZoneDot areaId="kitchen" token="zone-pink" />);
    expect((container.firstElementChild as HTMLElement).dataset.zoneToken).toBe("zone-pink");
  });
});
