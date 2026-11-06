import { createContext, useContext, type ReactNode } from "react";
import type { HomeApi } from "./HomeApi";
import { api as defaultApi } from "./index";

const ApiContext = createContext<HomeApi>(defaultApi);

// Tests inject a HomeApi through `api`; the app uses the env-selected one.
export function ApiProvider({ api, children }: { api?: HomeApi; children: ReactNode }) {
  return <ApiContext.Provider value={api ?? defaultApi}>{children}</ApiContext.Provider>;
}

export function useApi(): HomeApi {
  return useContext(ApiContext);
}
