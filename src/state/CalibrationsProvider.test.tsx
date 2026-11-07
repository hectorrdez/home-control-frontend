import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import { createMockApi } from "@/api/mock/createMockApi";
import { CalibrationsProvider, useCalibrations } from "./CalibrationsProvider";

const COVER = "cover.salon_blind";

function wrapperFor(api: ReturnType<typeof createMockApi>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiProvider api={api}>
        <CalibrationsProvider>{children}</CalibrationsProvider>
      </ApiProvider>
    );
  };
}

describe("CalibrationsProvider (feature 127)", () => {
  it("loads the stored calibrations once and reports ready", async () => {
    const api = createMockApi({ scenario: "cover-calibration", actionDelayMs: 0 });
    await api.putCalibration(COVER, { openMs: 5000, closeMs: 4000 });
    const { result } = renderHook(() => useCalibrations(), { wrapper: wrapperFor(api) });

    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.calibrations[COVER]).toMatchObject({ openMs: 5000, closeMs: 4000, position: null });
  });

  it("is unavailable when the calibrations cannot be loaded (the UI stays hidden)", async () => {
    const api = createMockApi({ scenario: "error" });
    const { result } = renderHook(() => useCalibrations(), { wrapper: wrapperFor(api) });
    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.calibrations).toEqual({});
  });

  it("save and remove replace the record from the answer", async () => {
    const api = createMockApi({ scenario: "cover-calibration", actionDelayMs: 0 });
    const { result } = renderHook(() => useCalibrations(), { wrapper: wrapperFor(api) });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.save(COVER, { openMs: 6000, closeMs: 5500 });
    });
    expect(result.current.calibrations[COVER]).toMatchObject({ openMs: 6000, closeMs: 5500 });

    await act(async () => {
      await result.current.remove(COVER);
    });
    expect(result.current.calibrations).toEqual({});
  });

  it("save rejects when the write fails and keeps the record", async () => {
    const api = createMockApi({ scenario: "cover-calibration", actionDelayMs: 0 });
    const { result } = renderHook(() => useCalibrations(), { wrapper: wrapperFor(api) });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await expect(result.current.save(COVER, { openMs: 1, closeMs: 5000 })).rejects.toMatchObject({ message: "invalid_calibration" });
    expect(result.current.calibrations).toEqual({});
  });

  it("outside the provider the calibration UI is unavailable and writes reject", async () => {
    const { result } = renderHook(() => useCalibrations());
    expect(result.current.status).toBe("unavailable");
    await expect(result.current.save(COVER, { openMs: 5000, closeMs: 5000 })).rejects.toThrow("calibrations unavailable");
    await expect(result.current.remove(COVER)).rejects.toThrow("calibrations unavailable");
  });
});
