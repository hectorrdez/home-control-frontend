import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getClientId } from "@/api/clientIdentity";
import { publishServerEvent, publishStreamState } from "@/api/serverEvents";
import type { ServerEvent } from "@/api/types";
import { useLiveRefetch } from "./useLiveRefetch";

const changed = (resource: "aliases" | "calibrations" | "alert_rules", by: string | null = "other-device"): ServerEvent => ({
  type: "resource_changed",
  resource,
  keys: [],
  by,
});

function mountWith(resource: "aliases" | "calibrations" | "alert_rules", load: () => Promise<unknown>) {
  return renderHook(() => useLiveRefetch(resource, load));
}

beforeEach(() => {
  vi.useFakeTimers();
  publishStreamState("open");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useLiveRefetch", () => {
  it("refetches once when another device changes the resource", async () => {
    const load = vi.fn(() => Promise.resolve());
    mountWith("aliases", load);
    act(() => publishServerEvent(changed("aliases")));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("coalesces three frames within 100 ms into one request", async () => {
    const load = vi.fn(() => Promise.resolve());
    mountWith("aliases", load);
    await act(async () => {
      publishServerEvent(changed("aliases"));
      await vi.advanceTimersByTimeAsync(30);
      publishServerEvent(changed("aliases"));
      await vi.advanceTimersByTimeAsync(30);
      publishServerEvent(changed("aliases"));
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not refetch for its own change", async () => {
    const load = vi.fn(() => Promise.resolve());
    mountWith("aliases", load);
    act(() => publishServerEvent(changed("aliases", getClientId())));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(load).not.toHaveBeenCalled();
  });

  it("ignores other resources", async () => {
    const load = vi.fn(() => Promise.resolve());
    mountWith("calibrations", load);
    act(() => publishServerEvent(changed("alert_rules")));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(load).not.toHaveBeenCalled();
  });

  it("refetches once after a stream reconnect", async () => {
    const load = vi.fn(() => Promise.resolve());
    mountWith("alert_rules", load);
    act(() => publishStreamState("reconnecting"));
    act(() => publishStreamState("open"));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("schedules one more refetch when a change arrives during a request", async () => {
    let finish: () => void = () => undefined;
    const load = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    mountWith("aliases", load);
    act(() => publishServerEvent(changed("aliases")));
    await act(() => vi.advanceTimersByTimeAsync(300));
    act(() => publishServerEvent(changed("aliases")));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("a failed refetch does not throw and the next frame retries", async () => {
    const load = vi.fn(() => Promise.reject(new Error("offline")));
    mountWith("aliases", load);
    act(() => publishServerEvent(changed("aliases")));
    await act(() => vi.advanceTimersByTimeAsync(300));
    act(() => publishServerEvent(changed("aliases")));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(load).toHaveBeenCalledTimes(2);
  });
});
