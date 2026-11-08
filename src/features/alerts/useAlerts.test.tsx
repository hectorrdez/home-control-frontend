import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { ApiProvider } from "@/api/ApiContext";
import type { HomeApi } from "@/api/HomeApi";
import { createMockApi } from "@/api/mock/createMockApi";
import { ApiError, type AlertRule, type AlertRuleInput, type Entity } from "@/api/types";
import { AliasesProvider } from "@/state/AliasesProvider";
import { AlertRulesProvider, useAlertRules } from "@/state/AlertRulesProvider";
import { EntitiesProvider, useEntities } from "@/state/EntitiesProvider";
import { ToastProvider } from "@components/feedback/Toast";
import { useAlerts, type AlertCenterValue } from "./useAlerts";

// Feature 129: the monitor over the real providers. Stream events are pushed through the subscription the store
// makes, so each test controls exactly which change arrives and whether the panel caused it.
const LIGHT = "light.office_desk"; // "Office desk light", starts on, area "office", no device

interface View {
  alerts: AlertCenterValue;
  entities: ReturnType<typeof useEntities>;
  rules: AlertRule[];
  path: string;
}

let view: View;

function Probe() {
  const alerts = useAlerts();
  const entities = useEntities();
  const { rules } = useAlertRules();
  view = { alerts, entities, rules, path: useLocation().pathname };
  return null;
}

async function mount(rules: AlertRuleInput[], initialPath = "/telemetry") {
  const api = createMockApi({ actionDelayMs: 0, streamDelayMs: 0 });
  // Feature 139: a backend without /api/alerts (404) keeps the local engine these tests cover.
  api.listAlerts = () => Promise.reject(new ApiError("not_found", "alerts_not_found", 404));
  for (const rule of rules) await api.createAlertRule(rule);
  let listener: ((entity: Entity) => void) | null = null;
  const subscribe = api.subscribe.bind(api);
  api.subscribe = (onEntity, onConnection) => {
    listener = onEntity;
    return subscribe(onEntity, onConnection);
  };

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[initialPath]}>
        <ApiProvider api={api as HomeApi}>
          <ToastProvider>
            <AliasesProvider>
              <EntitiesProvider>
                <AlertRulesProvider>{children}</AlertRulesProvider>
              </EntitiesProvider>
            </AliasesProvider>
          </ToastProvider>
        </ApiProvider>
      </MemoryRouter>
    );
  }
  render(<Probe />, { wrapper: Wrapper });
  await waitFor(() => expect(view.entities.state.status).toBe("ready"));
  await waitFor(() => expect(view.rules).toHaveLength(rules.length));

  let stamp = Date.parse("2026-11-07T10:00:00.000Z");
  // A stream event for an entity: the stored copy with the patch and a newer lastChanged.
  const push = (entityId: string, patch: Partial<Entity>) => {
    const current = view.entities.state.entities[entityId];
    stamp += 1000;
    act(() => listener?.({ ...current, ...patch, lastChanged: new Date(stamp).toISOString() }));
  };
  return { api, push };
}

const rule = (trigger: AlertRuleInput["trigger"], level: AlertRuleInput["level"], extra: Partial<AlertRuleInput> = {}): AlertRuleInput => ({
  entityId: LIGHT,
  trigger,
  level,
  ...extra,
});

