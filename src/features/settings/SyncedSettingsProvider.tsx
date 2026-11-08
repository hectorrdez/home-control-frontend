import { useEffect, type ReactNode } from "react";
import { useApi } from "@/api/ApiContext";
import { registeredSyncedSettings } from "./syncedSetting";

// Feature 134: starts every registered synced setting once the api is ready and stops them on unmount.
export function SyncedSettingsProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  useEffect(() => {
    const stores = registeredSyncedSettings();
    for (const store of stores) void store.start(api);
    return () => {
      for (const store of stores) store.stop();
    };
  }, [api]);
  return <>{children}</>;
}
