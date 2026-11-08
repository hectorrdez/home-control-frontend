import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import { ApiProvider } from "./api/ApiContext";
import { EntitiesProvider } from "./state/EntitiesProvider";
import { AliasesProvider } from "./state/AliasesProvider";
import { CalibrationsProvider } from "./state/CalibrationsProvider";
import { AlertRulesProvider } from "./state/AlertRulesProvider";
import { AlertsProvider } from "./state/AlertsProvider";
import { ToastProvider } from "./components/feedback/Toast";
import { SyncedSettingsProvider } from "./features/settings/SyncedSettingsProvider";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ApiProvider>
      <SyncedSettingsProvider>
      <ToastProvider>
        <EntitiesProvider>
          <AliasesProvider>
            <CalibrationsProvider>
              <AlertRulesProvider>
                <BrowserRouter>
                  <AlertsProvider>
                    <App />
                  </AlertsProvider>
                </BrowserRouter>
              </AlertRulesProvider>
            </CalibrationsProvider>
          </AliasesProvider>
        </EntitiesProvider>
      </ToastProvider>
      </SyncedSettingsProvider>
    </ApiProvider>
  </StrictMode>,
);
