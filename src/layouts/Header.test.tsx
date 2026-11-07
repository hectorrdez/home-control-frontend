import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ApiProvider } from "@/api/ApiContext";
import { createMockApi } from "@/api/mock/createMockApi";
import { AliasesProvider } from "@/state/AliasesProvider";
import { AlertsProvider } from "@/state/AlertsProvider";
import { CalibrationsProvider } from "@/state/CalibrationsProvider";
import { AlertRulesProvider } from "@/state/AlertRulesProvider";
import { EntitiesProvider } from "@/state/EntitiesProvider";
import { ToastProvider } from "@components/feedback/Toast";
import Header from "./Header";

afterEach(cleanup);

// Feature 129: the header carries the one-time ENABLE ALERT SOUND control.
describe("Header alert sound control", () => {
  it("offers to enable the alert sound", () => {
    const api = createMockApi({ actionDelayMs: 0 });
    render(
      <MemoryRouter>
        <ApiProvider api={api}>
          <ToastProvider>
            <AliasesProvider>
              <EntitiesProvider>
                <CalibrationsProvider>
                  <AlertRulesProvider>
                    <AlertsProvider>
                      <Header />
                    </AlertsProvider>
                  </AlertRulesProvider>
                </CalibrationsProvider>
              </EntitiesProvider>
            </AliasesProvider>
          </ToastProvider>
        </ApiProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "ENABLE ALERT SOUND" })).toBeTruthy();
  });
});
