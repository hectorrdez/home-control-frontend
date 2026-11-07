import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import type { HomeApi } from "@/api/HomeApi";
import { createMockApi } from "@/api/mock/createMockApi";
import type { Entity } from "@/api/types";
import { AlertRulesProvider } from "@/state/AlertRulesProvider";
import { ToastProvider } from "@components/feedback/Toast";
import AlertRulesPanel from "./AlertRulesPanel";

// Feature 128: the ALERTS section of a device page. Mock API; failures are injected by overriding one method.
const light: Entity = {
  entityId: "light.office_desk",
  domain: "light",
  name: "Office desk light",
  state: "on",
  attributes: {},
  area: "office",
  lastChanged: "2026-11-07T10:00:00.000Z",
};
const sensor: Entity = { ...light, entityId: "sensor.office_temp", domain: "sensor", name: "Office temperature", state: "21", attributes: { unit_of_measurement: "°C" } };

afterEach(cleanup);

function renderPanel(entity: Entity, api: HomeApi = createMockApi({ actionDelayMs: 0 })) {
  render(
    <ApiProvider api={api}>
      <ToastProvider>
        <AlertRulesProvider>
          <AlertRulesPanel entity={entity} />
        </AlertRulesProvider>
      </ToastProvider>
    </ApiProvider>,
  );
  return api;
}

// The add form, once it is open.
const form = () => screen.getByRole("form", { name: "New alert" });
const list = () => screen.getByRole("list");

async function openForm() {
  fireEvent.click(await screen.findByRole("button", { name: "ADD ALERT" }));
}

// Picks a level inside the add form (the form's group is named "Level").
function pickFormLevel(name: string) {
  fireEvent.click(within(within(form()).getByRole("group", { name: "Level" })).getByRole("button", { name }));
}

async function saveAlert() {
  fireEvent.click(within(form()).getByRole("button", { name: "SAVE ALERT" }));
}

