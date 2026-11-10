import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import { createMockApi } from "@/api/mock/createMockApi";
import { AliasesProvider } from "@/state/AliasesProvider";
import { EntitiesProvider, useEntities } from "@/state/EntitiesProvider";
import { ToastProvider } from "@components/feedback/Toast";
import ActuatorTile from "./ActuatorTile";

// Feature 155 + 117: the real action flow on the tile: loader while the action is in flight, success flash or
// error highlight with the toast afterwards.
const LAMP_ID = "light.kitchen_ceiling";

function LiveTile() {
  const { state } = useEntities();
  const entity = state.entities[LAMP_ID];
  return entity ? <ActuatorTile entity={entity} areaName="KITCHEN" /> : null;
}

function renderTile(scenario: "default" | "action-error" = "default") {
  const api = createMockApi({ actionDelayMs: 0, streamDelayMs: 40, scenario });
  return render(
    <MemoryRouter>
      <ApiProvider api={api}>
        <ToastProvider>
          <EntitiesProvider>
            <AliasesProvider>
              <LiveTile />
            </AliasesProvider>
          </EntitiesProvider>
        </ToastProvider>
      </ApiProvider>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

// The mock answers the areas request in microtasks; a macrotask turn lets the store finish loading first.
async function settleLoad() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

describe("ActuatorTile action feedback (155 + 117)", () => {
  it("shows the loader in place of the icon while the action runs, then flashes success", async () => {
    renderTile();
    await settleLoad();
    const tile = screen.getByRole("button", { name: "Kitchen ceiling" });

    fireEvent.click(tile);
    expect(tile.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByTestId("device-icon").querySelector('[data-testid="spinner"]')).not.toBeNull();

    await waitFor(() => expect(tile.dataset.state).toBe("on"));
    await waitFor(() => expect(screen.queryByTestId("spinner")).toBeNull());
    expect(tile.getAttribute("aria-busy")).toBeNull();
    await waitFor(() => expect(tile.dataset.feedback).toBe("success"));
  });

  it("highlights the tile as an error and shows the toast when the action fails", async () => {
    renderTile("action-error");
    await settleLoad();
    const tile = screen.getByRole("button", { name: "Kitchen ceiling" });

    fireEvent.click(tile);

    await waitFor(() => expect(screen.getByText("Could not update Kitchen ceiling")).toBeTruthy());
    expect(tile.dataset.feedback).toBe("error");
    expect(tile.dataset.state).toBe("off");
    expect(screen.queryByTestId("spinner")).toBeNull();
  });
});
