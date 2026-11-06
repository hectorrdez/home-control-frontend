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
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ApiProvider>
      <EntitiesProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </EntitiesProvider>
    </ApiProvider>
  </StrictMode>,
);
