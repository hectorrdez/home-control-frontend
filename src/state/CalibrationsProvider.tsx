import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useApi } from "@/api/ApiContext";
import type { CalibrationInput, CoverCalibration } from "@/api/types";
import { useLiveRefetch } from "./useLiveRefetch";

// Feature 127 (backend 010): cover calibrations, loaded once like the aliases. Any load failure (including a
// backend without the endpoint) leaves status "unavailable" and the calibration UI stays hidden.
export type CalibrationsStatus = "loading" | "ready" | "unavailable";

export interface CalibrationsContextValue {
  status: CalibrationsStatus;
  calibrations: Record<string, CoverCalibration>;
  // Both reject on failure; the caller shows the error and keeps its wizard open.
  save: (entityId: string, input: CalibrationInput) => Promise<void>;
  remove: (entityId: string) => Promise<void>;
}

const UNAVAILABLE: CalibrationsContextValue = {
  status: "unavailable",
  calibrations: {},
  save: () => Promise.reject(new Error("calibrations unavailable")),
  remove: () => Promise.reject(new Error("calibrations unavailable")),
};

const CalibrationsContext = createContext<CalibrationsContextValue | null>(null);

function toRecord(list: CoverCalibration[]): Record<string, CoverCalibration> {
  return Object.fromEntries(list.map((row) => [row.entityId, row]));
}

export function CalibrationsProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [status, setStatus] = useState<CalibrationsStatus>("loading");
  const [calibrations, setCalibrations] = useState<Record<string, CoverCalibration>>({});

  useEffect(() => {
    let active = true;
    api.getCalibrations().then(
      (list) => {
        if (!active) return;
        setCalibrations(toRecord(list));
        setStatus("ready");
      },
      () => {
        if (active) setStatus("unavailable");
      },
    );
    return () => {
      active = false;
    };
  }, [api]);

  // Feature 138: another device changed a calibration; a failed refetch keeps the current list.
  const reload = useCallback(() => api.getCalibrations().then((list) => setCalibrations(toRecord(list))), [api]);
  useLiveRefetch("calibrations", reload);

  const save = useCallback(
    (entityId: string, input: CalibrationInput) =>
      api.putCalibration(entityId, input).then((list) => setCalibrations(toRecord(list))),
    [api],
  );

  const remove = useCallback(
    (entityId: string) => api.deleteCalibration(entityId).then((list) => setCalibrations(toRecord(list))),
    [api],
  );

  const value = useMemo<CalibrationsContextValue>(
    () => ({ status, calibrations, save, remove }),
    [status, calibrations, save, remove],
  );

  return <CalibrationsContext.Provider value={value}>{children}</CalibrationsContext.Provider>;
}

// Outside the provider (e.g. isolated component tests) the calibration UI is simply unavailable.
export function useCalibrations(): CalibrationsContextValue {
  return useContext(CalibrationsContext) ?? UNAVAILABLE;
}
