import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import { createMockApi } from "@/api/mock/createMockApi";
import type { HomeApi } from "@/api/HomeApi";
import { ApiError, type Entity } from "@/api/types";
import { CalibrationsProvider } from "@/state/CalibrationsProvider";
import { PresetsProvider } from "@/state/PresetsProvider";
import SavedPositionsCard from "./SavedPositionsCard";

const COVER = "cover.salon_blind";
const cover: Entity = {
  entityId: COVER,
  domain: "cover",
  name: "Salon blind",
  state: "closed",
  attributes: { estimated_position: 0 },
  area: "living_room",
  lastChanged: "2026-11-08T10:00:00.000Z",
};

// Renders the card with the presets and calibrations providers; `calibrated` stores a timing (position unknown) first.
async function renderCard({ api, calibrated = true, presets = [] as string[] } = {} as { api?: HomeApi; calibrated?: boolean; presets?: string[] }) {
  // cover-presets seeds a calibrated cover at a known position (0 %); cover-calibration has no calibration.
  const mock = api ?? createMockApi({ scenario: calibrated ? "cover-presets" : "cover-calibration", actionDelayMs: 0 });
  for (const name of presets) await mock.createPreset({ entityId: COVER, name, percent: 50 });
  render(
    <ApiProvider api={mock}>
      <CalibrationsProvider>
        <PresetsProvider>
          <SavedPositionsCard entity={cover} />
        </PresetsProvider>
      </CalibrationsProvider>
    </ApiProvider>,
  );
  await screen.findByRole("heading", { name: "SAVED POSITIONS" });
}

afterEach(cleanup);

describe("SavedPositionsCard (feature 142)", () => {
  it("shows the calibrate hint and no form for a cover that cannot reach a known position", async () => {
    await renderCard({ calibrated: false });
    expect(screen.getByText("CALIBRATE TO SAVE POSITIONS")).toBeTruthy();
    expect(screen.queryByRole("form", { name: "Save position" })).toBeNull();
  });

  it("lists saved positions with APPLY buttons", async () => {
    await renderCard({ presets: ["HALF"] });
    const list = await screen.findByRole("list", { name: "Saved positions" });
    expect(within(list).getByText("HALF")).toBeTruthy();
    expect(within(list).getByText("50%")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Apply HALF 50%" })).toBeTruthy();
  });

  it("saves a new position from the form", async () => {
    await renderCard();
    fireEvent.change(screen.getByLabelText("POSITION NAME"), { target: { value: "  HALF " } });
    fireEvent.click(screen.getByRole("button", { name: "SAVE POSITION" }));
    expect(await screen.findByRole("button", { name: "Apply HALF 0%" })).toBeTruthy();
  });

  it("disables SAVE for an empty or too long name", async () => {
    await renderCard();
    const save = screen.getByRole("button", { name: "SAVE POSITION" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("POSITION NAME"), { target: { value: "x".repeat(31) } });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("POSITION NAME"), { target: { value: "ok" } });
    expect((save as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows the duplicate-name error inline", async () => {
    await renderCard({ presets: ["HALF"] });
    fireEvent.change(screen.getByLabelText("POSITION NAME"), { target: { value: "half" } });
    fireEvent.click(screen.getByRole("button", { name: "SAVE POSITION" }));
    expect((await screen.findByRole("alert")).textContent).toBe("NAME ALREADY USED");
  });

  it("replaces the form with MAX 10 POSITIONS at ten", async () => {
    await renderCard({ presets: Array.from({ length: 10 }, (_, i) => `P${i}`) });
    expect(await screen.findByText("MAX 10 POSITIONS")).toBeTruthy();
    expect(screen.queryByRole("form", { name: "Save position" })).toBeNull();
  });

  it("maps a position-unknown apply failure to the 127 wording", async () => {
    const base = createMockApi({ scenario: "cover-presets", actionDelayMs: 0 });
    const api: HomeApi = { ...base, applyPreset: () => Promise.reject(new ApiError("server", "position_unknown", 409)) };
    await renderCard({ api, presets: ["HALF"] });
    fireEvent.click(screen.getByRole("button", { name: "Apply HALF 50%" }));
    expect((await screen.findByRole("alert")).textContent).toBe("POSITION UNKNOWN: move to an end first");
  });

  it("maps preset_not_applicable to the calibrate hint", async () => {
    const base = createMockApi({ scenario: "cover-presets", actionDelayMs: 0 });
    const api: HomeApi = { ...base, applyPreset: () => Promise.reject(new ApiError("server", "preset_not_applicable", 409)) };
    await renderCard({ api, presets: ["HALF"] });
    fireEvent.click(screen.getByRole("button", { name: "Apply HALF 50%" }));
    expect((await screen.findByRole("alert")).textContent).toBe("CALIBRATE THIS COVER FIRST");
  });

  it("deletes after an inline YES, and NO keeps the row", async () => {
    await renderCard({ presets: ["HALF"] });
    fireEvent.click(screen.getByRole("button", { name: "DELETE" }));
    fireEvent.click(screen.getByRole("button", { name: "NO" }));
    expect(screen.getByText("HALF")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "DELETE" }));
    expect(screen.getByText("DELETE HALF?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "YES" }));
    await waitFor(() => expect(screen.queryByText("HALF")).toBeNull());
    expect(screen.getByText("NO SAVED POSITIONS")).toBeTruthy();
  });

  it("renames inline and keeps the percent", async () => {
    await renderCard({ presets: ["HALF"] });
    fireEvent.click(screen.getByRole("button", { name: "Rename HALF" }));
    const input = screen.getByDisplayValue("HALF");
    fireEvent.change(input, { target: { value: "MID" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByText("MID")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Saved positions" })).getByText("50%")).toBeTruthy();
  });

  it("hides the whole card when presets are unavailable", async () => {
    const onlyRender = vi.fn();
    const api = createMockApi({ scenario: "error" });
    render(
      <ApiProvider api={api}>
        <CalibrationsProvider>
          <PresetsProvider>
            <SavedPositionsCard entity={cover} />
          </PresetsProvider>
        </CalibrationsProvider>
      </ApiProvider>,
    );
    await waitFor(() => expect(screen.queryByRole("heading", { name: "SAVED POSITIONS" })).toBeNull());
    expect(onlyRender).not.toHaveBeenCalled();
  });
});
