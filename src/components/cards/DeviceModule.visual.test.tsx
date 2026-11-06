import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import { createMockApi } from "@/api/mock/createMockApi";
import type { Entity } from "@/api/types";
import { AliasesProvider } from "@/state/AliasesProvider";
import { EntitiesProvider } from "@/state/EntitiesProvider";
import { ToastProvider } from "@components/feedback/Toast";
import DeviceModule from "./DeviceModule";

const light = (state: string): Entity => ({
  entityId: "light.kitchen_ceiling",
  domain: "light",
  name: "Kitchen ceiling",
  state,
  attributes: {},
  area: "kitchen",
  lastChanged: "2026-11-06T10:00:00.000Z",
});

function renderCard(entity: Entity, drawText?: string) {
  const api = createMockApi({ actionDelayMs: 0 });
  render(
    <ApiProvider api={api}>
      <ToastProvider>
        <EntitiesProvider>
          <AliasesProvider>
            <DeviceModule entity={entity} areaName="Kitchen" drawText={drawText} />
          </AliasesProvider>
        </EntitiesProvider>
      </ToastProvider>
    </ApiProvider>,
  );
  return screen.getByRole("article", { name: "Kitchen ceiling" });
}

describe("DeviceModule visual state", () => {
  afterEach(() => cleanup());

  it("lights the card and icon halo when the light is on", () => {
    const card = renderCard(light("on"));
    expect(card.dataset.state).toBe("on");
    expect(card.className).toContain("border-l-primary-container");
    expect(card.className).toContain("from-primary-container/10");
    expect(screen.getByTestId("device-icon").className).toContain("shadow-glow-primary");
    expect(screen.getByRole("switch", { name: "Kitchen ceiling power" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("ON")).toBeTruthy();
  });

  it("keeps the card flat with no halo when the light is off", () => {
    const card = renderCard(light("off"));
    expect(card.dataset.state).toBe("off");
    expect(card.className).not.toContain("border-l-primary-container");
    expect(card.className).not.toContain("bg-linear-to-br");
    expect(screen.getByTestId("device-icon").className).not.toContain("shadow-glow-primary");
    expect(screen.getByRole("switch", { name: "Kitchen ceiling power" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("OFF")).toBeTruthy();
  });

  it("dims unavailable state without lighting its icon", () => {
    const card = renderCard(light("unavailable"));
    expect(card.dataset.state).toBe("unavailable");
    expect(card.className).toContain("border-error/40");
    expect(screen.getByTestId("device-icon").className).not.toContain("shadow-glow-primary");
    expect(screen.getByText("UNAVAILABLE")).toBeTruthy();
  });

  it("retains the plug draw metric", () => {
    renderCard({ ...light("on"), domain: "switch" }, "42 W");
    expect(screen.getByText("DRAW METRIC 42 W")).toBeTruthy();
  });
});
