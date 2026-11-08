import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import type { HomeApi } from "@/api/HomeApi";
import { ApiError, type ConnectionState, type HaStatus } from "@/api/types";
import { EntitiesProvider } from "@/state/EntitiesProvider";
import HaStatusLine from "./HaStatusLine";

afterEach(cleanup);

// A HomeApi whose status is set per test; subscribe exposes the stream connection callback.
function harness(status: () => Promise<HaStatus>) {
  let onConnection: (s: ConnectionState) => void = () => undefined;
  const api = {
    getStatus: vi.fn(status),
    getAreas: vi.fn(async () => []),
    getEntities: vi.fn(),
    runAction: vi.fn(),
    getHistory: vi.fn(async () => []),
    listEvents: vi.fn(async () => []),
    getAliases: vi.fn(async () => []),
    setAlias: vi.fn(),
    deleteAlias: vi.fn(),
    subscribe: vi.fn((_e: unknown, c: (s: ConnectionState) => void) => {
      onConnection = c;
      return () => undefined;
    }),
  } as unknown as HomeApi;
  return { api, emit: (s: ConnectionState) => act(() => onConnection(s)) };
}

function renderLine(api: HomeApi) {
  return render(
    <ApiProvider api={api}>
      <EntitiesProvider>
        <HaStatusLine />
      </EntitiesProvider>
    </ApiProvider>,
  );
}

const label = () => screen.getByRole("status", { name: "Home Assistant status" });

describe("HaStatusLine", () => {
  it("starts in CONNECTING until the first status check answers", async () => {
    const h = harness(() => new Promise<HaStatus>(() => undefined));
    renderLine(h.api);
    expect(label().textContent).toBe("CONNECTING");
  });

  it("shows the HA version when online", async () => {
    const h = harness(async () => ({ online: true, message: "ok", version: "2026.4.1" }));
    renderLine(h.api);
    expect(await screen.findByText("ONLINE // HA 2026.4.1")).toBeTruthy();
  });

  it("shows plain ONLINE when online without a version", async () => {
    const h = harness(async () => ({ online: true, message: "ok", version: null }));
    renderLine(h.api);
    expect(await screen.findByText("ONLINE")).toBeTruthy();
  });

  it("shows OFFLINE when HA reports offline or the check fails for another reason", async () => {
    renderLine(harness(async () => ({ online: false, message: "down", version: null })).api);
    expect(await screen.findByText("OFFLINE")).toBeTruthy();
    cleanup();

    renderLine(harness(() => Promise.reject(new ApiError("network", "boom"))).api);
    expect(await screen.findByText("OFFLINE")).toBeTruthy();
  });

  it("shows UNAUTHORIZED when the token is rejected", async () => {
    const h = harness(() => Promise.reject(new ApiError("unauthorized", "401", 401)));
    renderLine(h.api);
    expect(await screen.findByText("UNAUTHORIZED")).toBeTruthy();
  });

  it("shows RECONNECTING and keeps the header label while the stream is stale", async () => {
    const h = harness(async () => ({ online: true, message: "ok", version: "2026.4.1" }));
    renderLine(h.api);
    await screen.findByText("ONLINE // HA 2026.4.1");

    h.emit("reconnecting");
    expect(screen.getByRole("status", { name: "Live updates" }).textContent).toBe("RECONNECTING");
    expect(label().textContent).toBe("ONLINE // HA 2026.4.1");

    h.emit("open");
    expect(screen.queryByRole("status", { name: "Live updates" })).toBeNull();
  });
});
