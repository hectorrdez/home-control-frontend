import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import { createMockApi } from "@/api/mock/createMockApi";
import type { Entity } from "@/api/types";
import { AliasesProvider } from "@/state/AliasesProvider";
import { EntitiesProvider } from "@/state/EntitiesProvider";
import { ToastProvider } from "@components/feedback/Toast";
import DeviceModule from "./DeviceModule";

const kitchen: Entity = {
  entityId: "light.kitchen_ceiling",
  domain: "light",
  name: "Kitchen ceiling",
  state: "off",
  attributes: {},
  area: "kitchen",
  lastChanged: "2026-11-06T10:00:00.000Z",
};

describe("DeviceModule rename wiring", () => {
  it("applies the alias to the card and closes the editor on Enter", async () => {
    const api = createMockApi({ actionDelayMs: 0 });
    render(
      <ApiProvider api={api}>
        <ToastProvider>
          <EntitiesProvider>
            <AliasesProvider>
              <DeviceModule entity={kitchen} areaName="Kitchen" />
            </AliasesProvider>
          </EntitiesProvider>
        </ToastProvider>
      </ApiProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Rename Kitchen ceiling" }));
    const input = screen.getByRole("textbox", { name: "Name for light.kitchen_ceiling" });
    fireEvent.change(input, { target: { value: "Cocina techo" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(screen.queryByRole("textbox")).toBeNull());
    expect(screen.getByRole("article", { name: "Cocina techo" })).toBeTruthy();
  });
});
