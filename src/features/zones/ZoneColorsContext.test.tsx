import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ZoneColorsProvider, useZoneTokenResolver } from "./ZoneColorsContext";

// Feature 147: the assignment key is the sorted set of ids, so reordering the same areas keeps the same resolver
// (and the 3D scene is not rebuilt), while a changed set gives a new resolver.
describe("ZoneColorsProvider stable key (feature 147)", () => {
  it("keeps the same resolver when the same areas arrive in another order", () => {
    const seen: unknown[] = [];
    function Probe() {
      seen.push(useZoneTokenResolver());
      return null;
    }
    const { rerender } = render(
      <ZoneColorsProvider areaIds={["kitchen", "bedroom", "office"]}>
        <Probe />
      </ZoneColorsProvider>,
    );
    rerender(
      <ZoneColorsProvider areaIds={["office", "kitchen", "bedroom"]}>
        <Probe />
      </ZoneColorsProvider>,
    );
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(seen[0]);
  });

  it("gives a new resolver when the set of areas changes", () => {
    const seen: unknown[] = [];
    function Probe() {
      seen.push(useZoneTokenResolver());
      return null;
    }
    const { rerender } = render(
      <ZoneColorsProvider areaIds={["kitchen", "bedroom"]}>
        <Probe />
      </ZoneColorsProvider>,
    );
    rerender(
      <ZoneColorsProvider areaIds={["kitchen", "bedroom", "office"]}>
        <Probe />
      </ZoneColorsProvider>,
    );
    expect(seen[1]).not.toBe(seen[0]);
  });

  it("does not depend on duplicates or the array identity", () => {
    const seen: unknown[] = [];
    function Probe() {
      seen.push(useZoneTokenResolver());
      return null;
    }
    const { rerender } = render(
      <ZoneColorsProvider areaIds={["kitchen", "bedroom"]}>
        <Probe />
      </ZoneColorsProvider>,
    );
    rerender(
      <ZoneColorsProvider areaIds={["bedroom", "kitchen", "kitchen"]}>
        <Probe />
      </ZoneColorsProvider>,
    );
    expect(seen[1]).toBe(seen[0]);
  });
});
