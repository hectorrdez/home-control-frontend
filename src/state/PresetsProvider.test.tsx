import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { publishServerEvent } from "@/api/serverEvents";
import { ApiProvider } from "@/api/ApiContext";
import { createMockApi } from "@/api/mock/createMockApi";
import { PresetsProvider, usePresets } from "./PresetsProvider";

const COVER = "cover.salon_blind";

function wrapperFor(api: ReturnType<typeof createMockApi>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiProvider api={api}>
        <PresetsProvider>{children}</PresetsProvider>
      </ApiProvider>
    );
  };
}

describe("PresetsProvider (feature 142)", () => {
  it("loads once, reports ready and lists the cover's presets sorted by percent then name", async () => {
    const api = createMockApi({ scenario: "cover-presets", actionDelayMs: 0 });
    await api.createPreset({ entityId: COVER, name: "HALF", percent: 50 });
    await api.createPreset({ entityId: COVER, name: "Shut", percent: 0 });
    const { result } = renderHook(() => usePresets(), { wrapper: wrapperFor(api) });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.presetsFor(COVER).map((p) => p.name)).toEqual(["Shut", "HALF"]);
    expect(result.current.presetsFor("cover.other")).toEqual([]);
  });

  it("is unavailable when the presets cannot be loaded (the UI stays hidden)", async () => {
    const api = createMockApi({ scenario: "error" });
    const { result } = renderHook(() => usePresets(), { wrapper: wrapperFor(api) });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.presetsFor(COVER)).toEqual([]);
  });

  it("save, rename and remove update the list from the answers", async () => {
    const api = createMockApi({ scenario: "cover-presets", actionDelayMs: 0 });
    const { result } = renderHook(() => usePresets(), { wrapper: wrapperFor(api) });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(() => result.current.save({ entityId: COVER, name: "HALF", percent: 50 }));
    expect(result.current.presetsFor(COVER)).toHaveLength(1);
    const [half] = result.current.presetsFor(COVER);

    await act(() => result.current.rename(half.id, { name: "Mid", percent: 45 }));
    expect(result.current.presetsFor(COVER)[0]).toMatchObject({ name: "Mid", percent: 45 });

    await act(() => result.current.remove(half.id));
    expect(result.current.presetsFor(COVER)).toEqual([]);
  });

  it("a rejected save leaves the list unchanged", async () => {
    const api = createMockApi({ scenario: "cover-presets", actionDelayMs: 0 });
    const { result } = renderHook(() => usePresets(), { wrapper: wrapperFor(api) });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    await act(() => result.current.save({ entityId: COVER, name: "HALF", percent: 50 }));
    await expect(act(() => result.current.save({ entityId: COVER, name: "half", percent: 10 }))).rejects.toThrow("duplicate_preset");
    expect(result.current.presetsFor(COVER)).toHaveLength(1);
  });

  it("refetches when another device changes the presets (feature 138)", async () => {
    const api = createMockApi({ scenario: "cover-presets", actionDelayMs: 0 });
    const { result } = renderHook(() => usePresets(), { wrapper: wrapperFor(api) });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.presetsFor(COVER)).toEqual([]);

    await api.createPreset({ entityId: COVER, name: "Remote", percent: 30 });
    act(() => publishServerEvent({ type: "resource_changed", resource: "presets", keys: [], by: "other-device" }));
    await waitFor(() => expect(result.current.presetsFor(COVER).map((p) => p.name)).toEqual(["Remote"]));
  });
});
