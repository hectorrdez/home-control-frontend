import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiProvider } from "./ApiContext";
import type { HomeApi } from "./HomeApi";
import { useHaStatus, HA_STATUS_POLL_MS } from "./useHaStatus";
import { ApiError, type HaStatus } from "./types";

function fakeApi(getStatus: () => Promise<HaStatus>): HomeApi {
  return {
    getStatus,
    getAreas: vi.fn(),
    getEntities: vi.fn(),
    runAction: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
    getHistory: vi.fn(),
  } as unknown as HomeApi;
}

const wrap = (api: HomeApi) => ({ children }: { children: ReactNode }) =>
  <ApiProvider api={api}>{children}</ApiProvider>;

describe("useHaStatus", () => {
  it("starts connecting, then reports online with the HA version", async () => {
    const api = fakeApi(async () => ({ online: true, message: "ok", version: "2026.11.0" }));
    const { result } = renderHook(() => useHaStatus(), { wrapper: wrap(api) });

    expect(result.current).toEqual({ state: "connecting", version: null });
    await waitFor(() => expect(result.current).toEqual({ state: "online", version: "2026.11.0" }));
  });

  it("reports offline without a version when HA is unreachable", async () => {
    const api = fakeApi(async () => ({ online: false, message: "down", version: "2026.11.0" }));
    const { result } = renderHook(() => useHaStatus(), { wrapper: wrap(api) });

    await waitFor(() => expect(result.current).toEqual({ state: "offline", version: null }));
  });

  it("maps a rejected token to unauthorized and any other failure to offline", async () => {
    const denied = fakeApi(async () => {
      throw new ApiError("unauthorized", "bad token", 401);
    });
    const first = renderHook(() => useHaStatus(), { wrapper: wrap(denied) });
    await waitFor(() => expect(first.result.current.state).toBe("unauthorized"));

    const broken = fakeApi(async () => {
      throw new Error("boom");
    });
    const second = renderHook(() => useHaStatus(), { wrapper: wrap(broken) });
    await waitFor(() => expect(second.result.current.state).toBe("offline"));
  });

  it("polls the status on the configured interval and stops after unmount", async () => {
    vi.useFakeTimers();
    try {
      const getStatus = vi.fn(async () => ({ online: true, message: "ok", version: "1" }));
      const api = fakeApi(getStatus);
      const { unmount } = renderHook(() => useHaStatus(1000), { wrapper: wrap(api) });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(getStatus).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(getStatus).toHaveBeenCalledTimes(3);

      unmount();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(getStatus).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses a 30 second default poll interval", () => {
    expect(HA_STATUS_POLL_MS).toBe(30_000);
  });

  it("ignores a late answer that arrives after unmount", async () => {
    let resolve!: (s: HaStatus) => void;
    const api = fakeApi(() => new Promise<HaStatus>((r) => (resolve = r)));
    const { result, unmount } = renderHook(() => useHaStatus(), { wrapper: wrap(api) });
    unmount();

    await act(async () => {
      resolve({ online: true, message: "ok", version: "late" });
    });
    expect(result.current).toEqual({ state: "connecting", version: null });
  });
});
