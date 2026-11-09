import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import type { HomeApi } from "@/api/HomeApi";
import { createMockApi } from "@/api/mock/createMockApi";
import { ApiError, type Entity } from "@/api/types";
import { AliasesProvider } from "@/state/AliasesProvider";
import { CalibrationsProvider } from "@/state/CalibrationsProvider";
import { EntitiesProvider } from "@/state/EntitiesProvider";
import { PresetsProvider } from "@/state/PresetsProvider";
import { ToastProvider } from "@components/feedback/Toast";
import ActuatorModes from "./ActuatorModes";

// Feature 156: the MODES dialog of a cover (apply, create, edit, limit). Real providers over the mock API.
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

async function renderModes(api: HomeApi, presets: { name: string; percent: number }[] = []) {
  for (const preset of presets) await api.createPreset({ entityId: COVER, ...preset });
  const onClose = vi.fn();
  render(
    <ApiProvider api={api}>
      <ToastProvider>
        <EntitiesProvider>
          <AliasesProvider>
            <CalibrationsProvider>
              <PresetsProvider>
                <ActuatorModes entity={cover} onClose={onClose} />
              </PresetsProvider>
            </CalibrationsProvider>
          </AliasesProvider>
        </EntitiesProvider>
      </ToastProvider>
    </ApiProvider>,
  );
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
  return { onClose };
}

afterEach(cleanup);

describe("ActuatorModes (156)", () => {
  it("lists the existing modes and applying one runs it and closes the dialog", async () => {
    const base = createMockApi({ scenario: "cover-presets", actionDelayMs: 0 });
    const apply = vi.fn(base.applyPreset);
    const { onClose } = await renderModes({ ...base, applyPreset: apply }, [{ name: "HALF", percent: 50 }]);

    const list = await screen.findByRole("list", { name: "Modes" });
    expect(within(list).getByText("HALF")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply HALF 50%" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("a failed apply shows the error and keeps the dialog open", async () => {
    const base = createMockApi({ scenario: "cover-presets", actionDelayMs: 0 });
    const { onClose } = await renderModes(
      { ...base, applyPreset: () => Promise.reject(new Error("boom")) },
      [{ name: "HALF", percent: 50 }],
    );
    fireEvent.click(await screen.findByRole("button", { name: "Apply HALF 50%" }));

    expect(await screen.findByText("COULD NOT RUN POSITION")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("creates a new mode with the chosen name and position", async () => {
    const base = createMockApi({ scenario: "cover-presets", actionDelayMs: 0 });
    const create = vi.fn(base.createPreset);
    await renderModes({ ...base, createPreset: create });

    const form = screen.getByRole("form", { name: "New mode" });
    const submit = within(form).getByRole("button", { name: "CREATE MODE" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(within(form).getByLabelText(/NEW MODE NAME/), { target: { value: "Night" } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);

    expect(await screen.findByRole("button", { name: "Apply Night 0%" })).toBeTruthy();
    expect(create).toHaveBeenCalledWith({ entityId: COVER, name: "Night", percent: 0 });
    expect((within(form).getByLabelText(/NEW MODE NAME/) as HTMLInputElement).value).toBe("");
  });

  it("a duplicate name on create shows the 142 wording", async () => {
    const base = createMockApi({ scenario: "cover-presets", actionDelayMs: 0 });
    await renderModes({ ...base, createPreset: () => Promise.reject(new ApiError("server", "duplicate_preset", 409)) });
    const form = screen.getByRole("form", { name: "New mode" });
    fireEvent.change(within(form).getByLabelText(/NEW MODE NAME/), { target: { value: "Night" } });
    fireEvent.click(within(form).getByRole("button", { name: "CREATE MODE" }));
    expect(await screen.findByText("NAME ALREADY USED")).toBeTruthy();
  });

  it("edit renames the mode and saves its position", async () => {
    const base = createMockApi({ scenario: "cover-presets", actionDelayMs: 0 });
    const rename = vi.fn(base.updatePreset);
    await renderModes({ ...base, updatePreset: rename }, [{ name: "HALF", percent: 50 }]);

    fireEvent.click(await screen.findByRole("button", { name: "Edit HALF" }));
    const input = screen.getByRole("textbox", { name: "Edit mode name" });
    fireEvent.change(input, { target: { value: "Reading" } });
    fireEvent.click(screen.getByRole("button", { name: "SAVE" }));

    expect(await screen.findByText("Reading")).toBeTruthy();
    expect(rename).toHaveBeenCalledWith(expect.any(String), { name: "Reading", percent: 50 });
    expect(screen.queryByRole("textbox", { name: "Edit mode name" })).toBeNull();
  });

  it("an empty name in edit is refused with the 142 message", async () => {
    const base = createMockApi({ scenario: "cover-presets", actionDelayMs: 0 });
    const rename = vi.fn(base.updatePreset);
    await renderModes({ ...base, updatePreset: rename }, [{ name: "HALF", percent: 50 }]);
    fireEvent.click(await screen.findByRole("button", { name: "Edit HALF" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit mode name" }), { target: { value: "  " } });
    fireEvent.click(screen.getByRole("button", { name: "SAVE" }));

    expect(await screen.findByText("NAME MUST BE 1 TO 30 CHARACTERS")).toBeTruthy();
    expect(rename).not.toHaveBeenCalled();
  });

  it("Escape cancels an edit without closing the dialog", async () => {
    const base = createMockApi({ scenario: "cover-presets", actionDelayMs: 0 });
    const { onClose } = await renderModes(base, [{ name: "HALF", percent: 50 }]);
    fireEvent.click(await screen.findByRole("button", { name: "Edit HALF" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Edit mode name" }), { key: "Escape" });

    expect(screen.queryByRole("textbox", { name: "Edit mode name" })).toBeNull();
    expect(screen.getByRole("button", { name: "Apply HALF 50%" })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("at the limit of 10 modes the create form is replaced by a message", async () => {
    const base = createMockApi({ scenario: "cover-presets", actionDelayMs: 0 });
    const ten = Array.from({ length: 10 }, (_, i) => ({ name: `MODE ${i + 1}`, percent: i * 10 }));
    await renderModes(base, ten);
    expect(await screen.findByText("MAX 10 MODES")).toBeTruthy();
    expect(screen.queryByRole("form", { name: "New mode" })).toBeNull();
  });
});
