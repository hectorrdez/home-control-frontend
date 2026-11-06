import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Entity } from "@/api/types";
import { TICK_MS } from "./liveBuffer";
import { useLiveBuffers } from "./useLiveBuffers";

// Vitest globals are off, so RTL does not auto-unmount: unmount explicitly so no real timer outlives a test.

const sensor = (id: string, state: string): Entity => ({
  entityId: id,
  domain: "sensor",
  name: id,
  state,
  attributes: { device_class: "temperature" },
  area: null,
  lastChanged: "2026-11-06T08:00:00.000Z",
});

// The entity list must keep its identity across renders, as the store's does; a fresh array per render re-samples forever.
function mount(entity: Entity) {
  return renderHook(({ items }: { items: Entity[] }) => useLiveBuffers(items), {
    initialProps: { items: [entity] },
  });
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useLiveBuffers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T10:00:00.000Z"));
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  });

  it("samples the entities immediately on mount", () => {
    const { result } = mount(sensor("sensor.t", "21.5"));
    expect(result.current["sensor.t"]).toHaveLength(1);
    expect(result.current["sensor.t"][0].v).toBe(21.5);
  });

  it("keeps sampling on the shared one-second tick", () => {
    const { result } = mount(sensor("sensor.t", "20"));
    act(() => {
      vi.advanceTimersByTime(TICK_MS * 3);
    });
    expect(result.current["sensor.t"]).toHaveLength(4);
  });

  it("re-samples straight away when the entities change", () => {
    const { result, rerender } = renderHook(({ list }: { list: Entity[] }) => useLiveBuffers(list), {
      initialProps: { list: [sensor("sensor.t", "20")] },
    });
    rerender({ list: [sensor("sensor.t", "25")] });
    const points = result.current["sensor.t"];
    expect(points).toHaveLength(2);
    expect(points[points.length - 1].v).toBe(25);
  });

  it("pauses while the tab is hidden and resumes with an immediate sample", () => {
    const { result } = mount(sensor("sensor.t", "20"));

    act(() => setHidden(true));
    act(() => {
      vi.advanceTimersByTime(TICK_MS * 5);
    });
    expect(result.current["sensor.t"]).toHaveLength(1);

    act(() => setHidden(false));
    expect(result.current["sensor.t"]).toHaveLength(2);
    act(() => {
      vi.advanceTimersByTime(TICK_MS);
    });
    expect(result.current["sensor.t"]).toHaveLength(3);
  });

  it("does not start the timer when mounted in a hidden tab", () => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    const { result } = mount(sensor("sensor.t", "20"));
    act(() => {
      vi.advanceTimersByTime(TICK_MS * 3);
    });
    expect(result.current["sensor.t"]).toHaveLength(1);
  });

  it("clears the timer and the visibility listener on unmount", () => {
    const { result, unmount } = mount(sensor("sensor.t", "20"));
    const before = result.current;
    unmount();
    act(() => {
      vi.advanceTimersByTime(TICK_MS * 4);
    });
    expect(before["sensor.t"]).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not double-start the timer when the tab is shown again while already running", () => {
    const { result } = mount(sensor("sensor.t", "20"));
    act(() => setHidden(false));
    act(() => {
      vi.advanceTimersByTime(TICK_MS);
    });
    // one immediate sample on the visibility event + one tick, no extra timer
    expect(result.current["sensor.t"]).toHaveLength(3);
    expect(vi.getTimerCount()).toBe(1);
  });
});
