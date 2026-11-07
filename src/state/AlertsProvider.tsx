import { createContext, useContext, type ReactNode } from "react";
import { useAlerts, type AlertCenterValue } from "@/features/alerts/useAlerts";
import AlertBanner from "@components/feedback/AlertBanner";

// Feature 129: one alert monitor for the app. Outside the provider the centre is idle (no queue, sound off).
const IDLE: AlertCenterValue = { queue: [], soundEnabled: false, enableSound: () => undefined, dismiss: () => undefined };

const AlertCenterContext = createContext<AlertCenterValue | null>(null);

export function AlertsProvider({ children }: { children: ReactNode }) {
  const value = useAlerts();
  return (
    <AlertCenterContext.Provider value={value}>
      {children}
      <AlertBanner {...value} />
    </AlertCenterContext.Provider>
  );
}

export function useAlertCenter(): AlertCenterValue {
  return useContext(AlertCenterContext) ?? IDLE;
}
