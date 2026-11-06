import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import { createMockApi } from "@/api/mock/createMockApi";
import { AliasesProvider } from "@/state/AliasesProvider";
import { EntitiesProvider, useEntities } from "@/state/EntitiesProvider";
import { ToastProvider } from "@components/feedback/Toast";
import DeviceModule from "./DeviceModule";

// Feature 117: the card shows the loader while an action is in flight, a success flash or error highlight after,
// and keeps an accessible live status ("SENDING" / "UPDATING") instead of the old chip.
const LAMP_ID = "light.kitchen_ceiling";

// Like the device deck: the card gets the entity from the store, so optimistic values show.
function LiveCard() {
  const { state } = useEntities();
  const entity = state.entities[LAMP_ID];
  return entity ? <DeviceModule entity={entity} areaName="Kitchen" /> : null;
}

function renderCard(scenario: "default" | "action-error" = "default", streamDelayMs = 40) {
  const api = createMockApi({ actionDelayMs: 0, streamDelayMs, scenario });
  return render(
    <ApiProvider api={api}>
      <ToastProvider>
        <EntitiesProvider>
          <AliasesProvider>
            <LiveCard />
          </AliasesProvider>
        </EntitiesProvider>
      </ToastProvider>
    </ApiProvider>,
  );
}

afterEach(cleanup);

// The mock answers the areas request in microtasks; a macrotask turn lets the store finish loading first.
async function settleLoad() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

describe("DeviceModule action feedback (117)", () => {
  it("shows the loader on the switch and a live status while the action settles, then flashes success", async () => {
    renderCard();
    await settleLoad();
    const power = screen.getByRole("switch", { name: "Kitchen ceiling power" });

    fireEvent.click(power);
    expect(power.getAttribute("aria-busy")).toBe("true");
    expect(power.querySelector('[data-testid="spinner"]')).not.toBeNull(); // the loader sits inside the switch
    expect(screen.getByText("SENDING", { selector: "[aria-live]" })).toBeTruthy();

    await waitFor(() => expect(power.getAttribute("aria-checked")).toBe("true"));
    await waitFor(() => expect(screen.queryByTestId("spinner")).toBeNull());
    expect(power.getAttribute("aria-busy")).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("article", { name: "Kitchen ceiling" }).getAttribute("data-feedback")).toBe("success"),
    );
    expect(screen.getByRole("article", { name: "Kitchen ceiling" }).querySelector("[aria-live]")?.textContent).toBe("");
  });

  it("switches the live text to UPDATING once the answer is in and the new state is still on its way", async () => {
    renderCard("default", 200);
    await settleLoad();
    fireEvent.click(screen.getByRole("switch", { name: "Kitchen ceiling power" }));

    await waitFor(() => expect(screen.getByText("UPDATING")).toBeTruthy());
    await waitFor(() => expect(screen.queryByTestId("spinner")).toBeNull());
  });

  it("highlights the card as an error and shows the toast when the action fails", async () => {
    renderCard("action-error");
    await settleLoad();
    const card = screen.getByRole("article", { name: "Kitchen ceiling" });

    fireEvent.click(screen.getByRole("switch", { name: "Kitchen ceiling power" }));

    await waitFor(() => expect(screen.getByText("Could not update Kitchen ceiling")).toBeTruthy());
    expect(card.getAttribute("data-feedback")).toBe("error");
    expect(screen.getByRole("switch", { name: "Kitchen ceiling power" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByTestId("spinner")).toBeNull();
  });

  it("clears the feedback highlight after its short display time", async () => {
    renderCard();
    await settleLoad();
    fireEvent.click(screen.getByRole("switch", { name: "Kitchen ceiling power" }));
    const card = screen.getByRole("article", { name: "Kitchen ceiling" });

    await waitFor(() => expect(card.getAttribute("data-feedback")).toBe("success"));
    await waitFor(() => expect(card.getAttribute("data-feedback")).toBeNull(), { timeout: 3000 });
  });
});
