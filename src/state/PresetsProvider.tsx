import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useApi } from "@/api/ApiContext";
import type { Entity, Preset, PresetInput } from "@/api/types";
import { sortPresets } from "@/features/presets/presets";
import { useLiveRefetch } from "./useLiveRefetch";

// Feature 142 (backend 021): saved cover positions, loaded once like the calibrations. Any load failure (including a
// backend without the endpoint) leaves status "unavailable" and the presets UI stays hidden.
export type PresetsStatus = "loading" | "ready" | "unavailable";

export interface PresetsContextValue {
  status: PresetsStatus;
  presetsFor: (entityId: string) => Preset[];
  // All of these reject on failure; the caller shows the error text and keeps its form.
  save: (input: PresetInput) => Promise<void>;
  rename: (id: string, input: { name: string; percent: number }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  apply: (id: string) => Promise<Entity>;
}

const REJECT = () => Promise.reject(new Error("presets unavailable"));

const UNAVAILABLE: PresetsContextValue = {
  status: "unavailable",
  presetsFor: () => [],
  save: REJECT,
  rename: REJECT,
  remove: REJECT,
  apply: REJECT,
};

const PresetsContext = createContext<PresetsContextValue | null>(null);

export function PresetsProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [status, setStatus] = useState<PresetsStatus>("loading");
  const [presets, setPresets] = useState<Preset[]>([]);

  useEffect(() => {
    let active = true;
    api.getPresets().then(
      (list) => {
        if (!active) return;
        setPresets(list);
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

  // Feature 138: another device changed a preset; a failed refetch keeps the current list.
  const reload = useCallback(() => api.getPresets().then((list) => setPresets(list)), [api]);
  useLiveRefetch("presets", reload);

  const save = useCallback(
    (input: PresetInput) =>
      api.createPreset(input).then((stored) => setPresets((list) => [...list, stored])),
    [api],
  );

  const rename = useCallback(
    (id: string, input: { name: string; percent: number }) =>
      api.updatePreset(id, input).then((stored) => setPresets((list) => list.map((p) => (p.id === id ? stored : p)))),
    [api],
  );

  const remove = useCallback(
    (id: string) => api.deletePreset(id).then(() => setPresets((list) => list.filter((p) => p.id !== id))),
    [api],
  );

  const apply = useCallback((id: string) => api.applyPreset(id), [api]);

  const value = useMemo<PresetsContextValue>(
    () => ({
      status,
      presetsFor: (entityId) => sortPresets(presets.filter((p) => p.entityId === entityId)),
      save,
      rename,
      remove,
      apply,
    }),
    [status, presets, save, rename, remove, apply],
  );

  return <PresetsContext.Provider value={value}>{children}</PresetsContext.Provider>;
}

// Outside the provider (e.g. isolated component tests) the presets UI is simply unavailable.
export function usePresets(): PresetsContextValue {
  return useContext(PresetsContext) ?? UNAVAILABLE;
}