// Feature 140: rule setup writes config rows to the mock event log; this file checks the local (129) entries only.
const localFeed = () => view.entities.state.feed.filter((e) => !e.serverId);
// Feature 140: the mock event log persists in localStorage; each test starts with an empty server feed.
beforeEach(() => localStorage.clear());

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useAlerts (feature 129)", () => {
  it("raises nothing on the first load, even for a rule that the loaded state matches", async () => {
    await mount([rule({ type: "state_becomes", value: "on" }, "medium")]);
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(view.alerts.queue).toEqual([]);
    expect(localFeed()).toEqual([]);
    expect(screen.queryByText("Office desk light: BECOMES ON")).toBeNull();
  });

  it("MEDIUM: an external change shows a toast and a feed event, and the toast opens the device", async () => {
    const { push } = await mount([rule({ type: "state_becomes", value: "off" }, "medium")]);
    push(LIGHT, { state: "off" });

    await screen.findByText("Office desk light: BECOMES OFF");
    expect(localFeed()[0]).toMatchObject({ entityId: LIGHT, alert: "medium", value: "BECOMES OFF" });

    fireEvent.click(screen.getByRole("button", { name: /Office desk light/ }));
    expect(view.path).toBe("/devices/light.office_desk");
  });

  it("LOW: only the event feed gets it; no toast, no banner", async () => {
    const { push } = await mount([rule({ type: "state_becomes", value: "off" }, "low")]);
    push(LIGHT, { state: "off" });

    await waitFor(() => expect(localFeed()[0]?.alert).toBe("low"));
    expect(screen.queryByRole("button", { name: /Office desk light/ })).toBeNull();
    expect(view.alerts.queue).toEqual([]);
    expect(view.path).toBe("/telemetry");
  });

  it("HIGH: queues the banner, navigates to Home 3D and highlights the area", async () => {
    const { push } = await mount([rule({ type: "state_becomes", value: "off" }, "high", { message: "Desk light off" })]);
    push(LIGHT, { state: "off" });

    await waitFor(() => expect(view.alerts.queue).toHaveLength(1));
    expect(view.alerts.queue[0]).toMatchObject({ entityId: LIGHT, name: "Office desk light", text: "Desk light off" });
    expect(view.path).toBe("/");
    expect(view.entities.selectedArea).toBe("office");

    act(() => view.alerts.dismiss());
    expect(view.alerts.queue).toEqual([]);
  });

  it("HIGH on Home 3D already only highlights (no navigation)", async () => {
    const { push } = await mount([rule({ type: "state_becomes", value: "off" }, "high")], "/");
    push(LIGHT, { state: "off" });

    await waitFor(() => expect(view.alerts.queue).toHaveLength(1));
    expect(view.path).toBe("/");
    expect(view.entities.selectedArea).toBe("office");
  });

  it("queues several HIGH alerts in order and dismisses them one by one", async () => {
    const { push } = await mount([
      rule({ type: "state_becomes", value: "off" }, "high", { message: "first" }),
      rule({ type: "disconnects" }, "high", { message: "second" }),
    ]);
    push(LIGHT, { state: "off" });
    push(LIGHT, { state: "unavailable" });

    await waitFor(() => expect(view.alerts.queue.map((a) => a.text)).toEqual(["first", "second"]));
    act(() => view.alerts.dismiss());
    expect(view.alerts.queue.map((a) => a.text)).toEqual(["second"]);
  });

  it("interacted: only a change caused by the panel's own action raises the alert", async () => {
    const { push } = await mount([rule({ type: "interacted" }, "medium")]);

    push(LIGHT, { state: "off" }); // external change from another client
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    expect(localFeed().filter((e) => e.alert)).toEqual([]);

    // Outside act(): the optimistic value must reach an effect run before the confirmation, as in the browser.
    const entity = view.entities.state.entities[LIGHT];
    await view.entities.sendIntent(entity, { kind: "power", on: true });
    await screen.findByText("Office desk light: USER INTERACTS");
    expect(localFeed().filter((e) => e.alert)).toHaveLength(1);
  });

  it("dedupes the same rule within the window: one firing for a quick flip-flop", async () => {
    const { push } = await mount([rule({ type: "state_becomes", value: "on" }, "low")]);
    push(LIGHT, { state: "off" });
    push(LIGHT, { state: "on" });
    push(LIGHT, { state: "off" });
    push(LIGHT, { state: "on" });

    await waitFor(() => expect(localFeed().some((e) => e.alert === "low")).toBe(true));
    expect(localFeed().filter((e) => e.alert === "low")).toHaveLength(1);
  });

  it("enables the alarm sound with a user gesture and keeps the banner hint without Web Audio", async () => {
    const { push } = await mount([rule({ type: "state_becomes", value: "off" }, "high")]);
    act(() => view.alerts.enableSound());
    expect(view.alerts.soundEnabled).toBe(false); // jsdom has no AudioContext: stays blocked

    let beeps = 0;
    class FakeAudioContext {
      currentTime = 0;
      destination = {};
      resume() {
        return Promise.resolve();
      }
      createOscillator() {
        beeps += 1;
        return { type: "", frequency: { value: 0 }, connect() {}, start() {}, stop() {} };
      }
      createGain() {
        return { gain: { setValueAtTime() {} }, connect() {} };
      }
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    act(() => view.alerts.enableSound());
    expect(view.alerts.soundEnabled).toBe(true);

    push(LIGHT, { state: "off" });
    await waitFor(() => expect(view.alerts.queue).toHaveLength(1));
    expect(beeps).toBeGreaterThan(0);
    act(() => view.alerts.dismiss());
  });
});