describe("AlertRulesPanel (feature 128)", () => {
  it("says ALERTS UNAVAILABLE when the rules cannot be loaded", async () => {
    renderPanel(light, createMockApi({ scenario: "error" }));
    expect(await screen.findByText("ALERTS UNAVAILABLE")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "ADD ALERT" })).toBeNull();
  });

  it("is unavailable outside the provider", () => {
    render(
      <ToastProvider>
        <AlertRulesPanel entity={light} />
      </ToastProvider>,
    );
    expect(screen.getByText("ALERTS UNAVAILABLE")).toBeTruthy();
  });

  it("starts with NO ALERTS and offers ADD ALERT", async () => {
    renderPanel(light);
    expect(await screen.findByText("NO ALERTS")).toBeTruthy();
    expect(screen.getByRole("button", { name: "ADD ALERT" })).toBeTruthy();
  });

  it("adds a connects alert at the chosen level and shows it as a row", async () => {
    renderPanel(light);
    await openForm();
    pickFormLevel("HIGH");
    await saveAlert();
    expect(await screen.findByRole("list")).toBeTruthy();
    expect(within(list()).getByText("CONNECTS")).toBeTruthy();
    const row = within(list()).getByRole("listitem");
    const high = within(within(row).getByRole("group", { name: "Level for CONNECTS" })).getByRole("button", { name: "HIGH" });
    expect(high.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("form", { name: "New alert" })).toBeNull();
  });

  it("changes the level of a row at once", async () => {
    renderPanel(light);
    await openForm();
    await saveAlert();
    const group = await screen.findByRole("group", { name: "Level for CONNECTS" });
    fireEvent.click(within(group).getByRole("button", { name: "LOW" }));
    expect(within(group).getByRole("button", { name: "LOW" }).getAttribute("aria-pressed")).toBe("true");
    // Clicking the selected level again changes nothing.
    fireEvent.click(within(group).getByRole("button", { name: "LOW" }));
    expect(within(group).getByRole("button", { name: "LOW" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("shows a toast and keeps the old level when the level change fails", async () => {
    const api = createMockApi({ actionDelayMs: 0 });
    const failing: HomeApi = { ...api, updateAlertRule: () => Promise.reject(new Error("alert_rules_write_failed")) };
    renderPanel(light, failing);
    await openForm();
    await saveAlert();
    const group = await screen.findByRole("group", { name: "Level for CONNECTS" });
    fireEvent.click(within(group).getByRole("button", { name: "OFF" }));
    expect(await screen.findByText("Could not change the alert on Office desk light")).toBeTruthy();
    expect(within(group).getByRole("button", { name: "MEDIUM" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("deletes a row", async () => {
    renderPanel(light);
    await openForm();
    await saveAlert();
    fireEvent.click(await screen.findByRole("button", { name: "DELETE" }));
    expect(await screen.findByText("NO ALERTS")).toBeTruthy();
  });

  it("toasts when a delete fails and keeps the row", async () => {
    const api = createMockApi({ actionDelayMs: 0 });
    const failing: HomeApi = { ...api, deleteAlertRule: () => Promise.reject(new Error("alert_rules_write_failed")) };
    renderPanel(light, failing);
    await openForm();
    await saveAlert();
    fireEvent.click(await screen.findByRole("button", { name: "DELETE" }));
    expect(await screen.findByText("Could not delete the alert on Office desk light")).toBeTruthy();
    expect(within(list()).getByText("CONNECTS")).toBeTruthy();
  });

  it("explains a duplicate trigger with the duplicate_rule message", async () => {
    renderPanel(light);
    await openForm();
    await saveAlert();
    await screen.findByRole("list");
    await openForm();
    await saveAlert();
    expect(await screen.findByText("AN ALERT FOR THIS TRIGGER ALREADY EXISTS")).toBeTruthy();
    expect(screen.getByRole("form", { name: "New alert" })).toBeTruthy();
  });

  it("shows a generic message when the save fails for another reason", async () => {
    const api = createMockApi({ actionDelayMs: 0 });
    const failing: HomeApi = { ...api, createAlertRule: () => Promise.reject(new Error("alert_rules_write_failed")) };
    renderPanel(light, failing);
    await openForm();
    await saveAlert();
    expect(await screen.findByText("COULD NOT SAVE THE ALERT")).toBeTruthy();
  });

  it("asks for a value when the trigger needs one", async () => {
    renderPanel(light);
    await openForm();
    fireEvent.change(within(form()).getByRole("combobox", { name: "Trigger" }), { target: { value: "state_becomes" } });
    await saveAlert();
    expect(await screen.findByText("ENTER A VALUE")).toBeTruthy();
  });

  it("creates a state alert from the entity's real states and keeps the optional message", async () => {
    renderPanel(light);
    await openForm();
    fireEvent.change(within(form()).getByRole("combobox", { name: "Trigger" }), { target: { value: "state_becomes" } });
    fireEvent.change(within(form()).getByRole("combobox", { name: "Value" }), { target: { value: "off" } });
    fireEvent.change(within(form()).getByRole("textbox", { name: "Message (optional)" }), { target: { value: "  Lamp went off " } });
    await saveAlert();
    expect(await screen.findByText("BECOMES OFF")).toBeTruthy();
    expect(screen.getByText("Lamp went off")).toBeTruthy();
  });

  it("creates an above alert on a numeric sensor with its unit", async () => {
    renderPanel(sensor);
    await openForm();
    fireEvent.change(within(form()).getByRole("combobox", { name: "Trigger" }), { target: { value: "above" } });
    fireEvent.change(within(form()).getByRole("spinbutton", { name: "Value in °C" }), { target: { value: "24.5" } });
    await saveAlert();
    expect(await screen.findByText("ABOVE 24.5 °C")).toBeTruthy();
  });

  it("asks for a number on a below trigger when the value is blank", async () => {
    renderPanel(sensor);
    await openForm();
    fireEvent.change(within(form()).getByRole("combobox", { name: "Trigger" }), { target: { value: "below" } });
    await saveAlert();
    expect(await screen.findByText("ENTER A VALUE")).toBeTruthy();
  });

  it("closes the add form on CANCEL without saving", async () => {
    renderPanel(light);
    await openForm();
    fireEvent.click(within(form()).getByRole("button", { name: "CANCEL" }));
    expect(screen.queryByRole("form", { name: "New alert" })).toBeNull();
    expect(screen.getByText("NO ALERTS")).toBeTruthy();
  });

  it("only shows the rules of its own entity", async () => {
    const api = createMockApi({ actionDelayMs: 0 });
    await api.createAlertRule({ entityId: "switch.other", trigger: { type: "connects" }, level: "low" });
    renderPanel(light, api);
    expect(await screen.findByText("NO ALERTS")).toBeTruthy();
  });
});
