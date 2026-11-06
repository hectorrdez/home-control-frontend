import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import { createMockApi } from "@/api/mock/createMockApi";
import type { Entity } from "@/api/types";
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
});
