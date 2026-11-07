import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import type { HomeApi } from "@/api/HomeApi";
import { createMockApi } from "@/api/mock/createMockApi";
import { AlertRulesProvider, useAlertRules } from "./AlertRulesProvider";

const LIGHT = "light.office_desk";
const connects = { entityId: LIGHT, trigger: { type: "connects" as const }, level: "low" as const };

function wrapperFor(api: HomeApi) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiProvider api={api}>
        <AlertRulesProvider>{children}</AlertRulesProvider>
      </ApiProvider>
    );
  };
}

// Renders the hook over `api` and waits until the stored rules are loaded.
async function loaded(api: HomeApi) {
  const hook = renderHook(() => useAlertRules(), { wrapper: wrapperFor(api) });
  await waitFor(() => expect(hook.result.current.status).toBe("ready"));
  return hook.result;
}

describe("AlertRulesProvider (feature 128)", () => {
  it("loads the stored rules once and reports ready", async () => {
    const api = createMockApi({ actionDelayMs: 0 });
    await api.createAlertRule(connects);
    const result = await loaded(api);
    expect(result.current.rules).toHaveLength(1);
  });

  it("is unavailable when the rules cannot be loaded", async () => {
    const hook = renderHook(() => useAlertRules(), { wrapper: wrapperFor(createMockApi({ scenario: "error" })) });
    await waitFor(() => expect(hook.result.current.status).toBe("unavailable"));
    expect(hook.result.current.rules).toEqual([]);
  });

  it("outside the provider the rules are unavailable and writes reject", async () => {
    const hook = renderHook(() => useAlertRules());
    expect(hook.result.current.status).toBe("unavailable");
    await expect(hook.result.current.create(connects)).rejects.toThrow();
    await expect(hook.result.current.remove("x")).rejects.toThrow();
  });

  it("create appends the stored rule", async () => {
    const result = await loaded(createMockApi({ actionDelayMs: 0 }));
    await act(async () => {
      await result.current.create({ ...connects, trigger: { type: "disconnects" } });
    });
    expect(result.current.rules.map((r) => r.trigger.type)).toEqual(["disconnects"]);
  });

  it("create rejects a duplicate and keeps the list", async () => {
    const result = await loaded(createMockApi({ actionDelayMs: 0 }));
    await act(async () => {
      await result.current.create(connects);
    });
    await expect(act(() => result.current.create({ ...connects, level: "high" }))).rejects.toMatchObject({ message: "duplicate_rule" });
    expect(result.current.rules).toHaveLength(1);
  });

  it("update shows the new level at once and keeps the stored answer", async () => {
    const result = await loaded(createMockApi({ actionDelayMs: 0 }));
    await act(async () => {
      await result.current.create(connects);
    });
    const rule = result.current.rules[0];
    await act(async () => {
      await result.current.update({ ...rule, level: "high" });
    });
    expect(result.current.rules[0]).toMatchObject({ id: rule.id, level: "high" });
  });

  it("update restores the previous rule and rejects when the write fails", async () => {
    const api = createMockApi({ actionDelayMs: 0 });
    await api.createAlertRule(connects);
    const failing: HomeApi = { ...api, updateAlertRule: () => Promise.reject(new Error("alert_rules_write_failed")) };
    const result = await loaded(failing);
    await expect(act(() => result.current.update({ ...result.current.rules[0], level: "off" }))).rejects.toThrow("alert_rules_write_failed");
    expect(result.current.rules[0].level).toBe("low");
  });

  it("remove drops the rule at once and deletes it on the server", async () => {
    const result = await loaded(createMockApi({ actionDelayMs: 0 }));
    await act(async () => {
      await result.current.create(connects);
    });
    await act(async () => {
      await result.current.remove(result.current.rules[0].id);
    });
    expect(result.current.rules).toEqual([]);
  });

  it("remove puts the rule back when the delete fails", async () => {
    const api = createMockApi({ actionDelayMs: 0 });
    await api.createAlertRule(connects);
    const failing: HomeApi = { ...api, deleteAlertRule: () => Promise.reject(new Error("alert_rules_write_failed")) };
    const result = await loaded(failing);
    const id = result.current.rules[0].id;
    await expect(act(() => result.current.remove(id))).rejects.toThrow("alert_rules_write_failed");
    expect(result.current.rules.map((r) => r.id)).toEqual([id]);
  });
});
