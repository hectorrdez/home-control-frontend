import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import { createMockApi } from "@/api/mock/createMockApi";
import { ApiError, type Entity } from "@/api/types";
import { AliasesProvider, useAliases } from "./AliasesProvider";

const kitchen: Entity = {
  entityId: "light.kitchen_ceiling",
  domain: "light",
  name: "Kitchen ceiling",
  state: "off",
  attributes: {},
  area: "kitchen",
  lastChanged: "2026-11-06T10:00:00.000Z",
};

function wrapperFor(api: ReturnType<typeof createMockApi>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiProvider api={api}>
        <AliasesProvider>{children}</AliasesProvider>
      </ApiProvider>
    );
  };
}

describe("AliasesProvider.renameEntity", () => {
  it("saves an alias, merges it and resolves true", async () => {
    const api = createMockApi({ actionDelayMs: 0 });
    const { result } = renderHook(() => useAliases(), { wrapper: wrapperFor(api) });
    await waitFor(() => expect(result.current.aliasesStatus).toBe("ready"));

    let ok = false;
    await act(async () => {
      ok = await result.current.renameEntity(kitchen, "  Cocina   techo ");
    });

    expect(ok).toBe(true);
    expect(result.current.aliases["light.kitchen_ceiling"]).toBe("Cocina techo");
  });

  it("resets with an empty name or the cleaned name", async () => {
    const api = createMockApi({ actionDelayMs: 0 });
    const { result } = renderHook(() => useAliases(), { wrapper: wrapperFor(api) });
    await waitFor(() => expect(result.current.aliasesStatus).toBe("ready"));
    await act(async () => {
      await result.current.renameEntity(kitchen, "Cocina techo");
    });

    await act(async () => {
      await result.current.renameEntity(kitchen, "   ");
    });

    expect(result.current.aliases["light.kitchen_ceiling"]).toBeUndefined();
  });

  it("rolls back and resolves false when the save fails", async () => {
    const api = createMockApi({ actionDelayMs: 0, scenario: "alias-error" });
    const { result } = renderHook(() => useAliases(), { wrapper: wrapperFor(api) });
    await waitFor(() => expect(result.current.aliasesStatus).toBe("ready"));

    let ok = true;
    await act(async () => {
      ok = await result.current.renameEntity(kitchen, "Cocina techo");
    });

    expect(ok).toBe(false);
    expect(result.current.aliases["light.kitchen_ceiling"]).toBeUndefined();
  });

  it("resolves true without a request when the name is unchanged", async () => {
    const api = createMockApi({ actionDelayMs: 0 });
    const setAlias = vi.spyOn(api, "setAlias");
    const deleteAlias = vi.spyOn(api, "deleteAlias");
    const { result } = renderHook(() => useAliases(), { wrapper: wrapperFor(api) });
    await waitFor(() => expect(result.current.aliasesStatus).toBe("ready"));

    await act(async () => {
      expect(await result.current.renameEntity(kitchen, "Kitchen ceiling")).toBe(true);
      expect(await result.current.renameEntity(kitchen, "")).toBe(true);
    });

    expect(setAlias).not.toHaveBeenCalled();
    expect(deleteAlias).not.toHaveBeenCalled();
  });

  it("refuses renames without a request when the backend has no aliases endpoint", async () => {
    const api = createMockApi({ actionDelayMs: 0 });
    vi.spyOn(api, "getAliases").mockRejectedValue(new ApiError("not_found", "missing", 404));
    const setAlias = vi.spyOn(api, "setAlias");
    const { result } = renderHook(() => useAliases(), { wrapper: wrapperFor(api) });
    await waitFor(() => expect(result.current.aliasesStatus).toBe("unavailable"));

    let ok = true;
    await act(async () => {
      ok = await result.current.renameEntity(kitchen, "Cocina");
    });
    expect(ok).toBe(false);
    expect(setAlias).not.toHaveBeenCalled();
  });

  it("marks aliases unavailable when the backend has no aliases endpoint, and retry reloads", async () => {
    const api = createMockApi({ actionDelayMs: 0 });
    const getAliases = vi
      .spyOn(api, "getAliases")
      .mockRejectedValueOnce(new ApiError("not_found", "missing", 404))
      .mockResolvedValue([{ entityId: "light.kitchen_ceiling", alias: "Cocina" }]);
    const { result } = renderHook(() => useAliases(), { wrapper: wrapperFor(api) });
    await waitFor(() => expect(result.current.aliasesStatus).toBe("unavailable"));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.aliasesStatus).toBe("ready"));
    expect(result.current.aliases["light.kitchen_ceiling"]).toBe("Cocina");
    expect(getAliases).toHaveBeenCalledTimes(2);
  });

  it("keeps cleaned names with status error when loading fails for another reason", async () => {
    const api = createMockApi({ actionDelayMs: 0 });
    vi.spyOn(api, "getAliases").mockRejectedValue(new ApiError("server", "boom", 500));
    const { result } = renderHook(() => useAliases(), { wrapper: wrapperFor(api) });
    await waitFor(() => expect(result.current.aliasesStatus).toBe("error"));
    expect(result.current.aliases).toEqual({});
  });

  it("keeps a newer rename when an older save resolves last", async () => {
    const api = createMockApi({ actionDelayMs: 0 });
    let releaseFirst: (list: { entityId: string; alias: string }[]) => void = () => undefined;
    vi.spyOn(api, "setAlias")
      .mockImplementationOnce(() => new Promise((ok) => (releaseFirst = ok)))
      .mockImplementationOnce(async (entityId, alias) => [{ entityId, alias }]);
    const { result } = renderHook(() => useAliases(), { wrapper: wrapperFor(api) });
    await waitFor(() => expect(result.current.aliasesStatus).toBe("ready"));

    let first!: Promise<boolean>;
    await act(async () => {
      first = result.current.renameEntity(kitchen, "Primero");
      await result.current.renameEntity(kitchen, "Segundo");
    });
    // The older save answers last with a stale list: it must not overwrite the newer rename.
    await act(async () => {
      releaseFirst([{ entityId: "light.kitchen_ceiling", alias: "Primero" }]);
      await first;
    });

    expect(result.current.aliases["light.kitchen_ceiling"]).toBe("Segundo");
  });
});
