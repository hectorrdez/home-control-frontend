import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/api/ApiContext";
import type { HomeApi } from "@/api/HomeApi";
import { ApiError, ReloadRateLimitedError, type ReloadResult } from "@/api/types";
import { EntitiesProvider } from "@/state/EntitiesProvider";
import SettingsPage from "./SettingsPage";

// Feature 164: the Integrations section and RELOAD DEVICES, through the real EntitiesProvider and a fake API.
afterEach(cleanup);

type Outcome = ReloadResult | Error | "pending";

function renderPage(outcome: Outcome) {
  const reloadIntegrations = vi.fn(() => {
    if (outcome === "pending") return new Promise<ReloadResult>(() => undefined);
    if (outcome instanceof Error) return Promise.reject(outcome);
    return Promise.resolve(outcome);
  });
  const getAreas = vi.fn(async () => []);
  const api = {
    getStatus: vi.fn(async () => ({ online: true, version: "2026.1" })),
    getAreas,
    getEntities: vi.fn(async () => []),
    runAction: vi.fn(),
    getHistory: vi.fn(async () => []),
    listEvents: vi.fn(async () => []),
    subscribe: vi.fn(() => () => undefined),
    reloadIntegrations,
  } as unknown as HomeApi;
  render(
    <ApiProvider api={api}>
      <MemoryRouter>
        <EntitiesProvider>
          <SettingsPage />
        </EntitiesProvider>
      </MemoryRouter>
    </ApiProvider>,
  );
  return { reloadIntegrations, getAreas };
}

const reloadButton = () => screen.getByRole("button", { name: /RELOAD DEVICES|RELOADING|WAIT \d+ S/ });
const status = () => screen.getByRole("status");

describe("SettingsPage Integrations section", () => {
  it("shows the section, the explanation and an idle RELOAD DEVICES button", () => {
    renderPage("pending");
    expect(screen.getByRole("heading", { name: "Integrations" })).toBeTruthy();
    expect(screen.getByText(/Reload the device integrations \(Tuya\)/)).toBeTruthy();
    const button = screen.getByRole("button", { name: "RELOAD DEVICES" });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.getAttribute("aria-busy")).toBeNull();
    expect(status().textContent).toBe("");
  });

  it("is running while the reload is pending: busy, disabled, label RELOADING", async () => {
    const { reloadIntegrations } = renderPage("pending");
    fireEvent.click(screen.getByRole("button", { name: "RELOAD DEVICES" }));
    await waitFor(() => expect(reloadIntegrations).toHaveBeenCalledOnce());
    const button = screen.getByRole("button", { name: "RELOADING" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.querySelector('[data-testid="spinner"]')).toBeTruthy();
  });

  it("reports the new entities and refetches the areas once after a success", async () => {
    const { getAreas } = renderPage({
      entries: [
        { entryId: "a", domain: "tuya", title: "Tuya", ok: true },
        { entryId: "b", domain: "tuya", title: "Tuya cloud", ok: true },
      ],
      entities: { before: 10, after: 11 },
    });
    await waitFor(() => expect(getAreas).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "RELOAD DEVICES" }));
    await waitFor(() => expect(status().textContent).toBe("2 INTEGRATIONS RELOADED • 1 NEW ENTITIES"));
    // Mount + one refetch after the reload (the provider dedups a second request within 1 s).
    expect(getAreas).toHaveBeenCalledTimes(2);
    expect((reloadButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it("reports 0 new entities when the count did not grow", async () => {
    renderPage({
      entries: [{ entryId: "a", domain: "tuya", title: "Tuya", ok: true }],
      entities: { before: 12, after: 12 },
    });
    fireEvent.click(screen.getByRole("button", { name: "RELOAD DEVICES" }));
    await waitFor(() => expect(status().textContent).toBe("1 INTEGRATIONS RELOADED • 0 NEW ENTITIES"));
  });

  it("says so when there is no integration to reload", async () => {
    renderPage({ entries: [], entities: { before: 3, after: 3 } });
    fireEvent.click(screen.getByRole("button", { name: "RELOAD DEVICES" }));
    await waitFor(() => expect(status().textContent).toBe("No integrations to reload"));
  });

  it("lists one line per failed entry next to the successful count", async () => {
    renderPage({
      entries: [
        { entryId: "a", domain: "tuya", title: "Tuya", ok: true },
        { entryId: "b", domain: "tuya", title: "Tuya cloud", ok: false, error: "timeout" },
      ],
      entities: { before: 5, after: 5 },
    });
    fireEvent.click(screen.getByRole("button", { name: "RELOAD DEVICES" }));
    await waitFor(() => expect(status().textContent).toContain("1 INTEGRATIONS RELOADED • 0 NEW ENTITIES"));
    expect(screen.getByText("Tuya cloud: timeout")).toBeTruthy();
  });

  it("shows NOT AVAILABLE and hides the button when the backend has no reload endpoint (404)", async () => {
    renderPage(new ApiError("not_found", "not_found", 404));
    fireEvent.click(screen.getByRole("button", { name: "RELOAD DEVICES" }));
    await waitFor(() => expect(screen.getByText("NOT AVAILABLE")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /RELOAD DEVICES/ })).toBeNull();
  });

  it("explains a reload already running (409)", async () => {
    renderPage(new ApiError("server", "reload_in_progress", 409));
    fireEvent.click(screen.getByRole("button", { name: "RELOAD DEVICES" }));
    await waitFor(() => expect(status().textContent).toBe("A reload is already running"));
  });

  it("disables the button with a countdown after a rate limit (429)", async () => {
    renderPage(new ReloadRateLimitedError(7));
    fireEvent.click(screen.getByRole("button", { name: "RELOAD DEVICES" }));
    await waitFor(() => expect(status().textContent).toBe("Wait 7 s before reloading again"));
    const button = screen.getByRole("button", { name: "WAIT 7 S" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("explains that Home Assistant is not reachable (502)", async () => {
    renderPage(new ApiError("server", "ha_unreachable", 502));
    fireEvent.click(screen.getByRole("button", { name: "RELOAD DEVICES" }));
    await waitFor(() => expect(status().textContent).toBe("Home Assistant is not reachable"));
  });

  it("falls back to a generic message for any other error", async () => {
    renderPage(new ApiError("server", "boom", 500));
    fireEvent.click(screen.getByRole("button", { name: "RELOAD DEVICES" }));
    await waitFor(() => expect(status().textContent).toBe("Could not reload devices. Try again."));
  });
});
