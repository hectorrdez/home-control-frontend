import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import type { HomeApi } from "@/api/HomeApi";
import { ApiError, type HistorySeries } from "@/api/types";
import { useHistory } from "./useHistory";

// Each test uses its own entity ids: the cache is module-level and lives for the whole file.
let seq = 0;
const ids = () => [`sensor.history_${++seq}`];

const series = (entityId: string): HistorySeries => ({
  entityId,
  unit: null,
  points: [{ t: "2026-11-06T10:00:00.000Z", v: 21 }],
});

function wrapperFor(getHistory: HomeApi["getHistory"]) {
  const api = { getHistory } as unknown as HomeApi;
  return function Wrapper({ children }: { children: ReactNode }) {
    return <ApiProvider api={api}>{children}</ApiProvider>;
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useHistory", () => {
  it("is ready with no series when there are no entities", () => {
    const getHistory = vi.fn();
    const { result } = renderHook(() => useHistory([], 24), { wrapper: wrapperFor(getHistory) });
    expect(result.current.state).toEqual({ status: "ready", series: [] });
    expect(getHistory).not.toHaveBeenCalled();
  });

  it("loads the series and reports ready", async () => {
    const entityIds = ids();
    const getHistory = vi.fn(async (requested: string[]) => requested.map(series));
    const { result } = renderHook(() => useHistory(entityIds, 6), { wrapper: wrapperFor(getHistory) });

    expect(result.current.state).toEqual({ status: "loading" });
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(getHistory).toHaveBeenCalledWith(entityIds, 6);
  });

  it("serves a fresh cached result without fetching again", async () => {
    const entityIds = ids();
    const getHistory = vi.fn(async (requested: string[]) => requested.map(series));
    const first = renderHook(() => useHistory(entityIds, 24), { wrapper: wrapperFor(getHistory) });
    await waitFor(() => expect(first.result.current.state.status).toBe("ready"));
    first.unmount();

    const again = renderHook(() => useHistory(entityIds, 24), { wrapper: wrapperFor(getHistory) });
    expect(again.result.current.state.status).toBe("ready");
    expect(getHistory).toHaveBeenCalledOnce();
  });

  it("refetches once the cached entry is older than the cache window", async () => {
    const entityIds = ids();
    const getHistory = vi.fn(async (requested: string[]) => requested.map(series));
    const first = renderHook(() => useHistory(entityIds, 24), { wrapper: wrapperFor(getHistory) });
    await waitFor(() => expect(first.result.current.state.status).toBe("ready"));
    first.unmount();

    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 61_000);
    const later = renderHook(() => useHistory(entityIds, 24), { wrapper: wrapperFor(getHistory) });
    await waitFor(() => expect(getHistory).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(later.result.current.state.status).toBe("ready"));
  });

  it("reports unavailable when the backend has no history endpoint (404)", async () => {
    const getHistory = vi.fn(async () => {
      throw new ApiError("not_found", "history_not_found", 404);
    });
    const entityIds = ids();
    const { result } = renderHook(() => useHistory(entityIds, 24), { wrapper: wrapperFor(getHistory) });
    await waitFor(() => expect(result.current.state).toEqual({ status: "unavailable" }));
  });

  it("reports error for any other failure", async () => {
    const getHistory = vi.fn(async () => {
      throw new ApiError("server", "boom", 500);
    });
    const entityIds = ids();
    const { result } = renderHook(() => useHistory(entityIds, 24), { wrapper: wrapperFor(getHistory) });
    await waitFor(() => expect(result.current.state).toEqual({ status: "error" }));
  });

  it("retry drops the cache entry and fetches again", async () => {
    const entityIds = ids();
    const getHistory = vi
      .fn<HomeApi["getHistory"]>()
      .mockRejectedValueOnce(new ApiError("network", "offline"))
      .mockImplementation(async (requested) => requested.map(series));
    const { result } = renderHook(() => useHistory(entityIds, 24), { wrapper: wrapperFor(getHistory) });
    await waitFor(() => expect(result.current.state.status).toBe("error"));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(getHistory).toHaveBeenCalledTimes(2);
  });

  it("ignores a response that arrives after the request was superseded", async () => {
    const entityIds = ids();
    let resolveFirst: (value: HistorySeries[]) => void = () => undefined;
    const getHistory = vi
      .fn<HomeApi["getHistory"]>()
      .mockImplementationOnce(() => new Promise((ok) => (resolveFirst = ok)))
      .mockImplementation(async (requested) => requested.map(series));
    const { result, unmount } = renderHook(() => useHistory(entityIds, 24), { wrapper: wrapperFor(getHistory) });
    unmount();

    await act(async () => resolveFirst([series(entityIds[0])]));
    expect(getHistory).toHaveBeenCalledOnce();
    expect(result.current.state).toEqual({ status: "loading" });
  });

  it("ignores a failure that arrives after unmount", async () => {
    let rejectFirst: (err: unknown) => void = () => undefined;
    const getHistory = vi.fn<HomeApi["getHistory"]>().mockImplementation(() => new Promise((_, no) => (rejectFirst = no)));
    const entityIds = ids();
    const { result, unmount } = renderHook(() => useHistory(entityIds, 24), { wrapper: wrapperFor(getHistory) });
    unmount();

    await act(async () => rejectFirst(new ApiError("server", "late")));
    expect(result.current.state).toEqual({ status: "loading" });
  });
});
